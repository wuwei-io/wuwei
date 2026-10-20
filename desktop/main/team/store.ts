import { tr, tr as translate, getCurrentLanguage } from "../../../src/localization/index.js";
import { localizeEmployee, employeeRoster } from "../../../src/team/default-localization.js";
import { DEFAULT_TEAM_ID } from "../../../src/team/default-localization.js";
import { historyPolicy } from "../../../src/team/history-window.js";
import { defaultDepartments } from "../../../src/team/default-departments.js";
// AI 员工团队 · 数据层
//
// 全部数据收在 ~/.wuwei/team/ 子目录下，删掉整个目录 = 卸载干净，不在数据根目录留痕迹。
// ⚠️ 本模块不在加载时做任何 IO：目录只在「真的要写」时懒创建，读不到一律返回空。
//    这样总开关关闭时（registerTeam 根本不被调用），磁盘上不会凭空多出 team 目录。

import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Employee, TeamApp, ScheduledTask, ScheduleTrigger } from "../../../src/team/types.js";

const DIR = join(homedir(), process.env.WUWEI_DATA_DIR_NAME || ".wuwei", "team");
const APPS = join(DIR, "apps.json");
const EMPLOYEES = join(DIR, "employees.json");
const CONFIG = join(DIR, "config.json");
const SCHEDULES = join(DIR, "schedules.json");

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

/** 一人公司级配置(config.json)。 */
export interface TeamConfig {
  /** Request history window for company conversations (2–100, default 10). */
  historyRecentMessages?: number;
  /** Include a bounded, local extractive digest of older messages (default true). */
  historyAutoSummary?: boolean;
  /** dm_teammate 转派链最大层数(链上员工数)：1=不允许转派，3=最多三层(如 小笨→小码→小美)。默认 3。 */
  maxDmLevels?: number;
  /** 定时任务总开关：false=全部暂停不触发(与单任务开关叠加)。缺省视为开启。 */
  schedulesEnabled?: boolean;
  /** CEO 员工 id：员工用 ask_user 请示时先由 CEO 把关(拍不了才上报董事长)。缺省自动识别(职位含 CEO / 名叫小笨)。 */
  ceoEmployeeId?: string;
  /** CEO 拍板倒计时(秒)：员工请示后给 CEO 这么久拍板，超时没定就上报董事长。缺省 10，范围 3~60。 */
  ceoDecideTimeoutSec?: number;
  /**
   * 部门（组织架构）。默认团队首次安装初始化四个部门；已有部门和显式清空保留。
   * 一名员工最多归一个部门（按 memberIds 判定）；headId=部门负责人（也应在 memberIds 里）。
   */
  departments?: Department[];
}

/** 部门：负责人 + 成员。纯组织架构元数据，用于通讯录分组与管理；不影响派活路由（除非负责人恰好是 CEO）。 */
export interface Department {
  id: string;
  name: string;
  /** 部门负责人 employee id（应包含在 memberIds 内）。缺省=暂无负责人。 */
  headId?: string;
  /** 成员 employee id（含负责人）。 */
  memberIds: string[];
  /** 展示顺序（升序）。 */
  order?: number;
}

