// AI 员工团队 · 群编排器
//
// 职责只有两件：决定「谁该说话」，以及「他能看到什么」（后者委托给 projection.ts）。
// 真正把 Agent 跑起来的能力由主进程通过 deps.runEmployee 注入——provider 的构造、
// 工具集、凭证刷新那套逻辑都在主进程，这里不重复实现，也不 import 内核的 Agent。

import type { Employee, Room, RoomMessage } from "../../../src/team/types.js";
import type { Message } from "../../../src/types.js";
import { pickResponders, projectFor } from "./projection.js";
import { appendMessage, loadRoomMessages, loadRooms } from "./room.js";
import { loadEmployees, buildEmployeeSystem, loadEmployeeMemory } from "./store.js";

export type RunEmployeeArgs = {
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
   * 本轮要额外剔除的工具名。用于私聊防递归：跑「收信方」这一轮时传 ["dm_teammate"]，
   * 让响应方不能在响应里再发起私信，否则两名员工会互相 dm_teammate 无限套娃。
   */
  excludeTools?: string[];
};

/** 员工干活时的实时进度（思考/工具）。只用来给界面显示，绝不进群消息流。 */
export type ProgressEv =
  | { kind: "text"; delta: string }
  | { kind: "tool-start"; id: string; name: string }
  | { kind: "tool-end"; id: string; isError: boolean };

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
  running.delete(roomId);
}

export function isRoomRunning(roomId: string): boolean {
  return running.has(roomId);
}

function pushAndBroadcast(
  deps: OrchestratorDeps,
  roomId: string,
  msg: Omit<RoomMessage, "id" | "ts">,
): RoomMessage[] {
  const msgs = appendMessage(roomId, msg);
  deps.send("evt:team-room", { roomId, messages: msgs, running: running.has(roomId) });
  return msgs;
}

/**
 * 人类在群里说了一句话，跑完这一轮。
 *
 * 并发策略：被唤醒的多名员工**并行**跑，各自看到的历史是「人类这句话之前 + 这句话」，
 * 互相看不到对方本轮的回复。这是刻意的——串行会让后发言的人被先发言的带偏，
 * 而且慢得多。要让他们互相接话，用户再发一句（或 @ 对方）即可，下一轮就能看到。
 */
