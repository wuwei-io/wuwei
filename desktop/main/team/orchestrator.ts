import { employeeMentionTargets, employeeLabel, employeeRoster } from "../../../src/team/default-localization.js";
// AI 员工团队 · 群编排器
//
// 职责只有两件：决定「谁该说话」，以及「他能看到什么」（后者委托给 projection.ts）。
// 真正把 Agent 跑起来的能力由主进程通过 deps.runEmployee 注入——provider 的构造、
// 工具集、凭证刷新那套逻辑都在主进程，这里不重复实现，也不 import 内核的 Agent。

import type { Employee, Room, RoomMessage, MsgStep } from "../../../src/team/types.js";
import type { Message, TaskReportScope, ToolContext, Provider } from "../../../src/types.js";
import { pickResponders, projectFor } from "./projection.js";
import { appendMessage, loadRoomMessages, loadRooms } from "./room.js";
import { loadEmployees, buildEmployeeSystem, loadEmployeeMemory, loadTeamConfig } from "./store.js";

export type RunEmployeeArgs = {
  remoteExecution?: ToolContext['remoteExecution'];
  requestDecision?: ToolContext['requestDecision'];
  onPermission?: (name: string, input: unknown) => Promise<'allow' | 'deny'>;
  images?: string[];
  providerOverride?: Provider;
  providerBinding?: { providerId: string; model: string };
  reportOrigin?: TaskReportScope['origin'];
  taskReportScope?: TaskReportScope;
  employee: Employee;
  /** 基础系统提示词 + 员工人格，已拼好 */
  sys: string;
  /** 投影后的历史（不含最后一条 user，那条走 input） */
  history: Message[];
  input: string;
  signal: AbortSignal;
  /** 实时进度回调（思考/工具活动），主进程据此转发给界面显示，不落消息流 */
  onProgress?: (ev: ProgressEv) => void;
  /**
   * 本轮要额外剔除的工具名。用于私聊防递归：转派链到达上限那一轮传 ["dm_teammate"]，
   * 让响应方不能再发起私信，否则会无限套娃。
   */
  excludeTools?: string[];
  /** 私信转派深度：透传给工具上下文，dm_teammate 据此再+1 限制链长。缺省 0=最外层。 */
  dmDepth?: number;
};

/** 员工干活时的实时进度（思考/工具）。只用来给界面显示，绝不进群消息流。 */
export type ProgressEv =
  | { kind: "text"; delta: string }
  | { kind: "tool-start"; id: string; name: string; input?: unknown }
  | { kind: "tool-end"; id: string; isError: boolean; result?: string }
  | { kind: "image"; dataUrl: string };

export type OrchestratorDeps = {
  send: (channel: string, payload?: unknown) => void;
  log: (tag: string, ...args: unknown[]) => void;
  /** 跑一名员工一轮，返回他的最终发言文本 */
  runEmployee: (args: RunEmployeeArgs) => Promise<string>;
  /** 基础系统提示词（工作目录/工具用法/安全红线等运行必需信息） */
  baseSys: () => string;
};

/** 正在跑的群轮次，用于「停止」 */
const running = new Map<string, AbortController>();
const roomWaiters = new Map<string, Array<() => void>>();
function releaseRoom(roomId: string, controller?: AbortController) {
  if (controller && running.get(roomId) !== controller) return;
  running.delete(roomId);
  const waiting = roomWaiters.get(roomId);
  roomWaiters.delete(roomId);
  waiting?.forEach(resolve => resolve());
}

/**
 * 同一房间/私聊的「人类发言」串行队列：忙时排到队尾、当前轮跑完自动接上，
 * 而不是像旧代码 `running.has(key) → return` 那样把第二条消息直接吞掉——
 * 那正是「同一员工第二次唤醒没反应」的根因(第二条被并发锁挡下、根本没跑、也没任何反馈)。
 */
type QueuedTurn = (() => Promise<void>) & { cancel: () => void };
const turnQueue = new Map<string, QueuedTurn[]>();

/**
 * 把一轮执行排进 key 的串行队列。
 * @returns true=当前已有轮次在跑、这条被排队；false=队列空、立即开跑。
 */
