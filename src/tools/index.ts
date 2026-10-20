import { tr, getCurrentLanguage } from "../localization/index.js";
import {platformImageTool} from './platform-imagegen.js';
// 工具集：每个工具 = JSON Schema（给模型）+ 本地执行函数。
// P1 版：Read / Write / Edit / Bash / Glob / Grep —— 覆盖"读代码、改文件、跑命令、搜索"。
import { promises as fs, existsSync } from "node:fs";
import { resolve, isAbsolute, join, dirname } from "node:path";
import { homedir } from "node:os";
import { exec, execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { CHROME_TOOLS } from "./browser.js";
import { COMPUTER_TOOLS } from "./computer.js";
import { codexImageTool } from "./codex-imagegen.js";
import * as brain from "../brain/index.js";

// 全局记忆文件：跨会话持久，注入到每次对话的系统提示词
export const MEMORY_FILE = join(homedir(), ".wuwei", "memory.md");

const pexec = promisify(exec);
const pexecFile = promisify(execFile);

// 工具结果文案跟随界面语言（WUWEI_LANG 由桌面端设置写入环境变量；CLI 同样可用）。
// ⚠️ 必须在调用时求值：绝不能把 tt(...) 的结果放进模块顶层常量，否则加载那一刻语言就被焊死，切换语言不生效。


// 跨平台 shell 解析：POSIX 用 /bin/bash；Windows 优先 Git Bash（自带 grep/head/find，能原样兼容工具的 bash 语法与管道）。
// ⚠️ 绝不能用 System32\bash.exe（那是 WSL，Windows 路径映射会乱、cwd 也不对），故从 PATH 上的 git 反推 Git 根目录定位。
let _shellCache: string | undefined;
function resolveShell(): string {
  if (_shellCache) return _shellCache;
  if (process.platform !== "win32") {
    _shellCache = process.env.SHELL || "/bin/bash";
    return _shellCache;
  }
  _shellCache = findWinBash() || process.env.ComSpec || "cmd.exe"; // 兜底 cmd（bash 语法/grep 管道将不可用，仅避免 ENOENT）
  return _shellCache;
}
// Git 根下 bash 有两处：<root>\bin\bash.exe、<root>\usr\bin\bash.exe。返回存在的那个。
function bashUnder(root: string): string | undefined {
  for (const p of [join(root, "bin", "bash.exe"), join(root, "usr", "bin", "bash.exe")]) {
    try { if (existsSync(p)) return p; } catch {}
  }
  return undefined;
}
function findWinBash(): string | undefined {
  const ov = process.env.WUWEI_SHELL; // 显式覆盖（用户可指定自己的 bash.exe）
  if (ov && existsSync(ov)) return ov;
  // 1) 从 git 可执行反推 Git 根（git.exe 可能在 <root>\cmd\ 或 <root>\mingw64\bin\ 下，故向上逐级找）
  try {
    const line = execFileSync("where", ["git"], { encoding: "utf8" }).split(/\r?\n/)[0]?.trim();
    if (line) {
      let dir = dirname(line);
      for (let i = 0; i < 4; i++) {
        const b = bashUnder(dir);
        if (b) return b;
        const up = dirname(dir);
        if (up === dir) break;
        dir = up;
      }
    }
  } catch {}
  // 2) 常见安装根
  const bases = [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs") : undefined,
  ].filter(Boolean) as string[];
  for (const base of bases) {
    const b = bashUnder(join(base, "Git"));
    if (b) return b;
  }
  // 3) where bash，仅取 Git 目录下的（排除 System32/WSL）
  try {
    const cand = execFileSync("where", ["bash"], { encoding: "utf8" })
      .split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
      .find((l) => /\\Git\\/i.test(l) && !/System32/i.test(l));
    if (cand && existsSync(cand)) return cand;
  } catch {}
  return undefined;
}

// 解析 PowerShell 可执行：优先 pwsh(PowerShell 7)，回退 Windows 自带 powershell.exe。
let _psCache: string | undefined | null;
function resolvePowerShell(): string | undefined {
  if (_psCache !== undefined) return _psCache ?? undefined;
  for (const exe of ["pwsh", "powershell"]) {
    try {
      const line = execFileSync("where", [exe], { encoding: "utf8" }).split(/\r?\n/)[0]?.trim();
      if (line && existsSync(line)) { _psCache = line; return line; }
    } catch {}
  }
  // where 找不到就用系统默认路径兜底
  const sys = process.env.SystemRoot || "C:\\Windows";
  const fallback = join(sys, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  _psCache = existsSync(fallback) ? fallback : null;
  return _psCache ?? undefined;
}

function abs(ctx: ToolContext, p: string): string {
  return isAbsolute(p) ? p : resolve(ctx.cwd, p);
}

// ---- Read ----
const readTool: Tool = {
  name: "read_file",
  get description() { return tr("tool.description.read_file"); },
  readOnly: true,
  get inputSchema() { return {
    type: "object",
    properties: {
      path: { type: "string", description: tr("tool.parameter.read_file.path") },
      offset: { type: "number", description: tr("tool.parameter.read_file.offset") },
      limit: { type: "number", description: tr("tool.parameter.read_file.limit") },
    },
    required: ["path"],
  }; },
  async run(input, ctx): Promise<ToolResult> {
    try {
      const raw = await fs.readFile(abs(ctx, String(input.path)), "utf8");
      const lines = raw.split("\n");
      const offset = Math.max(1, Number(input.offset ?? 1));
      const limit = Number(input.limit ?? 2000);
      const slice = lines.slice(offset - 1, offset - 1 + limit);
      const body = slice
        .map((l, i) => `${String(offset + i).padStart(6)}\t${l}`)
        .join("\n");
      // 空文件的兜底要看 raw：""  split 出的是 [""]，加完行号变成 "     1\t"，body 并不为空，
      // 原来的 `body ||` 永远命中不了，空文件一直显示成一个孤零零的行号。
      return { content: raw === "" || !body ? tr("ui.index.empty.file.627c9ab") : body };
    } catch (e: any) {
      return { content: tr("ui.index.read.failed.b9c5f8d", { p0: e.message }), isError: true };
    }
  },
};

// ---- Write ----
const writeTool: Tool = {
  name: "write_file",
  get description() { return tr("tool.description.write_file"); },
  readOnly: false,
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      content: { type: "string" },
    },
    required: ["path", "content"],
  },
  async run(input, ctx): Promise<ToolResult> {
    try {
      const target = abs(ctx, String(input.path));
      await fs.mkdir(resolve(target, ".."), { recursive: true });
      await fs.writeFile(target, String(input.content), "utf8");
      return { content: tr("ui.index.wrote.c98fa27", { p0: target }) };
    } catch (e: any) {
      return { content: tr("ui.index.write.failed.66f9135", { p0: e.message }), isError: true };
    }
  },
};

