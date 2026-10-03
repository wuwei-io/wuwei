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
import type { Decision, DecisionResponse } from "../../src/types.js";
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
  const method = String(msg.method || "");
  // 待审批中心：直接用本地池处理，不走 index 的业务 handler。
  if (method === "perms.list") {
    const perms = [...pendingPerms.values()].map((p) => ({ permId: p.permId, reqId: p.reqId, tool: p.tool, input: p.input, createdAt: p.createdAt }));
    reply({ type: "resp", reqId, data: { perms } });
    return;
  }
  if (method === "perms.decide") {
    const pid = String(msg.params?.permId || "");
    const ok = decidePendingPerm(pid, parsePermDecision(msg.params));
    reply({ type: "resp", reqId, data: { ok } });
    return;
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

// 待审批池：本机 agent 远程执行时挂起的危险操作。既支撑「对话内弹框审批」(perm-resp 按 permId 回批)，
// 也支撑独立「审批」Tab 的全局待审批中心(perms.list 拉取 / perms.decide 回批)。任意一路批了即从池移除、解挂 agent。
interface PendingPerm {
  permId: string;
  reqId: string;
  tool: string;
  input: unknown;
  createdAt: number;
  resolve: (d: PermDecision) => void;
}
const pendingPerms = new Map<string, PendingPerm>();
/** 把 relay 消息(perm-resp / perms.decide.params)解析成三态回批。兼容旧字段 decision。 */
function parsePermDecision(m: any): PermDecision {
  // 旧格式兼容：{decision:'allow'|'deny'}
  if (m && m.action == null && m.decision != null) {
    return { action: m.decision === "allow" ? "allow" : "deny" };
  }
  const action = m?.action === "allow" || m?.action === "reply" ? m.action : "deny";
  const out: PermDecision = { action };
  if (action === "reply") {
    if (typeof m?.value === "string" && m.value) out.value = m.value;
    if (typeof m?.text === "string" && m.text) out.text = m.text;
  }
  return out;
}
/** 回批一条待审批(对话内弹框 / 独立Tab / 超时 都走这里)：解挂 agent 并移除。返回是否命中。 */
function decidePendingPerm(permId: string, decision: PermDecision): boolean {
  const p = pendingPerms.get(permId);
  if (!p) return false;
  pendingPerms.delete(permId);
  p.resolve(decision);
  return true;
}

// ── G1：岔路决策池（与 pendingPerms 并存，不复用）──
// agent 调 ask_decision → 这里把 Decision 整条下发手机 {type:'decision', reqId, ...decision}，
// 以 permId 为 key 挂起等回批；手机 perm-resp 三态回来按 permId 精确匹配 resolve。
// 每个 permId 独立 pending → 并发决策互不干扰。超时/中断兜底在 G1-4 补全，这里先留 timer 位。
interface PendingDecision {
  permId: string;
  reqId: string;
  decision: Decision;
  createdAt: number;
  resolve: (d: DecisionResponse) => void;
  timer?: NodeJS.Timeout;
}
const pendingDecisions = new Map<string, PendingDecision>();
/** 回批一条待决策(perm-resp / 超时 / 中断 都走这里)：解挂 agent 并移除。返回是否命中。 */
function decidePendingDecision(permId: string, resp: DecisionResponse): boolean {
  const d = pendingDecisions.get(permId);
  if (!d) return false;
  if (d.timer) clearTimeout(d.timer);
  pendingDecisions.delete(permId);
  d.resolve(resp);
  return true;
}
/** G1-4 中断兜底：把某 reqId 名下所有挂起决策按 deny 解挂(reason=abort)，防 Promise 永挂+timer 泄漏。
 *  reqId 为空=断连全清。decidePendingDecision 内部已 clearTimeout，这里统一精确解挂。 */
function abortPendingDecisions(reqId: string | null): number {
  let n = 0;
  for (const [permId, d] of [...pendingDecisions.entries()]) {
    if (reqId === null || d.reqId === reqId) {
      if (decidePendingDecision(permId, { action: "deny", reason: "abort" })) n++;
    }
  }
  return n;
}
/** 下发 Decision 到发起方手机并阻塞等三态回批。permId 由 ask_decision 工具生成(全局唯一且每次变)。 */
function sendDecision(reqId: string, decision: Decision, reply: (m: Record<string, unknown>) => void): Promise<DecisionResponse> {
  return new Promise<DecisionResponse>((resolve) => {
    const permId = String(decision.permId || "");
    // permId 同名撞车(理论上不会)：先把旧的按 deny 解挂，避免悬挂
    if (pendingDecisions.has(permId)) decidePendingDecision(permId, { action: "deny" });
    pendingDecisions.set(permId, { permId, reqId, decision, createdAt: Date.now(), resolve });
    reply({ type: "decision", reqId, ...decision });
    // G1-4 超时兜底：仅 risk='low' 且 timeoutSec 为正数时倒计时；high 或 null/<=0 永等不设时器。
    // 超时按 推荐项.value ?? options[0].value ?? 'deny' 自动解挂，action=allow(采纳某选项)，reason='timeout' 上报。
    if (decision.risk === "low" && typeof decision.timeoutSec === "number" && decision.timeoutSec > 0) {
      const fallbackValue =
        decision.options.find((o) => o.recommended)?.value ?? decision.options[0]?.value ?? "deny";
      const timer = setTimeout(() => {
        log("relay", "决策超时兜底 permId=", permId.slice(0, 12), "→ value=", fallbackValue);
        decidePendingDecision(permId, { action: "allow", value: fallbackValue, reason: "timeout" });
      }, decision.timeoutSec * 1000);
      const pending = pendingDecisions.get(permId);
      if (pending) pending.timer = timer;
      else clearTimeout(timer); // 极端竞态(已被解挂)：别留悬挂时器
    }
  });
}

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
      // 危险工具 → 推手机审批：入待审批池 + 给发起方推 perm-req(对话内弹框)，挂起等回批；
      // 60s 没批自动拒(安全默认)。独立「审批」Tab 则通过 perms.list/perms.decide 读写同一个池。
      onPermission: (toolName, input) =>
        new Promise<PermDecision>((resolve) => {
          const permId = `pm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
          pendingPerms.set(permId, { permId, reqId, tool: toolName, input, createdAt: Date.now(), resolve });
          reply({ type: "perm-req", reqId, permId, tool: toolName, input });
          setTimeout(() => { decidePendingPerm(permId, { action: "deny" }); }, 60000);
        }),
      // G1：ask_decision 岔路决策 → 下发 Decision、按 permId 挂起等三态回批(allow/deny/reply+value|text)
      requestDecision: (decision) => sendDecision(reqId, decision, reply),
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
  // G1-4：连接已断，决策回批通道没了 → 把全部挂起决策按 deny+abort 兜底解挂，防 Promise 永挂+timer 泄漏
  const cleared = abortPendingDecisions(null);
  if (cleared) log("relay", "cleanup 清理挂起决策 count=", cleared);
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
      const aid = String(msg.reqId || "");
      remoteAborts.get(aid)?.abort();
      // G1-4：中断该轮时，把这轮名下挂起的决策按 permId 精确解挂(内部 clearTimeout)，别留悬挂 Promise
      const cleared = abortPendingDecisions(aid);
      if (cleared) log("relay", "abort 清理挂起决策 reqId=", aid.slice(0, 8), "count=", cleared);
    } else if (msg.type === "perm-resp") {
      // 手机(对话内弹框)批了 → 按 permId 精确匹配：先查岔路决策池(G1)，没命中再查危险工具权限池(三态: allow/deny/reply)
      const pid = String(msg.permId || "");
      const resp = parsePermDecision(msg);
      if (!decidePendingDecision(pid, resp)) decidePendingPerm(pid, resp);
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