function enqueueTurn(key: string, task: () => Promise<void>): { queued: boolean; completion: Promise<void> } {
  let complete!: () => void;
  let fail!: (error: unknown) => void;
  const completion = new Promise<void>((resolve, reject) => { complete = resolve; fail = reject; });
  const execute = Object.assign(async () => { try { await task(); complete(); } catch (error) { fail(error); } },
    { cancel: () => fail(new Error('排队任务已停止')) });
  const existing = turnQueue.get(key);
  if (existing) { existing.push(execute); return { queued: true, completion }; } // 忙：排队尾
  const q: QueuedTurn[] = [];
  turnQueue.set(key, q);
  void (async () => {
    try {
      await execute();
      // 依次消费排队期间新进来的轮次；每轮都能看到前一轮已落库的结果(snapshot 在各 task 内部现取)
      while (q.length) { const next = q.shift(); if (next) await next(); }
    } finally {
      turnQueue.delete(key);
    }
  })();
  return { queued: false, completion };
}

/** 该房间/私聊是否有轮次在跑或排队中——底栏运行灯据此稳定亮起，别在两轮之间闪灭。 */
function busy(key: string): boolean {
  return running.has(key) || (turnQueue.get(key)?.length ?? 0) > 0;
}

/**
 * 「员工级」任务队列：一名员工手上的所有活（来自不同私聊、人类直聊、或别人 assign_task 派来的）
 * 都串到他自己这一条队列里**串行**跑——同一个员工不会同时开两轮（他分身乏术，也会串台）。
 * 这是「一个员工可以交代好几件事」的底座：
 *   · 忙时不拒收，新活排队，当前这件干完自动接下一件（不像旧 runDmTurn 那样「对方在忙」直接回绝）。
 *   · 急事(urgent)插到队列**最前**，但**不打断**正在跑的那件——当前干完立刻接急事，再回头干其余。
 * key=员工 id（不是私聊 id），这样同一员工跨多个私聊的活也会排到同一条队列、不并发。
 */
type EmpTask = { run: () => Promise<void>; urgent: boolean };
const empBusy = new Set<string>(); // 正在跑任务的员工
const empQueue = new Map<string, EmpTask[]>(); // 员工 id → 待处理任务（不含正在跑的那件）

/** 某员工当前排队中（不含正在跑）的任务数。assign_task 用它告诉派活方「前面还有几件」。 */
export function empQueueLen(empId: string): number {
  return empQueue.get(empId)?.length ?? 0;
}
/** 某员工此刻是否正在干活（跑或有排队）。 */
export function empIsBusy(empId: string): boolean {
  return empBusy.has(empId) || empQueueLen(empId) > 0;
}

/**
 * 把一件活排进某员工的串行队列。返回的 Promise 在**这件活自己**跑完时 resolve——
 * 同步 dm_teammate 靠它「排队等到轮到并跑完」拿回复；异步 assign_task 直接不 await（派完就走）。
 * @param urgent true=插到队列最前（但不打断正在跑的那件）。
 */
export function enqueueEmpTask(empId: string, task: () => Promise<void>, opts?: { urgent?: boolean; signal?: AbortSignal }): Promise<void> {
  const urgent = !!opts?.urgent;
  return new Promise<void>((resolve, reject) => {
    const signal = opts?.signal;
    if (signal?.aborted) { reject(new DOMException('排队任务已停止', 'AbortError')); return; }
    const cancelQueued = () => {
      const q = empQueue.get(empId);
      const index = q?.indexOf(item) ?? -1;
      if (index >= 0) { q!.splice(index, 1); reject(new DOMException('排队任务已停止', 'AbortError')); }
      signal?.removeEventListener('abort', cancelQueued);
    };
    const item: EmpTask = { run: async () => {
      signal?.removeEventListener('abort', cancelQueued);
      try { signal?.throwIfAborted(); await task(); resolve(); } catch (e) { reject(e); }
    }, urgent };
    if (empBusy.has(empId)) {
      // 他正忙：排队。急事插最前（排在其它待办之前），普通排队尾。都不动正在跑的那件。
      const q = empQueue.get(empId) || (empQueue.set(empId, []), empQueue.get(empId)!);
      if (urgent) q.unshift(item); else q.push(item);
      signal?.addEventListener('abort', cancelQueued, { once: true });
      return;
    }
    // 空闲：立刻开跑，跑完依次消费排队期间进来的活（每次现取 shift，好让急事插队即时生效）。
    empBusy.add(empId);
    if (!empQueue.has(empId)) empQueue.set(empId, []);
    void (async () => {
      try {
        await item.run();
        const q = empQueue.get(empId)!;
        while (q.length) { const next = q.shift(); if (next) await next.run(); }
      } finally {
        empBusy.delete(empId);
        empQueue.delete(empId);
      }
    })();
  });
}

