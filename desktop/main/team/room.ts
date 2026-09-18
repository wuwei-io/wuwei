// AI 员工团队 · 群（多员工协作）
//
// 群独立于普通会话存储：~/.wuwei/team/rooms.json（元信息）+ rooms/<id>.json（消息流）。
// 刻意不复用 SessionMeta / sessions/<id>.json——现有会话结构字段多、保护逻辑密，
// 而且它的 Message 没有 speaker、历史校验强制角色交替，塞不下多方对话（详见 projection.ts）。

import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Room, RoomMessage } from "../../../src/team/types.js";

const DIR = join(homedir(), process.env.WUWEI_DATA_DIR_NAME || ".wuwei", "team");
const ROOMS = join(DIR, "rooms.json");
const MSG_DIR = join(DIR, "rooms");

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function loadRooms(): Room[] {
  const v = readJson<Room[]>(ROOMS, []);
  return Array.isArray(v) ? v : [];
}

function saveRooms(list: Room[]) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(ROOMS, JSON.stringify(list, null, 2));
}

export function loadRoomMessages(roomId: string): RoomMessage[] {
  const v = readJson<RoomMessage[]>(join(MSG_DIR, `${roomId}.json`), []);
  return Array.isArray(v) ? v : [];
}

export function saveRoomMessages(roomId: string, msgs: RoomMessage[]) {
  mkdirSync(MSG_DIR, { recursive: true });
  writeFileSync(join(MSG_DIR, `${roomId}.json`), JSON.stringify(msgs, null, 2));
}

export function createRoom(name: string, members: string[], coordinator?: string): Room {
  const room: Room = {
    id: randomUUID(),
    name: name || "新群",
    members: [...new Set(members)],
    coordinator: coordinator && members.includes(coordinator) ? coordinator : undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    maxWake: 3,
  };
  saveRooms([room, ...loadRooms()]);
  return room;
}

// ───────────────────────── 私聊（2 人房间）─────────────────────────
// 私聊 = 「2 个成员的 room」。刻意不新建 dm 模块：room 的存储/投影/编排/停止锁全部
// 对任意两名 agent 泛化（见 projection.ts projectFor），私聊只需加 type/dmKey 两个判别字段。

/** 私聊去重键：与成员顺序无关，[a,b].sort().join("__") */
export function dmKeyOf(a: string, b: string): string {
  return [a, b].sort().join("__");
}

/**
 * 建一个私聊房间（仿 createRoom）。
 * @param a,b   两名成员 employee.id
 * @param names 两名成员显示名（[a名, b名]），用于拼房间名；缺省用 id 兜底
 */
export function createDm(a: string, b: string, names?: [string, string]): Room {
  const room: Room = {
    id: randomUUID(),
    name: `${names?.[0] || a} · ${names?.[1] || b}`,
    type: "dm",
    dmKey: dmKeyOf(a, b),
    members: [...new Set([a, b])],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    maxWake: 1, // 私聊只有一名对话方，永远只唤醒收信方，不需要预算闸
  };
  saveRooms([room, ...loadRooms()]);
  return room;
}

/**
 * 找到或新建两人的私聊：已存在（type==="dm" 且 dmKey 相同）直接返回，防重复建；
 * 否则新建。删除复用现有 deleteRoom。
 */
export function findOrCreateDm(a: string, b: string, names?: [string, string]): Room {
  const key = dmKeyOf(a, b);
  const found = loadRooms().find((r) => r.type === "dm" && r.dmKey === key);
  return found ?? createDm(a, b, names);
}

export function updateRoom(id: string, patch: Partial<Room>): Room[] {
  const list = loadRooms().map((r) =>
    r.id === id ? { ...r, ...patch, id: r.id, updatedAt: Date.now() } : r,
  );
  saveRooms(list);
  return list;
}


/** 置顶/取消置顶群 */
export function pinRoom(id: string): Room[] {
  const list = loadRooms().map((r) => (r.id === id ? { ...r, pinnedAt: r.pinnedAt ? undefined : Date.now(), updatedAt: r.updatedAt } : r));
  saveRooms(list);
  return list;
}

export function deleteRoom(id: string): Room[] {
  const list = loadRooms().filter((r) => r.id !== id);
  saveRooms(list);
  try {
    const f = join(MSG_DIR, `${id}.json`);
    if (existsSync(f)) rmSync(f, { force: true });
  } catch {
    /* 消息文件删不掉不影响群已移除 */
  }
  return list;
}

/** 清空群里全部消息（保留群本身），返回空流 */
export function clearRoomMessages(roomId: string): RoomMessage[] {
  saveRoomMessages(roomId, []);
  updateRoom(roomId, { lastText: "" });
  return [];
}

/** 删除群里某一条消息，返回剩余消息流 */
export function deleteRoomMessage(roomId: string, msgId: string): RoomMessage[] {
  const msgs = loadRoomMessages(roomId).filter((m) => m.id !== msgId);
  saveRoomMessages(roomId, msgs);
  const last = msgs[msgs.length - 1];
  const preview = last ? (last.text || "").replace(/\s+/g, " ").slice(0, 40) : "";
  updateRoom(roomId, { lastText: last ? `${last.speaker.name}：${preview}` : "" });
  return msgs;
}

/** 追加一条消息并同步群的 updatedAt / lastText，返回最新消息流 */
export function appendMessage(roomId: string, msg: Omit<RoomMessage, "id" | "ts"> & { ts?: number }): RoomMessage[] {
  const msgs = loadRoomMessages(roomId);
  const full: RoomMessage = { id: randomUUID(), ts: msg.ts ?? Date.now(), ...msg };
  msgs.push(full);
  saveRoomMessages(roomId, msgs);
  const preview = (msg.text || "").replace(/\s+/g, " ").slice(0, 40);
  updateRoom(roomId, { lastText: `${msg.speaker.name}：${preview}` });
  return msgs;
}
