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
