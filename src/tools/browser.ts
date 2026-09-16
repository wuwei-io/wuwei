// 浏览器操作工具（browser_*）：通过 CDP（Chrome DevTools Protocol）操作用户"调试模式"的 Chrome。
//
// 为什么自建：直接连本地 Chrome 的调试端口，操作用户**已登录**的会话（GSC/Paddle/Gmail/后台/小红书
// 都是登录态），且不依赖任何外部服务——比走第三方浏览器代理稳。用户需带 --remote-debugging-port 启动 Chrome。
//
// 技术：裸 CDP。列标签走 HTTP(/json)，发命令走 WebSocket。大部分操作用 Runtime.evaluate 执行页面内 JS
// 拿结果/操作，简单可靠，不碰 DOM.*/Input.* 那套复杂协议。
//
// 安全：纯读(status/tabs/read)是 readOnly 直接放行；改状态(navigate/click/fill/eval)readOnly=false 走权限确认。

import WebSocket from "ws";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const cdpPort = () => Number(process.env.WUWEI_CDP_PORT) || 9222;
const cdpHost = () => `http://127.0.0.1:${cdpPort()}`;

type Tab = { id: string; title: string; url: string; type: string; webSocketDebuggerUrl: string };

async function fetchJson(path: string, signal?: AbortSignal): Promise<any> {
  const r = await fetch(`${cdpHost()}${path}`, { signal });
  if (!r.ok) throw new Error(`CDP HTTP ${r.status}`);
  return r.json();
}

async function listTabs(signal?: AbortSignal): Promise<Tab[]> {
  const all = (await fetchJson("/json", signal)) as Tab[];
  return all.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
}

/** 挑一个标签：ref 是数字=序号；字符串=按 url/title 子串匹配；空=第一个 */
async function pickTab(ref: unknown, signal?: AbortSignal): Promise<Tab> {
  const tabs = await listTabs(signal);
  if (tabs.length === 0) throw new Error("没有可操作的标签页");
  if (typeof ref === "number") {
    const t = tabs[ref];
    if (!t) throw new Error(`没有序号 ${ref} 的标签（共 ${tabs.length} 个）`);
    return t;
  }
  if (typeof ref === "string" && ref) {
    const q = ref.toLowerCase();
    const t = tabs.find((x) => x.url.toLowerCase().includes(q) || (x.title || "").toLowerCase().includes(q));
    if (!t) throw new Error(`没有匹配「${ref}」的标签`);
    return t;
  }
  return tabs[0];
}

/** 连某标签的 WS，发一条 CDP 命令，拿结果。用完即关，不维护长连接。 */
function cdpSend(wsUrl: string, method: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<any> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
    const timer = setTimeout(() => { try { ws.close(); } catch { /* ignore */ } reject(new Error("CDP 命令超时")); }, 20000);
    const onAbort = () => { try { ws.close(); } catch { /* ignore */ } reject(new Error("aborted")); };
    signal?.addEventListener("abort", onAbort, { once: true });
    const done = (fn: () => void) => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); try { ws.close(); } catch { /* ignore */ } fn(); };
    ws.on("open", () => ws.send(JSON.stringify({ id: 1, method, params })));
    ws.on("message", (data: any) => {
      let m: any; try { m = JSON.parse(data.toString()); } catch { return; }
      if (m.id !== 1) return;
      if (m.error) done(() => reject(new Error(m.error.message || "CDP 错误")));
      else done(() => resolve(m.result));
    });
    ws.on("error", (e: any) => done(() => reject(e instanceof Error ? e : new Error(String(e)))));
  });
}

