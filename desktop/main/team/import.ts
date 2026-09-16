// AI 员工团队 · 从外部导入员工
//
// 目前支持 openclaw：它把每个 agent 的人格写在 workspaces/<id>/IDENTITY.md，格式很规整
// （- **Name:** / - **Creature:** / - **Vibe:** + 职责/擅长/不做 几段），
// 所以这里用机械解析而不是喂给 AI——确定性高、不花钱、不联网、秒出结果。
//
// ⚠️ 不需要 openclaw 在运行，也不需要装 WSL 命令行：直接读文件即可。
//    Windows 上通过 \\wsl.localhost\<发行版>\home\<用户>\.openclaw\ 就能读到 WSL 里的文件（实测可行）。

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Employee } from "../../../src/team/types.js";

/** 一个可导入的员工候选（扫描结果，用户勾选后才真正导入） */
export type ImportCandidate = {
  sourceId: string; // openclaw 里的 agent id，如 xiaowen
  name: string;
  title?: string;
  blurb?: string;
  icon?: string;
  bytes: number;
};

export type ImportSource = {
  kind: "openclaw";
  /** 人格文件所在目录，展示给用户看清楚从哪导的 */
  path: string;
  candidates: ImportCandidate[];
};

/** openclaw 的 emoji → 无为内置线性图标。VI 规范要求图标一律手写 SVG，不用 emoji。 */
const EMOJI_ICON: Record<string, string> = {
  "✍️": "pen",
  "💻": "code",
  "📊": "chart",
  "🎨": "palette",
  "🧠": "brain",
  "💰": "coin",
  "🔮": "crystal",
  "🛟": "ring",
  "🌱": "sprout",
  "🌿": "sprout",
};

function field(md: string, key: string): string {
  const m = new RegExp(`^-\\s*\\*\\*${key}:\\*\\*\\s*(.+)$`, "im").exec(md);
  return m ? m[1].trim() : "";
}

/**
 * 解析一份 IDENTITY.md。
 * 姓名 "小文 (Xiao Wen)" 取中文部分；职位 "AI 文案专员 — 一人公司…" 取破折号前并去掉 AI 前缀。
 */
