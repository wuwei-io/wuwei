// 工具调用 → 一句人话标签。主对话进度块 与 AI 员工(群聊/私聊)进度块共用同一套，
// 保证两处「正在搜索：xxx」「正在读网页：xxx」的措辞一致。name + 参数(input) → 人话。
export function researchToolLabel(name: string, input: any, en: boolean): string {
  const raw = input?.query ?? input?.q ?? input?.url ?? input?.file_path ?? input?.path ?? input?.pattern ?? "";
  const s = String(raw).replace(/\s+/g, " ").trim().slice(0, 300); // 不硬截断，显示时靠 CSS 省略号 + 悬停 title 看全
  const tail = s ? "：" + s : "";
  const tailEn = s ? ": " + s : "";
  switch (name) {
    case "web_search": return en ? `Searching${tailEn}` : `正在搜索${tail}`;
    case "web_fetch": return en ? `Reading page${tailEn}` : `正在读网页${tail}`;
    case "write_file": case "edit_file": return en ? `Writing${tailEn}` : `正在写入${tail}`;
    case "read_file": return en ? `Reading${tailEn}` : `正在读取${tail}`;
    case "bash": case "powershell": return en ? `Running command${tailEn}` : `执行命令${tail}`;
    case "grep": case "glob": return en ? `Searching files${tailEn}` : `检索文件${tail}`;
    default: return en ? `${name}${tailEn}` : `${name}${tail}`;
  }
}

// 工具「详细」预览：展开某个工具时显示它到底执行了什么(命令全文/路径/query/坐标等)。
// 比 researchToolLabel(一句话标题)更细。主对话工具卡片 + AI 员工进度展开区共用。
export function toolInputPreview(name: string, input: any, en: boolean): string {
  const inp = (input || {}) as any;
  switch (name) {
    case "bash": return "$ " + String(inp.command || "");
    case "powershell": return "PS> " + String(inp.command || "");
    case "read_file": return (en ? "Read " : "读取 ") + String(inp.path || "");
    case "write_file": return (en ? "Write " : "写入 ") + String(inp.path || "");
    case "edit_file": return (en ? "Edit " : "编辑 ") + String(inp.path || "");
    case "grep": return (en ? `Search "${inp.pattern ?? ""}"` : `搜索 “${inp.pattern ?? ""}”`) + (inp.path ? (en ? `  ·  path ${inp.path}` : `  ·  路径 ${inp.path}`) : "");
    case "glob": return (en ? `Match ${inp.pattern ?? inp.glob ?? ""}` : `匹配 ${inp.pattern ?? inp.glob ?? ""}`) + (inp.path ? (en ? `  ·  path ${inp.path}` : `  ·  路径 ${inp.path}`) : "");
    case "web_search": return (en ? `Web search: ${inp.query ?? ""}` : `搜索网络：${inp.query ?? ""}`);
    case "web_fetch": return (en ? `Fetch ${inp.url ?? ""}` : `抓取 ${inp.url ?? ""}`);
    case "browser_open": return (en ? `Browser open ${inp.url ?? ""}` : `浏览器打开 ${inp.url ?? ""}`);
    case "browser_click": return (en ? `Click ${inp.selector ?? ""}` : `点击 ${inp.selector ?? ""}`);
    case "remember": return (en ? `Remember: ${inp.text ?? ""}` : `记住：${inp.text ?? ""}`);
    default: { const s = JSON.stringify(inp); return s === "{}" ? "" : s; }
  }
}

