// 手机端远程设备执行 · relay 常驻连接（电脑端，M1）。
// ⚠️ 仅当用户在设置里开「允许手机端远程调用本机」(remoteEnabled) 才启动。
// 职责(M1)：WSS 连 relay.wuweiai.io/ws，首条 hello 上报 deviceId/name/platform/channels；
//          心跳 ping 保活；断线指数退避重连。M2 再在此处理 relay 转发的执行请求。
//
// channels(本机可用渠道)按 remoteShareSubscription 过滤：不开则剔除本地订阅(Claude Code/Codex)。
import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import { RemoteDecisions, type RemoteDecisionSource } from "./remote-decisions.js";
import { hostname, platform } from "node:os";
import { getDeviceId } from "../../src/device-id.js";
import { loadWuweiSession } from "./wuwei-session.js";
import { log } from "./logger.js";
import type { Decision, DecisionResponse } from "../../src/types.js";
import { configuredRemoteChannels, type RemoteChannel } from './remote-models.js';
import { notifyRemote } from './remote-notify.js';
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

type Channel = RemoteChannel;

// 探测本机可被手机端使用的渠道。订阅类按 shareSubscription 决定是否上报。
export function detectChannels(s: Settings | null): Channel[] {
  return configuredRemoteChannels(s, remoteShareSubscription(s)).map(ch => ({ ...ch,
    ...(ch.kind === 'subscription' ? { quota: loadRateLimits(ch.providerId) } : {}) }));
}

let ws: WebSocket | null = null;
let pingTimer: NodeJS.Timeout | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectDelay = RECONNECT_BASE_MS;
let stopped = true; // 默认停止；start 时置 false
let connectedAccount = '';
const executionInstanceId = randomUUID();
const remoteKinds = new Map<string, 'chat' | 'room-chat'>();

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
  channelId?: string | null;
  employeeId?: string | null;
  onSession?: (sessionId: string) => void;
  signal: AbortSignal;
  onDelta: (text: string) => void;
  onTool?: (name: string, input?: unknown) => void;
  onToolEnd?: (name: string, result: string, isError: boolean) => void;
  onImage?: (dataUrl: string) => void; // 工具产出的图(截图/生图)→转给手机显示
  onPermission?: (toolName: string, input: unknown) => Promise<PermDecision>; // 危险工具→推手机审批
  // G1：agent 调 ask_decision 遇岔路→把结构化 Decision 下发手机(DecisionSheet)→阻塞等 perm-resp 三态回批。
  // 与 onPermission 并存不复用：判定点两套(危险工具拦截 vs 岔路决策)，回批通道一套(perm-resp 三态, permId 精确匹配)。
  requestDecision?: (decision: Decision) => Promise<DecisionResponse>;
}

// perm-resp 三态回批（与手机端 relayChat 对齐，2026-10）：
// - allow/deny：内建放行/拒绝（保留字）。
// - reply：非内建统一通道，value 与 text 二选一——
//     value=业务分支稳定 key（如 backup_first），agent 按 key 匹配分支继续跑；
//     text=用户自己打字的自然语言答复，agent 当作用户回话喂回决策点。
// 本轮(perm-resp 三态)：手机实发 allow/deny；reply 分支解析写全但留到 G1 Decision 下发后再联调。
export interface PermDecision {
  action: "allow" | "deny" | "reply";
  value?: string;
  text?: string;
}
export type RemoteExecutor = (args: RemoteChatArgs) => Promise<{ text: string; sessionId?: string } | { error: string }>;
let _remoteExecutor: RemoteExecutor | null = null;
export function setRemoteExecutor(fn: RemoteExecutor | null): void {
  _remoteExecutor = fn;
}