export function loadTeamConfig(): TeamConfig {
  const v = readJson<TeamConfig>(CONFIG, {});
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

export function saveTeamConfig(patch: Partial<TeamConfig>): TeamConfig {
  const next = { ...loadTeamConfig(), ...patch };
  Object.assign(next, historyPolicy(next));
  writeJson(CONFIG, next);
  return next;
}

// ── 部门（组织架构）CRUD：存在 config.departments 里 ──────────────────────
export function loadDepartments(): Department[] {
  const d = loadTeamConfig().departments;
  return Array.isArray(d) ? d : [];
}
/** 规整：成员去重、负责人若不在成员里则并入、负责人不存在则清空 headId。 */
function normalizeDept(d: Department): Department {
  const members = Array.from(new Set((d.memberIds || []).filter(Boolean)));
  let headId = d.headId;
  if (headId && !members.includes(headId)) members.unshift(headId);
  if (headId && !members.includes(headId)) headId = undefined;
  return { ...d, memberIds: members, headId };
}
export function createDepartment(input: { name: string; headId?: string; memberIds?: string[] }): Department {
  const list = loadDepartments();
  const dept = normalizeDept({
    id: "dept-" + Math.random().toString(36).slice(2, 8),
    name: (input.name || "").trim() || tr("ui.app.new.department.30a5a9e"),
    headId: input.headId || undefined,
    memberIds: input.memberIds || [],
    order: list.length,
  });
  // 一名员工最多归一个部门：把新部门成员从其它部门里移除，避免重复归属。
  const cleaned = list.map((d) => ({ ...d, memberIds: d.memberIds.filter((m) => !dept.memberIds.includes(m)) }));
  saveTeamConfig({ departments: [...cleaned, dept] });
  return dept;
}
export function updateDepartment(id: string, patch: Partial<Omit<Department, "id">>): Department[] {
  let list = loadDepartments();
  const target = list.find((d) => d.id === id);
  if (!target) return list;
  const merged = normalizeDept({ ...target, ...patch, id });
  // 成员互斥：该部门新成员从别的部门移除。
  list = list.map((d) => (d.id === id ? merged : { ...d, memberIds: d.memberIds.filter((m) => !merged.memberIds.includes(m)) }));
  saveTeamConfig({ departments: list });
  return list;
}
export function removeDepartment(id: string): Department[] {
  const list = loadDepartments().filter((d) => d.id !== id);
  saveTeamConfig({ departments: list });
  return list;
}

// ── 定时任务 ──────────────────────────────────────────────
export function loadSchedules(): ScheduledTask[] {
  const v = readJson<ScheduledTask[]>(SCHEDULES, []);
  return Array.isArray(v) ? v : [];
}
export function saveSchedules(list: ScheduledTask[]) { writeJson(SCHEDULES, list); }

/** 间隔类任务的最小间隔(分钟)：防手滑设成每几秒把额度烧穿。 */
export const MIN_INTERVAL_MINUTES = 1;

/** 计算下次触发时间(ms，本机时区)。fromMs=起算时刻。 */
export function computeNextRun(trigger: ScheduleTrigger, fromMs: number): number {
  if (trigger.kind === "interval") {
    const step = Math.max(MIN_INTERVAL_MINUTES, Math.floor(trigger.everyMinutes || 0)) * 60000;
    return fromMs + step;
  }
  const at = new Date(fromMs);
  at.setHours(trigger.hour || 0, trigger.minute || 0, 0, 0);
  if (trigger.kind === "daily") {
    if (at.getTime() <= fromMs) at.setDate(at.getDate() + 1);
    return at.getTime();
  }
  if (trigger.kind === "weekly") {
    const delta = ((trigger.weekday || 0) - at.getDay() + 7) % 7;
    at.setDate(at.getDate() + delta);
    if (at.getTime() <= fromMs) at.setDate(at.getDate() + 7);
    return at.getTime();
  }
  // monthly：该月没有该号(如 31)就落到月末
  const setToMonthDay = (d: Date, day: number) => {
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(Math.max(1, day), last));
    d.setHours(trigger.hour || 0, trigger.minute || 0, 0, 0);
  };
  setToMonthDay(at, trigger.day || 1);
  if (at.getTime() <= fromMs) { at.setMonth(at.getMonth() + 1, 1); setToMonthDay(at, trigger.day || 1); }
  return at.getTime();
}

export function addSchedule(t: Omit<ScheduledTask, "id" | "createdAt" | "nextRunAt">): ScheduledTask {
  const list = loadSchedules();
  const now = Date.now();
  const task: ScheduledTask = {
    ...t,
    id: "sch-" + now.toString(36) + "-" + Math.floor(Math.random() * 1e4).toString(36),
    createdAt: now,
    nextRunAt: computeNextRun(t.trigger, now),
  };
  list.push(task);
  saveSchedules(list);
  return task;
}

export function updateSchedule(id: string, patch: Partial<ScheduledTask>): ScheduledTask[] {
  const list = loadSchedules().map((s) => {
    if (s.id !== id) return s;
    const next = { ...s, ...patch, id: s.id, createdAt: s.createdAt };
    if (patch.trigger) next.nextRunAt = computeNextRun(patch.trigger, Date.now()); // 改了触发规则→重算下次
    return next;
  });
  saveSchedules(list);
  return list;
}

export function removeSchedule(id: string): ScheduledTask[] {
  const list = loadSchedules().filter((s) => s.id !== id);
  saveSchedules(list);
  return list;
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
    const emp = { ...e, fromApp: app.id };
    employees.push(emp);
    writePersonaFiles(emp); // 物化四件套 .md，供员工按路径自查
  }

  saveApps(apps);
  saveEmployees(employees);
  if (app.id === DEFAULT_TEAM_ID) ensureDefaultDepartments(employees);
  return { apps, employees };
}

function ensureDefaultDepartments(employees: Employee[]) {
  // Missing configuration means first initialization; [] means the user deliberately cleared it.
  if (loadTeamConfig().departments !== undefined) return;
  const departments = defaultDepartments(employees);
  if (departments) saveTeamConfig({ departments });
}

