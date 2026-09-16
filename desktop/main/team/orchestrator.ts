// AI 员工团队 · 群编排器
//
// 职责只有两件：决定「谁该说话」，以及「他能看到什么」（后者委托给 projection.ts）。
// 真正把 Agent 跑起来的能力由主进程通过 deps.runEmployee 注入——provider 的构造、
// 工具集、凭证刷新那套逻辑都在主进程，这里不重复实现，也不 import 内核的 Agent。

import type { Employee, Room, RoomMessage } from "../../../src/team/types.js";
import type { Message } from "../../../src/types.js";
import { pickResponders, projectFor } from "./projection.js";
import { appendMessage, loadRoomMessages, loadRooms } from "./room.js";
import { loadEmployees, buildPersonaBlock } from "./store.js";

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
        const sys = `${base}\n\n${buildPersonaBlock(emp)}\n\n## 当前场景\n\n你在群聊「${room.name}」里，成员有：${members
          .map((m) => m.name)
          .join("、")}。别人的发言会以「姓名」开头标出。只说你自己该说的部分，不要替别人回答，也不要复述已有内容。`;

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
