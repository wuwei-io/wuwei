import { tr, getCurrentLanguage, normalizeLanguage } from "./localization/index.js";
// minicc 终端入口（P3：Ink TUI）。构造 Agent，渲染 <App/>。
import React from "react";
import { render } from "ink";
import { loadConfig } from "./config.js";
import { makeProvider } from "./agent/provider.js";
import { Agent } from "./agent/loop.js";
import { systemPrompt } from "./agent/prompt.js";
import { ALL_TOOLS, TOOL_MAP } from "./tools/index.js";
import { App } from "./ui/app.js";

// CLI 没有设置界面，自己按系统语言定一次 WUWEI_LANG，内核里的 tt() 文案才跟得上。
// 逻辑与 desktop/main/settings.ts 的 detectSysLang 一致(src 不反向依赖 desktop，就地写一份)。
// 桌面端由 applyEnvFromSettings 写入，这里不覆盖已有值。
if (!process.env.WUWEI_LANG) {
  try { process.env.WUWEI_LANG = normalizeLanguage(process.env.LC_ALL || process.env.LANG?.split('.')[0] || Intl.DateTimeFormat().resolvedOptions().locale); }
  catch { process.env.WUWEI_LANG = 'en'; }
}


function fail(msg: string): never {
  process.stderr.write(msg + "\n");
  process.exit(1);
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  fail(
    tr("ui.index.minicc.needs.an.interactive.terminal.tty.ca141c3"),
  );
}

const cfg = loadConfig();
if (cfg.provider === "codex" && (!cfg.codexToken || !cfg.codexAccountId)) {
  fail(
    tr("ui.index.no.codex.credentials.found.sign.in.d6afd87"),
  );
}
if (cfg.provider === "anthropic" && cfg.authMode === "api-key" && !cfg.apiKey) {
  fail(
    tr("ui.index.no.credentials.set.pick.one.api.65cea7a"),
  );
}

const cwd = process.cwd();
const agent = new Agent(makeProvider(cfg), systemPrompt(cwd), ALL_TOOLS, { cwd }, TOOL_MAP, {
  compactThreshold: process.env.MINICC_COMPACT_THRESHOLD ? cfg.compactThreshold : undefined,
  keepRecent: cfg.keepRecentTurns,
});

const backend = cfg.provider === "anthropic" ? `anthropic/${cfg.authMode}` : cfg.provider;
render(<App agent={agent} provider={backend} model={cfg.model} />);