// ---- Edit（精确字符串替换）----
const editTool: Tool = {
  name: "edit_file",
  get description() { return tr("tool.description.edit_file"); },
  readOnly: false,
  get inputSchema() { return {
    type: "object",
    properties: {
      path: { type: "string" },
      old_string: { type: "string" },
      new_string: { type: "string" },
      replace_all: { type: "boolean", description: tr("tool.parameter.edit_file.replace_all") },
    },
    required: ["path", "old_string", "new_string"],
  }; },
  async run(input, ctx): Promise<ToolResult> {
    try {
      const target = abs(ctx, String(input.path));
      const raw = await fs.readFile(target, "utf8");
      const oldStr = String(input.old_string);
      const newStr = String(input.new_string);
      const count = raw.split(oldStr).length - 1;
      if (count === 0)
        return { content: tr("ui.index.old.string.not.found.no.changes.ba1991c"), isError: true };
      if (count > 1 && !input.replace_all)
        return {
          content: tr("ui.index.old.string.occurs.times.not.unique.1c1e57b", { p0: count }),
          isError: true,
        };
      const next = input.replace_all
        ? raw.split(oldStr).join(newStr)
        : raw.replace(oldStr, newStr);
      await fs.writeFile(target, next, "utf8");
      const n = input.replace_all ? count : 1;
      return { content: tr("ui.index.edited.replacement.900b494", { p0: target, p1: n }) };
    } catch (e: any) {
      return { content: tr("ui.index.edit.failed.e6686a7", { p0: e.message }), isError: true };
    }
  },
};

// ---- Bash ----
const bashTool: Tool = {
  name: "bash",
  get description() { return tr("tool.description.bash"); },
  readOnly: false,
  get inputSchema() { return {
    type: "object",
    properties: {
      command: { type: "string" },
      timeout_ms: { type: "number", description: tr("tool.parameter.bash.timeout_ms") },
    },
    required: ["command"],
  }; },
  async run(input, ctx): Promise<ToolResult> {
    try {
      const { stdout, stderr } = await pexec(String(input.command), {
        cwd: ctx.cwd,
        timeout: Number(input.timeout_ms ?? 120000),
        maxBuffer: 10 * 1024 * 1024,
        shell: resolveShell(),
        signal: ctx.signal, // 用户停止→杀子进程,别再干等超时
        // 本地密钥以环境变量注入子进程：模型只写 $OPENAI_API_KEY 即可，全程不接触明文
        env: ctx.env ? { ...process.env, ...ctx.env } : process.env,
      });
      const out = [stdout, stderr].filter(Boolean).join("\n").trim();
      return { content: out || tr("ui.mcp.no.output.5b6d486") };
    } catch (e: any) {
      const out = [e.stdout, e.stderr, e.message].filter(Boolean).join("\n").trim();
      return { content: out || tr("ui.index.command.failed.99fb353", { p0: e.message }), isError: true };
    }
  },
};

