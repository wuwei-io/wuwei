// AI 员工团队 · 主进程模块唯一入口
//
// ⭐ 可插拔契约：主进程只有一处调用 `registerTeam(...)`，且被 `teamEnabled` 包着。
//    开关关闭时本模块的任何代码都不执行——不注册 IPC、不读盘、不占启动时间。
//    要摘掉整个模块：删 desktop/main/team/、desktop/renderer/src/team/、src/team/，
//    再回滚 index.ts / preload / App.tsx 那几处调用即可，其余代码零改动。

import type { IpcMain } from "electron";
import type { Employee, TeamAppCard } from "../../../src/team/types.js";
import { BUILTIN_APPS, findBuiltinApp } from "./catalog.js";
import {
  installApp,
  loadApps,
  loadEmployees,
  purge,
  removeEmployee,
  toggleApp,
  uninstallApp,
  updateEmployee,
} from "./store.js";

export type TeamDeps = {
  /** 广播给渲染层，让界面跟着刷新（与主进程其它 evt:* 同一套机制） */
  send: (channel: string, payload?: unknown) => void;
  log: (tag: string, ...args: unknown[]) => void;
};

const CHANNELS = [
  "team:state",
  "team:install",
  "team:uninstall",
  "team:toggle",
  "team:employee:update",
  "team:employee:remove",
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