export interface RemoteRoomArgs extends RemoteChatArgs {
  roomId: string;
  mentions: string[];
  onRoomEvent: (event: Record<string, unknown>) => void;
}
export type RemoteRoomExecutor = (args: RemoteRoomArgs) => Promise<void>;
let _remoteRoomExecutor: RemoteRoomExecutor | null = null;
export function setRemoteRoomExecutor(fn: RemoteRoomExecutor | null) { _remoteRoomExecutor = fn; }
const remoteDecisions = new RemoteDecisions();
export function requestLocalDecision(decision: Decision, source: string | RemoteDecisionSource, signal: AbortSignal, send: (event: Record<string, unknown>) => void) {
  const origin = typeof source === 'string' ? { sessionId: source } : source;
  return remoteDecisions.request(`local_${origin.roomId || origin.sessionId}`, decision, origin, false, signal, event => {
    if (event.type === 'decision') notifyRemote({ eventId: decision.permId, kind: 'approval', deviceId: getDeviceId(), ...(origin.sessionId ? { sessionId: origin.sessionId } : {}) });
    send(event);
  });
}
export function answerLocalDecision(permId: string, answer: DecisionResponse) { return remoteDecisions.decide(permId, answer); }

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
  const method = String(msg.method || "");
  if (!remoteEnabled(loadSettings())) { reply({ type: 'resp', reqId, error: '本机已关闭远程调用' }); return; }
  // 待审批中心：直接用本地池处理，不走 index 的业务 handler。
  if (method === "perms.list") {
    reply({ type: "resp", reqId, data: { perms: remoteDecisions.list() } }); return;
  }
  if (method === "perms.policy") {
    remoteDecisions.setSmartTimer(msg.params?.smartTimer === true);
    reply({ type: "resp", reqId, data: { ok: true } }); return;
  }
  if (method === "perms.decide") {
    const ok = remoteDecisions.decide(String(msg.params?.permId || ""), parsePermDecision(msg.params));
    reply({ type: "resp", reqId, data: { ok } }); return;
  }
  if (!_remoteReqHandler) { reply({ type: "resp", reqId, error: "本机不支持该请求(请更新客户端)" }); return; }
  try {
    const data = await _remoteReqHandler(String(msg.method || ""), msg.params ?? null);
    reply({ type: "resp", reqId, data });
  } catch (e: any) {
    reply({ type: "resp", reqId, error: String(e?.message || e).slice(0, 300) });
  }
}
const remoteAborts = new Map<string, AbortController>(); // reqId → 本轮中断器（手机 abort 时掐断）

function parsePermDecision(m: any): PermDecision | null {
  const action = m?.action ?? m?.decision;
  if (!['allow', 'deny', 'reply'].includes(action)) return null;
  return { action, value: m?.value, text: m?.text };
}

