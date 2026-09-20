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
function fallbackLabel(name: string, inp: any, en: boolean): string {
  const v = inp?.query ?? inp?.q ?? inp?.url ?? inp?.file_path ?? inp?.path ?? inp?.pattern ?? inp?.text ?? inp?.selector ?? "";
  const tail = v ? (en ? ": " : "：") + short(v) : "";
  return name + tail;
}

export function researchToolLabel(name: string, input: any, en: boolean): string {
  const inp = (input || {}) as any;
  switch (name) {
    case "web_search": return (en ? "Searching: " : "正在搜索：") + short(inp.query ?? inp.q, 40);
    case "web_fetch": return (en ? "Reading page: " : "正在读网页：") + shortUrl(inp.url, 40);
    case "write_file": case "edit_file": return (en ? "Writing: " : "正在写入：") + short(inp.path ?? inp.file_path, 40);
    case "read_file": return (en ? "Reading: " : "正在读取：") + short(inp.path ?? inp.file_path, 40);
    case "bash": case "powershell": return en ? "Running a command" : "执行命令";
    case "grep": case "glob": return (en ? "Searching files: " : "检索文件：") + short(inp.pattern ?? inp.glob, 40);
    case "browser_open": case "chrome_navigate": return (en ? "Opening page: " : "打开网页：") + shortUrl(inp.url, 40);
    case "browser_click": case "chrome_click": return en ? "Clicking on the page" : "点击页面";
    case "chrome_read": case "get_page_text": return en ? "Reading the page" : "读取网页内容";
    case "chrome_eval": case "javascript_tool": return en ? "Pulling data from page" : "浏览器取数据"; // 不露 expression 代码
    case "chrome_tabs": return en ? "Checking browser tabs" : "查看浏览器标签";
    case "chrome_status": return en ? "Checking browser" : "检查浏览器";
    default: return fallbackLabel(name, inp, en);
  }
}

// 工具「详细」预览：展开某个工具时显示它在干什么（比 researchToolLabel 略细，但同样简洁、不露代码）。
// 主对话工具卡片 + AI 员工进度展开区共用。
export function toolInputPreview(name: string, input: any, en: boolean): string {
  const inp = (input || {}) as any;
  switch (name) {
    case "bash": return "$ " + short(inp.command, 80);
    case "powershell": return "PS> " + short(inp.command, 80);
    case "read_file": return (en ? "Read " : "读取 ") + short(inp.path ?? inp.file_path, 60);
    case "write_file": return (en ? "Write " : "写入 ") + short(inp.path ?? inp.file_path, 60);
    case "edit_file": return (en ? "Edit " : "编辑 ") + short(inp.path ?? inp.file_path, 60);
    case "grep": return (en ? `Search "${short(inp.pattern, 40)}"` : `搜索 “${short(inp.pattern, 40)}”`) + (inp.path ? (en ? `  ·  in ${short(inp.path, 40)}` : `  ·  路径 ${short(inp.path, 40)}`) : "");
    case "glob": return (en ? `Match ${short(inp.pattern ?? inp.glob, 40)}` : `匹配 ${short(inp.pattern ?? inp.glob, 40)}`);
    case "web_search": return (en ? "Web search: " : "搜索网络：") + short(inp.query ?? inp.q, 50);
    case "web_fetch": return (en ? "Fetch " : "抓取 ") + shortUrl(inp.url);
    case "browser_open": case "chrome_navigate": return (en ? "Open page " : "打开网页 ") + shortUrl(inp.url);
    case "browser_click": case "chrome_click": return (en ? "Click on page" : "点击页面");
    case "chrome_read": case "get_page_text": return (en ? "Read page content" : "读取网页内容");
    case "chrome_eval": case "javascript_tool": return (en ? "Pull data from page" : "浏览器取数据"); // 绝不露 expression 代码
    case "chrome_tabs": return (en ? "Browser tabs" : "查看浏览器标签");
    case "chrome_status": return (en ? "Browser status" : "检查浏览器");
    case "remember": return (en ? "Remember: " : "记住：") + short(inp.text, 60);
    default: return fallbackLabel(name, inp, en);
  }
}