/** 员工被唤醒后先落的「收到」应答文案。跑完才落正式回复(带 steps)。 */
const ACK_TEXT = "收到，正在处理…";

/**
 * dm_teammate 转派链最大深度(responder 深度 ≥ 此值时剔除 dm_teammate、不能再往下转)。
 * = 一人公司设置里的「最多层数」- 1（层数=链上员工数，如 3 层 → 深度上限 2：小笨0→小码1→小美2 到顶）。
 * 读配置，缺省 3 层；下限 1 层(=不允许转派)。防无限套娃。
 */
function maxDmDepth(): number {
  const levels = Math.max(1, Math.floor(loadTeamConfig().maxDmLevels ?? 3));
  return levels - 1;
}

// 员工干活的实时进度「真相源」——放在主进程(干活本就在这层跑)，不寄生在界面。
// 界面只订阅 evt:team-room-progress 增量；切走再回来时先 getRoomProgress 拉一次全量补齐，
// 否则切走期间广播的进度没界面接收就丢了(广播不留存)，回来只会从零重新统计。
export type LiveTool = { id?: string; name: string; input?: unknown; done: boolean; isError?: boolean; result?: string };
export type LiveEmp = { empId: string; name: string; text: string; tools: LiveTool[] };
const roomProgress = new Map<string, Map<string, LiveEmp>>(); // roomId → empId → 该员工本轮进度

/** 把一条进度事件并入房间进度真相源(与界面 RoomView 的累加逻辑镜像)。kind:"done"→清该员工。 */
function applyProg(roomId: string, empId: string, empName: string, ev: ProgressEv | { kind: "done" }) {
  let m = roomProgress.get(roomId);
  if (!m) { m = new Map(); roomProgress.set(roomId, m); }
  if (ev.kind === "done") { m.delete(empId); return; }
  let cur = m.get(empId);
  if (!cur) { cur = { empId, name: empName, text: "", tools: [] }; m.set(empId, cur); }
  cur.name = empName || cur.name;
  if (ev.kind === "text") cur.text = cur.text + (ev.delta || ""); // 存完整思考流——落库回看不裁顶部(实时进度块靠 CSS max-height 滚动显示，不怕长)
  else if (ev.kind === "tool-start") cur.tools.push({ id: ev.id, name: ev.name, input: ev.input, done: false });
  else if (ev.kind === "tool-end") { for (let i = cur.tools.length - 1; i >= 0; i--) if (!cur.tools[i].done) { cur.tools[i].done = true; cur.tools[i].isError = ev.isError; cur.tools[i].result = ev.result; break; } }
}
/** 界面切进某房间时拉当前全量进度(补齐切走期间错过的增量)。 */
export function getRoomProgress(roomId: string): LiveEmp[] {
  return Array.from(roomProgress.get(roomId)?.values() || []);
}
/** 落库前取某员工本轮执行明细(工具序列+思考)，附到回复消息永久留存、可回看。 */
function snapshotEmp(roomId: string, empId: string): { steps: MsgStep[]; thought: string } {
  const e = roomProgress.get(roomId)?.get(empId);
  if (!e) return { steps: [], thought: "" };
  return {
    steps: e.tools.map((t) => ({ name: t.name, input: t.input, result: t.result, isError: t.isError })),
    thought: e.text || "",
  };
}
function clearRoomProgress(roomId: string) { roomProgress.delete(roomId); }

export function abortRoom(roomId: string) {
  running.get(roomId)?.abort();
}

/**
 * 强制停止：abort 信号 + 立刻把运行态从表里删掉。
 * 用于 provider 卡在 401 重试/长 backoff、abort 信号一时没被检查到时——
 * 点「停止」要能立即解锁界面、放行下一条消息，不等那个挂起的请求自己结束。
 * 挂起的那轮最终 resolve/reject 时，其 finally 再 delete 一次无害，且落库被 aborted 守卫拦掉。
 */
export function forceStopRoom(roomId: string) {
  running.get(roomId)?.abort();
  releaseRoom(roomId);
  const q = turnQueue.get(roomId);
  if (q) { q.forEach(turn => turn.cancel()); q.length = 0; }
}

export function isRoomRunning(roomId: string): boolean {
  return busy(roomId);
}