// ---- PowerShell（Windows 原生命令：建 junction/软链、注册表、服务、WMI 等）----
// Windows 上原生操作用 bash(Git Bash) 套 cmd 极易被引号/路径转换搞坏（mklink 卡死就是此坑）。
// 本工具直接调 PowerShell（成功率高），失败/不可用再回退 cmd.exe。非 Windows 直接回退 bash。
const powershellTool: Tool = {
  name: "powershell",
  get description() { return tr("tool.description.powershell"); },
  readOnly: false,
  get inputSchema() { return {
    type: "object",
    properties: {
      command: { type: "string", description: tr("tool.parameter.powershell.command") },
      timeout_ms: { type: "number", description: tr("tool.parameter.powershell.timeout_ms") },
    },
    required: ["command"],
  }; },
  async run(input, ctx): Promise<ToolResult> {
    const command = String(input.command);
    const timeout = Number(input.timeout_ms ?? 120000);
    const baseOpts = {
      cwd: ctx.cwd,
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      signal: ctx.signal,
      env: ctx.env ? { ...process.env, ...ctx.env } : process.env,
      windowsHide: true,
    } as const;

    // 非 Windows：没有 PowerShell 场景，直接走 bash。
    if (process.platform !== "win32") {
      try {
        const { stdout, stderr } = await pexec(command, { ...baseOpts, shell: resolveShell() });
        const out = [stdout, stderr].filter(Boolean).join("\n").trim();
        return { content: out || tr("ui.mcp.no.output.5b6d486") };
      } catch (e: any) {
        const out = [e.stdout, e.stderr, e.message].filter(Boolean).join("\n").trim();
        return { content: out || tr("ui.index.command.failed.99fb353", { p0: e.message }), isError: true };
      }
    }

    // Windows：优先 PowerShell。
    const ps = resolvePowerShell();
    let psErr: any;
    if (ps) {
      try {
        const { stdout, stderr } = await pexecFile(
          ps,
          ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
          baseOpts,
        );
        const out = [stdout, stderr].filter(Boolean).join("\n").trim();
        return { content: out || tr("ui.mcp.no.output.5b6d486") };
      } catch (e: any) {
        // 被用户主动中止：直接抛，不做无谓回退。
        if (e?.name === "AbortError" || ctx.signal?.aborted) {
          return {
            content: [e.stdout, e.stderr, tr("ui.index.aborted.4b52e56")].filter(Boolean).join("\n").trim(),
            isError: true,
          };
        }
        psErr = e;
      }
    }

    // 回退 cmd.exe。
    try {
      const { stdout, stderr } = await pexecFile(
        process.env.ComSpec || "cmd.exe",
        ["/d", "/s", "/c", command],
        baseOpts,
      );
      const out = [stdout, stderr].filter(Boolean).join("\n").trim();
      const prefix = ps ? tr("ui.index.powershell.failed.fell.back.to.cmd.c0fb93c") : "";
      return { content: (prefix + (out || tr("ui.mcp.no.output.5b6d486"))).trim() };
    } catch (e: any) {
      const psDetail = psErr ? [psErr.stdout, psErr.stderr, psErr.message].filter(Boolean).join(" ") : "";
      const psPart = psErr ? tr("ui.index.powershell.failed.c6dbdee", { p0: psDetail }) : "";
      const cmdPart = [e.stdout, e.stderr, e.message].filter(Boolean).join("\n").trim();
      return { content: (psPart + tr("ui.index.cmd.also.failed.8723c80", { p0: cmdPart })).trim(), isError: true };
    }
  },
};

// ---- Glob（文件名匹配，借 bash+find/ripgrep 更稳，这里用简单 find）----
const globTool: Tool = {
  name: "glob",
  get description() { return tr("tool.description.glob"); },
  readOnly: true,
  get inputSchema() { return {
    type: "object",
    properties: {
      pattern: { type: "string" },
      path: { type: "string", description: tr("tool.parameter.glob.path") },
    },
    required: ["pattern"],
  }; },
  async run(input, ctx): Promise<ToolResult> {
    try {
      const root = input.path ? abs(ctx, String(input.path)) : ctx.cwd;
      const results: string[] = [];
      const pattern = String(input.pattern);
      await walk(root, results, 20000);
      const rx = globToRegExp(pattern);
      const matched = results
        .map((p) => p.slice(root.length + 1))
        .filter((rel) => rx.test(rel))
        .slice(0, 500);
      return { content: matched.join("\n") || tr("ui.index.no.matches.986b411") };
    } catch (e: any) {
      return { content: tr("ui.index.glob.failed.dde2162", { p0: e.message }), isError: true };
    }
  },
};

// ---- Grep（内容搜索，优先用系统 grep -r）----
const grepTool: Tool = {
  name: "grep",
  get description() { return tr("tool.description.grep"); },
  readOnly: true,
  get inputSchema() { return {
    type: "object",
    properties: {
      pattern: { type: "string" },
      path: { type: "string", description: tr("tool.parameter.grep.path") },
      glob: { type: "string", description: tr("tool.parameter.grep.glob") },
    },
    required: ["pattern"],
  }; },
  async run(input, ctx): Promise<ToolResult> {
    const target = input.path ? abs(ctx, String(input.path)) : ctx.cwd;
    const include = input.glob ? `--include='${String(input.glob)}'` : "";
    const cmd = `grep -rniE ${include} -- ${shellQuote(String(input.pattern))} ${shellQuote(target)} | head -200`;
    try {
      const { stdout } = await pexec(cmd, {
        cwd: ctx.cwd,
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024,
        shell: resolveShell(),
        signal: ctx.signal, // 用户停止→杀子进程
      });
      return { content: stdout.trim() || tr("set.brain.noHit") };
    } catch (e: any) {
      // grep 无命中返回码 1，不算错误
      if (e.code === 1 && !e.stderr) return { content: tr("set.brain.noHit") };
      return { content: e.stderr || tr("ui.index.grep.failed.1b8425b", { p0: e.message }), isError: true };
    }
  },
};

// ---- 辅助 ----
async function walk(dir: string, out: string[], cap: number): Promise<void> {
  if (out.length >= cap) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === ".git" || e.name === "node_modules") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) await walk(full, out, cap);
    else out.push(full);
    if (out.length >= cap) return;
  }
}

