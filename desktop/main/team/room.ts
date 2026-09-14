// AI 员工团队 · 房间（多员工协作）
//
// 房间独立于普通会话存储：~/.wuwei/team/rooms.json（元信息）+ rooms/<id>.json（消息流）。
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
    name: name || "新房间",
    members: [...new Set(members)],
    coordinator: coordinator && members.includes(coordinator) ? coordinator : undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    maxWake: 3,
  };
  saveRooms([room, ...loadRooms()]);
  return room;
}

export function updateRoom(id: string, patch: Partial<Room>): Room[] {
  const list = loadRooms().map((r) =>
    r.id === id ? { ...r, ...patch, id: r.id, updatedAt: Date.now() } : r,
  );
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
    /* 消息文件删不掉不影响房间已移除 */
  }
  return list;
}

/** 追加一条消息并同步房间的 updatedAt / lastText，返回最新消息流 */
export function appendMessage(roomId: string, msg: Omit<RoomMessage, "id" | "ts"> & { ts?: number }): RoomMessage[] {
  const msgs = loadRoomMessages(roomId);
  const full: RoomMessage = { id: randomUUID(), ts: msg.ts ?? Date.now(), ...msg };
  msgs.push(full);
  saveRoomMessages(roomId, msgs);
  const preview = (msg.text || "").replace(/\s+/g, " ").slice(0, 40);
  updateRoom(roomId, { lastText: `${msg.speaker.name}：${preview}` });
  return msgs;
}