/**
 * 升级内置应用：已安装的内置应用，若其安装记录版本与目录最新版本不一致，就把目录里【新增的员工】补进来，
 * 并把安装记录的 name/desc/version/employees 刷成目录最新（卡片展示、卸载范围都据此）。
 * 关键：补员工时按 **id 和 name 双重去重**——用户若已有同名员工（如自己手搓的「小笨」），不会再塞一个重复的；
 * 已存在的员工绝不覆盖（保留用户对人格/模型的改动）。启动时跑一次（见 team/index.ts）。
 * @returns 实际新增的员工数；非内置/未安装/已是最新则返回 0。
 */
export function syncBuiltinApp(app: TeamApp): number {
  const apps = loadApps();
  const stored = apps.find((a) => a.id === app.id);
  if (!stored) return 0; // 没装过：不动（用户自己去应用中心装）
  if (app.id === DEFAULT_TEAM_ID) ensureDefaultDepartments(loadEmployees());
  if (stored.version === app.version) return 0; // 已是最新

  const employees = loadEmployees();
  const haveId = new Set(employees.map((e) => e.id));
  const haveName = new Set(employees.map((e) => e.name));
  let added = 0;
  for (const e of app.employees) {
    if (haveId.has(e.id) || haveName.has(e.name)) continue; // id 或 name 撞上就跳过，绝不塞重复
    const emp = { ...e, fromApp: app.id };
    employees.push(emp);
    writePersonaFiles(emp);
    haveId.add(e.id);
    haveName.add(e.name);
    added++;
  }
  // 安装记录刷成目录最新（名称/简介/版本/员工），好让卡片显示新定义、版本号对齐、下次不再重复同步。
  const nextApps = apps.map((a) => (a.id === app.id ? { ...a, name: app.name, desc: app.desc, version: app.version, employees: app.employees } : a));
  saveApps(nextApps);
  if (added) saveEmployees(employees);
  if (app.id === DEFAULT_TEAM_ID) ensureDefaultDepartments(employees);
  return added;
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
    writePersonaFiles(e); // 导入即物化四件套 .md
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
export function buildPersonaBlock(emp: Employee, en = false): string {
  const tr = (key: string, values = {}) => translate(key, values, en ? "en" : "zh");
  const parts = [tr("team.persona.identity", {text:emp.persona})];
  if (emp.soul?.trim()) parts.push(tr("team.persona.soul", {text:emp.soul.trim()}));
  if (emp.aboutUser?.trim()) parts.push(tr("team.persona.user", {text:emp.aboutUser.trim()}));
  if (emp.memory?.trim()) parts.push(tr("team.persona.memory", {text:emp.memory.trim()}));
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
  const tr = (key: string, values = {}) => translate(key, values, (en ? "en" : "zh"));
  const operational = cut >= 0 ? baseSys.slice(cut) : baseSys; // 兜底：切不到就整段带上(自定义提示词等)

  // A 方案：确保四件套已物化成 .md，并优先用文件内容(手改也生效)，回退 json 字段。
  ensurePersonaFiles(emp);
  const merged = localizeEmployee({ ...emp, ...readPersonaFiles(emp.id) } as Employee, (en ? "en" : "zh"));

  const title = merged.title ? (tr("ui.store.text.f2cfe6f", { v0: merged.title })) : "";
  const head = tr("ui.store.from.now.on.you.are.real.b863475", { p0: merged.name, p1: title, p2: merged.name, p3: merged.name });
  const memBlock = dyn ? (tr("ui.store.what.you.ve.remembered.your.own.95a9a9b", { p0: dyn })) : "";
  const scene = sceneBlock ? `\n\n${sceneBlock}` : "";

  // 档案文件路径 + 成长机制：告诉员工自己的文件在哪、可自查，并要求边干边把学到的记回记忆(自我成长)。
  const pDir = personaDir(emp.id);
  const memPath = employeeMemoryPath(emp.id);
  const growth = tr("ui.store.your.files.how.you.grow.your.584df77", { p0: pDir, p1: memPath });

  // 团队协作能力：明确告诉员工可用 dm_teammate 直接私信同事——覆盖 OpenClaw 老人格里
  // 「同事之间不能直接互相调用、得走 CEO 派单/外部命令」那类设定，否则模型不知道能用这工具。
  const collab = tr("ui.store.reaching.teammates.directly.two.tools.let.789f453");

  // 做事前先查 SOP 库：公司标准流程沉淀成了 SOP，别凭记忆自由发挥。
  const sop = tr("ui.store.check.the.sop.library.before.you.9b1117b");

  const runtimeIntro = tr("ui.store.tools.operating.rules.this.is.your.f6aa4be", { p0: merged.name });

  // 身份锁定：放在最末尾。模型对系统提示词结尾权重很高，用它把身份钉死，压过中间大段工具/运行环境描述。
  const endLock = tr("ui.store.identity.lock.final.overrides.everything.above.768828e", { p0: merged.name, p1: title, p2: merged.name, p3: merged.name });

  return `---\n\n${head}\n\n${buildPersonaBlock(merged, en)}${memBlock}${scene}${growth}${collab}${sop}${runtimeIntro}${operational}

${tr("ui.store.reply.in.english.unless.the.user.2736a52")}
${employeeRoster(loadEmployees(), (en ? "en" : "zh"))}${endLock}`;
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

// ── 人格四件套的真·文件（A 方案）──────────────────────────────
// 每个员工把身份/性格/关于老板/长期记忆物化成 4 个 .md，员工可 read_file 按路径自查、
// 用户也能用编辑器/版本管理直接改。json(employees.json)仍是写入入口，.md 是物化副本 +
// 读取时优先源：手改 .md 也会在下次建 Agent 时被拼进提示词。
const PERSONA_DIR = join(DIR, "persona");
/** 某员工人格文件所在目录：team/persona/<id>/ */
export function personaDir(id: string): string {
  return join(PERSONA_DIR, id);
}
// 字段 ↔ 文件名（对应 openclaw 命名，直观好认）
const PERSONA_FILES: [keyof Employee, string][] = [
  ["persona", "IDENTITY.md"],
  ["soul", "SOUL.md"],
  ["aboutUser", "USER.md"],
  ["memory", "MEMORY.md"],
];
/** 把员工的四件套写成 .md 文件（建/导入/改员工时调用，保持文件与 json 同步）。 */
export function writePersonaFiles(emp: Employee): void {
  const d = personaDir(emp.id);
  try {
    mkdirSync(d, { recursive: true });
    for (const [k, fname] of PERSONA_FILES) {
      writeFileSync(join(d, fname), String((emp[k] as string | undefined) ?? ""));
    }
  } catch {
    /* 物化失败不致命：拼提示词会回退到 json 字段 */
  }
}
/** 读回四件套 .md（读取时优先用它，手改文件也生效）。缺文件的字段不返回，由调用方回退 json。 */
export function readPersonaFiles(id: string): Partial<Pick<Employee, "persona" | "soul" | "aboutUser" | "memory">> {
  const d = personaDir(id);
  const out: Record<string, string> = {};
  for (const [k, fname] of PERSONA_FILES) {
    try {
      const t = readFileSync(join(d, fname), "utf8");
      if (t.trim()) out[k as string] = t;
    } catch {
      /* 缺文件=用 json 回退 */
    }
  }
  return out as Partial<Pick<Employee, "persona" | "soul" | "aboutUser" | "memory">>;
}
/** 首次使用某员工时若还没物化过，就从 json 落一次盘（迁移老员工，保证文件存在可被自查）。 */
export function ensurePersonaFiles(emp: Employee): void {
  if (!existsSync(personaDir(emp.id))) writePersonaFiles(emp);
}
/** 删员工时连带清掉他的人格文件目录。 */
function removePersonaFiles(id: string): void {
  try { rmSync(personaDir(id), { recursive: true, force: true }); } catch { /* ignore */ }
}

/** 通讯录手动排序：按传入的 id 顺序给每个员工写 order=下标；不在列表里的保持原样(排后面)。 */
export function reorderEmployees(orderedIds: string[]): Employee[] {
  const pos = new Map(orderedIds.map((id, i) => [id, i]));
  const list = loadEmployees().map((e) => (pos.has(e.id) ? { ...e, order: pos.get(e.id) } : e));
  saveEmployees(list);
  return list;
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
  // 人格字段被改过就重新物化 .md，保持文件与 json 同步
  const touched = ["persona", "soul", "aboutUser", "memory", "name", "title"].some((k) => k in patch);
  if (touched) { const e = list.find((x) => x.id === id); if (e) writePersonaFiles(e); }
  return list;
}

/** 删除单个员工（用户手动删，不连带卸载应用） */
export function removeEmployee(id: string): Employee[] {
  const list = loadEmployees().filter((e) => e.id !== id);
  saveEmployees(list);
  removePersonaFiles(id); // 连带清掉他的人格文件目录
  return list;
}

/**
 * 抹掉整个模块的数据（用户在设置里关掉模块并选择「同时清除数据」时用）。
 * 可插拔的最后一环：关掉开关 + 删目录 = 完全恢复到没装过的状态。
 */
export function purge() {
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
}