export function parseIdentity(md: string): { name: string; title?: string; blurb?: string; icon?: string; persona: string } {
  const rawName = field(md, "Name");
  const name = (rawName.replace(/\s*[（(].*?[)）]\s*/g, "").trim() || rawName).trim();

  const creature = field(md, "Creature");
  const title = creature
    .split(/[—–-]/)[0]
    .replace(/^AI\s*/i, "")
    .trim() || undefined;

  const vibe = field(md, "Vibe");
  const blurb = vibe ? vibe.split(/[；;。]/)[0].trim().slice(0, 24) : undefined;

  const icon = EMOJI_ICON[field(md, "Emoji")] || undefined;

  // persona = 正文，但去掉两类无用内容：顶部文件标题、底部 Related 链接段（那是 openclaw 内部文件互链）
  const persona = md
    .replace(/^#\s*IDENTITY\.md.*$/im, "")
    .replace(/^##\s*Related[\s\S]*$/im, "")
    .trim();

  return { name, title, blurb, icon, persona };
}

/**
 * 清洗 openclaw 的 SOUL/USER/MEMORY.md：去掉顶部文件标题、斜体模板引导语、内部 Related 互链，
 * 留下真正有内容的正文。全是模板占位（没被填过）则返回空串，导入时就不带这个字段。
 */
function cleanDoc(md: string): string {
  const body = md
    .replace(/^#\s.*$/im, "") // 顶部 # 标题
    .replace(/^_.*_\s*$/gim, "") // 整行斜体引导语（_Learn about..._ / _You're not..._）
    .replace(/^.*\]\(\/concepts\/.*$/gim, "") // 含 openclaw 文档站链接的整行（含前置引导语，如 "Want a sharper version? See [...](/concepts/soul)"）
    .replace(/^##\s*Related[\s\S]*$/im, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // 只剩空模板骨架（如一串 "- **Name:**" 没填值）则视为无内容
  const meaningful = body.replace(/^-\s*\*\*[^:]+:\*\*\s*$/gim, "").replace(/[#>*_\-\s]/g, "");
  return meaningful.length >= 8 ? body : "";
}

/** 读同目录下某个文件并清洗，不存在/读失败/无内容都返回 undefined */
function readDoc(dir: string, name: string): string | undefined {
  const f = join(dir, name);
  if (!existsSync(f)) return undefined;
  try {
    const c = cleanDoc(readFileSync(f, "utf8"));
    return c || undefined;
  } catch {
    return undefined;
  }
}

/**
 * 拿本机的 WSL 发行版名。
 * ⚠️ 不能用 readdirSync("\\\\wsl.localhost") 枚举——Windows 不允许列举这个虚拟根（ENOENT），
 *    但只要知道发行版名，完整路径就能正常读（实测 \\wsl.localhost\Ubuntu\home\... 可列举）。
 * ⚠️ wsl.exe -l -q 的输出是 UTF-16LE，按 utf8 读会得到每个字符间夹 \0 的乱码。
 */
function wslDistros(): string[] {
  if (process.platform !== "win32") return [];
  try {
    const buf = execFileSync("wsl.exe", ["-l", "-q"], { timeout: 5000, windowsHide: true });
    return buf
      .toString("utf16le")
      .split(/\r?\n/)
      .map((s) => s.replace(/\0/g, "").trim())
      .filter(Boolean);
  } catch {
    return []; // 没装 WSL / 调用失败：静默跳过，不影响其它来源
  }
}

/** Windows 下列出 WSL 里可能的 openclaw 目录（发行版与用户名都不写死） */
function wslOpenclawDirs(): string[] {
  const out: string[] = [];
  for (const d of wslDistros()) {
    const home = join("\\\\wsl.localhost", d, "home");
    let users: string[] = [];
    try {
      users = readdirSync(home);
    } catch {
      continue;
    }
    for (const u of users) out.push(join(home, u, ".openclaw"));
  }
  return out;
}

function scanOpenclawDir(base: string): ImportSource | null {
  const ws = join(base, "workspaces");
  if (!existsSync(ws)) return null;
  let ids: string[] = [];
  try {
    ids = readdirSync(ws).filter((d) => {
      try {
        return statSync(join(ws, d)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return null;
  }

  const candidates: ImportCandidate[] = [];

  // ⭐ main/CEO（小笨）用根级的 workspace(单数)，不在 workspaces(复数)子目录里——
  //    之前只扫复数目录，把第一个建的 CEO 漏了。先把它作为 sourceId="main" 排在最前。
  const mainDir = join(base, "workspace");
  const mainIdentity = join(mainDir, "IDENTITY.md");
  if (existsSync(mainIdentity)) {
    try {
      const md = readFileSync(mainIdentity, "utf8");
      const p = parseIdentity(md);
      if (p.name) candidates.push({ sourceId: "main", name: p.name, title: p.title, blurb: p.blurb, icon: p.icon, bytes: md.length });
    } catch {
      /* 读不了就跳过 main，不影响其它 */
    }
  }

  for (const id of ids) {
    const f = join(ws, id, "IDENTITY.md");
    if (!existsSync(f)) continue; // 没有人格文件的跳过，不硬凑
    let md = "";
    try {
      md = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    const p = parseIdentity(md);
    if (!p.name) continue;
    candidates.push({ sourceId: id, name: p.name, title: p.title, blurb: p.blurb, icon: p.icon, bytes: md.length });
  }
  return candidates.length ? { kind: "openclaw", path: ws, candidates } : null;
}

/** 探测本机所有可导入的来源。没有就返回空数组，UI 据此隐藏整个导入区。 */
export function detectSources(): ImportSource[] {
  const bases = [join(homedir(), ".openclaw"), ...wslOpenclawDirs()];
  const found: ImportSource[] = [];
  const seen = new Set<string>();
  for (const b of bases) {
    const s = scanOpenclawDir(b);
    if (!s) continue;
    const key = s.candidates.map((c) => c.sourceId).sort().join(","); // 同一份文件被两个前缀读到，只留一次
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(s);
  }
  return found;
}

/**
 * 真正导入：把选中的候选读成 Employee。
 * 刻意不带模型——openclaw 的模型 id（kimi/k3、anthropic/claude-opus-4-8）与无为的
 * providerId + model 两级结构对不上，硬映射容易错且用户未必有对应平台。
 * 留空即"跟随当前会话模型"，用户在无为里自己给每个员工挑更省心。
 */
export function importFrom(sourcePath: string, ids: string[]): Employee[] {
  const out: Employee[] = [];
  for (const id of ids) {
    // sourcePath 指向 workspaces(复数)；main/CEO 在其兄弟目录 workspace(单数)里。
    const dir = id === "main" ? join(sourcePath, "..", "workspace") : join(sourcePath, id);
    const f = join(dir, "IDENTITY.md");
    if (!existsSync(f)) continue;
    let md = "";
    try {
      md = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    const p = parseIdentity(md);
    if (!p.name || !p.persona) continue;
    out.push({
      id: `oc-${id}`, // 加前缀，避免与内置员工或用户自建的撞 id
      name: p.name,
      title: p.title,
      blurb: p.blurb,
      icon: p.icon,
      persona: p.persona,
      // ⭐ 完整搬运 openclaw 的员工定义：灵魂/性格、关于老板、长期记忆一并带过来，
      //    聊天时这几段会拼进系统提示词，让员工据此了解上下文、约束行为、知道自己擅长啥。
      soul: readDoc(dir, "SOUL.md"),
      aboutUser: readDoc(dir, "USER.md"),
      memory: readDoc(dir, "MEMORY.md"),
      fromApp: "import:openclaw",
    });
  }
  return out;
}
