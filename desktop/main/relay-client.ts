// 手机端远程设备执行 · relay 常驻连接（电脑端，M1）。
// ⚠️ 仅当用户在设置里开「允许手机端远程调用本机」(remoteEnabled) 才启动。
// 职责(M1)：WSS 连 relay.wuweiai.io/ws，首条 hello 上报 deviceId/name/platform/channels；
//          心跳 ping 保活；断线指数退避重连。M2 再在此处理 relay 转发的执行请求。
//
// channels(本机可用渠道)按 remoteShareSubscription 过滤：不开则剔除本地订阅(Claude Code/Codex)。
import WebSocket from "ws";
import { hostname, platform } from "node:os";
import { getDeviceId } from "../../src/device-id.js";
import { loadWuweiSession } from "./wuwei-session.js";
import { log } from "./logger.js";
import {
  loadSettings,
  remoteEnabled,
  remoteShareSubscription,
  loadRateLimits,
  type Settings,
} from "./settings.js";

const RELAY_WS = process.env.WUWEI_RELAY_WS || "wss://relay.wuweiai.io/ws";
const PING_INTERVAL_MS = 25_000; // 心跳(nginx 超时 3600s，这里远小于它)
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;

interface Channel {
  id: string;
  label: string;
  kind: "subscription" | "api-key" | "other";
  quota?: unknown; // 订阅额度快照(5h/7d 用量%+reset)，供手机端回显。随 channel 透传经 relay 到 /devices。
}

// 探测本机可被手机端使用的渠道。订阅类按 shareSubscription 决定是否上报。
function detectChannels(s: Settings | null): Channel[] {
  const share = remoteShareSubscription(s);
  const out: Channel[] = [];
  const kind = s?.kind;
  const slot = s?.creds?.[s?.providerId || ""] || {};

  // Claude Code 订阅(anthropic-oauth) / Codex 订阅：属于「本地订阅」，仅 share 时上报。
  // 带上本机上次的额度快照(loadRateLimits)，手机端「执行位置」直接显示 5h/7d 剩余，不用等 M3 单独通道。
  if (share) {
    if (kind === "anthropic-oauth" || s?.oauthToken || slot.oauthToken) {
      out.push({ id: "claude-code-subscription", label: "Claude Code 订阅", kind: "subscription", quota: loadRateLimits("claude-oauth") });
    }
    if (kind === "codex") {
      out.push({ id: "codex-subscription", label: "Codex 订阅", kind: "subscription", quota: loadRateLimits("codex") });
    }
  }
  // 非订阅渠道(API key / 兼容端点)：始终可作为"远程执行"能力上报(不涉及订阅外泄)
  if (kind === "anthropic-apikey" || kind === "openai") {
    out.push({ id: "api-key", label: "本机 API Key", kind: "api-key" });
  }
  return out;
}

let ws: WebSocket | null = null;
let pingTimer: NodeJS.Timeout | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectDelay = RECONNECT_BASE_MS;
let stopped = true; // 默认停止；start 时置 false

// ── M2：远程执行 ──
// 手机端经 relay 发来 chat → 跑本机 agent(本机订阅)→ 流式把 delta/done/error 回传 relay。
// 真正的 agent 跑在 index.ts（provider/tools 都在那），这里只做「从 relay 喂进去、把输出发回 relay」的适配层，
// 执行能力由 index.ts 注入（setRemoteExecutor），relay-client 不 import 重机器、保持单一职责。
export interface RemoteChatArgs {
  reqId: string;
  text: string;
  images?: string[]; // 手机端随消息发来的图(data URL)，喂给 agent
  sessionId?: string | null;
  model?: string | null;
  signal: AbortSignal;
  onDelta: (text: string) => void;
  onTool?: (name: string, input?: unknown) => void;
  onImage?: (dataUrl: string) => void; // 工具产出的图(截图/生图)→转给手机显示
}
export type RemoteExecutor = (args: RemoteChatArgs) => Promise<{ text: string } | { error: string }>;
let _remoteExecutor: RemoteExecutor | null = null;
export function setRemoteExecutor(fn: RemoteExecutor | null): void {
  _remoteExecutor = fn;
}

// 通用请求处理器(不落库同步)：手机问「会话列表/历史/员工/群/SOP」→ 读本机 ~/.wuwei 数据返回。
// 由 index.ts 注入(它持有 loadSessions/loadRooms/loadEmployees 等)。
export type RemoteRequestHandler = (method: string, params: any) => Promise<unknown>;
let _remoteReqHandler: RemoteRequestHandler | null = null;
export function setRemoteRequestHandler(fn: RemoteRequestHandler | null): void {
  _remoteReqHandler = fn;
}

async function handleRemoteReq(msg: any): Promise<void> {
  const reqId = String(msg?.reqId || "");
  if (!reqId) return;
  const reply = (m: Record<string, unknown>) => { try { ws?.send(JSON.stringify(m)); } catch { /* ignore */ } };
  if (!_remoteReqHandler) { reply({ type: "resp", reqId, error: "本机不支持该请求(请更新客户端)" }); return; }
  try {
    const data = await _remoteReqHandler(String(msg.method || ""), msg.params ?? null);
    reply({ type: "resp", reqId, data });
  } catch (e: any) {
    reply({ type: "resp", reqId, error: String(e?.message || e).slice(0, 300) });
  }
}
const remoteAborts = new Map<string, AbortController>(); // reqId → 本轮中断器（手机 abort 时掐断）