function globToRegExp(glob: string): RegExp {
  // 极简 glob → 正则：** 任意层级，* 单层，? 单字符
  let re = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, " ")
    .replace(/\*/g, "[^/]*")
    .replace(/ /g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${re}$`);
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

// ---- Remember（写入全局记忆，跨会话）----
// ---- ask_decision：遇到需用户选方向的岔路时，产出结构化决策（白话问句+2~3选项），阻塞等人回批 ----
// 与 requestPermission(危险工具拦截 allow/deny) 是两套判定点、并存；回批复用 perm-resp 三态。
// schema 强约束 + 运行期二次校验：permId 唯一、value 非空组内唯一且不占 allow/deny、options 1~3、high 时 timeoutSec 强制 null。
const askDecisionTool: Tool = {
  name: "ask_decision",
  get description() { return tr("tool.description.ask_decision"); },
  readOnly: true, // 不直接改本机，只发起一次人机决策交互
  get inputSchema() { return {
    type: "object",
    properties: {
      title: { type: "string", description: tr("tool.parameter.ask_decision.title") },
      question: { type: "string", description: tr("tool.parameter.ask_decision.question") },
      context: { type: "string", description: tr("tool.parameter.ask_decision.context") },
      risk: { type: "string", enum: ["high", "low"], description: tr("tool.parameter.ask_decision.risk") },
      options: {
        type: "array",
        minItems: 2,
        maxItems: 3,
        description: tr("tool.parameter.ask_decision.options"),
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: tr("tool.parameter.ask_decision.label") },
            desc: { type: "string", description: tr("tool.parameter.ask_decision.desc") },
            value: { type: "string", description: tr("tool.parameter.ask_decision.value") },
            recommended: { type: "boolean", description: tr("tool.parameter.ask_decision.recommended") },
            tone: { type: "string", enum: ["safe", "danger", "neutral"] },
          },
          required: ["label", "value"],
        },
      },
      allowCustom: { type: "boolean", description: tr("tool.parameter.ask_decision.allowCustom") },
      timeoutSec: { type: "number", description: tr("tool.parameter.ask_decision.timeoutSec") },
      rawDetail: { type: "string", description: tr("tool.parameter.ask_decision.rawDetail") },
    },
    required: ["title", "question", "risk", "options"],
  }; },
  async run(input, ctx): Promise<ToolResult> {
    if (!ctx.requestDecision)
      return {
        content: tr("ui.index.interactive.decision.is.not.available.in.df09a7e"),
        isError: true,
      };
    // ---- 运行期强校验（schema 之外的语义约束）----
    const title = String(input.title || "").trim();
    const question = String(input.question || "").trim();
    const risk = input.risk === "high" ? "high" : input.risk === "low" ? "low" : null;
    if (!title || !question)
      return { content: tr("ui.index.decision.missing.title.or.question.29e476e"), isError: true };
    if (!risk)
      return { content: tr("ui.index.risk.must.be.high.or.low.90d0ca8"), isError: true };
    const rawOpts = Array.isArray(input.options) ? input.options : [];
    if (rawOpts.length < 2 || rawOpts.length > 3)
      return { content: tr("ui.index.options.must.have.to.items.3f279d6"), isError: true };
    const seen = new Set<string>();
    const options: import("../types.js").DecisionOption[] = [];
    for (const o of rawOpts) {
      const oo = (o || {}) as Record<string, unknown>;
      const label = String(oo.label || "").trim();
      const value = String(oo.value || "").trim();
      if (!label || !value)
        return { content: tr("ui.index.each.option.needs.non.empty.label.6fbd398"), isError: true };
      if (value === "allow" || value === "deny")
        return { content: tr("ui.index.option.value.must.not.use.reserved.f17abfa", { p0: value }), isError: true };
      if (seen.has(value))
        return { content: tr("ui.index.duplicate.option.value.edf218a", { p0: value }), isError: true };
      seen.add(value);
      const opt: import("../types.js").DecisionOption = { label, value };
      if (oo.desc) opt.desc = String(oo.desc);
      if (oo.recommended === true) opt.recommended = true;
      if (oo.tone === "safe" || oo.tone === "danger" || oo.tone === "neutral") opt.tone = oo.tone;
      options.push(opt);
    }
    // high 决策强制不计时；low 才允许倒计时
    let timeoutSec: number | null = null;
    if (risk === "low" && typeof input.timeoutSec === "number" && input.timeoutSec > 0)
      timeoutSec = Math.round(input.timeoutSec);
    const permId = `dec-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const decision: import("../types.js").Decision = {
      permId,
      risk,
      title,
      question,
      context: input.context ? String(input.context) : undefined,
      options,
      allowCustom: input.allowCustom === true,
      timeoutSec,
      sourceSession: ctx.sessionId,
      rawDetail: input.rawDetail ? String(input.rawDetail) : undefined,
    };
    try {
      const resp = await ctx.requestDecision(decision);
      // 把三态回批翻成给模型的自然语言结果
      if (resp.action === "allow")
        return { content: tr("ui.index.user.chose.allow.24c3d77") };
      if (resp.action === "deny")
        return { content: tr("ui.index.user.chose.deny.stop.this.path.2f1f173") };
      // reply：带选项 value（业务分支 key）或自定义文本
      if (resp.value) {
        const picked = options.find((o) => o.value === resp.value);
        const lbl = picked ? picked.label : resp.value;
        return { content: tr("ui.index.user.picked.option.value.continue.accordingly.b83ef7a", { p0: lbl, p1: resp.value }) };
      }
      if (resp.text)
        return { content: tr("ui.index.user.replied.0b7d11d", { p0: resp.text }) };
      return { content: tr("ui.index.user.responded.with.empty.content.7ff9a85"), isError: true };
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (/abort|stop/i.test(msg))
        return { content: tr("ui.index.decision.aborted.user.stopped.28b6232"), isError: true };
      if (/timeout/i.test(msg))
        return { content: tr("ui.index.decision.timed.out.handled.by.default.48c0ae2"), isError: true };
      return { content: tr("ui.index.decision.channel.error.6d6a814", { p0: msg }), isError: true };
    }
  },
};

