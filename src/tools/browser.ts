import { tr } from "../localization/index.js";
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
  if (tabs.length === 0) throw new Error(tr("ui.browser.message.4aebbc1268"));
  if (typeof ref === "number") {
    const t = tabs[ref];
    if (!t) throw new Error(tr("ui.browser.message.ba7bb8e095", {p0: ref, p1: tabs.length}));
    return t;
  }
  if (typeof ref === "string" && ref) {
    const q = ref.toLowerCase();
    const t = tabs.find((x) => x.url.toLowerCase().includes(q) || (x.title || "").toLowerCase().includes(q));
    if (!t) throw new Error(tr("ui.browser.message.257b83679b", {p0: ref}));
    return t;
  }
  return tabs[0];
}

/** 连某标签的 WS，发一条 CDP 命令，拿结果。用完即关，不维护长连接。 */
function cdpSend(wsUrl: string, method: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<any> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
    const timer = setTimeout(() => { try { ws.close(); } catch { /* ignore */ } reject(new Error(tr("ui.browser.message.449df8bc4d"))); }, 20000);
    const onAbort = () => { try { ws.close(); } catch { /* ignore */ } reject(new Error("aborted")); };
    signal?.addEventListener("abort", onAbort, { once: true });
    const done = (fn: () => void) => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); try { ws.close(); } catch { /* ignore */ } fn(); };
    ws.on("open", () => ws.send(JSON.stringify({ id: 1, method, params })));
    ws.on("message", (data: any) => {
      let m: any; try { m = JSON.parse(data.toString()); } catch { return; }
      if (m.id !== 1) return;
      if (m.error) done(() => reject(new Error(m.error.message || tr("ui.browser.message.1cae934e0c"))));
      else done(() => resolve(m.result));
    });
    ws.on("error", (e: any) => done(() => reject(e instanceof Error ? e : new Error(String(e)))));
  });
}

