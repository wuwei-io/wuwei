// AI 员工团队 · 主进程模块唯一入口
//
// ⭐ 可插拔契约：主进程只有一处调用 `registerTeam(...)`，且被 `teamEnabled` 包着。
//    开关关闭时本模块的任何代码都不执行——不注册 IPC、不读盘、不占启动时间。
//    要摘掉整个模块：删 desktop/main/team/、desktop/renderer/src/team/、src/team/，
//    再回滚 index.ts / preload / App.tsx 那几处调用即可，其余代码零改动。

import type { IpcMain } from "electron";
import { readdirSync, readFileSync } from "node:fs";
import { join, basename, extname } from "node:path";
import type { Employee, Room, TeamAppCard } from "../../../src/team/types.js";
// 一人公司 SOP 库数据层（与 team 同一可插拔契约、同一总开关）
import {
  loadTree as sopLoadTree,
  createNode as sopCreateNode,
  renameNode as sopRenameNode,
  moveNode as sopMoveNode,
  deleteNode as sopDeleteNode,
  readSopDoc as sopReadDoc,
  saveSopDoc as sopSaveDoc,
  listVersions as sopListVersions,
  readVersion as sopReadVersion,
  rollback as sopRollback,
  purge as sopPurge,
} from "../sop/store.js";
import { BUILTIN_APPS, findBuiltinApp } from "./catalog.js";
import { detectSources, importFrom } from "./import.js";
import { abortRoom, forceStopRoom, isRoomRunning, runRoomTurn, runDmHumanTurn, getRoomProgress, type RunEmployeeArgs } from "./orchestrator.js";
import { createRoom, deleteRoom, loadRoomMessages, loadRooms, updateRoom, pinRoom, clearRoomMessages, deleteRoomMessage } from "./room.js";
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
  buildEmployeeSystem,
  loadTeamConfig,
  saveTeamConfig,
  reorderEmployees,
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
  const sys = buildEmployeeSystem(emp, baseSys, dyn); // 员工身份在前、无为降为运行环境(见 store.ts)
  // dm_teammate（员工私聊）是团队协作的基础能力，不受员工工具白名单裁剪——
  // 即便员工只勾了很窄的工具，也应始终能私信同事。
  // SOP 库的三个只读工具（查/读/列）永久保留：即便员工工具白名单很窄，也应能查阅公司标准流程。
  // write_sop（会写盘）不永久保留，遵从员工的工具白名单裁剪。
  const ALWAYS_KEEP = new Set(["dm_teammate", "search_sop", "read_sop", "list_sops"]);
  const tools = emp.tools?.length
    ? allTools.filter((t) => emp.tools!.includes(t.name) || ALWAYS_KEEP.has(t.name))
    : allTools;
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
  "team:room:progress",
  "team:room:send",
  "team:room:abort",
  "team:room:clear",
  "team:room:msg-delete",
  "team:purge",
  // 一人公司 SOP 库（同一总开关；unregisterTeam 遍历本数组自动摘）
  "sop:tree",
  "sop:create",
  "sop:rename",
  "sop:move",
  "sop:delete",
  "sop:doc",
  "sop:save",
  "sop:versions",
  "sop:read-version",
  "sop:rollback",
  "sop:import",
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

// 保存 deps.send 引用，供 index.ts 里的 AI 工具(create/update/delete_employee)改完员工后重广播 evt:team，
// 让通讯录/管理页即时刷新（否则 AI 建的员工要重启才见——就像 AI 绕过工具直接改 employees.json 的老问题）。
let teamSend: TeamDeps["send"] | null = null;
export function broadcastTeam(): void {
  teamSend?.("evt:team", snapshot());
}