const rememberTool: Tool = {
  name: "remember",
  get description() { return tr("tool.description.remember"); },
  readOnly: true, // 只写 minicc 自己的记忆文件，安全，不需要权限确认
  get inputSchema() { return {
    type: "object",
    properties: {
      text: { type: "string", description: tr("tool.parameter.remember.text") },
    },
    required: ["text"],
  }; },
  async run(input, ctx): Promise<ToolResult> {
    try {
      const text = String(input.text || "").trim();
      if (!text)
        return { content: tr("ui.index.memory.text.is.empty.nothing.written.0823840"), isError: true };
      // 员工私聊会话 → 写到该员工专属记忆文件(ctx.memoryFile)；否则写全局 memory.md。
      const file = ctx.memoryFile || MEMORY_FILE;
      await fs.mkdir(dirname(file), { recursive: true });
      let cur = "";
      try {
        cur = await fs.readFile(file, "utf8");
      } catch {
        /* 首次 */
      }
      const line = "- " + text;
      const seedHeader = getCurrentLanguage() !== "zh" ? "# Memory" : "# 记忆";
      const next = cur.trim() ? cur.trimEnd() + "\n" + line + "\n" : seedHeader + "\n\n" + line + "\n";
      await fs.writeFile(file, next, "utf8");
      return { content: tr("ui.index.remembered.d1a5e38", { v0: text }) };
    } catch (e: any) {
      return { content: tr("ui.index.failed.to.save.memory.8178c9f", { p0: e.message }), isError: true };
    }
  },
};

// ---- 联网：web_search / web_fetch ----
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
// web_search 主力源 = 无为网关搜索代理(服务器端带自建 SearXNG 凭证转发，凭证不进客户端)。
// 走无为登录 token(主进程登录后写入 WUWEI_GW_TOKEN 环境变量)；未登录则此源跳过、回落到 Bing 等公开源。
const WUWEI_SEARCH_URL = "https://gw.wuweiai.io/api/gateway/v1/search";

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
// 解析 DuckDuckGo html 版结果页(无需 key)
// DuckDuckGo Lite 解析：html.duckduckgo.com 被反爬(202挑战页)后改用 lite.duckduckgo.com/lite/。
// 结构：<a ...class='result-link' href='...uddg=<编码真URL>'>标题</a> + <td class='result-snippet'>摘要</td>，各按序配对。
function parseLite(html: string): { title: string; url: string; snippet: string }[] {
  const items: { title: string; url: string }[] = [];
  const anchorRe = /<a\b([^>]*class=['"][^'"]*result-link[^'"]*['"][^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html))) {
    const hrefM = /href=['"]([^'"]+)['"]/.exec(m[1]);
    if (!hrefM) continue;
    let url = hrefM[1];
    const uddg = /[?&]uddg=([^&]+)/.exec(url);
    if (uddg) url = decodeURIComponent(uddg[1]);
    else if (url.startsWith("//")) url = "https:" + url;
    const title = stripTags(m[2]);
    if (!title || /duckduckgo\.com\/duckduckgo-help-pages/i.test(url)) continue; // 跳过广告的「more info」帮助页链接
    items.push({ url, title });
  }
  const snipRe = /<td\b[^>]*class=['"][^'"]*result-snippet[^'"]*['"][^>]*>([\s\S]*?)<\/td>/gi;
  const snips: string[] = [];
  let s: RegExpExecArray | null;
  while ((s = snipRe.exec(html))) snips.push(stripTags(s[1]));
  return items.map((it, i) => ({ ...it, snippet: snips[i] || "" }));
}

function parseDDG(html: string): { title: string; url: string; snippet: string }[] {
  const titleRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snipRe = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  const items: { title: string; url: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = titleRe.exec(html))) {
    let url = m[1];
    const uddg = /[?&]uddg=([^&]+)/.exec(url);
    if (uddg) url = decodeURIComponent(uddg[1]);
    else if (url.startsWith("//")) url = "https:" + url;
    items.push({ url, title: stripTags(m[2]) });
  }
  const snips: string[] = [];
  let s: RegExpExecArray | null;
  while ((s = snipRe.exec(html))) snips.push(stripTags(s[1]));
  return items.map((it, i) => ({ ...it, snippet: snips[i] || "" }));
}

// Bing 现在把真实 URL 包在 /ck/a?...&u=a1<base64url> 跳转链里，解出真链(否则拿到的全是 bing.com/ck/a 跳转)。
function decodeBingUrl(href: string): string {
  const h = href.replace(/&amp;/g, "&");
  const m = /[?&]u=a1([^&]+)/.exec(h);
  if (m) {
    try {
      const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
      const dec = Buffer.from(b64, "base64").toString("utf8");
      if (/^https?:\/\//i.test(dec)) return dec;
    } catch { /* ignore */ }
  }
  return h;
}
// 解析 Bing 结果页(无需 key)：每个 <li class="b_algo"> 一条，取 <h2 ...><a href> 标题/URL + 首个 <p> 摘要。
// ⚠️ Bing 改版：<h2> 带了 class 属性、URL 变成 /ck/a base64 跳转 → 旧正则(<h2> 无属性)恒解析为 0 条，
// 表现为「Bing 空」。故用 <h2[^>]*> 容属性 + decodeBingUrl 解跳转。
function parseBing(html: string): { title: string; url: string; snippet: string }[] {
  const out: { title: string; url: string; snippet: string }[] = [];
  const blockRe = /<li class="b_algo"[\s\S]*?(?=<li class="b_algo"|<\/ol>|$)/gi;
  let b: RegExpExecArray | null;
  while ((b = blockRe.exec(html))) {
    const block = b[0];
    const a = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (!a) continue;
    const url = decodeBingUrl(a[1]);
    if (!/^https?:\/\//i.test(url)) continue;
    const title = stripTags(a[2]);
    const p = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block);
    if (title) out.push({ url, title, snippet: p ? stripTags(p[1]) : "" });
  }
  return out;
}
// 解析 SearXNG 的 JSON 结果(?format=json)：元搜索聚合多引擎，独立于 DDG/Bing，返回稳定 JSON。
// 公共实例偶尔返回 HTML 挑战页 → JSON.parse 失败即当空，交给下一个源。
function parseSearxng(text: string): { title: string; url: string; snippet: string }[] {
  try {
    const j = JSON.parse(text);
    const arr = Array.isArray(j?.results) ? j.results : [];
    return arr
      .filter((r: any) => r && typeof r.url === "string" && /^https?:\/\//i.test(r.url) && r.title)
      .map((r: any) => ({ title: stripTags(String(r.title)), url: String(r.url), snippet: stripTags(String(r.content || "")) }));
  } catch {
    return [];
  }
}
// 退避 sleep：可被 ctx.signal 中断，避免用户点停后还在死等
function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("aborted"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(new Error("aborted")); }, { once: true });
  });
}
// 带指数退避的抓取：202挑战页/429限流/5xx 都当作可重试；默认 3 次(间隔 500ms→1000ms)
async function fetchTextRetry(url: string, ctx: any, tries = 3, extraHeaders?: Record<string, string>): Promise<string> {
  // 补全浏览器请求头：Bing/DDG 等反爬会对缺 Accept/Sec-* 的请求返回 202 挑战页，
  // 带上更像真实浏览器的头能显著降低被挑战概率(实测 curl 带同款头即得 200)。
  const isJson = /[?&]format=json\b/.test(url);
  const headers: Record<string, string> = {
    "User-Agent": UA,
    "Accept": isJson ? "application/json,text/plain,*/*" : "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": (getCurrentLanguage() === "zh" ? "zh-CN,zh;q=0.9,en;q=0.8" : "en-US,en;q=0.9"),
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Upgrade-Insecure-Requests": "1",
    ...(extraHeaders || {}), // 自建 SearXNG 等私有源的鉴权头(Authorization Basic)
  };
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    if (ctx?.signal?.aborted) throw new Error("aborted");
    try {
      const r = await fetch(url, { headers, signal: ctx?.signal });
      if (r.status === 202 || r.status === 429 || r.status >= 500) lastErr = new Error("HTTP " + r.status);
      else return await r.text();
    } catch (e: any) {
      lastErr = e;
      if (ctx?.signal?.aborted) throw e;
    }
    if (i < tries - 1) await sleepAbortable(500 * Math.pow(2, i), ctx?.signal);
  }
  throw lastErr || new Error("fetch failed");
}