/** 在标签里执行 JS 拿返回值（Runtime.evaluate，awaitPromise，returnByValue） */
async function evalOnTab(tab: Tab, expression: string, signal?: AbortSignal): Promise<any> {
  const r = await cdpSend(tab.webSocketDebuggerUrl, "Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, signal);
  if (r?.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || tr("ui.browser.message.e3ff8fafe2"));
  return r?.result?.value;
}

const ok = (s: string): ToolResult => ({ content: s });
const err = (s: string): ToolResult => ({ content: s, isError: true });

// 连不上时给一致的引导语
function notConnected(e: unknown): ToolResult {
  return err(
    tr("ui.browser.message.e3101c3769", {p0: cdpPort(), p1: String((e as Error)?.message || e)}) +
    tr("ui.browser.message.1899f2416a"),
  );
}

// ── 工具 ──────────────────────────────────────────────

const statusTool: Tool = {
  name: "chrome_status",
  get description() { return tr("tool.description.chrome_status"); },
  inputSchema: { type: "object", properties: {} },
  readOnly: true,
  async run(_input, ctx: ToolContext) {
    try {
      const ver = await fetchJson("/json/version", ctx.signal);
      const tabs = await listTabs(ctx.signal);
      return ok(tr("ui.browser.message.2b94a89a6f", {p0: ver.Browser, p1: tabs.length}));
    } catch (e) {
      return notConnected(e);
    }
  },
};

const tabsTool: Tool = {
  name: "chrome_tabs",
  get description() { return tr("tool.description.chrome_tabs"); },
  inputSchema: { type: "object", properties: {} },
  readOnly: true,
  async run(_input, ctx: ToolContext) {
    try {
      const tabs = await listTabs(ctx.signal);
      if (tabs.length === 0) return ok(tr("ui.browser.message.759e502240"));
      return ok(tabs.map((t, i) => `[${i}] ${t.title || tr("ui.browser.message.2bab1f41c5")}\n    ${t.url}`).join("\n"));
    } catch (e) {
      return notConnected(e);
    }
  },
};

const readTool: Tool = {
  name: "chrome_read",
  get description() { return tr("tool.description.chrome_read"); },
  get inputSchema() { return {
    type: "object",
    properties: {
      tab: { description: tr("tool.parameter.chrome_read.tab"), type: ["number", "string"] },
      selector: { type: "string", description: tr("tool.parameter.chrome_read.selector") },
      max_chars: { type: "number", description: tr("tool.parameter.chrome_read.max_chars") },
    },
  }; },
  readOnly: true,
  async run(input, ctx: ToolContext) {
    try {
      const tab = await pickTab(input.tab, ctx.signal);
      const sel = typeof input.selector === "string" ? input.selector : "";
      const expr = sel
        ? `(()=>{const el=document.querySelector(${JSON.stringify(sel)});return el?el.innerText:"__NOEL__";})()`
        : `document.body.innerText`;
      const text = await evalOnTab(tab, expr, ctx.signal);
      if (text === "__NOEL__") return err(tr("ui.browser.message.2080954a99", {p0: sel}));
      const max = typeof input.max_chars === "number" ? input.max_chars : 8000;
      const s = String(text || "").replace(/\n{3,}/g, "\n\n").slice(0, max);
      return ok(`【${tab.title}】${tab.url}\n\n${s}${String(text || "").length > max ? tr("ui.browser.message.8a9bbc4e03") : ""}`);
    } catch (e) {
      return notConnected(e);
    }
  },
};

const navigateTool: Tool = {
  name: "chrome_navigate",
  get description() { return tr("tool.description.chrome_navigate"); },
  get inputSchema() { return {
    type: "object",
    properties: {
      url: { type: "string", description: tr("tool.parameter.chrome_navigate.url") },
      tab: { description: tr("tool.parameter.chrome_navigate.tab"), type: ["number", "string"] },
    },
    required: ["url"],
  }; },
  readOnly: false,
  async run(input, ctx: ToolContext) {
    try {
      const url = String(input.url || "").trim();
      if (!/^https?:\/\//i.test(url)) return err(tr("ui.browser.message.7759575946"));
      const tab = await pickTab(input.tab, ctx.signal);
      await cdpSend(tab.webSocketDebuggerUrl, "Page.navigate", { url }, ctx.signal);
      return ok(tr("ui.browser.message.f4cd79fc7f", {p0: tab.title, p1: url}));
    } catch (e) {
      return notConnected(e);
    }
  },
};

const clickTool: Tool = {
  name: "chrome_click",
  get description() { return tr("tool.description.chrome_click"); },
  get inputSchema() { return {
    type: "object",
    properties: {
      selector: { type: "string", description: tr("tool.parameter.chrome_click.selector") },
      text: { type: "string", description: tr("tool.parameter.chrome_click.text") },
      tab: { description: tr("tool.parameter.chrome_click.tab"), type: ["number", "string"] },
    },
  }; },
  readOnly: false,
  async run(input, ctx: ToolContext) {
    try {
      const tab = await pickTab(input.tab, ctx.signal);
      const sel = typeof input.selector === "string" ? input.selector : "";
      const txt = typeof input.text === "string" ? input.text : "";
      if (!sel && !txt) return err(tr("ui.browser.message.228bf0fb7c"));
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
      if (!r?.ok) return err(tr("ui.browser.message.8e307b8b6d", {p0: sel || "-", p1: txt || "-"}));
      return ok(tr("ui.browser.message.6a7e52db9d", {p0: r.tag, p1: r.label ? `「${r.label}」` : ""}));
    } catch (e) {
      return notConnected(e);
    }
  },
};

const fillTool: Tool = {
  name: "chrome_fill",
  get description() { return tr("tool.description.chrome_fill"); },
  get inputSchema() { return {
    type: "object",
    properties: {
      selector: { type: "string", description: tr("tool.parameter.chrome_fill.selector") },
      value: { type: "string", description: tr("tool.parameter.chrome_fill.value") },
      tab: { description: tr("tool.parameter.chrome_fill.tab"), type: ["number", "string"] },
    },
    required: ["selector", "value"],
  }; },
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
      if (!r?.ok) return err(tr("ui.browser.message.d08e62f7f8", {p0: sel}));
      return ok(tr("ui.browser.message.e39d1a5571", {p0: r.tag, p1: val.slice(0, 60), p2: val.length > 60 ? "…" : ""}));
    } catch (e) {
      return notConnected(e);
    }
  },
};

const evalTool: Tool = {
  name: "chrome_eval",
  get description() { return tr("tool.description.chrome_eval"); },
  get inputSchema() { return {
    type: "object",
    properties: {
      expression: { type: "string", description: tr("tool.parameter.chrome_eval.expression") },
      tab: { description: tr("tool.parameter.chrome_eval.tab"), type: ["number", "string"] },
    },
    required: ["expression"],
  }; },
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
  get description() { return tr("tool.description.chrome_screenshot"); },
  get inputSchema() { return {
    type: "object",
    properties: {
      tab: { description: tr("tool.parameter.chrome_screenshot.tab"), type: ["number", "string"] },
      full_page: { type: "boolean", description: tr("tool.parameter.chrome_screenshot.full_page") },
    },
  }; },
  readOnly: true,
  async run(input, ctx: ToolContext) {
    try {
      const tab = await pickTab(input.tab, ctx.signal);
      const params: Record<string, unknown> = { format: "png" };
      if (input.full_page) params.captureBeyondViewport = true;
      const r = await cdpSend(tab.webSocketDebuggerUrl, "Page.captureScreenshot", params, ctx.signal);
      if (!r?.data) return err(tr("ui.browser.message.5ef73a023e"));
      return { content: tr("ui.browser.message.d1e4c9918b", {p0: tab.title}), image: `data:image/png;base64,${r.data}` };
    } catch (e) {
      return notConnected(e);
    }
  },
};

export const CHROME_TOOLS: Tool[] = [statusTool, tabsTool, readTool, navigateTool, clickTool, fillTool, evalTool, screenshotTool];