async function handleRemoteChat(msg: any): Promise<void> {
  const reqId = String(msg?.reqId || "");
  if (!reqId || remoteAborts.has(reqId)) return;
  const socket = ws;
  const reply = (event: Record<string, unknown>) => {
    const target = ws || socket;
    if (target?.readyState === WebSocket.OPEN) target.send(JSON.stringify(event));
    if (event.type === 'decision') notifyRemote({ eventId: String(event.permId), kind: 'approval', deviceId: getDeviceId() });
    if (event.type === 'chat-done' || event.type === 'room-done') notifyRemote({ eventId: reqId, kind: 'task', deviceId: getDeviceId(), taskId: String(event.sessionId || event.roomId || msg.sessionId || ''), taskKind: room ? 'room' : 'session' });
  };
  const room = msg.type === "room-chat";
  const errorType = room ? "room-error" : "chat-error";
  if (!remoteEnabled(loadSettings()) || (room ? !_remoteRoomExecutor : !_remoteExecutor)) {
    reply({ type: errorType, reqId, message: "本机未开启该远程执行能力，请检查设置或更新客户端" }); return;
  }
  const ac = new AbortController();
  remoteAborts.set(reqId, ac);
  remoteKinds.set(reqId, room ? 'room-chat' : 'chat');
  const source = () => room ? { roomId: String(msg.roomId || "") } : { sessionId: msg.sessionId || undefined };
  const requestDecision = (decision: Decision) => remoteDecisions.request(reqId, decision, source(), msg.smartTimer === true, ac.signal, reply);
  const heartbeat = setInterval(() => reply({ type: "heartbeat", reqId }), 25_000);
  const args: RemoteChatArgs = {
    reqId, text: String(msg.text || ""), images: Array.isArray(msg.images) ? msg.images : [],
    sessionId: msg.sessionId ?? null, employeeId: msg.employeeId ?? null, channelId: msg.channelId ?? null, model: msg.model ?? null, signal: ac.signal,
    onSession: sessionId => { msg.sessionId = sessionId; reply({ type: "session", reqId, sessionId }); },
    onDelta: text => reply({ type: "delta", reqId, text }),
    onTool: (name, input) => reply({ type: "tool", reqId, phase: "start", name, input }),
    onToolEnd: (name, result, isError) => reply({ type: "tool", reqId, phase: "end", name, result, isError }),
    onImage: dataUrl => reply({ type: "image", reqId, dataUrl }),
    requestDecision,
    onPermission: (tool, input) => requestDecision({
      permId: randomUUID(), risk: "high", title: "需要你确认",
      question: "电脑即将执行一项可能修改本机内容的操作。你要继续吗？",
      options: [{ label: "拒绝", value: "deny", recommended: true, tone: "safe" }, { label: "允许执行", value: "allow", tone: "danger" }],
      allowCustom: false, timeoutSec: null, rawDetail: tool + "\n" + JSON.stringify(input, null, 2),
      sourceSession: msg.sessionId || msg.roomId,
    }),
  };
  try {
    if (room) {
      await _remoteRoomExecutor!({ ...args, roomId: String(msg.roomId || ""), mentions: Array.isArray(msg.mentions) ? msg.mentions : [],
        onRoomEvent: event => reply({ ...event, reqId, roomId: msg.roomId }) });
      if (ac.signal.aborted) throw new Error("已停止");
      reply({ type: "room-done", reqId, roomId: msg.roomId });
    } else {
      const result = await _remoteExecutor!(args);
      if (ac.signal.aborted) throw new Error("已停止");
      if ("error" in result) reply({ type: errorType, reqId, message: result.error });
      else reply({ type: "chat-done", reqId, ...result });
    }
  } catch (error: any) {
    reply({ type: errorType, reqId, message: String(error?.message || error).slice(0, 300) });
  } finally {
    clearInterval(heartbeat);
    remoteDecisions.abort(reqId);
    remoteAborts.delete(reqId);
    remoteKinds.delete(reqId);
  }
}

function cleanup(abortExecutions = false) {
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
  // Explicit logout/disable aborts; temporary network loss preserves the original task.
  if (abortExecutions) {
    for (const controller of remoteAborts.values()) controller.abort();
    remoteDecisions.abort();
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
  let account = '';
  try { account = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString()).sub || ''; } catch { /* invalid credentials cannot expose the pending pool */ }
  if (connectedAccount && connectedAccount !== account) cleanup(true);
  connectedAccount = account;
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
      instanceId: executionInstanceId,
      protocolVersion: 2,
      activeRequests: [...remoteKinds].map(([reqId, kind]) => ({ reqId, kind,
        waiting: remoteDecisions.list().filter(item => item.reqId === reqId).map(item => item.permId) })),
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
    } else if (msg.type === "chat" || msg.type === "room-chat") {
      // M2：手机端经 relay 发来执行请求 → 跑本机 agent、流式回传
      void handleRemoteChat(msg);
    } else if (msg.type === "req") {
      // 通用请求(会话列表/历史/员工/群/SOP)：读本机数据返回，不落库
      void handleRemoteReq(msg);
    } else if (msg.type === "abort") {
      const aid = String(msg.reqId || "");
      remoteAborts.get(aid)?.abort();
      // G1-4：中断该轮时，把这轮名下挂起的决策按 permId 精确解挂(内部 clearTimeout)，别留悬挂 Promise
      remoteDecisions.abort(aid);
    } else if (msg.type === "perm-resp") {
      // 手机(对话内弹框)批了 → 按 permId 精确匹配：先查岔路决策池(G1)，没命中再查危险工具权限池(三态: allow/deny/reply)
      const pid = String(msg.permId || "");
      const resp = parsePermDecision(msg);
      remoteDecisions.decide(pid, resp, String(msg.reqId || ""));
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
  cleanup(true);
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
