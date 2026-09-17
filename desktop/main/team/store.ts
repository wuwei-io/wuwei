// AI 员工团队 · 数据层
//
// 全部数据收在 ~/.wuwei/team/ 子目录下，删掉整个目录 = 卸载干净，不在数据根目录留痕迹。
// ⚠️ 本模块不在加载时做任何 IO：目录只在「真的要写」时懒创建，读不到一律返回空。
//    这样总开关关闭时（registerTeam 根本不被调用），磁盘上不会凭空多出 team 目录。

import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Employee, TeamApp } from "../../../src/team/types.js";

const DIR = join(homedir(), process.env.WUWEI_DATA_DIR_NAME || ".wuwei", "team");
const APPS = join(DIR, "apps.json");
const EMPLOYEES = join(DIR, "employees.json");

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback; // 不存在/损坏都按空处理，不抛错、不自动重建
  }
}

function writeJson(file: string, data: unknown) {
  mkdirSync(DIR, { recursive: true }); // 懒创建：只有真的写入才落目录
  writeFileSync(file, JSON.stringify(data, null, 2));
}

export function loadApps(): TeamApp[] {
  const v = readJson<TeamApp[]>(APPS, []);
  return Array.isArray(v) ? v : [];
}

export function saveApps(apps: TeamApp[]) {
  writeJson(APPS, apps);
}

export function loadEmployees(): Employee[] {
  const v = readJson<Employee[]>(EMPLOYEES, []);
  return Array.isArray(v) ? v : [];
}

export function saveEmployees(list: Employee[]) {
  writeJson(EMPLOYEES, list);
}

/**
 * 安装一个应用：写入应用记录 + 把它带的员工并进员工表。
 * 同 id 员工按「保留用户改动」处理——用户可能改过人格/换过模型，重装不该覆盖掉。
 */
export function installApp(app: TeamApp): { apps: TeamApp[]; employees: Employee[] } {
  const apps = loadApps().filter((a) => a.id !== app.id);
  apps.push({ ...app, installedAt: Date.now(), disabled: false });

  const employees = loadEmployees();
  const existing = new Set(employees.map((e) => e.id));
  for (const e of app.employees) {
    if (existing.has(e.id)) continue; // 已存在=用户可能改过，不动
    employees.push({ ...e, fromApp: app.id });
  }

  saveApps(apps);
  saveEmployees(employees);
  return { apps, employees };
}

/**
 * 卸载：移除应用记录，并清掉「由它带来且用户没改过名字的」员工。
 * 保守起见只删 fromApp 指向它的，用户自建员工（无 fromApp）永远保留。
 */
export function uninstallApp(appId: string): { apps: TeamApp[]; employees: Employee[] } {
  const apps = loadApps().filter((a) => a.id !== appId);
  const employees = loadEmployees().filter((e) => e.fromApp !== appId);
  saveApps(apps);
  saveEmployees(employees);
  return { apps, employees };
}

/** 停用/启用：员工保留，但不出现在选人列表里（与 MCP 的 disabled 同义） */
export function toggleApp(appId: string): TeamApp[] {
  const apps = loadApps().map((a) => (a.id === appId ? { ...a, disabled: !a.disabled } : a));
  saveApps(apps);
  return apps;
}

/**
 * 批量并入员工（从 openclaw 等外部来源导入时用）。
 * 同 id 视为已导入过，跳过而不是覆盖——用户可能已经改过人格，重复导入不该把改动冲掉。
 * 返回新并入的数量，好让界面告诉用户"导入了 N 名，M 名已存在"。
 */
export function addEmployees(list: Employee[]): { employees: Employee[]; added: number } {
  const cur = loadEmployees();
  const have = new Set(cur.map((e) => e.id));
  let added = 0;
  for (const e of list) {
    if (have.has(e.id)) continue;
    cur.push(e);
    have.add(e.id);
    added++;
  }
  if (added) saveEmployees(cur);
  return { employees: cur, added };
}

/**
 * 把员工的几段定义拼成一块系统提示词。各段对应 openclaw 的核心文件：
 * 身份职责(IDENTITY) + 性格(SOUL) + 关于老板(USER) + 长期记忆(MEMORY)。
 * 只拼有内容的段。放数据层(而非 index)是为了让 index 与 orchestrator 都能引用、避免循环依赖。
 */
export function buildPersonaBlock(emp: Employee): string {
  const parts = [`## 你的身份\n\n请始终以这个身份工作：\n\n${emp.persona}`];
  if (emp.soul?.trim()) parts.push(`## 你的性格与说话风格\n\n${emp.soul.trim()}`);
  if (emp.aboutUser?.trim()) parts.push(`## 关于你服务的人\n\n${emp.aboutUser.trim()}`);
  if (emp.memory?.trim()) parts.push(`## 你需要长期记住的背景\n\n${emp.memory.trim()}`);
  return parts.join("\n\n");
}