function pushAndBroadcast(
  deps: OrchestratorDeps,
  roomId: string,
  msg: Omit<RoomMessage, "id" | "ts">,
): RoomMessage[] {
  const msgs = appendMessage(roomId, msg);
  deps.send("evt:team-room", { roomId, messages: msgs, running: busy(roomId) });
  return msgs;
}

/**
 * 人类在群里说了一句话，跑完这一轮。
 *
 * 并发策略：被唤醒的多名员工**并行**跑，各自看到的历史是「人类这句话之前 + 这句话」，
 * 互相看不到对方本轮的回复。这是刻意的——串行会让后发言的人被先发言的带偏，
 * 而且慢得多。要让他们互相接话，用户再发一句（或 @ 对方）即可，下一轮就能看到。
 */
export async function runRoomTurn(roomId: string, userText: string, deps: OrchestratorDeps, options: { images?: string[]; mentions?: string[] } = {}): Promise<void> {
  const room = loadRooms().find((r) => r.id === roomId);
  if (!room) return;
  const text = (userText || "").trim();
  if (!text && !options.images?.length) return;

  const all = loadEmployees();
  const members = room.members
    .map((id) => all.find((e) => e.id === id))
    .filter((e): e is Employee => !!e);

  // 1. 人类这句话先落盘并广播（不管忙不忙、有没有人被唤醒，都立刻显示 + 留在上下文里）
  const responders = options.mentions?.length
    ? (options.mentions.includes('*') ? members.map(m => m.id) : [...new Set(options.mentions)].filter(id => members.some(m => m.id === id))).slice(0, room.maxWake ?? 3)
    : pickResponders(
    text,
    employeeMentionTargets(members),
    room.coordinator,
    room.maxWake ?? 3,
  );
  pushAndBroadcast(deps, roomId, {
    speaker: { id: "me", name: "我", kind: "human" },
    text,
    mentions: responders,
    images: options.images,
  });

  if (!responders.length) {
    // 没 @ 人也没设协调者：只记录不唤醒，这是最大的省钱开关，但要让用户知道为什么没人应答
    deps.send("evt:team-room-hint", {
      roomId,
      code: "no-responders", // 前端据此渲染双语文案(英文界面也能看懂「为什么没人应答」)
      hint: "没有人被点名。@某位员工，或在群设置里指定一名常驻协调者。",
    });
    return;
  }

  // 2. 执行轮走串行队列：当前轮在跑就排队、跑完自动接上(而非丢弃这条)。
  const snapshot = loadRoomMessages(roomId);
  const queued = enqueueTurn(roomId, () => runRoomResponders(roomId, room, members, responders, deps, snapshot));
  if (queued.queued) {
    deps.send("evt:team-room-hint", { roomId, code: "queued", hint: "正在处理上一条，这条已排队，稍后自动接上。" });
  }
  await queued.completion;
}