/** 在标签里执行 JS 拿返回值（Runtime.evaluate，awaitPromise，returnByValue） */
async function evalOnTab(tab: Tab, expression: string, signal?: AbortSignal): Promise<any> {
  const r = await cdpSend(tab.webSocketDebuggerUrl, "Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, signal);
  if (r?.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || "页面 JS 执行出错");
  return r?.result?.value;
}

const ok = (s: string): ToolResult => ({ content: s });
const err = (s: string): ToolResult => ({ content: s, isError: true });

// 连不上时给一致的引导语
function notConnected(e: unknown): ToolResult {
  return err(
    `连不上调试模式的 Chrome（端口 ${cdpPort()}）：${String((e as Error)?.message || e)}\n` +
    `请用调试模式启动 Chrome：关掉所有 Chrome 后，运行 chrome.exe --remote-debugging-port=9222，再重试。`,
  );
}

// ── 工具 ──────────────────────────────────────────────

const statusTool: Tool = {
  name: "chrome_status",
  description: "检查是否连上了调试模式的 Chrome。返回浏览器版本和已打开的标签页数。连不上会给出启动方法。",
  inputSchema: { type: "object", properties: {} },
  readOnly: true,
  async run(_input, ctx: ToolContext) {
    try {
      const ver = await fetchJson("/json/version", ctx.signal);
      const tabs = await listTabs(ctx.signal);
      return ok(`已连上：${ver.Browser}\n可操作标签页：${tabs.length} 个（用 chrome_tabs 看清单）`);
    } catch (e) {
      return notConnected(e);
    }
  },
};

const tabsTool: Tool = {
  name: "chrome_tabs",
  description: "列出调试 Chrome 里所有打开的标签页（序号、标题、网址）。后续用序号或网址子串指定要操作哪个标签。",
  inputSchema: { type: "object", properties: {} },
  readOnly: true,
  async run(_input, ctx: ToolContext) {
    try {
      const tabs = await listTabs(ctx.signal);
      if (tabs.length === 0) return ok("没有打开的标签页。");
      return ok(tabs.map((t, i) => `[${i}] ${t.title || "(无标题)"}\n    ${t.url}`).join("\n"));
    } catch (e) {
      return notConnected(e);
    }
  },
};

const readTool: Tool = {
  name: "chrome_read",
  description:
    "读取指定标签页的可见文本（登录态页面也能读）。可选 selector 只读某区域。tab 用序号或网址/标题子串指定，缺省第一个。",
  inputSchema: {
    type: "object",
    properties: {
      tab: { description: "标签序号(数字)或网址/标题子串(字符串)，缺省第一个", type: ["number", "string"] },
      selector: { type: "string", description: "只读匹配此 CSS 选择器的元素文本，缺省读整页 body" },
      max_chars: { type: "number", description: "最多返回多少字符，默认 8000" },
    },
  },
  readOnly: true,
  async run(input, ctx: ToolContext) {
    try {
      const tab = await pickTab(input.tab, ctx.signal);
      const sel = typeof input.selector === "string" ? input.selector : "";
      const expr = sel
        ? `(()=>{const el=document.querySelector(${JSON.stringify(sel)});return el?el.innerText:"__NOEL__";})()`
        : `document.body.innerText`;
      const text = await evalOnTab(tab, expr, ctx.signal);
      if (text === "__NOEL__") return err(`没找到元素：${sel}`);
      const max = typeof input.max_chars === "number" ? input.max_chars : 8000;
      const s = String(text || "").replace(/\n{3,}/g, "\n\n").slice(0, max);
      return ok(`【${tab.title}】${tab.url}\n\n${s}${String(text || "").length > max ? "\n…(已截断)" : ""}`);
    } catch (e) {
      return notConnected(e);
    }
  },
};

const navigateTool: Tool = {
  name: "chrome_navigate",
  description: "让指定标签页跳转到某个网址。tab 缺省第一个；也可先 chrome_tabs 找到目标标签。",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "要访问的完整网址" },
      tab: { description: "标签序号或网址/标题子串，缺省第一个", type: ["number", "string"] },
    },
    required: ["url"],
  },
  readOnly: false,
  async run(input, ctx: ToolContext) {
    try {
      const url = String(input.url || "").trim();
      if (!/^https?:\/\//i.test(url)) return err("网址必须以 http:// 或 https:// 开头");
      const tab = await pickTab(input.tab, ctx.signal);
      await cdpSend(tab.webSocketDebuggerUrl, "Page.navigate", { url }, ctx.signal);
      return ok(`已让标签「${tab.title}」跳转到 ${url}（页面加载需要一点时间，随后可用 chrome_read 读内容）`);
    } catch (e) {
      return notConnected(e);
    }
  },
};

const clickTool: Tool = {
  name: "chrome_click",
  description:
    "点击页面上的元素。用 selector(CSS 选择器) 或 text(按钮/链接的可见文字) 定位。改变页面状态，会请求确认。",
  inputSchema: {
    type: "object",
    properties: {
      selector: { type: "string", description: "要点击元素的 CSS 选择器" },
      text: { type: "string", description: "按可见文字找可点击元素（selector 缺省时用）" },
      tab: { description: "标签序号或网址/标题子串，缺省第一个", type: ["number", "string"] },
    },
  },
  readOnly: false,
  async run(input, ctx: ToolContext) {
    try {
      const tab = await pickTab(input.tab, ctx.signal);
      const sel = typeof input.selector === "string" ? input.selector : "";
      const txt = typeof input.text === "string" ? input.text : "";
      if (!sel && !txt) return err("请提供 selector 或 text 之一");
      const expr = `(()=>{
        let el = ${JSON.stringify(sel)} ? document.querySelector(${JSON.stringify(sel)}) : null;
        if (!el && ${JSON.stringify(txt)}) {
          const cand = [...document.querySelectorAll('a,button,[role=button],input[type=submit],input[type=button],[onclick]')];
          el = cand.find(e => ((e.innerText||e.value||'').trim().includes(${JSON.stringify(txt)})));
        }
        if (!el) return { ok:false };
        el.scrollIntoView({block:'center'}); el.click();
        return { ok:true, tag: el.tagName.toLowerCase(), label: (el.innerText||el.value||'').trim().slice(0,60) };
      })()`;
      const r = await evalOnTab(tab, expr, ctx.signal);
      if (!r?.ok) return err(`没找到要点击的元素（selector=${sel || "-"} text=${txt || "-"}）`);
      return ok(`已点击 <${r.tag}> ${r.label ? `「${r.label}」` : ""}`);
    } catch (e) {
      return notConnected(e);
    }
  },
};

