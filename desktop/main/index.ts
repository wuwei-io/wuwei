import {localizeToolMetadata} from "../../src/localization/tools.js";
import { tr, getCurrentLanguage, getLanguages } from "../../src/localization/index.js";
import { resolveEmployee, employeeLabel, employeeRoster, TEAM_TOOL_EN } from "../../src/team/default-localization.js";
// Electron 主进程：创建窗口，复用核心(agent/tools/config)，
// 通过 IPC 把 Agent 流式 hooks 推给渲染进程，权限确认走 IPC 往返。
import { app, BrowserWindow, WebContentsView, ipcMain, protocol, net, shell, session, clipboard, Menu, safeStorage, Tray, nativeImage, dialog, screen, nativeTheme } from "electron";
// ⚠️ 必须是最靠前的本地 import：它的顶层副作用会设好 WUWEI_DATA_DIR_NAME，
//    之后 sessions/settings/brain 等模块初始化时才能按正确版本(wuwei/minicc/test)选数据目录。
import { EDITION, IS_MINICC, IS_TEST, APP_NAME, APP_ID, DATA_DIR_NAME, appDisplayName } from "./edition.js";
import electronUpdater from "electron-updater";
import { fetchAnnouncement } from "./announcement.js";
import { sessionAfterDelete } from "../../src/team/session-after-delete.js";
import { createUpdatePolicy, DEFAULT_UPDATE_INTERVAL_MS, updateIntervalMs, jitterUpdateInterval } from "./update-policy.js";
const safeStorageOk = () => {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
};
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { loadConfig } from "../../src/config.js";
import { makeProvider, setImageCapper } from "../../src/agent/provider.js";
import { prepareModelImage } from "../../src/image-preparation.js";
import { Agent } from "../../src/agent/loop.js";
import { systemPrompt, renderPrompt, DEFAULT_SYSTEM_PROMPT, DEFAULT_SYSTEM_PROMPT_EN } from "../../src/agent/prompt.js";
import { ALL_TOOLS, TOOL_MAP, MEMORY_FILE } from "../../src/tools/index.js";
import * as brain from "../../src/brain/index.js";
import type { Tool, ToolResult, ToolContext, TaskReportScope, RateLimits, Decision, DecisionResponse } from "../../src/types.js";
import { PlatformBillingClient } from '../../src/imagegen/platform-billing-client.js';
import { checkImageAvailability } from '../../src/imagegen/image-availability.js';
import { connectMcp, mcpTools, mcpToolsBySource, mcpStatus, loadMcpConfig, searchMcpRegistry, MCP_CONFIG_PATH } from "./mcp.js";
import * as secrets from "./secrets.js";
import { writeFileSync, mkdirSync, appendFileSync, readdirSync, statSync, unlinkSync, renameSync } from "node:fs";
import { dirname } from "node:path";

// 全局记忆：读/写 ~/.wuwei/memory.md
function loadMemory(): string {
  try {
    return readFileSync(MEMORY_FILE, "utf8");
  } catch {
    return "";
  }
}
function saveMemory(text: string) {
  mkdirSync(dirname(MEMORY_FILE), { recursive: true });
  writeFileSync(MEMORY_FILE, text, "utf8");
}
import {
  listSessions,
  loadMessages,
  saveSession,
  deleteSession,
  listTrash,
  restoreSession,
  purgeTrashItem,
  emptyTrash,
  autoPurgeTrash,
  deriveTitle,
  stripHandoffWrapper,
  listGroups,
  setSessionGroup,
  setSessionPriority,
  setSessionOrder,
  setSessionProject,
  setGroupsOrder,
  setSessionDone,
  setSessionDiscuss,
  setSessionModel,
  setSessionBinding,
  setSessionEmployee,
  setSessionRunning,
  clearInterrupted,
  dismissResume,
  markInterruptedOnStartup,
  flushAllSessionsSync,
} from "./sessions.js";
import { ensureFresh as ensureSearchIndex, searchSessions as searchInSessions } from "./search.js";
import {
  loadSettings,
  saveSettings,
  initializeFirstRunSettings,
  applyEnvFromSettings,
  detectSysLang,
  loadRateLimits,
  saveRateLimits,
  loadWindowBounds,
  saveWindowBounds,
  loadSessionBalances,
  saveSessionBalances,
  migrateFromMinicc,
  secretsDetectEnabled,
  brainEnabled,
  brainDocsEnabled,
  resumeDetectEnabled,
  claudeAutoRefreshEnabled,
  telemetryEnabled,
  teamEnabled,
  remoteShareSubscription,
  remoteEnabled,
  type Settings,
  type SessionBal,
} from "./settings.js";
// 「AI 员工团队」可选模块：默认关，开了才注册。整个模块只在这一处被引用（可插拔契约，见设计方案第七节）
import { registerTeam, unregisterTeam, applyEmployee, broadcastTeam } from "./team/index.js";
import { teamRequestHistory, clearTeamHistoryDigest } from "./team/history.js";
import { employeeMemoryPath, loadEmployees, loadApps, addEmployees, updateEmployee, removeEmployee, loadSchedules, addSchedule, updateSchedule, removeSchedule, MIN_INTERVAL_MINUTES, buildEmployeeSystem, loadEmployeeMemory, loadTeamConfig, loadDepartments, createDepartment, updateDepartment, removeDepartment } from "./team/store.js";
import { startScheduler, stopScheduler } from "./team/scheduler.js";
import type { Employee, ScheduleTrigger } from "../../src/team/types.js";
import { runDmTurn, runRoomTurn, abortRoom, isRoomRunning, enqueueEmpTask, empQueueLen, empIsBusy, type RunEmployeeArgs, type OrchestratorDeps } from "./team/orchestrator.js";
import { TaskReports, ConversationReports, taskReportPrompt } from './team/task-reports.js';
import { findOrCreateDm, appendMessage as appendDmMessage, loadRooms, loadRoomMessages, createRoom, updateRoom, deleteRoom } from "./team/room.js";
// 「一人公司 SOP 库」可选模块：挂在 team 总开关下（teamEnabled 为真才注册工具/通道）。
import {
  searchSops as sopSearch,
  readSopDoc as sopReadDoc,
  loadTree as sopLoadTree,
  findByTaskKey as sopFindByTaskKey,
  createNode as sopCreateNode,
  saveSopDoc as sopSaveDoc,
  categoryPathOf as sopCategoryPath,
  updateSummary as sopUpdateSummary,
} from "./sop/store.js";

// 数据目录 .minicc→.wuwei 改名后的一次性迁移，须在任何数据读取前执行。
// （edition/数据目录名/APP_ID 等已在最顶部 ./edition.js 解析并写入 process.env。）
migrateFromMinicc();
import { getAccount, logout } from "./account.js";
import {
  claudeOAuthLogin,
  claudeOAuthOpenBrowser,
  claudeOAuthExchange,
  claudeOAuthRefresh,
  loadClaudeAuth,
} from "./claude-oauth.js";
import { codexOAuthLogin } from "./codex-oauth.js";
import {
  wuweiLogin,
  wuweiRefresh,
  wuweiFetchMe,
  wuweiFetchCatalog,
  wuweiPasswordLogin,
  wuweiSendCode,
  wuweiCodeLogin,
  wuweiRegister,
  wuweiPayCreate,
  wuweiBillingRequest,
  wuweiPayCryptoCreate,
  wuweiPayCryptoPayment,
  wuweiPayStatus,
  reportClientLogin,
  reportClientEvent,
  trackProductEvent,
  trackClientLog,
  setDiagConsent,
  reportExternalUsage,
  type WuweiSession,
  type WuweiMe,
} from "./wuwei-auth.js";
import { saveWuweiSession, loadWuweiSession, clearWuweiSession } from "./wuwei-session.js";
import { createHostedSessionState } from "../../src/wuwei-session-state.js";
import { startRelayClient, stopRelayClient, refreshRelayClient, setRemoteExecutor, setRemoteRoomExecutor, setRemoteRequestHandler, detectChannels, requestLocalDecision, answerLocalDecision } from "./relay-client.js";
import { notifyRemote } from './remote-notify.js';
import { runRemoteSessionTurn, waitForRemoteResult } from './remote-sessions.js';
import { resolveRemoteSelection, providerKindForId } from './remote-models.js';
import { remoteHistoryBounds } from './remote-history.js';
import { runRemoteRoomTurn } from './remote-rooms.js';
import { remoteTaskDetail, remoteRoomTaskDetail, remoteBatchTaskDetail } from './remote-task-detail.js';
import { RemoteArtifacts } from './remote-artifacts.js';
const remoteArtifacts = new RemoteArtifacts(join(homedir(), DATA_DIR_NAME, 'remote-artifacts'));
import { loadRemember, upsertRemember, clearRememberedPassword } from "./wuwei-remember.js";
import { getDeviceId } from "../../src/device-id.js";
import { log, LOG_FILE } from "./logger.js";

log("boot", `${APP_NAME} 主进程启动 (edition=${EDITION})`, "日志文件:", LOG_FILE);
process.on("uncaughtException", (e) => { log("uncaught", e?.stack || String(e)); void trackClientLog("error", "error", { message: `uncaughtException: ${e?.message || String(e)}`, meta: { stack: (e?.stack || "").slice(0, 800) } }); });
process.on("unhandledRejection", (e) => { log("unhandledRejection", String(e)); void trackClientLog("error", "error", { message: `unhandledRejection: ${String(e)}`.slice(0, 500) }); });

// __dirname 由 electron-vite 为 ESM 输出自动注入，无需手动声明

// 注册自定义 app:// 协议为特权协议（须在 app ready 前）。
// 用它伺服打包后的 renderer，避免 file:// 下 module 脚本被 CORS/CSP 拦导致黑屏。
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let trayMenu: BrowserWindow | null = null; // 自绘托盘右键菜单（无框弹窗，替代原生 setContextMenu）
// 关闭按钮(✕)默认隐藏到托盘常驻；只有托盘「退出」/before-quit 把它置 true 才真正退出。
let quitting = false;

// provider/系统提示全局共享；每个会话一个 Agent（各自 messages）
let provider: ReturnType<typeof makeProvider> | null = null;
let sysPrompt = "";
let agentOpts: { compactThreshold?: number; compactMsgThreshold: number; keepRecent: number } = { compactMsgThreshold: 0, keepRecent: 6 };
let backendLabel = "";
let modelLabel = "";
let ctxWindow = 1_000_000; // 当前模型上下文窗口(占用条用真实值)
let subFlag = false; // 当前后端是否订阅类(决定前端是否显示 5小时/周额度)
let cwd = process.cwd();
const agents = new Map<string, Agent>();
// 每会话绑定的后端平台(providerId)。完全独立的关键索引：切平台/模型只动当前会话，token 续期只热更「同后端」的
// 会话——据此判断哪些会话属于同一后端，绝不把 A 会话的 provider 换成 B 会话切过去的平台。建 Agent 时按当时全局
// 平台登记，之后仅在「显式切换该会话」时更新，别处一律不改。
const backendBySid = new Map<string, string>();
// 每会话最近一轮的自足用量（onUsage 的 round），供「非托管」平台每轮结束后自报统计（见 reportExternalUsage 调用处）。
const lastRoundBySid = new Map<string, { input: number; output: number; cacheHit: number; steps: number }>();
let currentId = "";

// 权限往返：id → resolve
const pendingPerm = new Map<number, (d: "allow" | "deny") => void>();
const pendingPermSid = new Map<number, string>();
let permSeq = 0;
// ask_user(AI 弹选择框)往返：id → resolve；turnSid=当前正在跑的会话(供事件带 sid)
const pendingAsk = new Map<number, (answers: any) => void>();
// ask id → 发起该询问的会话 id：答案里带截图时，据此把图片注入回该会话的循环边界
const pendingAskSid = new Map<number, string>();
let askSeq = 0;
let turnSid = "";
// Desktop and phone resolve the same pending decision; paid tools use their own human dialog.
const desktopDecisionSids = new Map<string, string>();
function requestDesktopDecision(sid: string, signal: AbortSignal, source: { sessionId?: string; roomId?: string } = { sessionId: sid }, toolPermission?: { name: string; sid: string }): NonNullable<ToolContext['requestDecision']> {
  return decision => {
    if (signal.aborted) return Promise.resolve({ action: 'deny', reason: 'abort' });
    desktopDecisionSids.set(decision.permId, sid);
    try {
      return requestLocalDecision(decision, source, signal, event => {
        if (event.type === 'decision-resolved') desktopDecisionSids.delete(decision.permId);
        // Native local tool permission only. Paid tools, ask_decision and remote
        // approvals must not inherit automatic execution from the current tab.
        send(event.type === 'decision' ? 'evt:decision-request' : 'evt:decision-resolved',
          event.type === 'decision' && toolPermission ? { ...event, toolPermission } : event);
      }).finally(() => desktopDecisionSids.delete(decision.permId));
    } catch (error) {
      desktopDecisionSids.delete(decision.permId);
      throw error;
    }
  };
}
// 崩溃恢复：本进程是否已做过一次「残留 running→interrupted」检测(在首个 bootstrap 请求里同步做，避免时序竞争)
let interruptDetected = false;
// 多任务：每个会话各自的中断控制器；keys = 正在运行的会话集(用于任务计数)
const runs = new Map<string, AbortController>();
// 广播当前所有运行中的会话(前端据此显示"N 个任务运行中"+侧栏运行点)
function emitTasks() {
  send("evt:tasks", { running: [...runs.keys()] });
}

function send(channel: string, payload?: unknown) {
  win?.webContents.send(channel, payload);
}

// 「AI 员工团队」可选模块的挂载/卸载。开关变动时当场生效，不用重启。
// 关闭状态下本模块零参与：IPC 通道摘掉、不读写 ~/.wuwei/team/、不占启动时间。
/**
 * 按员工绑定的模型建 provider（与 providerForSession 同一套路：临时改 env → makeProvider → 还原）。
 * 员工没绑模型就返回 null，调用方回退全局 provider。
 * 这是「文案用便宜的、架构评审用贵的」这个成本分层能成立的关键。
 */
function providerForEmployee(emp: { model?: { providerId: string; model: string } }): ReturnType<typeof makeProvider> | null {
  const gs = loadSettings();
  if (!emp.model?.providerId || !emp.model.model || !gs) return null;
  try {
    const slot = (gs.creds || {})[emp.model.providerId] || {};
    const s: Settings = {
      ...gs,
      providerId: emp.model.providerId,
      kind: providerKindForId(emp.model.providerId, gs),
      model: emp.model.model,
      baseUrl: slot.baseUrl ?? (gs.providerId === emp.model.providerId ? gs.baseUrl : undefined),
      apiKey: slot.apiKey || (gs.providerId === emp.model.providerId ? gs.apiKey : undefined),
      oauthToken: slot.oauthToken || (gs.providerId === emp.model.providerId ? gs.oauthToken : undefined),
    };
    try {
      applyEnvFromSettings(s);
      return makeProvider(loadConfig());
    } finally {
      applyEnvFromSettings(gs); // 必须还原，否则后续全局请求会跑到员工的平台上
    }
  } catch {
    return null;
  }
}

// 远程执行(M2)：手机端选的「渠道 id」→ 本机对应平台的 provider。
// claude-code-subscription→claude-oauth(Claude 订阅)、codex-subscription→codex。
// 这样手机选「Claude Code 订阅」就真用这台电脑的 Claude 订阅跑，而不是电脑 UI 当前选的那个模型。
// 认不出的渠道(api-key/其它)返回 null，调用方回退全局 provider。
function providerForChannel(channelId: string | null | undefined): ReturnType<typeof makeProvider> | null {
  const gs = loadSettings();
  if (!gs || !channelId) return null;
  const pid = channelId === "claude-code-subscription" ? "claude-oauth" : channelId === "codex-subscription" ? "codex" : null;
  if (!pid) return null;
  const slot = (gs.creds || {})[pid] || {};
  const model = slot.model || (gs.providerId === pid ? gs.model : "") || "";
  if (!model) return null;
  return providerForEmployee({ model: { providerId: pid, model } });
}

// 远程同步(不落库)：把本机 Message 拍平成手机可直接渲染的 {id,role,text,image}。tool 块跳过，只取文本+首图。
function flattenRemoteMsg(m: any, i: number): { id: string; role: "user" | "assistant"; text?: string; image?: string } {
  const role: "user" | "assistant" = m?.role === "user" && !m?.content?.some((b: any) => b?.type === 'tool_result') ? "user" : "assistant";
  let text = "";
  let image: string | undefined;
  for (const b of (m?.content as any[]) || []) {
    if (b?.type === "text") text += b.text || "";
    else if (b?.type === "image" && !image) image = b.dataUrl;
    else if (b?.type === "tool_result" && Array.isArray(b.content) && !image)
      image = b.content.find((part: any) => part?.type === 'image')?.dataUrl;
  }
  return { id: `${role}-${i}`, role, text: text.trim() || undefined, image };
}

// 跑一名员工一轮（群/私聊共用）：临时 Agent，历史来自投影层，不落盘、不进 agents Map。
// 与「调研并拟计划」子会话同款做法，区别是这里要带历史、且工具按员工白名单裁剪。
// excludeTools：本轮额外剔除的工具（私聊防递归时传 ["dm_teammate"]，见 orchestrator.runDmTurn）。
const roomContextUsage = new Map<string, { providerId: string; model: string; usedTokens: number | null; maxTokens: number | null; capturedAt: number }>();
const runEmployeeTurn = async ({ employee, sys, history, input, signal, onProgress, excludeTools, dmDepth, reportOrigin, taskReportScope, requestDecision, onPermission, images, providerOverride, providerBinding, remoteExecution }: RunEmployeeArgs): Promise<string> => {
  const executionSignal = remoteExecution?.signal ? AbortSignal.any([signal, remoteExecution.signal]) : signal;
  executionSignal.throwIfAborted();
  const origin = reportOrigin || taskReportScope?.origin;
  const localSource = origin?.kind === 'room' ? { roomId: origin.id } : { sessionId: origin?.id || `__room_${employee.id}` };
  const decide = requestDecision || remoteExecution?.requestDecision || requestDesktopDecision(`__room_${employee.id}`, executionSignal, localSource);
  const decisionHook: ToolContext['requestDecision'] = decision => waitForRemoteResult(decide(decision), executionSignal);
  const permit = onPermission || remoteExecution?.requestPermission || (async (name: string, input: unknown): Promise<'allow' | 'deny'> => {
    const answer = await requestDesktopDecision(`__room_${employee.id}`, executionSignal, localSource,
      { name, sid: origin?.id || `__room_${employee.id}` })({ permId: randomUUID(), title: tr("ui.index.message.1da10a8938", {p0: employee.name}), question: tr("ui.index.message.1451026b7f", {p0: name}), risk: 'high', options: [{ label: tr("ui.index.message.7caaf0c897"), value: 'deny' }, { label: tr("ui.index.message.fe73513fd6"), value: 'allow' }], allowCustom: false, timeoutSec: null, rawDetail: JSON.stringify(input, null, 2) });
    return answer.action === 'allow' || answer.value === 'allow' ? 'allow' : 'deny';
  });
  if (remoteExecution && !remoteEnabled(loadSettings())) throw new Error(tr("ui.index.message.a63bf3cf53"));
  if (remoteExecution && (!remoteExecution.shareSubscription || !remoteShareSubscription(loadSettings())) && !providerOverride &&
      ['claude-oauth', 'codex'].includes(employee.model?.providerId || curProviderId()))
    throw new Error(tr("ui.index.message.e0fccfc9ef"));
  const employeeProvider = providerOverride || providerForEmployee(employee);
  if (remoteExecution && employee.model && !employeeProvider) throw new Error(tr("ui.index.message.2168cf7bde"));
  const p = employeeProvider || provider;
  if (!p) throw new Error(tr("ui.index.message.95634b4b7f"));
  const all = desktopTools();
  let tools = employee.tools?.length ? all.filter((t) => employee.tools!.includes(t.name)) : all;
  if (excludeTools?.length) tools = tools.filter((t) => !excludeTools.includes(t.name));
  const map = new Map(tools.map((t) => [t.name, t]));
  // employeeId 塞进 ToolContext：dm_teammate 据此确定「发起方」是哪名员工。
  const remoteSys = remoteExecution ? sys + '\n\n当前用户通过手机远程操控。需要用户选择时使用 ask_decision，提供白话问题与 2~3 个选项；重要或不可逆操作设为 high 并等待回复。' : sys;
  const a = new Agent(p, remoteSys, tools, { cwd, sessionId: `__room_${employee.id}`, memoryFile: employeeMemoryPath(employee.id), employeeId: employee.id, dmDepth, reportOrigin, taskReportScope,
    remoteExecution: remoteExecution ? { ...remoteExecution, signal: executionSignal } : undefined,
    requestDecision: decisionHook }, map, { ...agentOpts, requestHistory: teamRequestHistory(origin?.kind === 'room' ? `room:${origin.id}` : `employee:${employee.id}`) });
  if (history.length) a.setMessages(history as any);
  // 转发思考/工具活动给界面显示（可展开/收起、随时中断），但这些不进群消息流。
  await a.send(input, {
    requestPermission: async (tool: any, args: any) => waitForRemoteResult(permit(tool.name, args), executionSignal),
    onTurnEnd: (turnId: string) => taskReports.closeTurn(turnId),
    onText: (delta: string) => onProgress?.({ kind: "text", delta }),
    onToolStart: (id: string, name: string, input: any) => onProgress?.({ kind: "tool-start", id, name, input }),
    onToolEnd: (id: string, r: string, isError: boolean, image?: string) => { onProgress?.({ kind: "tool-end", id, isError, result: typeof r === "string" ? r.slice(0, 2000) : undefined }); if (image) onProgress?.({ kind: "image", dataUrl: image }); },
    // 群/私聊里员工跑订阅平台(Claude/Codex)时也上报额度快照——否则群里干活消耗了订阅额度，
    // 底部状态栏(主会话)却看不到，用户以为额度没动。按员工自己的平台存(没绑走全局平台兜底)。
    onRateLimits: (rl: unknown) => {
      const pid = providerBinding?.providerId || employee.model?.providerId || curProviderId();
      try { saveRateLimits(pid, rl as any); } catch { /* 存不下不影响本轮 */ }
      send("evt:ratelimits", rl);
    },
  } as any, executionSignal, images);
  if (reportOrigin?.kind === 'room') {
    const providerId = providerBinding?.providerId || employee.model?.providerId || curProviderId();
    const model = providerBinding?.model || employee.model?.model || loadSettings()?.creds?.[providerId]?.model || (providerId === curProviderId() ? loadConfig().model : '');
    roomContextUsage.set(`${reportOrigin.id}:${employee.id}`, { providerId, model, usedTokens: a.getUsage().lastInput || null, maxTokens: a.getContextBudget().contextWindow || null, capturedAt: Date.now() });
  }
  executionSignal.throwIfAborted();
  const last = [...a.getMessages()].reverse().find((m: any) => m.role === "assistant");
  return last ? msgFullText(last as any) : "";
};

// 私聊编排所需的注入依赖（send/log/runEmployee/baseSys），dm_teammate 工具调 runDmTurn 时用。
function teamOrchestratorDeps(ctx?: ToolContext): OrchestratorDeps {
  return { send, log, runEmployee: args => runEmployeeTurn({ ...args, remoteExecution: ctx?.remoteExecution }), baseSys: () => sysPrompt };
}

const conversationReports = new ConversationReports({
  isBusy: sid => runs.has(sid),
  deliver: async (sid, text) => {
    if (!listSessions().some(s => s.id === sid)) throw new Error(tr("ui.index.message.e2f2fc5e55"));
    if (!getAgent(sid)) throw new Error(tr("ui.index.message.ad10caf22a"));
    await startTurn(sid, text);
  },
});
const taskReportJournal = join(homedir(), DATA_DIR_NAME, 'team', 'task-reports.json');
function loadTaskReportJournal() { try { const data = JSON.parse(readFileSync(taskReportJournal, 'utf8')); return Array.isArray(data) ? data : []; } catch { return []; } }
const taskReports = new TaskReports({
  restore: loadTaskReportJournal(),
  save: batches => {
    try {
      mkdirSync(dirname(taskReportJournal), { recursive: true });
      const safe = batches.map(batch => ({ ...batch, results: batch.results.map(result => ({ ...result, task: secrets.redact(result.task).text, text: secrets.redact(result.text).text })) }));
      writeFileSync(`${taskReportJournal}.tmp`, JSON.stringify(safe));
      renameSync(`${taskReportJournal}.tmp`, taskReportJournal);
    } catch (error) { log('team', '任务进度保存失败', secrets.redact(String(error)).text); }
  },
  deliver: async batch => {
    const text = secrets.redact(taskReportPrompt(batch)).text;
    if (batch.scope.origin.kind === 'session') {
      await conversationReports.enqueue(batch.scope.origin.id, text);
    } else {
      // 回到最初派活的房间，由派活者验收；不会只停留在他与员工的另一条 DM。
      const roomId = batch.scope.origin.id;
      if (!loadRooms().some(r => r.id === roomId)) throw new Error(tr("ui.index.message.ae8d1b9349"));
      const messages = appendDmMessage(roomId, { speaker: { id: 'task-report', name: tr("ui.index.message.98a89682fc"), kind: 'agent' }, text });
      send('evt:team-room', { roomId, messages, running: true });
      await enqueueEmpTask(batch.scope.ownerId, async () => {
        await runDmTurn(roomId, batch.scope.ownerId, text, teamOrchestratorDeps(), batch.scope.depth,
          { strict: true, explicitInput: true });
      });
    }
  },
  onDeliveryError: (batch, error) => {
    log('team', '任务汇报失败', batch.scope.turnId, secrets.redact(String(error)).text);
    const text = secrets.redact(taskReportPrompt(batch)).text;
    if (batch.scope.origin.kind === 'session') {
      // 保留收到的员工资料；模型暂不可用时也不把汇报静默丢弃。
      const a = agents.get(batch.scope.origin.id);
      if (a) { a.setMessages([...a.getMessages(), { role: 'user', content: [{ type: 'text', text }], ts: Date.now() }]); persist(batch.scope.origin.id); }
      send('evt:error', { sid: batch.scope.origin.id, message: tr("ui.index.message.dd69db9e2f") });
    } else send('evt:team-room-hint', { roomId: batch.scope.origin.id, code: 'task-report-error', hint: tr("ui.index.message.9cf10363d6") });
  },
});

function startEmployeeChat(employeeId: string, employeeName: string, model?: { providerId: string; model: string }) {
  lockSessionModel(currentId); // 同 session:new：先锁住正要离开的会话的模型
  currentId = randomUUID();
  setSessionEmployee(currentId, employeeId, employeeName);
  // 员工绑了自定义模型 → 把它写进会话绑定，底栏就显示员工的模型（显示=实际用的，一致）。
  // 没绑 → 会话不绑，底栏显示全局默认，applyEmployee 也不改模型。正好对应"自定义优先、否则用默认"。
  if (model?.providerId && model.model) {
    const gs = loadSettings();
    const slot = (gs?.creds || {})[model.providerId] || {};
    // kind 不从 creds slot 取(CredSlot 无此字段)——会话按 providerId 重建 provider 时自会推断。
    setSessionBinding(currentId, { providerId: model.providerId, model: model.model, baseUrl: slot.baseUrl });
  }
  const a = getAgent(currentId);
  send("evt:sessions", listSessions());
  send("evt:session-loaded", { id: currentId, messages: a ? a.getMessages() : [], boundModel: model?.model, boundProviderId: model?.providerId });
  sendUsageFor(currentId);
  void emitAccount();
}

function syncTeamModule(s: Settings | null) {
  if (teamEnabled(s))
    registerTeam(ipcMain, {
      send,
      log,
      // 开一名员工的私聊：与 session:new 同一套流程，只是先把 employeeId 写进 meta，
      // 这样 getAgent 建 Agent 时就能读到并套上人格。
      startChat: startEmployeeChat,
      baseSys: () => sysPrompt,
      runEmployee: runEmployeeTurn,
    });
  else { unregisterTeam(ipcMain); stopScheduler(); return; }

  // 定时任务调度器：只在 team 模块开着时跑。到点在负责人专属会话里执行一轮。
  startScheduler({
    log,
    readSopContent: (sopId) => { try { return sopReadDoc(sopId) || ""; } catch { return ""; } },
    runForEmployee: (employeeId, text) => {
      const emp = loadEmployees().find((e) => e.id === employeeId);
      if (!emp) return;
      // 优先复用该员工最近的专属会话(结果就落在「你俩的对话」里可回看)；没有就新建一个，但不切走用户当前视图。
      const latest = listSessions().filter((s: any) => s.employeeId === employeeId).sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
      let sid = latest?.id as string | undefined;
      if (!sid) {
        sid = randomUUID();
        setSessionEmployee(sid, employeeId, emp.name);
        if (emp.model?.providerId && emp.model.model) {
          const gs = loadSettings();
          const slot = (gs?.creds || {})[emp.model.providerId] || {};
          setSessionBinding(sid, { providerId: emp.model.providerId, model: emp.model.model, baseUrl: slot.baseUrl });
        }
        send("evt:sessions", listSessions());
      }
      void startTurn(sid, text);
    },
  });
}

function mimeFor(path: string): string | null {
  if (path.endsWith(".js") || path.endsWith(".mjs")) return "text/javascript";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".html")) return "text/html";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".woff2")) return "font/woff2";
  return null;
}

// 平台友好名（各兼容端点的 cfg.provider 都是 openai，改用 UI 预设 providerId 显示真实平台）
const PROVIDER_LABELS: Record<string, string> = {
  get codex() { return tr("ui.index.codex.subscription.9022217"); },
  get "claude-oauth"() { return tr("set.g.claudeSub"); },
  anthropic: "Claude API",
  openai: "OpenAI",
  deepseek: "DeepSeek",
  get qwen() { return tr("ui.index.message.4934a6e4c2"); },
  get doubao() { return tr("ui.index.message.5d63d1428b"); },
  minimax: "MiniMax",
  get zhipu() { return tr("ui.index.zhipu.glm.214052b"); },
  kimi: "Kimi",
  get hunyuan() { return tr("ui.index.message.3db3bd29be"); },
  grok: "Grok",
  get custom() { return tr("ui.index.message.8510597928"); },
};
// 无为托管平台(providerId 以 "wuwei-" 开头)的品牌名——底层都走 openai 兼容端点，
// 不能用 cfg.provider(恒为 openai)当平台名，得按 providerId 映射真实品牌。
const HOSTED_BRAND: Record<string, string> = {
  deepseek: "DeepSeek",
  get zhipu() { return tr("ui.index.zhipu.glm.214052b"); },
  kimi: "Kimi",
  claude: "Claude",
  gpt: "GPT",
};
// 平台名的英文（只列中文项；纯英文品牌名两边通用，不必重复）。
// 渲染层通常按 providerId 查自己的 PRESET_EN 显示，这里是预设里查不到时的兜底，同样得跟语言。
const PROVIDER_LABELS_EN: Record<string, string> = {
  codex: "Codex subscription",
  "claude-oauth": "Claude subscription",
  qwen: "Qwen",
  doubao: "Doubao",
  zhipu: "Zhipu GLM",
  hunyuan: "Tencent Hunyuan",
  custom: "Custom endpoint",
};
function providerLabel(pid: string): string | undefined {
  const en = getCurrentLanguage() !== "zh";
  return (en && PROVIDER_LABELS_EN[pid]) || PROVIDER_LABELS[pid];
}
function labelFor(cfg: ReturnType<typeof loadConfig>, providerId?: string): string {
  if (providerId && PROVIDER_LABELS[providerId]) return providerLabel(providerId)!;
  // 无为托管：显示「无为托管 · 品牌」，别露出底层 openai
  if (providerId && providerId.startsWith("wuwei-")) {
    if (providerId === "wuwei-free") return tr("ui.index.wuwei.free.trial.1ffbeb0");
    const base = providerId.slice("wuwei-".length);
    // providerLabel 优先：HOSTED_BRAND 里的 zhipu 是中文「智谱 GLM」，英文得走 PROVIDER_LABELS_EN
    return `${tr("ui.index.wuwei.hosted.afa5b1d")} · ${providerLabel(base) || HOSTED_BRAND[base] || base}`;
  }
  return cfg.provider === "anthropic" ? `anthropic/${cfg.authMode}` : cfg.provider;
}

// 订阅类后端(有 5小时/周额度概念)：Codex / Claude 订阅 / Kimi Code 订阅
function isSub(pid?: string): boolean {
  return pid === "codex" || pid === "claude-oauth" || pid === "kimi-sub";
}

// DeepSeek 提供余额查询 API；用当前 key 拉账户余额(CNY)
async function fetchDeepSeekBalance(
  apiKey: string,
): Promise<{ total: string; currency: string } | null> {
  try {
    const r = await fetch("https://api.deepseek.com/user/balance", {
      headers: { Authorization: "Bearer " + apiKey },
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    const info = j?.balance_infos?.[0];
    return info ? { total: info.total_balance, currency: info.currency } : null;
  } catch {
    return null;
  }
}

// DeepSeek 官方单价(人民币/百万 token)：缓存命中输入 / 缓存未命中输入 / 输出
// 余额 API 有分钟级延迟且跨会话共享，按 token×单价当场算才准、无延迟(本会话精确)
function dsPrice(model: string): { hit: number; miss: number; out: number } {
  const m = (model || "").toLowerCase();
  if (m.includes("flash")) return { hit: 0.02, miss: 1, out: 2 };
  // deepseek-v4-pro / reasoner / chat 及默认
  return { hit: 0.025, miss: 3, out: 6 };
}
// 用累计用量算本会话消耗(元)；缓存命中/未命中缺失时全算未命中兜底
function dsCost(model: string, u: { totalOutput: number; totalCacheHit: number; totalCacheMiss: number }): number {
  const p = dsPrice(model);
  return (u.totalCacheHit * p.hit + u.totalCacheMiss * p.miss + u.totalOutput * p.out) / 1e6;
}

// 智谱 GLM 官方单价(元/百万 token)：缓存命中 / 未命中输入 / 输出(2026-07 官网)
function glmPrice(model: string): { hit: number; miss: number; out: number } {
  const m = (model || "").toLowerCase();
  if (/flash/.test(m)) return { hit: 0.1, miss: 0.1, out: 0.1 }; // Flash 近免费
  if (/glm-4/.test(m)) return { hit: 0.11, miss: 0.6, out: 2 }; // GLM-4.x 近似
  return { hit: 1.4, miss: 5.6, out: 19.6 }; // glm-5.x(5.2 旗舰) 默认
}
function tokenCost(
  price: { hit: number; miss: number; out: number },
  u: { totalOutput: number; totalCacheHit: number; totalCacheMiss: number },
): number {
  return (u.totalCacheHit * price.hit + u.totalCacheMiss * price.miss + u.totalOutput * price.out) / 1e6;
}

// 每个会话的余额跟踪(持久化)：账户余额展示用；消耗改由 token 计价
const sessionBal: Record<string, SessionBal> = loadSessionBalances();

// 各平台控制台：登录页 + 登录后拿账号信息的内部接口(在已登录页面里同源 fetch，自动带 cookie)
// 接口是自己开浏览器 F12 网络面板扒出来的(别公开 API 就这么找)；其它平台照此法加。
const CONSOLE: Record<string, { login: string; api: string; sniff?: RegExp }> = {
  deepseek: {
    login: "https://platform.deepseek.com/sign_in",
    api: "https://platform.deepseek.com/auth-api/v0/users/current",
  },
  zhipu: {
    // 账号+余额都在这个控制台内部接口(cookie 认证)：data.basicCustomerInfo.{customerName,avatar,balance}
    login: "https://open.bigmodel.cn/login",
    api: "https://bigmodel.cn/api/biz/customer/accountSet",
    sniff: /bigmodel\.cn\/.*(customer|user|account|balance|finance|wallet|overview|profile|current|info)/i,
  },
  // Kimi Code 订阅：额度接口(Connect-RPC POST)与登录页同域(www.kimi.com)→页面内同源 fetch 直接带 cookie
  // 返回 usages[0].detail=周额度、usages[0].limits[](window.duration=300min)=5小时窗口
  "kimi-sub": {
    login: "https://www.kimi.com/code",
    api: "https://www.kimi.com/apiv2/kimi.gateway.billing.v1.BillingService/GetUsages",
    sniff: /kimi\.com\/apiv2\/.*(Usage|Subscription|Billing|Quota)/i,
  },
};

// 把 GetUsages 返回体解析成统一的 rateLimits(5小时=primary / 周=secondary)
// 结构：{usages:[{detail:{limit,used,remaining,resetTime}, limits:[{detail,window:{duration,timeUnit}}]}]}
function parseKimiUsage(j: any): {
  rateLimits?: RateLimits;
  ok: boolean;
} {
  try {
    const u0 = j?.usages?.[0];
    if (!u0) return { ok: false };
    const pct = (d: any) => {
      const lim = Number(d?.limit),
        used = Number(d?.used);
      if (!Number.isFinite(lim) || lim <= 0 || !Number.isFinite(used)) return undefined;
      return Math.min(100, Math.round((used / lim) * 100));
    };
    const resetSecs = (iso?: string) => {
      if (!iso) return undefined;
      const t = Date.parse(iso);
      return Number.isNaN(t) ? undefined : Math.max(0, Math.round((t - Date.now()) / 1000));
    };
    // 周额度：外层 detail
    const week = u0.detail;
    // 5小时窗口：limits[] 里找 window.duration≈300min（TIME_UNIT_MINUTE）
    const mins = (w: any) =>
      w?.timeUnit === "TIME_UNIT_MINUTE" ? Number(w?.duration) : Number(w?.duration) / 60;
    const fiveH =
      (u0.limits || [])
        .map((l: any) => ({ l, m: mins(l.window) }))
        .sort((a: any, b: any) => Math.abs(a.m - 300) - Math.abs(b.m - 300))[0]?.l || null;
    const rl: RateLimits = {
      primaryUsedPercent: fiveH ? pct(fiveH.detail) : undefined,
      primaryWindowMinutes: 300,
      primaryResetAfterSeconds: fiveH ? resetSecs(fiveH.detail?.resetTime) : undefined,
      secondaryUsedPercent: week ? pct(week) : undefined,
      secondaryWindowMinutes: 7 * 24 * 60,
      secondaryResetAfterSeconds: week ? resetSecs(week.resetTime) : undefined,
    };
    if (rl.primaryUsedPercent == null && rl.secondaryUsedPercent == null) return { ok: false };
    return { rateLimits: rl, ok: true };
  } catch {
    return { ok: false };
  }
}

// 主进程静默拉 Kimi Code 额度：分区 cookie + 已存 webToken(Bearer) POST GetUsages
// token 存在 creds["kimi-sub"].webToken；同域 cookie 一般已够，Bearer 作兜底
async function kimiUsage(): Promise<
  { rateLimits?: RateLimits; expired?: boolean } | null
> {
  const cfg = CONSOLE["kimi-sub"];
  try {
    const ses = session.fromPartition("persist:login-kimi-sub");
    const cookies = await ses.cookies.get({ url: "https://www.kimi.com" });
    if (!cookies.length) return null; // 从没登录过
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const st = loadSettings();
    const slot = st?.creds?.["kimi-sub"];
    const extra = slot?.webHeaders || {}; // 登录时抓到的整套头(Authorization + x-msh-*)
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Cookie: cookieHeader,
      ...extra,
    };
    if (!headers.Authorization && !headers.authorization && slot?.webToken)
      headers.Authorization = "Bearer " + slot.webToken;
    if (!headers.Authorization && !headers.authorization) {
      log("kimiUsage", "无鉴权头(未浏览器登录过)");
      return null;
    }
    // 请求体必须带 scope(repeated,≥1项)，否则 400 invalid_argument
    const r = await fetch(cfg.api, { method: "POST", headers, body: JSON.stringify({ scope: ["FEATURE_CODING"] }) });
    const j: any = await r.json().catch(() => null);
    const parsed = parseKimiUsage(j);
    if (!parsed.ok) {
      log("kimiUsage", "未取到额度 status=", r.status, "body=", JSON.stringify(j).slice(0, 160), "hasCookie=", !!cookieHeader, "hasAuth=", !!(headers.Authorization || headers.authorization));
      if (r.status === 401 || r.status === 403) return { expired: true };
      return null;
    }
    log(
      "kimiUsage",
      "5h=", parsed.rateLimits?.primaryUsedPercent, "% 周=", parsed.rateLimits?.secondaryUsedPercent, "%",
    );
    return { rateLimits: parsed.rateLimits };
  } catch (e) {
    log("kimiUsage", "出错", String(e));
    return null;
  }
}
// 从接口返回的 JSON 里深度搜索账号资料(不管包了几层 data/biz_data)：找同时有 名字+头像 的对象
function pickProfile(j: any): { name?: string; avatar?: string } | null {
  const nameKeys = ["name", "nickname", "username", "display_name", "customerName"];
  const avKeys = ["picture", "avatar", "avatar_url", "headimgurl", "head_img", "photo"];
  let best: { name?: string; avatar?: string } | null = null;
  const visit = (o: any, depth: number): boolean => {
    if (!o || typeof o !== "object" || depth > 7) return false;
    const name = nameKeys.map((k) => o[k]).find((v) => typeof v === "string" && v.trim());
    const avatar = avKeys.map((k) => o[k]).find((v) => typeof v === "string" && /^https?:/.test(v));
    if (name && avatar) {
      best = { name, avatar };
      return true; // 最理想：名字+头像齐全(即 id_profile)，直接命中
    }
    if ((name || avatar) && !best) best = { name: name || undefined, avatar: avatar || undefined };
    for (const v of Object.values(o)) if (visit(v, depth + 1)) return true;
    return false;
  };
  visit(j, 0);
  return best;
}

// 读 ~/.claude.json 的 oauthAccount(明文)：用户名/邮箱/套餐，零风险、总是最新(Claude Code 自动维护)
function readClaudeAccount(): { displayName?: string; email?: string; plan?: string } | null {
  try {
    const d = JSON.parse(readFileSync(join(homedir(), ".claude.json"), "utf8"));
    const oa = d.oauthAccount;
    if (!oa) return null;
    const ot = String(oa.organizationType || "");
    const tier = String(oa.organizationRateLimitTier || "");
    let plan: string | undefined;
    if (/max/i.test(ot)) {
      const m = tier.match(/(\d+)x/i);
      plan = m ? `Max ${m[1]}x` : "Max";
    } else if (/pro/i.test(ot)) plan = "Pro";
    else if (/team/i.test(ot)) plan = "Team";
    else if (/free/i.test(ot)) plan = "Free";
    return { displayName: oa.displayName, email: oa.emailAddress, plan };
  } catch {
    return null;
  }
}

// 智谱：用登录分区的 cookie 拉 accountSet 接口，取昵称/头像/余额(元)
// JWT 来源优先级：cookie 里的 token 项 > 已存的 webToken(creds.zhipu.webToken)
// 取到 JWT 后同步存回 webToken，保证 cookie 过期后仍可用 webToken 静默拉余额
async function zhipuAccount(): Promise<{ name?: string; avatar?: string; balance?: number; expired?: boolean } | null> {
  const cfg = CONSOLE.zhipu;
  try {
    const ses = session.fromPartition("persist:login-zhipu");
    const cookies = await ses.cookies.get({ url: "https://bigmodel.cn" });
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    // JWT 来源1：cookie 的 *token* 项(eyJ 开头)
    const tokCookie = cookies.find((c) => /token/i.test(c.name) && c.value.startsWith("eyJ"));
    // JWT 来源2：已存的 webToken(cookie 过期时的兜底)
    const st = loadSettings();
    const savedToken = st?.creds?.zhipu?.webToken;
    const jwt = tokCookie?.value || savedToken;
    if (!jwt) {
      log("zhipuAccount", "无 JWT 可用(cookie 无 token, webToken 也无)");
      return null;
    }
    const headers: Record<string, string> = { Accept: "application/json" };
    if (cookieHeader) headers.Cookie = cookieHeader;
    headers.Authorization = "Bearer " + jwt;
    const r = await fetch(cfg.api, { headers });
    const j: any = await r.json().catch(() => null);
    const bi = j?.data?.basicCustomerInfo;
    if (!bi) {
      log("zhipuAccount", "未取到 basicCustomerInfo status=", r.status, "code=", j?.code, j?.msg || "", "src=", tokCookie ? "cookie" : "webToken");
      // 如果是 webToken 也失效了，标记 expired 让调用方知道要重新登录
      if (!tokCookie && savedToken) return { expired: true };
      return null;
    }
    // cookie 里有新 JWT 就存回 webToken，保证下次 cookie 过期仍可用
    if (tokCookie && tokCookie.value !== savedToken) {
      const s2 = loadSettings();
      if (s2) {
        const c = { ...(s2.creds || {}) };
        c.zhipu = { ...(c.zhipu || {}), webToken: tokCookie.value };
        saveSettings({ ...s2, creds: c });
        log("zhipuAccount", "已更新 webToken(cookie→creds)");
      }
    }
    return {
      name: typeof bi.customerName === "string" ? bi.customerName : undefined,
      avatar: bi.avatar || undefined,
      balance: typeof bi.balance === "number" ? bi.balance : undefined,
    };
  } catch (e) {
    log("zhipuAccount", "出错", String(e));
    return null;
  }
}

async function webLogin(pid: string): Promise<{ name?: string; avatar?: string; token?: string } | null> {
  const cfg = CONSOLE[pid];
  log("webLogin", "开始", pid, cfg ? "登录页=" + cfg.login : tr("ui.index.message.f16958ee7c"));
  if (!cfg) return null;
  const w = new BrowserWindow({
    width: 480,
    height: 700,
    title: tr("ui.index.sign.in.to.fetch.account.info.1abf042"),
    ...(existsSync(join(__dirname, "../../build/icon.png")) ? { icon: join(__dirname, "../../build/icon.png") } : {}),
    webPreferences: { partition: "persist:login-" + pid },
  });
  w.webContents.on("did-navigate", (_e, url) => log("webLogin", "导航到", url));
  // 网络嗅探：把控制台发出的账号/余额相关内部接口 URL 记到日志(用于发现真实接口)
  if (cfg.sniff) {
    try {
      const ses = session.fromPartition("persist:login-" + pid);
      ses.webRequest.onCompleted((details) => {
        if (cfg.sniff!.test(details.url))
          log("sniff", pid, details.method, details.statusCode, details.url.split("?")[0]);
      });
      // 抓页面真实请求头：命中额度接口且带 Authorization 时，捕获整套鉴权头存进 creds，
      // 供主进程静默刷新时原样重放(Kimi 需 Bearer JWT + x-msh-* 一整套，缺一即 401)
      ses.webRequest.onBeforeSendHeaders((details, cb) => {
        if (cfg.sniff!.test(details.url)) {
          const h = details.requestHeaders || {};
          const auth = h["authorization"] || h["Authorization"];
          if (pid === "kimi-sub" && auth && /GetUsages/i.test(details.url)) {
            const want = ["x-msh-platform", "x-msh-device-id", "x-msh-version", "x-language", "x-msh-session-id", "x-traffic-id"];
            const captured: Record<string, string> = { Authorization: auth };
            for (const k of Object.keys(h)) if (want.includes(k.toLowerCase())) captured[k] = h[k];
            const s = loadSettings();
            if (s) {
              const c = { ...(s.creds || {}) };
              c["kimi-sub"] = { ...(c["kimi-sub"] || {}), webToken: auth.replace(/^Bearer\s+/i, ""), webHeaders: captured };
              saveSettings({ ...s, creds: c });
              log("sniff-hdr", pid, "✓ 捕获额度鉴权头", "keys=", Object.keys(captured).join(","));
            }
          }
        }
        cb({ requestHeaders: details.requestHeaders });
      });
    } catch (e) {
      log("webLogin", "sniff 挂载失败", String(e));
    }
  }
  w.loadURL(cfg.login).catch((e) => log("webLogin", "loadURL 失败", String(e)));

  // 从 localStorage 收集候选 token(userToken 等键里的长字符串)，逐个当 Bearer 试；带 X-Client 头
  const probeJs = `(async () => {
    const API = ${JSON.stringify(cfg.api)};
    const out = { tries: [] };
    const cands = [];
    const push = (v) => { if (typeof v === 'string' && v.length >= 20 && !cands.includes(v)) cands.push(v); };
    const walk = (v) => { if (typeof v === 'string') push(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
    try {
      for (let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i); const raw = localStorage.getItem(k) || '';
        if (!/token/i.test(k)) continue;
        try { walk(JSON.parse(raw)); } catch(e){ push(raw.replace(/^"|"$/g,'')); }
      }
    } catch(e){ out.lsErr = String(e); }
    out.candN = cands.length;
    const base = { 'Accept':'application/json', 'X-Client-Platform':'web', 'X-Client-Bundle-Id':'com.deepseek.chat', 'X-Client-Locale':'zh_CN' };
    const call = async (label, extra) => {
      try { const r = await fetch(API, { credentials:'include', headers: Object.assign({}, base, extra) }); let j=null; try{ j=await r.json(); }catch(e){}
        const d = j && j.data && typeof j.data === 'object' ? j.data : null;
        return { label, status:r.status, code:j&&j.code, msg:j&&j.msg, dataNull: !d, dataKeys: d?Object.keys(d):null, json:j };
      } catch(e){ return { label, error:String(e) }; }
    };
    for (let i=0;i<cands.length;i++){
      const t = await call('bearer#'+i+'('+cands[i].slice(0,8)+'…)', { 'Authorization':'Bearer '+cands[i] });
      if (!t.dataNull) t.tok = cands[i]; // 命中的 token 带回主进程存起来(供以后静默刷新)
      out.tries.push(t);
      if (!t.dataNull) break; // 找到能出 data 的就停
    }
    if (!cands.length) out.tries.push(await call('cookie', {}));
    return out;
  })()`;

  return await new Promise((resolve) => {
    let done = false;
    let tries = 0;
    const finish = (v: { name?: string; avatar?: string; token?: string } | null) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      clearTimeout(killer);
      log("webLogin", "结束 结果=", v ? { name: v.name, hasAvatar: !!v.avatar } : "null");
      if (!w.isDestroyed()) w.close();
      resolve(v);
    };
    const timer = setInterval(async () => {
      if (w.isDestroyed()) return finish(null);
      if (w.webContents.isLoading()) return; // 页面加载中，等一轮
      tries++;
      // 智谱：accountSet 在 bigmodel.cn 域，页面上下文跨域会被 CORS 挡；改主进程用分区 cookie 拉
      if (pid === "zhipu") {
        const a = await zhipuAccount();
        if (a && (a.name || a.balance != null)) {
          log("webLogin", "✓ 抓到账号(zhipu cookie)", { name: a.name, balance: a.balance });
          // zhipuAccount 已把 JWT 存回 webToken，这里把 token 带回让 IPC handler 也存
          const s = loadSettings();
          const tok = s?.creds?.zhipu?.webToken;
          return finish({ name: a.name, avatar: a.avatar, token: tok });
        }
        if (tries % 8 === 0) log("webLogin", "zhipu 仍未取到(等登录 cookie)");
        return;
      }
      // Kimi Code 订阅：额度接口鉴权=Bearer JWT + 一整套 x-msh-* 头(在 SPA 内存里，localStorage 探测拿不全)。
      // 靠 onBeforeSendHeaders 捕获页面真实请求头存进 creds；这里等捕获到后用主进程 kimiUsage() 验证，成功即收工。
      if (pid === "kimi-sub") {
        const captured = !!loadSettings()?.creds?.["kimi-sub"]?.webHeaders?.Authorization;
        if (captured) {
          const u = await kimiUsage();
          if (u?.rateLimits) {
            log("webLogin", "✓ Kimi 额度打通(重放捕获头)", "5h=", u.rateLimits.primaryUsedPercent, "周=", u.rateLimits.secondaryUsedPercent);
            const tok = loadSettings()?.creds?.["kimi-sub"]?.webToken;
            return finish({ name: undefined, avatar: undefined, token: tok });
          }
          if (tries % 8 === 0) log("webLogin", "kimi 已捕获头但验证未通过，等页面刷新额度…");
        } else if (tries % 8 === 0) {
          log("webLogin", "kimi 等待登录/额度接口触发(捕获鉴权头中)…");
        }
        return;
      }
      try {
        const out: any = await w.webContents.executeJavaScript(probeJs, true);
        // 首轮记一次概况；之后只在成功/异常时记，避免刷屏
        if (tries === 1) log("webLogin", "探测中 候选token数=", out?.candN, out?.lsErr ? "lsErr=" + out.lsErr : "");
        for (const t of out?.tries || []) {
          if (t.error) {
            if (tries % 6 === 0) log("webLogin", "尝试出错", t.label, t.error);
            continue;
          }
          if (!t.dataNull && t.json) {
            const info = pickProfile(t.json);
            if (info) {
              log("webLogin", "✓ 抓到账号", { name: info.name, hasAvatar: !!info.avatar }, "via", t.label);
              return finish({ ...info, token: t.tok });
            }
          } else if (tries % 8 === 0) {
            log("webLogin", "仍未取到(等登录/token)", t.label, "code=", t.code, t.msg || "");
          }
        }
      } catch (e) {
        if (tries % 8 === 0) log("webLogin", "executeJavaScript 出错=", String(e));
      }
    }, 1500);
    w.on("closed", () => {
      log("webLogin", "窗口被关闭");
      finish(null);
    });
    const killer = setTimeout(() => {
      log("webLogin", "3 分钟超时兜底");
      finish(null);
    }, 180000);
  });
}

// 头像 URL → data: URI(CSP 只放行 self/data:，外链 img 加载不了)
async function toDataUri(url?: string): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const r = await fetch(url);
    if (!r.ok) return undefined;
    const buf = Buffer.from(await r.arrayBuffer());
    const mime = r.headers.get("content-type") || "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

// 用已存的 webToken + 分区 cookie 静默拉账号信息(不弹窗)；token 过期返回 "expired"
async function webAccountRefresh(
  pid: string,
): Promise<{ name?: string; avatar?: string } | "expired" | null> {
  const cfg = CONSOLE[pid];
  const s = loadSettings();
  const token = s?.creds?.[pid]?.webToken;
  if (!cfg || !token) return null;
  try {
    const ses = session.fromPartition("persist:login-" + pid);
    const cookies = await ses.cookies.get({ url: new URL(cfg.api).origin });
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const r = await fetch(cfg.api, {
      headers: {
        Authorization: "Bearer " + token,
        Cookie: cookieHeader,
        Accept: "application/json",
        "X-Client-Platform": "web",
        "X-Client-Bundle-Id": "com.deepseek.chat",
        "X-Client-Locale": "zh_CN",
      },
    });
    const j: any = await r.json().catch(() => null);
    const codes = [j?.code, j?.data?.code, j?.data?.biz_code];
    if (codes.includes(40003) || codes.includes(40002)) {
      log("webRefresh", pid, "token 已过期/失效");
      return "expired";
    }
    const info = pickProfile(j);
    log("webRefresh", pid, info ? "静默刷新成功 " + info.name : "未取到 profile");
    return info;
  } catch (e) {
    log("webRefresh", pid, "出错", String(e));
    return null;
  }
}

// 用存好的 token 后台静默刷新账号(不弹窗)；有变化就落盘+重发
async function silentRefreshAccount(pid: string) {
  if (pid === "kimi-sub") return; // kimi 额度是 POST 接口，由 emitAccount 的 kimiUsage() 处理，不走 GET profile
  const res = await webAccountRefresh(pid);
  if (!res || res === "expired") return; // 无 token/过期：保留已缓存的头像昵称
  const s = loadSettings();
  if (!s) return;
  const c = { ...(s.creds || {}) };
  const avatar = (await toDataUri(res.avatar)) || c[pid]?.avatar;
  c[pid] = { ...(c[pid] || {}), nickname: res.name || c[pid]?.nickname, avatar };
  saveSettings({ ...s, creds: c });
  void emitAccount();
}

// 账号信息随当前平台变化：Codex→ChatGPT邮箱；DeepSeek→余额；其它→是否填了key
// 当前平台 id（用于按平台读写订阅额度快照，避免串台）
function curProviderId(): string {
  const st = loadSettings();
  return st?.providerId || (loadConfig().provider === "codex" ? "codex" : "");
}
// 直连 Kimi（Moonshot）余额：用 API Key 调官方余额接口 {baseUrl}/users/me/balance（同一个 key）。
async function moonshotBalance(apiKey: string, baseUrl: string): Promise<{ total: number } | null> {
  try {
    const url = `${baseUrl.replace(/\/$/, "")}/users/me/balance`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: { available_balance?: number } };
    const bal = j?.data?.available_balance;
    return typeof bal === "number" ? { total: bal } : null;
  } catch (e) {
    log("moonshotBalance", "拉余额异常", String(e));
    return null;
  }
}
async function emitAccount() {
  const st = loadSettings();
  const pid = st?.providerId || (loadConfig().provider === "codex" ? "codex" : "");
  const nickname = st?.creds?.[pid]?.nickname || undefined;
  const avatar = st?.creds?.[pid]?.avatar || undefined;
  log("emitAccount", "平台=", pid, "昵称=", nickname || tr("acct.userInitial"), "头像=", avatar ? "有" : tr("acct.userInitial"));
  if (pid === "codex" || (!pid && !st)) {
    const a = getAccount();
    send("evt:account", {
      providerId: "codex",
      label: tr("ui.index.codex.subscription.9022217"),
      loggedIn: a.loggedIn,
      email: a.email,
      nickname,
      avatar,
    });
    const rl = loadRateLimits("codex"); // 上次的 Codex 订阅额度快照，切过来即显示（检测/发消息再刷新）
    if (rl) send("evt:ratelimits", rl);
    return;
  }
  if (pid === "claude-oauth") {
    const loggedIn = !!st?.oauthToken;
    // 账号来自 ~/.claude.json 的 oauthAccount(明文,Claude Code 自维护)：用户名/邮箱/套餐，零风险、总最新
    // (Claude 账号没有头像图，桌面版也是显示首字母，故 avatar 用默认首字母即可)
    const acct = readClaudeAccount();
    const nick = acct?.displayName || acct?.email || nickname;
    const plan = acct?.plan;
    log("claudeAcct", "用户=", nick || tr("acct.userInitial"), "套餐=", plan || tr("acct.userInitial"), "(来源 ~/.claude.json)");
    send("evt:account", {
      providerId: pid,
      label: plan ? `${tr("set.g.claudeSub")} · ${plan}` : tr("set.g.claudeSub"),
      loggedIn,
      email: acct?.email || null,
      nickname: nick,
      avatar,
    });
    if (plan) {
      const rl = loadRateLimits(pid) || {};
      send("evt:ratelimits", { ...rl, planType: plan }); // 套餐显示在订阅额度面板
    }
    return;
  }
  if (pid === "kimi-sub") {
    const loggedIn = !!st?.apiKey; // 订阅 key 决定能否对话
    // 额度走 www.kimi.com 网页会话(浏览器登录后 cookie/webToken)，与订阅 key 相互独立
    const u = await kimiUsage();
    const expired = u?.expired;
    send("evt:account", {
      providerId: pid,
      label: expired ? tr("ui.index.kimi.code.subscription.quota.login.expired.826643d") : tr("ui.index.kimi.code.subscription.6e91333"),
      loggedIn,
      email: null,
      nickname,
      avatar,
      expired,
    });
    if (u?.rateLimits) {
      saveRateLimits(pid, u.rateLimits); // 记住，下次打开直接显示
      send("evt:ratelimits", u.rateLimits);
    }
    return;
  }
  if (pid === "zhipu") {
    const loggedIn = !!st?.apiKey;
    // 本会话消耗按 token×GLM 单价当场算(智谱无公开余额 API，余额待扒控制台接口)
    const u = agents.get(currentId)?.getUsage();
    const model = loadConfig().model;
    const consumed = u
      ? tokenCost(glmPrice(model), {
          totalOutput: u.totalOutput,
          totalCacheHit: u.totalCacheHit ?? 0,
          totalCacheMiss: u.totalCacheMiss ?? Math.max(0, u.totalInput - (u.totalCacheHit ?? 0)),
        })
      : 0;
    // cookie + webToken 拉账号+余额；zhipuAccount 会自动把新 JWT 存回 webToken
    const acct = await zhipuAccount();
    let nick = nickname;
    let av = avatar;
    if (acct?.name || acct?.avatar) {
      nick = acct.name || nickname;
      av = (await toDataUri(acct.avatar)) || avatar;
      const s2 = loadSettings();
      if (s2) {
        const c = { ...(s2.creds || {}) };
        c[pid] = { ...(c[pid] || {}), nickname: acct.name || c[pid]?.nickname };
        saveSettings({ ...s2, creds: c });
      }
    }
    const total = acct?.balance;
    const expired = acct?.expired;
    log(
      "balance",
      "sid=", currentId.slice(0, 8),
      "zhipu model=", model,
      "余额=", total != null ? total.toFixed(4) : tr("acct.userInitial"),
      "expired=", expired || false,
      "本会话已消耗=", consumed.toFixed(4),
    );
    send("evt:account", {
      providerId: pid,
      label: expired ? tr("ui.index.zhipu.glm.login.expired.e366449") : tr("ui.index.zhipu.glm.214052b"),
      loggedIn,
      email: null,
      nickname: nick,
      avatar: av,
      balance: {
        currency: "CNY",
        consumed: consumed.toFixed(2),
        total: total != null ? total.toFixed(2) : undefined,
      },
      expired,
    });
    // token 过期时清掉失效的 webToken，避免反复用过期的 token 重试
    if (expired) {
      const s2 = loadSettings();
      if (s2?.creds?.zhipu?.webToken) {
        const c = { ...(s2.creds || {}) };
        c.zhipu = { ...(c.zhipu || {}), webToken: undefined };
        saveSettings({ ...s2, creds: c });
        log("zhipuAccount", "已清除失效的 webToken");
      }
    }
    return;
  }
  if (pid === "deepseek") {
    const loggedIn = !!st?.apiKey;
    send("evt:account", { providerId: pid, label: "DeepSeek", loggedIn, email: null, nickname, avatar });
    if (!loggedIn) return;
    const bal = await fetchDeepSeekBalance(st!.apiKey!);
    if (!bal) return;
    // 本会话消耗 = 累计 token × 官方单价(当场算，无余额延迟、跨会话不错配)
    const u = agents.get(currentId)?.getUsage();
    const model = loadConfig().model;
    const consumed = u
      ? dsCost(model, {
          totalOutput: u.totalOutput,
          totalCacheHit: u.totalCacheHit ?? 0,
          totalCacheMiss: u.totalCacheMiss ?? Math.max(0, u.totalInput - (u.totalCacheHit ?? 0)),
        })
      : 0;
    log(
      "balance",
      "sid=", currentId.slice(0, 8),
      "model=", model,
      "余额=", bal.total,
      "hit/miss/out=", `${u?.totalCacheHit ?? 0}/${u?.totalCacheMiss ?? 0}/${u?.totalOutput ?? 0}`,
      "本会话已消耗=", consumed.toFixed(4),
    );
    send("evt:account", {
      providerId: pid,
      label: "DeepSeek",
      loggedIn,
      email: null,
      nickname,
      avatar,
      balance: { total: bal.total, currency: bal.currency, consumed: consumed.toFixed(2) },
    });
    return;
  }
  if (pid === "kimi") {
    // 直连 Kimi（Moonshot）：用 API Key 拉官方余额（¥）显示；无 key 则只显示 token
    const loggedIn = !!st?.apiKey;
    if (!loggedIn) {
      send("evt:account", { providerId: pid, label: "Kimi", loggedIn, email: null, nickname, avatar });
      return;
    }
    const baseUrl = st?.creds?.["kimi"]?.baseUrl || loadConfig().baseUrl || "https://api.moonshot.cn/v1";
    const bal = await moonshotBalance(st.apiKey!, baseUrl);
    send("evt:account", {
      providerId: pid,
      label: "Kimi",
      loggedIn,
      email: null,
      nickname,
      avatar,
      balance: bal ? { total: bal.total.toFixed(2), currency: "CNY" } : undefined,
    });
    return;
  }
  send("evt:account", {
    providerId: pid,
    label: labelFor(loadConfig(), pid),
    loggedIn: !!st?.apiKey,
    email: null,
    nickname,
    avatar,
  });
}

// 脑网络说明的默认提示词(可在「知识网络」设置里查看/覆盖)。追加的『已沉淀概念』动态目录不含在内。
export const DEFAULT_BRAIN_NOTE =
  tr("agent.brainNote", {}, "zh");
// 英文版脑网络说明（跟随界面语言）
export const DEFAULT_BRAIN_NOTE_EN =
  tr("agent.brainNote", {}, "en");

// 构造系统提示词：优先本平台专属覆盖(creds[pid].systemPrompt)，再全局(settings.systemPrompt)，都没有=默认模板；渲染 {model}/{cwd}
function buildSysPrompt(cwd: string, model: string, providerId?: string): string {
  const st = loadSettings();
  const lang = st?.app?.lang || detectSysLang(); // 未手动设过→按系统语言
  const override = providerId ? st?.creds?.[providerId]?.systemPrompt : undefined;
  const custom = typeof override === "string" ? override : st?.systemPrompt;
  let base = typeof custom === "string" ? renderPrompt(custom, cwd, model) : systemPrompt(cwd, model, lang);
  // 记忆：始终告知可用 remember 工具，并附上已记住的内容(跨会话)
  const mem = loadMemory().trim();
  base +=
    tr("ui.index.long.term.memory.when.the.user.82e3dcd");
  if (mem) base += tr("ui.index.remembered.follow.refer.to.actively.f5690b5", { p0: mem });
  // 本地知识网络（Brain）：概念化的项目/部署知识，按需 recall；提示词可在设置里覆盖。
  // 关掉「脑网络」或非会员：不注入说明、不追加概念目录(brain_* 工具也在别处一并停掉)。
  if (brainAvailable(st)) {
    base += typeof st?.brainPrompt === "string" ? st.brainPrompt : tr("agent.brainNote", {}, lang);
    try {
      const idx = brain.conceptIndex(40);
      // 这段拼在系统提示里，中文会把英文用户的回复语言也带偏，跟着 lang 走
      if (idx.length)
        base +=
          tr("ui.index.concepts.already.stored.expand.with.brain.a98ba5c", { p0: (lang !== "zh" ? idx.join(", ") : idx.join("、")) });
    } catch {
      /* brain 不可用不影响主流程 */
    }
  }
  // 密钥说明：告知模型密钥走本地保险箱/环境变量，无需明文；提示词可在设置里覆盖
  base += typeof st?.secretsPrompt === "string" ? st.secretsPrompt : secrets.secretsSystemNote(lang);
  // 与用户交互：需要用户拍板时必须弹选择框(强引导，否则模型习惯用文字罗列)
  base +=
    tr("ui.index.interacting.with.the.user.must.follow.4295d0e");
  return base;
}

// 把「扫描相关文档」开关同步到 brain 模块(recall 据此决定是否连带扫文档冷存储)
function syncBrainDocsFlag(st: Settings | null) {
  try {
    brain.setDocsEnabled(brainDocsEnabled(st));
  } catch {
    /* brain 不可用不影响主流程 */
  }
}

// 给 web_search 工具(同进程共享代码)一个「永远最新」的无为登录 token 取值桥，
// 用于调无为网关搜索代理(/api/gateway/v1/search)。懒读 session，无需在每个登录/登出点同步。
(globalThis as unknown as { wuweiGwToken?: () => string }).wuweiGwToken = () => {
  try { return loadWuweiSession()?.accessToken || ""; } catch { return ""; }
};

function initProvider() {
  cwd = process.cwd();
  const st = loadSettings();
  applyEnvFromSettings(st); // 有已保存设置则据此，否则自动推断
  syncBrainDocsFlag(st);
  const cfg = loadConfig();
  provider = makeProvider(cfg);
  modelLabel = cfg.model;
  ctxWindow = cfg.contextWindow;
  sysPrompt = buildSysPrompt(cwd, modelLabel, st?.providerId);
  agentOpts = {
    compactThreshold: st?.compactThreshold && st.compactThreshold > 0 ? st.compactThreshold : process.env.MINICC_COMPACT_THRESHOLD ? cfg.compactThreshold : undefined,
    compactMsgThreshold: st?.compactMsgThreshold && st.compactMsgThreshold > 0 ? st.compactMsgThreshold : 0,
    keepRecent: st?.keepRecent && st.keepRecent > 0 ? st.keepRecent : cfg.keepRecentTurns,
  };
  backendLabel = labelFor(cfg, st?.providerId);
  subFlag = isSub(st?.providerId) || (!st && cfg.provider === "codex");
}

// 运行时切换模型后端：保存设置、重建 provider、更新所有会话 Agent。
// forceSid：用户在底栏「显式切换」当前会话的平台/模型时传当前会话 id —— 该会话即使正在跑/智能继续
// 也强制换 provider(否则它会继续用旧平台，出现"选了 Claude 订阅却还扣无为币"的 bug)；其余正在跑的会话仍不动。
function applySettings(sIn: Settings, forceSid?: string) {
  // 合并到磁盘现有配置:调用方只需传自己要改的字段,其余(会话提醒/保留条数/输出方式/主题/app 等
  // 各走独立 IPC 存的设置)一律保留、不被整体替换覆盖。显式传 undefined 仍可清字段(切平台清 key 用)。
  const prev: Partial<Settings> = loadSettings() || {};
  const s: Settings = { ...prev, ...sIn };
  log("applySettings", "平台=", s.providerId, "模型=", s.model, "有key=", !!s.apiKey);
  // 诊断日志：切平台/模型 关键节点(不含 key)
  try { void trackClientLog("info", "action", { version: app.getVersion(), accessToken: loadWuweiSession()?.accessToken ?? null, meta: { node: "switch_model", provider: s.providerId, model: s.model, forced: !!forceSid } }); } catch { /* ignore */ }
  saveSettings(s);
  applyEnvFromSettings(s);
  syncBrainDocsFlag(s);
  const cfg = loadConfig();
  provider = makeProvider(cfg);
  backendLabel = labelFor(cfg, s.providerId);
  modelLabel = cfg.model;
  ctxWindow = cfg.contextWindow;
  subFlag = isSub(s.providerId);
  sysPrompt = buildSysPrompt(cwd, modelLabel, s.providerId); // 底层模型/自定义提示词变了都同步
  // 压缩阈值跟着模型走：留空(自动)时它是「当前模型上下文 × 80%」，换模型就该重算。
  // 原来只在启动时算一次 → 启动时用 200k 的模型、中途切到 1M 的，阈值还卡在旧的 16 万，
  // 长会话十几万 token 就被压掉。用户显式填过的阈值/条数优先，不被自动值覆盖。
  agentOpts = {
    compactThreshold: s?.compactThreshold && s.compactThreshold > 0 ? s.compactThreshold : process.env.MINICC_COMPACT_THRESHOLD ? cfg.compactThreshold : undefined,
    compactMsgThreshold: s?.compactMsgThreshold && s.compactMsgThreshold > 0 ? s.compactMsgThreshold : 0,
    keepRecent: s?.keepRecent && s.keepRecent > 0 ? s.keepRecent : cfg.keepRecentTurns,
  };
  // 自动阈值属于各会话自己的 provider；只更新本次切换目标，避免跨会话污染。
  // 判定本次是否只是"同平台同模型的凭证刷新"(token/key 变了、模型没变)。这种情况下连正在跑的会话也
  // 必须换上带新 token 的 provider——否则 token 过期被清空后重新授权,那个正在重试的会话永远拿不到新
  // token,会一直报"未授权"(且"总结交接"也在该会话里跑→同样失败)。真正切模型/平台时不在此列。
  const sameBackend =
    (prev.providerId || "") === (s.providerId || "") && (prev.model || "") === (s.model || "");
  const credChanged =
    (prev.oauthToken || "") !== (s.oauthToken || "") || (prev.apiKey || "") !== (s.apiKey || "");
  const credRefreshOnly = sameBackend && credChanged;
  // 完全独立：切平台/模型只作用于「目标会话」——用户当前聚焦或显式切换(forceSid，settings:set 恒传 currentId)的
  // 那一个。其余会话(无论空闲还是正在跑)绝不被动它们的 provider，各自守着自己的平台/模型跑各自的任务。
  const target = forceSid || currentId;
  const newPid = s.providerId || "";
  for (const [sid, a] of agents) {
    if (sid === target) {
      a.setProvider(provider);
      a.setCompactOpts(agentOpts);
      a.setSystem(sysForSession(sid)); // 热更该会话系统提示；绑员工则保留人格（问模型也答对）
      backendBySid.set(sid, newPid); // 目标会话的后端随之更新
      continue;
    }
    // 例外：纯凭证刷新(同平台同模型、只是 token/key 变)时，把新 token 热更给「同一后端」的其它会话——
    // 同账号多开时，别处刷新了 token，这些会话也得拿到新 token，否则会一直报"未授权"。仅换 token、不动模型/提示。
    if (credRefreshOnly && backendBySid.get(sid) === newPid) a.setProvider(provider);
    // 其余(不同后端 / 非凭证刷新)一律不碰：这正是"在别的会话切平台/模型不影响这个正在跑的会话"的保证。
  }
  // 方案B：把「聚焦会话改后的完整身份」立即持久化进它自己的 meta——每次改模型/切平台即写入，
  // 不再依赖离开时的 lockSessionModel 补锁。之后 providerForSession 就能凭它精确重建该会话 provider。
  if (target) setSessionBinding(target, { model: s.model, providerId: s.providerId, kind: s.kind, baseUrl: s.baseUrl });
  refreshAgentTools(); // 「知识网络」开关变了→即时给所有会话加/摘 brain_* 工具
  send("evt:ready", { backend: backendLabel, model: modelLabel, cwd, sub: subFlag, ctxWindow });
  void emitAccount(); // 切平台后左下角账号/余额随之更新
  if (s.providerId) void silentRefreshAccount(s.providerId); // 用存的 token 静默刷新，无需重登
}

// Claude 订阅 OAuth：token 快过期时用 refresh_token 静默续期，避免请求报 401「token expired/invalid」。
// 只动 app 自己的 token(settings.oauthToken + sidecar 文件)，绝不碰 ~/.claude.json（避免搞挂 Claude Code 登录）。
// 老用户(有 oauthToken 但无 sidecar/refresh) → 不动，手动重登一次后即自动续期。
let refreshingClaude: Promise<void> | null = null;
// 确认已过期且救不回来 → 把失效 token 从设置里清掉。
// 留着它只会让每次请求都撞 401「授权过期」，用户还得自己去设置里点 × 清空；
// 清掉后界面会提示重新授权，配了 API Key 的则自动回落到 Key。
function clearDeadClaudeOAuth(why: string): void {
  const s = loadSettings();
  if (!s) return;
  const slot = s.creds?.["claude-oauth"];
  if (!s.oauthToken && !slot?.oauthToken) return; // 已经清过，别重复通知
  log("claudeOAuth", "token 已过期且无法续期(", why, ") → 清除失效 token");
  s.oauthToken = undefined;
  if (slot) slot.oauthToken = undefined;
  saveSettings(s);
  applyEnvFromSettings(s);
  provider = makeProvider(loadConfig());
  // 只热更「绑在 Claude 订阅」的会话——别把清 token 后重建的 provider 塞给别的平台会话，破坏独立性。
  for (const [sid, a] of agents) if (backendBySid.get(sid) === "claude-oauth") a.setProvider(provider);
  send("evt:error", {
    message: tr("ui.index.your.claude.subscription.authorization.expired.the.fb36f89"),
  });
}
// 这个错误是不是「OAuth token 已失效」——只认鉴权类信号，别把限流/余额/网络错误也当成失效把 token 清了
function isOAuthDead(e: any): boolean {
  const status = Number(e?.status || 0);
  const msg = String(e?.message || e || "").toLowerCase();
  if (status === 401 || status === 403) return true;
  return /\b401\b|invalid[_ ]?token|token (has )?expired|oauth token (expired|revoked|invalid)|unauthorized/.test(msg);
}
async function ensureFreshClaudeOAuth(force = false): Promise<void> {
  const st = loadSettings();
  if (!st || st.kind !== "anthropic-oauth") return;
  if (!claudeAutoRefreshEnabled(st)) return; // 用户关了自动续期(保护本机 claude CLI 登录)→不续
  const auth = loadClaudeAuth();
  // 自愈：settings 里 token 丢了(被 clearDeadClaudeOAuth 误清、它只清 settings 没动 sidecar)但 sidecar
  // 里的 access token 仍未过期 → 直接补回 settings + 热更会话，避免用户对着有效凭证却被要求重新登录。
  const settingsHasToken = !!(st.oauthToken || st.creds?.["claude-oauth"]?.oauthToken);
  if (!settingsHasToken && auth?.accessToken && auth.expiresAt && auth.expiresAt > Date.now()) {
    st.oauthToken = auth.accessToken;
    if (st.creds?.["claude-oauth"]) st.creds["claude-oauth"].oauthToken = auth.accessToken;
    saveSettings(st);
    applyEnvFromSettings(st);
    provider = makeProvider(loadConfig());
    for (const [sid, a] of agents) if (backendBySid.get(sid) === "claude-oauth") a.setProvider(provider);
    log("claudeOAuth", "settings token 缺失但 sidecar 未过期 → 已自动补回并热更会话");
  }
  if (!auth?.refreshToken || !auth.expiresAt) {
    // 无 refresh/过期信息(老用户或 sidecar 丢失)：能判定已过期就清掉，否则交给手动重登
    if (auth?.expiresAt && auth.expiresAt <= Date.now()) clearDeadClaudeOAuth("no-refresh-token");
    return;
  }
  if (!force && auth.expiresAt - Date.now() > 5 * 60 * 1000) return; // 还有 >5 分钟 且非强制 → 无需续期
  if (refreshingClaude) return refreshingClaude; // 合并并发，避免同一时刻多次刷新
  refreshingClaude = (async () => {
    try {
      log("claudeOAuth", "token 将过期，静默续期…");
      const r = await claudeOAuthRefresh(auth.refreshToken!); // 内部已把新值写回 sidecar
      if (!r?.token) {
        // 已过期才清：网络抖动导致的临时续期失败(尚未过期)保留旧 token，下次再试
        if (auth.expiresAt! <= Date.now()) clearDeadClaudeOAuth("refresh-failed");
        else log("claudeOAuth", "续期失败但尚未过期，保留旧 token，稍后重试");
        return;
      }
      const s = loadSettings();
      if (!s) return;
      s.oauthToken = r.token;
      if (s.creds?.["claude-oauth"]) s.creds["claude-oauth"].oauthToken = r.token;
      saveSettings(s);
      applyEnvFromSettings(s);
      provider = makeProvider(loadConfig());
      // 续期只热更「绑在 Claude 订阅」的会话，用新 token；别的平台会话保持独立、绝不被换成 Claude。
      for (const [sid, a] of agents) if (backendBySid.get(sid) === "claude-oauth") a.setProvider(provider);
      log("claudeOAuth", "✓ 已续期并热更 Claude 订阅会话 provider");
      // 续期成功 → 刷新左下角账号；当前正看着 Claude 订阅会话则触发连通/账号复检，
      // 让边缘情况(app 关着跨过期、重开那一下)的黄灯自动转绿，不用等下一条请求。
      void emitAccount();
      if (currentId && backendBySid.get(currentId) === "claude-oauth") {
        send("evt:ready", { backend: backendLabel, model: modelLabel, cwd, sub: subFlag, ctxWindow });
        void silentRefreshAccount("claude-oauth");
      }
    } finally {
      refreshingClaude = null;
    }
  })();
  return refreshingClaude;
}

// 按 token 过期时间排「一次性」续期：过期前 3 分钟触发续期，续好后按新到期时间重排。
// 不轮询、不频繁打续期接口——一个 token 生命周期内只调一次续期。无 sidecar(refresh_token) 则不排期。
let claudeRefreshTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleClaudeRefresh(): void {
  if (claudeRefreshTimer) { clearTimeout(claudeRefreshTimer); claudeRefreshTimer = null; }
  const st = loadSettings();
  if (!st || st.kind !== "anthropic-oauth") return;
  if (!claudeAutoRefreshEnabled(st)) return; // 用户关了自动续期→不排期
  const auth = loadClaudeAuth();
  if (!auth?.refreshToken || !auth.expiresAt) return; // 老 token 无 refresh/过期信息 → 不排期，靠请求前兜底或手动重登一次
  const BUFFER = 3 * 60 * 1000; // 提前 3 分钟续
  const delay = Math.min(Math.max(0, auth.expiresAt - Date.now() - BUFFER), 2_000_000_000); // 夹在 setTimeout 32bit 上限内
  claudeRefreshTimer = setTimeout(() => {
    void (async () => { await ensureFreshClaudeOAuth().catch(() => {}); scheduleClaudeRefresh(); })(); // 续好后按新到期时间重排
  }, delay);
  log("claudeOAuth", `续期已排期：${Math.round(delay / 1000)}s 后触发（token 约 ${new Date(auth.expiresAt).toISOString()} 过期）`);
}

// —— 浏览器控制：Electron 内置 Chromium 的 WebContentsView，可嵌入主窗口面板"可视化" AI 操作 ——
let browserView: WebContentsView | null = null;
let browserAttached = false;
function emitBrowser() {
  if (!browserView || browserView.webContents.isDestroyed()) return;
  const wc = browserView.webContents;
  send("evt:browser", {
    url: wc.getURL(),
    title: wc.getTitle(),
    loading: wc.isLoading(),
    canGoBack: wc.navigationHistory.canGoBack(),
    canGoForward: wc.navigationHistory.canGoForward(),
  });
}
function getBrowserView(): WebContentsView {
  if (browserView && !browserView.webContents.isDestroyed()) return browserView;
  browserView = new WebContentsView({ webPreferences: { partition: "persist:agent-browser" } }); // cookie 持久
  const wc = browserView.webContents;
  for (const ev of [
    "did-navigate",
    "did-navigate-in-page",
    "page-title-updated",
    "did-start-loading",
    "did-stop-loading",
  ] as const) {
    wc.on(ev as any, () => emitBrowser());
  }
  return browserView;
}
function browserExec(js: string): Promise<unknown> {
  return getBrowserView().webContents.executeJavaScript(js, true);
}
// 让前端把浏览器面板打开(AI 一开网页你就能看到它在干嘛)
function requestShowBrowser() {
  send("evt:browser-activity");
}
const browserOpenTool: Tool = {
  name: "browser_open",
  get description() { return tr("tool.description.browser_open"); },
  readOnly: true,
  inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
  async run(input): Promise<ToolResult> {
    try {
      const url = String(input.url || "");
      if (!/^https?:\/\//i.test(url)) return { content: tr("ui.index.url.must.start.with.http.https.5effd76"), isError: true };
      const wc = getBrowserView().webContents;
      requestShowBrowser(); // 让前端弹出浏览器面板，用户可实时看
      try {
        await wc.loadURL(url);
      } catch (e: any) {
        // 部分重定向会抛 ERR_ABORTED 但页面其实已加载→已导航就当成功
        if (!wc.getURL() || wc.getURL() === "about:blank") throw e;
      }
      return {
        content: tr("ui.index.opened.use.browser.read.for.text.0a36486", { p0: wc.getTitle(), p1: wc.getURL() }),
      };
    } catch (e: any) {
      return { content: tr("ui.index.open.failed.b0262bc", { p0: e.message }), isError: true };
    }
  },
};
const browserReadTool: Tool = {
  name: "browser_read",
  get description() { return tr("tool.description.browser_read"); },
  readOnly: true,
  inputSchema: { type: "object", properties: {} },
  async run(): Promise<ToolResult> {
    try {
      const text = String((await browserExec("document.body ? document.body.innerText : ''")) || "");
      const max = 12000;
      const t = text.trim();
      return { content: (t.length > max ? t.slice(0, max) + tr("ui.index.truncated.chars.total.13a3349", { p0: t.length }) : t) || tr("ui.index.no.page.text.00cf453") };
    } catch (e: any) {
      return { content: tr("ui.index.read.failed.maybe.browser.open.wasn.5a0d39b", { p0: e.message }), isError: true };
    }
  },
};
const browserClickTool: Tool = {
  name: "browser_click",
  get description() { return tr("tool.description.browser_click"); },
  readOnly: false,
  get inputSchema() { return {
    type: "object",
    properties: { selector: { type: "string", description: tr("tool.parameter.browser_click.selector") } },
    required: ["selector"],
  }; },
  async run(input): Promise<ToolResult> {
    try {
      const sel = String(input.selector || "");
      const r = await browserExec(
        `(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)return 'NOT_FOUND';el.scrollIntoView();el.click();return 'OK';})()`,
      );
      return r === "OK" ? { content: tr("ui.index.clicked.858f52e", { p0: sel }) } : { content: tr("ui.index.element.not.found.9e56851", { p0: sel }), isError: true };
    } catch (e: any) {
      return { content: tr("ui.index.click.failed.ba0bca0", { p0: e.message }), isError: true };
    }
  },
};
const BROWSER_TOOLS: Tool[] = [browserOpenTool, browserReadTool, browserClickTool];

// CEO 把关：解析当前 CEO 员工 id。优先一人公司设置里指定的，否则自动识别(职位含 CEO / 名叫小笨)。
function resolveCeoId(): string | null {
  const emps = loadEmployees();
  const cfgId = loadTeamConfig().ceoEmployeeId;
  if (cfgId && emps.some((e) => e.id === cfgId)) return cfgId;
  const byTitle = emps.find((e) => /ceo/i.test(e.title || ""));
  if (byTitle) return byTitle.id;
  return resolveEmployee(emps, "wj-ceo")?.id || resolveEmployee(emps, tr("team.default.wj-ceo.name"))?.id || null;
}

// 把关链：员工请示(ask_user)先问谁、再问谁。顺序 = 本部门负责人(若 self 在某部门且自己不是负责人) → 公司 CEO。
// 每一层能定就短路、定不了才往上；全都上报才弹给董事长。去重、排除 self。
function resolveGatekeepers(selfId: string): string[] {
  const chain: string[] = [];
  const myDept = loadDepartments().find((d) => (d.memberIds || []).includes(selfId));
  if (myDept?.headId && myDept.headId !== selfId) chain.push(myDept.headId); // 先找本部门负责人
  const ceoId = resolveCeoId();
  if (ceoId && ceoId !== selfId && !chain.includes(ceoId)) chain.push(ceoId); // 再找公司 CEO
  return chain;
}

// CEO 把关：把员工的请示同步交给 CEO 拍板，但只给 timeoutSec 秒——到点没拍板就当「上报董事长」兜底(不干等)。
// 返回 {escalate, text, timedOut}——escalate=true 表示该弹给董事长；timedOut=true 区分「CEO 超时没拍」与「CEO 主动上报」。
async function askCeoDecision(
  ceoId: string,
  askerName: string,
  questions: any[],
  timeoutSec: number,
  signal?: AbortSignal,
): Promise<{ escalate: boolean; text: string; timedOut: boolean }> {
  const ceo = loadEmployees().find((e) => e.id === ceoId);
  if (!ceo) return { escalate: true, text: "", timedOut: false };
  const qtext = questions
    .map((q: any, i: number) => `${i + 1}. ${q.question}\n   可选：${(q.options || []).map((o: any) => o.label).join(" | ")}${q.multiSelect ? "（可多选）" : ""}`)
    .join("\n");
  const input = getCurrentLanguage() !== "zh"
    ? `You are the company CEO. A teammate requests a decision. Choose from the provided options and give a brief reason. If the chair must decide, reply only ESCALATE: <reason>.

${qtext}`
    : `你是公司 CEO。团队成员「${askerName}」请求拍板。能决定请从选项中选择并说明理由；必须董事长决定时只回复 ESCALATE：<原因>。

${qtext}`;
  const sys = buildEmployeeSystem(ceo, sysPrompt, loadEmployeeMemory(ceo.id), "## 当前场景\n\n你在做 CEO 把关：下属把需要拍板的选择请示到你这。能定就定、定不了才上报董事长。别反问下属，直接给结论或 ESCALATE。");
  // 倒计时：到点就 abort 掉 CEO 这一轮，当「没拍板」上报董事长。父级(员工会话)被取消也一起中止。
  const ac = new AbortController();
  const onParentAbort = () => ac.abort();
  if (signal) { if (signal.aborted) ac.abort(); else signal.addEventListener("abort", onParentAbort); }
  const timer = setTimeout(() => ac.abort(), Math.max(1, timeoutSec) * 1000);
  let out = "";
  try {
    out = await runEmployeeTurn({ employee: ceo, sys, history: [], input, signal: ac.signal, excludeTools: ["ask_user", "dm_teammate", "assign_task"] });
  } catch {
    // 超时被 abort / CEO 跑挂了 → 都上报董事长兜底。timedOut 用于给弹窗一句更贴切的理由。
    return { escalate: true, text: "", timedOut: ac.signal.aborted && !(signal?.aborted) };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onParentAbort);
  }
  return { escalate: /(^|\n)\s*ESCALATE\s*[:：]/i.test(out), text: (out || "").trim(), timedOut: false };
}

// ask_user：让 AI 弹出可点击的选择框(单选/多选/可多问)，暂停等用户点选后把选择回传。
// 走「暂停-回传」范式(同权限确认)：run 返回 Promise 挂 pendingAsk，前端选完 ipc 回来 resolve。
const askUserTool: Tool = {
  name: "ask_user",
  get description() { return tr("tool.description.ask_user"); },
  readOnly: true,
  get inputSchema() { return {
    type: "object",
    properties: {
      questions: {
        type: "array",
        description: tr("tool.parameter.ask_user.questions"),
        items: {
          type: "object",
          properties: {
            question: { type: "string", description: tr("tool.parameter.ask_user.question") },
            header: { type: "string", description: tr("tool.parameter.ask_user.header") },
            multiSelect: { type: "boolean", description: tr("tool.parameter.ask_user.multiSelect") },
            options: {
              type: "array",
              description: tr("tool.parameter.ask_user.options"),
              items: {
                type: "object",
                properties: {
                  label: { type: "string", description: tr("tool.parameter.ask_user.label") },
                  description: { type: "string", description: tr("tool.parameter.ask_user.description") },
                },
                required: ["label"],
              },
            },
          },
          required: ["question", "options"],
        },
      },
    },
    required: ["questions"],
  }; },
  async run(input, ctx): Promise<ToolResult> {
    let questions = Array.isArray((input as any).questions) ? (input as any).questions : [];
    if (!questions.length) return { content: tr("ui.index.ask.user.needs.at.least.one.a5c3295"), isError: true };

    // Remote runs must never disappear into the desktop-only legacy ask_user dialog.
    if (ctx.remoteExecution?.requestDecision) {
      const replies: string[] = [];
      for (const question of questions) {
        const options = (Array.isArray(question.options) ? question.options : []).map((option: any, i: number) => ({ label: String(option.label || tr("ui.index.message.c9230e4570", {p0: i + 1})), value: `option_${i}`, desc: typeof option.description === 'string' ? option.description : undefined }));
        if (!options.length) return { content: tr("ui.index.message.bb4e9548ea"), isError: true };
        const answer = await ctx.remoteExecution.requestDecision({ permId: randomUUID(), title: question.header || '需要你决定', question: String(question.question || tr("ui.index.message.0591cbc601")) + (question.multiSelect ? tr("ui.index.message.d773fdcc6d") : ''), risk: 'high', options, allowCustom: true, timeoutSec: null });
        if (answer.action === 'deny') return { content: tr("ui.index.message.24beb7459c") };
        replies.push(`${question.question} → ${answer.text || options.find((option: { value: string }) => option.value === answer.value)?.label || answer.value || answer.action}`);
      }
      return { content: tr("ui.index.message.7661439b60", {p0: replies.join('\n')}) };
    }

    // ⭐逐级把关：员工请示 → 先问本部门负责人(若有)、再问公司 CEO；哪一级能定就当场替员工拍板、不惊动上面；
    // 一级拿不准(回 ESCALATE / 超时)就往上一级问；全都上报才弹给董事长(下面的人类弹窗)，并把最上一级的理由带进弹窗。
    const self = ctx.employeeId;
    if (self && teamEnabled(loadSettings())) {
      const chain = resolveGatekeepers(self);
      if (chain.length) {
        const emps = loadEmployees();
        const askerName = emps.find((e) => e.id === self)?.name || tr("ui.index.message.1aaf07d335");
        const ceoSec = Math.min(60, Math.max(3, Math.round(loadTeamConfig().ceoDecideTimeoutSec ?? 10) || 10));
        const gateSid = ctx.sessionId || turnSid;
        const roleOf = (gkId: string, idx: number) => {
          // 这一级把关人是「部门负责人」还是「CEO」——用于提示与弹窗措辞。
          const myDept = loadDepartments().find((d) => (d.memberIds || []).includes(self) && d.headId === gkId);
          return myDept ? tr("ui.index.head.0316689", { p0: myDept.name }) : "CEO";
        };
        let lastName = "";
        let lastReason = "";
        for (let i = 0; i < chain.length; i++) {
          const gkId = chain[i];
          const gkName = emps.find((e) => e.id === gkId)?.name || roleOf(gkId, i);
          const gkRole = roleOf(gkId, i);
          // 前端弹「🧑‍💼 X 拍板中… Ns」可见倒计时提示，让董事长知道现在是这一级在定、不是卡住。
          send("evt:ceo-deciding", { sid: gateSid, ceoName: gkName, askerName, sec: ceoSec });
          let d: { escalate: boolean; text: string; timedOut: boolean };
          try {
            d = await askCeoDecision(gkId, askerName, questions, ceoSec, ctx.signal);
          } finally {
            send("evt:ceo-deciding", { sid: gateSid, done: true });
          }
          if (d.text && !d.escalate) {
            return { content: tr("ui.index.asked.decision.d4a45cc", { p0: gkRole, p1: gkName, p2: d.text }) };
          }
          // 这一级上报/超时 → 记下理由，继续问更上一级；是最后一级就落到董事长。
          lastName = gkName;
          lastReason = d.timedOut
            ? tr("ui.index.message.c8e303021e", {p0: gkRole, p1: gkName, p2: ceoSec})
            : (d.text.replace(/[\s\S]*?ESCALATE\s*[:：]\s*/i, "").trim() || d.text || tr("ui.index.message.8880344b95", {p0: gkRole, p1: gkName}));
        }
        if (lastReason && questions[0]) {
          questions = questions.map((q: any, i: number) => (i === 0 ? { ...q, question: tr("ui.index.message.2fc768fb80", {p0: lastName, p1: lastReason, p2: q.question}) } : q));
        }
      }
    }

    const id = ++askSeq;
    // 绑定到「执行本工具的会话」——用 ctx.sessionId(每个 Agent 自带)，不是全局 turnSid。
    // 多会话并发时 turnSid 会被最后派发的会话覆盖，导致弹窗/通知指向错的会话。
    const askSid = ctx.sessionId || turnSid;
    const answers: any = await new Promise((resolve) => {
      pendingAsk.set(id, resolve);
      pendingAskSid.set(id, askSid);
      send("evt:ask-user", { sid: askSid, id, questions });
    });
    if (!answers || answers.cancelled) return { content: tr("ui.index.user.cancelled.the.selection.no.answer.424eefe") };
    const list: { selected?: string[]; text?: string }[] = answers.list || [];
    const lines = questions.map((q: any, i: number) => {
      const a = list[i] || {};
      const parts = [...(a.selected || [])];
      if (a.text) parts.push(a.text); // 用户在「其它」里填的自由文本
      return `${i + 1}. ${q.question} → ${parts.length ? parts.join(tr("ui.index.text.6486d4e")) : tr("ui.index.no.selection.7bb79c6")}`;
    });
    return { content: tr("ui.index.user.selections.41dad3e") + lines.join("\n") };
  },
};

// dm_teammate：让当前员工给另一名员工发一条私信并同步等回复（员工↔员工私聊）。
// 走「阻塞等结果」范式（同 ask_user）：run 里 await runDmTurn 把目标员工跑一轮，拿到回复作为工具结果返回发起方。
// 防递归：runDmTurn 跑目标那一轮会剔掉 dm_teammate，目标不能在回信里再私信别人（见 orchestrator）。
const dmTeammateTool: Tool = {
  name: "dm_teammate",
  get description() { return tr("tool.description.dm_teammate"); },
  readOnly: false,
  get inputSchema() { return {
    type: "object",
    properties: {
      name: { type: "string", description: tr("tool.parameter.dm_teammate.name") },
      message: { type: "string", description: tr("tool.parameter.dm_teammate.message") },
    },
    required: ["name", "message"],
  }; },
  async run(input, ctx): Promise<ToolResult> {
    const selfId = ctx.employeeId;
    if (!selfId) {
      return { content: tr("ui.index.dm.teammate.can.only.be.used.faae5a1"), isError: true };
    }
    const name = String((input as any).name || "").trim();
    const message = String((input as any).message || "").trim();
    if (!name || !message) {
      return { content: tr("ui.index.both.name.teammate.and.message.are.8f8236e"), isError: true };
    }

    const all = loadEmployees();
    const self = all.find((e) => e.id === selfId);
    const selfName = self?.name || selfId;
    // 「停用」= 所属应用被停用（与选人列表同义）；用户自建员工（无 fromApp）永不停用。
    const disabledApps = new Set(loadApps().filter((a) => a.disabled).map((a) => a.id));
    const available = all.filter((e) => e.id !== selfId && !(e.fromApp && disabledApps.has(e.fromApp)));

    const target = resolveEmployee(available, name);
    if (!target) {
      const roster = employeeRoster(available, getCurrentLanguage() !== "zh" ? "en" : "zh") || tr("ui.index.no.other.teammates.available.a5dcd04");
      return { content: tr("ui.index.no.teammate.named.teammates.cfaf909", { p0: name, p1: roster }), isError: true };
    }

    const dm = findOrCreateDm(selfId, target.id, [selfName, target.name]);
    // 广播房间列表：新建的这条 DM 要立刻进两边员工的侧栏镜像子列表（teamRooms 靠 evt:team-rooms 更新）。
    send("evt:team-rooms", { rooms: loadRooms() });
    // 先把发起方这条消息落进私聊并广播，让界面立刻看到「我发了什么」
    const msgs = appendDmMessage(dm.id, { speaker: { id: selfId, name: selfName, kind: "agent" }, text: message });
    send("evt:team-room", { roomId: dm.id, messages: msgs, running: true });
    // 同步跑目标员工一轮拿回复回给发起方（走直连+runDmTurn 的 running 守卫，天然防「A↔B 互 dm」死锁）。
    // 深度+1：限制转派链长(小笨→小码→小美)、防无限套娃。要「派活不等他做完」用 assign_task。
    const reply = await runDmTurn(dm.id, target.id, message, teamOrchestratorDeps(ctx), (ctx.dmDepth ?? 0) + 1,
      { taskReportScope: ctx.taskReportScope });
    return { content: tr("ui.index.replied.9993b71", { p0: employeeLabel(target, getCurrentLanguage() !== "zh" ? "en" : "zh"), p1: reply }) };
  },
};

// assign_task：给另一名员工【派活】——把一件任务交出去，不等他做完自己就接着做别的（异步·派完就走）。
// 与 dm_teammate 的区别：dm_teammate 同步等对方这一句答复（问事/对齐/验收用）；assign_task 不等，
// 把活排进对方的队列，做完结果落在你俩私聊里。对方在忙就排队，priority=urgent 插到他队列最前(不打断正在跑的)。
const assignTaskTool: Tool = {
  name: "assign_task",
  get description() { return tr("tool.description.assign_task"); },
  readOnly: false,
  get inputSchema() { return {
    type: "object",
    properties: {
      name: { type: "string", description: tr("tool.parameter.assign_task.name") },
      task: { type: "string", description: tr("tool.parameter.assign_task.task") },
      priority: { type: "string", enum: ["normal", "urgent"], description: tr("tool.parameter.assign_task.priority") },
    },
    required: ["name", "task"],
  }; },
  async run(input, ctx): Promise<ToolResult> {
    const selfId = ctx.employeeId;
    if (!selfId) {
      return { content: tr("ui.index.assign.task.can.only.be.used.42bb1be"), isError: true };
    }
    const name = String((input as any).name || "").trim();
    const task = String((input as any).task || "").trim();
    const urgent = String((input as any).priority || "normal").trim() === "urgent";
    if (!name || !task) {
      return { content: tr("ui.index.both.name.teammate.and.task.are.d5e5da4"), isError: true };
    }
    if (!ctx.taskReportScope && (!ctx.turnId || (!ctx.reportOrigin && !ctx.sessionId))) {
      return { content: '当前任务缺少可回传的会话，未派发。请在员工会话中重新交代。', isError: true };
    }

    const all = loadEmployees();
    const self = all.find((e) => e.id === selfId);
    const selfName = self?.name || selfId;
    const disabledApps = new Set(loadApps().filter((a) => a.disabled).map((a) => a.id));
    const available = all.filter((e) => e.id !== selfId && !(e.fromApp && disabledApps.has(e.fromApp)));

    const target = resolveEmployee(available, name);
    if (!target) {
      const roster = employeeRoster(available, getCurrentLanguage() !== "zh" ? "en" : "zh") || tr("ui.index.no.other.teammates.available.a37ed73");
      return { content: tr("ui.index.no.teammate.named.teammates.cfaf909", { p0: name, p1: roster }), isError: true };
    }

    const dm = findOrCreateDm(selfId, target.id, [selfName, target.name]);
    send("evt:team-rooms", { rooms: loadRooms() });
    // 先把「派活」这条消息落进私聊，界面立刻看到。
    const msgs = appendDmMessage(dm.id, { speaker: { id: selfId, name: selfName, kind: "agent" }, text: task });
    send("evt:team-room", { roomId: dm.id, messages: msgs, running: true });

    // 关键：异步派活——把活排进对方的员工队列就【立即返回】，不 await 他做完。
    const busyBefore = empIsBusy(target.id);
    const ahead = empQueueLen(target.id); // 他前面还排着几件
    const assignDepth = (ctx.dmDepth ?? 0) + 1;
    const scope: TaskReportScope = ctx.taskReportScope ?? {
      turnId: ctx.turnId!, origin: ctx.reportOrigin ?? { kind: 'session', id: ctx.sessionId! },
      ownerId: selfId, ownerName: selfName, depth: ctx.dmDepth ?? 0,
    };
    const taskId = taskReports.assign(scope, {
      employeeName: target.name, task, roomId: dm.id, signal: ctx.signal,
      run: async (signal, started) => {
        let outcome: { status: 'completed' | 'failed' | 'cancelled'; text: string } = { status: 'failed', text: '未取得任务结果。' };
        await enqueueEmpTask(target.id, async () => {
          signal.throwIfAborted(); started();
          try {
            const text = await runDmTurn(dm.id, target.id, task, teamOrchestratorDeps(ctx), assignDepth,
              { strict: true, explicitInput: true, taskReportScope: scope, signal });
            outcome = { status: text.trim() && text !== '（没有输出）' ? 'completed' : 'failed', text: text || '员工没有返回文字结果，请检查私聊中的产物。' };
          } catch (error: any) {
            outcome = { status: error?.name === 'AbortError' ? 'cancelled' : 'failed', text: secrets.redact(String(error?.message || '任务执行异常。')).text };
          }
        }, { urgent, signal });
        return outcome;
      },
    });

    const where = !busyBefore
      ? tr("ui.index.starting.now.5aacd55")
      : urgent
        ? tr("ui.index.they.re.busy.queued.this.as.fcde4fc")
        : tr("ui.index.they.re.busy.queued.about.ahead.1117e3c", { p0: ahead + 1 });
    return { content: tr("ui.index.assigned.to.task.after.this.batch.0df9861", { p0: employeeLabel(target, getCurrentLanguage() !== "zh" ? "en" : "zh"), p1: where, p2: taskId }) };
  },
};

// ── 一人公司 SOP 库 · 员工工具（4 个）────────────────────────────
// SOP = 公司标准流程沉淀成的 md 文档库。员工做事前先 search_sop 查、read_sop 读全文照做，
// 发现可优化用 write_sop 迭代（一事一 SOP，同 taskKey 不重复建）。三个只读工具永久保留（team/index.ts ALWAYS_KEEP）。
const searchSopTool: Tool = {
  name: "search_sop",
  get description() { return tr("tool.description.search_sop"); },
  readOnly: true,
  get inputSchema() { return {
    type: "object",
    properties: { query: { type: "string", description: tr("tool.parameter.search_sop.query") } },
    required: [],
  }; },
  async run(input): Promise<ToolResult> {
    const q = String((input as any).query || "");
    const hits = sopSearch(q);
    if (!hits.length) {
      return { content: tr("ui.index.no.sop.matches.you.may.use.ad67e4b", { p0: q }) };
    }
    const lines = hits.map((h) =>
      tr("ui.index.text.dd4e96b", { v0: h.id, v1: h.name, v2: (getCurrentLanguage() !== 'zh' ? undefined : h.categoryPath ? `（${h.categoryPath}）` : ""), v3: h.currentVersion || 0, v4: h.summary ? ` — ${h.summary}` : "", v5: (getCurrentLanguage() !== 'zh' ? h.categoryPath ? ` (${h.categoryPath})` : "" : undefined) }),
    );
    return { content: tr("ui.index.sop.hit.a6b57ce", { p0: hits.length }) + lines.join("\n") };
  },
};

const readSopTool: Tool = {
  name: "read_sop",
  get description() { return tr("tool.description.read_sop"); },
  readOnly: true,
  get inputSchema() { return {
    type: "object",
    properties: { id: { type: "string", description: tr("tool.parameter.read_sop.id") } },
    required: ["id"],
  }; },
  async run(input): Promise<ToolResult> {
    const id = String((input as any).id || "").trim();
    const node = sopLoadTree().find((n) => n.id === id && n.kind === "sop");
    if (!node) return { content: tr("ui.index.no.sop.with.id.53d1c7e", { p0: id }), isError: true };
    const doc = sopReadDoc(id);
    const path = sopCategoryPath(id);
    const header = tr("ui.index.sop.current.ca737b1", { p0: node.name, p1: (getCurrentLanguage() !== 'zh' ? path ? ` (${path})` : "" : path ? `（${path}）` : ""), p2: node.currentVersion || 0 });
    return { content: header + (doc || tr("ui.index.this.sop.has.no.content.yet.37a39ea")) };
  },
};

const listSopsTool: Tool = {
  name: "list_sops",
  get description() { return tr("tool.description.list_sops"); },
  readOnly: true,
  inputSchema: { type: "object", properties: {}, required: [] },
  async run(): Promise<ToolResult> {
    const nodes = sopLoadTree();
    if (!nodes.length) return { content: tr("ui.index.the.sop.library.is.empty.no.9d5c75b") };
    // 递归渲染成缩进树
    const byParent = new Map<string, typeof nodes>();
    for (const n of nodes) {
      const k = n.parentId || "";
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k)!.push(n);
    }
    const lines: string[] = [];
    const walk = (pid: string, depth: number) => {
      const kids = (byParent.get(pid) || []).slice().sort((a, b) => a.order - b.order);
      for (const n of kids) {
        const indent = "  ".repeat(depth);
        if (n.kind === "category") lines.push(`${indent}▸ ${n.name}`);
        else lines.push(`${indent}- [${n.id}] ${n.name} · v${n.currentVersion || 0}${n.summary ? ` — ${n.summary}` : ""}`);
        walk(n.id, depth + 1);
      }
    };
    walk("", 0);
    return { content: tr("ui.index.sop.directory.tree.4b1ec70") + lines.join("\n") };
  },
};

const writeSopTool: Tool = {
  name: "write_sop",
  get description() { return tr("tool.description.write_sop"); },
  readOnly: false,
  get inputSchema() { return {
    type: "object",
    properties: {
      id: { type: "string", description: tr("tool.parameter.write_sop.id") },
      taskKey: { type: "string", description: tr("tool.parameter.write_sop.taskKey") },
      title: { type: "string", description: tr("tool.parameter.write_sop.title") },
      category: { type: "string", description: tr("tool.parameter.write_sop.category") },
      content: { type: "string", description: tr("tool.parameter.write_sop.content") },
      summary: { type: "string", description: tr("tool.parameter.write_sop.summary") },
      note: { type: "string", description: tr("tool.parameter.write_sop.note") },
    },
    required: ["content"],
  }; },
  async run(input, ctx): Promise<ToolResult> {
    const a = input as any;
    const id = String(a.id || "").trim();
    const taskKey = String(a.taskKey || "").trim();
    const title = String(a.title || "").trim();
    const category = String(a.category || "").trim();
    const content = String(a.content ?? "");
    const summary = a.summary != null ? String(a.summary) : undefined;
    const note = a.note != null ? String(a.note).trim() : "";
    // 迭代人署名：由哪名员工改的
    const self = ctx.employeeId ? loadEmployees().find((e) => e.id === ctx.employeeId) : null;
    const by = self?.name;
    const finalNote = note || (by ? tr("ui.index.updated.by.bfbb631", { p0: by }) : undefined);

    let targetId = id;
    if (!targetId) {
      // 新建路径：必须有 taskKey，且去重
      if (!taskKey) return { content: tr("ui.index.creating.sop.requires.taskkey.dedup.key.00a53e6"), isError: true };
      const existing = sopFindByTaskKey(taskKey);
      if (existing) {
        return {
          content: tr("ui.index.sop.with.taskkey.already.exists.id.f2c5d38", { p0: taskKey, p1: existing.name, p2: existing.id, p3: existing.id }),
          isError: true,
        };
      }
      // 类别：给了 category 就找/建一个同名顶层类别挂上去
      let parentId: string | undefined;
      if (category) {
        const cat = sopLoadTree().find((n) => n.kind === "category" && !n.parentId && n.name === category);
        parentId = cat ? cat.id : sopCreateNode("category", category).node.id;
      }
      const created = sopCreateNode("sop", title || taskKey, parentId, { taskKey, summary });
      targetId = created.node.id;
    } else {
      const node = sopLoadTree().find((n) => n.id === targetId && n.kind === "sop");
      if (!node) return { content: tr("ui.index.no.sop.with.id.53d1c7e", { p0: targetId }), isError: true };
      if (summary != null) sopUpdateSummary(targetId, summary);
    }
    const r = sopSaveDoc(targetId, content, finalNote);
    if (!r.node) return { content: tr("ui.index.save.failed.sop.not.found.57239b2"), isError: true };
    send("evt:sop", { tree: sopLoadTree() }); // 广播让侧栏/SopView 即时刷新——AI 用 write_sop 写的 SOP 也立刻显示(否则只有手动 IPC 建/改才刷新，AI 写的要重启才见，正是本次修的 bug)
    return {
      content: tr("ui.index.saved.sop.id.now.at.98e5a0b", { p0: r.node.name, p1: targetId, p2: r.version }),
    };
  },
};

// ── 一人公司 · 团队管理工具（3 个）：让 AI(尤其 CEO 小笨)能自己建/改/删员工，别再绕过工具直接改 employees.json ──
// 都走 store API + broadcastTeam() 广播，通讯录/管理页即时刷新。
const clampStr = (v: unknown): string | undefined => { const s = String(v ?? "").trim(); return s || undefined; };

const createEmployeeTool: Tool = {
  name: "create_employee",
  get description() { return tr("tool.description.create_employee"); },
  readOnly: false,
  get inputSchema() { return {
    type: "object",
    properties: {
      name: { type: "string", description: tr("tool.parameter.create_employee.name") },
      title: { type: "string", description: tr("tool.parameter.create_employee.title") },
      blurb: { type: "string", description: tr("tool.parameter.create_employee.blurb") },
      persona: { type: "string", description: tr("tool.parameter.create_employee.persona") },
      soul: { type: "string", description: tr("tool.parameter.create_employee.soul") },
      aboutUser: { type: "string", description: tr("tool.parameter.create_employee.aboutUser") },
      memory: { type: "string", description: tr("tool.parameter.create_employee.memory") },
      icon: { type: "string", description: tr("tool.parameter.create_employee.icon") },
    },
    required: ["name", "persona"],
  }; },
  async run(input): Promise<ToolResult> {
    const a = input as any;
    const name = clampStr(a.name);
    const persona = clampStr(a.persona);
    if (!name || !persona) return { content: tr("ui.index.name.and.persona.are.required.a30fdcd"), isError: true };
    const all = loadEmployees();
    if (all.some((e) => e.name === name)) return { content: tr("ui.index.teammate.named.already.exists.use.different.c8fb94b", { p0: name }), isError: true };
    const id = "emp-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e4).toString(36);
    const order = all.reduce((m, e) => Math.max(m, e.order ?? -1), -1) + 1; // 排到通讯录末尾
    const emp: Employee = { id, name, persona, title: clampStr(a.title), blurb: clampStr(a.blurb), soul: clampStr(a.soul), aboutUser: clampStr(a.aboutUser), memory: clampStr(a.memory), icon: clampStr(a.icon), order };
    addEmployees([emp]);
    broadcastTeam();
    return { content: tr("ui.index.created.teammate.it.now.shows.in.e680949", { v0: name, v1: (getCurrentLanguage() !== 'zh' ? undefined : emp.title ? `（${emp.title}）` : "") }) };
  },
};

const updateEmployeeTool: Tool = {
  name: "update_employee",
  get description() { return tr("tool.description.update_employee"); },
  readOnly: false,
  get inputSchema() { return {
    type: "object",
    properties: {
      name: { type: "string", description: tr("tool.parameter.update_employee.name") },
      newName: { type: "string", description: tr("tool.parameter.update_employee.newName") },
      title: { type: "string" }, blurb: { type: "string" }, persona: { type: "string" },
      soul: { type: "string" }, aboutUser: { type: "string" }, memory: { type: "string" }, icon: { type: "string" },
    },
    required: ["name"],
  }; },
  async run(input): Promise<ToolResult> {
    const a = input as any;
    const name = clampStr(a.name);
    if (!name) return { content: tr("ui.index.name.is.required.2ff02ed"), isError: true };
    const emp = resolveEmployee(loadEmployees(), name);
    if (!emp) return { content: tr("ui.index.no.teammate.named.292aa26", { p0: name }), isError: true };
    const patch: Record<string, unknown> = {};
    if (a.newName != null) patch.name = clampStr(a.newName);
    for (const k of ["title", "blurb", "persona", "soul", "aboutUser", "memory", "icon"]) if (a[k] != null) patch[k] = clampStr(a[k]);
    if (patch.name === undefined && "name" in patch) return { content: tr("ui.index.newname.cannot.be.empty.3bb0ad1"), isError: true };
    if (patch.persona === undefined && "persona" in patch) return { content: tr("ui.index.persona.cannot.be.cleared.aa91da5"), isError: true };
    if (Object.keys(patch).length === 0) return { content: tr("ui.index.nothing.to.update.f01d216"), isError: true };
    updateEmployee(emp.id, patch);
    broadcastTeam();
    return { content: tr("ui.index.updated.teammate.a1f8e03", { p0: name }) };
  },
};

const deleteEmployeeTool: Tool = {
  name: "delete_employee",
  get description() { return tr("tool.description.delete_employee"); },
  readOnly: false,
  get inputSchema() { return {
    type: "object",
    properties: {
      name: { type: "string", description: tr("tool.parameter.delete_employee.name") },
      confirm: { type: "boolean", description: tr("tool.parameter.delete_employee.confirm") },
    },
    required: ["name", "confirm"],
  }; },
  async run(input, ctx): Promise<ToolResult> {
    const a = input as any;
    const name = clampStr(a.name);
    if (!name) return { content: tr("ui.index.name.is.required.e9b58fa"), isError: true };
    if (a.confirm !== true) return { content: tr("ui.index.not.deleted.deletion.is.irreversible.pass.586afc2"), isError: true };
    const emp = resolveEmployee(loadEmployees(), name);
    if (!emp) return { content: tr("ui.index.no.teammate.named.292aa26", { p0: name }), isError: true };
    if (ctx.employeeId === emp.id) return { content: tr("ui.index.you.can.delete.yourself.1964cd8"), isError: true };
    removeEmployee(emp.id);
    broadcastTeam();
    return { content: tr("ui.index.deleted.teammate.ff1124f", { p0: name }) };
  },
};

// ── 一人公司 · 部门（组织架构）工具：AI 可自己建部门/设负责人/编成员，通讯录即时按部门分组显示 ──
// 注意：只改 title 字符串(如「技术部主管」)不会真的建部门——那只是文字。真正的组织层级要用本工具写部门记录。
const manageDepartmentTool: Tool = {
  name: "manage_department",
  get description() { return tr("tool.description.manage_department"); },
  readOnly: false,
  get inputSchema() { return {
    type: "object",
    properties: {
      action: { type: "string", enum: ["create", "update", "delete", "list"], description: tr("tool.parameter.manage_department.action") },
      name: { type: "string", description: tr("tool.parameter.manage_department.name") },
      newName: { type: "string", description: tr("tool.parameter.manage_department.newName") },
      head: { type: "string", description: tr("tool.parameter.manage_department.head") },
      members: { type: "array", items: { type: "string" }, description: tr("tool.parameter.manage_department.members") },
    },
    required: ["action"],
  }; },
  async run(input): Promise<ToolResult> {
    const a = input as any;
    const action = String(a.action || "").trim();
    const emps = loadEmployees();
    const idByName = (nm: string) => resolveEmployee(emps, String(nm || ""))?.id;
    const nameById = (id: string) => employeeLabel(emps.find((e) => e.id === id), getCurrentLanguage() !== "zh" ? "en" : "zh", id);
    // 把一串名字转成 id，顺带收集没找到的名字，提示 AI 名字写错。
    const resolveNames = (names: unknown): { ids: string[]; missing: string[] } => {
      const ids: string[] = []; const missing: string[] = [];
      if (Array.isArray(names)) for (const nm of names) { const id = idByName(String(nm)); if (id) ids.push(id); else if (String(nm || "").trim()) missing.push(String(nm).trim()); }
      return { ids, missing };
    };

    if (action === "list") {
      const list = loadDepartments();
      if (!list.length) return { content: tr("ui.index.no.departments.yet.flat.structure.b45e156") };
      const lines = list.map((d) => tr("ui.index.head.members.081d6ca", { p0: d.name, p1: (getCurrentLanguage() !== 'zh' ? d.headId ? nameById(d.headId) : "(none)" : d.headId ? nameById(d.headId) : tr("ui.index.message.2840555684")), p2: (getCurrentLanguage() !== 'zh' ? (d.memberIds || []).map(nameById).join(", ") || "(none)" : (d.memberIds || []).map(nameById).join("、") || tr("set.mcp.dNone")) }));
      return { content: tr("ui.index.department.3fb3495", { p0: list.length }) + lines.join("\n") };
    }

    const name = clampStr(a.name);
    if (!name) return { content: tr("ui.index.name.department.is.required.e79495e"), isError: true };

    if (action === "create") {
      if (loadDepartments().some((d) => d.name === name)) return { content: tr("ui.index.department.already.exists.use.action.update.7a1c7ad", { p0: name }), isError: true };
      const headId = a.head ? idByName(String(a.head)) : undefined;
      if (a.head && !headId) return { content: tr("ui.index.no.employee.named.for.head.8074161", { p0: a.head }), isError: true };
      const { ids: memberIds, missing } = resolveNames(a.members);
      const dept = createDepartment({ name, headId, memberIds });
      broadcastTeam();
      const warn = missing.length ? tr("ui.index.skipped.unknown.b89b594", { p0: (getCurrentLanguage() !== 'zh' ? missing.join(", ") : missing.join("、")) }) : "";
      return { content: tr("ui.index.created.department.contacts.now.grouped.by.60ececd", { v0: dept.name, v1: (getCurrentLanguage() !== 'zh' ? undefined : dept.headId ? nameById(dept.headId) : tr("ui.index.message.5c1b8cb271")), v2: (getCurrentLanguage() !== 'zh' ? undefined : (dept.memberIds || []).map(nameById).join("、") || tr("acct.userInitial")), v3: warn }) };
    }

    const target = loadDepartments().find((d) => d.name === name);
    if (!target) return { content: tr("ui.index.no.department.named.use.action.list.7f586a8", { p0: name }), isError: true };

    if (action === "delete") {
      removeDepartment(target.id);
      broadcastTeam();
      return { content: tr("ui.index.deleted.department.9d72fba", { p0: name }) };
    }

    // update
    const patch: Record<string, unknown> = {};
    let warn = "";
    if (a.newName != null) { const nn = clampStr(a.newName); if (!nn) return { content: tr("ui.index.newname.cannot.be.empty.3bb0ad1"), isError: true }; patch.name = nn; }
    if (a.head !== undefined) {
      if (!a.head) patch.headId = undefined;
      else { const hid = idByName(String(a.head)); if (!hid) return { content: tr("ui.index.no.employee.named.for.head.8074161", { p0: a.head }), isError: true }; patch.headId = hid; }
    }
    if (Array.isArray(a.members)) { const { ids, missing } = resolveNames(a.members); patch.memberIds = ids; if (missing.length) warn = tr("ui.index.skipped.unknown.b89b594", { p0: (getCurrentLanguage() !== 'zh' ? missing.join(", ") : missing.join("、")) }); }
    if (Object.keys(patch).length === 0) return { content: tr("ui.index.nothing.to.update.newname.head.members.6aaa0d4"), isError: true };
    updateDepartment(target.id, patch);
    broadcastTeam();
    const d2 = loadDepartments().find((d) => d.id === target.id);
    return { content: tr("ui.index.updated.department.f8939d5", { v0: d2?.name || name, v1: (getCurrentLanguage() !== 'zh' ? undefined : d2?.headId ? nameById(d2.headId) : tr("ui.index.message.5c1b8cb271")), v2: (getCurrentLanguage() !== 'zh' ? undefined : (d2?.memberIds || []).map(nameById).join("、") || tr("acct.userInitial")), v3: warn }) };
  },
};

// ── 一人公司 · 群聊管理工具：AI 可自己建群/改群/删群/拉人，把相关同事拉一起并行讨论 ──
// 与 dm_teammate(一对一)、assign_task(单人派活) 互补：多人需要同时看到同一话题并各自响应时建群。
const manageGroupTool: Tool = {
  name: "manage_group",
  get description() { return tr("tool.description.manage_group"); },
  readOnly: false,
  get inputSchema() { return {
    type: "object",
    properties: {
      action: { type: "string", enum: ["create", "update", "delete", "list"], description: tr("tool.parameter.manage_group.action") },
      name: { type: "string", description: tr("tool.parameter.manage_group.name") },
      newName: { type: "string", description: tr("tool.parameter.manage_group.newName") },
      members: { type: "array", items: { type: "string" }, description: tr("tool.parameter.manage_group.members") },
      coordinator: { type: "string", description: tr("tool.parameter.manage_group.coordinator") },
      maxWake: { type: "number", description: tr("tool.parameter.manage_group.maxWake") },
    },
    required: ["action"],
  }; },
  async run(input): Promise<ToolResult> {
    const a = input as any;
    const action = String(a.action || "").trim();
    const emps = loadEmployees();
    const idByName = (nm: string) => resolveEmployee(emps, String(nm || ""))?.id;
    const nameById = (id: string) => employeeLabel(emps.find((e) => e.id === id), getCurrentLanguage() !== "zh" ? "en" : "zh", id);
    const groupsOf = () => loadRooms().filter((r: any) => r.type !== "dm");
    const resolveNames = (names: unknown): { ids: string[]; missing: string[] } => {
      const ids: string[] = []; const missing: string[] = [];
      if (Array.isArray(names)) for (const nm of names) { const id = idByName(String(nm)); if (id) ids.push(id); else if (String(nm || "").trim()) missing.push(String(nm).trim()); }
      return { ids: [...new Set(ids)], missing };
    };
    const clampWake = (n: unknown) => Math.min(8, Math.max(1, Math.floor(Number(n) || 3)));

    if (action === "list") {
      const gs = groupsOf();
      if (!gs.length) return { content: tr("ui.index.no.groups.yet.dbf99fe") };
      const lines = gs.map((r: any) => tr("ui.index.members.maxwake.2c283c3", { p0: r.name, p1: (getCurrentLanguage() !== 'zh' ? (r.members || []).map(nameById).join(", ") || "(none)" : (r.members || []).map(nameById).join("、") || tr("set.mcp.dNone")), p2: (getCurrentLanguage() !== 'zh' ? r.coordinator ? `; coordinator ${nameById(r.coordinator)}` : "" : r.coordinator ? `；协调者 ${nameById(r.coordinator)}` : ""), p3: r.maxWake ?? 3 }));
      return { content: tr("ui.index.group.5ec50e7", { p0: gs.length }) + lines.join("\n") };
    }

    const name = clampStr(a.name);
    if (!name) return { content: tr("ui.index.name.group.is.required.30556fc"), isError: true };

    if (action === "create") {
      const { ids: memberIds, missing } = resolveNames(a.members);
      if (memberIds.length < 1) return { content: tr("ui.index.at.least.valid.member.required.890764d"), isError: true };
      let coordinator: string | undefined;
      if (a.coordinator) { const cid = idByName(String(a.coordinator)); if (!cid) return { content: tr("ui.index.no.employee.named.3ca83b8", { p0: a.coordinator }), isError: true }; if (!memberIds.includes(cid)) memberIds.push(cid); coordinator = cid; }
      const room = createRoom(name, memberIds, coordinator);
      if (a.maxWake != null) updateRoom(room.id, { maxWake: clampWake(a.maxWake) });
      send("evt:team-rooms", { rooms: loadRooms() });
      const warn = missing.length ? tr("ui.index.skipped.unknown.b89b594", { p0: (getCurrentLanguage() !== 'zh' ? missing.join(", ") : missing.join("、")) }) : "";
      return { content: tr("ui.index.created.group.5c2ae92", { v0: name, v1: (getCurrentLanguage() !== 'zh' ? undefined : memberIds.map(nameById).join("、")), v2: (getCurrentLanguage() !== 'zh' ? undefined : coordinator ? `，协调者 ${nameById(coordinator)}` : ""), v3: warn }) };
    }

    const target = groupsOf().find((r: any) => r.name === name);
    if (!target) return { content: tr("ui.index.no.group.named.use.action.list.addfacb", { p0: name }), isError: true };

    if (action === "delete") {
      deleteRoom(target.id);
      send("evt:team-rooms", { rooms: loadRooms() });
      return { content: tr("ui.index.deleted.group.2a1813b", { p0: name }) };
    }

    // update
    const patch: Record<string, unknown> = {};
    let warn = "";
    let members: string[] = target.members || [];
    if (a.newName != null) { const nn = clampStr(a.newName); if (!nn) return { content: tr("ui.index.newname.cannot.be.empty.3bb0ad1"), isError: true }; patch.name = nn; }
    if (Array.isArray(a.members)) { const r = resolveNames(a.members); if (r.ids.length < 1) return { content: tr("ui.index.group.must.keep.member.1f6100e"), isError: true }; members = r.ids; patch.members = r.ids; if (r.missing.length) warn = tr("ui.index.skipped.unknown.b89b594", { p0: (getCurrentLanguage() !== 'zh' ? r.missing.join(", ") : r.missing.join("、")) }); }
    if (a.coordinator !== undefined) {
      if (!a.coordinator) patch.coordinator = undefined;
      else { const cid = idByName(String(a.coordinator)); if (!cid) return { content: tr("ui.index.no.employee.named.3ca83b8", { p0: a.coordinator }), isError: true }; if (!members.includes(cid)) { members = [...members, cid]; patch.members = members; } patch.coordinator = cid; }
    }
    if (a.maxWake != null) patch.maxWake = clampWake(a.maxWake);
    if (Object.keys(patch).length === 0) return { content: tr("ui.index.nothing.to.update.49f6913"), isError: true };
    updateRoom(target.id, patch as any);
    send("evt:team-rooms", { rooms: loadRooms() });
    const g2 = loadRooms().find((r: any) => r.id === target.id) as any;
    return { content: tr("ui.index.updated.group.0f3bd4f", { v0: g2?.name || name, v1: (getCurrentLanguage() !== 'zh' ? undefined : (g2?.members || []).map(nameById).join("、")), v2: (getCurrentLanguage() !== 'zh' ? undefined : g2?.coordinator ? `，协调者 ${nameById(g2.coordinator)}` : ""), v3: warn }) };
  },
};

// ── 一人公司 · 定时任务工具（3 个）：AI 可自己给员工排/查/删定时任务 ──
function broadcastSchedules() { send("evt:team-schedules", { schedules: loadSchedules() }); }
// 校验+规整 AI 传来的触发规则；返回 {trigger} 或 {err}。
function parseTrigger(raw: any): { trigger?: ScheduleTrigger; err?: string } {
  const t = raw || {};
  const kind = String(t.kind || "").trim();
  const hm = (h: unknown, m: unknown) => ({ hour: Math.min(23, Math.max(0, Math.floor(Number(h) || 0))), minute: Math.min(59, Math.max(0, Math.floor(Number(m) || 0))) });
  if (kind === "daily") return { trigger: { kind: "daily", ...hm(t.hour, t.minute) } };
  if (kind === "weekly") return { trigger: { kind: "weekly", weekday: Math.min(6, Math.max(0, Math.floor(Number(t.weekday) || 0))), ...hm(t.hour, t.minute) } };
  if (kind === "monthly") return { trigger: { kind: "monthly", day: Math.min(31, Math.max(1, Math.floor(Number(t.day) || 1))), ...hm(t.hour, t.minute) } };
  if (kind === "interval") {
    const every = Math.floor(Number(t.everyMinutes) || 0);
    if (every < MIN_INTERVAL_MINUTES) return { err: tr("ui.index.minimum.interval.is.minute.e375a7b", { p0: MIN_INTERVAL_MINUTES }) };
    return { trigger: { kind: "interval", everyMinutes: every } };
  }
  return { err: tr("ui.index.trigger.kind.must.be.one.of.664133b") };
}
function triggerText(t: ScheduleTrigger, en = false): string {
  const p2 = (n: number) => String(n).padStart(2, "0");
  const wk = [tr("ui.index.sun.a18e87c"), tr("ui.index.mon.30b15fa"), tr("ui.index.tue.9e7b616"), tr("ui.index.wed.fc1b35b"), tr("ui.index.thu.10d2d87"), tr("ui.index.fri.444209f"), tr("ui.index.sat.b3e9391")];
  if (t.kind === "daily") return tr("ui.index.daily.e4f3761", { p0: p2(t.hour), p1: p2(t.minute) });
  if (t.kind === "weekly") return tr("ui.index.text.f63cdcd", { p0: wk[t.weekday], p1: p2(t.hour), p2: p2(t.minute) });
  if (t.kind === "monthly") return tr("ui.index.day.8095ce1", { p0: t.day, p1: p2(t.hour), p2: p2(t.minute) });
  return tr("ui.index.every.min.6e28d83", { p0: t.everyMinutes });
}

const createScheduleTool: Tool = {
  name: "create_schedule",
  get description() { return tr("tool.description.create_schedule"); },
  readOnly: false,
  get inputSchema() { return {
    type: "object",
    properties: {
      employeeName: { type: "string", description: tr("tool.parameter.create_schedule.employeeName") },
      name: { type: "string", description: tr("tool.parameter.create_schedule.name") },
      trigger: { type: "object", description: tr("tool.parameter.create_schedule.trigger") },
      sopId: { type: "string", description: tr("tool.parameter.create_schedule.sopId") },
      doc: { type: "string", description: tr("tool.parameter.create_schedule.doc") },
      enabled: { type: "boolean", description: tr("tool.parameter.create_schedule.enabled") },
    },
    required: ["employeeName", "name", "trigger"],
  }; },
  async run(input): Promise<ToolResult> {
    const a = input as any;
    const employeeName = clampStr(a.employeeName);
    const name = clampStr(a.name);
    if (!employeeName || !name) return { content: tr("ui.index.employeename.and.name.are.required.8e7886a"), isError: true };
    const emp = resolveEmployee(loadEmployees(), employeeName);
    if (!emp) return { content: tr("ui.index.no.teammate.named.292aa26", { p0: employeeName }), isError: true };
    const sopId = clampStr(a.sopId);
    const doc = clampStr(a.doc);
    if (!sopId && !doc) return { content: tr("ui.index.provide.either.sopid.or.doc.as.5d18722"), isError: true };
    const { trigger, err } = parseTrigger(a.trigger);
    if (err || !trigger) return { content: err || tr("ui.index.invalid.trigger.a9953f4"), isError: true };
    const task = addSchedule({ employeeId: emp.id, name, trigger, sopId, doc, enabled: a.enabled !== false });
    broadcastSchedules();
    return { content: tr("ui.index.scheduled.for.f36a4ff", { v0: (getCurrentLanguage() !== 'zh' ? undefined : emp.name), v1: name, v2: (getCurrentLanguage() !== 'zh' ? undefined : triggerText(trigger)), v3: (getCurrentLanguage() !== 'zh' ? undefined : task.enabled ? tr("ui.index.message.e05c9ff53c") : tr("ui.index.message.6578d64b4a")), v4: (getCurrentLanguage() !== 'zh' ? employeeLabel(emp, getCurrentLanguage() !== "zh" ? "en" : "zh") : undefined), v5: (getCurrentLanguage() !== 'zh' ? triggerText(trigger, true) : undefined) }) };
  },
};

const listSchedulesTool: Tool = {
  name: "list_schedules",
  get description() { return tr("tool.description.list_schedules"); },
  readOnly: true,
  get inputSchema() { return { type: "object", properties: { employeeName: { type: "string", description: tr("tool.parameter.list_schedules.employeeName") } } }; },
  async run(input): Promise<ToolResult> {
    const emps = loadEmployees();
    const filterName = clampStr((input as any).employeeName);
    const fid = filterName ? resolveEmployee(emps, filterName)?.id : undefined;
    if (filterName && !fid) return { content: tr("ui.index.employee.reference.is.unknown.or.ambiguous.9594c56"), isError: true };
    let list = loadSchedules();
    if (filterName) list = list.filter((s) => s.employeeId === fid);
    if (!list.length) return { content: tr("ui.index.no.scheduled.tasks.yet.22b2464") };
    const lines = list.map((s) => {
      const nm = employeeLabel(emps.find((e) => e.id === s.employeeId), getCurrentLanguage() !== "zh" ? "en" : "zh", s.employeeId);
      return `· [${s.id}] ${s.name} — ${nm} · ${triggerText(s.trigger)} · ${s.enabled ? tr("ui.app.enabled.02606e2") : tr("ui.app.pause.f55ca3a")}${s.sopId ? tr("ui.index.message.890db50f6a") : ""}`;
    });
    return { content: (filterName ? tr("ui.index.message.cfba4262aa", {p0: filterName}) : tr("ui.index.message.abb64007f2")) + lines.join("\n") };
  },
};

const deleteScheduleTool: Tool = {
  name: "delete_schedule",
  get description() { return tr("tool.description.delete_schedule"); },
  readOnly: false,
  get inputSchema() { return { type: "object", properties: { id: { type: "string", description: tr("tool.parameter.delete_schedule.id") } }, required: ["id"] }; },
  async run(input): Promise<ToolResult> {
    const id = clampStr((input as any).id);
    if (!id) return { content: tr("ui.index.id.is.required.0c1573a"), isError: true };
    const before = loadSchedules();
    const task = before.find((s) => s.id === id);
    if (!task) return { content: tr("ui.index.no.schedule.with.id.f719724", { p0: id }), isError: true };
    removeSchedule(id);
    broadcastSchedules();
    return { content: tr("ui.index.deleted.schedule.f888bbd", { p0: task.name }) };
  },
};

// 发图工具：把本地图片(如生图工具产出的文件)发进对话框，内联显示+可点开预览。
// 走 ToolResult.displayImage，只给用户展示；已经自动展示的生成图无需重复发送。
const sendImageTool: Tool = {
  name: "send_image",
  get description() { return tr("tool.description.send_image"); },
  readOnly: true,
  get inputSchema() { return {
    type: "object",
    properties: {
      path: { type: "string", description: tr("tool.parameter.send_image.path") },
      caption: { type: "string", description: tr("tool.parameter.send_image.caption") },
    },
    required: ["path"],
  }; },
  async run(input): Promise<ToolResult> {
    const p = String((input as any).path || "").trim();
    if (!p) return { content: tr("ui.index.path.is.required.7d987fc"), isError: true };
    try {
      const buf = readFileSync(p);
      if (buf.length > 8 * 1024 * 1024) return { content: tr("ui.index.image.too.large.mb.eeda6a5"), isError: true };
      const ext = (p.toLowerCase().split(".").pop() || "");
      const mime = ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" } as Record<string, string>)[ext];
      if (!mime) return { content: tr("ui.index.only.png.jpg.jpeg.gif.webp.0a8fa63"), isError: true };
      const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
      const cap = String((input as any).caption || "").trim();
      // displayImage:只发到对话框给人看、不进模型上下文(避免大图每轮塞进上下文费钱/触发模型报错)。
      return { content: cap || tr("ui.index.image.sent.to.the.chat.e204bd6"), displayImage: dataUrl };
    } catch (e: any) {
      return { content: tr("ui.index.cannot.read.image.71003a1", { p0: String(e?.message || e).slice(0, 150) }), isError: true };
    }
  },
};

const sendFileTool: Tool = {
  name: 'send_file', readOnly: false,
  get description() { return tr("tool.description.send_file"); },
  get inputSchema() { return { type: 'object', properties: { path: { type: 'string', description: tr("tool.parameter.send_file.path") } }, required: ['path'] }; },
  async run(input, ctx) {
    const origin = ctx.taskReportScope?.origin || ctx.reportOrigin || (ctx.sessionId ? { kind: 'session' as const, id: ctx.sessionId } : undefined);
    if (!origin || !ctx.turnId) return { content: tr("ui.index.message.eaef8d4bd5"), isError: true };
    try {
      ctx.signal?.throwIfAborted();
      const file = remoteArtifacts.publish(String(input.path || ''), [ctx.cwd, join(homedir(), DATA_DIR_NAME, 'output')], origin, ctx.taskReportScope?.turnId || ctx.turnId);
      return { content: JSON.stringify({ delivered: true, file }) };
    } catch (error) { return { content: String((error as Error).message || tr("ui.index.message.d348407895")), isError: true }; }
  },
};

// 密钥安全包装：入参占位符→真实值回填、bash 注入密钥环境变量、工具结果→脱敏后再回给模型。
// 闭环:模型能用密钥(env/占位符)但读不回明文(输出被脱敏)，想 echo 偷取也会被拦。
function deepRehydrate(input: Record<string, unknown>): Record<string, unknown> {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return secrets.rehydrate(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) o[k] = walk(val);
      return o;
    }
    return v;
  };
  return walk(input) as Record<string, unknown>;
}
function wrapSecret(t: Tool): Tool {
  return {
    ...t,
    async run(input, ctx) {
      const realInput = deepRehydrate(input); // 占位符→明文，供本机执行
      const r = await t.run(realInput, { ...ctx, env: secrets.envForTools() });
      return { ...r, content: secrets.redact(r.content).text }; // 结果里的明文→占位符再回模型
    },
  };
}

// 桌面版工具集 = 共享工具 + 浏览器工具 + 动态 MCP 工具(连上后加入)，全部过密钥安全包装。
// 设置里关掉「知识网络」→ 一并摘掉 brain_* 工具，别再让模型调用(与系统提示注入的开关同源)。
// Brain is free. Availability follows the user setting.
// Model usage continues to follow the selected provider billing.
const brainAvailable = brainEnabled;
// 主进程界面文案双语：按 WUWEI_LANG(设置时写入)出中/英，供返回给渲染层的 reason/message/text 等用。
function tt(zh: string, en: string): string {
  return getCurrentLanguage() !== "zh" ? en : zh;
}
// 工具描述/参数说明的英文版（发给模型那份；界面显示侧另有渲染端 TOOL_DESC_EN）。
// WUWEI_LANG=en 时把内置工具的中文描述替换为英文，让英文用户的模型上下文也全英文。

// ask_user 的参数说明（嵌套在 questions.items / options.items 里），主进程与设置页共用同一套文案


// 深度替换 inputSchema 里所有层级的 description（ask_user 的选项/问题是嵌套在 items 里的，
// 只译顶层会让英文用户的模型上下文里混着中文字段说明）


function localizeToolEn(t: Tool): Tool { return localizeToolMetadata(t); }

function desktopTools(): Tool[] {
  const brainOn = brainAvailable(loadSettings());
  const base = brainOn ? ALL_TOOLS : ALL_TOOLS.filter((t) => !t.name.startsWith("brain_"));
  const en = getCurrentLanguage() !== "zh";
  // dm_teammate 仅在「AI 员工团队」模块开启时提供（可插拔契约：模块关时工具不出现、不注入）。
  const teamTools = teamEnabled(loadSettings())
    ? [dmTeammateTool, assignTaskTool, searchSopTool, readSopTool, listSopsTool, writeSopTool, createEmployeeTool, updateEmployeeTool, deleteEmployeeTool, manageDepartmentTool, manageGroupTool, createScheduleTool, listSchedulesTool, deleteScheduleTool]
    : [];
  let tools = [...base, askUserTool, sendImageTool, sendFileTool, ...teamTools, ...BROWSER_TOOLS, ...mcpTools()];
  if (en) tools = tools.map(localizeToolEn); // 英文用户：模型侧工具描述也走英文
  return tools.map(wrapSecret);
}
function desktopToolMap(): Map<string, Tool> {
  return new Map(desktopTools().map((t) => [t.name, t]));
}
// MCP 连接/变更后，热更所有会话 agent 的工具集
function refreshAgentTools() {
  const tools = desktopTools();
  const map = desktopToolMap();
  for (const a of agents.values()) a.setTools(tools, map);
}

// 取/建某会话的 Agent（懒加载并恢复其历史）
// 方案B 核心：为「某个会话」构建它自己的 provider。真相源=该会话 meta 里存的完整身份
// (model+providerId+kind+baseUrl)，凭证从全局 creds[providerId] 取(同平台共用一份 token/key，本就该共享)。
// 复用唯一真实变换 applyEnvFromSettings→loadConfig(同步、无 await 间隙)：临时把 env 换成该会话的身份构建，
// 构建完立刻还原全局 env→全局 provider/显示保持跟聚焦会话一致。会话没存身份(全新/老会话)→回退全局种子。
// 这样每个会话的 agent 从出生就绑「它自己的模型」，全局怎么漂都带不动别的会话——从根上杜绝串会话。
function providerForSession(id: string, strict = false): ReturnType<typeof makeProvider> | null {
  const gs = loadSettings();
  try {
    const meta = listSessions().find((x) => x.id === id);
    if (!meta || !meta.model || !meta.providerId || !gs) return provider; // 未绑定→全局种子
    const slot = (gs.creds || {})[meta.providerId] || {};
    const sSettings: Settings = {
      ...gs,
      providerId: meta.providerId,
      kind: (meta.kind as Settings["kind"]) || providerKindForId(meta.providerId, gs),
      model: meta.model,
      baseUrl: meta.baseUrl ?? slot.baseUrl ?? gs.baseUrl,
      apiKey: slot.apiKey,
      oauthToken: slot.oauthToken,
    };
    try {
      applyEnvFromSettings(sSettings);
      return makeProvider(loadConfig());
    } finally {
      applyEnvFromSettings(gs); // 还原全局 env(与 initProvider/applySettings 后一致)
    }
  } catch {
    return strict ? null : provider;
  }
}

// 按会话身份算它该用的系统提示词：绑了员工就套人格，否则用基础提示词。
// 与 getAgent 同源(都走 applyEmployee)——任何"重置 system"的地方都改走这里，
// 避免像 startTurn/设置变更等把员工人格无差别冲回"你是无为"(员工身份 bug 根因)。
function sysForSession(id: string): string {
  const base = buildSysPrompt(cwd, modelLabel, loadSettings()?.providerId);
  const meta = listSessions().find((s) => s.id === id);
  if (meta?.employeeId && teamEnabled(loadSettings())) {
    return applyEmployee(meta.employeeId, base, desktopTools()).sys;
  }
  return base;
}

function getAgent(id: string): Agent | null {
  if (!provider) return null;
  const meta = listSessions().find((s) => s.id === id);
  let a = agents.get(id);
  if (!a) {
    // 「AI 员工团队」：会话绑了员工就套上他的人格与工具白名单；没绑(或模块没开)时 sys/tools 原样返回
    const empBound = meta?.employeeId && teamEnabled(loadSettings());
    const emp = empBound
      ? applyEmployee(meta!.employeeId!, sysPrompt, desktopTools())
      : { sys: sysPrompt, tools: desktopTools() };
    if (empBound) log("team", "会话", id.slice(0, 8), "套用员工", meta!.employeeId, "人格(sys", emp.sys.length, "字, 工具", emp.tools.length, "个)");
    const empToolMap = emp.tools.length === desktopTools().length
      ? desktopToolMap()
      : new Map([...desktopToolMap()].filter(([n]) => emp.tools.some((t) => t.name === n)));
    // 用该会话自己的 provider 建 agent(而非全局)——出生即绑自己的模型，全局漂移带不动它
    // 员工私聊会话：remember 工具写到该员工专属记忆文件（下次 applyEmployee 会加载它）。
    const memoryFile = empBound ? employeeMemoryPath(meta!.employeeId!) : undefined;
    // 员工私聊会话：把 employeeId 塞进 ToolContext，员工用 dm_teammate 时据此确定「发起方」。
    const employeeId = empBound ? meta!.employeeId! : undefined;
    a = new Agent(providerForSession(id) || provider, emp.sys, emp.tools, { cwd, sessionId: id, memoryFile, employeeId }, empToolMap,
      { ...agentOpts, ...(empBound ? { requestHistory: teamRequestHistory(`session:${id}`) } : {}) });
    a.setMessages(loadMessages(id));
    if (meta?.usage) a.setUsage({ ...EMPTY_USAGE, ...meta.usage }); // 兼容未保存缓存/步数的旧会话
    agents.set(id, a);
    // 登记该会话此刻绑定的后端：优先它自己存过的平台(切回老会话时用回它自己的)，否则用当前全局平台。
    backendBySid.set(id, meta?.providerId || curProviderId());
    // 懒绑定：会话已有 meta 但从没存过完整身份(老会话)→把此刻的身份补写进去，之后就有自己的真相源。
    if (meta && (!meta.kind || !meta.model || !meta.providerId)) {
      const s = loadSettings();
      if (s) setSessionBinding(id, { model: s.model, providerId: s.providerId, kind: s.kind, baseUrl: s.baseUrl });
    }
  }
  // A freshly opened employee chat may bind its employee after the Agent was created.
  a.setRequestHistory(meta?.employeeId && teamEnabled(loadSettings()) ? teamRequestHistory(`session:${id}`) : undefined);
  return a;
}

const EMPTY_USAGE = { totalInput: 0, totalOutput: 0, lastInput: 0, totalCacheHit: 0, totalCacheMiss: 0, totalSteps: 0 };
// 切换/加载会话后推送该会话自己的用量
function sendUsageFor(id: string) {
  const a = agents.get(id);
  send("evt:usage", a ? a.getUsage() : EMPTY_USAGE);
}

// 启动时：选最近会话或新建，推送列表与当前会话历史
function bootstrapSessions() {
  autoPurgeTrash(); // 启动先清掉回收站里超过 7 天的
  const list = listSessions();
  currentId = list[0]?.id ?? randomUUID();
  const a = getAgent(currentId);
  send("evt:sessions", listSessions());
  send("evt:trash", listTrash());
  send("evt:session-loaded", { id: currentId, messages: a ? a.getMessages() : [] });
  const rl = loadRateLimits(curProviderId()); // 上次的订阅额度快照（按平台），打开即显示
  if (rl) send("evt:ratelimits", rl);
  sendUsageFor(currentId); // 当前会话自己的用量
}

// 会话有内容才落盘；空会话不持久化
function persist(id: string) {
  const a = agents.get(id);
  if (!a) return;
  const msgs = a.getMessages();
  if (msgs.length === 0) return;
  saveSession(id, msgs, deriveTitle(msgs), Date.now(), a.getUsage());
  send("evt:sessions", listSessions());
  void maybeSmartTitle(id);
}
function persistCurrent() {
  persist(currentId);
}

// 即时落盘(不触发智能标题/防刷)：每完成一段就存，重启不丢进度。可附带正在生成的半截草稿。
const streamDrafts = new Map<string, string>(); // 正在流的助手段落累积文本(还没进 agent.messages)
const draftSaveAt = new Map<string, number>(); // 草稿落盘节流时间戳
function persistQuiet(id: string, draft?: string) {
  const a = agents.get(id);
  if (!a) return;
  let msgs = a.getMessages();
  if (draft && draft.trim()) {
    // 把正在生成的半截作为临时助手消息附在末尾一起存(重启后可见/可续)；正常完成时会被真消息覆盖
    msgs = [...msgs, { role: "assistant", content: [{ type: "text", text: draft }] } as any];
  }
  if (msgs.length === 0) return;
  saveSession(id, msgs, deriveTitle(msgs), Date.now(), a.getUsage());
}
// 流式草稿节流落盘(~1.2s 一次)：既保存半截又不狂写盘
function saveDraftThrottled(id: string) {
  const now = Date.now();
  if (now - (draftSaveAt.get(id) || 0) < 600) return; // 更勤落盘：强杀时少丢正在生成的回复
  draftSaveAt.set(id, now);
  persistQuiet(id, streamDrafts.get(id));
}

// AI 智能标题：每一轮对话后都重新总结，让标题实时跟上会话内容
const titleInFlight = new Set<string>(); // 正在生成的会话(防重入)，非"只生成一次"
function hasText(msgs: any[], role: string): boolean {
  return msgs.some(
    (m) => m.role === role && m.content?.some((b: any) => b.type === "text" && b.text?.trim()),
  );
}
function msgText(m: any): string {
  return (m.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join(" ")
    .slice(0, 200);
}
// 取整条消息正文，不截断（msgText 有 200 字上限，只适合做短预览；解析契约 json 等必须用这个）
function msgFullText(m: any): string {
  return (m?.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
}
// 保留末尾 n 字：助手回复的「下一步问题/建议」几乎都在结尾，从头截断会把它切掉，故取尾。
function msgTextTail(m: any, n: number): string {
  return (m.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join(" ")
    .trim()
    .slice(-n);
}
async function maybeSmartTitle(id: string) {
  // Image turns already have a prompt-derived title; do not call a text model for them.
  if (loadSettings()?.imageMode) return;
  if (titleInFlight.has(id) || !provider) return;
  const a0 = agents.get(id);
  if (!a0) return;
  const msgs = a0.getMessages();
  if (!hasText(msgs, "user") || !hasText(msgs, "assistant")) return;
  titleInFlight.add(id);
  // 取首条用户消息(定主题) + 最近几条(跟进展)，让标题随对话演进
  const firstUser = msgs.find((m: any) => m.role === "user");
  const recent = msgs.slice(-6);
  const picked = firstUser && !recent.includes(firstUser) ? [firstUser, ...recent] : recent;
  const en = getCurrentLanguage() !== "zh"; // 标题是给用户看的，必须跟随界面语言
  const convo = picked
    .map((m: any) => {
      // 剥掉交接前言只留正文；首条(定主题)多给点字数，确保覆盖到"目标+项目"这几节
      const body = stripHandoffWrapper(msgText(m)).trim().slice(0, m === firstUser ? 500 : 200);
      return `${m.role === "user" ? tr("ui.index.user.b9e9555") : tr("ui.index.assistant.e7461b8")}: ${body}`;
    })
    .filter((s: string) => s.length > 3)
    .join("\n");
  try {
    const res = await provider.complete(
      tr("ui.index.you.are.conversation.labeler.read.the.89f9667"),
      [
        {
          role: "user",
          content: [{ type: "text", text: tr("ui.index.conversation.title.project.6fc6f12", { p0: convo }) }],
        },
      ] as any,
      [],
      {},
    );
    const raw = (res.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      // 推理模型(z1 等)会带 <think>…</think>：先整块剥掉，别让标签漏进标题
      .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
      .replace(/^\s*<think(?:ing)?>[\s\S]*$/i, "") // 极端情况：只有未闭合的 <think>
      .trim();
    const [rawTitle, rawProject] = raw.split(/[|｜]/);
    // 中文标题不留空格；英文必须保留词间空格(否则 "Fix checkout tests" 会被粘成 "Fixcheckouttests")，
    // 长度上限也要放宽——同样信息量英文字符数是中文的两三倍。
    const clean = (t?: string) =>
      (t || "").replace(en ? /["'`。，、：！!？?（）()【】\[\]<>]/g : /[\s"'`。，、：:！!？?（）()【】\[\]<>]/g, "").replace(/\s+/g, " ").trim();
    const title = clean(rawTitle).slice(0, en ? 40 : 12);
    const project = clean(rawProject).slice(0, en ? 24 : 8);
    if (title) {
      const a = agents.get(id);
      if (a) {
        saveSession(id, a.getMessages(), title, Date.now(), a.getUsage());
        if (project) setSessionProject(id, project);
        send("evt:sessions", listSessions());
      }
    }
  } catch {
    /* 失败保留上一个标题 */
  } finally {
    titleInFlight.delete(id);
  }
}

// 输入框「下一步动作」建议：回复完后，用模型根据对话(尤其助手最后回复常以问题/建议结尾)
// 预测用户接下来最可能输入的一句话，发给前端做幽灵提示(Tab 补全)。无明确下一步则清空。
const suggestInFlight = new Set<string>();
async function suggestNextAction(id: string) {
  if (suggestInFlight.has(id) || !provider) return;
  const a0 = agents.get(id);
  if (!a0) return;
  const msgs = a0.getMessages();
  // 需要至少有一轮助手回复；最后一条应是助手(回复已完成)
  const last = msgs[msgs.length - 1];
  if (!last || last.role !== "assistant" || !hasText(msgs, "user")) {
    send("evt:suggest", { sid: id, text: "", canContinue: false });
    return;
  }
  suggestInFlight.add(id);
  const en = getCurrentLanguage() !== "zh"; // 建议会原样填进输入框，必须跟随界面语言
  const recent = msgs.slice(-4);
  const convo = recent
    .map((m: any, i: number) =>
      // 最后一条助手回复取「结尾」(下一步问题/待办常在末尾)，中间几条取开头做背景即可。
      `${m.role === "user" ? tr("ui.index.user.b9e9555") : tr("ui.index.assistant.e7461b8")}: ${i === recent.length - 1 ? msgTextTail(m, 600) : msgText(m)}`,
    )
    .filter((s: string) => s.length > 3)
    .join("\n");
  const lastReplyTail = msgTextTail(last, 600); // 助手最后回复的结尾——预测下一步只认它
  const g = sessionGoals[id];
  const goalActive = !!(g && g.active);
  const goalBlock = goalActive ? g!.text.slice(0, 600) : ""; // 智能继续：会话总目标
  // 完整契约(计划节点+验收+规则)：每步回看它，防止跑着跑着丢初衷
  let charterExtra = "";
  if (goalActive) {
    const plan = g!.plan || [];
    if (plan.length) {
      // 树形计划序列化(缩进带层级)：编号如 1 / 1.2 / 1.2.3，带状态+验收
      const st = (s: PlanStep) => (s.status === "done" ? tr("ui.index.done.322615f") : s.status === "doing" ? tr("ui.index.doing.e743cc6") : tr("ui.index.todo.8f7a063"));
      const lines: string[] = [];
      const walk = (nodes: PlanStep[], prefix: string, indent: string) => {
        nodes.forEach((s, i) => {
          const no = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
          lines.push(`${indent}${no}. [${st(s)}] ${s.title}${s.acceptance ? tr("ui.index.acceptance.d0de53c", { p0: s.acceptance }) : ""}`);
          if (s.children?.length) walk(s.children, no, indent + "  ");
        });
      };
      walk(plan, "", "");
      charterExtra += tr("ui.index.plan.advance.node.by.node.with.744fadf") + lines.join("\n");
    }
    const doTxt = g!.rules?.do?.trim();
    const dontTxt = g!.rules?.dont?.trim();
    if (doTxt) charterExtra += tr("ui.index.must.do.84b3bd3") + doTxt.slice(0, 600);
    if (dontTxt) charterExtra += tr("ui.index.never.do.touching.these.means.drifting.dfae4fc") + dontTxt.slice(0, 600);
  }
  const sr = (isUneditedStopRules(stopRules) ? defaultStopRules() : stopRules).trim(); // 智能继续：红线(未改过按当前语言取默认)
  try {
    const res = await provider.complete(
      tr("ui.index.you.suggest.what.the.user.will.43d3a6a", { v0: (getCurrentLanguage() !== 'zh' ? undefined : (goalBlock
            ? "\n用户给这个对话定了总目标：" + goalBlock + charterExtra +
              "\n他已经授权你朝这个目标自主推进，所以【朝目标推进的常规步骤一律写 AUTO】，第1行就写出推进下一步该说的话(别问要不要，直接说做什么)。" +
              "\n定第1行前先对照上面的计划与规则自检：现在该落在哪个计划节点？上一步的产出达到那个节点的验收标准了吗(没达到就先补到达标，别急着往下跳)？有没有偏离总目标、或快要碰到「绝不做」？" +
              "——第1行必须是【最贴合当前计划节点、朝总目标推进且不跑偏】的下一步；一旦发现已经跑偏(在做计划外的、对总目标没意义的事)，第1行就直接写把方向拉回目标的纠正动作。只有下面 ASK 的红线才停。"
            : "")), v1: (getCurrentLanguage() !== 'zh' ? undefined : (sr ? "\n用户自己定的红线(命中就必须写 ASK，优先级最高)：\n" + sr : "")), v2: (getCurrentLanguage() !== 'zh' ? (goalBlock
            ? "\nThe user set an overall goal for this conversation: " + goalBlock + charterExtra +
              "\nThey authorized you to drive toward it autonomously, so [ordinary steps advancing the goal are always AUTO]; line 1 states the next step to take (don't ask whether — say what to do)." +
              "\nBefore writing line 1, self-check against the plan and rules above: which plan node should we be on now? Did the last step meet that node's acceptance criteria (if not, finish reaching it before jumping ahead)? Are we drifting from the goal or about to touch a [Never do]?" +
              "—— line 1 MUST be the next step that best fits the current plan node, advances the goal, and does not drift; the moment you notice drift (doing something off-plan and pointless for the goal), line 1 states the corrective action that steers back to the goal. Only the ASK redlines below stop you."
            : "") : undefined), v3: (getCurrentLanguage() !== 'zh' ? (sr ? "\nThe user's own redlines (hitting any one MUST be ASK, highest priority):\n" + sr : "") : undefined) }),
      [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: tr("ui.index.full.conversation.for.context.end.of.43273cf", { p0: convo, p1: lastReplyTail }),
            },
          ],
        },
      ] as any,
      [],
      {},
    );
    const whole = (res.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();
    const lines = whole.split("\n").map((s: string) => s.trim()).filter(Boolean);
    let raw = (lines[0] || "")
      .replace(/^["'「『]|["'」』]$/g, "")
      .slice(0, en ? 90 : 40); // 英文同样意思字符数是中文的两三倍，别拦腰截断
    // "无"/"none" = 没有明确的下一步 → 不显示建议条
    if (raw === "无" || raw === "无。" || /^none[.!]?$/i.test(raw)) raw = "";
    // 只有模型明确判定「纯推进确认」(第2行 AUTO)才允许智能继续自动接话；缺这行一律当 ASK
    const canContinue = /\bAUTO\b/i.test(lines[1] || "") && !!raw;
    send("evt:suggest", { sid: id, text: raw, canContinue });
  } catch {
    send("evt:suggest", { sid: id, text: "", canContinue: false });
  } finally {
    suggestInFlight.delete(id);
  }
}

// 界面主动要一次建议(切到某个会话、或用户点灯泡)——回合结束时那次是自动发的
ipcMain.handle("chat:suggest", async (_e, sid: string) => {
  await suggestNextAction(String(sid || ""));
});

// 智能识别红线：让模型判断"自主答这道选择题会不会真触发危险动作"(而非选项里提到词就拦)。
// 返回 {risky, reason}。给智能继续的"智能识别"模式用，比关键词匹配更少误伤。
ipcMain.handle("chat:judgeAskRisk", async (_e, questions: any[], rules?: string) => {
  if (!provider) return { risky: false, reason: "" };
  const blob = (questions || [])
    .map((q: any) => [q?.question, q?.header, ...((q?.options || []).map((o: any) => `${o?.label} ${o?.description || ""}`))].join(" "))
    .join("\n")
    .slice(0, 1500);
  const userRules = String(rules || "").trim().slice(0, 1500);
  try {
    const res = await provider.complete(
      tr("ui.index.you.are.safety.judge.below.is.0b74745", { v0: (getCurrentLanguage() !== 'zh' ? undefined : (userRules ? "\n用户还自定义了必须停下来问他的红线(每行一条，按【意思】判断，不是关键词，别因为选项里只是提到某个字就算命中)：\n" + userRules + "\n" : "")), v1: (getCurrentLanguage() !== 'zh' ? (userRules ? "\nThe user also set custom redlines (one per line) — judge by MEANING, not keywords; don't flag just because an option mentions a word:\n" + userRules + "\n" : "") : undefined) }),
      [{ role: "user", content: [{ type: "text", text: blob }] }] as any,
      [],
      {},
    );
    const whole = (res.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
    const lines = whole.split("\n").map((s: string) => s.trim()).filter(Boolean);
    const risky = /\bRISKY\b/i.test(lines[0] || "");
    return { risky, reason: risky ? (lines[1] || tr("ui.index.risky.action.e172e0c")) : "" };
  } catch {
    return { risky: false, reason: "" };
  }
});

// 翻译显示层：把中文动态内容(会话标题/员工名/消息正文)批量译成英文，仅供发英文版截图用。
// 纯覆盖显示，绝不写回任何底层数据。走当前已配置的 provider(与自动标题/风险判官同一条链路)，
// 免登录/免额度接口已停用故不能用；provider 缺失时原样返回中文，静默降级不报错。
ipcMain.handle("i18n:translate-batch", async (_e, texts: string[]) => {
  const list = Array.isArray(texts) ? texts.map((s) => String(s ?? "")) : [];
  if (!provider || list.length === 0) return list;
  try {
    const res = await provider.complete(
      "You are a professional Chinese→English translator for a software UI. You receive a JSON array of strings " +
        "(chat titles, employee/room names, or chat message bodies) that may be in Chinese. Translate each into natural, " +
        "concise English. Preserve any Markdown, code, numbers, URLs and placeholders. Keep the array order and length " +
        "IDENTICAL to the input. Return ONLY a JSON array of the translated strings — no prose, no explanation, no code fence.",
      [{ role: "user", content: [{ type: "text", text: JSON.stringify(list) }] }] as any,
      [],
      {},
    );
    const whole = (res.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();
    const jsonStr = whole
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    const arr = JSON.parse(jsonStr);
    if (Array.isArray(arr) && arr.length === list.length) {
      return arr.map((v: any, i: number) => (typeof v === "string" && v.trim() ? v : list[i]));
    }
    return list;
  } catch {
    return list; // 翻译失败 → 原样返回中文，界面继续可用
  }
});

function createWindow() {
  const b = loadWindowBounds(); // 上次窗口尺寸/位置
  // 窗口/任务栏图标：dev 下 electron.exe 用默认图标，显式指向 build/icon.png；
  // 打包版 build/ 不入包，文件不存在则跳过，自动回退到 exe 自带图标。
  const iconPath = join(__dirname, "../../build/icon.png");
  win = new BrowserWindow({
    width: b?.width ?? 960,
    height: b?.height ?? 720,
    ...(b?.x != null && b?.y != null ? { x: b.x, y: b.y } : {}),
    ...(existsSync(iconPath) ? { icon: iconPath } : {}),
    minWidth: 640,
    minHeight: 480,
    title: appDisplayName(), // 任务栏悬停显示的就是它，跟随界面语言
    backgroundColor: "#16191e", // 无为·玄墨黑，避免加载时白闪
    // 无边框自绘：mac 保留悬浮红绿灯(hiddenInset)，Windows/Linux 全去原生边框+菜单，标题栏自绘
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hiddenInset" as const }
      : { frame: false }),
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 记住窗口尺寸/位置（拖动节流保存 + 关闭时保存）
  let saveT: ReturnType<typeof setTimeout> | undefined;
  const persistBounds = () => {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      if (win && !win.isDestroyed()) saveWindowBounds(win.getBounds());
    }, 400);
  };
  win.on("resize", persistBounds);
  win.on("move", persistBounds);
  win.on("close", (event) => {
    if (win && !win.isDestroyed()) saveWindowBounds(win.getBounds());
    // 点 ✕ 不退出：拦截并隐藏到系统托盘常驻；只有托盘「退出」/before-quit 置 quitting=true 才放行真正退出。
    if (!quitting) {
      event.preventDefault();
      win?.hide();
    }
  });

  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) win.loadURL(devUrl);
  else win.loadURL("app://bundle/index.html");

  win.webContents.on("did-finish-load", () => {
    send("evt:ready", { backend: backendLabel, model: modelLabel, cwd, sub: subFlag, ctxWindow });
    bootstrapSessions();
    void emitAccount();
    const pid = loadSettings()?.providerId;
    if (pid) void silentRefreshAccount(pid); // 启动时用存的 token 静默刷新账号(不弹窗)
    // 连接已配置的 MCP 服务器，连上后把其工具热更进各会话
    if (loadMcpConfig().length) {
      void connectMcp(() => {
        refreshAgentTools();
        send("evt:mcp", mcpStatus());
      });
    }
  });
  // 诊断：把渲染进程报错/加载失败打到主进程 stdout，便于终端排查黑屏
  win.webContents.on("console-message", (_e, _lvl, message, line, src) => {
    console.log(`[renderer] ${message} (${src}:${line})`);
    log("renderer", `${message} (${src}:${line})`);
  });
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.log(`[did-fail-load] ${code} ${desc} ${url}`);
  });
}

// 单例锁：防御纵深——即使被意外多次启动也只存活一个实例，杜绝 fork bomb 类问题
const gotLock = app.requestSingleInstanceLock({ edition: EDITION });
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  // 自绘托盘右键菜单：原生 setContextMenu 的行高/hover 样式锁死在系统层无法定制(又大又丑、hover 贴边)，
  // 改用无框透明弹窗，走无为 VI(玄墨黑)、紧凑行高、hover 高亮带内边距+圆角。
  const TRAY_MENU_ITEMS = () => [
    {
      id: "show",
      label: tr("ui.index.show.main.window.da4e1bd"),
      // 线性窗口图标
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/></svg>`,
    },
    {
      id: "settings",
      label: tr("set.title"),
      // 线性齿轮图标
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    },
    {
      id: "check-update",
      label: tr("ui.index.check.for.updates.0cb1f6d"),
      // 线性向上箭头/升级图标
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V8"/><path d="m6 12 6-6 6 6"/><path d="M6 4h12"/></svg>`,
    },
    {
      id: "restart",
      label: tr("ui.index.restart.a6668d3"),
      // 线性刷新/重启图标
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v5h-5"/></svg>`,
    },
    { id: "sep" },
    {
      id: "quit",
      label: tr("ui.index.quit.9fbbec8"),
      danger: true,
      // 线性电源图标
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v8"/><path d="M6.3 7.3a8 8 0 1 0 11.4 0"/></svg>`,
    },
  ];
  const CARD_W = 180; // 卡片宽
  const SHADOW = 16; // 阴影/圆角留白（窗口比卡片大一圈，给 box-shadow 留空间）
  const ITEM_H = 38;
  const SEP_H = 9;
  const PAD_V = 6;
  function trayMenuSize() {
    const items = TRAY_MENU_ITEMS();
    const cardH = PAD_V * 2 + items.reduce((h, it) => h + (it.id === "sep" ? SEP_H : ITEM_H), 0);
    return { cardH, winW: CARD_W + SHADOW * 2, winH: cardH + SHADOW * 2 };
  }
  function trayMenuHtml(cardH: number) {
    const dark = nativeTheme.shouldUseDarkColors;
    // 无为 VI：玄墨黑底；亮色降级用近白卡片
    const c = dark
      ? { bg: "#1B1F26", border: "rgba(255,255,255,.08)", text: "#E6E8EC", sub: "#9AA0AA", hover: "rgba(255,255,255,.07)", sep: "rgba(255,255,255,.08)", danger: "#F0806B", dangerHover: "rgba(240,128,107,.12)" }
      : { bg: "#FFFFFF", border: "rgba(0,0,0,.08)", text: "#1B1F26", sub: "#6B7280", hover: "rgba(0,0,0,.05)", sep: "rgba(0,0,0,.07)", danger: "#D9503B", dangerHover: "rgba(217,80,59,.08)" };
    const rows = TRAY_MENU_ITEMS()
      .map((it) => {
        if (it.id === "sep") return `<div class="sep"></div>`;
        const cls = it.danger ? "row danger" : "row";
        return `<button class="${cls}" data-act="${it.id}"><span class="ico">${it.icon}</span><span class="lbl">${it.label}</span></button>`;
      })
      .join("");
    return `<!doctype html><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box;-webkit-user-select:none;user-select:none}
      html,body{background:transparent;overflow:hidden;font-family:"Segoe UI","Microsoft YaHei",system-ui,sans-serif}
      .card{position:fixed;left:${SHADOW}px;top:${SHADOW}px;width:${CARD_W}px;height:${cardH}px;
        background:${c.bg};border:1px solid ${c.border};border-radius:12px;
        box-shadow:0 8px 28px rgba(0,0,0,.32),0 2px 6px rgba(0,0,0,.18);
        padding:${PAD_V}px;display:flex;flex-direction:column;gap:2px;
        animation:pop .12s ease-out}
      @keyframes pop{from{opacity:0;transform:translateY(4px) scale(.98)}to{opacity:1;transform:none}}
      .row{display:flex;align-items:center;gap:10px;height:${ITEM_H}px;width:100%;
        margin:0 2px;padding:0 10px;border:0;border-radius:8px;background:transparent;cursor:pointer;
        color:${c.text};font-size:13px;text-align:left;transition:background .1s}
      .row:hover{background:${c.hover}}
      .row.danger{color:${c.danger}}
      .row.danger:hover{background:${c.dangerHover}}
      .ico{display:flex;width:16px;height:16px;color:${c.sub};flex:none}
      .row.danger .ico{color:${c.danger}}
      .row:hover .ico{color:currentColor}
      .ico svg{width:16px;height:16px}
      .lbl{flex:1}
      .sep{height:${SEP_H}px;margin:2px 8px;position:relative}
      .sep::after{content:"";position:absolute;left:0;right:0;top:50%;height:1px;background:${c.sep}}
    </style>
    <div class="card">${rows}</div>
    <script>
      const send=(a)=>{location.href='wuwei-tray:'+a};
      document.querySelectorAll('.row').forEach(b=>b.addEventListener('click',()=>send(b.dataset.act)));
      window.addEventListener('keydown',e=>{if(e.key==='Escape')send('close')});
    </script>`;
  }
  function ensureTrayMenu(): BrowserWindow {
    if (trayMenu && !trayMenu.isDestroyed()) return trayMenu;
    const { winW, winH } = trayMenuSize();
    trayMenu = new BrowserWindow({
      width: winW,
      height: winH,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      fullscreenable: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    trayMenu.setMenu(null);
    // 点菜单项：页面把动作塞进 wuwei-tray: 伪协议，这里拦下来执行，避免额外 preload
    trayMenu.webContents.on("will-navigate", (e, url) => {
      if (!url.startsWith("wuwei-tray:")) return;
      e.preventDefault();
      const act = url.slice("wuwei-tray:".length).replace(/\/+$/, "");
      trayMenu?.hide();
      if (act === "show") {
        win?.show();
        win?.focus();
      } else if (act === "settings") {
        win?.show();
        win?.focus();
        send("evt:tray-settings"); // 通知渲染层打开设置面板
      } else if (act === "check-update") {
        win?.show();
        win?.focus();
        send("evt:tray-check-update"); // 通知渲染层走检查更新流程(检查中/已最新/发现新版)
      } else if (act === "restart") {
        // 开发模式(electron-vite dev)下退化为「重载窗口」：那里 app.quit() 会把 vite dev server
        // 一并带走，relaunch 拉起的新实例再去 loadURL(ELECTRON_RENDERER_URL) 必然失败，
        // 只剩 backgroundColor 的纯色窗口——看着就是黑屏。重载渲染层效果等价，还不弄丢 dev server。
        if (process.env["ELECTRON_RENDERER_URL"]) {
          win?.show();
          win?.focus();
          win?.reload();
        } else {
          quitting = true; // 放行 close 事件
          app.relaunch(); // 退出后自动重新拉起
          app.quit();
        }
      } else if (act === "quit") {
        quitting = true; // 放行 close 事件，真正退出
        app.quit();
      }
    });
    trayMenu.on("blur", () => trayMenu?.hide()); // 点别处/失焦自动收起
    return trayMenu;
  }
  function popupTrayMenu() {
    const menu = ensureTrayMenu();
    const { winW, winH, cardH } = trayMenuSize();
    const cursor = screen.getCursorScreenPoint();
    const wa = screen.getDisplayNearestPoint(cursor).workArea;
    // 卡片水平居中对准鼠标、底边留 8px 间距浮在光标正上方，再整体夹进工作区
    const GAP = 8;
    let x = cursor.x - SHADOW - CARD_W / 2;
    let y = cursor.y - SHADOW - cardH - GAP;
    x = Math.min(Math.max(x, wa.x - SHADOW), wa.x + wa.width - winW + SHADOW);
    y = Math.min(Math.max(y, wa.y - SHADOW), wa.y + wa.height - winH + SHADOW);
    menu.setBounds({ x: Math.round(x), y: Math.round(y), width: winW, height: winH });
    menu.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(trayMenuHtml(cardH)));
    menu.show();
    menu.focus(); // 抢焦点，blur 才能触发自动收起
  }

  // 系统托盘（左键：显示主窗口；右键：自绘菜单）
  function createTray() {
    try {
      // 托盘专用多尺寸 ico：Windows 按 DPI 自动选最清晰的一档，别手动缩到 18(会糊)
      const iconFile = join(__dirname, "../../build/tray.ico");
      const img = nativeImage.createFromPath(iconFile);
      tray = new Tray(img);
      tray.setToolTip(appDisplayName());
      const showAndFocus = () => {
        if (win?.isVisible()) win.focus();
        else {
          win?.show();
          win?.focus();
        }
      };
      tray.on("click", showAndFocus); // 左键单击：显示并聚焦主窗口
      tray.on("double-click", showAndFocus); // 双击同理
      tray.on("right-click", popupTrayMenu); // 右键：自绘弹窗菜单
    } catch (e) {
      log("boot", "托盘创建失败", String(e));
    }
  }

  app.whenReady().then(() => {
    initializeFirstRunSettings();
    // 所有模型请求统一压缩发送副本：限制长边和编码字节，包含历史附件、截图和手机上传。
    // 小图保持原样；大图优先 PNG，必要时 JPEG/继续缩小，原始展示图不受影响。
    setImageCapper((dataUrl: string, maxEdge: number) => {
      try {
        return prepareModelImage(dataUrl, maxEdge, (url) => nativeImage.createFromDataURL(url));
      } catch {
        return dataUrl; // 解码/缩放失败就原样发，别因此卡死
      }
    });
    // M2 远程执行：手机端经 relay 发来 chat → 用本机 provider(含 Claude Code 订阅)跑一轮 agent，流式回传。
    // 复用桌面端现成的 Agent 机器，只是输入来自 relay、输出发回 relay（见 relay-client handleRemoteChat）。
    const remoteProvider = (channelId: string | null | undefined, existingId?: string | null, model?: string | null) => {
      const settings = loadSettings();
      const meta = existingId ? listSessions().find(session => session.id === existingId) : undefined;
      const selection = resolveRemoteSelection(detectChannels(settings), channelId, model);
      if (!remoteShareSubscription(settings) && (!selection && ['claude-oauth', 'codex'].includes(meta?.providerId || settings?.providerId || '')))
        throw new Error(tr("ui.index.message.7994dc5197"));
      let selected = selection ? null : providerForSession(existingId || '', true);
      if (selection && settings) {
        const ch = selection.channel, slot = settings.creds?.[ch.providerId] || {};
        try {
          applyEnvFromSettings({ ...settings, providerId: ch.providerId, kind: ch.providerKind, model: selection.model,
            apiKey: slot.apiKey || (settings.providerId === ch.providerId ? settings.apiKey : undefined),
            oauthToken: slot.oauthToken || (settings.providerId === ch.providerId ? settings.oauthToken : undefined),
            baseUrl: slot.baseUrl || (settings.providerId === ch.providerId ? settings.baseUrl : undefined) });
          selected = makeProvider(loadConfig());
        } finally { applyEnvFromSettings(settings); }
      }
      if (!selected) throw new Error(tr("ui.index.message.45c0bf73aa"));
      return { provider: selected, selection };
    };
    setRemoteExecutor(async args => {
      let remoteSid = '';
      await ensureFreshClaudeOAuth();
      const remoteSettings = loadSettings();
      const employee = args.employeeId && !args.sessionId ? loadEmployees().find(item => item.id === args.employeeId) : undefined;
      if (args.employeeId && !args.sessionId && (!teamEnabled(remoteSettings) || !employee)) throw new Error(tr("ui.index.message.a20e780624"));
      const employeeBinding = !args.channelId && !args.model ? employee?.model : undefined;
      if (employeeBinding && !remoteShareSubscription(remoteSettings) && ['claude-oauth', 'codex'].includes(employeeBinding.providerId)) throw new Error(tr("ui.index.message.e0fccfc9ef"));
      const choice = employeeBinding ? { provider: providerForEmployee(employee!), selection: null } : remoteProvider(args.channelId, args.sessionId, args.model);
      const selected = choice.provider;
      if (!selected) throw new Error(tr("ui.index.message.9776823cfb"));
      const selectedBinding = choice.selection?.channel.providerId || employeeBinding?.providerId;
      const permission = args.onPermission ? async (name: string, input: unknown): Promise<'allow' | 'deny'> => (await args.onPermission!(name, input)).action === 'allow' ? 'allow' : 'deny' : undefined;
      const toolNames = new Map<string, string>();
      const result = await runRemoteSessionTurn({
        sessionId: args.sessionId, text: secrets.redact(args.text).text, images: args.images, signal: args.signal,
        onSession: id => args.onSession?.(id),
        hooks: {
          requestDecision: args.requestDecision,
          remoteExecution: { signal: args.signal, shareSubscription: remoteShareSubscription(remoteSettings), requestDecision: args.requestDecision, requestPermission: permission },
          onUsage: usage => { if (remoteSid === currentId) send('evt:usage', usage); },
          onTurnEnd: turnId => taskReports.closeTurn(turnId),
          onText: delta => { args.onDelta(delta); send('evt:assistant-delta', { sid: remoteSid, delta }); },
          onToolStart: (id, name, input) => { toolNames.set(id, name); args.onTool?.(name, input); send('evt:tool-start', { sid: remoteSid, id, name, input }); },
          onToolEnd: (id, result, isError, image) => { args.onToolEnd?.(toolNames.get(id) || '', result, isError); toolNames.delete(id); send('evt:tool-end', { sid: remoteSid, id, result, isError, image }); if (image) args.onImage?.(image); },
          requestPermission: args.onPermission ? async (tool, input) => (await args.onPermission!(tool.name, input)).action === 'allow' ? 'allow' : 'deny' : undefined,
          onRateLimits: limits => { saveRateLimits(selectedBinding || backendBySid.get(remoteSid) || curProviderId(), limits); send('evt:ratelimits', limits); },
          onContextWindow: contextWindow => send('evt:context-window', { sid: remoteSid, contextWindow }),
          onCompactArchive: messages => archiveMessages(remoteSid, messages),
        },
      }, {
        running: runs, exists: id => listSessions().some(session => session.id === id),
        prepare: async id => {
          remoteSid = id;
          if (selectedBinding) {
            const settings = loadSettings();
            const slot = settings?.creds?.[selectedBinding] || {};
            setSessionBinding(id, { providerId: selectedBinding, kind: choice.selection?.channel.providerKind || (settings ? providerKindForId(selectedBinding, settings) : undefined),
              model: choice.selection?.model || employeeBinding!.model, baseUrl: slot.baseUrl || (settings?.providerId === selectedBinding ? settings.baseUrl : undefined) });
            backendBySid.set(id, selectedBinding);
          }
          if (args.employeeId && !args.sessionId) {
            if (!teamEnabled(loadSettings())) throw new Error(tr("ui.index.message.a5a64df91c"));
            if (!employee) throw new Error(tr("ui.index.message.002d906733"));
            setSessionEmployee(id, employee.id, employee.name);
          }
          const agent = getAgent(id);
          if (!agent) throw new Error(tr("ui.index.message.2ee7195362"));
          agent.setProvider(selected); agent.setSystem(sysForSession(id) + '\n\n当前用户通过手机远程操控。需要用户选择时使用 ask_decision，提供白话问题与 2~3 个选项；重要或不可逆操作设为 high 并等待回复。');
          await ensureHostedProviderReady(id);
          return agent;
        },
        persist: id => { persistQuiet(id); },
        changed: (id, agent) => {
          emitTasks(); send('evt:sessions', listSessions());
          if (id === currentId) send('evt:session-loaded', { id, messages: agent.getMessages() });
        },
      });
      persist(result.sessionId); send('evt:done', { sid: result.sessionId });
      conversationReports.drain(result.sessionId);
      return result;
    });
    setRemoteRoomExecutor(async args => {
      if (!teamEnabled(loadSettings())) throw new Error(tr("ui.index.message.a5a64df91c"));
      const choice = args.channelId || args.model ? remoteProvider(args.channelId, undefined, args.model) : undefined;
      const selected = choice?.provider;
      await runRemoteRoomTurn(args, {
        ...teamOrchestratorDeps(),
        room: id => loadRooms().find(room => room.id === id), history: loadRoomMessages,
        running: isRoomRunning, run: runRoomTurn, abort: abortRoom,
        runEmployee: employeeArgs => {
          const providerId = employeeArgs.employee.model?.providerId || loadSettings()?.providerId;
          if (!selected && !remoteShareSubscription(loadSettings()) && ['claude-oauth', 'codex'].includes(providerId || ''))
            throw new Error(tr("ui.index.message.e0fccfc9ef"));
          return runEmployeeTurn({ ...employeeArgs, providerOverride: selected, providerBinding: choice?.selection ? { providerId: choice.selection.channel.providerId, model: choice.selection.model } : undefined, remoteExecution: { signal: args.signal, shareSubscription: remoteShareSubscription(loadSettings()), requestDecision: args.requestDecision, requestPermission: args.onPermission ? async (name, input) => (await args.onPermission!(name, input)).action === 'allow' ? 'allow' : 'deny' : undefined } });
        },
      });
    });
    // 通用请求处理器(不落库同步)：手机问「会话列表/某会话分页历史」→ 读本机数据返回。团队(员工/群/SOP)后续补。
    setRemoteRequestHandler(async (method, params) => {
      if (method === "sessions.list") {
        // 只给普通会话(排除一人公司员工私聊，那些归 team)；按更新时间倒序
        const list = listSessions()
          .filter((s: any) => !s.employeeId)
          .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))
          .map((s: any) => ({ id: s.id, title: s.title || tr("ui.app.new.chat.fca06b0"), updatedAt: s.updatedAt || 0,
            run: runs.has(s.id) ? 'running' : 'idle', model: s.model, providerId: s.providerId,
            lastMessage: (agents.get(s.id)?.getDisplayMessages() || loadMessages(s.id)).flatMap((m: any) => m.content || []).filter((b: any) => b.type === 'text').at(-1)?.text?.slice(0, 160) || '' }));
        return { sessions: list };
      }
      if (method === "sessions.messages") {
        const sid = String(params?.sessionId || "");
        if (!sid) throw new Error(tr("ui.index.message.ba6390b6bf"));
        const all = agents.get(sid)?.getDisplayMessages() || loadMessages(sid);
        const { total, start, end, hasMore, nextOffset } = remoteHistoryBounds(all.length, params || {});
        const page = all.slice(start, end).map((m: any, i: number) => flattenRemoteMsg(m, start + i)).filter(m => m.text || m.image);
        const meta = listSessions().find(s => s.id === sid);
        return { messages: page, hasMore, total, nextOffset,
          meta: meta ? { title: meta.title, model: meta.model, providerId: meta.providerId, employeeName: meta.employeeId && teamEnabled(loadSettings()) ? loadEmployees().find(e => e.id === meta.employeeId)?.name : undefined, employeeId: meta.employeeId } : undefined };
      }
      // ── 一人公司同步 ──
      if (method === "team.state") {
        if (!teamEnabled(loadSettings())) return { enabled: false, employees: [], groups: [], departments: [] };
        const sess = listSessions();
        const employees = loadEmployees().map((e: any) => {
          // 该员工最近的一条「你和他的对话」会话 id，供手机点进去看历史
          const latest = sess.filter((s: any) => s.employeeId === e.id).sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
          return { id: e.id, name: e.name, title: e.title || "", blurb: e.blurb || "", icon: e.icon || "", avatarData: e.avatarData || "", sessionId: latest?.id || "", model: e.model || { providerId: curProviderId(), model: loadConfig().model } };
        });
        const groups = loadRooms()
          .filter((r: any) => r.type !== "dm")
          .map((r: any) => ({ id: r.id, name: r.name, memberIds: r.members || [], lastText: r.lastText || "" }));
        return { enabled: true, employees, groups, departments: loadDepartments() };
      }
      if (method === "team.room.messages") {
        const rid = String(params?.roomId || "");
        if (!rid) throw new Error(tr("ui.index.message.6e52bffecf"));
        const all = loadRoomMessages(rid);
        const { total, start, end, hasMore, nextOffset } = remoteHistoryBounds(all.length, params || {});
        const page = all.slice(start, end).map((m: any) => ({ id: m.id, speaker: m.speaker?.name || "", kind: m.speaker?.kind || "agent", text: m.text || "", images: m.images, error: !!m.error }));
        return { messages: page, hasMore, total, nextOffset };
      }
      if (method === 'team.room.usage') {
        const room = loadRooms().find(room => room.id === params?.roomId);
        if (!room || !teamEnabled(loadSettings())) throw new Error(tr("ui.index.message.1593ac90c8"));
        const settings = loadSettings();
        const selected = resolveRemoteSelection(detectChannels(settings), params?.channelId, params?.model);
        return { items: loadEmployees().filter(employee => room.members.includes(employee.id)).map(employee => {
          const providerId = selected?.channel.providerId || employee.model?.providerId || curProviderId();
          const subscription = ['claude-oauth', 'codex'].includes(providerId);
          const model = selected?.model || employee.model?.model || settings?.creds?.[providerId]?.model || (providerId === curProviderId() ? loadConfig().model : '');
          const snapshot = roomContextUsage.get(`${room.id}:${employee.id}`);
          const matching = snapshot?.providerId === providerId && snapshot?.model === model;
          return { employeeId: employee.id, employeeName: employee.name, providerId, model,
            kind: subscription ? 'subscription' : 'api-key', available: !subscription || remoteShareSubscription(settings),
            quota: subscription && remoteShareSubscription(settings) ? loadRateLimits(providerId) : null,
            context: { usedTokens: matching ? snapshot.usedTokens : null, maxTokens: matching ? snapshot.maxTokens : null }, capturedAt: matching ? snapshot.capturedAt : null };
        }) };
      }
      if (method === "sop.tree") {
        return { tree: sopLoadTree() };
      }
      if (method === "sop.read") {
        const id = String(params?.id || "");
        if (!id) throw new Error(tr("ui.index.message.c5a6c9e5dd"));
        return { id, content: sopReadDoc(id) || "" };
      }
      if (method === "tasks.running") {
        // 本机正在跑的会话(runs Map)→给手机「进度」tab 显示真任务
        const metas = listSessions();
        const tasks = [...runs.keys()].map((id) => {
          const m = metas.find((s: any) => s.id === id);
          return { id, title: m?.title || tr("ui.index.message.b094e4ee0b"), employeeId: m?.employeeId || null, updatedAt: m?.updatedAt || 0 };
        });
        const groups = loadRooms().filter(room => room.type !== 'dm' && isRoomRunning(room.id)).map(room => ({ id: room.id, title: room.name, kind: 'room', employeeId: null, updatedAt: room.updatedAt || 0 }));
        const batches = taskReports.snapshots(true).map(batch => ({ id: batch.scope.turnId, title: tr("ui.index.message.db6a515b77", {p0: batch.scope.ownerName}), kind: 'batch', employeeId: batch.scope.ownerId, updatedAt: batch.updatedAt }));
        return { tasks: [...tasks, ...groups, ...batches] };
      }
      if (method === 'tasks.history') return { tasks: taskReports.snapshots().filter(b => !['working', 'reporting'].includes(b.phase)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30).map(b => ({ id: b.scope.turnId, title: tr("ui.index.message.db6a515b77", {p0: b.scope.ownerName}), kind: 'batch', employeeId: b.scope.ownerId, updatedAt: b.updatedAt, status: remoteBatchTaskDetail(b).status })) };
      if (method === 'tasks.detail' || method === 'tasks.stop' || method === 'sessions.usage') {
        const id = String(params?.sessionId || params?.id || '');
        if (params?.kind === 'batch' && method !== 'sessions.usage') {
          const batch = taskReports.snapshots().find(b => b.scope.turnId === id);
          if (!batch) throw new Error(tr("ui.index.message.d12b69aa17"));
          if (method === 'tasks.stop') {
            if (batch.phase === 'reporting') throw new Error(tr("ui.index.message.b00a1533a2"));
            const stopped = taskReports.cancel(id);
            return { stopped, running: taskReports.snapshots(true).some(b => b.scope.turnId === id) };
          }
          return { ...remoteBatchTaskDetail(batch), outputs: remoteArtifacts.listTurn(id) };
        }
        if (params?.kind === 'room' && method !== 'sessions.usage') {
          const room = loadRooms().find(r => r.id === id && r.type !== 'dm');
          if (!room) throw new Error(tr("ui.index.message.e8c5925845"));
          if (method === 'tasks.stop') { const wasRunning = isRoomRunning(id); const cancelled = taskReports.cancelOrigin('room', id); abortRoom(id); return { stopped: wasRunning || cancelled, running: isRoomRunning(id) || taskReports.hasPendingOrigin('room', id) }; }
          return remoteRoomTaskDetail(room, loadRoomMessages(id), isRoomRunning(id));
        }
        const meta = listSessions().find(s => s.id === id);
        if (!meta) throw new Error(tr("ui.index.message.9f8f2405c5"));
        const agent = agents.get(id);
        if (method === 'tasks.stop') {
          const cancelled = taskReports.cancelOrigin('session', id);
          if (!runs.has(id)) return { stopped: cancelled, running: taskReports.hasPendingOrigin('session', id) };
          contSessions.delete(id); send('evt:cont-off', { sid: id });
          runs.get(id)?.abort();
          return { stopped: true, running: true }; // abort requested; next poll confirms actual completion
        }
        if (method === 'sessions.usage') {
          const providerId = meta.providerId || backendBySid.get(id) || curProviderId();
          const subscription = ['claude-oauth', 'codex'].includes(providerId);
          if (subscription && !remoteShareSubscription(loadSettings())) throw new Error(tr("ui.index.message.38b70a1836"));
          const used = agent?.getUsage() || meta.usage;
          return { kind: subscription ? 'subscription' : 'api-key', quota: subscription ? loadRateLimits(providerId) : null,
            context: { usedTokens: used && used.lastInput > 0 ? used.lastInput : null, maxTokens: agent?.getContextBudget().contextWindow || null } };
        }
        return remoteTaskDetail(meta, agent?.getDisplayMessages() || loadMessages(id), runs.has(id),
          meta.employeeId ? loadEmployees().find(e => e.id === meta.employeeId)?.name || tr("ui.app.teammates.661ab3c") : 'AI');
      }
      if (method === 'artifacts.read') {
        const origin = params?.origin;
        if (!origin || !['session', 'room'].includes(origin.kind) || typeof origin.id !== 'string') throw new Error(tr("ui.index.message.58a3d3df55"));
        if (origin.kind === 'session' ? !listSessions().some(s => s.id === origin.id) : !loadRooms().some(r => r.id === origin.id)) throw new Error(tr("ui.index.message.f1598f041e"));
        return remoteArtifacts.read(String(params?.id || ''), origin, params?.offset, params?.length);
      }
      throw new Error(tr("ui.index.message.18265fa4ba") + method);
    });
    syncTeamModule(loadSettings()); // 可选模块：开了才挂，没开这行之后不留任何痕迹
    loadGoals(); // 智能继续：会话总目标(userData/session-goals.json)
    loadStopRules(); // 智能继续：自定义红线(userData/stop-rules.txt，首次给默认)
    // app://bundle/xxx → out/renderer/xxx（打包后 renderer 与 main 同级 out 下）
    protocol.handle("app", async (request) => {
      const { pathname } = new URL(request.url);
      const rel = pathname === "/" || pathname === "" ? "/index.html" : pathname;
      const filePath = join(__dirname, "../renderer", rel);
      const res = await net.fetch(pathToFileURL(filePath).toString());
      const type = mimeFor(rel);
      if (type) {
        const headers = new Headers(res.headers);
        headers.set("content-type", type);
        return new Response(res.body, { status: res.status, headers });
      }
      return res;
    });
    Menu.setApplicationMenu(null); // 去掉原生菜单栏(File/Edit/View/Window)
    try {
      initProvider();
    } catch {
      // 凭证等问题：窗口起来后提示
    }
    // 任务栏图标/分组标识：必须在创建窗口【之前】设置，Windows 才会把窗口归到无为身份下。
    try {
      app.setName(APP_NAME);
      // ⚠️ 必须与打包 appId(package.json build.appId = com.wuwei.app)一致，
      //    否则安装版快捷方式的 AppUserModelId 与运行时不匹配，任务栏图标关联不上、回退默认图标。
      if (process.platform === "win32") app.setAppUserModelId(APP_ID);
    } catch {
      /* ignore */
    }
    createWindow();
    createTray();
    setupUpdater(); // 自动更新：启动后延迟静默查一次
    startClientTelemetry(); // 客户端埋点：首次安装报 install + 启动即报 heartbeat + 每 6h 补报（后台算 DAU/留存/安装量）
    scheduleClaudeRefresh(); // Claude 订阅：按 token 过期时间排一次性续期(过期前3分钟触发)，不轮询、不频繁调续期接口
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

// —— 客户端匿名遥测（日活/安装/使用时长）——
// 隐私红线：只上报匿名设备指纹+版本+平台+active 标志，绝不带任何个人数据。用于后台算 DAU/留存/安装量/时长。
// install：每台设备只报一次（userData 下打标记文件）。
// heartbeat：启动即报 + 每 5 分钟补报一次，每次带 active（窗口是否可见且聚焦）：
//   - 后台按「当天心跳首末时间差」算「开机时长」（进程活着就在报）；
//   - 按「active=true 的心跳条数 × 5 分钟」算「活跃时长」（真正在用，最小化/挂后台不计）。
// 5 分钟频率：一台机器一天最多 288 条，数据量可控，时长误差 ≤±5 分钟。
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
// 一次应用启动 = 一个会话 ID，把这次打开客户端的所有行为事件串成一条路径（产品行为埋点用）
const APP_SESSION_ID = randomUUID();
// 本次心跳是否「活跃」：主窗口存在、可见、未最小化、且当前聚焦。取不到窗口时保守按 false（只算开机不算活跃）。
function isClientActive(): boolean {
  try {
    return !!win && !win.isDestroyed() && win.isVisible() && !win.isMinimized() && win.isFocused();
  } catch {
    return false;
  }
}
function startClientTelemetry(): void {
  try {
    // 测试版给版本号打 -test 后缀，后台埋点一眼可辨、不污染正式版留存/安装统计。
    const version = IS_TEST ? `${app.getVersion()}-test` : app.getVersion();
    // 首次安装标记：userData/.installed 不存在 → 报一次 install 并落标记
    const flag = join(app.getPath("userData"), ".installed");
    if (!existsSync(flag)) {
      void reportClientEvent("install", version, false, loadWuweiSession()?.accessToken ?? null);
      try {
        writeFileSync(flag, new Date().toISOString());
      } catch {
        /* 落标记失败：下次可能重报 install，可接受（后台可去重） */
      }
    }
    // 启动即报一次心跳（带当前活跃态）
    void reportClientEvent("heartbeat", version, isClientActive(), loadWuweiSession()?.accessToken ?? null);
    // 产品行为埋点：打开客户端（一次会话开始）
    void trackProductEvent("app_open", { sessionId: APP_SESSION_ID, version, accessToken: loadWuweiSession()?.accessToken ?? null });
    // 诊断日志：按用户「发送诊断信息」开关(默认开)决定是否上报；启动上报一条 app_start
    setDiagConsent(telemetryEnabled(loadSettings()));
    void trackClientLog("info", "app_start", { version, accessToken: loadWuweiSession()?.accessToken ?? null, meta: { session_id: APP_SESSION_ID, os: `${process.platform} ${process.arch}`, osVer: process.getSystemVersion?.() ?? "", electron: process.versions.electron } });
    // 每 5 分钟补报，覆盖长时间挂机用户 + 累积活跃时长；unref 不阻止进程退出
    heartbeatTimer = setInterval(() => void reportClientEvent("heartbeat", version, isClientActive(), loadWuweiSession()?.accessToken ?? null), HEARTBEAT_INTERVAL_MS);
    if (heartbeatTimer.unref) heartbeatTimer.unref();
  } catch {
    /* 遥测不能拖累启动 */
  }
  // 手机端远程执行relay连接:仅当用户开了允许手机端远程调用本机才真正连(内部已判断,默认关=不连)
  try { startRelayClient(); } catch { /* relay连接失败不拖累启动 */ }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
// 退出前把异步合并写里还没落盘的会话同步刷完，别丢最后一段
app.on("before-quit", () => {
  try { stopRelayClient(); } catch { /* ignore */ }
  quitting = true; // 自动更新 quitAndInstall / 系统关机等触发退出时放行 close，避免卡在托盘隐藏无法退出
  // 诊断日志：退出 —— 本次会话时长，配合 app_start 看使用时长
  try {
    void trackClientLog("info", "app_exit", { version: app.getVersion(), accessToken: loadWuweiSession()?.accessToken ?? null, meta: { session_id: APP_SESSION_ID, uptime_s: Math.round(process.uptime()) } });
  } catch { /* ignore */ }
  try {
    flushAllSessionsSync();
  } catch {
    /* ignore */
  }
  stopBabyServer(); // 关掉数字婴儿常驻服务子进程
});

// —— IPC：渲染 → 主 ——
// 多任务：sid 指定跑哪个会话(前端传 currentId)，各会话各自异步、互不阻塞。事件都带 sid，前端只把当前可见会话的更新画出来。
// 无为托管平台(走网关、按 token 扣无为币)：providerId 以 "wuwei-" 开头。
function isHostedProvider(pid?: string): boolean {
  return !!pid && pid.startsWith("wuwei-");
}
// anon(免登录免费体验)平台：未登录也可见/可用，走网关匿名分支。内置 wuwei-free；
// 后台若新增其它 anon 平台，会在拉 catalog 时补进此集合（见 account:wuwei-catalog）。
const anonProviderIds = new Set<string>(["wuwei-free"]);
function isAnonProvider(pid?: string): boolean {
  return !!pid && anonProviderIds.has(pid);
}
// 无为会话统一取新：所有要用 token 的地方都走这里。
// 为什么要收口：Supabase 的 refresh_token 是「一次性轮换」——用一次就换新的、旧的立刻作废。
// 过去 injectWuwei / wuwei-me / pay:create / pay:status 各自独立 refresh，一旦并发（如启动拉 me 时点了充值），
// 第二个用的就是已被轮换作废的旧 refresh_token → 后端 refresh_failed → 误清会话 → 表现为「登录莫名很快就过期」。
// 这里用「在途 Promise 单飞」让并发只跑一次 refresh，并提前 90s 主动续期，access_token 永不踩着过期线用。
// 显式登出标志：用户主动退出后置真，掐断一切后台 me 拉取/推送/续期回写(否则迟到的刷新会把登录态复活，需退两次)。
// 任何一次成功登录都清零(见各登录 handler)。
const wuweiSessionState = createHostedSessionState({
  load: loadWuweiSession, save: saveWuweiSession, clear: clearWuweiSession,
  refresh: wuweiRefresh,
  onExpired: () => {
    loginReportedThisProc = false;
    try { stopRelayClient(); } catch { /* ignore */ }
    applyProFromMe(null);
    send("evt:wuwei-auth-expired");
  },
});
const getFreshWuweiSession = (rejectedAccessToken?: string) => wuweiSessionState.get(rejectedAccessToken);
// 客户端登录埋点上报：登录成功即报；启动/运行期检测到有效会话每进程只报一次(loginReportedThisProc 节流)，
// 避免 account:wuwei-me 被反复调用(启动拉账号、扣币刷余额)时重复上报把「登录数」灌水。显式登出后重置，重登会再报。
let loginReportedThisProc = false;
function reportLoginOnce(): void {
  if (loginReportedThisProc) return;
  loginReportedThisProc = true;
  const tok = loadWuweiSession()?.accessToken ?? null;
  void reportClientLogin(app.getVersion(), tok);
  // 诊断日志：登录 关键节点
  try { void trackClientLog("info", "action", { version: app.getVersion(), accessToken: tok, meta: { node: "login" } }); } catch { /* ignore */ }
}
// 托管平台每轮开跑前：把网关的 apiKey 注入并重建 provider。
//  - 已登录：apiKey = 新鲜的无为 access_token(快过期先续期) → 按 token 扣无为币。
//  - 未登录：apiKey = anon-<设备id> → 匿名试用分支(仅 anon 平台的 free 模型可用，网关按设备/IP 每日护栏)。
// targetSid：只把新鲜网关 token 的 provider 热更给「这一个即将开跑的会话」——保持完全独立，别顺手把别的会话
// (可能绑在别的平台/别的托管模型)也换掉。不传(如连通性 ping)则只重建全局 provider、不动任何会话。
async function ensureHostedProviderReady(targetSid?: string): Promise<void> {
  const st = loadSettings();
  if (!st) return;
  // 方案B：按「目标会话自己的绑定」判定用不用托管、用哪个托管模型——不再读全局(否则全局一漂就把
  // 正在跑的托管会话换成别人的模型，这正是免费模型串会话的运行时元凶)。无 targetSid(连通性 ping)才看全局。
  const meta = targetSid ? listSessions().find((x) => x.id === targetSid) : null;
  const effProviderId = meta?.providerId || st.providerId;
  if (!isHostedProvider(effProviderId)) return;
  const sess = await getFreshWuweiSession();
  if (!sess && !isAnonProvider(effProviderId)) {
    send("evt:wuwei-auth-expired");
    throw new Error(tr("ui.index.your.session.has.expired.please.sign.3bf7b7e"));
  }
  const key = sess ? sess.accessToken : `anon-${getDeviceId()}`; // 未登录 → 匿名试用 token
  // 目标会话有自己完整身份 → 用它的身份 + 新鲜网关 token 重建「它自己的」provider，绝不动全局/别的会话
  if (targetSid && meta && meta.model && meta.providerId) {
    const slot = (st.creds || {})[meta.providerId] || {};
    const sSettings: Settings = {
      ...st,
      providerId: meta.providerId,
      kind: (meta.kind as Settings["kind"]) || st.kind,
      model: meta.model,
      baseUrl: meta.baseUrl ?? slot.baseUrl ?? st.baseUrl,
      apiKey: slot.apiKey,
      oauthToken: slot.oauthToken,
    };
    try {
      applyEnvFromSettings(sSettings);
      process.env.WUWEI_API_KEY = key; // 网关 key 必须在 applyEnvFromSettings 之后覆盖(它会清 MINICC_API_KEY)
      process.env.MINICC_API_KEY = key;
      const p = makeProvider(loadConfig());
      const a = agents.get(targetSid);
      if (a) { a.setProvider(p); backendBySid.set(targetSid, meta.providerId); }
    } finally {
      applyEnvFromSettings(st); // 还原全局 env
      process.env.WUWEI_API_KEY = key;
      process.env.MINICC_API_KEY = key;
    }
    return;
  }
  // 无 targetSid 或会话未绑定 → 老逻辑：只按全局重建全局 provider(+可选热更目标会话)
  applyEnvFromSettings(st); // 平台 baseUrl(网关)等按设置
  process.env.WUWEI_API_KEY = key; // 网关的"key"(只 env、不落 config)
  process.env.MINICC_API_KEY = key; // 兼容：config.ts 仍读旧名，过渡期内双写
  provider = makeProvider(loadConfig());
  if (targetSid) {
    const a = agents.get(targetSid);
    if (a) { a.setProvider(provider); backendBySid.set(targetSid, st.providerId || ""); }
  }
}
// 托管平台每轮结束后：拉最新余额推给渲染层(账号菜单余额随扣币刷新)。
// 会员态变更 → 脑网络可用性变 → 热更所有会话的工具集 + 系统提示（brain_* 与说明随之加/摘）。
function applyProFromMe(_me: WuweiMe | null): void { /* Brain is free; membership does not alter tools. */
}
async function refreshWuweiMe(): Promise<void> {
  // Background refresh must not turn a temporary outage into an unhandled rejection.
  const sess = await getFreshWuweiSession().catch(() => null);
  if (!sess) return;
  const me = await wuweiFetchMe(sess.accessToken);
  if (me && me !== "unauthorized" && loadWuweiSession()?.accessToken === sess.accessToken) {
    applyProFromMe(me);
    send("evt:wuwei-me", me);
  }
}

async function startTurn(useId: string, text: string, images?: string[], sysOverride?: string) {
  turnSid = useId; // 供 ask_user 工具的事件带上会话 id
  text = secrets.redact(text).text; // 兜底：已入库密钥出现在消息里→占位符替换，永不出网到模型
  const agent = getAgent(useId);
  if (!agent) {
    send("evt:error", { sid: useId, message: tr("ui.index.not.initialized.missing.model.credentials.check.83d6b2c") });
    return;
  }
  if (runs.has(useId)) {
    // 该会话已在跑(上一条可能挂住/未返回，如没权限的型号请求卡住)——不再静默丢弃，
    // 给用户明确提示可「停止」后重发，避免"发了没反应"的困惑。
    send("evt:error", { sid: useId, message: tr("ui.index.the.previous.message.is.still.running.1df61c0") });
    return;
  }
  // 每轮开跑前刷新系统提示词，让上一轮 remember 写入的记忆立即生效(日报等场景用 sysOverride 注入聚合内容)
  send("evt:context-window", { sid: useId, ...agent.getContextBudget() });
  const imageSettings = loadSettings();
  const selectedImageSku = imageSettings?.imageMode && !sysOverride ? imageSettings.imageSku : undefined;
  agent.setSystem((sysOverride ?? sysForSession(useId)) + (selectedImageSku ? tr("ui.index.the.user.selected.image.mode.with.768f21e", { p0: selectedImageSku }) : ""));
  const ac = new AbortController();
  runs.set(useId, ac);
  emitTasks();
  // 长命令/长工具心跳：一条工具正在执行时(onToolStart↔onToolEnd 之间)会长时间无任何流式事件，
  // 渲染端自主推进看门狗会把它误判成僵死→重复自动续跑→撞本函数守卫报"上一条还在处理中"。
  // 这里在「有工具正在跑」时每 25s 发个带 sid 的心跳,刷新看门狗活动时间;工具没在跑(如模型 socket 挂死)则不发,
  // 看门狗照常到阈值救援——精准区分"合法长静默"与"真卡死"。
  let toolDepth = 0;
  const hb = setInterval(() => { if (toolDepth > 0 && runs.get(useId) === ac) send("evt:heartbeat", { sid: useId }); }, 25000);
  const turnT0 = Date.now(); // 本轮耗时起点（诊断日志 api_call.ms 用）
  try {
    // 先占住会话运行态再等待凭证准备，避免用户消息与后台汇报同时穿过空闲检查。
    await ensureFreshClaudeOAuth();
    await ensureHostedProviderReady(useId);
    if (selectedImageSku && images?.length) throw new Error(tr("ui.index.these.image.presets.accept.text.only.5ec50c2"));
    const runP = (selectedImageSku
      ? (input: string, hooks: Parameters<Agent['send']>[1], signal?: AbortSignal) => agent.sendImage(input, selectedImageSku, hooks, signal)
      : agent.send.bind(agent))(
      text,
      {
        preferredImageSku: selectedImageSku,
        onTurnEnd: (turnId) => taskReports.closeTurn(turnId),
        onContextWindow: (contextWindow) => send("evt:context-window", { sid: useId, contextWindow }),
        onText: (delta) => {
          send("evt:assistant-delta", { sid: useId, delta });
          streamDrafts.set(useId, (streamDrafts.get(useId) || "") + delta); // 累积半截
          saveDraftThrottled(useId); // 节流落盘：重启不丢正在生成的内容
        },
        onStep: () => {
          streamDrafts.delete(useId); // 该段已进历史，清草稿
          persistQuiet(useId); // 即时落盘真实消息(每段/每工具轮)
        },
        onRecover: (cleaned) => {
          streamDrafts.delete(useId);
          send("evt:assistant-replace", { sid: useId, text: cleaned }); // 前端把泄漏的 XML 换成干净正文
        },
        onToolStart: (id, name, input) => { toolDepth++; send("evt:tool-start", { sid: useId, id, name, input }); },
        onToolEnd: (id, result, isError, image) => { toolDepth = Math.max(0, toolDepth - 1); send("evt:tool-end", { sid: useId, id, result, isError, image }); },
        requestDecision: requestDesktopDecision(useId, ac.signal),
        requestPermission: (tool, input) => {
          const id = ++permSeq, permId = randomUUID();
          pendingPermSid.set(id, useId);
          pendingPerm.set(id, action => { answerLocalDecision(permId, { action }); });
          const waiting = requestLocalDecision({ permId, risk: 'high', title: tr("ui.index.message.47a1580dc5"), question: tr("ui.index.message.1451026b7f", {p0: tool.name}), options: [{ label: tr("ui.index.message.7caaf0c897"), value: 'deny' }, { label: tr("ui.index.message.fe73513fd6"), value: 'allow' }], allowCustom: false, timeoutSec: null, rawDetail: JSON.stringify(input, null, 2) }, useId, ac.signal, event => {
            if (event.type === 'decision-resolved') { pendingPerm.delete(id); pendingPermSid.delete(id); send('evt:permission-resolved', { sid: useId, id }); }
          });
          send('evt:permission-request', { sid: useId, id, name: tool.name, input });
          return waiting.then(answer => answer.action === 'allow' || answer.value === 'allow' ? 'allow' as const : 'deny' as const);
        },
        onUsage: (u) => {
          if (u.round) lastRoundBySid.set(useId, { input: u.round.input, output: u.round.output, cacheHit: u.round.cacheHit, steps: u.round.steps });
          send("evt:usage", { sid: useId, usage: u });
        },
        onRateLimits: (rl) => {
          log("ratelimits", "5h=", rl.primaryUsedPercent, "% 周=", rl.secondaryUsedPercent, "%");
          saveRateLimits(curProviderId(), rl); // 记住（按平台），下次打开直接显示
          send("evt:ratelimits", rl);
        },
        onCompact: (b, a) => send("evt:compact", { sid: useId, before: b, after: a }),
        onCompactArchive: (dropped) => archiveMessages(useId, dropped), // 压缩前把原始消息追加进完整日志(永不压缩)
        onRetry: (attempt, delayMs, reason) => {
          streamDrafts.delete(useId); // 清掉断掉的半截草稿
          // 诊断日志：网络中断自动退避重试(warn) —— 第几次/等多久/原因/模型
          try {
            const cc = loadConfig();
            void trackClientLog("warn", "error", { version: app.getVersion(), accessToken: loadWuweiSession()?.accessToken ?? null, message: `net_retry #${attempt} in ${Math.round(delayMs / 1000)}s: ${reason}`.slice(0, 300), meta: { node: "net_retry", attempt, delay_s: Math.round(delayMs / 1000), model: cc.model, provider: loadSettings()?.providerId || cc.provider } });
          } catch { /* ignore */ }
        },
        onAssistantDone: () => send("evt:done", { sid: useId }),
      },
      ac.signal,
      images,
    );
    persist(useId); // 用户消息已同步入队,立即落盘让(新)会话进侧栏、带上运行点
    setSessionRunning(useId, true); // 跨重启存活的运行标记(须在 persist 后:新会话此刻才有元信息)；崩溃/强杀残留→下次启动识别为中断
    // 每会话绑定模型：记下这一轮实际用的模型/平台(须在 persist 后，新会话此刻才有元信息)，切走再切回自动用回它
    try { const c = loadConfig(); setSessionModel(useId, c.model, loadSettings()?.providerId); } catch { /* ignore */ }
    await runP;
    const stAfter = loadSettings();
    if (isHostedProvider(stAfter?.providerId)) void refreshWuweiMe(); // 托管平台：扣币后刷新顶栏/菜单余额
    else {
      // 非托管（订阅 / 自配 key）：这类请求直连厂商、不经网关，后台看不到 → 客户端每轮结束自报用量（仅计数+模型标识，不含内容）。
      const rd = lastRoundBySid.get(useId);
      if (rd && (rd.input > 0 || rd.output > 0)) {
        const c = loadConfig();
        void getFreshWuweiSession().catch(() => null).then((sess) =>
          reportExternalUsage(
            { kind: stAfter?.kind || c.provider, providerId: stAfter?.providerId, model: c.model, inputTokens: rd.input, outputTokens: rd.output, cacheHitTokens: rd.cacheHit, steps: rd.steps, version: app.getVersion() },
            sess?.accessToken,
          ),
        );
      }
    }
    // 诊断日志：本轮模型调用画像(成功) —— 模型/平台/耗时/token/缓存/上下文，不含对话正文
    try {
      const rd = lastRoundBySid.get(useId);
      const cc = loadConfig();
      const st2 = loadSettings();
      void trackClientLog("info", "api_call", { version: app.getVersion(), accessToken: loadWuweiSession()?.accessToken ?? null, meta: { model: cc.model, provider: st2?.providerId || cc.provider, kind: st2?.kind || cc.provider, ok: true, ms: Date.now() - turnT0, in: rd?.input ?? 0, out: rd?.output ?? 0, cache: rd?.cacheHit ?? 0, steps: rd?.steps ?? 0, sub: subFlag, ctxWin: ctxWindow } });
    } catch { /* 诊断失败不影响主流程 */ }
    lastRoundBySid.delete(useId); // 已消费，避免下轮误用旧值
    if (runs.get(useId) === ac)
      send(ac.signal.aborted ? "evt:stopped" : "evt:done", { sid: useId }); // 中断后 loop 干净返回也算停止
  } catch (e: any) {
    // 若已被 chat:stop 手动停止(runs 里已换掉/删掉本 ac),就不再重复报,避免"已停止"提示重复
    if (runs.get(useId) === ac) {
      if (e?.name === "AbortError" || ac.signal.aborted) send("evt:stopped", { sid: useId });
      else {
        if (isHostedProvider(loadSettings()?.providerId)) void refreshWuweiMe(); // 失败也刷新，避免余额提示仍显示旧缓存
        // 记全量原始错误(含 API 400 body/status),便于排查;友好化仅用于前端展示
        try {
          log("turnError", useId.slice(0, 8), "status=", e?.status, "msg=", String(e?.message || e).slice(0, 800),
              e?.error ? "body=" + JSON.stringify(e.error).slice(0, 800) : "");
        } catch { /* ignore */ }
        // Claude 订阅撞 401/token 失效：别急着清！先用 sidecar 里的 refresh_token 强制续一次
        // (spurious 401、限流被判成 401 等都可能误清一个其实有效的 token)。续回来就提示重发、
        // 不清 token；确实续不回来(refresh 也失效)才清并引导重新授权。
        if (loadSettings()?.kind === "anthropic-oauth" && isOAuthDead(e)) {
          await ensureFreshClaudeOAuth(true).catch(() => {});
          const s2 = loadSettings();
          const restored = !!(s2?.oauthToken || s2?.creds?.["claude-oauth"]?.oauthToken);
          if (restored) send("evt:error", { sid: useId, message: tr("ui.index.authorization.was.just.auto.renewed.please.f6af66e") });
          else clearDeadClaudeOAuth("http-401"); // 内部会发一条「已清除失效 token，请重新授权」的 evt:error
        } else {
          send("evt:error", { sid: useId, message: e.message });
        }
        // 诊断日志：本轮报错(非用户主动停止) —— 错误原文 + 模型/平台/状态码/耗时，便于排障
        try {
          const cc = loadConfig();
          void trackClientLog("error", "error", { version: app.getVersion(), accessToken: loadWuweiSession()?.accessToken ?? null, message: String(e?.message || e).slice(0, 500), meta: { model: cc.model, provider: loadSettings()?.providerId || cc.provider, ok: false, ms: Date.now() - turnT0, status: e?.status ?? null } });
        } catch { /* ignore */ }
      }
    }
  } finally {
    clearInterval(hb); // 停掉长命令心跳
    if (runs.get(useId) === ac) {
      runs.delete(useId);
      emitTasks();
    }
    streamDrafts.delete(useId); // 清掉流式草稿(真实消息已在历史)
    draftSaveAt.delete(useId);
    persist(useId); // 该会话跑完落盘
    notifyRemote({ eventId: `turn_${useId}_${turnT0}`, kind: 'task', deviceId: getDeviceId(), taskId: useId, taskKind: 'session' });
    if (!runs.has(useId)) setSessionRunning(useId, false); // 无残留活跃轮→清运行标记(须在 persist 后,它会保留旧标记)
    conversationReports.drain(useId); // 用户这轮结束后接上员工汇报，不受当前聚焦/智能继续开关影响
    void emitAccount(); // 刷新余额/本会话已消耗(DeepSeek 等)
    // 调研轮：解析契约草稿回填弹窗，不触发智能继续接话(等用户在弹窗里审阅确认)。
    // ⚠ 流式竞态：finally 触发时最后一条 assistant 消息可能还没完全落定(读到半截 json)。
    // 所以立刻试一次，失败就隔 ~0.9s 重试几次(等流式写完)，仍抽不到才判 null。
    if (!ac.signal.aborted && charterDraftPending.has(useId)) {
      const attempt = (n: number) => {
        if (!charterDraftPending.has(useId)) return; // 期间被取消/开始执行→撤销
        if (tryExtractCharterDraft(useId)) { charterDraftPending.delete(useId); return; } // 成功(内部已 emit+缓存)
        if (n <= 0) {
          charterDraftPending.delete(useId);
          try { const t = lastAssistantText(useId); log("charterDraft", useId.slice(0, 8), "give up; len=", String(t.length), "tail=", JSON.stringify(t.slice(-300))); } catch { /* ignore */ }
          send("evt:charter-draft", { sid: useId, draft: null });
          return;
        }
        setTimeout(() => attempt(n - 1), 1500);
      };
      attempt(40); // 立刻 + 最多 40 次重试(~60s)：长回复流式落定慢，持续轮询直到完整 json 出现
    } else if ((useId === currentId || contSessions.has(useId)) && !ac.signal.aborted &&
      !selectedImageSku && !taskReports.hasPendingOrigin('session', useId) && !conversationReports.hasPending(useId)) {
      // 当前会话，或开着智能继续的后台会话，跑完都算下一步建议(后台会话切走也能自己接着推进)
      void suggestNextAction(useId);
    }
  }
}

// 权威运行态查询：主进程 runs 才是某会话「是否正在跑一轮」的唯一真相源。渲染端自主推进续跑前先问它，
// 在跑就别画气泡也别发——从根上杜绝时序误判导致的"孤儿气泡"。
ipcMain.handle("chat:is-running", (_e, sid: string) => runs.has(sid || currentId));

ipcMain.on("chat:send", (_e, sid: string, text: string, images?: string[], auto?: boolean) => {
  const useId = sid || currentId;
  // 自主推进/看门狗的「软续跑」(auto=true)：该会话若还在跑就静默跳过，绝不弹「上一条还在处理中」刷屏。
  // 时序心跳追不平主进程真实运行态时(免费模型长思考0token、无工具在跑),这一层让误判彻底无害——
  // 主进程 runs 才是唯一裁判。真结束后由正常 cont 流程/下一次看门狗巡检自然接上。用户手动发才照旧提示。
  if (auto && runs.has(useId)) return;
  void startTurn(useId, text, images);
});

// 运行中注入新需求：正在跑→注入到当前循环边界(AI 综合权衡/优先处理，不必等整轮跑完)；没在跑→当普通发送
ipcMain.on("chat:inject", (_e, sid: string, text: string, images?: string[]) => {
  const useId = sid || currentId;
  text = secrets.redact(text).text; // 同发送路径：注入的文本也脱敏
  const agent = getAgent(useId);
  if (agent && runs.has(useId)) {
    agent.injectUser(text, images);
    log("inject", useId.slice(0, 8), (text || "").slice(0, 40));
  } else {
    void startTurn(useId, text, images);
  }
});

// 撤回一条尚未被处理的注入消息(还在缓冲里)；命中=干净撤回，AI 没看到
ipcMain.handle("chat:recall-inject", (_e, sid: string, text: string) => {
  return agents.get(sid || currentId)?.recallPendingInject(text) ?? false;
});

ipcMain.on("chat:stop", (_e, sid?: string) => {
  const id = sid || currentId;
  const ac = runs.get(id);
  const agent = agents.get(id);
  // ⭐ 先摘掉自主推进，再谈停不停这一轮。
  // 否则：软停只让「当前这一轮」收尾，收尾后 finally 照样触发 suggestNextAction → 自主推进立刻起新一轮 →
  // 用户再点停止时面对的已是全新一轮(isSoftStopping 又是 false)，于是永远停在"温和收尾中"、升不到强制停止，
  // 表现就是"点停止没反应、整个界面像卡死"。实测用户连点 5 次都没能停下来。
  // 用户点停止的意思是"别跑了"，不是"跑完这轮再自动接着跑"。
  if (contSessions.delete(id)) {
    send("evt:cont-off", { sid: id }); // 渲染层同步关掉该会话的自主推进开关，别再自动续跑
    log("stop", id.slice(0, 8), tr("ui.index.message.e545bf9392"));
  }
  // 两段式停止:
  //  第一次点 → 温和收尾:不切断当前输出，让模型把这轮自然吐完、完整落历史后在下个边界停。
  //    历史尾部是完整的助手消息(非截断)，下次发消息无缝接续，不再产生 (已停止) 截断疤。
  //  第二次点(或已在收尾/卡权限)→ 强制中断(abort)，兜底救卡死的工具/流。
  if (ac && agent && !ac.signal.aborted && !agent.isSoftStopping() && ![...pendingPermSid.values(), ...pendingAskSid.values(), ...desktopDecisionSids.values()].includes(id)) {
    agent.requestSoftStop();
    log("softStop", id.slice(0, 8), tr("ui.index.message.95502776e8"));
    return;
  }
  // 只 abort，不立即删 runs——留给 agent.send 的 finally 结算后清理。
  // 否则会话仍在跑就被移出 runs，紧接着的新消息不再被拦→并发跑同一 agent→历史错乱(连续user/悬空tool_use)致 400。
  // loop 已在中断后尽快收尾(补齐 tool_result 并 return)，所以很快结算、UI 随即解锁。
  ac?.abort();
  // 若正卡在权限确认，一并取消(否则中断信号也叫不醒它)
  for (const [pid, r] of pendingPerm) {
    if (pendingPermSid.get(pid) !== id) continue;
    r("deny");
    pendingPerm.delete(pid);
    pendingPermSid.delete(pid);
  }
  // 若正卡在 ask_user 选择框，一并取消
  for (const [aid, r] of pendingAsk) {
    if (pendingAskSid.get(aid) !== id) continue;
    r({ cancelled: true });
    pendingAsk.delete(aid);
    pendingAskSid.delete(aid);
  }
});

ipcMain.on("perm:respond", (_e, id: number, decision: "allow" | "deny") => {
  const r = pendingPerm.get(id);
  if (r) {
    r(decision);
    pendingPerm.delete(id);
    pendingPermSid.delete(id);
  }
});

ipcMain.on('decision:respond', (_e, permId: string, response: unknown) => {
  answerLocalDecision(permId, response as DecisionResponse);
});

ipcMain.on("ask:answer", (_e, id: number, answers: any) => {
  const r = pendingAsk.get(id);
  if (r) {
    // 用户随答案附了截图：注入回该会话的循环边界，与 tool_result 并入同一条 user 消息，模型即刻看到
    const imgs: string[] = Array.isArray(answers?.images) ? answers.images : [];
    if (imgs.length) {
      const sid = pendingAskSid.get(id);
      const agent = sid ? getAgent(sid) : null;
      // 这句会作为用户消息显示在对话里，跟随界面语言
      if (agent)
        agent.injectUser(
          tr("ui.index.the.user.attached.these.screenshots.along.ef336bc"),
          imgs,
        );
    }
    r(answers);
    pendingAsk.delete(id);
    pendingAskSid.delete(id);
  }
});

// —— Codex 限额重置(免费重置额度)：官方客户端走 /wham/rate-limit-reset-credits ——
// 用 ~/.codex/auth.json 的订阅 token 认证；GET 查可用次数、POST consume 用掉一次(不可逆)。
function codexAuthHeaders(): Record<string, string> | null {
  try {
    const auth = JSON.parse(readFileSync(join(homedir(), ".codex", "auth.json"), "utf8"));
    const tok = auth?.tokens?.access_token;
    const acc = auth?.tokens?.account_id;
    if (!tok || !acc) return null;
    return { Authorization: `Bearer ${tok}`, "chatgpt-account-id": acc, "User-Agent": "codex_cli_rs/0.0.0", Accept: "application/json" };
  } catch {
    return null;
  }
}
ipcMain.handle("codex:reset-credits", async () => {
  const h = codexAuthHeaders();
  if (!h) return { ok: false, error: tr("ui.index.no.codex.login.codex.auth.json.a7e6dfa") };
  try {
    const res = await fetch("https://chatgpt.com/backend-api/wham/rate-limit-reset-credits", { headers: h });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const j: any = await res.json();
    return { ok: true, availableCount: j.available_count ?? 0, credits: Array.isArray(j.credits) ? j.credits : [] };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle("codex:consume-reset", async (_e, creditId: string) => {
  const h = codexAuthHeaders();
  if (!h) return { ok: false, error: tr("ui.index.no.codex.login.17ce5ad") };
  try {
    const res = await fetch("https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume", {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ credit_id: creditId, redeem_request_id: randomUUID() }),
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
});

// —— 会话管理 IPC ——
// 离开某会话前把它「当前显示的模型」锁死进会话元信息。config.model 恒等于当前活动会话的模型，
// 故此处写入的就是该会话自己的模型。无条件锁(不只在未绑定时)——保证任何离开路径后切回来都能还原，
// 从根上杜绝"某会话没绑定→切回时读到全局(别的会话刚选的模型)→被覆盖"这类串会话 bug。未持久化的空会话跳过(不建幽灵记录)。
function lockSessionModel(sid: string) {
  try {
    if (!sid || !listSessions().some((x) => x.id === sid)) return;
    const c = loadConfig();
    setSessionModel(sid, c.model, loadSettings()?.providerId);
  } catch { /* ignore */ }
}

ipcMain.on("session:new", () => {
  lockSessionModel(currentId); // ★关键修复:新建会话前先锁住正要离开的会话的模型,否则它切回来会被新会话的模型覆盖
  currentId = randomUUID();
  const a = getAgent(currentId);
  send("evt:session-loaded", { id: currentId, messages: a ? a.getMessages() : [] });
  sendUsageFor(currentId);
  void emitAccount();
});

// 一键生成日报：把某分组下(前端算好的会话 id 列表)所有会话内容聚合，新开一个会话让 AI 梳理成日报
ipcMain.on("report:generate", (_e, group: string, sessionIds: string[]) => {
  const ids = Array.isArray(sessionIds) ? sessionIds : [];
  if (!ids.length) return;
  const metas = listSessions();
  // 每个会话取标题 + 正文文本(取末尾最新进展，单会话截断防超长)
  const digest = ids
    .map((id) => {
      const meta = metas.find((s) => s.id === id);
      const body = loadMessages(id)
        .map((m: any) => {
          const t = (m.content || [])
            .filter((b: any) => b.type === "text")
            .map((b: any) => b.text)
            .join(" ")
            .trim();
          return t ? `${m.role === "user" ? tr("ui.index.me.d269d05") : tr("ui.index.assistant.e7461b8")}：${t}` : "";
        })
        .filter(Boolean)
        .join("\n")
        .slice(-2000); // 取末尾(最新进展)，单会话上限约 2000 字
      return `【${meta?.title || tr("ui.index.chat.3b38e74")}】\n${body || tr("ui.index.no.text.content.yet.7bfe00d")}`;
    })
    .join("\n\n----\n\n");

  // 日报正文整篇都会显示给用户，语言必须跟界面走
  const sys = tr("ui.index.you.write.daily.work.reports.below.1bd6926", { v0: group, v1: digest });

  // 新开会话并切过去
  const sid = randomUUID();
  currentId = sid;
  getAgent(sid);
  send("evt:session-loaded", { id: sid, messages: [] });
  sendUsageFor(sid);
  // 这句会当成用户气泡显示出来，同样跟随语言
  void startTurn(sid, tr("ui.index.write.today.work.report.for.bb2bfba", { p0: group }), undefined, sys);
});

// 一键工作交接:把某会话有价值的内容总结成交接文档 → 开一个干净的新会话(继承当前平台/模型)
// → 把文档喂进去让 AI 接着把没做完的事做完。解决老对话上下文被污染后，还在原地续跑越跑越乱的问题。
ipcMain.handle("session:handoff", async (_e, sid: string) => {
  const srcId = sid || currentId;
  const srcAgent = getAgent(srcId);
  if (!srcAgent) {
    send("evt:error", { sid: srcId, message: tr("ui.index.handoff.failed.the.source.chat.isn.d036512") });
    return { ok: false };
  }
  send("evt:handoff", { sid: srcId, phase: "summarizing" }); // UI 提示"正在生成交接文档…"
  let doc = "";
  try {
    doc = await srcAgent.makeHandoff();
  } catch (e: any) {
    log("handoffError", srcId.slice(0, 8), String(e?.message || e).slice(0, 300));
    send("evt:handoff", { sid: srcId, phase: "error" });
    send("evt:error", { sid: srcId, message: tr("ui.index.failed.to.build.the.handoff.doc.92ff4e7") + String(e?.message || e).slice(0, 200) });
    return { ok: false };
  }
  if (!doc.trim()) {
    send("evt:handoff", { sid: srcId, phase: "error" });
    send("evt:error", { sid: srcId, message: tr("ui.index.the.handoff.doc.came.back.empty.fa54c59") });
    return { ok: false };
  }
  // 新会话：显式继承源会话的平台+模型并绑定，交接后保持统一(如源=Claude 订阅+Opus 5 → 新会话也是这套)。
  // 光靠"全局=源"隐式传递不够：新会话没写入自己的 {model, providerId} 绑定，切走再切回来就丢平台、
  // 甚至 kind 错配报 invalid_token。这里把源会话的绑定复制给新会话，并随 session-loaded 下发给渲染端应用。
  const srcMeta = listSessions().find((x) => x.id === srcId);
  const carryProvider = srcMeta?.providerId || backendBySid.get(srcId) || loadSettings()?.providerId || "";
  const carryModel = srcMeta?.model || loadConfig().model;
  const newId = randomUUID();
  currentId = newId;
  getAgent(newId);
  try { setSessionModel(newId, carryModel, carryProvider); } catch { /* ignore */ }
  // 源会话是员工私聊 → 新会话继承 employeeId，交接后仍归在该员工名下，不会"逃逸"到普通历史列表
  if (srcMeta?.employeeId) { try { setSessionEmployee(newId, srcMeta.employeeId); } catch { /* ignore */ } }
  backendBySid.set(newId, carryProvider);
  // 源会话带总目标 → 带给新会话，交接后接着朝同一目标自主推进(渲染端会据此自动开智能继续)
  const srcGoal = sessionGoals[srcId];
  const goalCarried = !!(srcGoal && String(srcGoal.text || "").trim() && srcGoal.active !== false && !srcGoal.done);
  if (goalCarried) {
    sessionGoals[newId] = { text: srcGoal.text, active: true, done: false };
    saveGoals();
  }
  send("evt:session-loaded", { id: newId, messages: [], boundModel: carryModel, boundProviderId: carryProvider });
  sendUsageFor(newId);
  send("evt:handoff", { sid: newId, phase: "done" });
  // 交接开场白会作为新会话的第一条用户消息显示出来，跟随界面语言
  const goalLine = goalCarried
    ? tr("ui.index.overall.goal.carried.from.the.previous.7bfbd12", { p0: srcGoal.text })
    : "";
  const firstMsg =
    goalLine +
    tr("ui.index.handoff.from.the.previous.chat.the.4f74496") +
    "----\n" +
    doc;
  void startTurn(newId, firstMsg);
  return { ok: true, newId, goalCarried };
});

ipcMain.on("session:switch", (_e, id: string) => {
  // 切走前无条件把当前模型锁给正要离开的会话，让老会话立刻记牢、切回来必还原(不再只在"未绑定"时才锁)
  if (currentId && currentId !== id) lockSessionModel(currentId);
  currentId = id;
  const a = getAgent(id);
  // 每会话绑定模型：把该会话存的 {model, providerId} 带给渲染端，由它用 PRESETS 完整切平台
  // (含 kind/apiKey/oauthToken/baseUrl——CredSlot 不存 kind，主进程切不干净会 invalid_token)
  const bmeta = listSessions().find((x) => x.id === id);
  // getDisplayMessages：带上还没并入历史的注入消息，否则切回正在跑的会话时「刚发的那条」会不见
  send("evt:session-loaded", { id, messages: a ? a.getDisplayMessages() : [], boundModel: bmeta?.model, boundProviderId: bmeta?.providerId, contextWindow: a?.getContextBudget().contextWindow });
  sendUsageFor(id);
  void emitAccount();
});

// 崩溃恢复——用户点「继续」：切到该会话、清中断标记，注入一句续跑指令让 AI 接着未完成的工作。
// 历史在 getAgent→loadMessages 里已自愈(补齐悬空 tool_result/交替角色)，可直接续跑。
ipcMain.on("session:resume", (_e, id: string) => {
  const sid = id || currentId;
  if (currentId && currentId !== sid) lockSessionModel(currentId); // 切到别的会话前先锁住当前会话的模型
  clearInterrupted(sid);
  currentId = sid;
  const a = getAgent(sid);
  send("evt:session-loaded", { id: sid, messages: a ? a.getDisplayMessages() : [] });
  sendUsageFor(sid);
  send("evt:sessions", listSessions());
  void startTurn(
    sid,
    tr("ui.index.this.task.was.force.interrupted.on.5865f46"),
  );
});

// 崩溃恢复——用户点「忽略」：只清中断标记，不续跑。
ipcMain.on("session:dismiss-interrupted", (_e, id: string) => {
  const sid = id || currentId;
  dismissResume(sid); // 清中断标记 + 记忽略，内容启发式不再重复提示
  send("evt:sessions", listSessions());
});

ipcMain.on("session:delete", (_e, id: string) => {
  const deleted = listSessions().find(s => s.id === id);
  runs.get(id)?.abort(); // 删除正在跑的会话先中断它
  runs.delete(id);
  deleteSession(id);
  clearTeamHistoryDigest(`session:${id}`);
  agents.delete(id);
  backendBySid.delete(id);
  if (currentId === id) {
    const next = sessionAfterDelete(deleted, listSessions());
    const employee = deleted?.employeeId && teamEnabled(loadSettings())
      ? loadEmployees().find(e => e.id === deleted.employeeId) : undefined;
    if (!next && employee) {
      // The last chat was removed: open an empty chat with the same employee.
      // Binding is installed before getAgent, so identity, tools and model match.
      currentId = ""; // do not re-bind the deleted session when creating its replacement
      startEmployeeChat(employee.id, employee.name, employee.model);
    } else {
      currentId = next?.id ?? randomUUID();
      const a = getAgent(currentId);
      send("evt:session-loaded", {
        id: currentId, messages: a ? a.getDisplayMessages() : [],
        boundModel: next?.model, boundProviderId: next?.providerId,
        contextWindow: a?.getContextBudget().contextWindow,
      });
      sendUsageFor(currentId);
      void emitAccount();
    }
  }
  send("evt:sessions", listSessions());
  send("evt:groups", listGroups());
  send("evt:trash", listTrash()); // 删除→进回收站,同步刷新回收站
});

// 回收站:列出(顺带清过期)
ipcMain.handle("session:list-trash", () => listTrash());

// 全局搜索:跨所有会话搜正文,返回「会话标题 + 关键词上下文摘要 + 跳转锚点」
ipcMain.handle("session:search", async (_e, q: string) => {
  const metas = listSessions();
  await ensureSearchIndex(metas.map((s) => s.id)); // 首次会解析一遍历史(分文件让出主线程)
  return searchInSessions(q, metas);
});

// 回收站:恢复某条→回到会话列表
ipcMain.on("session:restore", (_e, id: string) => {
  restoreSession(id);
  send("evt:sessions", listSessions());
  send("evt:groups", listGroups());
  send("evt:trash", listTrash());
});

// 回收站:彻底删除某条(不可恢复)
ipcMain.on("session:purge", (_e, id: string) => {
  purgeTrashItem(id);
  send("evt:trash", listTrash());
});

// 回收站:清空(全部彻底删除)
ipcMain.on("session:empty-trash", () => {
  emptyTrash();
  send("evt:trash", listTrash());
});

// 会话分组：移动到分组(group 空=移出)；新组自动创建并置顶
ipcMain.on("session:set-group", (_e, id: string, group?: string | null) => {
  setSessionGroup(id, group);
  send("evt:sessions", listSessions());
  send("evt:groups", listGroups());
});

// 会话优先级：权重(数字大靠前) + 显示标签
ipcMain.on("session:set-priority", (_e, id: string, priority: number, tag?: string) => {
  setSessionPriority(id, priority, tag);
  send("evt:sessions", listSessions());
});

// 会话手动拖拽排序：写入 order 键
ipcMain.on("session:set-order", (_e, id: string, order: number) => {
  setSessionOrder(id, order);
  send("evt:sessions", listSessions());
});

// 组顺序拖拽重排
ipcMain.on("session:reorder-groups", (_e, names: string[]) => {
  setGroupsOrder(names);
  send("evt:groups", listGroups());
});

// 标记已完成(排到最后、置灰)
ipcMain.on("session:set-done", (_e, id: string, done: boolean) => {
  setSessionDone(id, done);
  send("evt:sessions", listSessions());
});

// 标记待讨论(需过会议讨论)：仅列表徽标区分，不影响排序
ipcMain.on("session:set-discuss", (_e, id: string, discuss: boolean) => {
  setSessionDiscuss(id, discuss);
  send("evt:sessions", listSessions());
});

// 删除某一轮问答(第 ordinal 条用户输入及其后到下一条用户输入之间的全部消息=该轮回复)
// 整轮删除→历史天然保持交替与 tool_use/tool_result 配对，不产生占位垃圾
ipcMain.on("session:delete-exchange", (_e, id: string, ordinal: number) => {
  if (runs.has(id)) return; // 正在跑的会话不允许删,防改到正在变的历史
  const a = getAgent(id);
  if (!a) return;
  const msgs = a.getMessages();
  const isUserInput = (m: any) =>
    m.role === "user" && (m.content || []).some((b: any) => b.type === "text" || b.type === "image");
  // 定位第 ordinal 条用户输入的起点
  let seen = -1;
  let start = -1;
  for (let i = 0; i < msgs.length; i++) {
    if (isUserInput(msgs[i])) {
      seen++;
      if (seen === ordinal) {
        start = i;
        break;
      }
    }
  }
  if (start === -1) return;
  // 终点=下一条用户输入(不含)，即该轮 AI 多步回复的末尾
  let end = msgs.length;
  for (let i = start + 1; i < msgs.length; i++) {
    if (isUserInput(msgs[i])) {
      end = i;
      break;
    }
  }
  a.setMessages([...msgs.slice(0, start), ...msgs.slice(end)]);
  send("evt:session-loaded", { id, messages: a.getMessages() });
  persist(id); // 落盘(空了也会更新列表)
  send("evt:sessions", listSessions());
});

// /reset：清空当前会话
// 外部链接用系统浏览器打开（Markdown 里的链接，防在 app 内导航离开）
ipcMain.on("open-external", (_e, url: string) => {
  if (/^https?:\/\//.test(url)) shell.openExternal(url);
});

ipcMain.on("chat:reset", () => {
  const a = getAgent(currentId);
  if (a) {
    a.setMessages([]);
    a.setUsage({ totalInput: 0, totalOutput: 0, lastInput: 0, totalCacheHit: 0, totalCacheMiss: 0, totalSteps: 0 });
  }
  send("evt:session-loaded", { id: currentId, messages: [] });
  sendUsageFor(currentId);
});

// 撤销上一条：删掉最后一条用户消息及其之后所有(修出错卡死的消息)
ipcMain.on("chat:undo-last", () => {
  const a = agents.get(currentId);
  if (!a) return;
  const msgs = a.getMessages();
  let idx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "user") {
      idx = i;
      break;
    }
  }
  if (idx < 0) return;
  a.setMessages(msgs.slice(0, idx));
  send("evt:session-loaded", { id: currentId, messages: a.getMessages() });
  saveSession(currentId, a.getMessages(), deriveTitle(a.getMessages()), Date.now(), a.getUsage());
  send("evt:sessions", listSessions());
  sendUsageFor(currentId);
});

// —— 设置（provider/model）——
// 渲染端挂载时主动拉取(避免启动推送早于监听注册导致会话列表丢失=空白页)
ipcMain.handle("session:bootstrap", () => {
  if (!currentId) {
    const list = listSessions();
    currentId = list[0]?.id ?? randomUUID();
  }
  // 崩溃恢复(设置开关开时)：首个 bootstrap 同步检测(无时序竞争)。running 残留=强杀(强信号);
  // 再对最近半截会话做内容启发式。返回所有 interrupted(含历史遗留未处理的)，多个不漏。
  const resumeOn = resumeDetectEnabled(loadSettings());
  if (!interruptDetected) {
    interruptDetected = true;
    if (resumeOn) markInterruptedOnStartup(true);
  }
  const a = getAgent(currentId);
  return {
    sessions: listSessions(),
    groups: listGroups(),
    currentId,
    messages: a ? a.getDisplayMessages() : [],
    usage: a ? a.getUsage() : EMPTY_USAGE,
    rateLimits: loadRateLimits(curProviderId()) || null,
    interrupted: resumeOn
      ? listSessions()
          .filter((s) => s.interrupted)
          .map((s) => ({ id: s.id, title: s.title }))
      : [], // 待恢复的会话(全部)；开关关=不提示
  };
});

ipcMain.handle("settings:get", () => ({
  settings: loadSettings(),
  backend: backendLabel,
  model: modelLabel,
  defaultPrompt: DEFAULT_SYSTEM_PROMPT, // 中文默认(设置页按界面语言在渲染层实时选)
  defaultPromptEn: DEFAULT_SYSTEM_PROMPT_EN, // 英文默认
  defaultBrainPrompt: DEFAULT_BRAIN_NOTE, // 脑网络说明默认(知识网络设置页显示/恢复默认)
  defaultBrainPromptEn: DEFAULT_BRAIN_NOTE_EN,
  defaultSecretsPrompt: secrets.SECRETS_SYSTEM_NOTE, // 密钥说明默认(密钥设置页显示/恢复默认)
  defaultSecretsPromptEn: secrets.SECRETS_SYSTEM_NOTE_EN,
}));

// 脑网络/密钥 提示词覆盖：只落盘该字段并热更所有会话系统提示(不重启 provider)。传 null=恢复默认
function hotRefreshSys() {
  sysPrompt = buildSysPrompt(cwd, modelLabel, loadSettings()?.providerId);
  for (const [sid, a] of agents) a.setSystem(sysForSession(sid)); // 绑员工则保留人格
}
ipcMain.on("settings:set-brain-prompt", (_e, text: string | null) => {
  const s = loadSettings() || ({} as Settings);
  if (typeof text === "string" && text.trim()) s.brainPrompt = text;
  else delete s.brainPrompt; // 空/删除=恢复默认
  saveSettings(s);
  hotRefreshSys();
});
ipcMain.on("settings:set-secrets-prompt", (_e, text: string | null) => {
  const s = loadSettings() || ({} as Settings);
  if (typeof text === "string" && text.trim()) s.secretsPrompt = text;
  else delete s.secretsPrompt;
  saveSettings(s);
  hotRefreshSys();
});

ipcMain.on("settings:set", (_e, s: Settings) => {
  try {
    // 显式切换：强制应用到当前活动会话(即使它正在智能继续)，避免"切了平台但正在跑的会话没跟着换"
    applySettings(s, currentId || undefined);
    // 每会话绑定模型：把这次选的模型/平台记到当前会话，切走再切回自动用回它(新会话首轮后才有元信息)
    if (currentId && (s?.model || s?.providerId)) {
      const cfg = loadConfig();
      setSessionModel(currentId, s?.model || cfg.model, s?.providerId ?? loadSettings()?.providerId);
    }
  } catch (e: any) {
    send("evt:error", tr("ui.index.failed.to.switch.backend.398c948") + e.message);
  }
});

// 纯 UI 设置(分组模式)：只落盘，不重启 provider
ipcMain.on("settings:set-group-mode", (_e, mode: "manual" | "date" | "project") => {
  const s = loadSettings() || ({} as Settings);
  saveSettings({ ...s, groupMode: mode });
});

// 纯 UI 设置(输出方式/速度)：只落盘，不重启 provider
ipcMain.on(
  "settings:set-stream",
  (_e, mode: "typewriter" | "stream" | "instant", speed: number) => {
    const s = loadSettings() || ({} as Settings);
    saveSettings({ ...s, streamMode: mode, streamSpeed: speed });
  },
);

// 应用级开关(app.*：密钥检测/知识网络/扫描相关文档)：只并进 app 字段落盘，不重启 provider。
// 热更：知识网络开关变了→重建系统提示 + 加/摘 brain_* 工具；文档开关→同步 brain 模块。
ipcMain.on("settings:set-app", (_e, patch: Record<string, boolean | string>) => {
  const s = loadSettings() || ({} as Settings);
  s.app = { ...(s.app || {}), ...patch } as any;
  saveSettings(s);
  applyEnvFromSettings(s); // 关键：app.lang 变了要刷 WUWEI_LANG，主进程 tt()/工具描述/系统提示默认才跟随界面语言
  // 语言变了，任务栏标题/托盘提示要当场跟上，不用重启
  try {
    win?.setTitle(appDisplayName());
    tray?.setToolTip(appDisplayName());
  } catch {
    /* ignore */
  }
  syncBrainDocsFlag(s);
  setDiagConsent(telemetryEnabled(s)); // 「发送诊断信息」开关变了当场生效
  syncTeamModule(s); // 「AI 员工团队」开关变了当场挂载/卸载，不用重启
  try { refreshRelayClient(); } catch { /* 手机端远程开关变了当场启停relay连接,失败不影响设置保存 */ }
  sysPrompt = buildSysPrompt(cwd, modelLabel, s.providerId);
  for (const [sid, a] of agents) a.setSystem(sysForSession(sid)); // 绑员工则保留人格
  refreshAgentTools();
});

// 右上角「别的会话在等你选择」提醒：是否自动消失 + 倒计时秒数(纯 UI，只落盘)
ipcMain.on("settings:set-ask-toast", (_e, autoDismiss: boolean, sec: number) => {
  const s = loadSettings() || ({} as Settings);
  const n = Number(sec);
  saveSettings({
    ...s,
    askToastAutoDismiss: !!autoDismiss,
    askToastDismissSec: Number.isFinite(n) && n > 0 ? n : 30,
  });
});

// 上下文压缩：保留最近 N 条(热更所有会话，不重启 provider)
ipcMain.on("settings:set-keep-recent", (_e, n: number) => {
  const keep = Number(n);
  if (!Number.isFinite(keep) || keep <= 0) return;
  const s = loadSettings() || ({} as Settings);
  saveSettings({ ...s, keepRecent: keep });
  agentOpts = { ...agentOpts, keepRecent: keep };
  for (const a of agents.values()) a.setCompactOpts({ keepRecent: keep });
});

// 上下文压缩阈值(热更)：token 阈值 + 消息条数阈值，0=该项关闭。用户在设置里调，立刻对所有会话生效。
ipcMain.on("settings:set-compact", (_e, p: { threshold?: number; msgThreshold?: number }) => {
  const s = loadSettings() || ({} as Settings);
  const next: Partial<Settings> = {};
  const patch: { compactThreshold?: number; compactMsgThreshold?: number } = {};
  if (typeof p?.threshold === "number" && p.threshold >= 0) { next.compactThreshold = Math.floor(p.threshold); patch.compactThreshold = Math.floor(p.threshold); }
  if (typeof p?.msgThreshold === "number" && p.msgThreshold >= 0) { next.compactMsgThreshold = Math.floor(p.msgThreshold); patch.compactMsgThreshold = Math.floor(p.msgThreshold); }
  saveSettings({ ...s, ...next });
  agentOpts = { ...agentOpts, ...patch };
  for (const a of agents.values()) a.setCompactOpts(patch);
});

// —— 全局记忆(设置里手动编辑) ——
ipcMain.handle("memory:get", () => loadMemory());
ipcMain.on("memory:set", (_e, text: string) => {
  saveMemory(text);
  // 立即刷新当前会话系统提示词,手动改的记忆下一条消息就生效
  for (const [sid, a] of agents) a.setSystem(sysForSession(sid)); // 绑员工则保留人格，不冲回"你是无为"
});

// —— 输入框草稿：实时落盘 ~/.wuwei/draft.json，重开/更新后自动恢复(含粘贴的截图 base64) ——
const DRAFT_FILE = join(homedir(), DATA_DIR_NAME, "draft.json");
ipcMain.handle("draft:get", () => {
  try {
    return JSON.parse(readFileSync(DRAFT_FILE, "utf8"));
  } catch {
    return { text: "", images: [] };
  }
});
ipcMain.on("draft:set", (_e, draft: { text?: string; images?: string[] }) => {
  try {
    mkdirSync(dirname(DRAFT_FILE), { recursive: true });
    writeFileSync(
      DRAFT_FILE,
      JSON.stringify({ text: draft?.text || "", images: draft?.images || [] }),
      "utf8",
    );
  } catch {
    /* 落盘失败不影响发送 */
  }
});

// —— 本地知识网络 Brain（设置里的"知识网络"面板 + 模型预热）——
function refreshSysAfterBrain() {
  for (const [sid, a] of agents) a.setSystem(sysForSession(sid)); // 绑员工则保留人格，不冲回"你是无为"
}
ipcMain.handle("brain:graph", () => brain.getGraphLite());
ipcMain.handle("brain:stats", () => brain.stats());
ipcMain.handle("brain:recall", async (_e, query: string) => (await brain.recall(String(query || ""))).text);
ipcMain.handle("brain:warmup", async () => brain.warmupEmbedder());
ipcMain.handle("brain:save-node", async (_e, node) => {
  await brain.saveNodeFromUI(node);
  refreshSysAfterBrain();
});
ipcMain.handle("brain:delete-node", (_e, id: string) => {
  brain.deleteNodeFromUI(String(id));
  refreshSysAfterBrain();
});
ipcMain.handle("brain:add-edge", async (_e, from: string, relation: string, to: string) => {
  await brain.addEdgeFromUI(String(from), String(relation), String(to));
  refreshSysAfterBrain();
});
ipcMain.handle("brain:delete-edge", (_e, id: string) => brain.deleteEdgeFromUI(String(id)));
// 通用：弹系统目录选择框，返回所选绝对路径（取消返回 null）。给知识网络文档库等路径输入用。
ipcMain.handle("dialog:select-folder", async () => {
  const parent = win && !win.isDestroyed() ? win : undefined;
  const r = await dialog.showOpenDialog(parent as BrowserWindow, {
    title: tr("ui.index.choose.folder.e66cd6e"),
    properties: ["openDirectory", "createDirectory"],
  });
  if (r.canceled || r.filePaths.length === 0) return null;
  return r.filePaths[0];
});
// 文档冷存储（知识宫殿等）：建索引(带进度事件)/统计/读原文
ipcMain.handle("brain:doc-stats", () => brain.docStats());

// —— 索引构建进度：主进程为唯一真相源，关闭设置弹窗也不丢；渲染随时可查/订阅 ——
type DocBuildState = {
  building: boolean;
  phase: string; // idle|scan|embed|done|error
  files: number;
  total: number;
  done: number;
  error?: string;
};
let docBuildState: DocBuildState = { building: false, phase: "idle", files: 0, total: 0, done: 0 };
ipcMain.handle("brain:doc-progress", () => docBuildState);
ipcMain.handle("brain:embed-ready", () => brain.embeddingReady());
ipcMain.handle("brain:build-docs", async (_e, dir: string) => {
  if (conceptState.running)
    throw new Error(
      tr("ui.index.concept.extraction.is.running.stop.it.159581c"),
    );
  const abs = String(dir).replace(/^~(?=\/|$)/, homedir());
  docBuildState = { building: true, phase: "scan", files: 0, total: 0, done: 0 };
  send("evt:brain-docs", docBuildState);
  try {
    await brain.buildDocs(abs, (p) => {
      docBuildState = {
        building: true,
        phase: p.phase,
        files: p.files ?? docBuildState.files,
        total: p.total ?? docBuildState.total,
        done: p.done ?? docBuildState.done,
      };
      send("evt:brain-docs", docBuildState);
    });
    docBuildState = { ...docBuildState, building: false, phase: "done" };
  } catch (e: any) {
    docBuildState = { ...docBuildState, building: false, phase: "error", error: e?.message || String(e) };
  }
  send("evt:brain-docs", docBuildState);
  return brain.docStats();
});
ipcMain.handle("brain:read-doc", (_e, ref: string) => brain.readDoc(String(ref)));

// —— 概念抽取：用当前对话模型(k3)从已索引文档「按文档级」批量抽概念+关系填进 graph ——
// 按文档级(而非块级)大幅省 token：204 文档 = 204 次调用，非 3571 块。可停、进度持久、默认只抽未抽过的文档。
const CONCEPTS_DONE_FILE = join(homedir(), DATA_DIR_NAME, "brain", "concepts-done.json");
function loadConceptsDone(): Set<string> {
  try {
    return new Set(JSON.parse(readFileSync(CONCEPTS_DONE_FILE, "utf8")).files || []);
  } catch {
    return new Set();
  }
}
function saveConceptsDone(s: Set<string>) {
  try {
    mkdirSync(dirname(CONCEPTS_DONE_FILE), { recursive: true });
    writeFileSync(CONCEPTS_DONE_FILE, JSON.stringify({ files: [...s], updatedAt: Date.now() }), "utf8");
  } catch {
    /* ignore */
  }
}
type ConceptState = {
  running: boolean;
  phase: string; // idle|run|done|stopped|error
  total: number;
  done: number;
  created: number;
  skipped: number;
  cur?: string;
  error?: string;
};
let conceptState: ConceptState = { running: false, phase: "idle", total: 0, done: 0, created: 0, skipped: 0 };
let conceptCancel = false;
ipcMain.handle("brain:concept-progress", () => conceptState);
ipcMain.on("brain:stop-concepts", () => {
  conceptCancel = true;
});
ipcMain.handle("brain:extract-concepts", (_e, opts: { all?: boolean }) => {
  if (conceptState.running) return { started: false, reason: tr("ui.index.already.running.8a6e26c") };
  if (!provider) return { started: false, reason: tr("ui.index.no.model.configured.c05b50f") };
  // 防并发:抽概念时每存一个概念要给它算向量,走的是索引重建正霸占的同一个 worker,
  // 同时跑会互相饿死→龟速。索引没建完先拦住,提示用户等索引跑完再抽。
  if (docBuildState.building)
    return { started: false, reason: tr("ui.index.index.is.building.wait.for.it.1309c33") };
  void runConceptExtraction(!!opts?.all); // 后台跑,不阻塞;进度走 evt:brain-concepts
  return { started: true };
});

async function extractOneFile(file: string, body: string): Promise<number> {
  // 抽出来的概念名/类型/摘要会显示在知识网络列表里，还会拼进系统提示 → 跟随界面语言。
  // 另注：原文写死「中文文档片段」，英文文档也会被当中文处理，这里一并改成不限定语种。
  const sys = tr("ui.index.you.extract.knowledge.graphs.from.the.c42314e");
  const res = await provider!.complete(
    sys,
    [
      {
        role: "user",
        content: [{ type: "text", text: tr("ui.index.excerpt.from.json.39f1f66", { p0: file, p1: body }) }],
      },
    ] as any,
    [],
    {},
  );
  const raw = (res.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("")
    .trim();
  let parsed: any = null;
  try {
    parsed = JSON.parse(raw.replace(/^```(json)?/i, "").replace(/```\s*$/, "").trim());
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) try { parsed = JSON.parse(m[0]); } catch { /* 放弃本篇 */ }
  }
  if (!parsed) return 0;
  let n = 0;
  for (const c of parsed.concepts || []) {
    if (!c?.name) continue;
    await brain.learn({
      name: String(c.name).slice(0, 60),
      type: c.type ? String(c.type).slice(0, 20) : tr("ui.index.concept.f03a927"),
      summary: c.summary ? String(c.summary).slice(0, 200) : "",
      aliases: Array.isArray(c.aliases) ? c.aliases.slice(0, 8).map((a: any) => String(a).slice(0, 40)) : [],
    });
    n++;
  }
  for (const r of parsed.relations || []) {
    if (!r?.from || !r?.to || !r?.relation) continue;
    await brain.link(String(r.from).slice(0, 60), String(r.relation).slice(0, 20), String(r.to).slice(0, 60));
  }
  return n;
}

async function runConceptExtraction(all: boolean) {
  conceptCancel = false;
  const idx = brain.loadDocIndex();
  const byFile = new Map<string, { headingPath: string; text: string }[]>();
  for (const c of idx.chunks) {
    if (!byFile.has(c.file)) byFile.set(c.file, []);
    byFile.get(c.file)!.push({ headingPath: c.headingPath, text: c.text });
  }
  const done = all ? new Set<string>() : loadConceptsDone();
  const files = [...byFile.keys()].filter((f) => all || !done.has(f));
  conceptState = { running: true, phase: "run", total: files.length, done: 0, created: 0, skipped: 0 };
  send("evt:brain-concepts", conceptState);
  log("concept", `开始抽取:待处理 ${files.length} 篇(all=${all}),模型=${modelLabel}`);
  for (const f of files) {
    if (conceptCancel) {
      conceptState = { ...conceptState, running: false, phase: "stopped" };
      log("concept", `已停止:${conceptState.done}/${files.length} 篇, 累计 ${conceptState.created} 概念`);
      break;
    }
    conceptState = { ...conceptState, cur: f };
    send("evt:brain-concepts", conceptState);
    let body = byFile
      .get(f)!
      .map((c) => (c.headingPath ? `〖${c.headingPath}〗\n${c.text}` : c.text))
      .join("\n\n");
    if (body.length > 6000) body = body.slice(0, 6000); // 单篇上限,控 token
    const t0 = Date.now();
    log("concept", `[${conceptState.done + 1}/${files.length}] 抽取中: ${f}`);
    try {
      const created = await extractOneFile(f, body);
      conceptState = { ...conceptState, created: conceptState.created + created };
      done.add(f);
      saveConceptsDone(done);
      log("concept", `[${conceptState.done + 1}/${files.length}] 完成: ${f} → +${created} 概念 (${Date.now() - t0}ms)`);
    } catch (e: any) {
      conceptState = { ...conceptState, skipped: conceptState.skipped + 1 };
      log("concept", `[${conceptState.done + 1}/${files.length}] 失败(跳过): ${f} → ${e?.message || e}`);
    }
    conceptState = { ...conceptState, done: conceptState.done + 1 };
    send("evt:brain-concepts", conceptState);
  }
  if (!conceptCancel) {
    conceptState = { ...conceptState, running: false, phase: "done", cur: undefined };
    log("concept", `全部完成:${conceptState.done} 篇, 共 ${conceptState.created} 概念, 跳过 ${conceptState.skipped}`);
  }
  send("evt:brain-concepts", conceptState);
}

// —— MCP 服务器(设置里配置) ——
ipcMain.handle("mcp:get", () => {
  let config = "";
  try {
    config = readFileSync(MCP_CONFIG_PATH, "utf8");
  } catch {
    /* 无配置 */
  }
  return { config, status: mcpStatus() };
});
ipcMain.on("mcp:set", (_e, text: string) => {
  try {
    mkdirSync(dirname(MCP_CONFIG_PATH), { recursive: true });
    writeFileSync(MCP_CONFIG_PATH, text, "utf8");
  } catch (e: any) {
    send("evt:error", tr("ui.index.failed.to.write.mcp.config.7a26bb0") + e.message);
    return;
  }
  void connectMcp(() => {
    refreshAgentTools();
    send("evt:mcp", mcpStatus());
  });
});
ipcMain.handle("mcp:search", (_e, query: string, cursor?: string) => searchMcpRegistry(query, cursor));

// —— 本地密钥管理器 ——
ipcMain.handle("secrets:list", () => {
  try {
    return { entries: secrets.listSecrets(), available: safeStorageOk() };
  } catch {
    return { entries: [], available: safeStorageOk() };
  }
});
ipcMain.handle("secrets:add", (_e, input: { name?: string; envVar?: string; value: string; note?: string }) => {
  try {
    return { ok: true, entry: secrets.addSecret(input) };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle("secrets:update", (_e, id: string, patch: any) => {
  try {
    secrets.updateSecret(id, patch);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle("secrets:delete", (_e, id: string) => {
  secrets.deleteSecret(id);
  return { ok: true };
});
ipcMain.handle("secrets:import-env", (_e, text: string) => {
  try {
    return { ok: true, count: secrets.importEnv(text) };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
});
// 查看明文:先用本机账号密码校验(macOS dscl -authonly，不需 sudo)，通过才返回真实值
ipcMain.handle("secrets:reveal", async (_e, pw: string) => {
  try {
    const { execFile } = await import("node:child_process");
    const os = await import("node:os");
    const user = os.userInfo().username;
    const ok = await new Promise<boolean>((resolve) => {
      const p = execFile("/usr/bin/dscl", [".", "-authonly", user, String(pw ?? "")], (err) => resolve(!err));
      p.on("error", () => resolve(false));
    });
    if (!ok) return { ok: false, error: tr("ui.index.incorrect.password.0e9257e") };
    return { ok: true, items: secrets.revealAll() };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
});
// 发送前扫描：脱敏已入库密钥 + 返回尚未入库的疑似新密钥(给确认弹窗)。永不抛错,否则会挡住发送。
ipcMain.handle("secrets:scan", (_e, text: string) => {
  try {
    // redact 始终跑：已入库密钥→占位符，永不出网(与"检测新密钥"是两回事，不受开关影响)。
    // detect 受「密钥检测」开关控制：关掉后不再扫描/弹窗拦截疑似新密钥(如临时长 token)。
    const detect = secretsDetectEnabled(loadSettings());
    return { redacted: secrets.redact(text).text, candidates: detect ? secrets.detect(text) : [] };
  } catch {
    return { redacted: text, candidates: [] };
  }
});

// 「工具」面板：把当前生效的全部工具（内置 + 浏览器 + 各 MCP 服务器）按来源分组返回
ipcMain.handle("tools:get", () => {
  const mk = (t: Tool) => ({
    name: t.name,
    description: t.description || "",
    readOnly: !!t.readOnly,
    inputSchema: t.inputSchema || { type: "object", properties: {} },
  });
  const groups: { source: string; kind: "builtin" | "browser" | "mcp"; tools: ReturnType<typeof mk>[] }[] = [
    { source: tr("ui.index.message.6b2c4f3afc"), kind: "builtin", tools: ALL_TOOLS.map(mk) },
    { source: tr("set.tools.badgeBrowser"), kind: "browser", tools: BROWSER_TOOLS.map(mk) },
    ...mcpToolsBySource().map((g) => ({
      source: g.server,
      kind: "mcp" as const,
      tools: g.tools.map(mk),
    })),
  ];
  const total = groups.reduce((n, g) => n + g.tools.length, 0);
  return { groups, total };
});

// —— 浏览器面板：把 WebContentsView 贴到主窗口指定区域(前端量好 bounds 发来) ——
ipcMain.on("browser:show", (_e, b: { x: number; y: number; width: number; height: number }) => {
  const v = getBrowserView();
  if (win && !browserAttached) {
    win.contentView.addChildView(v);
    browserAttached = true;
  }
  v.setBounds({ x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) });
  emitBrowser();
});
ipcMain.on("browser:hide", () => {
  if (win && browserView && browserAttached) {
    win.contentView.removeChildView(browserView);
    browserAttached = false;
  }
});
ipcMain.on("browser:nav", (_e, action: string, arg?: string) => {
  try {
    const wc = getBrowserView().webContents;
    if (action === "back") wc.navigationHistory.goBack();
    else if (action === "forward") wc.navigationHistory.goForward();
    else if (action === "reload") wc.reload();
    else if (action === "open" && arg) wc.loadURL(/^https?:\/\//i.test(arg) ? arg : "https://" + arg);
  } catch {
    /* ignore */
  }
});
// 把浏览器视图弹成独立可拖动窗口
let browserPopWin: BrowserWindow | null = null;
ipcMain.on("browser:detach", () => {
  const v = getBrowserView();
  if (win && browserAttached) {
    win.contentView.removeChildView(v);
    browserAttached = false;
  }
  if (!browserPopWin || browserPopWin.isDestroyed()) {
    browserPopWin = new BrowserWindow({
      width: 1040,
      height: 780,
      title: tr("ui.index.wuwei.browser.ea1ec8c"),
      ...(existsSync(join(__dirname, "../../build/icon.png")) ? { icon: join(__dirname, "../../build/icon.png") } : {}),
    });
    const fit = () => {
      if (!browserPopWin || browserPopWin.isDestroyed()) return;
      const [w, h] = browserPopWin.getContentSize();
      v.setBounds({ x: 0, y: 0, width: w, height: h });
    };
    browserPopWin.contentView.addChildView(v);
    fit();
    browserPopWin.on("resize", fit);
    browserPopWin.on("close", () => {
      // 关窗前先把视图摘出来，别随窗口销毁(否则丢失页面)
      if (browserView && !browserView.webContents.isDestroyed() && browserPopWin) {
        try {
          browserPopWin.contentView.removeChildView(browserView);
        } catch {
          /* ignore */
        }
      }
    });
    browserPopWin.on("closed", () => {
      browserPopWin = null;
      send("evt:browser-detached", false); // 关掉独立窗=收回到主窗口
    });
  } else {
    browserPopWin.contentView.addChildView(v);
    browserPopWin.focus();
  }
  send("evt:browser-detached", true);
});
ipcMain.on("browser:reattach", () => {
  if (browserPopWin && !browserPopWin.isDestroyed()) {
    if (browserView && !browserView.webContents.isDestroyed()) {
      try {
        browserPopWin.contentView.removeChildView(browserView); // 先摘视图再销毁窗口，保住页面
      } catch {
        /* ignore */
      }
    }
    browserPopWin.destroy();
    browserPopWin = null;
  }
  send("evt:browser-detached", false); // 前端随后 browser:show 重新嵌回主窗口
});

// —— 账号 ——
ipcMain.handle("account:get", () => getAccount());
ipcMain.on("account:logout", () => {
  logout();
  send("evt:account", getAccount());
});

// Claude 订阅一键授权：跑 app 内 OAuth(PKCE)，成功返回 access_token(sk-ant-oat…)
// 渲染层拿到后自动填入并保存切换，无需手动 claude setup-token / 复制粘贴。
// 应用内弹窗授权(自行输账号密码，自动捕获回调)
ipcMain.handle("account:claude-login", async () => {
  log("claude-login-ipc", "应用内弹窗授权");
  const r = await claudeOAuthLogin();
  return r ? r.token : null;
});

// 系统浏览器授权 第1步：打开默认浏览器(可复用已登录 Google)
ipcMain.handle("account:claude-oauth-open", () => {
  log("claude-login-ipc", "打开系统浏览器授权");
  claudeOAuthOpenBrowser();
  return true;
});

// 系统浏览器授权 第2步：用回调页显示的授权码换 token
ipcMain.handle("account:claude-oauth-exchange", async (_e, code: string) => {
  log("claude-login-ipc", "用授权码换 token");
  const r = await claudeOAuthExchange(code);
  // 授权成功 → 权威保存新 token 并热更**所有** claude-oauth 会话，避免「一个对话框授权了、别的对话框还提示过期、要各自重设」。
  // 同一 Claude 订阅是全局共享的一把 token，不该按会话各存。claudeOAuthExchange 已写 sidecar(refresh_token) → 之后自动续期。
  if (r?.token) {
    try {
      const s = loadSettings();
      if (s) {
        s.oauthToken = r.token;
        if (!s.creds) s.creds = {};
        s.creds["claude-oauth"] = { ...(s.creds["claude-oauth"] || {}), oauthToken: r.token };
        saveSettings(s);
        applyEnvFromSettings(s);
        provider = makeProvider(loadConfig());
        for (const [sid, a] of agents) if (backendBySid.get(sid) === "claude-oauth") a.setProvider(provider);
        log("claudeOAuth", "重新授权 → 已热更所有 Claude 订阅会话");
        scheduleClaudeRefresh(); // 新 token 有新的过期时间 → 按它重排续期
        void emitAccount();
      }
    } catch (e) { log("claude-login-ipc", "保存/传播新 token 失败", String(e)); }
  }
  return r ? r.token : null;
});

// Codex 订阅一键授权：app 内跑 ChatGPT OAuth(本地 1455 回环)，写 ~/.codex/auth.json。
// 成功返回 true；由前端切到 codex 预设(复用其成熟切换逻辑) + 刷新账号。
ipcMain.handle("account:codex-login", async () => {
  log("codex-login-ipc", "应用内 ChatGPT 授权");
  const r = await codexOAuthLogin();
  if (!r) return false;
  // Authorization refreshes credentials. It must not select a backend or model;
  // the renderer applies a model only after the user explicitly chooses one.
  const s = loadSettings();
  try {
    if (s?.providerId === 'codex' && s.kind === 'codex' && s.model) {
      initProvider();
      send("evt:ready", { backend: backendLabel, model: modelLabel, cwd, sub: subFlag, ctxWindow });
    }
    void emitAccount();
  } catch (e) {
    log("codex-login-ipc", "重载 provider 失败", String(e));
  }
  return true;
});

// —— 无为账号登录（B2：登录闭环，独立于 codex/claude 账号态，不动 account.ts）——
// 登录 → 拿 /api/me(user+coin) → 明文持久化 ~/.wuwei/auth.json（B3 改 safeStorage 加密）。
ipcMain.handle("account:wuwei-login", async () => {
  // 显式退出后强制重新选账号，避免复用浏览器残留的旧会话。
  const sess = await wuweiLogin(wuweiSessionState.isLoggedOut());
  if (!sess) return null;
  wuweiSessionState.accept(sess);
  try { refreshRelayClient(); } catch { /* 账号换了 → relay 用新号 token 重连、重注册到新账号名下，手机端才看得到 */ }
  loginReportedThisProc = false; // 新登录：重置节流，确保本次登录必报一次
  reportLoginOnce();
  const me = await wuweiFetchMe(sess.accessToken);
  if (me === "unauthorized" || !me) return null;
  applyProFromMe(me);
  return me;
});
// —— 应用内登录（邮箱密码/邮箱注册/手机验证码）：成功存会话+返回 {me}，失败返回 {error:文案} ——
async function finishWuweiSignin(
  r: WuweiSession | string,
  action: "login" | "register" = "login",
): Promise<{ me?: unknown; error?: string }> {
  if (typeof r === "string") return { error: r };
  wuweiSessionState.accept(r);
  try { refreshRelayClient(); } catch { /* 账号换了 → relay 用新号 token 重连、重注册到新账号名下，手机端才看得到 */ }
  loginReportedThisProc = false; // 新登录：重置节流，确保本次登录必报一次
  reportLoginOnce();
  const me = await wuweiFetchMe(r.accessToken);
  if (me === "unauthorized" || !me) {
    return {
      error:
        action === "register"
          ? tr("ui.index.signed.up.but.we.couldn.load.93299bb")
          : tr("ui.index.signed.in.but.we.couldn.load.ea8c7e3"),
    };
  }
  applyProFromMe(me);
  return { me };
}
ipcMain.handle("account:wuwei-password-login", (_e, identifier: string, password: string) =>
  wuweiPasswordLogin(identifier, password).then((r) => finishWuweiSignin(r, "login")),
);
ipcMain.handle("account:wuwei-register", (_e, email: string, code: string, password: string) =>
  wuweiRegister(email, code, password).then((r) => finishWuweiSignin(r, "register")),
);
ipcMain.handle("account:wuwei-code-login", (_e, target: string, code: string) =>
  wuweiCodeLogin(target, code).then((r) => finishWuweiSignin(r, "login")),
);
ipcMain.handle("account:wuwei-send-code", (_e, target: string, lang?: string, purpose?: string) =>
  wuweiSendCode(target, lang, purpose),
);
// 冷启动/刷新：读本地会话 → /api/me；401 走 /api/refresh 续期后重试。
ipcMain.handle("account:wuwei-me", async () => {
  const sess = await getFreshWuweiSession(); // 提前续期 + 单飞，避免并发把 refresh_token 用作废
  if (!sess) return null;
  let me = await wuweiFetchMe(sess.accessToken);
  if (me === "unauthorized") {
    // 提前续过还被拒(时钟偏差/刚好失效)：再强制续一次
    const fresh = await getFreshWuweiSession(sess.accessToken);
    if (!fresh) {
      return null;
    }
    me = await wuweiFetchMe(fresh.accessToken);
  }
  if (!me || me === "unauthorized") {
    // A failed account read is not proof that the refresh token is invalid.
    throw new Error(tr("ui.index.account.refresh.is.temporarily.unavailable.your.fae7799"));
  }
  const meVal = me;
  applyProFromMe(meVal); // 同步会员态 → 脑网络可用性
  if (meVal) reportLoginOnce(); // 启动/运行期首次确认有效会话 → 上报一次登录(节流，本进程只报一次)
  return meVal;
});
ipcMain.handle("account:wuwei-logout", () => {
  wuweiSessionState.logout(); // Invalidate every in-flight refresh before clearing storage.
  try { stopRelayClient(); } catch { /* 登出 → 断开 relay，把这台设备从旧账号名下摘掉 */ }
  loginReportedThisProc = false; // 登出 → 重置节流，下次重登会再上报一次登录
  applyProFromMe(null); // 退出 → 会员态清空 → 脑网络停用
  return true;
});
// AI 提供商目录（脱敏）：带上当前会话 token(可选) 拉后台可配的平台顺序/显隐/模型。失败返回 null → 渲染层回退硬编码 PRESETS。
// 模型平台目录缓存：后端在境外，网络一抖 catalog 就拉不到、模型列表变空。缓存上次成功的，拉失败用它兜底。
const CATALOG_CACHE_FILE = join(homedir(), DATA_DIR_NAME, "cache-catalog.json");
function saveCatalogCache(cat: unknown): void {
  try { mkdirSync(dirname(CATALOG_CACHE_FILE), { recursive: true }); writeFileSync(CATALOG_CACHE_FILE, JSON.stringify(cat), "utf8"); } catch { /* 缓存写失败无害 */ }
}
function loadCatalogCache(): any[] | null {
  try { const v = JSON.parse(readFileSync(CATALOG_CACHE_FILE, "utf8")); return Array.isArray(v) ? v : null; } catch { return null; }
}
function applyAnonProviders(cat: any[]): void {
  anonProviderIds.clear();
  anonProviderIds.add("wuwei-free");
  for (const p of cat) if (p.anon) anonProviderIds.add(p.id);
}
ipcMain.handle("account:image-catalog", async () => {
  const sess = await getFreshWuweiSession().catch(() => null);
  if (!sess?.accessToken) return [];
  const result = await new PlatformBillingClient('https://wuweiai.io', () => sess.accessToken, 'platform').catalog();
  return Array.isArray(result) ? result : [];
});
ipcMain.handle("account:wuwei-catalog", async () => {
  const sess = await getFreshWuweiSession().catch(() => null);
  const cat = await wuweiFetchCatalog(sess?.accessToken ?? null);
  // 记下后台标为 anon(免登录)的平台，供 hasCredential/发送前注入识别；内置 wuwei-free 恒在集合里。
  if (cat) {
    applyAnonProviders(cat);
    saveCatalogCache(cat); // 成功就存一份，供下次网络抖时兜底
    return cat;
  }
  // 拉失败(多为跨境网络抖) → 用上次缓存，模型列表不至于变空、界面不卡在空列表
  const cached = loadCatalogCache();
  if (cached) {
    applyAnonProviders(cached);
    log("wuweiAuth", "catalog 拉取失败，用磁盘缓存兜底", cached.length, "个平台");
    return cached;
  }
  return null;
});
// 模型费用说明：从 wuwei-site 拉定价数据(公开、无需登录)。走主进程避免 CORS。
ipcMain.handle("model-pricing:get", async () => {
  try {
    const site = process.env.WUWEI_SITE_URL || "https://wuweiai.io";
    const res = await fetch(`${site}/api/model-pricing`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
});
// 记住登录：多账号加密存储，供登录框自动填充 + 账号下拉历史。
ipcMain.handle("login:remember-get", () => loadRemember());
ipcMain.handle("login:remember-set", (_e, email: string, password: string) => {
  upsertRemember(email, password);
  return true;
});
ipcMain.handle("login:remember-clear-password", (_e, email: string) => {
  clearRememberedPassword(email);
  return true;
});
// 客户端公告：从 wuwei-site 拉当前发布中的公告(公开、无需登录)。走主进程避免 CORS。
// 网络失败保留为失败，渲染进程会重试；只有服务端明确未发布才返回 inactive。
ipcMain.handle("announcement:get", async () => {
  try {
    return await fetchAnnouncement(net.fetch.bind(net), process.env.WUWEI_SITE_URL || "https://wuweiai.io");
  } catch (error) {
    log("announcement", "公告拉取失败，将重试", error instanceof Error ? error.message : String(error));
    throw new Error("Announcement temporarily unavailable");
  }
});
// 当前应用版本号（帮助菜单显示 + 更新比对）
ipcMain.handle("app:version", () => app.getVersion());

// ── 自动更新（electron-updater + OSS generic 源，发布配置见 electron-builder.wuwei.yml）──
// autoDownload：发现新版即后台静默下载；下载完推 evt:update-downloaded，用户点「升级」再 quitAndInstall。
// 未打包(dev)或无更新源时 checkForUpdates 会抛错，一律吞掉，不影响使用。
const { autoUpdater } = electronUpdater;
let updaterWired = false;
let updatePollInterval = DEFAULT_UPDATE_INTERVAL_MS;
function setupUpdater(): void {
  if (updaterWired) return;
  updaterWired = true;
  // 测试版不接自动更新：否则会去正式版更新源下载并把自己覆盖，失去「独立测试」意义。
  if (IS_TEST) { log("updater", "测试版跳过自动更新"); return; }
  autoUpdater.autoDownload = false; // 策略统一控制下载，避免检查自动开启重复下载
  autoUpdater.allowDowngrade = false;
  autoUpdater.disableDifferentialDownload = false; // 保留 SDK 的差分下载和校验缓存
  autoUpdater.logger = { info: (...args) => log("updater", ...args), warn: (...args) => log("updater", ...args), error: (...args) => log("updater", ...args) };
  autoUpdater.autoInstallOnAppQuit = false; // 不擅自在退出时装，由用户点「升级」触发
  autoUpdater.on("update-available", (info) => {
    send("evt:update-available", { version: info.version, notes: typeof info.releaseNotes === "string" ? info.releaseNotes : "" });
    void trackClientLog("info", "update", { version: app.getVersion(), accessToken: loadWuweiSession()?.accessToken ?? null, message: `发现新版 v${info.version}`, meta: { phase: "available", newVersion: info.version } }).catch(() => {});
  });
  // 下载进度：转发给界面显示进度条（percent 0-100 + 速度/已下/总量）
  autoUpdater.on("download-progress", (p) => {
    send("evt:update-progress", {
      percent: Math.max(0, Math.min(100, p?.percent ?? 0)),
      transferred: p?.transferred ?? 0,
      total: p?.total ?? 0,
      bytesPerSecond: p?.bytesPerSecond ?? 0,
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    downloadedUpdatePath = info.downloadedFile;
    log("updater", "update-downloaded 事件", info.version);
    send("evt:update-downloaded", { version: info.version, notes: typeof info.releaseNotes === "string" ? info.releaseNotes : "" });
    void trackClientLog("info", "update", { version: app.getVersion(), accessToken: loadWuweiSession()?.accessToken ?? null, message: `新版 v${info.version} 已下载就绪`, meta: { phase: "downloaded", newVersion: info.version } }).catch(() => {});
  });
  autoUpdater.on("error", (e) => {
    const msg = String(e?.message || e);
    log("updater", "更新出错", msg);
    void trackClientLog("error", "update", { message: tr("ui.index.message.753df752a0", {p0: msg}), meta: { phase: "updater-event" }, accessToken: loadWuweiSession()?.accessToken ?? null }).catch(() => {});
  });
  // 不手工删除 pending：SDK 的 update-info.json、安装包与差分基底必须保持完整。
  if (!app.isPackaged) return;

  void (async () => {
    try {
      const site = process.env.WUWEI_SITE_URL || "https://wuweiai.io";
      const res = await fetch(`${site}/api/client-config`, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) updatePollInterval = updateIntervalMs(((await res.json()) as { updateCheckSec?: unknown })?.updateCheckSec);
    } catch { /* 默认两小时；旧后台的 60s 配置会被安全下限覆盖 */ }
  })();
  let timer: ReturnType<typeof setTimeout>;
  let stopped = false;
  const poll = async () => {
    try { await checkAndPrepareUpdate(); }
    finally { if (!stopped) timer = setTimeout(poll, jitterUpdateInterval(updatePollInterval)); }
  };
  timer = setTimeout(poll, 15_000 + Math.random() * 45_000);
  app.once("before-quit", () => { stopped = true; clearTimeout(timer); });
  // 聚焦也经过同一冷却和并发门禁，不再每分钟额外访问 OSS。
  app.on("browser-window-focus", () => { void checkAndPrepareUpdate(); });
}

let downloadedUpdatePath: string | undefined;
const updatePolicy = createUpdatePolicy(autoUpdater, {
  intervalMs: () => updatePollInterval,
  readyExists: () => !!downloadedUpdatePath && existsSync(downloadedUpdatePath),
  onReady: (state) => send("evt:update-downloaded", { version: state.version, notes: state.notes }),
});
async function checkAndPrepareUpdate(manual = false) {
  if (IS_TEST || !app.isPackaged) return { available: false };
  const result = await updatePolicy.check(manual);
  if (result.error) log("updater", tr("ui.index.message.de6e424ea5"), result.error);
  return result;
}
// 手动检查绕过常规周期，但复用并发任务、就绪包，遵守下载失败冷却。
ipcMain.handle("updater:check", async () => checkAndPrepareUpdate(true));
// 立即安装已下载的更新并重启
ipcMain.on("updater:install", () => {
  try { autoUpdater.quitAndInstall(); } catch (e: any) { log("updater", tr("ui.index.message.f4f028e3ba"), String(e?.message || e)); }
});
// 每日签到：带 token 调后端 /api/signin（幂等，当天重复调不重复发）。返回 {success, amount, balanceAfter, streak, message}。
ipcMain.handle("account:checkin", async () => {
  const sess = await getFreshWuweiSession();
  if (!sess) return null;
  try {
    const site = process.env.WUWEI_SITE_URL || "https://wuweiai.io";
    const res = await fetch(`${site}/api/signin`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sess.accessToken}`, "X-Device-Id": getDeviceId() },
    });
    const j = (await res.json().catch(() => null)) as
      | { success?: boolean; amount?: number; balanceAfter?: number; streak?: number; message?: string; error?: string }
      | null;
    if (!res.ok || !j) return null;
    return j;
  } catch (e) {
    log("checkin", "签到异常", String(e));
    return null;
  }
});
// 客服留言：POST 到 wuwei-site，后端存库供「留言管理」查看（用户/时间/内容/图片）。带 token 则后端能关联用户。
ipcMain.handle(
  "support:message",
  async (_e, payload: { message: string; contact: string; images: string[] }) => {
    try {
      const site = process.env.WUWEI_SITE_URL || "https://wuweiai.io";
      const sess = loadWuweiSession();
      const headers: Record<string, string> = { "Content-Type": "application/json", "X-Device-Id": getDeviceId() };
      if (sess) headers.Authorization = `Bearer ${sess.accessToken}`;
      const res = await fetch(`${site}/api/support/message`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: payload?.message || "",
          contact: payload?.contact || "",
          images: Array.isArray(payload?.images) ? payload.images.slice(0, 4) : [],
        }),
      });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !j) return { ok: false, error: j?.error || `http_${res.status}` };
      return { ok: j.ok !== false, error: j.error };
    } catch (e) {
      log("support", "留言提交异常", String(e));
      return { ok: false, error: "network" };
    }
  },
);
// 在线客服 thread：拉当前用户与客服的完整对话 + 未读数。seen=true 时清未读。未登录 → 空。
ipcMain.handle("support:thread", async (_e, seen?: boolean) => {
  try {
    const site = process.env.WUWEI_SITE_URL || "https://wuweiai.io";
    const sess = loadWuweiSession();
    if (!sess) return { messages: [], unread: 0 };
    const res = await fetch(`${site}/api/support/chat${seen ? "?seen=1" : ""}`, {
      headers: { Authorization: `Bearer ${sess.accessToken}`, "X-Device-Id": getDeviceId() },
    });
    const j = (await res.json().catch(() => null)) as { messages?: unknown[]; unread?: number } | null;
    if (!res.ok || !j) return { messages: [], unread: 0 };
    return { messages: j.messages ?? [], unread: j.unread ?? 0 };
  } catch (e) {
    log("support", "thread 拉取异常", String(e));
    return { messages: [], unread: 0 };
  }
});
// 在线客服：发一条实时消息(独立于留言)。需登录。
ipcMain.handle("support:chat-send", async (_e, payload: { message: string; images: string[] }) => {
  try {
    const site = process.env.WUWEI_SITE_URL || "https://wuweiai.io";
    const sess = loadWuweiSession();
    if (!sess) return { ok: false, error: "not_logged_in" };
    const res = await fetch(`${site}/api/support/chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sess.accessToken}`, "Content-Type": "application/json", "X-Device-Id": getDeviceId() },
      body: JSON.stringify({ message: payload?.message || "", images: Array.isArray(payload?.images) ? payload.images.slice(0, 4) : [] }),
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !j) return { ok: false, error: j?.error || `http_${res.status}` };
    return { ok: j.ok !== false, error: j.error };
  } catch (e) {
    log("support", "chat 发送异常", String(e));
    return { ok: false, error: "network" };
  }
});
// 消息中心：拉取当前用户消息 + 未读数。未登录 → 空列表。带 token 后端按 user_id 过滤。
ipcMain.handle("messages:list", async () => {
  const empty = { messages: [], unread: 0 };
  const sess = await getFreshWuweiSession();
  if (!sess) return empty;
  try {
    const site = process.env.WUWEI_SITE_URL || "https://wuweiai.io";
    const res = await fetch(`${site}/api/me/messages`, {
      headers: { Authorization: `Bearer ${sess.accessToken}`, "X-Device-Id": getDeviceId() },
    });
    const j = (await res.json().catch(() => null)) as { messages?: unknown[]; unread?: number } | null;
    if (!res.ok || !j) return empty;
    return { messages: Array.isArray(j.messages) ? j.messages : [], unread: Number(j.unread) || 0 };
  } catch (e) {
    log("messages", "拉取消息异常", String(e));
    return empty;
  }
});
// 消息中心：标记已读（ids 或 all）→ 返回剩余未读数
ipcMain.handle("messages:read", async (_e, arg: { ids?: number[]; all?: boolean }) => {
  const sess = await getFreshWuweiSession();
  if (!sess) return { ok: false, unread: 0 };
  try {
    const site = process.env.WUWEI_SITE_URL || "https://wuweiai.io";
    const res = await fetch(`${site}/api/me/messages/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sess.accessToken}`, "Content-Type": "application/json", "X-Device-Id": getDeviceId() },
      body: JSON.stringify({ ids: Array.isArray(arg?.ids) ? arg.ids : undefined, all: !!arg?.all }),
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; unread?: number } | null;
    if (!res.ok || !j) return { ok: false, unread: 0 };
    return { ok: j.ok !== false, unread: Number(j.unread) || 0 };
  } catch (e) {
    log("messages", "标记已读异常", String(e));
    return { ok: false, unread: 0 };
  }
});
// 稳定设备指纹（灰度开关 & 免费试用额度共用）
ipcMain.handle("account:wuwei-device-id", () => getDeviceId());

// 产品行为埋点：渲染层任意 UI 事件 → window.wuwei.track(event, props?, detail?)，这里补 session/version/token → product_events
ipcMain.handle("track", (_e, p: { event?: string; props?: Record<string, unknown>; detail?: string }) => {
  const v = IS_TEST ? `${app.getVersion()}-test` : app.getVersion();
  void trackProductEvent(String(p?.event || ""), { props: p?.props, detail: p?.detail, sessionId: APP_SESSION_ID, version: v, accessToken: loadWuweiSession()?.accessToken ?? null });
  return true;
});

// ── 扫码支付：下单 / 轮询。带用户 token 调后端，401 自动 refresh 重试（同 wuwei-me）──
ipcMain.handle('billing:request',async (_e,request:import('../../src/billing/contracts.js').BillingRequest)=>{
  const sess=await getFreshWuweiSession();
  if(!sess) return {error:'not_logged_in'};
  let response=await wuweiBillingRequest(sess.accessToken,request);
  if(response==='unauthorized') {
    const fresh=await getFreshWuweiSession(sess.accessToken);
    if(!fresh) return {error:'not_logged_in'};
    response=await wuweiBillingRequest(fresh.accessToken,request);
  }
  return response==='unauthorized'?{error:'not_logged_in'}:response;
});
ipcMain.handle("pay:create", async (_e, sku: string, channel: string) => {
  const sess = await getFreshWuweiSession(); // 下单前先确保 token 新鲜，减少 401 与误登出
  if (!sess) return { error: "not_logged_in" };
  let r = await wuweiPayCreate(sess.accessToken, sku, channel);
  if (r === "unauthorized") {
    const fresh = await getFreshWuweiSession(sess.accessToken);
    if (!fresh) {
      return { error: "not_logged_in" };
    }
    r = await wuweiPayCreate(fresh.accessToken, sku, channel);
  }
  return r === "unauthorized" ? { error: "not_logged_in" } : r;
});
// 加密货币下单：建 NOWPayments 发票，返回收银台 URL。带 token，401 自动 refresh 重试。
ipcMain.handle("pay:crypto:create", async (_e, sku: string) => {
  const sess = await getFreshWuweiSession();
  if (!sess) return { error: "not_logged_in" };
  let r = await wuweiPayCryptoCreate(sess.accessToken, sku);
  if (r === "unauthorized") {
    const fresh = await getFreshWuweiSession(sess.accessToken);
    if (!fresh) {
      return { error: "not_logged_in" };
    }
    r = await wuweiPayCryptoCreate(fresh.accessToken, sku);
  }
  return r === "unauthorized" ? { error: "not_logged_in" } : r;
});
// 加密应用内直付：拿收款地址+应付数量，渲染器自渲染二维码。带 token，401 自动 refresh 重试。
ipcMain.handle("pay:crypto:payment", async (_e, sku: string, chain: string) => {
  const sess = await getFreshWuweiSession();
  if (!sess) return { error: "not_logged_in" };
  let r = await wuweiPayCryptoPayment(sess.accessToken, sku, chain);
  if (r === "unauthorized") {
    const fresh = await getFreshWuweiSession(sess.accessToken);
    if (!fresh) {
      return { error: "not_logged_in" };
    }
    r = await wuweiPayCryptoPayment(fresh.accessToken, sku, chain);
  }
  return r === "unauthorized" ? { error: "not_logged_in" } : r;
});
ipcMain.handle("pay:status", async (_e, orderId: string) => {
  const sess = await getFreshWuweiSession();
  if (!sess) return null;
  let r = await wuweiPayStatus(sess.accessToken, orderId);
  if (r === "unauthorized") {
    const fresh = await getFreshWuweiSession(sess.accessToken);
    if (!fresh) {
      return null;
    }
    r = await wuweiPayStatus(fresh.accessToken, orderId);
  }
  return r === "unauthorized" ? null : r;
});

// 动态拉当前平台的实时模型列表(/models)：OpenAI 兼容用 Bearer，Anthropic 用 x-api-key。
// 前端并入下拉(与预设去重)，新模型上线自动出现。订阅/无 key 的返回空、走预设。
ipcMain.handle("models:fetch", async () => {
  try {
    const cfg = loadConfig();
    if (cfg.provider === "codex") return []; // Codex 订阅无 models 接口
    let url: string;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (cfg.provider === "anthropic") {
      if (cfg.authMode === "oauth" || !cfg.apiKey) return []; // 订阅 OAuth 无 x-api-key
      url = "https://api.anthropic.com/v1/models?limit=100";
      headers["x-api-key"] = cfg.apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      if (!cfg.apiKey || cfg.apiKey === "not-needed") return [];
      const base = (cfg.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
      url = base + "/models";
      headers.Authorization = "Bearer " + cfg.apiKey;
    }
    const r = await fetch(url, { headers });
    if (!r.ok) return [];
    const j: any = await r.json().catch(() => null);
    const ids = (j?.data || j?.models || [])
      .map((m: any) => (typeof m === "string" ? m : m?.id))
      .filter((x: any) => typeof x === "string");
    log("models:fetch", cfg.provider, "拿到", ids.length, "个模型");
    return ids as string[];
  } catch (e) {
    log("models:fetch", "出错", String(e).slice(0, 80));
    return [];
  }
});

// 读系统剪贴板(供「完成授权」自动取授权码)
ipcMain.handle("util:read-clipboard", () => clipboard.readText() || "");

// —— 无边框窗口控制（自绘标题栏用）——
ipcMain.on("win:minimize", () => win?.minimize());
ipcMain.on("win:maximize", () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.on("win:close", () => win?.close());
ipcMain.handle("win:is-maximized", () => !!win?.isMaximized());

// 用候选 API Key 试连通(不落库)：给平台临时套上这个 key 发个 ping，通过才让渲染层保存。
// override 可指定要测的平台/端点/模型(设置页里选的平台可能还不是当前生效的)。
ipcMain.handle(
  "conn:test-key",
  async (_e, key: string, override?: { provider?: string; baseUrl?: string; model?: string }) => {
  const k = (key || "").trim();
  if (!k) return { ok: false, reason: tr("ui.index.empty.key.7dafdb0") };
  try {
    const cfg = loadConfig();
    const tcfg: any = { ...cfg, apiKey: k, authMode: "api-key", oauthToken: "" };
    if (override?.provider) {
      tcfg.provider = override.provider;
      tcfg.baseUrl = override.baseUrl || undefined; // anthropic 用默认端点，openai 用预设 baseUrl
    }
    if (override?.model) tcfg.model = override.model;
    const p = makeProvider(tcfg);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 25000);
    await p.complete("", [{ role: "user", content: [{ type: "text", text: "ping" }] }], [], {
      signal: ac.signal,
    });
    clearTimeout(timer);
    return { ok: true, reason: tr("ui.index.verified.5768bc4") };
  } catch (e: any) {
    return { ok: false, reason: (e?.message ? String(e.message) : String(e)).slice(0, 600) };
  }
});

// 当前平台是否已配置凭证(红灯判据：无凭证=不可用)
function hasCredential(cfg: ReturnType<typeof loadConfig>): boolean {
  if (cfg.provider === "codex") return !!cfg.codexToken;
  if (cfg.provider === "anthropic")
    return cfg.authMode === "oauth" ? !!cfg.oauthToken : !!cfg.apiKey;
  // 无为托管平台：key 不落 config、只在发送前注入 env，故这里以"已登录无为"为准。
  // 登录了即有凭证(判绿由后续真实 ping 决定；网关不通会转黄，而非红)。
  // 例外：anon(免登录)平台始终有凭证——未登录用 anon-<设备id> 走匿名试用。
  if (isHostedProvider(curProviderId())) return isAnonProvider(curProviderId()) || !!loadWuweiSession();
  // openai 兼容：有真实 key 即可；本地端点(localhost)无需 key。
  // 托管平台(通义千问/DeepSeek 等)虽有固定 baseUrl，但没 key 一样不可用→判红。
  const hasKey = !!cfg.apiKey && cfg.apiKey !== "not-needed";
  const isLocal = !!cfg.baseUrl && /(localhost|127\.0\.0\.1|0\.0\.0\.0)/.test(cfg.baseUrl);
  return hasKey || isLocal;
}

// 连通状态检测：红=未配置/未授权；绿=实测 ping 通；黄=已配置但请求报错
// 由渲染层在启动/切换平台/点灯时调用
ipcMain.handle("conn:check", async () => {
  const settings = loadSettings();
  if (settings?.imageMode) {
    const sess = await getFreshWuweiSession().catch(() => null);
    if (!sess?.accessToken) return { status: "red", reason: tr("ui.index.sign.in.to.use.hosted.image.5b6716d") };
    return checkImageAvailability(new PlatformBillingClient('https://wuweiai.io', () => sess.accessToken, 'platform'),
      settings.imageSku || '', process.env.WUWEI_LANG === 'en' ? 'en' : 'zh');
  }
  const cfg = loadConfig();
  if (!hasCredential(cfg)) {
    return { status: "red", reason: tr("ui.index.this.provider.has.no.credentials.isn.362db6c") };
  }
  // 匿名试用平台(未登录)：真实 ping 会走网关匿名分支、白白消耗当日免费次数。
  // 故未登录时不 ping，直接判绿——凭证恒在(anon-<设备id>)，真连通性发消息时自会体现。
  if (isAnonProvider(curProviderId()) && !loadWuweiSession()) {
    return { status: "green", reason: tr("ui.index.free.trial.ready.no.login.needed.857cd8b") };
  }
  // 托管平台：ping 前必须先注入新鲜的无为 token 并重建 provider，
  // 否则用的是空/旧 token（token 只在发消息前注入），网关会回 401 invalid_token 而误判「未连通」。
  if (isHostedProvider(curProviderId())) await ensureHostedProviderReady();
  if (!provider) return { status: "red", reason: tr("ui.index.not.initialized.please.check.settings.d9ba807") };
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 25000);
    // 极小 ping：不带工具、只发一句，验证鉴权+连通。顺带捕获响应里的订阅额度/余额头，切平台检测即刷新
    await provider.complete(
      "",
      [{ role: "user", content: [{ type: "text", text: "ping" }] }],
      [],
      {
        signal: ac.signal,
        onRateLimits: (rl: unknown) => {
          const pid = curProviderId();
          saveRateLimits(pid, rl);
          send("evt:ratelimits", rl);
        },
      },
    );
    clearTimeout(timer);
    void emitAccount(); // 检测通过后刷新账户/余额(DeepSeek 等计费平台余额也随检测更新)
    return { status: "green", reason: tr("ui.index.connected.ready.to.use.4129414", { p0: backendLabel, p1: modelLabel }) };
  } catch (e: any) {
    const msg = (e?.message ? String(e.message) : String(e)).replace(/\[\[gw:[^\]]+\]\]\s*/g, "");
    return { status: "yellow", reason: tr("ui.index.configured.but.the.request.errored.fcc1348") + msg.slice(0, 600) };
  }
});

// 浏览器登录抓账号信息(头像/昵称)，存进当前平台的凭证槽
ipcMain.handle("account:web-login", async (_e, pid: string) => {
  log("web-login-ipc", "调用", pid);
  const info = await webLogin(pid);
  if (!info) {
    log("web-login-ipc", "webLogin 返回 null，不更新");
    return false;
  }
  const s = loadSettings();
  if (!s) return false;
  const c = { ...(s.creds || {}) };
  const avatar = (await toDataUri(info.avatar)) || c[pid]?.avatar; // 头像存成 data: URI
  c[pid] = {
    ...(c[pid] || {}),
    nickname: info.name || c[pid]?.nickname,
    avatar,
    webToken: info.token || c[pid]?.webToken, // 存 token，供以后静默刷新，过期才需重登
  };
  saveSettings({ ...s, creds: c });
  log(
    "web-login-ipc",
    "已存",
    pid,
    "昵称=", c[pid].nickname,
    "头像=", avatar ? "有" : tr("acct.userInitial"),
    "token=", c[pid].webToken ? "有" : tr("acct.userInitial"),
  );
  void emitAccount();
  return true;
});

// ==================== 完整对话日志归档（压缩前的原始消息，永不压缩） ====================
// 上下文压缩会把旧消息换成摘要、原文就丢了。这里把压缩前的原始消息按会话追加进 jsonl，
// 供"查看完整历史"弹窗还原被压缩前的交流(尤其半夜自主推进跑很久时)。
const transcriptsDir = () => join(app.getPath("userData"), "transcripts");
const transcriptFile = (sid: string) => join(transcriptsDir(), String(sid).replace(/[^\w.-]/g, "_") + ".jsonl");
function archiveMessages(sid: string, msgs: any[]) {
  if (!sid || !Array.isArray(msgs) || !msgs.length) return;
  try {
    mkdirSync(transcriptsDir(), { recursive: true });
    const lines = msgs
      .map((m) => { try { return JSON.stringify({ role: m.role, content: m.content, ts: m.ts || 0 }); } catch { return ""; } })
      .filter(Boolean)
      .join("\n") + "\n";
    appendFileSync(transcriptFile(sid), lines, "utf-8");
  } catch { /* 归档失败不影响主流程 */ }
}
// 查看完整历史：已归档(被压缩掉的原始消息) + 当前持久化消息(含最新摘要与近期原文)，拼成完整对话。
// 没发生过压缩时归档为空，直接就是全量历史；发生过压缩则 = 压缩前原文 + 摘要 + 近期。
ipcMain.handle("session:transcript", (_e, sid: string) => {
  const id = String(sid || "");
  let archived: any[] = [];
  try {
    const raw = readFileSync(transcriptFile(id), "utf-8");
    archived = raw.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { /* 无归档文件=从没压缩过 */ }
  let live: any[] = [];
  try { live = loadMessages(id) || []; } catch { /* ignore */ }
  return { archived, live, full: [...archived, ...live], compacted: archived.length > 0 };
});
// 按保留天数清理归档(渲染端启动时用它的设置调一次)
ipcMain.handle("session:pruneTranscripts", (_e, days: number) => { pruneTranscripts(Number(days) || 0); });
// 保留天数清理：删掉超过 N 天没更新的归档(N<=0 表示永久保留)
function pruneTranscripts(days: number) {
  if (!days || days <= 0) return;
  try {
    const dir = transcriptsDir();
    if (!existsSync(dir)) return;
    const cutoff = Date.now() - days * 86400_000;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".jsonl")) continue;
      const p = join(dir, f);
      try { if (statSync(p).mtimeMs < cutoff) unlinkSync(p); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

// ==================== 智能继续：会话总目标 + 自定义红线 + 后台推进集合 ====================
// —— 会话总目标：给这个对话定一个大目标，它自己拆解、自己一步步推进 ——
// 计划节点：一步 + 验收标准 + 状态。防跑偏的骨架——每步都回看"现在在哪个节点、达没达验收"
type PlanStep = { id: string; title: string; acceptance: string; status: "todo" | "doing" | "done"; description?: string; children?: PlanStep[] };
// 递归规整计划树(限深3、限量)：清洗每个节点的字段并保留子节点
function sanitizePlan(arr: any, depth = 1): PlanStep[] | undefined {
  if (!Array.isArray(arr) || depth > 3) return undefined;
  const out = arr.slice(0, 40).map((s: any, i: number) => {
    const node: PlanStep = {
      id: String(s?.id || `s${depth}_${i + 1}`).slice(0, 40),
      title: String(s?.title || "").slice(0, 300),
      acceptance: String(s?.acceptance || "").slice(0, 600),
      status: s?.status === "doing" || s?.status === "done" ? s.status : "todo",
    };
    if (s?.description) node.description = String(s.description).slice(0, 4000);
    const kids = sanitizePlan(s?.children, depth + 1);
    if (kids && kids.length) node.children = kids;
    return node;
  });
  return out;
}
type SessionGoal = {
  text: string;
  active: boolean;
  done?: boolean;
  research?: string;                      // 调研结论(联网调研后回填，可编辑)
  rules?: { do: string; dont: string };   // 要做哪些 / 绝不做哪些(告诉 AI 边界，防跑偏)
  plan?: PlanStep[];                       // 分步计划，每步带验收标准
};
let sessionGoals: Record<string, SessionGoal> = {};
const goalsFile = () => join(app.getPath("userData"), "session-goals.json");
function loadGoals() {
  try { sessionGoals = JSON.parse(readFileSync(goalsFile(), "utf-8")) || {}; } catch { sessionGoals = {}; }
}
function saveGoals() {
  try { writeFileSync(goalsFile(), JSON.stringify(sessionGoals), "utf-8"); } catch { /* 存不下不影响主流程 */ }
}
// 用户自己写的「必须停下来问我」的规则(设置→运行模式)，优先级高于内置判断
let stopRules = "";
const stopRulesFile = () => join(app.getPath("userData"), "stop-rules.txt");
// 首次使用给一份常见红线，省得用户从零写；之后以文件为准(不覆盖他改过的)。
// 中英各一份；「未改过的默认值」(空 / 恰好等于任一语言默认)跟随界面语言自动切换，改过的一律保留原样。
const DEFAULT_STOP_RULES_ZH = tr("agent.defaultStopRules", {}, "zh");
const DEFAULT_STOP_RULES_EN = tr("agent.defaultStopRules", {}, "en");
const defaultStopRules = () => tr("agent.defaultStopRules");
// 是否「未改过的默认值」：空 or 恰好等于任一语言默认 → 视为没自定义，读取时按当前语言给默认。
const isUneditedStopRules = (s: string) => {
  const t = (s || "").trim();
  return t === "" || getLanguages().some(locale => t === tr("agent.defaultStopRules", {}, locale.code));
};
function loadStopRules() {
  try {
    stopRules = readFileSync(stopRulesFile(), "utf-8");
  } catch {
    stopRules = ""; // 无文件：留空、不落盘，读取时按当前语言给默认(保持随语言动态，直到用户真正改过)
  }
}
// 未改过 → 返回当前语言的默认；改过 → 原样返回。这样存量的中文默认在英文界面下会自动显示英文版。
ipcMain.handle("chat:stopRulesGet", () => (isUneditedStopRules(stopRules) ? defaultStopRules() : stopRules));
ipcMain.handle("chat:stopRulesSet", (_e, t: string) => {
  stopRules = String(t || "").slice(0, 4000);
  try { writeFileSync(stopRulesFile(), stopRules, "utf-8"); } catch { /* ignore */ }
});
ipcMain.handle("chat:goalGet", (_e, sid: string) => sessionGoals[String(sid || "")] || null);
ipcMain.handle("chat:goalSet", (_e, sid: string, goal: SessionGoal | null) => {
  const k = String(sid || "");
  if (!k) return;
  // 只有显式传 null 才删；「完成」只是把 active 关掉、done 打上，目标本身一直留着
  if (!goal || !String(goal.text || "").trim()) delete sessionGoals[k];
  else sessionGoals[k] = {
    text: String(goal.text).slice(0, 2000),
    active: !!goal.active,
    done: !!goal.done,
    research: goal.research ? String(goal.research).slice(0, 6000) : undefined,
    rules: goal.rules
      ? { do: String(goal.rules.do || "").slice(0, 2000), dont: String(goal.rules.dont || "").slice(0, 2000) }
      : undefined,
    plan: sanitizePlan(goal.plan),
  };
  saveGoals();
});
// 「调研并拟计划」：给某会话下一轮 Agent 回复"武装"成契约草稿——跑完解析末尾 JSON，回填弹窗
const charterDraftPending = new Set<string>();
// 已解析好的草稿缓存：渲染层刷新/重载可能错过 evt:charter-draft，留着让它 charterDraftGet 补拉，避免重跑调研
const lastCharterDrafts = new Map<string, any>();
ipcMain.on("chat:charter-draft-arm", (_e, sid: string) => { if (sid) { charterDraftPending.add(String(sid)); lastCharterDrafts.delete(String(sid)); } });
ipcMain.on("chat:charter-draft-disarm", (_e, sid: string) => { charterDraftPending.delete(String(sid || "")); });
// 渲染层重连：拉取（并清掉）这个会话已备好的调研草稿；没有则返回 null
ipcMain.handle("chat:charter-draft-get", (_e, sid: string) => {
  const k = String(sid || "");
  const d = lastCharterDrafts.get(k) || null;
  if (d) lastCharterDrafts.delete(k);
  return d;
});
// ⭐「调研并拟计划」独立子会话：跑一个全新隔离的 Agent(有 web_search/web_fetch)专做调研，
// await 到完整结果再解析——彻底避开"在用户对话里流式竞态/上下文臃肿/被自身动量带偏"三大坑。
// 进度走独立事件 evt:charter-progress(不污染聊天)；完成同时缓存+发 evt:charter-draft(刷新也能收)。
const charterResearchRuns = new Map<string, AbortController>();
ipcMain.handle("chat:charter-research", async (_e, uiSid: string, prompt: string) => {
  const sid = String(uiSid || "");
  if (!provider || !sid || !prompt) return { ok: false, error: "bad args" };
  charterResearchRuns.get(sid)?.abort(); // 有旧的先取消
  try { await ensureFreshClaudeOAuth(); } catch { /* ignore */ }
  try { await ensureHostedProviderReady(sid); } catch { /* ignore */ }
  // ⚠ 安全：调研子会话只给【只读研究工具】，绝不给 write_file/bash 等——它是自主跑、无权限确认的，
  // 手里不能有能改文件/执行命令的能力(会在真实项目目录乱来)。
  const RESEARCH_TOOL_NAMES = new Set(["web_search", "web_fetch", "read_file", "grep", "glob"]);
  const rTools = desktopTools().filter((t) => RESEARCH_TOOL_NAMES.has(t.name));
  const rMap = new Map(rTools.map((t) => [t.name, t]));
  const researchSys = tr("ui.index.you.are.web.research.assistant.use.c8805ca");
  const ra = new Agent(provider, researchSys, rTools, { cwd, sessionId: "__charter_" + sid }, rMap, agentOpts);
  const ac = new AbortController();
  charterResearchRuns.set(sid, ac);
  try {
    await ra.send(prompt, {
      // 只转发工具活动做实时进度(不发 assistant 正文→不污染聊天)
      onToolStart: (id: string, name: string, input: any) => send("evt:charter-progress", { sid, name, input }),
    } as any, ac.signal);
    if (ac.signal.aborted) return { ok: false, error: "aborted" };
    const last = [...ra.getMessages()].reverse().find((m: any) => m.role === "assistant");
    const full = last ? msgFullText(last) : "";
    const d = extractCharterJson(full);
    if (!d) {
      try { log("charterDraft", sid.slice(0, 8), "research-agent no json; len=", String(full.length), "tail=", JSON.stringify(full.slice(-300))); } catch { /* ignore */ }
      return { ok: false, error: "no_json" };
    }
    const draft = buildCharterDraftObj(d);
    lastCharterDrafts.set(sid, draft);              // 缓存：刷新后 charterDraftGet 补拉
    send("evt:charter-draft", { sid, draft });       // 事件：刷新后的渲染层也能收到回填
    try { log("charterDraft", sid.slice(0, 8), "research-agent ok; plan=", String(draft.plan.length), "research=", String(draft.research.length)); } catch { /* ignore */ }
    return { ok: true, draft };
  } catch (e: any) {
    if (ac.signal.aborted) return { ok: false, error: "aborted" };
    try { log("charterDraft", sid.slice(0, 8), "research-agent error", String(e?.message || e).slice(0, 300)); } catch { /* ignore */ }
    return { ok: false, error: String(e?.message || e) };
  } finally {
    if (charterResearchRuns.get(sid) === ac) charterResearchRuns.delete(sid);
  }
});
ipcMain.on("chat:charter-research-cancel", (_e, uiSid: string) => { charterResearchRuns.get(String(uiSid || ""))?.abort(); });
// 从一段文本里稳健地抽出契约 JSON 对象：容忍 ```json/```围栏、行内注释、尾逗号；
// 找不到围栏就扫描所有平衡的 {...}，从后往前挑第一个能解析且含 research/plan/rules 的。
function extractCharterJson(full: string): any | null {
  const tryParse = (s: string): any | null => {
    if (!s || !s.trim()) return null;
    const cleaned = s
      .replace(/\/\/[^\n\r]*/g, "")       // 行注释
      .replace(/\/\*[\s\S]*?\*\//g, "")    // 块注释
      .replace(/,(\s*[}\]])/g, "$1");      // 尾逗号
    for (const cand of [s, cleaned]) {
      try { const o = JSON.parse(cand); if (o && typeof o === "object") return o; } catch { /* 下一个候选 */ }
    }
    return null;
  };
  const looksCharter = (o: any) => o && (o.research !== undefined || o.plan !== undefined || o.rules !== undefined || o.计划 !== undefined || o.调研 !== undefined);
  // 1) ```json 围栏（从后往前）
  const jsonFences = [...full.matchAll(/```json\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  for (let i = jsonFences.length - 1; i >= 0; i--) { const o = tryParse(jsonFences[i]); if (o) return o; }
  // 2) 任意 ``` 围栏里含 { 的
  const anyFences = [...full.matchAll(/```[a-z]*\s*([\s\S]*?)```/gi)].map((m) => m[1]).filter((s) => s.includes("{"));
  for (let i = anyFences.length - 1; i >= 0; i--) { const o = tryParse(anyFences[i]); if (o) return o; }
  // 3) 扫描所有平衡的 {...}
  const objs: string[] = [];
  let depth = 0, start = -1;
  for (let i = 0; i < full.length; i++) {
    const c = full[i];
    if (c === "{") { if (depth === 0) start = i; depth++; }
    else if (c === "}") { if (depth > 0) { depth--; if (depth === 0 && start >= 0) { objs.push(full.slice(start, i + 1)); start = -1; } } }
  }
  for (let i = objs.length - 1; i >= 0; i--) { const o = tryParse(objs[i]); if (looksCharter(o)) return o; } // 优先像契约的
  for (let i = objs.length - 1; i >= 0; i--) { const o = tryParse(objs[i]); if (o) return o; }               // 再退而求其次
  return null;
}
// 取某会话「最后一条 assistant 正文」：内存 getMessages 与落盘会话文件都读，取更长(更可能是完整)的那条。
// 落盘兜底是为了绕开 getMessages 流式未落定/陈旧的问题——persist 写进文件的是完整消息。
function lastAssistantText(id: string): string {
  let t1 = "";
  try { const m = [...(agents.get(id)?.getMessages() || [])].reverse().find((x: any) => x.role === "assistant"); if (m) t1 = msgFullText(m); } catch { /* ignore */ }
  let t2 = "";
  try {
    const p = join(homedir(), process.env.WUWEI_DATA_DIR_NAME || ".wuwei", "sessions", id + ".json");
    const raw = JSON.parse(readFileSync(p, "utf-8"));
    const msgs = Array.isArray(raw) ? raw : (raw?.messages || []);
    const m = [...msgs].reverse().find((x: any) => x && x.role === "assistant");
    if (m) t2 = msgFullText(m);
  } catch { /* 文件没有/结构不符→忽略 */ }
  return t2.length > t1.length ? t2 : t1;
}
// 把解析出的对象规整成契约草稿(research/rules/plan)，research/规则写成对象/数组也转成文字，容错。
// plan 递归成树(title/description/acceptance/children)，限深 3。
function buildCharterDraftObj(d: any) {
  const S = (v: any) => (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v));
  const mapNodes = (arr: any, depth = 1): any[] => {
    if (!Array.isArray(arr) || depth > 3) return [];
    return arr.map((s: any) => {
      const node: any = {
        title: S(s?.title ?? s?.step ?? s?.步骤 ?? s?.标题),
        description: S(s?.description ?? s?.说明 ?? s?.desc ?? s?.详情),
        acceptance: S(s?.acceptance ?? s?.criteria ?? s?.验收 ?? s?.验收标准),
      };
      const kids = mapNodes(s?.children ?? s?.subtasks ?? s?.子节点 ?? s?.子任务, depth + 1);
      if (kids.length) node.children = kids;
      return node;
    });
  };
  return {
    research: S(d.research ?? d.调研),
    rules: {
      do: S(d.rules?.do ?? d.do ?? d.要做),
      dont: S(d.rules?.dont ?? d.dont ?? d.不做 ?? d.绝不做),
    },
    plan: mapNodes(d.plan || d.计划),
  };
}
// 从这轮助手最后回复里抽出契约 JSON → 缓存 + 事件回填弹窗。抽到并解析成功返回 true。
function tryExtractCharterDraft(id: string): boolean {
  const full = lastAssistantText(id);
  if (!full) return false;
  const d = extractCharterJson(full);
  if (!d) return false; // 失败不在此打日志(流式可能没落定，由调用方延时重试；最终放弃时才记诊断)
  const draft = buildCharterDraftObj(d);
  try { log("charterDraft", id.slice(0, 8), "parsed ok; plan=", String(draft.plan.length), "research=", String(draft.research.length)); } catch { /* ignore */ }
  lastCharterDrafts.set(id, draft); // 缓存，供刷新后补拉
  send("evt:charter-draft", { sid: id, draft });
  return true;
}
// 开着「智能继续/自主推进」的会话集合(渲染端在模式变化时同步过来)。
// 这些会话即使不在屏幕上，跑完一轮也要照样算下一步建议——否则切走就断在那儿。
const contSessions = new Set<string>();
ipcMain.on("chat:cont-sessions", (_e, ids: string[]) => {
  contSessions.clear();
  for (const id of Array.isArray(ids) ? ids : []) if (id) contSessions.add(String(id));
});

// ==================== AGI 板块：数字婴儿对接 ====================
// 用 child_process 调 Python 跑 d1_digital_baby/baby_server.py,把结果返回渲染进程。
// 路径可配置：python 路径 / baby 目录 / LLM 地址都从 ~/.wuwei/config.json 的 agi 字段读。
// ⚠ 迁自 minicc(mac 环境),默认值已中性化：babyDir 必须自己在 config.json 填,
//   python 默认走 PATH 里的 "python"。这套依赖本地 agi-lab/d1_digital_baby + python3.10,
//   普通发版用户没有这套后端,数字婴儿对他们是隐藏/点了报错的开发者功能。
function agiCfg() {
  const s: any = loadSettings() || {};
  const agi = s.agi || {};
  return {
    enabled: agi.enabled !== false, // 默认开
    python: agi.python || "python", // Win/跨平台默认走 PATH；需要可在 config.json 填绝对路径(mac 常是 /usr/local/bin/python3)
    babyDir: agi.babyDir || "", // 必填：agi-lab/d1_digital_baby 的绝对路径。留空则启动时给出友好报错
    llmBase: agi.llmBase || "http://192.168.2.195:8002/v1",
    llmModel: agi.llmModel || "qwen3.6-35b-a3b",
  };
}

// ——— 数字婴儿常驻服务 ———
// 旧版每次 execFile 冷启动 python，光 import sentence_transformers+加载句向量模型就 ~11s。
// 改成常驻 HTTP 服务(baby_server.py)：模型只加载一次，之后每次请求秒回。
let babyProc: any = null;
let babyPort = 0;
let babyReady = false;
let babyStarting: Promise<void> | null = null;
// 婴儿的"大脑"：本地 nano_baby_gpt(纯手写小 GPT)。当 llmBase 指向本机时由 wuwei 自动拉起，
// 这样开婴儿=大脑+身体一起起，用户不用手动跑。指向外部 LLM 时不管(那是用户自己的服务)。
let babyBrainProc: any = null;
let babyBrainStarting: Promise<void> | null = null;

const _sleepBaby = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 找一个空闲端口
function pickPort(): Promise<number> {
  return new Promise(async (resolve, reject) => {
    const netmod = await import("node:net");
    const srv = netmod.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = (srv.address() as any).port;
      srv.close(() => resolve(p));
    });
  });
}

// 探活 /health
function pingHealth(port: number): Promise<boolean> {
  return new Promise(async (resolve) => {
    const http = await import("node:http");
    const req = http.request({ host: "127.0.0.1", port, path: "/health", method: "GET", timeout: 1500 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.end();
  });
}

// 确保婴儿"大脑"(本地 nano_baby_gpt)在跑。llmBase 指向本机(127.0.0.1/localhost)且 babyDir 有
// nano_baby_gpt.py 才管；已经健康在跑就跳过(不重复起，兼容用户手动起的)。首启无 checkpoint 会先训练。
function ensureNanoBrain(cfg: ReturnType<typeof agiCfg>): Promise<void> {
  const p = (async () => {
    let host = "", port = 0;
    try { const u = new URL(cfg.llmBase); host = u.hostname; port = Number(u.port) || 0; } catch { return; }
    if (!(host === "127.0.0.1" || host === "localhost")) return; // 外部 LLM：用户自己的服务，不代管
    if (!port) return;
    if (!existsSync(join(cfg.babyDir, "nano_baby_gpt.py"))) return; // 没有本地脑脚本：跳过
    if (await pingHealth(port)) return; // 已经有人(可能用户手动)起着且健康：直接用
    const { spawn } = await import("node:child_process");
    const env = { HF_ENDPOINT: "https://hf-mirror.com", ...process.env, PYTHONIOENCODING: "utf-8", KMP_DUPLICATE_LIB_OK: "TRUE" };
    babyBrainProc = spawn(cfg.python, ["nano_baby_gpt.py", "--port", String(port)], { cwd: cfg.babyDir, env });
    babyBrainProc.stderr?.on("data", (d: any) => log("nano_brain", String(d).trim()));
    babyBrainProc.on("exit", () => { babyBrainProc = null; });
    const deadline = Date.now() + 120000; // 首启可能要训练(几分钟)，给足时间
    while (Date.now() < deadline) {
      if (babyBrainProc && await pingHealth(port)) return;
      if (!babyBrainProc) throw new Error(tr("ui.index.message.e8eedb8fcf"));
      await _sleepBaby(700);
    }
    throw new Error(tr("ui.index.message.ef4bcb287f"));
  })();
  babyBrainStarting = p.finally(() => { babyBrainStarting = null; });
  return babyBrainStarting;
}

// 确保常驻服务在跑(懒启动+并发合流)。首次要等模型加载 ~11s。
function ensureBabyServer(): Promise<void> {
  if (babyReady && babyProc && !babyProc.killed) return Promise.resolve();
  if (babyStarting) return babyStarting;
  const p = (async () => {
    const cfg = agiCfg();
    if (!cfg.babyDir) throw new Error(tr("ui.index.message.35e953e7a3"));
    if (!existsSync(join(cfg.babyDir, "baby_server.py"))) throw new Error(tr("ui.index.message.22d1ff3a95"));
    await ensureNanoBrain(cfg); // 先把大脑(本地 nano)拉起来，否则 baby /chat 连不到 LLM
    babyPort = await pickPort();
    const { spawn } = await import("node:child_process");
    const env = { HF_HUB_OFFLINE: "1", HF_ENDPOINT: "https://hf-mirror.com", ...process.env, PYTHONIOENCODING: "utf-8", LLM_BASE: cfg.llmBase, LLM_MODEL: cfg.llmModel };
    babyProc = spawn(cfg.python, ["baby_server.py", "--port", String(babyPort)], { cwd: cfg.babyDir, env });
    babyProc.stderr?.on("data", (d: any) => log("baby_server", String(d).trim()));
    babyProc.on("exit", () => { babyReady = false; babyProc = null; });
    const deadline = Date.now() + 45000; // 给模型加载留足时间
    while (Date.now() < deadline) {
      if (babyProc && await pingHealth(babyPort)) { babyReady = true; return; }
      if (!babyProc) throw new Error(tr("ui.index.message.0f622ff325"));
      await _sleepBaby(500);
    }
    throw new Error(tr("ui.index.message.64d906c705"));
  })();
  babyStarting = p.finally(() => { babyStarting = null; });
  return babyStarting;
}

// 向常驻服务发一个请求。body===undefined 走 GET，否则 POST(JSON)。
function babyHttp(path: string, body: any, timeoutMs: number): Promise<{ ok: boolean; text: string }> {
  return new Promise(async (resolve) => {
    const http = await import("node:http");
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body), "utf-8");
    const req = http.request({
      host: "127.0.0.1", port: babyPort, path, method: body === undefined ? "GET" : "POST",
      timeout: timeoutMs,
      headers: payload ? { "Content-Type": "application/json; charset=utf-8", "Content-Length": String(payload.length) } : {},
    }, (res) => {
      let buf = "";
      res.setEncoding("utf-8");
      res.on("data", (c) => (buf += c));
      res.on("end", () => {
        try { const j = JSON.parse(buf); resolve({ ok: !!j.ok, text: String(j.text ?? "") }); }
        catch { resolve({ ok: false, text: buf || tr("ui.index.message.f4966eeb82") }); }
      });
    });
    req.on("error", (e) => resolve({ ok: false, text: tr("ui.index.message.90f7ccd4a4") + String(e) }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, text: tr("ui.index.message.835ae6d2a1") }); });
    if (payload) req.write(payload);
    req.end();
  });
}

// 停止常驻服务(app 退出时调用)：身体 + 大脑一起停
function stopBabyServer() {
  try { babyProc?.kill(); } catch { /* ignore */ }
  try { babyBrainProc?.kill(); } catch { /* ignore */ }
  babyProc = null; babyReady = false; babyBrainProc = null;
}

// 兼容旧签名：把 (args, stdin) 映射到常驻服务的 HTTP 接口，IPC handler 无需改动。
function runBaby(args: string[], stdin?: string, timeoutMs = 600000): Promise<{ ok: boolean; out: string }> {
  return (async () => {
    const cmd = args[0];
    let path: string; let body: any;
    if (cmd === "status" || cmd === "diary" || cmd === "curious") { path = "/" + cmd; body = undefined; }
    else if (cmd === "praise" || cmd === "scold") { path = "/" + cmd; body = {}; }
    else if (cmd === "live") { path = "/live"; body = { n: parseInt(args[1] || "3", 10) || 3 }; }
    else if (cmd === "seed") { path = "/seed"; body = { concept: args.slice(1).join(" ") }; }
    else if (cmd === "chat") { path = "/chat"; body = { msg: (stdin || "").replace(/\n?退出\n?$/, "").trim() }; }
    else if (cmd === "alivestart") { path = "/alive/start"; body = {}; }
    else if (cmd === "alivestop") { path = "/alive/stop"; body = {}; }
    else if (cmd === "alivestatus") { path = "/alive/status"; body = undefined; }
    else if (cmd === "graph") { path = "/graph"; body = undefined; }
    else if (cmd === "pyramid") { path = "/pyramid"; body = undefined; }
    else if (cmd === "reorganize") { path = "/reorganize"; body = {}; }
    else return { ok: false, out: tr("ui.index.message.8daa3abc8a") + cmd };
    try {
      await ensureBabyServer();
    } catch (e) {
      return { ok: false, out: tr("ui.index.message.52d825148d") + String(e) };
    }
    const r = await babyHttp(path, body, timeoutMs);
    return { ok: r.ok, out: r.text };
  })();
}

ipcMain.handle("agi:cfg", () => agiCfg());
ipcMain.handle("agi:baby:status", async () => (await runBaby(["status"], undefined, 60000)).out);
ipcMain.handle("agi:baby:diary", async () => (await runBaby(["diary"], undefined, 60000)).out);
ipcMain.handle("agi:baby:curious", async () => (await runBaby(["curious"], undefined, 60000)).out);
ipcMain.handle("agi:baby:live", async (_e, n: number) => (await runBaby(["live", String(n || 3)], undefined, 900000)).out);
ipcMain.handle("agi:baby:praise", async () => (await runBaby(["praise"], undefined, 60000)).out);
ipcMain.handle("agi:baby:scold", async () => (await runBaby(["scold"], undefined, 60000)).out);
ipcMain.handle("agi:baby:seed", async (_e, concept: string) => (await runBaby(["seed", String(concept || "")], undefined, 60000)).out);
// 聊天:baby_server /chat 接口
ipcMain.handle("agi:baby:chat", async (_e, msg: string) => {
  const r = await runBaby(["chat"], String(msg || "") + tr("ui.index.message.6b10251273"), 300000);
  const m = r.out.split("👶 >").slice(1).join("👶 >").trim();
  return m || r.out;
});
// 无限生命循环开关 + 状态
ipcMain.handle("agi:baby:alivestart", async () => (await runBaby(["alivestart"], undefined, 30000)).out);
ipcMain.handle("agi:baby:alivestop", async () => (await runBaby(["alivestop"], undefined, 30000)).out);
ipcMain.handle("agi:baby:alivestatus", async () => (await runBaby(["alivestatus"], undefined, 30000)).out);
ipcMain.handle("agi:baby:graph", async () => (await runBaby(["graph"], undefined, 30000)).out);
// 知识金字塔：分层结构(读) + 主动整理一次(重建，要跑聚类+每层起名，给足超时)
ipcMain.handle("agi:baby:pyramid", async () => (await runBaby(["pyramid"], undefined, 60000)).out);
ipcMain.handle("agi:baby:reorganize", async () => (await runBaby(["reorganize"], undefined, 900000)).out);
