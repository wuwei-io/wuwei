// AI 员工团队 · 主进程模块唯一入口
//
// ⭐ 可插拔契约：主进程只有一处调用 `registerTeam(...)`，且被 `teamEnabled` 包着。
//    开关关闭时本模块的任何代码都不执行——不注册 IPC、不读盘、不占启动时间。
//    要摘掉整个模块：删 desktop/main/team/、desktop/renderer/src/team/、src/team/，
//    再回滚 index.ts / preload / App.tsx 那几处调用即可，其余代码零改动。

import type { IpcMain } from "electron";
import type { Employee, Room, TeamAppCard } from "../../../src/team/types.js";
import { BUILTIN_APPS, findBuiltinApp } from "./catalog.js";
import { detectSources, importFrom } from "./import.js";
import { abortRoom, isRoomRunning, runRoomTurn, type RunEmployeeArgs } from "./orchestrator.js";
import { createRoom, deleteRoom, loadRoomMessages, loadRooms, updateRoom, pinRoom } from "./room.js";
import {
  addEmployees,
  installApp,
  loadApps,
  loadEmployees,
  purge,
  removeEmployee,
  toggleApp,
  uninstallApp,
  updateEmployee,
  pinEmployee,
  loadEmployeeMemory,
  employeeMemoryPath,
  buildPersonaBlock,
} from "./store.js";

export type TeamDeps = {
  /** 广播给渲染层，让界面跟着刷新（与主进程其它 evt:* 同一套机制） */
  send: (channel: string, payload?: unknown) => void;
  log: (tag: string, ...args: unknown[]) => void;
  /** 开一个与该员工的新私聊会话（主进程持有 currentId/getAgent，故由它实现，本模块只提需求） */
  startChat: (employeeId: string, employeeName: string, model?: { providerId: string; model: string }) => void;
  /** 跑一名员工一轮（群用）。provider 构造/工具集/凭证刷新都在主进程，这里不重复实现 */
  runEmployee: (args: RunEmployeeArgs) => Promise<string>;
  /** 基础系统提示词：工作目录、工具用法、安全红线等运行必需信息 */
  baseSys: () => string;
};

/** 按 id 取员工；模块关闭时不会有人调用它 */
export function findEmployee(id: string): Employee | null {
  if (!id) return null;
  return loadEmployees().find((e) => e.id === id) ?? null;
}

/**
 * 把员工的人格与工具白名单套到一个会话上。
 * ⭐ 人格是「追加」而不是「替换」基础提示词——基础提示词里有工作目录、工具用法、
 *    安全red line 等运行必需的信息，换掉会让员工变成一个不会用工具的聊天机器人。
 * 工具白名单缺省(undefined/空)= 不裁剪，保持全量。
 */
export function applyEmployee<T extends { name: string }>(
  employeeId: string | undefined,
  baseSys: string,
  allTools: T[],
): { sys: string; tools: T[]; employee: Employee | null } {
  const emp = employeeId ? findEmployee(employeeId) : null;
  if (!emp) return { sys: baseSys, tools: allTools, employee: null };
  const dyn = loadEmployeeMemory(emp.id); // 聊天中 remember 攒的专属动态记忆
  const sys = `${baseSys}\n\n${buildPersonaBlock(emp)}` + (dyn ? `\n\n## 你记住的事（专属记忆）\n\n${dyn}` : "");
  const tools = emp.tools?.length ? allTools.filter((t) => emp.tools!.includes(t.name)) : allTools;
  return { sys, tools, employee: emp };
}

// buildPersonaBlock 已移到 store.ts（数据层），index 与 orchestrator 都从那里 import，避免循环依赖。

const CHANNELS = [
  "team:state",
  "team:install",
  "team:uninstall",
  "team:toggle",
  "team:employee:update",
  "team:employee:remove",
  "team:employee:pin",
  "team:room:pin",
  "team:import:scan",
  "team:import:apply",
  "team:chat",
  "team:rooms",
  "team:room:create",
  "team:room:update",
  "team:room:delete",
  "team:room:messages",
  "team:room:send",
  "team:room:abort",
  "team:purge",
] as const;

let registered = false;

/** 把已装状态并进内置目录，算好每张卡片的展示态，省得渲染层自己比对 */
function buildCards(): TeamAppCard[] {
  const installed = loadApps();
  const byId = new Map(installed.map((a) => [a.id, a]));
  const cards: TeamAppCard[] = BUILTIN_APPS.map((a) => {
    const got = byId.get(a.id);
    return { ...a, ...(got || {}), installed: !!got };
  });
  // 目录里没有、但本地装着的（将来从线上装的），也列出来，否则用户看不到也卸不掉
  for (const a of installed) if (!cards.some((c) => c.id === a.id)) cards.push({ ...a, installed: true });
  return cards;
}

function snapshot(): { apps: TeamAppCard[]; employees: Employee[] } {
  return { apps: buildCards(), employees: loadEmployees() };
}