const fillTool: Tool = {
  name: "chrome_fill",
  description: "在输入框/文本域里填写内容（selector 定位）。会兼容 React 受控组件触发 input/change 事件。会请求确认。",
  inputSchema: {
    type: "object",
    properties: {
      selector: { type: "string", description: "输入框的 CSS 选择器" },
      value: { type: "string", description: "要填入的文本" },
      tab: { description: "标签序号或网址/标题子串，缺省第一个", type: ["number", "string"] },
    },
    required: ["selector", "value"],
  },
  readOnly: false,
  async run(input, ctx: ToolContext) {
    try {
      const tab = await pickTab(input.tab, ctx.signal);
      const sel = String(input.selector || "");
      const val = String(input.value ?? "");
      const expr = `(()=>{
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return { ok:false };
        el.focus();
        const proto = el.tagName==='TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto,'value') && Object.getOwnPropertyDescriptor(proto,'value').set;
        if (setter) setter.call(el, ${JSON.stringify(val)}); else el.value = ${JSON.stringify(val)};
        el.dispatchEvent(new Event('input',{bubbles:true}));
        el.dispatchEvent(new Event('change',{bubbles:true}));
        return { ok:true, tag: el.tagName.toLowerCase() };
      })()`;
      const r = await evalOnTab(tab, expr, ctx.signal);
      if (!r?.ok) return err(`没找到输入框：${sel}`);
      return ok(`已填入 <${r.tag}>：${val.slice(0, 60)}${val.length > 60 ? "…" : ""}`);
    } catch (e) {
      return notConnected(e);
    }
  },
};

const evalTool: Tool = {
  name: "chrome_eval",
  description:
    "在指定标签页里执行一段 JavaScript 并返回结果（高级操作，如提取结构化数据、复杂交互）。会请求确认。",
  inputSchema: {
    type: "object",
    properties: {
      expression: { type: "string", description: "要执行的 JS 表达式（返回值会被序列化返回）" },
      tab: { description: "标签序号或网址/标题子串，缺省第一个", type: ["number", "string"] },
    },
    required: ["expression"],
  },
  readOnly: false,
  async run(input, ctx: ToolContext) {
    try {
      const tab = await pickTab(input.tab, ctx.signal);
      const v = await evalOnTab(tab, String(input.expression || ""), ctx.signal);
      return ok(typeof v === "string" ? v : JSON.stringify(v, null, 2)?.slice(0, 8000) ?? "undefined");
    } catch (e) {
      return notConnected(e);
    }
  },
};

const screenshotTool: Tool = {
  name: "chrome_screenshot",
  description:
    "截取指定标签页的当前画面并返回图片，让你直接看到页面长什么样（找元素位置、看图表、确认状态时用）。tab 缺省第一个。",
  inputSchema: {
    type: "object",
    properties: {
      tab: { description: "标签序号或网址/标题子串，缺省第一个", type: ["number", "string"] },
      full_page: { type: "boolean", description: "是否截整页(含滚动区域)，缺省只截可视区" },
    },
  },
  readOnly: true,
  async run(input, ctx: ToolContext) {
    try {
      const tab = await pickTab(input.tab, ctx.signal);
      const params: Record<string, unknown> = { format: "png" };
      if (input.full_page) params.captureBeyondViewport = true;
      const r = await cdpSend(tab.webSocketDebuggerUrl, "Page.captureScreenshot", params, ctx.signal);
      if (!r?.data) return err("截图失败：没拿到图像数据");
      return { content: `已截取【${tab.title}】的画面`, image: `data:image/png;base64,${r.data}` };
    } catch (e) {
      return notConnected(e);
    }
  },
};

export const CHROME_TOOLS: Tool[] = [statusTool, tabsTool, readTool, navigateTool, clickTool, fillTool, evalTool, screenshotTool];
