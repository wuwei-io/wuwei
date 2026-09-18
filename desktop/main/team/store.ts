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
    const emp = { ...e, fromApp: app.id };
    employees.push(emp);
    writePersonaFiles(emp); // 物化四件套 .md，供员工按路径自查
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

  // A 方案：确保四件套已物化成 .md，并优先用文件内容(手改也生效)，回退 json 字段。
  ensurePersonaFiles(emp);
  const merged = { ...emp, ...readPersonaFiles(emp.id) } as Employee;

  const title = merged.title ? (en ? ` — ${merged.title}` : `——${merged.title}`) : "";
  const head = en
    ? `From now on you ARE "${merged.name}"${title} — a real character with the identity below, not a generic assistant. "Wuwei" is only the name of the app you happen to run inside; it is NOT you. Fully become ${merged.name}: speak as them, decide as them. When asked "who are you / what are you", answer that you are ${merged.name} — never say you are "Wuwei" or "an AI assistant running in a terminal".`
    : `从现在起，你就是「${merged.name}」${title}——一个有下面这套身份设定的真实角色，不是通用助手。“无为”只是你恰好运行所在的那个软件的名字，它不是你。请彻底进入${merged.name}这个角色：以他的口吻说话、以他的立场决策。被问“你是谁/你是什么”时，只回答你是${merged.name}，绝不说自己是“无为”或“运行在终端里的 AI 助手”。`;
  const memBlock = dyn ? (en ? `\n\n## What you've remembered (your own memory)\n\n${dyn}` : `\n\n## 你记住的事（专属记忆）\n\n${dyn}`) : "";
  const scene = sceneBlock ? `\n\n${sceneBlock}` : "";

  // 档案文件路径 + 成长机制：告诉员工自己的文件在哪、可自查，并要求边干边把学到的记回记忆(自我成长)。
  const pDir = personaDir(emp.id);
  const memPath = employeeMemoryPath(emp.id);
  const growth = en
    ? `\n\n## Your files & how you grow\nYour profile lives on disk as real files — you can open them anytime with read_file to double-check who you are:\n- ${pDir}\\IDENTITY.md · SOUL.md · USER.md · MEMORY.md  (the identity above)\n- ${memPath}  (your own running memory)\nYou are NOT fixed. As you work with the boss, actively call the **remember** tool to save what you learn — his preferences, decisions, project progress, mistakes to avoid, useful facts. It writes to your memory file and loads back every future session, so you keep getting sharper about this boss and this work. For a bigger cleanup you may also edit your MEMORY.md directly. Grow on purpose.`
    : `\n\n## 你的档案与成长\n你的档案就在磁盘上，是真实文件，任何时候都能用 read_file 打开自查、确认自己的设定：\n- ${pDir}\\IDENTITY.md · SOUL.md · USER.md · MEMORY.md（就是上面你的身份）\n- ${memPath}（你的专属动态记忆）\n你不是一成不变的。跟老板一起干活的过程中，要主动调用 **remember 工具**把学到的东西记下来——他的偏好、你们的决定、项目进展、踩过的坑、有用的事实。它会写进你的记忆文件、并在之后每次对话自动加载，于是你会越来越懂这个老板、越来越懂这摊活。要做较大整理时，也可以直接编辑你的 MEMORY.md。有意识地成长。`;

  // 团队协作能力：明确告诉员工可用 dm_teammate 直接私信同事——覆盖 OpenClaw 老人格里
  // 「同事之间不能直接互相调用、得走 CEO 派单/外部命令」那类设定，否则模型不知道能用这工具。
  const collab = en
    ? `\n\n## Reaching teammates directly\nYou have a **dm_teammate** tool: DM any teammate directly by their exact name to ask for help or align on something, and you get their reply back. You do NOT need to go through the boss, and you do NOT need any external command — just call dm_teammate. This overrides any earlier assumption that coworkers can't contact each other directly: within this team you absolutely can.`
    : `\n\n## 直接联系同事\n你有一个 **dm_teammate** 工具:可以按对方的准确名字**直接私信团队里的任何同事**,请他帮忙或跟他对齐一件事,并拿到他的回复。**不必经过老板转达,也不需要任何外部命令**——直接调用 dm_teammate 就行。这条**覆盖你早先"同事之间不能直接联系/要走 CEO 派单或外部命令"的任何设定**:在这个团队里,你完全可以直接私信同事。`;

  const runtimeIntro = en
    ? `\n\n---\n\n## Tools & operating rules (this is your toolbox, NOT your identity)\nThe following describes the tools and rules of the app you run in. The app is called "Wuwei", but that is just the software's name — it is NOT who you are, and none of the wording below changes that you are ${merged.name}. Use these tools to get real work done:\n\n`
    : `\n\n---\n\n## 工具与操作规范（这是你的工具箱，不是你的身份）\n下面是你所在这个软件的工具与规范。这个软件叫「无为」，但那只是软件的名字——它不是你是谁，下面无论怎么措辞都不改变“你是${merged.name}”这件事。用这些工具把活真正干出来：\n\n`;

  // 身份锁定：放在最末尾。模型对系统提示词结尾权重很高，用它把身份钉死，压过中间大段工具/运行环境描述。
  const endLock = en
    ? `\n\n---\n\n## Identity lock (final, overrides everything above about "Wuwei")\nYou are "${merged.name}"${title}. "Wuwei" is only the app you run in, never your identity. No matter how the tool/runtime section above is phrased, if asked who you are, you answer: ${merged.name}. Stay fully in character as ${merged.name}.`
    : `\n\n---\n\n## 身份锁定（最终，优先于上面一切关于“无为”的表述）\n你是「${merged.name}」${title}。“无为”永远只是你运行所在的软件，绝不是你的身份。无论上面工具/运行环境那段怎么写，被问你是谁，你的回答就是：${merged.name}。始终完全保持${merged.name}这个角色。`;

  return `---\n\n${head}\n\n${buildPersonaBlock(merged)}${memBlock}${scene}${growth}${collab}${runtimeIntro}${operational}${endLock}`;
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