export async function runRoomTurn(roomId: string, userText: string, deps: OrchestratorDeps): Promise<void> {
  const room = loadRooms().find((r) => r.id === roomId);
  if (!room) return;
  const text = (userText || "").trim();
  if (!text) return;
  if (running.has(roomId)) return; // 同一群不并发跑两轮

  const all = loadEmployees();
  const members = room.members
    .map((id) => all.find((e) => e.id === id))
    .filter((e): e is Employee => !!e);

  // 1. 人类这句话先落盘并广播（不管有没有人被唤醒，都得留在上下文里）
  const responders = pickResponders(
    text,
    members.map((m) => ({ id: m.id, name: m.name })),
    room.coordinator,
    room.maxWake ?? 3,
  );
  pushAndBroadcast(deps, roomId, {
    speaker: { id: "me", name: "我", kind: "human" },
    text,
    mentions: responders,
  });

  if (!responders.length) {
    // 没 @ 人也没设协调者：只记录不唤醒，这是最大的省钱开关，但要让用户知道为什么没人应答
    deps.send("evt:team-room-hint", {
      roomId,
      hint: "没有人被点名。@某位员工，或在群设置里指定一名常驻协调者。",
    });
    return;
  }

  const ac = new AbortController();
  running.set(roomId, ac);
  deps.send("evt:team-room", { roomId, messages: loadRoomMessages(roomId), running: true });

  try {
    const base = deps.baseSys();
    // 快照：本轮所有员工都基于「人类这句话为止」的历史，互不影响
    const snapshot = loadRoomMessages(roomId);

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
          const out = await deps.runEmployee({
            employee: emp,
            sys,
            history,
            input,
            signal: ac.signal,
            // 进度只广播、不落库：界面据此显示"谁正在想什么、调了什么工具"，可展开/收起，跑完即清。
            onProgress: (ev) => deps.send("evt:team-room-progress", { roomId, empId: emp.id, empName: emp.name, ...ev }),
          });
          if (ac.signal.aborted) return;
          deps.send("evt:team-room-progress", { roomId, empId: emp.id, done: true }); // 该员工干完，界面清掉他的进度块
          pushAndBroadcast(deps, roomId, {
            speaker: { id: emp.id, name: emp.name, kind: "agent" },
            text: (out || "").trim() || "（没有输出）",
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
    running.delete(roomId);
    deps.send("evt:team-room", { roomId, messages: loadRoomMessages(roomId), running: false });
  }
}

/**
 * 私聊一轮：员工 A 给员工 B 发了 incomingText（A 的消息已由调用方 appendMessage 落进 dm），
 * 让 B（responderId）读投影后的历史、回一句、落库并广播，返回 B 的回复文本给 A。
 *
 * 与群不同处：
 *   · 免 @ 自动唤醒——私聊只有两人，收信方即唯一响应者，不走 pickResponders。
 *   · 防无限递归——响应轮把 dm_teammate 从工具集剔除（excludeTools），B 不能在回信里再发起私信。
 *   · 复用 running:Map 防同一个 dm 并发跑两轮（与群同锁）。
 */
export async function runDmTurn(
  dmId: string,
  responderId: string,
  incomingText: string,
  deps: OrchestratorDeps,
): Promise<string> {
  if (running.has(dmId)) {
    // 同一私聊正在跑上一轮：不并发，直接告诉发起方对方在忙，避免消息流错位
    return "（对方正在处理上一条消息，稍后再试。）";
  }
  const room = loadRooms().find((r) => r.id === dmId);
  if (!room) return "";
  const emp = loadEmployees().find((e) => e.id === responderId);
  if (!emp) return "";

  // 私聊里「另一位」= 发起方，用于场景提示词里点名「你在和 X 私聊」
  const otherId = (room.members || []).find((id) => id !== responderId);
  const other = otherId ? loadEmployees().find((e) => e.id === otherId) : null;
  const otherName = other?.name || otherId || "对方";

  const ac = new AbortController();
  running.set(dmId, ac);
  deps.send("evt:team-room", { roomId: dmId, messages: loadRoomMessages(dmId), running: true });

  try {
    const base = deps.baseSys();
    const proj = projectFor(responderId, loadRoomMessages(dmId));
    if (!proj.length) return "";
    // 投影最后一条恒为 user（收信方视角别人的话），取它当本轮 input，其余当历史
    const lastMsg = proj[proj.length - 1];
    const input =
      lastMsg.content
        .map((b: any) => (b?.type === "text" ? b.text : ""))
        .join("")
        .trim() || incomingText;
    const history = proj.slice(0, -1);

    const scene = `## 当前场景\n\n你在和「${otherName}」的一对一私聊里。对方刚给你发了消息，请直接回复对方。只说你自己要说的，别替对方回答，也别复述已有内容。`;
    const sys = buildEmployeeSystem(emp, base, loadEmployeeMemory(emp.id), scene);

    const out = await deps.runEmployee({
      employee: emp,
      sys,
      history,
      input,
      signal: ac.signal,
      excludeTools: ["dm_teammate"], // 防递归：响应方这轮不能再发起私信
      onProgress: (ev) =>
        deps.send("evt:team-room-progress", { roomId: dmId, empId: emp.id, empName: emp.name, ...ev }),
    });
    if (ac.signal.aborted) return "";
    deps.send("evt:team-room-progress", { roomId: dmId, empId: emp.id, done: true });
    const text = (out || "").trim() || "（没有输出）";
    pushAndBroadcast(deps, dmId, { speaker: { id: emp.id, name: emp.name, kind: "agent" }, text });
    return text;
  } catch (e: any) {
    if (ac.signal.aborted) return "";
    deps.log("team", "私聊出错", emp.name, String(e?.message || e).slice(0, 200));
    const errText = `出错了：${String(e?.message || e).slice(0, 300)}`;
    pushAndBroadcast(deps, dmId, { speaker: { id: emp.id, name: emp.name, kind: "agent" }, text: errText, error: true });
    return errText;
  } finally {
    running.delete(dmId);
    deps.send("evt:team-room", { roomId: dmId, messages: loadRoomMessages(dmId), running: false });
  }
}
