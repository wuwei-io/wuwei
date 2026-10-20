import { tr as translate, getCurrentLanguage } from "../../../src/localization/index.js";
// 工具调用 → 一句人话标签。主对话进度块 与 AI 员工(群聊/私聊)进度块共用同一套，
// 保证两处「正在搜索：xxx」「正在读网页：xxx」的措辞一致。name + 参数(input) → 人话。
//
// 两条铁律：① 简单扼要——只显示"在干嘛 + 一个关键信息(已截断)"，全文靠展开结果/悬停看；
//          ② 绝不 dump 原始参数(尤其别把 expression/command 里的代码露出来)。

/** 截断长值：标签只求一眼看懂，别塞全文（否则又长又越界）。 */
function short(v: unknown, n = 48): string {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + "…" : s;
}
/** URL 去掉协议头再截断，显得干净。 */
function shortUrl(v: unknown, n = 52): string {
  return short(String(v ?? "").replace(/^https?:\/\//, ""), n);
}
/** 未知工具兜底：挑一个安全的短字段接在工具名后，绝不 JSON.stringify（那会 dump 代码/参数）。 */
function fallbackLabel(name: string, inp: any, language: string): string {
  const v = inp?.query ?? inp?.q ?? inp?.url ?? inp?.file_path ?? inp?.path ?? inp?.pattern ?? inp?.text ?? inp?.selector ?? "";
  const tr = (key: string) => translate(key, {}, language);
  const tail = v ? (tr("ui.app.text.7f29e73")) + short(v) : "";
  return name + tail;
}

export function researchToolLabel(name: string, input: any, locale: string | boolean = getCurrentLanguage()): string {
  const language = typeof locale === "boolean" ? (locale ? "en" : "zh") : locale;
  const tr = (key: string, values = {}) => translate(key, values, language);
  const inp = (input || {}) as any;
  switch (name) {
    case "web_search": return (tr("ui.toollabel.searching.1967971")) + short(inp.query ?? inp.q, 40);
    case "web_fetch": return (tr("ui.toollabel.reading.page.7ad3895")) + shortUrl(inp.url, 40);
    case "write_file": case "edit_file": return (tr("ui.toollabel.writing.e0057eb")) + short(inp.path ?? inp.file_path, 40);
    case "read_file": return (tr("ui.toollabel.reading.2bc329a")) + short(inp.path ?? inp.file_path, 40);
    case "bash": case "powershell": return tr("ui.toollabel.running.command.a31cca1");
    case "grep": case "glob": return (tr("ui.toollabel.searching.files.25711cc")) + short(inp.pattern ?? inp.glob, 40);
    case "browser_open": case "chrome_navigate": return (tr("ui.toollabel.opening.page.30ea702")) + shortUrl(inp.url, 40);
    case "browser_click": case "chrome_click": return tr("ui.toollabel.clicking.on.the.page.c667b46");
    case "chrome_read": case "get_page_text": return tr("ui.toollabel.reading.the.page.9b37775");
    case "chrome_eval": case "javascript_tool": return tr("ui.toollabel.pulling.data.from.page.d7cf21c"); // 不露 expression 代码
    case "chrome_tabs": return tr("ui.toollabel.checking.browser.tabs.180eaec");
    case "chrome_status": return tr("ui.toollabel.checking.browser.97f55fa");
    default: return fallbackLabel(name, inp, language);
  }
}

// 工具「详细」预览：展开某个工具时显示它在干什么（比 researchToolLabel 略细，但同样简洁、不露代码）。
// 主对话工具卡片 + AI 员工进度展开区共用。
export function toolInputPreview(name: string, input: any, locale: string | boolean = getCurrentLanguage()): string {
  const language = typeof locale === "boolean" ? (locale ? "en" : "zh") : locale;
  const tr = (key: string, values = {}) => translate(key, values, language);
  const inp = (input || {}) as any;
  switch (name) {
    case "bash": return "$ " + short(inp.command, 80);
    case "powershell": return "PS> " + short(inp.command, 80);
    case "read_file": return (tr("ui.app.read.6fc7605")) + short(inp.path ?? inp.file_path, 60);
    case "write_file": return (tr("ui.app.write.9e9d809")) + short(inp.path ?? inp.file_path, 60);
    case "edit_file": return (tr("ui.app.edit.1b6b802")) + short(inp.path ?? inp.file_path, 60);
    case "grep": return (tr("ui.app.search.fb60fef", { p0: short(inp.pattern, 40) })) + (inp.path ? (tr("ui.toollabel.in.13695c0", { p0: short(inp.path, 40) })) : "");
    case "glob": return (tr("ui.app.match.d1583ce", { p0: short(inp.pattern ?? inp.glob, 40) }));
    case "web_search": return (tr("ui.app.web.search.c0da4a0")) + short(inp.query ?? inp.q, 50);
    case "web_fetch": return (tr("ui.toollabel.fetch.d586802")) + shortUrl(inp.url);
    case "browser_open": case "chrome_navigate": return (tr("ui.toollabel.open.page.5a1aceb")) + shortUrl(inp.url);
    case "browser_click": case "chrome_click": return (tr("ui.toollabel.click.on.page.ae3da68"));
    case "chrome_read": case "get_page_text": return (tr("ui.toollabel.read.page.content.eb5bffe"));
    case "chrome_eval": case "javascript_tool": return (tr("ui.toollabel.pull.data.from.page.08f5920")); // 绝不露 expression 代码
    case "chrome_tabs": return (tr("ui.toollabel.browser.tabs.29e8a16"));
    case "chrome_status": return (tr("ui.toollabel.browser.status.591ee44"));
    case "remember": return (tr("ui.app.remember.b532336")) + short(inp.text, 60);
    default: return fallbackLabel(name, inp, language);
  }
}