export function registerTeam(ipcMain: IpcMain, deps: TeamDeps) {
  if (registered) return; // 开关热切换时可能重复调用，IPC 不能重复注册
  registered = true;
  teamSend = deps.send;
  deps.log("team", "模块已启用");

  const push = () => deps.send("evt:team", snapshot());

  ipcMain.handle("team:state", () => snapshot());

  // 一人公司级配置(转派链最大层数等)
  ipcMain.handle("team:config:get", () => loadTeamConfig());
  ipcMain.handle("team:config:set", (_e, patch: unknown) => saveTeamConfig((patch || {}) as any));

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
  ipcMain.handle("team:employee:reorder", (_e, ids: unknown) => { reorderEmployees(Array.isArray(ids) ? ids.map(String) : []); push(); return { ok: true, ...snapshot() }; });
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

  // 界面切进某房间时拉「当前全量进度」——补齐切走期间错过的增量(进度真相源在主进程，见 orchestrator getRoomProgress)。
  ipcMain.handle("team:room:progress", (_e, id: string) => ({
    progress: getRoomProgress(String(id || "")),
  }));

  // 在群/私聊里发言：不 await，进度走 evt:team-room
  //  · 群(普通 room)：存消息 → 按 @ 决定唤醒谁 → 并行跑 → 结果回群。
  //  · 私聊(type==="dm")：dmResponderId=界面「对方」id → 人类消息落库 → 唤醒对方回一句（不走 pickResponders）。
  ipcMain.handle("team:room:send", (_e, id: string, text: string, dmResponderId?: string) => {
    const rid = String(id || "");
    const orchDeps = { send: deps.send, log: deps.log, runEmployee: deps.runEmployee, baseSys: deps.baseSys };
    const room = loadRooms().find((r) => r.id === rid);
    const responder = String(dmResponderId || "");
    if (room?.type === "dm" && responder) {
      void runDmHumanTurn(rid, responder, String(text || ""), orchDeps);
    } else {
      void runRoomTurn(rid, String(text || ""), orchDeps);
    }
    return { ok: true };
  });

  ipcMain.handle("team:room:abort", (_e, id: string) => {
    const rid = String(id || "");
    forceStopRoom(rid); // 强制停：立刻解锁界面、放行下一条，不等挂起的 401 重试
    deps.send("evt:team-room", { roomId: rid, messages: loadRoomMessages(rid), running: false });
    return { ok: true };
  });

  // 清空群里全部消息（保留群）
  ipcMain.handle("team:room:clear", (_e, id: string) => {
    const rid = String(id || "");
    clearRoomMessages(rid);
    deps.send("evt:team-room", { roomId: rid, messages: [], running: isRoomRunning(rid) });
    deps.send("evt:team-rooms", rooms());
    return { ok: true };
  });

  // 删除群里某一条消息
  ipcMain.handle("team:room:msg-delete", (_e, id: string, msgId: string) => {
    const rid = String(id || "");
    const msgs = deleteRoomMessage(rid, String(msgId || ""));
    deps.send("evt:team-room", { roomId: rid, messages: msgs, running: isRoomRunning(rid) });
    deps.send("evt:team-rooms", rooms());
    return { ok: true, messages: msgs };
  });

  // ── 一人公司 SOP 库 ──────────────────────────────────────────
  // 树变更后广播 evt:sop，让侧栏与 SopView 跟着刷新（同 evt:team-rooms 机制）。
  const sopPush = () => deps.send("evt:sop", { tree: sopLoadTree() });

  ipcMain.handle("sop:tree", () => ({ tree: sopLoadTree() }));

  ipcMain.handle("sop:create", (_e, kind: "category" | "sop", name: string, parentId?: string, opts?: { taskKey?: string; summary?: string }) => {
    const r = sopCreateNode(kind === "sop" ? "sop" : "category", String(name || ""), parentId ? String(parentId) : undefined, opts || undefined);
    deps.log("sop", "新建", kind, r.node.name, r.exists ? "(已存在,去重)" : "");
    sopPush();
    return { ok: true, node: r.node, exists: r.exists, tree: sopLoadTree() };
  });

  ipcMain.handle("sop:rename", (_e, id: string, name: string) => {
    sopRenameNode(String(id || ""), String(name || ""));
    sopPush();
    return { ok: true, tree: sopLoadTree() };
  });

  ipcMain.handle("sop:move", (_e, id: string, parentId: string | undefined, order: number) => {
    sopMoveNode(String(id || ""), parentId ? String(parentId) : undefined, Number(order) || 0);
    sopPush();
    return { ok: true, tree: sopLoadTree() };
  });

  ipcMain.handle("sop:delete", (_e, id: string) => {
    sopDeleteNode(String(id || ""));
    deps.log("sop", "删除", id);
    sopPush();
    return { ok: true, tree: sopLoadTree() };
  });

  ipcMain.handle("sop:doc", (_e, id: string) => ({ text: sopReadDoc(String(id || "")) }));

  ipcMain.handle("sop:save", (_e, id: string, text: string, note?: string) => {
    const r = sopSaveDoc(String(id || ""), String(text ?? ""), note ? String(note) : undefined);
    sopPush();
    return { ok: !!r.node, version: r.version, tree: sopLoadTree() };
  });

  ipcMain.handle("sop:versions", (_e, id: string) => ({ versions: sopListVersions(String(id || "")) }));

  ipcMain.handle("sop:read-version", (_e, id: string, n: number) => ({ text: sopReadVersion(String(id || ""), Number(n) || 0) }));

  ipcMain.handle("sop:rollback", (_e, id: string, n: number) => {
    const r = sopRollback(String(id || ""), Number(n) || 0);
    sopPush();
    return "error" in r ? { ok: false, error: r.error } : { ok: true, version: r.version, tree: sopLoadTree() };
  });

  // KB 导入：把某目录下的 .md 机械导入为 SOP（文件名去扩展名作标题、slug 作 taskKey、内容作 v1）。
  ipcMain.handle("sop:import", (_e, dir: string) => {
    const d = String(dir || "");
    if (!d) return { ok: false, error: "no_dir" };
    let files: string[] = [];
    try { files = readdirSync(d).filter((f) => extname(f).toLowerCase() === ".md"); } catch { return { ok: false, error: "read_failed" }; }
    // 给这次导入建一个类别，避免污染顶层
    const catName = basename(d) || "导入";
    const catId = sopCreateNode("category", catName).node.id;
    let added = 0;
    for (const f of files) {
      const title = basename(f, extname(f)).replace(/[-_]+/g, " ").trim() || f;
      const slug = basename(f, extname(f)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `kb-${Date.now()}-${added}`;
      const taskKey = `kb-${slug}`;
      const created = sopCreateNode("sop", title, catId, { taskKey });
      if (created.exists) continue; // taskKey 撞了=已导入过，跳过
      let body = "";
      try { body = readFileSync(join(d, f), "utf8"); } catch { /* 读不到就空正文 */ }
      sopSaveDoc(created.node.id, body, "KB 导入");
      added++;
    }
    deps.log("sop", "KB 导入", `${files.length} 个 md，新增 ${added} 条`);
    sopPush();
    return { ok: true, added, parsed: files.length, tree: sopLoadTree() };
  });

  // 关掉模块时用户可选「同时清除数据」：删掉 ~/.wuwei/team/ 整个目录
  ipcMain.handle("team:purge", () => {
    purge();
    sopPurge(); // SOP 库与 team 同属一人公司模块，一并清掉 ~/.wuwei/sop/
    deps.log("team", "已清除全部数据");
    push();
    sopPush();
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
