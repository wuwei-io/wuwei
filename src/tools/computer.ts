// 电脑操作工具（computer_*）：截屏 + 鼠标 + 键盘，操作整台电脑的任意软件。
//
// Windows 专用，零第三方依赖：截屏走 .NET System.Drawing，鼠标/键盘走 user32 P/Invoke，
// 全部通过 PowerShell 执行。配合多模态工具结果——computer_screenshot 把屏幕给模型看，
// 模型据此决定点哪、输入什么。
//
// ⚠️ 安全：截屏是 readOnly（只读屏幕）；鼠标/键盘都 readOnly=false，每个动作走权限确认——
//    它们能点任何东西、输入任何内容，误操作代价大，必须用户逐个确认。

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const execFileP = promisify(execFile);

const ok = (s: string): ToolResult => ({ content: s });
const err = (s: string): ToolResult => ({ content: s, isError: true });
const winOnly = (): ToolResult => err("电脑操作能力目前仅支持 Windows。");

/** 跑一段 PowerShell，返回 stdout。用 -EncodedCommand(base64 UTF-16LE) 彻底避开引号转义地狱。 */
async function ps(script: string, signal?: AbortSignal): Promise<string> {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const { stdout } = await execFileP("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
    signal,
    maxBuffer: 64 * 1024 * 1024, // 截图 base64 可能几 MB
    windowsHide: true,
  });
  return stdout;
}

// SendKeys 的特殊字符要转义成 {char}
function escapeSendKeys(s: string): string {
  return s.replace(/[+^%~(){}[\]]/g, "{$&}");
}

// ── 工具 ──────────────────────────────────────────────

const screenshotTool: Tool = {
  name: "computer_screenshot",
  description:
    "截取整个屏幕并返回图片，让你看到当前电脑画面（哪个软件在前台、按钮在哪、内容是什么）。操作电脑前先截图看清楚。",
  inputSchema: { type: "object", properties: {} },
  readOnly: true,
  async run(_input, ctx: ToolContext) {
    if (process.platform !== "win32") return winOnly();
    try {
      // 截全屏 → 若宽超 1600 等比缩到 1600（省 token，坐标按原图返回给模型时再换算；这里模型看缩略图判断布局够用）
      const out = (
        await ps(
          `Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size)
$maxW = 1600
if ($bmp.Width -gt $maxW) {
  $ratio = $maxW / $bmp.Width
  $nw = $maxW; $nh = [int]($bmp.Height * $ratio)
  $rz = New-Object System.Drawing.Bitmap $nw, $nh
  $rg = [System.Drawing.Graphics]::FromImage($rz)
  $rg.InterpolationMode = 'HighQualityBicubic'
  $rg.DrawImage($bmp, 0, 0, $nw, $nh)
  $bmp = $rz
}
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
"$($b.Width)x$($b.Height)|" + [Convert]::ToBase64String($ms.ToArray())`,
          ctx.signal,
        )
      ).trim();
      const bar = out.indexOf("|");
      const dims = bar > 0 ? out.slice(0, bar) : "";
      const b64 = bar > 0 ? out.slice(bar + 1) : out;
      if (!b64) return err("截屏失败：没拿到图像");
      return { content: `已截取全屏${dims ? `（原始 ${dims}，图已等比缩小便于查看；坐标按原始分辨率给）` : ""}`, image: `data:image/png;base64,${b64}` };
    } catch (e) {
      return err(`截屏出错：${String((e as Error)?.message || e)}`);
    }
  },
};