export function registerTeam(ipcMain: IpcMain, deps: TeamDeps) {
  if (registered) return; // 开关热切换时可能重复调用，IPC 不能重复注册
  registered = true;
  deps.log("team", "模块已启用");

  const push = () => deps.send("evt:team", snapshot());

  ipcMain.handle("team:state", () => snapshot());

  ipcMain.handle("team:install", (_e, appId: string) => {
    const app = findBuiltinApp(String(appId || ""));
    if (!app) return { ok: false, error: "unknown_app" };
    installApp(app);
    deps.log("team", "安装应用", app.id, `员工 +${app.employees.length}`);
    push();
    return { ok: true, ...snapshot() };
  });

  ipcMain.handle("team:uninstall", (_e, appId: string) => {
    uninstallApp(String(appId || ""));
    deps.log("team", "卸载应用", appId);
    push();
    return { ok: true, ...snapshot() };
  });

  ipcMain.handle("team:toggle", (_e, appId: string) => {
    toggleApp(String(appId || ""));
    push();
    return { ok: true, ...snapshot() };
  });

  ipcMain.handle("team:employee:update", (_e, id: string, patch: Partial<Employee>) => {
    updateEmployee(String(id || ""), patch || {});
    push();
    return { ok: true, ...snapshot() };
  });

  ipcMain.handle("team:employee:remove", (_e, id: string) => {
    removeEmployee(String(id || ""));
    push();
    return { ok: true, ...snapshot() };
  });

  ipcMain.handle("team:employee:pin", (_e, id: string) => { pinEmployee(String(id || "")); push(); return { ok: true, ...snapshot() }; });
  ipcMain.handle("team:room:pin", (_e, id: string) => { pinRoom(String(id || "")); deps.send("evt:team-rooms", { rooms: loadRooms() }); return { ok: true, rooms: loadRooms() }; });

  // 扫描本机可导入的员工来源（openclaw 的 IDENTITY.md）。纯读文件，不需要 openclaw 在运行。
  ipcMain.handle("team:import:scan", () => {
    const sources = detectSources();
    deps.log("team", "扫描导入源", `${sources.length} 个`, sources.map((s) => `${s.kind}:${s.candidates.length}名`).join(" "));
    return { sources };
  });

  ipcMain.handle("team:import:apply", (_e, sourcePath: string, ids: string[]) => {
    const list = importFrom(String(sourcePath || ""), Array.isArray(ids) ? ids.map(String) : []);
    const { added } = addEmployees(list);
    deps.log("team", "导入员工", `解析 ${list.length} 名，新增 ${added} 名`);
    push();
    return { ok: true, added, parsed: list.length, ...snapshot() };
  });

  // 开一个与该员工的私聊：本质就是普通会话，只是绑了 employeeId，Agent 构建时套上人格与工具白名单
  ipcMain.handle("team:chat", (_e, employeeId: string) => {
    const emp = findEmployee(String(employeeId || ""));
    if (!emp) return { ok: false, error: "unknown_employee" };
    deps.startChat(emp.id, emp.name, emp.model);
    return { ok: true };
  });

  // ── 群（多员工协作）──────────────────────────────────────────
  const rooms = () => ({ rooms: loadRooms() });

  ipcMain.handle("team:rooms", () => rooms());

  ipcMain.handle("team:room:create", (_e, name: string, members: string[], coordinator?: string) => {
    const r = createRoom(String(name || ""), Array.isArray(members) ? members.map(String) : [], coordinator);
    deps.log("team", "建群", r.name, `${r.members.length} 名成员`);
    deps.send("evt:team-rooms", rooms());
    return { ok: true, room: r, ...rooms() };
  });

  ipcMain.handle("team:room:update", (_e, id: string, patch: Partial<Room>) => {
    updateRoom(String(id || ""), patch || {});
    deps.send("evt:team-rooms", rooms());
    return { ok: true, ...rooms() };
  });

  ipcMain.handle("team:room:delete", (_e, id: string) => {
    deleteRoom(String(id || ""));
    deps.send("evt:team-rooms", rooms());
    return { ok: true, ...rooms() };
  });

  ipcMain.handle("team:room:messages", (_e, id: string) => ({
    messages: loadRoomMessages(String(id || "")),
    running: isRoomRunning(String(id || "")),
  }));

  // 在群里发言：存消息 → 按 @ 决定唤醒谁 → 并行跑 → 结果回群。不 await，进度走 evt:team-room
  ipcMain.handle("team:room:send", (_e, id: string, text: string) => {
    void runRoomTurn(String(id || ""), String(text || ""), {
      send: deps.send,
      log: deps.log,
      runEmployee: deps.runEmployee,
      baseSys: deps.baseSys,
    });
    return { ok: true };
  });

  ipcMain.handle("team:room:abort", (_e, id: string) => {
    abortRoom(String(id || ""));
    return { ok: true };
  });

  // 关掉模块时用户可选「同时清除数据」：删掉 ~/.wuwei/team/ 整个目录
  ipcMain.handle("team:purge", () => {
    purge();
    deps.log("team", "已清除全部数据");
    push();
    return { ok: true, ...snapshot() };
  });
}

/**
 * 关掉开关时把 IPC 通道摘干净，不留着"注册了但没人调"的半吊子状态。
 * 这样开关的语义才是真的：关 = 主进程完全不响应 team 的任何请求。
 */
export function unregisterTeam(ipcMain: IpcMain) {
  if (!registered) return;
  registered = false;
  for (const c of CHANNELS) ipcMain.removeHandler(c);
}
