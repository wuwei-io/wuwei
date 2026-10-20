import { tr } from "../localization/index.js";
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
const winOnly = (): ToolResult => err(tr("ui.computer.message.3a5146c957"));

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
  get description() { return tr("tool.description.computer_screenshot"); },
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
      if (!b64) return err(tr("ui.computer.message.885ac7c165"));
      return { content: tr("ui.computer.message.333b936543", {p0: dims ? `（原始 ${dims}，图已等比缩小便于查看；坐标按原始分辨率给）` : ""}), image: `data:image/png;base64,${b64}` };
    } catch (e) {
      return err(tr("ui.computer.message.42d3dafca0", {p0: String((e as Error)?.message || e)}));
    }
  },
};

const clickTool: Tool = {
  name: "computer_click",
  get description() { return tr("tool.description.computer_click"); },
  get inputSchema() { return {
    type: "object",
    properties: {
      x: { type: "number", description: tr("tool.parameter.computer_click.x") },
      y: { type: "number", description: tr("tool.parameter.computer_click.y") },
      button: { type: "string", description: tr("tool.parameter.computer_click.button"), enum: ["left", "right", "double"] },
    },
    required: ["x", "y"],
  }; },
  readOnly: false,
  async run(input, ctx: ToolContext) {
    if (process.platform !== "win32") return winOnly();
    const x = Math.round(Number(input.x)), y = Math.round(Number(input.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return err(tr("ui.computer.message.f9acce18e7"));
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
      return ok(tr("ui.computer.message.8ac0ab1b87", {p0: x, p1: y, p2: btn === "double" ? "双击" : btn === "right" ? "右键" : tr("ui.computer.message.7b07e5296e")}));
    } catch (e) {
      return err(tr("ui.computer.message.6bd6629556", {p0: String((e as Error)?.message || e)}));
    }
  },
};

const moveTool: Tool = {
  name: "computer_move",
  get description() { return tr("tool.description.computer_move"); },
  inputSchema: {
    type: "object",
    properties: { x: { type: "number" }, y: { type: "number" } },
    required: ["x", "y"],
  },
  readOnly: false,
  async run(input, ctx: ToolContext) {
    if (process.platform !== "win32") return winOnly();
    const x = Math.round(Number(input.x)), y = Math.round(Number(input.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return err(tr("ui.computer.message.f9acce18e7"));
    try {
      await ps(
        `Add-Type @"
using System.Runtime.InteropServices;public class M{[DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);}
"@
[M]::SetCursorPos(${x},${y})`,
        ctx.signal,
      );
      return ok(tr("ui.computer.message.ef799f3e76", {p0: x, p1: y}));
    } catch (e) {
      return err(tr("ui.computer.message.45d76080e7", {p0: String((e as Error)?.message || e)}));
    }
  },
};

const typeTool: Tool = {
  name: "computer_type",
  get description() { return tr("tool.description.computer_type"); },
  get inputSchema() { return {
    type: "object",
    properties: { text: { type: "string", description: tr("tool.parameter.computer_type.text") } },
    required: ["text"],
  }; },
  readOnly: false,
  async run(input, ctx: ToolContext) {
    if (process.platform !== "win32") return winOnly();
    const text = String(input.text ?? "");
    if (!text) return err(tr("ui.computer.message.e665862d3c"));
    try {
      // 转义 SendKeys 特殊字符 → base64(UTF-16LE)传入，避开引号/编码地狱
      const b64 = Buffer.from(escapeSendKeys(text), "utf16le").toString("base64");
      await ps(
        `Add-Type -AssemblyName System.Windows.Forms
$t = [System.Text.Encoding]::Unicode.GetString([Convert]::FromBase64String("${b64}"))
[System.Windows.Forms.SendKeys]::SendWait($t)`,
        ctx.signal,
      );
      return ok(tr("ui.computer.message.14cde75e6c", {p0: text.slice(0, 60), p1: text.length > 60 ? "…" : ""}));
    } catch (e) {
      return err(tr("ui.computer.message.80149dc8d5", {p0: String((e as Error)?.message || e)}));
    }
  },
};

const keyTool: Tool = {
  name: "computer_key",
  get description() { return tr("tool.description.computer_key"); },
  get inputSchema() { return {
    type: "object",
    properties: { keys: { type: "string", description: tr("tool.parameter.computer_key.keys") } },
    required: ["keys"],
  }; },
  readOnly: false,
  async run(input, ctx: ToolContext) {
    if (process.platform !== "win32") return winOnly();
    const keys = String(input.keys || "");
    if (!keys) return err(tr("ui.computer.message.feb396d61d"));
    try {
      const b64keys = Buffer.from(keys, "utf16le").toString("base64");
      await ps(
        `Add-Type -AssemblyName System.Windows.Forms
$k = [System.Text.Encoding]::Unicode.GetString([Convert]::FromBase64String("${b64keys}"))
[System.Windows.Forms.SendKeys]::SendWait($k)`,
        ctx.signal,
      );
      return ok(tr("ui.computer.message.bb89d2d52c", {p0: keys}));
    } catch (e) {
      return err(tr("ui.computer.message.9ad6f8ae80", {p0: String((e as Error)?.message || e)}));
    }
  },
};

export const COMPUTER_TOOLS: Tool[] = [screenshotTool, clickTool, moveTool, typeTool, keyTool];