async function handleRemoteChat(msg: any): Promise<void> {
  const reqId = String(msg?.reqId || "");
  if (!reqId) return;
  const reply = (m: Record<string, unknown>) => {
    try { ws?.send(JSON.stringify(m)); } catch { /* ws 断了就丢 */ }
  };
  if (!_remoteExecutor) {
    reply({ type: "chat-error", reqId, message: "本机远程执行未就绪（请更新客户端）" });
    return;
  }
  const ac = new AbortController();
  remoteAborts.set(reqId, ac);
  log("relay", "收到远程 chat reqId=", reqId.slice(0, 8), "→ 跑本机 agent");
  try {
    const r = await _remoteExecutor({
      reqId,
      text: String(msg.text || ""),
      images: Array.isArray(msg.images) ? msg.images : [],
      sessionId: msg.sessionId ?? null,
      model: msg.model ?? null,
      signal: ac.signal,
      onDelta: (t) => reply({ type: "delta", reqId, text: t }),
      onTool: (name, input) => reply({ type: "tool", reqId, name, input }),
      onImage: (dataUrl) => reply({ type: "image", reqId, dataUrl }),
    });
    if ("error" in r) reply({ type: "chat-error", reqId, message: r.error });
    else reply({ type: "chat-done", reqId, text: r.text });
  } catch (e: any) {
    reply({ type: "chat-error", reqId, message: String(e?.message || e).slice(0, 300) });
  } finally {
    remoteAborts.delete(reqId);
  }
}

function cleanup() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  if (ws) {
    try {
      ws.removeAllListeners();
      ws.close();
    } catch {
      /* ignore */
    }
    ws = null;
  }
}

function scheduleReconnect() {
  if (stopped) return;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
}

function connect() {
  if (stopped) return;
  const s = loadSettings();
  if (!remoteEnabled(s)) {
    // 运行中被关掉 → 停
    stopRelayClient();
    return;
  }
  const token = loadWuweiSession()?.accessToken || "";
  if (!token) {
    // 未登录：无法鉴权，稍后重试。这是「手机端看不到这台电脑」最常见的原因之一——提示要在电脑端登录无为账号。
    log("relay", "未登录无为账号(无 access_token)，无法连 relay；请在电脑端登录后再试。稍后重连。");
    scheduleReconnect();
    return;
  }

  cleanup();
  const url = `${RELAY_WS}?token=${encodeURIComponent(token)}`;
  log("relay", "连接中 →", RELAY_WS, "deviceId=", getDeviceId().slice(0, 8));
  try {
    ws = new WebSocket(url);
  } catch (e: any) {
    log("relay", "WebSocket 构造失败:", String(e?.message || e));
    scheduleReconnect();
    return;
  }

  ws.on("open", () => {
    reconnectDelay = RECONNECT_BASE_MS; // 连上即重置退避
    const name = (s?.app?.remoteDeviceName || "").trim() || hostname() || "我的电脑";
    const hello = {
      type: "hello",
      deviceId: getDeviceId(),
      name,
      platform: platform(),
      shareSubscription: remoteShareSubscription(s),
      channels: detectChannels(s),
    };
    try {
      ws?.send(JSON.stringify(hello));
      log("relay", "已连上，上报 hello：设备名=", name, "渠道=", hello.channels.map((c) => c.id).join(",") || "(无)", "同步订阅=", hello.shareSubscription);
    } catch (e: any) {
      log("relay", "发送 hello 失败:", String(e?.message || e));
    }
    // 心跳
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      try {
        ws?.send(JSON.stringify({ type: "ping" }));
      } catch {
        /* ignore */
      }
    }, PING_INTERVAL_MS);
  });

  ws.on("message", (raw) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === "registered") {
      // 上线成功：此刻起手机端 /devices 就能看到这台电脑
      log("relay", "注册成功，已上线。手机端现在应能在「执行位置」看到这台电脑。");
    } else if (msg.type === "error") {
      log("relay", "relay 返回错误:", JSON.stringify(msg).slice(0, 200));
    } else if (msg.type === "chat") {
      // M2：手机端经 relay 发来执行请求 → 跑本机 agent、流式回传
      void handleRemoteChat(msg);
    } else if (msg.type === "req") {
      // 通用请求(会话列表/历史/员工/群/SOP)：读本机数据返回，不落库
      void handleRemoteReq(msg);
    } else if (msg.type === "abort") {
      remoteAborts.get(String(msg.reqId || ""))?.abort();
    }
  });

  ws.on("close", (code: number, reason: Buffer) => {
    log("relay", "连接关闭 code=", code, "reason=", reason?.toString()?.slice(0, 120) || "", "→", Math.round(reconnectDelay / 1000), "s 后重连");
    cleanup();
    scheduleReconnect();
  });
  ws.on("error", (e: any) => {
    // 交给 close 处理重连；先记一笔错误原因(如证书/网络/401)
    log("relay", "连接错误:", String(e?.message || e));
  });
}

/** 启动 relay 常驻连接（仅在 remoteEnabled 时真正连）。可重复调用（幂等）。 */
export function startRelayClient() {
  const s = loadSettings();
  if (!remoteEnabled(s)) {
    stopRelayClient();
    return;
  }
  log("relay", "启动 relay 常驻连接(远程开关=开)");
  stopped = false;
  reconnectDelay = RECONNECT_BASE_MS;
  connect();
}

/** 停止并断开（设置里关掉开关时调用）。 */
export function stopRelayClient() {
  stopped = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  cleanup();
}

/** 设置变更后调用：根据最新 remoteEnabled 决定启或停（并让 hello 用最新设备名/渠道）。 */
export function refreshRelayClient() {
  const s = loadSettings();
  if (remoteEnabled(s)) {
    // 重连以带上最新设置（设备名/订阅同步变化）
    stopped = false;
    reconnectDelay = RECONNECT_BASE_MS;
    connect();
  } else {
    stopRelayClient();
  }
}
