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
import {
  loadSettings,
  remoteEnabled,
  remoteShareSubscription,
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
}

// 探测本机可被手机端使用的渠道。订阅类按 shareSubscription 决定是否上报。
function detectChannels(s: Settings | null): Channel[] {
  const share = remoteShareSubscription(s);
  const out: Channel[] = [];
  const kind = s?.kind;
  const slot = s?.creds?.[s?.providerId || ""] || {};

  // Claude Code 订阅(anthropic-oauth) / Codex 订阅：属于「本地订阅」，仅 share 时上报
  if (share) {
    if (kind === "anthropic-oauth" || s?.oauthToken || slot.oauthToken) {
      out.push({ id: "claude-code-subscription", label: "Claude Code 订阅", kind: "subscription" });
    }
    if (kind === "codex") {
      out.push({ id: "codex-subscription", label: "Codex 订阅", kind: "subscription" });
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
    // 未登录：无法鉴权，稍后重试
    scheduleReconnect();
    return;
  }

  cleanup();
  const url = `${RELAY_WS}?token=${encodeURIComponent(token)}`;
  try {
    ws = new WebSocket(url);
  } catch {
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
    } catch {
      /* ignore */
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
      // 上线成功（M1 到此为止；M2 在这里收 chat 执行请求）
    }
    // M2: if (msg.type === 'chat') { ...跑本机 agent，流式回传... }
  });

  ws.on("close", () => {
    cleanup();
    scheduleReconnect();
  });
  ws.on("error", () => {
    // 交给 close 处理重连
  });
}

/** 启动 relay 常驻连接（仅在 remoteEnabled 时真正连）。可重复调用（幂等）。 */
export function startRelayClient() {
  const s = loadSettings();
  if (!remoteEnabled(s)) {
    stopRelayClient();
    return;
  }
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