/** 跑一轮群响应：唤醒 responders 里的每名员工(先各回一条「收到」，再并行干活、落正式回复)。 */
async function runRoomResponders(
  roomId: string,
  room: Room,
  members: Employee[],
  responders: string[],
  deps: OrchestratorDeps,
  inputSnapshot: RoomMessage[],
): Promise<void> {
  const ac = new AbortController();
  running.set(roomId, ac);
  deps.send("evt:team-room", { roomId, messages: loadRoomMessages(roomId), running: true });

  try {
    const base = deps.baseSys();
    // 每名被唤醒的员工先回一条「收到」应答，让用户即时看到「有人接了」，进度块随后挂上。
    for (const empId of responders) {
      const emp = members.find((m) => m.id === empId);
      if (emp) pushAndBroadcast(deps, roomId, { speaker: { id: emp.id, name: emp.name, kind: "agent" }, text: ACK_TEXT, ack: true });
    }
    // 快照：本轮所有员工都基于「到此为止(含刚落的收到)」的历史，互不影响。收到消息投影时会被跳过。
    const snapshot = inputSnapshot;

    await Promise.all(
      responders.map(async (empId) => {
        const emp = members.find((m) => m.id === empId);
        if (!emp) return;
        const proj = projectFor(empId, snapshot);
        if (!proj.length) return;
        const lastMsg = proj[proj.length - 1];
        const input = lastMsg.content
          .map((b: any) => (b?.type === "text" ? b.text : ""))
          .join("")
          .trim();
        const history = proj.slice(0, -1);
        // 与私聊同款：员工身份在前、无为降为运行环境；群场景作为身份后的一段附加说明。
        const scene = `## 当前场景\n\n你在群聊「${room.name}」里，成员有：${members
          .map((m) => m.name)
          .join("、")}。别人的发言会以「姓名」开头标出。只说你自己该说的部分，不要替别人回答，也不要复述已有内容。`;
        const sys = buildEmployeeSystem(emp, base, loadEmployeeMemory(emp.id), scene);

        try {
          const turnImages: string[] = []; // 本轮 send_image 发的图，附到该员工的最终消息
          const out = await deps.runEmployee({
            reportOrigin: { kind: 'room', id: roomId },
            employee: emp,
            sys,
            history,
            input,
            signal: ac.signal,
            // 进度只广播、不落库：界面据此显示"谁正在想什么、调了什么工具"，可展开/收起，跑完即清。
            onProgress: (ev) => { if (ev.kind === "image") { turnImages.push(ev.dataUrl); return; } applyProg(roomId, emp.id, emp.name, ev); deps.send("evt:team-room-progress", { roomId, empId: emp.id, empName: emp.name, ...ev }); },
          });
          if (ac.signal.aborted) return;
          const snap = snapshotEmp(roomId, emp.id); // 落库前取本轮执行明细(applyProg done 会清空真相源)
          applyProg(roomId, emp.id, emp.name, { kind: "done" });
          deps.send("evt:team-room-progress", { roomId, empId: emp.id, done: true }); // 该员工干完，界面清掉他的进度块
          pushAndBroadcast(deps, roomId, {
            speaker: { id: emp.id, name: emp.name, kind: "agent" },
            text: (out || "").trim() || (turnImages.length ? "" : "（没有输出）"),
            steps: snap.steps.length ? snap.steps : undefined, // 执行明细随消息落库，永久可展开回看
            thought: snap.thought || undefined,
            images: turnImages.length ? turnImages : undefined,
          });
        } catch (e: any) {
          if (ac.signal.aborted) return;
          deps.log("team", "群成员出错", emp.name, String(e?.message || e).slice(0, 200));
          pushAndBroadcast(deps, roomId, {
            speaker: { id: emp.id, name: emp.name, kind: "agent" },
            text: `出错了：${String(e?.message || e).slice(0, 300)}`,
            error: true,
          });
        }
      }),
    );
  } finally {
    releaseRoom(roomId, ac);
    // 兜底清掉本轮所有员工的进度块——正常收尾各员工已各自发过 done(幂等，清不存在的 key 无害)，
    // 但被 abort / 异常中途退出时 done 不会发，不清就会残留一个「正在干活…」永远转、看着像卡死。
    for (const empId of responders) deps.send("evt:team-room-progress", { roomId, empId, done: true });
    clearRoomProgress(roomId); // 本轮结束，清进度真相源
    deps.send("evt:team-room", { roomId, messages: loadRoomMessages(roomId), running: busy(roomId) }); // 还有排队轮则灯不灭
  }
}

/**
 * 私聊一轮：员工 A 给员工 B 发了 incomingText（A 的消息已由调用方 appendMessage 落进 dm），
 * 让 B（responderId）读投影后的历史、回一句、落库并广播，返回 B 的回复文本给 A。
 *
 * 与群不同处：
 *   · 免 @ 自动唤醒——私聊只有两人，收信方即唯一响应者，不走 pickResponders。
 *   · 防无限递归——用 depth 限制转派链长：depth ≥ MAX_DM_DEPTH 时才把 dm_teammate 从工具集剔除，
 *     让转派链最多 MAX_DM_DEPTH+1 名员工(如 小笨→小码→小美)，到顶不能再往下转，天然不会死循环。
 *   · 复用 running:Map 防同一个 dm 并发跑两轮（与群同锁）。
 *
 * @param depth 本轮响应方在转派链上的深度：人类/群直接唤醒=0，每被 dm_teammate 转派一层+1。
 */