// 结果相关性自检：挡住「HTTP 200 + 结构完整 + 内容与查询毫无关系」的反爬缓存页。
// 实测 2026-09-14：Bing 对我们的请求稳定返回这种页——搜"如何用 python 读取 csv"回复仇者联盟票房、
// 搜"Snapchat"回印地语翻译，10 条 b_algo 全能正常解析。源循环原本只看"解析出几条"就采信并 break，
// 于是垃圾直接喂给模型、后面真正可用的 SearXNG 根本没机会跑。光看 HTTP 状态发现不了。
// 判据放得很宽：查询里任一特征词在任一条结果的标题/摘要/URL 里出现即算相关，只拦完全不沾边的。
function looksRelevant(query: string, results: { title: string; url: string; snippet: string }[]): boolean {
  const q = query.toLowerCase();
  const toks = new Set<string>();
  for (const w of q.match(/[a-z0-9][a-z0-9.+#_-]{2,}/g) || []) toks.add(w); // 英文/数字词(≥3 字符)
  // 中文按 2-gram 拆：整词匹配太严("全脑启发架构"很难原样出现)，逐字又太松。
  for (const seg of query.match(/[一-龥]{2,}/g) || [])
    for (let i = 0; i + 2 <= seg.length; i++) toks.add(seg.slice(i, i + 2));
  if (!toks.size) return true; // 提不出特征词(纯符号/单字)就不拦，避免误杀
  const hay = results.map((r) => `${r.title} ${r.snippet} ${r.url}`).join(" ").toLowerCase();
  for (const t of toks) if (hay.includes(t)) return true;
  return false;
}

const webSearchTool: Tool = {
  name: "web_search",
  get description() { return tr("tool.description.web_search"); },
  readOnly: true,
  get inputSchema() { return {
    type: "object",
    properties: { query: { type: "string", description: tr("tool.parameter.web_search.query") } },
    required: ["query"],
  }; },
  async run(input, ctx): Promise<ToolResult> {
    try {
      const q = String(input.query || "").trim();
      if (!q) return { content: tr("ui.index.search.query.is.empty.c5bc0d7"), isError: true };
      const eq = encodeURIComponent(q);
      // 多个独立搜索源，逐个尝试(每个都带指数退避重试)，第一个拿到结果的胜出。
      // 顺序按「实测可达+稳定」排：Bing 命中率最高(补了浏览器头后 202 明显减少)；SearXNG 元搜索
      // 走 JSON、独立于 DDG/Bing，多个公共实例互为备份；DDG 部分网络连不上(返回 000)故垫底。
      const sx = (host: string) => `https://${host}/search?q=${eq}&format=json&language=` + getCurrentLanguage();
      const sources: { name: string; url: string; parse: (h: string) => { title: string; url: string; snippet: string }[]; headers?: Record<string, string> }[] = [];
      // 主力源：无为网关搜索代理(服务器端转发自建 SearXNG，聚合 Google/Bing/Brave)。仅登录用户有 token。
      // token 由主进程挂在 globalThis.wuweiGwToken()(永远最新)；CLI 等无此桥则回落 env。
      const tokFn = (globalThis as unknown as { wuweiGwToken?: () => string }).wuweiGwToken;
      const gwTok = (typeof tokFn === "function" ? tokFn() : (process.env.WUWEI_GW_TOKEN || "")).trim();
      if (gwTok && !gwTok.startsWith("anon-")) {
        sources.push({ name: "Wuwei-search", url: `${WUWEI_SEARCH_URL}?q=${eq}&format=json&language=` + getCurrentLanguage(), parse: parseSearxng, headers: { Authorization: "Bearer " + gwTok } });
      }
      // 兜底：公开源(未登录、或网关不可用时用)。
      // ⚠️ Bing 垫底：实测它会返回「200 + 结构完整 + 内容与查询无关」的反爬缓存页(见 looksRelevant)，
      // 比直接报错更坑——放最后，让真正能出结果的源先跑。
      sources.push(
        { name: "SearXNG", url: sx("searx.be"), parse: parseSearxng }, // 元搜索公共实例备份(偶尔限流)
        { name: "DuckDuckGo", url: "https://lite.duckduckgo.com/lite/?q=" + eq, parse: parseLite },
        { name: "DuckDuckGo-html", url: "https://html.duckduckgo.com/html/?q=" + eq, parse: parseDDG },
        { name: "Bing", url: "https://www.bing.com/search?q=" + eq + "&setlang=" + getCurrentLanguage(), parse: parseBing },
      );
      let results: { title: string; url: string; snippet: string }[] = [];
      const tried: string[] = [];
      for (const s of sources) {
        if (ctx.signal?.aborted) break;
        try {
          const raw = await fetchTextRetry(s.url, ctx, 3, s.headers);
          // 网关源鉴权失败(token 过期)会回 {"error":"invalid_token","results":[]}，parseSearxng 解出空数组，
          // 原来只会记成「空」，跟"这词没搜到"混为一谈 → 静默降级到公开源。这里单独点名，好定位。
          if (s.headers?.Authorization && /"error"\s*:\s*"(invalid_token|auth_required)"/.test(raw)) {
            tried.push(tr("ui.index.auth.expired.ccde558", { p0: s.name }));
            continue;
          }
          const r = s.parse(raw);
          if (r.length && !looksRelevant(q, r)) {
            // 拿到了结果但跟查询八竿子打不着 → 反爬缓存页，弃掉换下一个源，绝不喂给模型
            tried.push(tr("ui.index.irrelevant.results.1c6ca9a", { p0: s.name }));
            continue;
          }
          if (r.length) { results = r; break; }
          tried.push(tr("ui.index.empty.2ac3244", { p0: s.name }));
        } catch (e: any) {
          if (ctx.signal?.aborted) break;
          tried.push(`${s.name}(${e?.message || tr("ui.index.failed.28363f6")})`);
        }
      }
      results = results.slice(0, 8);
      if (!results.length)
        return {
          content: tr("ui.index.all.search.sources.unavailable.already.retried.a581bda", { p0: (getCurrentLanguage() !== 'zh' ? tried.join(", ") || "none" : tried.join("、") || tr("acct.userInitial")) }),
        };
      return {
        content: results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join("\n\n"),
      };
    } catch (e: any) {
      return { content: tr("ui.index.search.failed.4482818", { p0: e.message }), isError: true };
    }
  },
};

const webFetchTool: Tool = {
  name: "web_fetch",
  get description() { return tr("tool.description.web_fetch"); },
  readOnly: true,
  get inputSchema() { return {
    type: "object",
    properties: { url: { type: "string", description: tr("tool.parameter.web_fetch.url") } },
    required: ["url"],
  }; },
  async run(input, ctx): Promise<ToolResult> {
    try {
      const url = String(input.url || "");
      if (!/^https?:\/\//i.test(url))
        return {
          content: tr("ui.index.url.must.start.with.http.or.b689f63"),
          isError: true,
        };
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" },
        redirect: "follow",
        signal: ctx.signal,
      });
      const ct = res.headers.get("content-type") || "";
      let body = await res.text();
      if (/html|xml/i.test(ct) || /^\s*</.test(body)) body = htmlToText(body);
      else body = body.trim();
      const max = 12000;
      const tail = tr("ui.index.truncated.chars.total.13a3349", { p0: body.length });
      const text = body.length > max ? body.slice(0, max) + tail : body;
      const head = tr("ui.index.http.a232bda", { v0: url, v1: res.status });
      return { content: `${head}\n\n${text || tr("ui.index.empty.285fa8b")}` };
    } catch (e: any) {
      return { content: tr("ui.index.fetch.failed.af5e208", { p0: e.message }), isError: true };
    }
  },
};

// ---- Brain：本地概念知识网络（结构化、可检索、越用越准）----
// 定位：把项目/服务器/脚本/注意事项等"高价值概念点"存成互相关联的网络，
// 开工前先 brain_recall 取相关子图，避免每次全量扫文档、省 token。
const brainRecallTool: Tool = {
  name: "brain_recall",
  get description() { return tr("tool.description.brain_recall"); },
  readOnly: true, // 只读+轻量强化，安全，免权限确认，可并行
  get inputSchema() { return {
    type: "object",
    properties: {
      query: { type: "string", description: tr("tool.parameter.brain_recall.query") },
      limit: { type: "number", description: tr("tool.parameter.brain_recall.limit") },
    },
    required: ["query"],
  }; },
  async run(input): Promise<ToolResult> {
    try {
      const r = await brain.recall(String(input.query || ""), Number(input.limit) || 6);
      return {
        content:
          r.text ||
          tr("ui.index.no.related.concepts.in.the.knowledge.df690fe"),
      };
    } catch (e: any) {
      return { content: tr("ui.index.recall.failed.57d652d", { p0: e.message }), isError: true };
    }
  },
};

const brainLearnTool: Tool = {
  name: "brain_learn",
  get description() { return tr("tool.description.brain_learn"); },
  readOnly: true, // 只写 minicc 自己的知识库，安全
  get inputSchema() { return {
    type: "object",
    properties: {
      name: { type: "string", description: tr("tool.parameter.brain_learn.name") },
      type: { type: "string", description: tr("tool.parameter.brain_learn.type") },
      summary: { type: "string", description: tr("tool.parameter.brain_learn.summary") },
      aliases: { type: "array", items: { type: "string" }, description: tr("tool.parameter.brain_learn.aliases") },
      attrs: {
        type: "object",
        additionalProperties: { type: "string" },
        description: tr("tool.parameter.brain_learn.attrs"),
      },
    },
    required: ["name"],
  }; },
  async run(input): Promise<ToolResult> {
    try {
      const r = await brain.learn({
        name: String(input.name),
        type: input.type ? String(input.type) : undefined,
        summary: input.summary ? String(input.summary) : undefined,
        aliases: Array.isArray(input.aliases) ? (input.aliases as string[]) : undefined,
        attrs: (input.attrs as Record<string, string>) || undefined,
      });
      return {
        content: tr("ui.loop.text.86bd23f", { v0: (getCurrentLanguage() !== 'zh' ? undefined : r.created ? "已记住新概念" : "已更新概念"), v1: r.name, v2: (getCurrentLanguage() !== 'zh' ? r.created ? "Learned new concept" : "Updated concept" : undefined) }),
      };
    } catch (e: any) {
      return { content: tr("ui.index.write.failed.66f9135", { p0: e.message }), isError: true };
    }
  },
};

const brainLinkTool: Tool = {
  name: "brain_link",
  get description() { return tr("tool.description.brain_link"); },
  readOnly: true,
  get inputSchema() { return {
    type: "object",
    properties: {
      from: { type: "string", description: tr("tool.parameter.brain_link.from") },
      relation: { type: "string", description: tr("tool.parameter.brain_link.relation") },
      to: { type: "string", description: tr("tool.parameter.brain_link.to") },
    },
    required: ["from", "relation", "to"],
  }; },
  async run(input): Promise<ToolResult> {
    try {
      const r = await brain.link(String(input.from), String(input.relation), String(input.to));
      return { content: r.msg, isError: !r.ok };
    } catch (e: any) {
      return { content: tr("ui.index.link.failed.6f1b383", { p0: e.message }), isError: true };
    }
  },
};

const brainForgetTool: Tool = {
  name: "brain_forget",
  get description() { return tr("tool.description.brain_forget"); },
  readOnly: true,
  get inputSchema() { return {
    type: "object",
    properties: { name: { type: "string", description: tr("tool.parameter.brain_forget.name") } },
    required: ["name"],
  }; },
  async run(input): Promise<ToolResult> {
    try {
      const ok = brain.forget(String(input.name));
      return {
        content: ok
          ? tr("ui.index.forgot.47c067e", { p0: input.name })
          : tr("ui.index.concept.not.found.d5b1cee", { p0: input.name }),
      };
    } catch (e: any) {
      return { content: tr("ui.index.delete.failed.571122f", { p0: e.message }), isError: true };
    }
  },
};

const brainReadDocTool: Tool = {
  name: "brain_read_doc",
  get description() { return tr("tool.description.brain_read_doc"); },
  readOnly: true,
  get inputSchema() { return {
    type: "object",
    properties: {
      ref: { type: "string", description: tr("tool.parameter.brain_read_doc.ref") },
    },
    required: ["ref"],
  }; },
  async run(input): Promise<ToolResult> {
    try {
      return { content: brain.readDoc(String(input.ref || "")) };
    } catch (e: any) {
      return { content: tr("ui.index.read.failed.b9c5f8d", { p0: e.message }), isError: true };
    }
  },
};

export const ALL_TOOLS: Tool[] = [
  platformImageTool,
  codexImageTool,
  readTool,
  writeTool,
  editTool,
  bashTool,
  powershellTool,
  globTool,
  grepTool,
  webSearchTool,
  webFetchTool,
  rememberTool,
  askDecisionTool,
  brainRecallTool,
  brainLearnTool,
  brainLinkTool,
  brainForgetTool,
  brainReadDocTool,
  ...CHROME_TOOLS,
  ...COMPUTER_TOOLS,
];

export const TOOL_MAP: Map<string, Tool> = new Map(ALL_TOOLS.map((t) => [t.name, t]));