const clickTool: Tool = {
  name: "computer_click",
  description:
    "把鼠标移到屏幕坐标 (x,y) 并点击。坐标从 computer_screenshot 的画面判断。改变电脑状态，会请求确认。",
  inputSchema: {
    type: "object",
    properties: {
      x: { type: "number", description: "屏幕横坐标(像素)" },
      y: { type: "number", description: "屏幕纵坐标(像素)" },
      button: { type: "string", description: "left(默认)/right/double", enum: ["left", "right", "double"] },
    },
    required: ["x", "y"],
  },
  readOnly: false,
  async run(input, ctx: ToolContext) {
    if (process.platform !== "win32") return winOnly();
    const x = Math.round(Number(input.x)), y = Math.round(Number(input.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return err("x,y 必须是数字");
    const btn = String(input.button || "left");
    // 事件码：left down/up 0x02/0x04，right down/up 0x08/0x10
    const seq = btn === "right" ? "0x08,0x10" : "0x02,0x04";
    const times = btn === "double" ? 2 : 1;
    try {
      await ps(
        `Add-Type @"
using System;using System.Runtime.InteropServices;
public class M{[DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);[DllImport("user32.dll")]public static extern void mouse_event(uint f,uint x,uint y,uint d,int e);}
"@
[M]::SetCursorPos(${x},${y})
for($i=0;$i -lt ${times};$i++){${seq.split(",").map((c) => `[M]::mouse_event(${c},0,0,0,0)`).join(";")};Start-Sleep -Milliseconds 40}`,
        ctx.signal,
      );
      return ok(`已在 (${x},${y}) ${btn === "double" ? "双击" : btn === "right" ? "右键" : "点击"}`);
    } catch (e) {
      return err(`点击出错：${String((e as Error)?.message || e)}`);
    }
  },
};

const moveTool: Tool = {
  name: "computer_move",
  description: "把鼠标移到屏幕坐标 (x,y)，不点击（用于悬停出菜单/提示）。会请求确认。",
  inputSchema: {
    type: "object",
    properties: { x: { type: "number" }, y: { type: "number" } },
    required: ["x", "y"],
  },
  readOnly: false,
  async run(input, ctx: ToolContext) {
    if (process.platform !== "win32") return winOnly();
    const x = Math.round(Number(input.x)), y = Math.round(Number(input.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return err("x,y 必须是数字");
    try {
      await ps(
        `Add-Type @"
using System.Runtime.InteropServices;public class M{[DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);}
"@
[M]::SetCursorPos(${x},${y})`,
        ctx.signal,
      );
      return ok(`鼠标已移到 (${x},${y})`);
    } catch (e) {
      return err(`移动出错：${String((e as Error)?.message || e)}`);
    }
  },
};

const typeTool: Tool = {
  name: "computer_type",
  description: "在当前焦点处用键盘输入一段文本（先点好输入框再用）。会请求确认。",
  inputSchema: {
    type: "object",
    properties: { text: { type: "string", description: "要输入的文本" } },
    required: ["text"],
  },
  readOnly: false,
  async run(input, ctx: ToolContext) {
    if (process.platform !== "win32") return winOnly();
    const text = String(input.text ?? "");
    if (!text) return err("text 不能为空");
    try {
      // 转义 SendKeys 特殊字符 → base64(UTF-16LE)传入，避开引号/编码地狱
      const b64 = Buffer.from(escapeSendKeys(text), "utf16le").toString("base64");
      await ps(
        `Add-Type -AssemblyName System.Windows.Forms
$t = [System.Text.Encoding]::Unicode.GetString([Convert]::FromBase64String("${b64}"))
[System.Windows.Forms.SendKeys]::SendWait($t)`,
        ctx.signal,
      );
      return ok(`已输入：${text.slice(0, 60)}${text.length > 60 ? "…" : ""}`);
    } catch (e) {
      return err(`输入出错：${String((e as Error)?.message || e)}`);
    }
  },
};

const keyTool: Tool = {
  name: "computer_key",
  description:
    "按下一个键或组合键，如 Enter、Tab、Esc、Ctrl+A、Ctrl+C、Alt+F4。用 SendKeys 语法：^=Ctrl %=Alt +=Shift，特殊键用 {ENTER}{TAB}{ESC}{F4} 等。会请求确认。",
  inputSchema: {
    type: "object",
    properties: { keys: { type: "string", description: "SendKeys 语法的按键，如 ^a、{ENTER}、%{F4}" } },
    required: ["keys"],
  },
  readOnly: false,
  async run(input, ctx: ToolContext) {
    if (process.platform !== "win32") return winOnly();
    const keys = String(input.keys || "");
    if (!keys) return err("keys 不能为空");
    try {
      const b64keys = Buffer.from(keys, "utf16le").toString("base64");
      await ps(
        `Add-Type -AssemblyName System.Windows.Forms
$k = [System.Text.Encoding]::Unicode.GetString([Convert]::FromBase64String("${b64keys}"))
[System.Windows.Forms.SendKeys]::SendWait($k)`,
        ctx.signal,
      );
      return ok(`已按键：${keys}`);
    } catch (e) {
      return err(`按键出错：${String((e as Error)?.message || e)}`);
    }
  },
};

export const COMPUTER_TOOLS: Tool[] = [screenshotTool, clickTool, moveTool, typeTool, keyTool];