export async function runDmTurn(
  dmId: string,
  responderId: string,
  incomingText: string,
  deps: OrchestratorDeps,
  depth = 0,
  options: { strict?: boolean; explicitInput?: boolean; taskReportScope?: TaskReportScope; signal?: AbortSignal } = {},
): Promise<string> {
  // Asynchronous assignments/report delivery can wait for the room; synchronous dm_teammate
  // retains its busy guard so A↔B synchronous calls cannot deadlock.
  while (options.strict && running.has(dmId)) {
    options.signal?.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const waiting = roomWaiters.get(dmId) ?? [];
      const done = () => { options.signal?.removeEventListener('abort', abort); resolve(); };
      const abort = () => {
        const index = waiting.indexOf(done); if (index >= 0) waiting.splice(index, 1);
        reject(new DOMException('任务已取消', 'AbortError'));
      };
      waiting.push(done); roomWaiters.set(dmId, waiting);
      options.signal?.addEventListener('abort', abort, { once: true });
    });
  }
  options.signal?.throwIfAborted();
  if (running.has(dmId)) {
    // 同一私聊正在跑上一轮：不并发，直接告诉发起方对方在忙，避免消息流错位
    return "（对方正在处理上一条消息，稍后再试。）";
  }
  const room = loadRooms().find((r) => r.id === dmId);
  if (!room) { if (options.strict) throw new Error('任务私聊已不存在。'); return ""; }
  const emp = loadEmployees().find((e) => e.id === responderId);
  if (!emp) { if (options.strict) throw new Error('任务员工已不存在。'); return ""; }

  // 私聊里「另一位」= 发起方，用于场景提示词里点名「你在和 X 私聊」
  const otherId = (room.members || []).find((id) => id !== responderId);
  const other = otherId ? loadEmployees().find((e) => e.id === otherId) : null;
  const otherName = other?.name || otherId || "对方";

  const ac = new AbortController();
  const abortOwned = () => ac.abort();
  options.signal?.addEventListener('abort', abortOwned, { once: true });
  running.set(dmId, ac);
  deps.send("evt:team-room", { roomId: dmId, messages: loadRoomMessages(dmId), running: true });

  // 先回一条「收到」，用户即时看到对方接了活；投影会跳过它，不喂回模型。
  pushAndBroadcast(deps, dmId, { speaker: { id: emp.id, name: emp.name, kind: "agent" }, text: ACK_TEXT, ack: true });

  try {
    const base = deps.baseSys();
    const proj = projectFor(responderId, loadRoomMessages(dmId));
    if (!proj.length && !options.explicitInput) return "";
    // 投影最后一条恒为 user（收信方视角别人的话），取它当本轮 input，其余当历史
    const lastMsg = proj[proj.length - 1];
    const input = options.explicitInput ? incomingText :
      lastMsg.content
        .map((b: any) => (b?.type === "text" ? b.text : ""))
        .join("")
        .trim() || incomingText;
    const history = options.explicitInput ? proj : proj.slice(0, -1);

    // 转派工具是否本轮真的被剔除（只有转派链到顶才剔）。之前无条件写「dm_teammate 不可用」是 bug：
    // 人类直接私聊(depth=0)时 dm_teammate/assign_task 其实可用，那句话误导员工谎称联系不了同事。
    const transfersExcluded = depth >= maxDmDepth();
    const toolNote = transfersExcluded
      ? `本轮已到转派链上限，dm_teammate / assign_task 暂不可用是正常设计，别向对方提「某工具不可用」，直接把事做了或直说结果即可。`
      : `需要找别的同事对齐或派活时：用 dm_teammate 同步问一句、assign_task 异步把活交出去——别说自己联系不上同事。`;
    const sceneIntro = room.type === 'dm'
      ? `你在和「${otherName}」的一对一私聊里。对方刚给你发了消息，请直接回复对方。`
      : `你在群聊「${room.name}」里，请响应当前输入并向群里的用户汇报。`;
    const scene = `## 当前场景\n\n${sceneIntro}只说你自己要说的，别替对方回答，也别复述已有内容。${toolNote}`;
    const sys = buildEmployeeSystem(emp, base, loadEmployeeMemory(emp.id), scene);

    const turnImages: string[] = []; // 本轮 send_image 发的图，附到最终消息里显示
    const out = await deps.runEmployee({
      reportOrigin: { kind: 'room', id: dmId }, taskReportScope: options.taskReportScope,
      employee: emp,
      sys,
      history,
      input,
      signal: ac.signal,
      // 转派链到顶才剔除 dm_teammate / assign_task；未到顶允许本轮继续往下转派(小笨→小码→小美)。上限读一人公司设置。
      excludeTools: depth >= maxDmDepth() ? ["dm_teammate", "assign_task"] : [],
      dmDepth: depth, // 透传深度：本轮员工若再调 dm_teammate，工具据此 +1
      onProgress: (ev) => { if (ev.kind === "image") { turnImages.push(ev.dataUrl); return; } applyProg(dmId, emp.id, emp.name, ev); deps.send("evt:team-room-progress", { roomId: dmId, empId: emp.id, empName: emp.name, ...ev }); },
    });
    if (ac.signal.aborted) { if (options.strict) throw new DOMException('任务已取消。', 'AbortError'); return ""; }
    const snap = snapshotEmp(dmId, emp.id); // 落库前取执行明细
    applyProg(dmId, emp.id, emp.name, { kind: "done" });
    deps.send("evt:team-room-progress", { roomId: dmId, empId: emp.id, done: true });
    const text = (out || "").trim() || (turnImages.length ? "" : "（没有输出）");
    pushAndBroadcast(deps, dmId, { speaker: { id: emp.id, name: emp.name, kind: "agent" }, text, steps: snap.steps.length ? snap.steps : undefined, thought: snap.thought || undefined, images: turnImages.length ? turnImages : undefined });
    return text || (turnImages.length ? `已交付${turnImages.length}张图片，见员工私聊中的产物。` : '');
  } catch (e: any) {
    if (ac.signal.aborted) { if (options.strict) throw new DOMException('任务已取消。', 'AbortError'); return ""; }
    deps.log("team", "私聊出错", emp.name, String(e?.message || e).slice(0, 200));
    const errText = `出错了：${String(e?.message || e).slice(0, 300)}`;
    pushAndBroadcast(deps, dmId, { speaker: { id: emp.id, name: emp.name, kind: "agent" }, text: errText, error: true });
    if (options.strict) throw e;
    return errText;
  } finally {
    options.signal?.removeEventListener('abort', abortOwned);
    if (running.get(dmId) === ac) {
      releaseRoom(dmId, ac);
      deps.send("evt:team-room-progress", { roomId: dmId, empId: responderId, done: true }); // abort/异常兜底清进度块
      clearRoomProgress(dmId); // 本轮结束，清进度真相源
      deps.send("evt:team-room", { roomId: dmId, messages: loadRoomMessages(dmId), running: busy(dmId) }); // 还有排队轮则灯不灭
    }
  }
}