/**
 * 拼一名员工的完整系统提示词。
 *
 * ⭐ 关键：员工身份必须**在最前面、且压过**基础提示词里「你是无为(wuwei)」那句。
 *    此前是 `baseSys + 人格`——基础提示词开头强锚定"你是无为，一个终端里的 AI 助手"，
 *    模型据此自我认同，人格追加在后压不动，导致问"你是谁"答"我是无为"(用户实测)。
 *
 * 参照 openclaw：**bot 的身份(IDENTITY/SOUL/USER/MEMORY)才是系统提示词主体，
 *    运行环境(工具/目录/准则)是附属**。所以这里：
 *      1. 员工身份+性格+关于老板+长期记忆+专属动态记忆 → 放最前，明确"你就是他"。
 *      2. 无为客户端的工具/目录/安全/交互规范 → 作为「运行环境」附在后面，并显式声明
 *         "这是你的运行环境，不是你的身份"，剥掉基础提示词开头的"你是无为"自我认同段。
 *
 * @param baseSys 基础(无为)系统提示词，完整含工具/目录/记忆/交互
 * @param dyn     员工聊天中 remember 攒的专属动态记忆(可空)
 * @param sceneBlock 可选场景块(群聊用：告诉他此刻在哪个群、有哪些成员)，接在身份之后
 */
export function buildEmployeeSystem(emp: Employee, baseSys: string, dyn: string, sceneBlock?: string): string {
  // 基础提示词里「当前工作目录 / Current working directory」之前全是"你是无为…"的身份自述，
  // 之后才是纯操作性内容(工具/准则/记忆/密钥/交互)。从这里切开，只保留操作性尾部当运行环境。
  const zhAt = baseSys.indexOf("当前工作目录");
  const enAt = baseSys.indexOf("Current working directory");
  const cut = zhAt >= 0 ? zhAt : enAt;
  const en = enAt >= 0 && (zhAt < 0 || enAt < zhAt);
  const operational = cut >= 0 ? baseSys.slice(cut) : baseSys; // 兜底：切不到就整段带上(自定义提示词等)

  const title = emp.title ? (en ? ` — ${emp.title}` : `——${emp.title}`) : "";
  const head = en
    ? `You are "${emp.name}"${title}. Everything below is your identity and how you must behave — always stay in this character. When asked who you are, answer that you are ${emp.name}; never call yourself "Wuwei" or "a generic assistant".`
    : `你是「${emp.name}」${title}。下面是你的身份与设定，任何时候都以此为准、始终保持这个角色。被问“你是谁/你是什么”时，回答你是${emp.name}，绝不自称“无为”或“通用助手”。`;
  const memBlock = dyn ? (en ? `\n\n## What you've remembered (your own memory)\n\n${dyn}` : `\n\n## 你记住的事（专属记忆）\n\n${dyn}`) : "";
  const scene = sceneBlock ? `\n\n${sceneBlock}` : "";
  const runtimeIntro = en
    ? `\n\n---\n\n## Your runtime — environment & tools, NOT your identity\nYou run inside the "Wuwei" desktop client. That's your runtime, not who you are. Through it you call tools to get real work done. Operating rules below:\n\n`
    : `\n\n---\n\n## 你的运行环境（工具与操作规范，不是你的身份）\n你运行在「无为」客户端里——这是你的运行环境，不是你的身份。你借助它调用工具真正干活。以下是操作规范：\n\n`;

  return `---\n\n${head}\n\n${buildPersonaBlock(emp)}${memBlock}${scene}${runtimeIntro}${operational}`;
}


const MEM_DIR = join(DIR, "memory");
/** 员工专属记忆文件路径（remember 工具写这里、applyEmployee 读这里追加进人格）。 */
export function employeeMemoryPath(id: string): string {
  return join(MEM_DIR, `${id}.md`);
}
/** 读员工专属动态记忆（聊天中 remember 攒的）。不存在返回空。 */
export function loadEmployeeMemory(id: string): string {
  try { return readFileSync(employeeMemoryPath(id), "utf8").trim(); } catch { return ""; }
}

/** 置顶/取消置顶员工：pinnedAt 有值即置顶，按它降序排前面。 */
export function pinEmployee(id: string): Employee[] {
  const list = loadEmployees().map((e) => (e.id === id ? { ...e, pinnedAt: e.pinnedAt ? undefined : Date.now() } : e));
  saveEmployees(list);
  return list;
}

/** 更新单个员工（改人格/换模型/调工具白名单） */
export function updateEmployee(id: string, patch: Record<string, unknown>): Employee[] {
  const list = loadEmployees().map((e) => {
    if (e.id !== id) return e;
    const next: Record<string, unknown> = { ...e };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined) delete next[k]; // null/undefined = 清除该字段（如移除自定义头像）
      else next[k] = v;
    }
    next.id = e.id; // id 不可改
    return next as unknown as Employee;
  });
  saveEmployees(list);
  return list;
}

/** 删除单个员工（用户手动删，不连带卸载应用） */
export function removeEmployee(id: string): Employee[] {
  const list = loadEmployees().filter((e) => e.id !== id);
  saveEmployees(list);
  return list;
}

/**
 * 抹掉整个模块的数据（用户在设置里关掉模块并选择「同时清除数据」时用）。
 * 可插拔的最后一环：关掉开关 + 删目录 = 完全恢复到没装过的状态。
 */
export function purge() {
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
}