/**
 * 人类在私聊界面里发言（从 dmSelfId 视角看这条 dm，responderId=界面里显示的「对方」）：
 * 把人类这句话落库并广播（speaker 记成人类，投影时对响应方 = user 输入），再唤醒对方回一句。
 *
 * 与群不同：私聊固定唤醒「另一名成员」，不走 pickResponders（无需 @、无需协调者）。
 * 与 dm_teammate（员工↔员工）不同：那条是员工主动发起、A 的消息由工具侧先落库；
 * 这条是人类↔员工，人类消息由本函数落库。两条路径都最终复用 runDmTurn 跑响应方
 * （投影/防递归 excludeTools/停止锁全在里面），互不影响。
 */
export async function runDmHumanTurn(
  dmId: string,
  responderId: string,
  humanText: string,
  deps: OrchestratorDeps,
): Promise<void> {
  const room = loadRooms().find((r) => r.id === dmId);
  if (!room) return;
  const text = (humanText || "").trim();
  if (!text) return;

  // 1. 人类这句话先落库并广播——speaker.kind="human" 让界面靠右显示，
  //    投影层 projectFor 里 id≠responderId 会当作对方发来的 user 输入喂给响应员工。
  //    不管忙不忙都立刻落，用户即时看到自己发的话(旧代码在此之前就 running.has→return 把整条吞了)。
  pushAndBroadcast(deps, dmId, { speaker: { id: "me", name: "我", kind: "human" }, text });

  // 2. 唤醒「对方」回一句走【员工级】串行队列：他手上别的活没干完就排队、干完自动接上，不丢这条。
  //    用员工 id 作 key（而非私聊 id），这样他在别处（别人派的活/别的私聊）忙着时，这条也会乖乖排队，
  //    不会让同一个员工同时开两轮串台。复用 runDmTurn，投影把人类这句当 input、防递归照旧。
  const wasBusy = empIsBusy(responderId);
  if (wasBusy) {
    deps.send("evt:team-room-hint", { roomId: dmId, code: "queued", hint: "对方正忙于手头的活，这条已排队，轮到就处理。" });
  }
  void enqueueEmpTask(responderId, () => runDmTurn(dmId, responderId, text, deps).then(() => undefined)).catch(() => {});
}
