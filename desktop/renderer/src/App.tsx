import { formatCredits } from "../../../src/billing/presentation.js";
import {localizeToolMetadata} from "../../../src/localization/tools.js";
import systemData from "../../../src/localization/content/system-data.json";
import { LanguagePicker } from "./components/LanguagePicker.js";
import { LanguageSwitcher } from "./components/LanguageSwitcher.js";
import { tr, getCurrentLanguage, localizeStoredText, setSystemLanguage } from "../../../src/localization/index.js";
/// <reference types="vite/client" />
import { employeeSessionTitle } from "../../../src/team/session-title.js";
import { employeeLabel, localizeEmployee, TEAM_TOOL_EN } from "../../../src/team/default-localization.js";
import { departmentLabel } from "../../../src/team/default-departments.js";
import { DepartmentNameInput } from "./team/DepartmentNameInput.js";
import { CompanyHistorySettings } from "./team/CompanyHistorySettings.js";
import { ToolDecisionModal } from './components/ToolDecisionModal.js';
import { shouldAutoApproveToolPermission } from './tool-permission-policy.js';
import { DEFAULT_MODE_KEY, SESSION_MODES_KEY, executionModeFor, readDefaultExecutionMode, readSessionExecutionModes, sessionModesAfterSettingsChange, type ExecutionMode } from './execution-mode.js';
import { imageModelChoices, imageModelLabel } from '../../../src/imagegen/image-catalog.js';
import { localizeModelBadge } from '../../../src/model-badge.js';
import { arrangeProviderEntries } from '../../../src/provider-order.js';
import { createCatalogRefresher } from '../../../src/catalog-refresh.js';
import { createAccountRefresher, type AccountRefreshState } from '../../../src/account-refresh.js';
import { anonymousDefaultModel, catalogModelChoices, MODEL_CATEGORIES, rememberedModelChoice, shouldApplyEconomyDefault, type ModelChoice, type ModelCategory } from '../../../src/model-selection.js';
import { ModelPicker } from './components/ModelPicker.js';
import { FreeQuotaGuide } from './components/FreeQuotaGuide.js';
import { BillingPanel } from './components/billing/BillingPanel.js';
import { hasPaidAllowance, imageToolBalanceFailure, usageLimitKind, usageLimitDestination } from '../../../src/usage-limit.js';
import { recommendedValueModel, premiumSelectionNeedsConfirmation } from '../../../src/premium-model.js';
import { PremiumModelNotice } from './components/PremiumModelNotice.js';
import type { Decision } from '../../../src/types.js';
﻿import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { WuweiMe, CatalogProviderDto } from "../../main/wuwei-auth.js";
import { getLang, setLang as persistLang, makeT, useLanguage, getLanguages, getLanguagePreference, type Lang, type T } from "./i18n.js";
import { tx, setTxMode, useTx } from "./tx.js";
import { researchToolLabel } from "./toolLabel.js";
import { dedupeDisplayedToolImages } from "./imageResults.js";
import { BRAND_LOGOS } from "./brandLogos.js";
import { BrandLogo } from "./modelLogos.js";
import { WECHAT_CS_QR } from "./wechatCsQr.js";
import { QRCodeSVG } from "qrcode.react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { HelpManualModal } from "./components/HelpManualModal.js";
import { createAnnouncementDelivery, type UnreadAnnouncement } from "./components/announcementDelivery.js";
import { AnnouncementModal } from "./components/AnnouncementModal.js";
import { selectAnnouncementLocale, type AnnouncementSource } from "./components/announcementLocale.js";
import { BabyAvatar, inferBabyState } from "./baby/BabyAvatar.js";
import { BabyHero } from "./baby/BabyHero.js";
import { BabyPyramid } from "./baby/BabyPyramid.js";
import * as Ic from "./baby/icons.js";
// 「AI 员工团队」可选模块：整个渲染层只在这里引一次（可插拔契约，见设计方案第七节）
import { AppStore, EmployeeEditModal } from "./team/AppStore.js";
import { RoomView } from "./team/RoomView.js";
import { SopView } from "./team/SopView.js";
import { EmployeeAvatar } from "./team/EmployeeAvatar.js";

// 数字婴儿生命体征：后端 /alive/status 一次给全，界面状态卡片全靠它渲染
type BabyVitals = {
  alive?: boolean;
  age?: string;
  ticks?: number;
  energy?: number;
  mood?: string;
  happiness?: number;
  concepts?: number;
  curiosity?: number;
  activity?: string;
  wakeups?: number;
  recent?: string[];
};

// anchor：搜索定位锚点 "<消息序号>:u"(用户) / "<消息序号>:<内容块序号>"(助手)，
// 与主进程搜索索引里的锚点一一对应；渲染成 data-anchor，搜索结果点进来靠它滚到位。
type Item =
  | { type: "user"; text: string; images?: string[]; ts?: number; anchor?: string }
  | { type: "assistant"; text: string; ts?: number; usage?: UsageSnap; anchor?: string }
  | {
      type: "tool";
      id?: string; // 工具调用 id：并行时用来精确匹配 start/end(不再靠"最后一个running")
      name: string;
      input: Record<string, unknown>;
      result?: string;
      isError?: boolean;
      status: "running" | "done";
      image?: string; // 工具返回的图片(截图/send_image 生图)，dataUrl；界面内联缩略图 + 点开预览
    }
  | { type: "notice"; text: string; rawError?: string; freeModel?: boolean };

interface Usage {
  totalInput: number;
  totalOutput: number;
  lastInput: number;
}
// 盖在助手消息上的用量快照；round=本轮自足值(直接读,不靠跨轮做差)
type RoundUsage = {
  input: number;
  output: number;
  cacheHit: number;
  cacheMiss: number;
  steps: number;
  lastInput: number;
};
type UsageSnap = {
  totalInput: number;
  totalOutput: number;
  lastInput: number;
  totalCacheHit?: number;
  totalCacheMiss?: number;
  totalSteps?: number;
  round?: RoundUsage;
};
interface Pending {
  id: number;
  name: string;
  input: Record<string, unknown>;
}
interface SessionMeta {
  id: string;
  title: string;
  updatedAt: number;
  group?: string;
  priority?: number;
  priorityTag?: string;
  order?: number;
  project?: string;
  done?: boolean;
  discuss?: boolean;
  employeeId?: string; // 绑定的员工(一人公司私聊会话)；这类会话不进普通列表，只在一人公司板块下访问
}

// 优先级方案：高/中/低 + 艾森豪威尔四象限。weight 用于排序(大在前)，tag=徽标短标签，label=全称
const PRIO_HL = [
  { tag: systemData.priorityTags[0], weight: 3, get label() { return tr("ui.helpmanualmodal.high.29b7559"); }, get labelEn() { return tr("ui.helpmanualmodal.high.29b7559"); } },
  { tag: systemData.priorityTags[1], weight: 2, get label() { return tr("ui.helpmanualmodal.medium.c3c3788"); }, get labelEn() { return tr("ui.helpmanualmodal.medium.c3c3788"); } },
  { tag: systemData.priorityTags[2], weight: 1, get label() { return tr("ui.helpmanualmodal.low.1638d14"); }, get labelEn() { return tr("ui.helpmanualmodal.low.1638d14"); } },
];
const PRIO_QUAD = [
  { tag: systemData.priorityTags[3], weight: 4, get label() { return tr("ui.helpmanualmodal.urgent.important.eab7d5f"); }, get labelEn() { return tr("ui.helpmanualmodal.urgent.important.eab7d5f"); } },
  { tag: systemData.priorityTags[4], weight: 3, get label() { return tr("ui.helpmanualmodal.important.not.urgent.7c78c1e"); }, get labelEn() { return tr("ui.helpmanualmodal.important.not.urgent.7c78c1e"); } },
  { tag: systemData.priorityTags[5], weight: 2, get label() { return tr("ui.helpmanualmodal.urgent.not.important.003cf85"); }, get labelEn() { return tr("ui.helpmanualmodal.urgent.not.important.003cf85"); } },
  { tag: systemData.priorityTags[6], weight: 1, get label() { return tr("ui.helpmanualmodal.neither.ea42932"); }, get labelEn() { return tr("ui.helpmanualmodal.neither.ea42932"); } },
];
const PRIO_TITLE: Record<string, string> = Object.fromEntries(
  [...PRIO_HL, ...PRIO_QUAD].map((p) => [p.tag, p.label]),
);

// 图片放大预览：模块级 opener，供 ItemView(消息里的图) 调用，避免逐层传 props
let openImageLightbox: ((src: string) => void) | null = null;
// 图片右键菜单：模块级 opener（同上，消息里的图在顶层组件 ItemView 里）
let openImageMenu: ((x: number, y: number, src: string) => void) | null = null;

// 读图片文件为 dataURL，并把过大的图缩到长边 ≤1568px。
// 为什么：Claude 等 API 对图片单边有硬上限，超长截图(如很高的网页截图)会被直接拒 400，
// 界面只笼统报"请求有误(模型名或参数不对)"。而服务端本来就会把长边>1568 的图缩到 1568 再喂模型，
// 所以客户端先缩到 1568：既不再报错、又正是模型真正看到的分辨率，还省上传体积。
const MAX_IMG_EDGE = 1568;
function readImageDownscaled(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => {
      const dataURL = String(r.result || "");
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth, h = img.naturalHeight;
        const long = Math.max(w, h);
        if (!long || long <= MAX_IMG_EDGE) { resolve(dataURL); return; } // 不超限：原样用
        const scale = MAX_IMG_EDGE / long;
        const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
        try {
          const canvas = document.createElement("canvas");
          canvas.width = cw; canvas.height = ch;
          canvas.getContext("2d")!.drawImage(img, 0, 0, cw, ch);
          resolve(canvas.toDataURL("image/png")); // 截图多为文字，png 比 jpeg 锐利
        } catch { resolve(dataURL); } // 缩放失败兜底用原图
      };
      img.onerror = () => resolve(dataURL);
      img.src = dataURL;
    };
    r.readAsDataURL(file);
  });
}

// 把图片(dataURL/url)复制到系统剪贴板。统一过 canvas 转 png，兼容 jpeg(剪贴板只保证 png)。
async function copyImageToClipboard(src: string): Promise<boolean> {
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/png"));
    if (!blob) return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

// 保存图片到本地(浏览器下载)。dataURL 直接可下。
function saveImage(src: string): void {
  const a = document.createElement("a");
  a.href = src;
  a.download = `wuwei-image-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// 占用条的兜底窗口：仅在主进程还没把 evt:ready 的真实 ctxWindow 送过来时用。
// 真实值来自 src/config.ts contextWindowFor()(订阅通道另有封顶)，别在这里判断模型。
const CTX_MAX = 1_000_000;

// 把持久化的 messages 还原成展示用 items
function messagesToItems(messages: any[]): Item[] {
  const items: Item[] = [];
  const toolById: Record<string, Extract<Item, { type: "tool" }>> = {};
  for (let mi = 0; mi < messages.length; mi++) {
    const m = messages[mi];
    if (m.role === "user") {
      let text = "";
      const imgs: string[] = [];
      for (const b of m.content) {
        if (b.type === "text" && b.text) text += b.text;
        else if (b.type === "image") imgs.push(b.dataUrl);
        else if (b.type === "tool_result" && toolById[b.tool_use_id]) {
          const t = toolById[b.tool_use_id];
          // 图片类工具(截图/send_image)结果是多模态数组[文本+图片]：拆出图片单独渲染，文本进 result。
          if (Array.isArray(b.content)) {
            t.result = b.content.filter((x: any) => x?.type === "text").map((x: any) => x.text).join("");
            const img = b.content.find((x: any) => x?.type === "image");
            if (img?.dataUrl) t.image = img.dataUrl;
          } else {
            t.result = b.content;
          }
          t.isError = b.is_error;
          t.status = "done";
        }
      }
      if (text || imgs.length)
        items.push({
          type: "user",
          text,
          images: imgs.length ? imgs : undefined,
          ts: m.ts,
          anchor: `${mi}:u`,
        });
    } else {
      for (let bi = 0; bi < m.content.length; bi++) {
        const b = m.content[bi];
        if (b.type === "text" && b.text)
          items.push({ type: "assistant", text: b.text, ts: m.ts, usage: m.usage, anchor: `${mi}:${bi}` });
        else if (b.type === "tool_use") {
          const it: Extract<Item, { type: "tool" }> = {
            type: "tool",
            name: b.name,
            input: b.input,
            status: "done",
          };
          items.push(it);
          toolById[b.id] = it;
        }
      }
    }
  }
  return dedupeDisplayedToolImages(items);
}

// —— 搜索命中高亮 ——
// 用 CSS Custom Highlight API 给关键词上底色：不插 <mark>、不动 DOM 结构，
// React 之后再重渲染也不会跟它打架（老内核不支持就只留整块闪一下的兜底效果）。
const SEARCH_HL = "wuwei-search";
function clearSearchHighlight(): void {
  try {
    (CSS as any).highlights?.delete(SEARCH_HL);
  } catch {
    /* 不支持就算了 */
  }
}
// 在 root 里找出关键词的所有出现位置并高亮，返回第一处的 Range（用来滚到确切位置）
function highlightMatches(root: HTMLElement, q: string): Range | null {
  clearSearchHighlight();
  const key = (q || "").toLowerCase();
  if (!key) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const ranges: Range[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const text = (n.nodeValue || "").toLowerCase();
    for (let p = text.indexOf(key); p >= 0; p = text.indexOf(key, p + key.length)) {
      const r = document.createRange();
      r.setStart(n, p);
      r.setEnd(n, p + key.length);
      ranges.push(r);
    }
  }
  if (!ranges.length) return null;
  try {
    const HL = (window as any).Highlight;
    if (HL && (CSS as any).highlights) (CSS as any).highlights.set(SEARCH_HL, new HL(...ranges));
  } catch {
    /* 不支持高亮 API：照样返回位置，至少能滚到点上 */
  }
  return ranges[0];
}

// 设置总目标后发给 AI 的那段工作方式约定（设置→运行模式里可改，{目标} 会被替换成你写的目标）
const goalPromptOf = () => localStorage.getItem("wuwei-goal-prompt") || tr("goal.defaultPrompt");

// 按会话持久化「调研状态」(是否在调研 + 最新进度)，独立于弹窗开关：
// 这样点了"只保存"/收起/关掉弹窗、甚至刷新，重新打开还能恢复"调研中 + 进度"，不会一片空白。
type ResearchState = { researching: boolean; live: { label: string; steps: number } | null };
function saveResearchState(sid: string, st: ResearchState | null) {
  try {
    if (st) localStorage.setItem("wuwei-research:" + sid, JSON.stringify(st));
    else localStorage.removeItem("wuwei-research:" + sid);
  } catch { /* 忽略 */ }
}
function loadResearchState(sid: string): ResearchState | null {
  try { const s = localStorage.getItem("wuwei-research:" + sid); if (s) return JSON.parse(s) as ResearchState; } catch { /* 忽略 */ }
  return null;
}
// 把原始/草稿节点数组递归转成 PlanStep 树(补 id/status，带 description/children)，限深 3
function draftNodesToPlan(arr: any, depth = 1, prefix = "s"): import("./env").PlanStep[] {
  const S = (v: any) => (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v));
  if (!Array.isArray(arr) || depth > 3) return [];
  return arr.map((s: any, i: number) => {
    const id = `${prefix}${i + 1}`;
    const node: import("./env").PlanStep = {
      id,
      title: S(s?.title ?? s?.step ?? s?.步骤 ?? s?.标题),
      acceptance: S(s?.acceptance ?? s?.criteria ?? s?.验收 ?? s?.验收标准),
      status: (s?.status === "doing" || s?.status === "done" ? s.status : "todo") as import("./env").PlanStep["status"],
    };
    const desc = S(s?.description ?? s?.说明 ?? s?.desc ?? s?.详情);
    if (desc) node.description = desc;
    const kids = draftNodesToPlan(s?.children ?? s?.subtasks ?? s?.子节点 ?? s?.子任务, depth + 1, id + "_");
    if (kids.length) node.children = kids;
    return node;
  });
}
// 契约字段 → 干净 JSON 字符串(与 AI 契约 schema 一致：research/rules/plan 树)，供 JSON 视图展示+复制迁移
function charterToJson(f: { research: string; ruleDo: string; ruleDont: string; plan: import("./env").PlanStep[] }): string {
  const nodes = (arr: import("./env").PlanStep[]): any[] =>
    arr
      .filter((n) => n.title.trim() || (n.description || "").trim() || n.acceptance.trim() || (n.children && n.children.length))
      .map((n) => {
        const o: any = { title: n.title };
        if ((n.description || "").trim()) o.description = n.description;
        o.acceptance = n.acceptance;
        if (n.children && n.children.length) o.children = nodes(n.children);
        return o;
      });
  return JSON.stringify({ research: f.research, rules: { do: f.ruleDo, dont: f.ruleDont }, plan: nodes(f.plan) }, null, 2);
}
// 客户端解析契约 json（手动粘贴用）：容忍 ```json 围栏/注释/尾逗号，扫描平衡 {...}；
// research/规则写成对象/数组也接住(转成文字)。解析不出返回 null。
function parseCharterText(text: string): { research: string; ruleDo: string; ruleDont: string; plan: import("./env").PlanStep[] } | null {
  const tryParse = (s: string): any => {
    if (!s || !s.trim()) return null;
    const cl = s.replace(/\/\/[^\n\r]*/g, "").replace(/,(\s*[}\]])/g, "$1");
    for (const c of [s, cl]) { try { const o = JSON.parse(c); if (o && typeof o === "object") return o; } catch { /* 下一个 */ } }
    return null;
  };
  let d: any = null;
  const fences = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  for (let i = fences.length - 1; i >= 0 && !d; i--) d = tryParse(fences[i]);
  if (!d) { const anyF = [...text.matchAll(/```[a-z]*\s*([\s\S]*?)```/gi)].map((m) => m[1]).filter((s) => s.includes("{")); for (let i = anyF.length - 1; i >= 0 && !d; i--) d = tryParse(anyF[i]); }
  if (!d) {
    const objs: string[] = []; let dep = 0, st = -1;
    for (let i = 0; i < text.length; i++) { const c = text[i]; if (c === "{") { if (dep === 0) st = i; dep++; } else if (c === "}") { if (dep > 0) { dep--; if (dep === 0 && st >= 0) { objs.push(text.slice(st, i + 1)); st = -1; } } } }
    for (let i = objs.length - 1; i >= 0 && !d; i--) { const o = tryParse(objs[i]); if (o && (o.research !== undefined || o.plan !== undefined || o.计划 !== undefined)) d = o; }
    for (let i = objs.length - 1; i >= 0 && !d; i--) d = tryParse(objs[i]);
  }
  if (!d) return null;
  const S = (v: any) => (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v)); // 对象/数组→文字，容错
  return {
    research: S(d.research ?? d.调研),
    ruleDo: S(d.rules?.do ?? d.do ?? d.要做),
    ruleDont: S(d.rules?.dont ?? d.dont ?? d.不做 ?? d.绝不做),
    plan: draftNodesToPlan(d.plan ?? d.计划),
  };
}
// 调研实时进度：把一次工具调用翻成人话("正在搜索：xxx"/"正在读网页：xxx")，喂进弹窗提示框
// researchToolLabel 已抽到 ./toolLabel.js（主对话进度 + AI 员工进度共用同一套措辞）。

// 一沾这些就别替用户拿主意——宁可停下来等人，也不能自动替他决定
const RISKY_ASK = /删除|清空|覆盖|抹掉|销毁|上线|发布|部署|生产|正式环境|prod\b|线上|付款|支付|下单|花钱|转账|发邮件|发消息|通知(客户|用户|大家)|授权|权限|密钥|token|密码|回滚|重置|drop\s+table|truncate|rm\s+-rf|强制推送|force\s*push/i;
// 自定义红线拆成"一行一条"。**只按换行拆**，绝不再按顿号拆——
// 一行是一个完整意思(如"删除或清空任何数据、文件、数据库表、代码分支")，
// 顿号是这条意思内部的列举，拆开会把"文件"这种词变成独立关键词导致误伤。
function splitRules(rules: string): string[] {
  return (rules || "").split(/\n+/).map((s) => s.trim()).filter((s) => s.length >= 2);
}
/** 这道题能不能超时自动替他答：内置危险词 + 用户自己写的红线，命中任一就返回 0(死等)。
 *  关键词模式下自定义红线只做"整行字面包含"匹配(描述性的行不会误伤;要按意思拦请用智能识别)。 */
function askAutoSecFor(qs: any[], sec: number, rules = ""): number {
  if (!sec || sec <= 0) return 0;
  const lines = splitRules(rules);
  for (const q of qs || []) {
    const blob = [q.question, q.header, ...(q.options || []).map((o: any) => `${o.label} ${o.description || ""}`)].join(" ");
    if (RISKY_ASK.test(blob)) return 0;
    if (lines.some((line) => blob.includes(line))) return 0;
  }
  return sec;
}
/** 命中了哪条红线：返回 {word, src}。src=builtin(内置)/custom(自定义)/smart(智能识别)。没命中返回 null。
 *  给弹窗做灰字提示用——让用户知道"为啥没自动倒计时"，好决定要不要去调红线。 */
function riskyHitOf(qs: any[], rules = ""): { word: string; src: "builtin" | "custom" | "smart" } | null {
  const lines = splitRules(rules);
  for (const q of qs || []) {
    const blob = [q.question, q.header, ...(q.options || []).map((o: any) => `${o.label} ${o.description || ""}`)].join(" ");
    const m = blob.match(RISKY_ASK);
    if (m) return { word: m[0], src: "builtin" };
    const line = lines.find((x) => blob.includes(x));
    if (line) return { word: line.length > 16 ? line.slice(0, 16) + "…" : line, src: "custom" };
  }
  return null;
}

// 从服务端报错里抠出它真正认的上下文上限（"prompt is too long: 303245 tokens > 200000 maximum"）。
// 各家订阅通道的实际窗口未必等于模型标称值(如 Claude 订阅给不到 API 的 1M)，与其在客户端猜，
// 不如报错一次就把真值学下来，回填占用条——从此显示的就是这条链路的真实上限。
function parseServerCtxLimit(raw: string): number {
  const m = (raw || "").match(/(?:prompt is too long|too many tokens)[:\s]*[\d,]+\s*tokens\s*>\s*([\d,]+)/i);
  if (m) return Number(m[1].replace(/,/g, "")) || 0;
  const m2 = (raw || "").match(/maximum context length is\s*([\d,]+)/i);
  return m2 ? Number(m2[1].replace(/,/g, "")) || 0 : 0;
}

// 把后端/SDK 的原始报错（多为英文）归纳成一句中文提示，避免把整段英文甩给用户。
// 返回值以「出错：」开头，鉴权类务必含 isAuthError 能识别的关键词（未授权/凭证），以便触发一键授权条。
function friendlyError(raw: string, t: T, freeModel = true): string {
  const r = raw || "";
  // 无为托管网关的业务错误 → 友好文案（优先，避免被下方通用 401/429 规则吃掉）
  if (/anon_login_required|anon_not_allowed/i.test(r)) return t("ui.app.sign.in.to.use.this.model.8ff2e81");
  if (/insufficient_balance/i.test(r)) return t("err.insufficientBalance");
  if (/free_quota_exhausted/i.test(r)) return t("err.freeQuota");
  if (/free_trial_disabled/i.test(r)) return t("err.freeDisabled");
  if (/\bdaily_cap_reached\b/i.test(r) && !freeModel) return t("err.paidDailyCap");
  if (/daily_cap_reached/i.test(r)) return t("err.dailyCap");
  if (/gateway_not_configured/i.test(r)) return t("err.gatewayNotConfigured");
  if (/unknown_hosted_model/i.test(r)) return t("err.unknownModel");
  if (/upstream_rate_limited/i.test(r)) return t("err.providerRateLimited");
  if (/upstream_error/i.test(r)) return t("err.upstream");
  // 模型名不对（自建/中转端点没有该模型）：常见于切到「自建端点」却没填模型，默认名在该端点不存在。
  // 明确指路去设置改模型名，而不是甩一句 "model 'xxx' not found 404"。
  if (/no such model|model[\s'"]*[\w.\-/]*[\s'"]*(not found|does not exist)|model_not_found|unknown[_ ]model|invalid model/i.test(r))
    return t("err.modelNotFound");
  if (/gateway_error[\s\S]*(invalid_token|no_token)/i.test(r))
    return t("err.tokenExpired");
  if (/authentication method|apiKey or authToken|x-api-key|unauthorized|\b401\b|invalid.*key|api key|no credentials|isn't authorized|not authorized|未配置凭证/i.test(r))
    return t("err.auth");
  // 上下文超限：必须排在限流规则之前。服务端原文常含 "exceed"，会被下面的 429 规则误吞成「触发限流」，
  // 于是用户干等半天也没用——真正的解法是开新会话或删消息。能解析出数字就把「已用/上限」摆出来。
  const ctxOver = r.match(/(?:prompt is too long|too many tokens)[:\s]*([\d,]+)\s*tokens\s*>\s*([\d,]+)/i);
  if (
    ctxOver ||
    /context[_ ](length|window|limit)|context length|model_context_window_exceeded|input length and max_tokens exceed|maximum context/i.test(r)
  ) {
    const head = t("err.ctxOverflow");
    const tip = t("err.ctxOverflowTip");
    if (ctxOver) {
      const used = fmtTok(Number(ctxOver[1].replace(/,/g, "")));
      const max = fmtTok(Number(ctxOver[2].replace(/,/g, "")));
      return `${head}（${t("err.ctxUsed")} ${used} / ${t("err.ctxLimit")} ${max}）${tip}`;
    }
    return head + tip;
  }
  // 限流：去掉了原先过宽的 exceed/quota——它们把上下文超限也吞进来了，导致提示完全误导。
  if (/rate.?limit|\b429\b|too many requests|retry.?after|overloaded_error|quota/i.test(r))
    return t("err.rateLimit");
  // 长回复被中途切断（undici 的 TypeError: terminated / premature close 等）：
  // 网关已做退避重连+路由兜底，还走到这里说明确实没救回来 → 明确告诉用户「回复继续即可接着做」，别甩英文原文。
  if (/\bterminated\b|premature close|other side closed|aborted|ECONNABORTED/i.test(r))
    return t("err.interrupted");
  if (/timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|network|fetch failed|socket hang/i.test(r))
    return t("err.network");
  // 上下文超长已在上面单独处理，这里只剩真正的请求错误(模型名/参数)
  if (/\b400\b|invalid_request|bad request/i.test(r))
    return t("err.badRequest");
  if (/\b5\d\d\b|server error|internal error|overloaded/i.test(r))
    return t("err.server");
  // 未知错误：剥掉机器错误码标记后，只取首行 + 截断，加前缀，不整段英文轰炸
  const clean = r.replace(/\[\[gw:[a-z_]+\]\]\s*/i, "");
  return t("err.prefix") + (clean.split("\n")[0] || clean).slice(0, 120);
}

// 从错误里取网关稳定错误码（provider.ts 用 [[gw:code]] 机器标记带过来）。语言无关。
function gatewayCode(raw: string): string {
  return (String(raw || "").match(/\[\[gw:([a-z_]+)\]\]/i)?.[1] || "").toLowerCase();
}
// 无为币不足 / 免费额度用尽 → 该弹一元体验/升级窗。**只按错误码判定**，不匹配任何中英文案（脆）。
function isCoinShortage(raw: string): boolean {
  const code = gatewayCode(raw);
  if (code) return code === "insufficient_balance" || code === "free_daily_cap_reached";
  // 兜底：没有机器标记的旧格式/非网关错误，仍认错误码关键词（不认人读文案）
  return /insufficient_balance|free_daily_cap_reached/i.test(raw || "");
}

// 粗判是否像 API Key：无空白、可见 ASCII、够长(真正闸门是连通测试)
function isLikelyKey(s: string): boolean {
  const t = (s || "").trim();
  return t.length >= 20 && t.length <= 400 && !/\s/.test(t) && /^[\x21-\x7e]+$/.test(t);
}

// 验证失败时：报错是否说明「Key 本身无效」(鉴权失败)。
// 只有这种才拒绝保存；余额不足/额度/账单/限流等 = Key 有效、账户问题 → 照样保存并提醒。
function keyRejected(reason: string): boolean {
  return /\b401\b|authentication_error|invalid[_ ]?api[_ ]?key|invalid x-api-key|unauthorized|permission_error|api key not valid|no auth/i.test(
    reason || "",
  );
}

// 报错文案是否属于「缺鉴权」（据此显示一键授权条；兼容英文原文与翻译后的中文）
function isAuthErrorText(text: string): boolean {
  return /authentication method|apiKey or authToken|x-api-key|unauthorized|401|no credentials|isn't authorized|not authorized|缺少模型凭证|未初始化|未授权|未配置凭证|缺少凭证|授权/i.test(
    text,
  );
}

// 无为 主标·橙色 sparkle 星星（沿用初版 app 图标的四角星几何，缩放到 24 视口；
// 主星 currentColor 随主题走，右上小星用一点朱 --spark 呼应品牌）
// 无为官方主标（几何同 WuweiLogo / 官网 WuMark：同 path、不旋转、stroke 12/dot 10）。
// 顶栏用 currentColor 描边以适配文字色，缺口处一点朱赭火种。
function WuweiMark({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 240 240"
      fill="none"
      aria-hidden="true"
      style={{ flex: "0 0 auto" }}
    >
      <path
        d="M152.04 193.48 A82 82 0 1 1 195.48 150.04"
        stroke="currentColor"
        strokeWidth="12"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="195.48" cy="150.04" r="10" fill="#C05F3C" />
    </svg>
  );
}

// —— 简约 SVG 图标（禁用 emoji，统一线性风、跟随 currentColor）——
// 主题已收敛为单一白色：不再提供切换，任何存量值(dark/gold/空)一律白色。
function resolveTheme(_t?: string): string {
  return "light";
}
// 签到（未签）：日历 + 加号；已签：日历 + 对勾。线性 currentColor，无为简约风。
function CheckinIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "0 0 auto" }}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3M12 12.2v4M10 14.2h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CheckinDoneIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "0 0 auto" }}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3M9 14l2.2 2.2L15.5 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CoinIcon({ size = 14 }: { size?: number }) {
  // 币：填充淡底 + 描边 + ¥ 记号，比双环更像“货币”
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "0 0 auto" }}>
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.16" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.4 8l3.6 4 3.6-4M12 12v4.2M9.2 12.4h5.6M9.2 14.6h5.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
// 无为官方主标「一念之门圆相」（精确复刻 wuwei-site LandNav 的 WuMark：同 path、不旋转、stroke 12/dot 10）。
// 用于浅色登录面：描边玄墨黑，朱赭火种点。
function WuweiLogo({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 240 240" aria-hidden="true" style={{ flex: "0 0 auto", display: "block" }}>
      <path
        d="M152.04 193.48 A82 82 0 1 1 195.48 150.04"
        fill="none"
        stroke="currentColor"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <circle cx="195.48" cy="150.04" r="10" fill="#C05F3C" />
    </svg>
  );
}

// ── 付费三界面 v2（定稿 2026-07-30）：共用组件 + SKU/套餐数据（朱=积分包 / 金=会员）──
function PayEnso({ size = 50 }: { size?: number }) {
  return (
    <svg className="pay-enso" viewBox="0 0 240 240" width={size} height={size} aria-hidden="true">
      <g transform="rotate(-8 120 118)">
        <path d="M152.04 193.48 A82 82 0 1 1 195.48 150.04" fill="none" stroke="#16191E" strokeWidth="9.5" strokeLinecap="round" />
        <circle cx="195.48" cy="150.04" r="7.6" fill="#C05F3C" />
      </g>
    </svg>
  );
}
function PaySpark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ flex: "0 0 auto" }}>
      <path d="M8 1.4l1.5 5.1 5.1 1.5-5.1 1.5L8 14.6 6.5 9.5 1.4 8l5.1-1.5z" />
    </svg>
  );
}
function PayCloseX({ onClick }: { onClick: () => void }) {
  return (
    <button className="pay-x" aria-label={makeT(getLang())("msg.close")} onClick={onClick}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
    </button>
  );
}
function PayArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3l5 5-5 5" />
    </svg>
  );
}
function PackIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

// 价格显示：EN 显示美元、CN 显示人民币。仅影响展示；实收金额始终以后端按 sku 查表为准。
const money = (en: boolean, cn: number, usd: number): string => (tr("ui.app.text.2093f49", { v0: (en ? undefined : cn), v1: (en ? usd : undefined) }));
// 加密支付(NOWPayments)最低档：配了 USDT-SOL + USDT-TRC20 两个 payout 钱包后，
// 便宜链(Solana/BSC)免换汇 floor 降到 ~$2，故加密按钮在 ≥$3 的档都显示(pack_s $3.99 起)；
// 仅 $1 trial 够不着($1<$2)，由弹窗底部说明统一讲清。
const CRYPTO_MIN_USD = 3;
// 文案分档：≥$13 多币自选(含 BTC/TRX)；<$13 小额档引导选低费稳定币(Solana/BSC,BTC/TRX 最低额够不着)。
const CRYPTO_MULTICOIN_USD = 13;
// 客户端(人民币)sku → 网页 Paddle 的美元 sku。英文用户走网页结账(系统浏览器)。
const EN_SKU: Record<string, string> = {
  plan_trial: "plan_trial_en", // $1 · 7天 Pro 体验（海外 Paddle，待建价后可用）
  plan_pro: "plan_pro_en",
  plan_pro_5x: "plan_plus_en",
  plan_pro_20x: "plan_ultra_en",
  plan_pro_50x: "plan_max_en",
  pack_s: "pack_s_en",
  pack_m: "pack_m_en",
  pack_l: "pack_l_en",
  pack_xl: "pack_xl_en",
  pack_100: "pack_test_en", // $1 测试档（海外 Paddle）
};
// sku：下单时传给后端，服务端据此查金额/币量（价格以后端为准，绝不信任客户端）。价/币量已对齐 wuwei-site coin_catalog。
type CoinPack = { sku: string; coins: number; bonus: number; price: number; priceUsd: number; desc: string; descEn: string; badge?: string; badgeEn?: string; badgeType?: "rec" | "val" };
// 积分包（按需充值，价对齐库：pack_s/m/l = ¥19/69/199 · $3.99/12.99/39.99，币量 800/3000/9000 CN=EN）。
const COIN_PACKS: CoinPack[] = [
  { sku: "pack_s", coins: 800, bonus: 0, price: 19, priceUsd: 3.99, get desc() { return tr("ui.catalog.app.8936b78243"); }, get descEn() { return tr("ui.catalog.app.8936b78243"); } },
  { sku: "pack_m", coins: 3000, bonus: 0, price: 69, priceUsd: 12.99, get desc() { return tr("ui.app.message.1fe010ea8e"); }, get descEn() { return tr("ui.app.message.1fe010ea8e"); }, get badge() { return tr("model.badge.11"); }, get badgeEn() { return tr("model.badge.11"); }, badgeType: "rec" },
  { sku: "pack_l", coins: 9000, bonus: 0, price: 199, priceUsd: 39.99, get desc() { return tr("ui.catalog.app.348f89853c"); }, get descEn() { return tr("ui.catalog.app.348f89853c"); }, get badge() { return tr("ui.app.message.a282fdf96e"); }, get badgeEn() { return tr("ui.app.message.a282fdf96e"); }, badgeType: "val" },
  { sku: "pack_xl", coins: 20000, bonus: 0, price: 399, priceUsd: 79.99, get desc() { return tr("ui.catalog.app.1dc24fc841"); }, get descEn() { return tr("ui.catalog.app.1dc24fc841"); } },
];
// 测试专用档：仅当后端 flags 含 "coinpack_test" 时展示。CN ¥1 / EN $1（海外走 Paddle pack_test_en）。
const TEST_COIN_PACK: CoinPack = { sku: "pack_100", coins: 100, bonus: 0, price: 1, priceUsd: 1, get desc() { return tr("ui.catalog.app.2807bbf022"); }, get descEn() { return tr("ui.catalog.app.2807bbf022"); }, get badge() { return tr("ui.app.test.d2d526c"); }, get badgeEn() { return tr("ui.app.test.d2d526c"); }, badgeType: "val" };
// 月付阶梯（价/币量/签到 对齐库 coin_catalog）：CN plan_pro/5x/50x = ¥29/99/899；EN pro/plus/max = $6.99/19.99/199。
type ProPlan = { id: "pro" | "pro5x" | "pro20x" | "pro50x"; sku: string; name: string; nameEn: string; price: number; priceUsd: number; unit: string; unitEn: string; coins: number; coinsEn: number; signin: number; saved: number; sub: string; subEn: string; note: string; noteEn: string; tag: string; tagEn: string; tagType: "rec" | "pop" };
// ── 思考档位（effort）──────────────────────────────────────────────
// 档位越高，模型思考越深、工具调用越多、前言越长，也就越慢越贵；降档能明显缩短单步耗时，
// 在服务端有函数时长上限时，这是「一次跑完 vs 中途被掐断」的关键开关。
type Effort = "low" | "medium" | "high" | "xhigh" | "max";
// 认这个参数的模型：Claude 4.5 以后（含 Sonnet 4.6/5、Opus 4.5~5、Fable/Mythos）与 GPT-5 / o 系。
// 其它模型不显示选择器，免得给了个按了没反应的开关。
const EFFORT_MODELS = /claude-(opus-4-[5-9]|opus-[5-9]|sonnet-[5-9]|sonnet-4-6|fable|mythos)|gpt-5|\bo3\b|\bo4\b/i;
const EFFORT_OPTIONS: { id: Effort; zh: string; en: string; zhDesc: string; enDesc: string }[] = [
  { id: "low", get zh() { return tr("model.badge.6"); }, get en() { return tr("model.badge.6"); }, get zhDesc() { return tr("ui.catalog.app.8480d3df03"); }, get enDesc() { return tr("ui.catalog.app.8480d3df03"); } },
  { id: "medium", get zh() { return tr("ui.app.message.5081d3292b"); }, get en() { return tr("ui.app.message.5081d3292b"); }, get zhDesc() { return tr("ui.catalog.app.4500427316"); }, get enDesc() { return tr("ui.catalog.app.4500427316"); } },
  { id: "high", get zh() { return tr("ui.helpmanualmodal.deep.cb03d15"); }, get en() { return tr("ui.helpmanualmodal.deep.cb03d15"); }, get zhDesc() { return tr("ui.catalog.app.8312203e33"); }, get enDesc() { return tr("ui.catalog.app.8312203e33"); } },
  { id: "xhigh", get zh() { return tr("ui.helpmanualmodal.deeper.96029be"); }, get en() { return tr("ui.helpmanualmodal.deeper.96029be"); }, get zhDesc() { return tr("ui.catalog.app.c284828dc5"); }, get enDesc() { return tr("ui.catalog.app.c284828dc5"); } },
  { id: "max", get zh() { return tr("ui.helpmanualmodal.max.70a555c"); }, get en() { return tr("ui.helpmanualmodal.max.70a555c"); }, get zhDesc() { return tr("ui.catalog.app.92f766edac"); }, get enDesc() { return tr("ui.catalog.app.92f766edac"); } },
];
function effortLabel(e: Effort, lang: string): string {
  const o = EFFORT_OPTIONS.find((x) => x.id === e);
  if (!o) return e;
  return lang !== "zh" ? o.en : o.zh;
}

// 订阅版模型显示名(Claude/Codex 订阅是硬编码 preset，无 catalog label)：统一格式，避免下拉里
// 一会儿 "GPT-5.6 Terra"(空格) 一会儿 "gpt-5.6-sol"(连字符) 混着显示。优先级高于 catalog label。
const MODEL_LABEL_OVERRIDES: Record<string, string> = {
  // Codex(GPT) 订阅
  "gpt-5.6-sol": "GPT-5.6 Sol",
  "gpt-5.6-terra": "GPT-5.6 Terra",
  "gpt-5.6-luna": "GPT-5.6 Luna",
  "gpt-6-astra": "GPT-6 Astra",
  "gpt-5.5": "GPT-5.5",
  // Claude 订阅
  "claude-opus-5": "Claude Opus 5",
  "claude-sonnet-5": "Claude Sonnet 5",
  "claude-fable-5-1": "Claude Fable 5.1",
  "claude-fable-5": "Claude Fable 5",
  "claude-opus-4-8": "Claude Opus 4.8",
  "claude-opus-4-7": "Claude Opus 4.7",
  "claude-opus-4-6": "Claude Opus 4.6",
  "claude-sonnet-4-6": "Claude Sonnet 4.6",
  "claude-haiku-4-5": "Claude Haiku 4.5",
  // 无为托管·智谱 GLM：统一 GLM 开头、去掉「智谱」中文前缀
  "glm-5.3": "GLM-5.3",
  "glm-5.3-flash": "GLM-5.3 Flash",
  "glm-5.2": "GLM-5.2",
};

const PRO_PLANS: ProPlan[] = [
  { id: "pro", sku: "plan_pro", get name() { return tr("ui.app.message.82a963bba6"); }, get nameEn() { return tr("ui.app.message.82a963bba6"); }, price: 29, priceUsd: 6.99, get unit() { return tr("ui.billingpanel.mo.00fb449"); }, get unitEn() { return tr("ui.billingpanel.mo.00fb449"); }, coins: 1000, coinsEn: 2000, signin: 20, saved: 0, get sub() { return tr("ui.catalog.app.b7198ddd25"); }, get subEn() { return tr("ui.catalog.app.b7198ddd25"); }, note: "", noteEn: "", get tag() { return tr("plan.tag.starter"); }, get tagEn() { return tr("plan.tag.starter"); }, tagType: "pop" },
  { id: "pro5x", sku: "plan_pro_5x", get name() { return tr("ui.app.message.b57b61b0d8"); }, get nameEn() { return tr("ui.app.message.b57b61b0d8"); }, price: 99, priceUsd: 19.99, get unit() { return tr("ui.billingpanel.mo.00fb449"); }, get unitEn() { return tr("ui.billingpanel.mo.00fb449"); }, coins: 5000, coinsEn: 6000, signin: 40, saved: 25, get sub() { return tr("ui.catalog.app.4c8e1e2185"); }, get subEn() { return tr("ui.catalog.app.4c8e1e2185"); }, get note() { return tr("ui.app.message.4a55d4c988"); }, get noteEn() { return tr("ui.app.message.4a55d4c988"); }, get tag() { return tr("plan.tag.popular"); }, get tagEn() { return tr("plan.tag.popular"); }, tagType: "rec" },
  { id: "pro20x", sku: "plan_pro_20x", get name() { return tr("ui.app.message.8cbcb46044"); }, get nameEn() { return tr("ui.app.message.8cbcb46044"); }, price: 379, priceUsd: 99, get unit() { return tr("ui.billingpanel.mo.00fb449"); }, get unitEn() { return tr("ui.billingpanel.mo.00fb449"); }, coins: 20000, coinsEn: 30000, signin: 70, saved: 201, get sub() { return tr("ui.catalog.app.e1bf93d9fd"); }, get subEn() { return tr("ui.catalog.app.e1bf93d9fd"); }, get note() { return tr("ui.app.message.44fb802788"); }, get noteEn() { return tr("ui.app.message.44fb802788"); }, get tag() { return tr("plan.tag.teams"); }, get tagEn() { return tr("plan.tag.teams"); }, tagType: "pop" },
  { id: "pro50x", sku: "plan_pro_50x", get name() { return tr("ui.app.message.6a060337ee"); }, get nameEn() { return tr("ui.app.message.6a060337ee"); }, price: 899, priceUsd: 199, get unit() { return tr("ui.billingpanel.mo.00fb449"); }, get unitEn() { return tr("ui.billingpanel.mo.00fb449"); }, coins: 50000, coinsEn: 70000, signin: 100, saved: 899, get sub() { return tr("ui.catalog.app.e1cc250805"); }, get subEn() { return tr("ui.catalog.app.e1cc250805"); }, get note() { return tr("ui.app.message.3b1680e6c3"); }, get noteEn() { return tr("ui.app.message.3b1680e6c3"); }, get tag() { return tr("plan.tag.allIn"); }, get tagEn() { return tr("plan.tag.allIn"); }, tagType: "rec" },
];
const PRO_FEATS = (): [string, string][] => [
  [tr("ui.app.message.c6e59eafb0"), tr("ui.app.message.7f405af902")],
  [tr("ui.app.message.54c0be8fb0"), tr("ui.app.message.45f180389c")],
  [tr("ui.app.message.81201e2e2d"), tr("ui.app.message.ebce2025c6")],
  [tr("ui.app.message.ba8bdd249d"), tr("ui.app.message.67835db973")],
];


// 缺币弹窗里的「并排可选套餐」：¥1 体验 + Pro/Plus/Max 月付，统一成一种可选项，选中谁就驱动二维码/Paddle 与右侧详情。
type PayPlanOpt = {
  sku: string;
  kind: "trial" | "plan" | "pack";
  name: string; nameEn: string;
  price: number; priceUsd: number;
  unit: string; unitEn: string; // "/7天" | "/月"
  days: number; // 7=体验 / 30=月付，用于成功页到期
  coins: number; // 赠币/额度（成功页展示）
  signin: number;
  badge?: string; badgeEn?: string; badgeType?: "rec" | "val";
  sub: string; subEn: string; // 一句话卖点
  saved?: number;
};
// trialEligible=从未付费 → 首位放 ¥1 体验（默认选中）；已付费用户不含体验档，默认最受欢迎档。
function buildPayOpts(trialEligible: boolean): PayPlanOpt[] {
  const trial: PayPlanOpt = {
    sku: "plan_trial", kind: "trial", get name() { return tr("ui.catalog.app.8503e2ece3"); }, get nameEn() { return tr("ui.catalog.app.8503e2ece3"); },
    price: 1, priceUsd: 1, get unit() { return tr("ui.catalog.app.c088b60621"); }, get unitEn() { return tr("ui.catalog.app.c088b60621"); }, days: 7, coins: 0, signin: 20,
    get badge() { return tr("ui.catalog.app.5b9b5ae6bc"); }, get badgeEn() { return tr("ui.catalog.app.5b9b5ae6bc"); }, badgeType: "val",
    get sub() { return tr("ui.catalog.app.0a8a0e0417"); }, get subEn() { return tr("ui.catalog.app.0a8a0e0417"); },
  };
  const plans = PRO_PLANS.map<PayPlanOpt>((p) => ({
    sku: p.sku, kind: "plan", name: p.name, nameEn: p.nameEn,
    price: p.price, priceUsd: p.priceUsd, unit: p.unit, unitEn: p.unitEn, days: 30,
    coins: p.coins, signin: p.signin,
    badge: p.tagType === "rec" ? p.tag : undefined, badgeEn: p.tagType === "rec" ? p.tagEn : undefined,
    badgeType: p.tagType === "rec" ? "rec" : undefined,
    sub: p.sub, subEn: p.subEn, saved: p.saved || undefined,
  }));
  // 保持一排 4 张：新用户(有体验资格)= ¥1 + Pro/Plus/Max(去掉 Ultra 大档，团队档对新用户意义不大)；
  //                老用户/已付费 = Pro/Plus/Ultra/Max 完整阶梯。
  if (trialEligible) return [trial, ...plans.filter((p) => p.sku !== "plan_pro_20x")];
  return plans;
}
const PAYOPT_DEFAULT_SKU = (trialEligible: boolean) => (trialEligible ? "plan_trial" : "plan_pro_5x");
// 积分包档（按需充值、永久有效）转成统一可选项，供缺币弹窗「积分包」tab 并排展示。
function buildPackOpts(): PayPlanOpt[] {
  return COIN_PACKS.map((p) => ({
    sku: p.sku, kind: "pack" as const, name: tr("ui.app.message.3e209a50a7", {p0: p.coins.toLocaleString()}), nameEn: `${p.coins.toLocaleString()} credits`,
    price: p.price, priceUsd: p.priceUsd, unit: "", unitEn: "", days: 0,
    coins: p.coins, signin: 0,
    badge: p.badge, badgeEn: p.badgeEn, badgeType: p.badgeType,
    sub: p.desc, subEn: p.descEn,
  }));
}
const PACK_PERKS = (): [string, string][] => [
  [tr("ui.app.message.82b49ff7d0"), tr("ui.app.message.2ff39ec6de")],
  [tr("ui.app.message.c064fa3621"), tr("ui.app.message.30d30fe4c8")],
  [tr("ui.app.message.6f47607b6c"), tr("ui.app.message.8a214124e2")],
];


// ② 购买积分包（朱系）：站内选档；CN 走扫码，EN 走网页 Paddle 结账。
function CoinPackModal({ packs, onClose, onCheckout, onUpgrade, t, lang }: { packs: CoinPack[]; onClose: () => void; onCheckout: (pack: CoinPack) => void; onUpgrade: () => void; t: T; lang: Lang }) {
  const en = lang !== "zh";
  const [sel, setSel] = useState(() => { const i = packs.findIndex((x) => x.badgeType === "rec"); return i >= 0 ? i : 0; }); // 默认选中"推荐"档
  const p = packs[sel];
  const shownAt = useRef(Date.now());
  const dwell = () => Date.now() - shownAt.current;
  const close = () => { void window.wuwei.track?.("buy_credits_popup_closed", { dwell_ms: dwell() }); onClose(); };
  return (
    <div className="perm-overlay pay-overlay" onClick={close}>
      <div className="pay-card" onClick={(e) => e.stopPropagation()}>
        <PayCloseX onClick={close} />
        <div className="pay-top">
          <PayEnso />
          <h2>{t("pay.coinpack.title")}</h2>
          <p>{t("pay.coinpack.sub")}</p>
        </div>
        <div className="pay-rows">
          {packs.map((pack, i) => (
            <button key={pack.coins} className={"pay-rw" + (i === sel ? " sel" : "")} onClick={() => { setSel(i); void window.wuwei.track?.("buy_credits_pack_select", { sku: pack.sku, price: pack.price, dwell_ms: dwell() }); }}>
              {pack.badge && <span className={"pay-rbadge " + pack.badgeType}>{en ? pack.badgeEn : pack.badge}</span>}
              <span className="pay-rw-ic">
                <PackIcon />
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="pay-amt">
                  {pack.coins.toLocaleString()}
                  <span className="u"> {t("pay.credits")}</span>
                </span>
                <span className="pay-desc" style={{ display: "block" }}>
                  {en ? pack.descEn : pack.desc}
                  {pack.bonus > 0 && <em> +{pack.bonus} {t("pay.bonusWord")}</em>}
                </span>
              </span>
              <span className="pay-price">{money(en, pack.price, pack.priceUsd)}</span>
            </button>
          ))}
        </div>
        <button className="pay-cta red" onClick={() => { void window.wuwei.track?.("buy_credits_click", { sku: p.sku, price: p.price, dwell_ms: dwell() }); onCheckout(p); }}>
          {t("pay.coinpack.ctaPrefix")} {money(en, p.price, p.priceUsd)}
        </button>
        <div className="pay-cancel">
          <button onClick={onUpgrade} style={{ color: "#A97F2E", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <PaySpark size={12} /> {t("pay.coinpack.upgrade")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ③ 升级无为 Pro（金系）：档位选择 + 2×2 权益；CN 走扫码，EN 走网页 Paddle 结账。
function PlanModal({ onClose, onCheckout, t, lang }: { onClose: () => void; onCheckout: (plan: ProPlan) => void; t: T; lang: Lang }) {
  const en = lang !== "zh";
  const [sel, setSel] = useState<ProPlan["id"]>("pro5x");
  const selPlan = PRO_PLANS.find((x) => x.id === sel)!;
  const feats = PRO_FEATS();
  const shownAt = useRef(Date.now()); // 弹窗打开时刻，算停留时长
  const dwell = () => Date.now() - shownAt.current;
  // 叉掉/点空白关闭（未购买）：记停留时长，后台据此看「看了多久就走」
  const close = () => { void window.wuwei.track?.("upgrade_member_popup_closed", { dwell_ms: dwell() }); onClose(); };
  return (
    <div className="perm-overlay pay-overlay" onClick={close}>
      <div className="pay-card plan" onClick={(e) => e.stopPropagation()}>
        <PayCloseX onClick={close} />
        <div className="pay-top">
          <PayEnso />
          <h2>{t("pay.plan.title")}</h2>
          <p>{t("pay.plan.sub")}</p>
        </div>
        <div className="pay-plans">
          {PRO_PLANS.map((plan) => (
            <button key={plan.id} className={"pay-pc" + (plan.id === sel ? " sel" : "")} onClick={() => { setSel(plan.id); void window.wuwei.track?.("upgrade_tier_select", { tier: plan.name, dwell_ms: dwell() }); }}>
              <span className={"pay-tag " + plan.tagType}>{en ? plan.tagEn : plan.tag}</span>
              <span className="pay-pc-r1">
                <span className="pay-pc-nm">
                  <PaySpark size={13} /> {en ? plan.nameEn : plan.name}
                </span>
                <span className="pay-pc-pr">
                  {money(en, plan.price, plan.priceUsd)}
                  <span className="u">{en ? plan.unitEn : plan.unit}</span>
                </span>
              </span>
              <span className="pay-pc-r2" style={{ display: "block" }}>
                {en ? plan.subEn : plan.sub}
                {(en ? plan.noteEn : plan.note) && (
                  <>
                    {" · "}
                    <em>{en ? plan.noteEn : plan.note}</em>
                  </>
                )}
              </span>
            </button>
          ))}
        </div>
        <div className="pay-feats">
          {feats.map(([tt, ss]) => (
            <div key={tt} className="pay-f">
              <div className="pay-ft">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {tt}
              </div>
              <div className="pay-fs">{ss}</div>
            </div>
          ))}
        </div>
        <button className="pay-cta gold" onClick={() => { void window.wuwei.track?.("upgrade_member_click", { plan: selPlan.name, dwell_ms: dwell() }); onCheckout(selPlan); }}>
          {t("pay.plan.cta").replace("{name}", en ? selPlan.nameEn : selPlan.name).replace("{p}", en ? String(selPlan.priceUsd) : String(selPlan.price))}
        </button>
        <div className="pay-fnote">
          <span className="ok">✓</span> {t("pay.plan.footAny")}　<span className="ok">✓</span> {t("pay.plan.footSame")}
        </div>
      </div>
    </div>
  );
}
// 付费闭环辅助
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addMonths(base: Date, n: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + n);
  return d;
}
// 占位二维码（后端下单后替换为真实收款码）
function QrPlaceholder() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <rect width="100" height="100" fill="#fff" />
      <g fill="#16191E">
        <rect x="6" y="6" width="26" height="26" /><rect x="12" y="12" width="14" height="14" fill="#fff" /><rect x="16" y="16" width="6" height="6" />
        <rect x="68" y="6" width="26" height="26" /><rect x="74" y="12" width="14" height="14" fill="#fff" /><rect x="78" y="16" width="6" height="6" />
        <rect x="6" y="68" width="26" height="26" /><rect x="12" y="74" width="14" height="14" fill="#fff" /><rect x="16" y="78" width="6" height="6" />
        <rect x="40" y="10" width="6" height="6" /><rect x="52" y="10" width="6" height="6" /><rect x="40" y="22" width="6" height="6" /><rect x="60" y="40" width="6" height="6" /><rect x="72" y="40" width="6" height="6" /><rect x="84" y="52" width="6" height="6" /><rect x="40" y="40" width="6" height="6" /><rect x="48" y="48" width="6" height="6" /><rect x="40" y="60" width="6" height="6" /><rect x="52" y="64" width="6" height="6" /><rect x="64" y="60" width="6" height="6" /><rect x="72" y="72" width="6" height="6" /><rect x="84" y="72" width="6" height="6" /><rect x="60" y="84" width="6" height="6" /><rect x="48" y="84" width="6" height="6" />
      </g>
    </svg>
  );
}

type PayOrder = { kind: "pack"; pack: CoinPack } | { kind: "plan"; plan: ProPlan };
// 支付宝图标：官方矢量 logo(蓝底+白色变形"支"，来源 Simple Icons)。.ico 仅 32px 高分屏会糊，用 SVG 保清晰
function AlipayMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" style={{ borderRadius: 9, flex: "0 0 auto", display: "block" }} role="img" aria-label={tr("ui.app.alipay.8f0430e")}>
      <rect width="24" height="24" rx="4" fill="#fff" />
      <path fill="#1677FF" d="M19.695 15.07c3.426 1.158 4.203 1.22 4.203 1.22V3.846c0-2.124-1.705-3.845-3.81-3.845H3.914C1.808.001.102 1.722.102 3.846v16.31c0 2.123 1.706 3.845 3.813 3.845h16.173c2.105 0 3.81-1.722 3.81-3.845v-.157s-6.19-2.602-9.315-4.119c-2.096 2.602-4.8 4.181-7.607 4.181-4.75 0-6.361-4.19-4.112-6.949.49-.602 1.324-1.175 2.617-1.497 2.025-.502 5.247.313 8.266 1.317a16.796 16.796 0 0 0 1.341-3.302H5.781v-.952h4.799V6.975H4.77v-.953h5.81V3.591s0-.409.411-.409h2.347v2.84h5.744v.951h-5.744v1.704h4.69a19.453 19.453 0 0 1-1.986 5.06c1.424.52 2.702 1.011 3.654 1.333m-13.81-2.032c-.596.06-1.71.325-2.321.869-1.83 1.608-.735 4.55 2.968 4.55 2.151 0 4.301-1.388 5.99-3.61-2.403-1.182-4.438-2.028-6.637-1.809" />
    </svg>
  );
}
// 微信支付图标：清晰矢量微信标（用户 .ico 仅 16px 会糊，改用 SVG）
function WechatMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 48 48" style={{ borderRadius: 9, flex: "0 0 auto", display: "block" }} role="img" aria-label={tr("ui.app.wechat.pay.2d4758a")}>
      <rect width="48" height="48" rx="12" fill="#07C160" />
      <path d="M20 12.5C12.8 12.5 7 17.2 7 23c0 3.3 1.9 6.2 4.9 8.1l-1.2 3.7 4.4-2.2c1.4.4 2.9.6 4.5.6.4 0 .9 0 1.3-.06-.3-1-.5-2-.5-3.1 0-6 5.6-10.8 12.6-10.8.5 0 1 .01 1.5.07C32.9 16.1 27 12.5 20 12.5z" fill="#fff" />
      <circle cx="15.5" cy="20.5" r="1.7" fill="#07C160" />
      <circle cx="24.5" cy="20.5" r="1.7" fill="#07C160" />
      <path d="M43 31.2c0-4.7-4.7-8.5-10.5-8.5-6.1 0-10.6 4.3-10.6 9 0 4.7 4.7 8.5 10.6 8.5 1.4 0 2.8-.2 4-.6l3.6 1.9-1-3.2c2.4-1.6 3.9-4 3.9-6.6z" fill="#fff" />
      <circle cx="29" cy="30" r="1.4" fill="#07C160" />
      <circle cx="36.5" cy="30" r="1.4" fill="#07C160" />
    </svg>
  );
}
// 下单错误码 → 用户可读文案
function payErrMsg(code?: string): string {
  const en = getLang() !== "zh";
  switch (code) {
    case "wechat_not_ready": return tr("ui.app.wechat.pay.coming.soon.please.use.e8fd1e0");
    case "not_logged_in": return tr("ui.app.session.expired.please.sign.in.again.3fe1fbd");
    case "alipay_not_configured": return tr("ui.app.payment.not.available.yet.please.try.fc7c2a4");
    case "unknown_sku": return tr("ui.app.this.option.isn.available.for.purchase.f45f9c3");
    default: return tr("ui.app.order.failed.please.retry.5c45517");
  }
}
// 微信支付开关：微信商户尚未开通，先隐藏，只留支付宝；开通后翻成 true 即恢复。
const WECHAT_PAY_ENABLED = false;

// 客服微信号（二维码 WECHAT_CS_QR 从 ./wechatCsQr 引入，默认显示大成微信码）。
const WECHAT_CS_ID = "dacheng8803";
// 联系客服弹窗（共享）：支付遇到问题 / 账号菜单都可打开。扫码或搜号加客服微信，加不上可点「直接留言」进留言表单。
function ContactSupportModal({ onClose, onLeaveMessage, onChat, t }: { onClose: () => void; onLeaveMessage: () => void; onChat?: () => void; t: T }) {
  const [copied, setCopied] = useState(false);
  const copyId = () => {
    void navigator.clipboard
      ?.writeText(WECHAT_CS_ID)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };
  return (
    <div className="perm-overlay pay-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div className="pay-card" onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
        <PayCloseX onClick={onClose} />
        <div className="pay-top" style={{ paddingBottom: 10 }}>
          <PayEnso size={40} />
          <h2 style={{ marginTop: 10 }}>{t("pay.support.title")}</h2>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "6px 0 0", lineHeight: 1.5 }}>
            {tr("ui.app.we.re.here.to.help.pick.c600ce2")}
          </p>
        </div>
        <div style={{ padding: "18px 30px 30px" }}>
        {onChat && (
          // 在线对话（推荐）：实时收发，客服回复即刻显示
          <button
            onClick={onChat}
            className="allow"
            style={{ display: "block", width: "100%", border: "none", background: "var(--spark)", color: "#fff", fontSize: 14, fontWeight: 600, borderRadius: 10, padding: "12px 0", cursor: "pointer", marginBottom: 20 }}
          >
            {tr("ui.app.chat.with.support.live.3b049e0")}
          </button>
        )}
        {getLang() !== "zh" ? (
          // 英文版：海外不用微信，只给留言反馈入口
          <>
            <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "0 0 18px", lineHeight: 1.6 }}>
              {tr("ui.shared.3d2c9c722f")}</p>
            <button
              onClick={onLeaveMessage}
              className="allow"
              style={{ border: "none", background: "var(--spark)", color: "#fff", fontSize: 14, fontWeight: 600, borderRadius: 10, padding: "10px 22px", cursor: "pointer" }}
            >
              {tr("ui.shared.a7e65d46d2")}</button>
          </>
        ) : (
          // 中文版：客服微信二维码 + 微信号 + 加不上走留言
          <>
            <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "0 0 14px" }}>
              {t("pay.support.hint")}
            </p>
            <div
              style={{
                width: 184,
                height: 184,
                margin: "0 auto 12px",
                borderRadius: 14,
                background: "#fff",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {WECHAT_CS_QR ? (
                <img src={WECHAT_CS_QR} alt={t("pay.support.qrAlt")} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              ) : (
                <span style={{ fontSize: 12, color: "#8A93A0" }}>{t("pay.support.qrAlt")}</span>
              )}
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                background: "var(--bg-soft)",
                borderRadius: 10,
                padding: "8px 12px",
                marginBottom: 14,
              }}
            >
              <span style={{ fontSize: 13, color: "var(--text)" }}>
                {t("pay.support.wechatId")} <b style={{ letterSpacing: 0.5 }}>{WECHAT_CS_ID}</b>
              </span>
              <button
                onClick={copyId}
                style={{ border: "none", background: "var(--spark)", color: "#fff", fontSize: 12, borderRadius: 7, padding: "4px 10px", cursor: "pointer" }}
              >
                {copied ? t("pay.support.copied") : t("pay.support.copy")}
              </button>
            </div>
            <p style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>
              {t("pay.support.cantAddPre")}
              <span onClick={onLeaveMessage} style={{ color: "var(--spark)", cursor: "pointer", fontWeight: 600 }}>
                {t("pay.support.leaveLink")}
              </span>
              {t("pay.support.cantAddPost")}
            </p>
          </>
        )}
        </div>
      </div>
    </div>
  );
}

// 在线客服：与客服的实时对话窗（轮询 support:thread）。用户发文字+图片，客服后台回复即刻显示在这里。
// 需登录才能收到 threaded 回复（未登录仍可发，走留言，但回复不回流）。
function SupportChatModal({ onClose, loggedIn, t }: { onClose: () => void; loggedIn: boolean; t: T }) {
  const en = getLang() !== "zh";
  const [msgs, setMsgs] = useState<{ id: number; sender: string; message: string; images: string[]; at: string }[]>([]);
  const [input, setInput] = useState("");
  const [imgs, setImgs] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [preview, setPreview] = useState<string | null>(null); // 点开看大图
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const tmpId = useRef(-1); // 乐观消息临时 id(负数，避免与真实 id 撞)

  const load = async (dropTemp = false) => {
    const r = await window.wuwei.supportThread(true).catch(() => null);
    // dropTemp=true(发送成功后)：直接用服务器权威列表，撤掉乐观占位，避免重复。
    // dropTemp=false(定时轮询)：保留「尚未回流」的乐观条(负 id)，避免刚发那条被刷新闪掉；
    //   但若服务器列表已含内容相同的用户消息，说明该乐观条已回流 → 丢弃它，否则会出现
    //   「服务器正式副本 + 乐观副本」两条一模一样(等下次全量刷新才消失)的重复 bug。
    if (r) setMsgs((prev) => {
      if (dropTemp) return r.messages;
      const key = (m: { message: string; images?: string[] }) => m.message + "|" + (m.images?.length || 0);
      const serverUserKeys = new Set(r.messages.filter((m) => m.sender === "user").map(key));
      const pendingTemp = prev.filter((m) => m.id < 0 && !serverUserKeys.has(key(m)));
      return [...r.messages, ...pendingTemp];
    });
    setLoaded(true);
  };
  useEffect(() => {
    if (!loggedIn) { setLoaded(true); return; }
    void load();
    const iv = setInterval(() => void load(), 4000);
    return () => clearInterval(iv);
  }, [loggedIn]);
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs.length, sending, imgs.length]);

  const pickImgs = (files: ArrayLike<File> | null) => {
    if (!files) return;
    Array.from(files).slice(0, 4 - imgs.length).forEach((f) => {
      const rd = new FileReader();
      rd.onload = () => setImgs((p) => (p.length >= 4 ? p : [...p, String(rd.result)]));
      rd.readAsDataURL(f);
    });
  };
  const send = async () => {
    const text = input.trim();
    if ((!text && imgs.length === 0) || sending) return;
    // 乐观更新：立刻上屏，不等服务器。清空输入 → 手感即时。
    const optimistic = { id: tmpId.current--, sender: "user", message: text, images: imgs, at: new Date().toISOString() };
    setMsgs((p) => [...p, optimistic]);
    setInput(""); setImgs([]); setSending(true);
    const r = await window.wuwei.supportChatSend({ message: text || (tr("ui.app.image.5bb4cb0")), images: optimistic.images }).catch(() => null);
    setSending(false);
    if (r?.ok !== false) {
      void load(true); // 拉权威列表，撤掉乐观占位(此时服务器已有这条)
    } else {
      // 发送失败：撤回该乐观条 + 回填内容，让用户可重发
      setMsgs((p) => p.filter((m) => m.id !== optimistic.id));
      setInput(text); setImgs(optimistic.images);
    }
  };

  return (
    <div className="perm-overlay pay-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div className="pay-card sc-card" onClick={(e) => e.stopPropagation()}>
        <div className="sc-head">
          <div className="sc-ava">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 13v-1a8 8 0 0 1 16 0v1" /><rect x="2.5" y="13" width="4" height="6" rx="1.6" /><rect x="17.5" y="13" width="4" height="6" rx="1.6" /><path d="M20 19a4 4 0 0 1-4 4h-2" />
            </svg>
            <span className="sc-dot" />
          </div>
          <div className="sc-head-txt">
            <div className="sc-title">{tr("ui.app.wuwei.support.a5287af")}</div>
            <div className="sc-sub"><span className="sc-online" />{tr("ui.app.online.usually.replies.in.minutes.00081d3")}</div>
          </div>
          <button className="sc-close" onClick={onClose} aria-label={tr("ui.shared.da38860cb8")}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="sc-list" ref={listRef}>
          {!loaded ? (
            <div className="sc-empty">{tr("set.brain.warming")}</div>
          ) : msgs.length === 0 ? (
            <div className="sc-empty">
              {tr("ui.app.send.us.message.describe.your.issue.e36b8dc")}
              {!loggedIn && <div className="sc-empty-hint">{tr("ui.app.sign.in.so.our.replies.show.ca3511f")}</div>}
            </div>
          ) : (
            msgs.map((m) => (
              <div key={m.id} className={"sc-row " + (m.sender === "admin" ? "in" : "out")}>
                <div className="sc-bubble" title={relTime(new Date(m.at).getTime(), Date.now())}>
                  {m.message && <div className="sc-txt">{m.message}</div>}
                  {m.images?.map((src, i) => (<img key={i} src={src} className="sc-img" alt="" onClick={() => setPreview(src)} title={tr("ui.app.view.04a9a94")} />))}
                </div>
              </div>
            ))
          )}
        </div>
        {imgs.length > 0 && (
          <div className="sc-imgrow">{imgs.map((src, i) => (<div key={i} className="sc-thumb"><img src={src} alt="" onClick={() => setPreview(src)} /><button onClick={() => setImgs((p) => p.filter((_, j) => j !== i))}>×</button></div>))}</div>
        )}
        <div className="sc-input">
          <button className="sc-attach" title={tr("ui.app.attach.image.69653d9")} onClick={() => fileRef.current?.click()}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49" /></svg>
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { pickImgs(e.target.files); e.currentTarget.value = ""; }} />
          <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={tr("ui.app.type.message.paste.screenshots.directly.0dfb24f")} rows={1}
            onPaste={(e) => {
              const items = e.clipboardData?.items;
              if (!items) return;
              const files: File[] = [];
              for (let i = 0; i < items.length; i++) { const it = items[i]; if (it.type.startsWith("image/")) { const f = it.getAsFile(); if (f) files.push(f); } }
              if (files.length) { e.preventDefault(); pickImgs(files); }
            }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
          <button className="sc-send" onClick={() => void send()} disabled={sending || (!input.trim() && imgs.length === 0)}>{tr("ui.app.send.f1004bf")}</button>
        </div>
      </div>
      {preview && (
        <div className="sc-lightbox" onClick={(e) => { e.stopPropagation(); setPreview(null); }}>
          <img src={preview} alt="" onClick={(e) => e.stopPropagation()} />
          <button className="sc-lb-close" onClick={(e) => { e.stopPropagation(); setPreview(null); }} aria-label={tr("ui.shared.da38860cb8")}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}

// 留言表单：加不上微信时走这里。留言内容 + 可粘贴图片 + 联系方式 → 提交到后端（wuwei-site 留言管理可见）。
function LeaveMessageModal({ onClose, onBack, t }: { onClose: () => void; onBack?: () => void; t: T }) {
  const [msg, setMsg] = useState("");
  const [contact, setContact] = useState("");
  const [images, setImages] = useState<string[]>([]); // data URL 缩略
  const [phase, setPhase] = useState<"edit" | "sending" | "done">("edit");
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<string | null>(null); // 点击缩略图看大图
  const onPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of Array.from(items)) {
      if (it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (!f) continue;
        const r = new FileReader();
        r.onload = () => setImages((xs) => (xs.length >= 4 ? xs : [...xs, String(r.result)]));
        r.readAsDataURL(f);
      }
    }
  };
  const submit = async () => {
    if (!msg.trim()) return setErr(t("pay.msg.needContent"));
    setPhase("sending");
    setErr("");
    try {
      const r = await window.wuwei.submitSupportMessage?.({ message: msg.trim(), contact: contact.trim(), images });
      if (r?.ok) setPhase("done");
      else {
        setPhase("edit");
        setErr(r?.error || t("pay.msg.submitFail").replace("{id}", WECHAT_CS_ID));
      }
    } catch {
      setPhase("edit");
      setErr(t("pay.msg.submitFail").replace("{id}", WECHAT_CS_ID));
    }
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid var(--border)",
    background: "var(--bg-soft)",
    color: "var(--text)",
    borderRadius: 10,
    fontSize: 13,
    padding: "10px 12px",
    outline: "none",
  };
  return (
    <>
    <div className="perm-overlay pay-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div className="pay-card" onClick={(e) => e.stopPropagation()}>
        <PayCloseX onClick={onClose} />
        <div className="pay-top" style={{ paddingBottom: 4 }}>
          <PayEnso size={40} />
          <h2>{t("pay.msg.title")}</h2>
        </div>
        <div style={{ padding: "0 30px 28px" }}>
          {phase === "done" ? (
            <div style={{ textAlign: "center", padding: "18px 0 6px" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>{t("pay.msg.doneTitle")}</div>
              <div style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.7, marginBottom: 18 }}>
                {t("pay.msg.doneDesc")}
              </div>
              <button
                onClick={onClose}
                style={{ width: "100%", padding: "10px", borderRadius: 10, border: "none", background: "var(--spark)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                {t("pay.msg.done")}
              </button>
            </div>
          ) : (
            <>
              {/* 被采纳有奖：鼓励高质量反馈，后台采纳后可发无为币/会员 */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--spark-soft, rgba(230,126,34,.08))", border: "1px solid var(--spark-border, rgba(230,126,34,.2))", borderRadius: 10, padding: "9px 12px", marginBottom: 12 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--spark)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 auto" }} aria-hidden="true">
                  <path d="M12 15l-2 5 2-1.2L14 20l-2-5" />
                  <circle cx="12" cy="9" r="6" />
                  <path d="M12 6.5l1 2 2.2.2-1.6 1.5.5 2.1L12 11.2 9.9 12.3l.5-2.1L8.8 8.7l2.2-.2z" />
                </svg>
                <span style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>
                  {t("pay.msg.rewardHint")}
                </span>
              </div>
              <textarea
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                onPaste={onPaste}
                placeholder={t("pay.msg.placeholder")}
                rows={4}
                style={{ ...inputStyle, resize: "vertical", minHeight: 90, marginBottom: 10, lineHeight: 1.6 }}
              />
              {images.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  {images.map((src, i) => (
                    <div key={i} style={{ position: "relative", width: 56, height: 56, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
                      <img
                        src={src}
                        alt=""
                        onClick={() => setPreview(src)}
                        title={t("pay.msg.viewLarge")}
                        style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }}
                      />
                      <button
                        onClick={() => setImages((xs) => xs.filter((_, j) => j !== i))}
                        style={{ position: "absolute", top: 1, right: 1, width: 16, height: 16, borderRadius: "50%", border: "none", background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 11, lineHeight: "16px", cursor: "pointer", padding: 0 }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>{t("pay.msg.imgHint")}</div>
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder={t("pay.msg.contactPlaceholder")}
                style={{ ...inputStyle, marginBottom: 10 }}
              />
              {err && <div style={{ fontSize: 12, color: "#C0392B", marginBottom: 10, lineHeight: 1.5 }}>{localizeStoredText(err, getCurrentLanguage())}</div>}
              <div style={{ display: "flex", gap: 10 }}>
                {onBack && (
                  <button
                    onClick={onBack}
                    style={{ flex: "0 0 auto", padding: "10px 16px", borderRadius: 10, border: "1px solid var(--border)", background: "none", color: "var(--text-dim)", fontSize: 13, cursor: "pointer" }}
                  >
                    {t("pay.msg.back")}
                  </button>
                )}
                <button
                  onClick={submit}
                  disabled={phase === "sending"}
                  style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--spark)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: phase === "sending" ? "default" : "pointer", opacity: phase === "sending" ? 0.7 : 1 }}
                >
                  {phase === "sending" ? t("pay.msg.sending") : t("pay.msg.submit")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
    {preview && (
      <div
        onClick={() => setPreview(null)}
        style={{ position: "fixed", inset: 0, zIndex: 1300, background: "rgba(0,0,0,.82)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}
      >
        <img src={preview} alt="" style={{ maxWidth: "92%", maxHeight: "92%", objectFit: "contain", borderRadius: 8, boxShadow: "0 10px 40px rgba(0,0,0,.5)" }} />
      </div>
    )}
    </>
  );
}
// 消息中心：拉取当前用户消息，分类展示（系统/奖励/活动/反馈回复），进入即标记全部已读并回传未读数给父组件更新红点。
type UserMessage = {
  id: number;
  category: string;
  title: string;
  body: string;
  reward: { kind: "coins" | "membership"; amount: number; plan?: string } | null;
  readAt: string | null;
  createdAt: string;
};
function MessageCenterModal({ onClose, onRead, lang, t }: { onClose: () => void; onRead: (unread: number) => void; lang: string; t: T }) {
  const en = lang !== "zh";
  const [msgs, setMsgs] = useState<UserMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  // 分类元数据：标签 + 主题色（承 VI，语义化）
  const CATS: Record<string, { zh: string; en: string; color: string }> = {
    system: { get zh() { return tr("ui.catalog.app.9ab7824942"); }, get en() { return tr("ui.catalog.app.9ab7824942"); }, color: "#6B7280" },
    reward: { get zh() { return tr("ui.app.message.6f3bd7a58c"); }, get en() { return tr("ui.app.message.6f3bd7a58c"); }, color: "#E67E22" },
    activity: { get zh() { return tr("ui.catalog.app.95633d2c31"); }, get en() { return tr("ui.catalog.app.95633d2c31"); }, color: "#3B82F6" },
    feedback: { get zh() { return tr("ui.catalog.app.7c0ec80bcf"); }, get en() { return tr("ui.catalog.app.7c0ec80bcf"); }, color: "#10B981" },
  };
  const catLabel = (c: string) => (CATS[c] ? (en ? CATS[c].en : CATS[c].zh) : c);
  const catColor = (c: string) => CATS[c]?.color || "#6B7280";
  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await window.wuwei.getMessages().catch(() => null);
      if (!alive) return;
      const list = r?.messages || [];
      setMsgs(list);
      setLoading(false);
      // 进入消息中心即视为已读：标记全部 + 通知父级清红点
      if ((r?.unread || 0) > 0) {
        window.wuwei.markMessagesRead({ all: true }).then((rr) => onRead(rr?.unread ?? 0)).catch(() => {});
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const relTime = (iso: string) => {
    const d = new Date(iso).getTime();
    if (!d) return "";
    const s = Math.floor((Date.now() - d) / 1000);
    if (s < 60) return tr("rel.now");
    if (s < 3600) return `${Math.floor(s / 60)}${tr("ui.app.ago.9ac2a1a")}`;
    if (s < 86400) return `${Math.floor(s / 3600)}${tr("ui.app.ago.822d019")}`;
    if (s < 2592000) return `${Math.floor(s / 86400)}${tr("ui.app.ago.5b0d8c8")}`;
    return new Date(iso).toLocaleDateString();
  };
  const rewardText = (r: NonNullable<UserMessage["reward"]>) => {
    if (r.kind === "coins") return tr("ui.app.coins.77b72ff", { p0: r.amount });
    const plan = (r.plan || "Pro").replace(/^\w/, (c) => c.toUpperCase());
    return tr("ui.app.text.d1e0c2c", { p0: plan, p1: r.amount });
  };
  const cats = ["all", "system", "reward", "activity", "feedback"];
  const shown = filter === "all" ? msgs : msgs.filter((m) => m.category === filter);
  return (
    <div className="perm-overlay pay-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div className="pay-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, width: "92%" }}>
        <PayCloseX onClick={onClose} />
        <div className="pay-top" style={{ paddingBottom: 4 }}>
          <PayEnso size={40} />
          <h2>{tr("ui.app.message.center.914789a")}</h2>
        </div>
        {/* 分类筛选 */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "0 30px 12px" }}>
          {cats.map((c) => {
            const active = filter === c;
            return (
              <button
                key={c}
                onClick={() => setFilter(c)}
                style={{
                  padding: "4px 12px",
                  borderRadius: 999,
                  border: `1px solid ${active ? "var(--spark)" : "var(--border)"}`,
                  background: active ? "var(--spark)" : "transparent",
                  color: active ? "#fff" : "var(--text-dim)",
                  fontSize: 12,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {c === "all" ? (tr("ui.app.all.bafb97c")) : catLabel(c)}
              </button>
            );
          })}
        </div>
        <div style={{ padding: "0 30px 28px", maxHeight: 440, overflowY: "auto" }}>
          {loading ? (
            <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "40px 0" }}>{tr("set.brain.warming")}</div>
          ) : shown.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10, opacity: 0.6 }}>
                <path d="M4 5h16v11H7l-3 3z" />
              </svg>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{tr("ui.app.no.messages.yet.b32a88a")}</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {shown.map((m) => (
                <div
                  key={m.id}
                  style={{
                    position: "relative",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: "12px 14px",
                    background: m.readAt ? "transparent" : "var(--bg-soft)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: catColor(m.category), background: catColor(m.category) + "1A", borderRadius: 6, padding: "2px 7px" }}>
                      {catLabel(m.category)}
                    </span>
                    {m.reward && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: "#fff", background: "var(--spark)", borderRadius: 6, padding: "2px 7px" }}>
                        🎁 {rewardText(m.reward)}
                      </span>
                    )}
                    {!m.readAt && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#E5484D", flex: "0 0 auto" }} />}
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)", flex: "0 0 auto" }}>{relTime(m.createdAt)}</span>
                  </div>
                  {m.title && <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)", marginBottom: 4, lineHeight: 1.4 }}>{m.title}</div>}
                  <div style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{m.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
// 免费脑网络功能介绍：从欢迎页进入，可直接打开记忆设置。
function BrainIntroModal({ onClose, onOpenMemory, t }: { onClose: () => void; onOpenMemory: () => void; t: T }) {
  const feats: [React.ReactNode, string, string][] = [
    [
      <><path d="M12 3a4 4 0 0 0-4 4 3.5 3.5 0 0 0-1 6.8V17a3 3 0 0 0 5 2 3 3 0 0 0 5-2v-3.2A3.5 3.5 0 0 0 16 7a4 4 0 0 0-4-4Z" /><path d="M12 7v12" /></>,
      t("pay.brain.f1t"),
      t("pay.brain.f1s"),
    ],
    [
      <><path d="M9 12h6" /><path d="M8 8a4 4 0 0 0 0 8h1" /><path d="M16 8a4 4 0 0 1 0 8h-1" /></>,
      t("pay.brain.f2t"),
      t("pay.brain.f2s"),
    ],
    [
      <><path d="M3 17l6-6 4 4 8-8" /><path d="M17 7h4v4" /></>,
      t("pay.brain.f3t"),
      t("pay.brain.f3s"),
    ],
    [
      <><path d="M6.5 8a3.5 3.5 0 1 0 0 7c2.5 0 3-2 5.5-3.5S17 8 19.5 8a3.5 3.5 0 1 1 0 7c-2.5 0-3-2-5.5-3.5S9 8 6.5 8Z" /></>,
      t("pay.brain.f4t"),
      t("pay.brain.f4s"),
    ],
  ];
  return (
    <div className="perm-overlay pay-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div className="pay-card" onClick={(e) => e.stopPropagation()} style={{ width: 440 }}>
        <PayCloseX onClick={onClose} />
        <div className="pay-top" style={{ paddingBottom: 6 }}>
          <div style={{ margin: "0 auto 12px", width: 52, height: 52, borderRadius: 15, background: "linear-gradient(150deg,#274A63,#1E232B)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 22px -8px rgba(39,74,99,.7)" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6F9FAD" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3a4 4 0 0 0-4 4 3.5 3.5 0 0 0-1 6.8V17a3 3 0 0 0 5 2 3 3 0 0 0 5-2v-3.2A3.5 3.5 0 0 0 16 7a4 4 0 0 0-4-4Z" />
              <circle cx="9" cy="9" r="1" fill="#C05F3C" stroke="none" />
              <circle cx="15" cy="12" r="1" fill="#C05F3C" stroke="none" />
              <circle cx="11" cy="15" r="1" fill="#C05F3C" stroke="none" />
            </svg>
          </div>
          <h2>{t("pay.brain.title")}</h2>
          <p>{t("pay.brain.sub")}</p>
        </div>
        <div style={{ padding: "4px 30px 20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 18 }}>
            {feats.map(([icon, tt, ss], i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 auto", marginTop: 1 }} aria-hidden="true">
                  {icon}
                </svg>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)", lineHeight: 1.35 }}>{tt}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, marginTop: 2 }}>{ss}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: "#A97F2E", background: "rgba(201,162,75,.12)", padding: "4px 12px", borderRadius: 20, marginBottom: 14 }}>
            <PaySpark size={12} /> {t("pay.brain.free")}
          </div>
          <button
            onClick={onOpenMemory}
            style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#c9a24b,#a97f2e)", color: "#fff", fontSize: 14.5, fontWeight: 700, cursor: "pointer", boxShadow: "0 10px 22px -8px rgba(169,127,46,.6)" }}
          >
            {t("pay.brain.open")}
          </button>
        </div>
      </div>
    </div>
  );
}
// 付款页（国内支付宝/微信扫码）：向后端下单拿二维码串 → 渲染真 QR → 轮询订单状态，到账自动跳成功页。
// 国外 Paddle 走托管结账(不自建卡表单)，待接 Paddle.js。
function PayCheckoutModal({ order, onClose, onPaid, onContactSupport, onNeedLogin }: { order: PayOrder; onClose: () => void; onPaid: (balance?: number, orderId?: string) => void; onContactSupport: () => void; onNeedLogin: () => void }) {
  const en = getLang() !== "zh";
  const [method, setMethod] = useState<"ali" | "wx">("ali");
  const isPlan = order.kind === "plan";
  const sku = order.kind === "pack" ? order.pack.sku : order.plan.sku;
  const title = order.kind === "pack" ? `${order.pack.coins.toLocaleString()} ${"credits"}` : order.plan.name;
  const gift =
    order.kind === "pack"
      ? order.pack.bonus > 0
        ? `${tr("ui.app.bonus.57e62ee", { p0: order.pack.bonus, p1: (en ? order.pack.descEn : order.pack.desc) })}`
        : (en ? order.pack.descEn : order.pack.desc)
      : order.plan.note
        ? `${tr("ui.app.text.2171e40", { v0: (en ? undefined : order.plan.sub), v1: (en ? undefined : order.plan.note), v2: (en ? order.plan.subEn : undefined), v3: (en ? order.plan.noteEn : undefined) })}`
        : (en ? order.plan.subEn : order.plan.sub);
  const price = order.kind === "pack" ? order.pack.price : order.plan.price;
  const unit = isPlan ? (en ? order.plan.unitEn : order.plan.unit) : "";
  const methodName = method === "ali" ? tr("ui.app.alipay.8f0430e") : tr("ui.app.message.8117866388");

  const [qr, setQr] = useState("");
  const [orderId, setOrderId] = useState("");
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");
  const [errDetail, setErrDetail] = useState(""); // 后端/支付宝真实报错，便于诊断
  const [reloadKey, setReloadKey] = useState(0); // 递增即重新下单，刷新二维码
  const refresh = () => setReloadKey((k) => k + 1);

  // 切支付方式 / 首次打开 / 手动刷新：向后端下单，拿二维码串
  useEffect(() => {
    let alive = true;
    setPhase("loading"); setQr(""); setOrderId(""); setErrMsg(""); setErrDetail("");
    const channel = method === "ali" ? "alipay" : "wechat";
    window.wuwei
      .payCreate(sku, channel)
      .then((r) => {
        if (!alive) return;
        // 登录失效：不在二维码框里显示死错误，直接关支付页 → 弹登录框（任何充值/升级入口统一走这）
        if (r?.error === "not_logged_in") { onNeedLogin(); return; }
        if (!r || r.error || !r.qr || !r.orderId) {
          setPhase("error"); setErrMsg(payErrMsg(r?.error)); setErrDetail(/[一-龥]/.test(r?.message || "") ? r!.message! : ""); return;
        }
        setQr(r.qr); setOrderId(r.orderId); setPhase("ready");
      })
      .catch(() => { if (alive) { setPhase("error"); setErrMsg(tr("ui.app.network.error.please.retry.6411585")); } });
    return () => { alive = false; };
  }, [method, sku, reloadKey]);

  // 轮询订单状态：到账即走成功页（后端会主动查单兜底 notify）
  useEffect(() => {
    if (phase !== "ready" || !orderId) return;
    let alive = true;
    const t = setInterval(async () => {
      const s = await window.wuwei.payStatus(orderId).catch(() => null);
      if (!alive || !s) return;
      if (s.status === "paid") { clearInterval(t); onPaid(s.balance, orderId); }
      else if (s.status === "failed" || s.status === "expired") { clearInterval(t); setPhase("error"); setErrMsg(tr("ui.app.order.expired.please.reorder.ff7ef45")); }
    }, 2500);
    return () => { alive = false; clearInterval(t); };
  }, [phase, orderId, onPaid]);

  return (
    <div className="perm-overlay pay-overlay" onClick={onClose}>
      <div className="pay-card" onClick={(e) => e.stopPropagation()}>
        <PayCloseX onClick={onClose} />
        <div className="pay-top" style={{ paddingBottom: 8 }}>
          <PayEnso size={46} />
          <h2>{tr("ui.app.confirm.payment.d4aa185")}</h2>
        </div>
        <div className={"paych-order" + (isPlan ? " gold" : "")}>
          <div className="paych-order-row">
            <div>
              <div className="paych-order-nm">{title}</div>
              <div className="paych-order-gift">{gift}</div>
            </div>
            <div className="paych-order-amt">
              ¥{price}
              {unit && <span className="u">{unit}</span>}
            </div>
          </div>
        </div>
        <div className="paych-sect">{tr("ui.app.choose.payment.method.3bbc9db")}</div>
        <div className="paych-pays">
          <button className={"paych-pay" + (method === "ali" ? " sel-ali" : "")} onClick={() => setMethod("ali")}>
            <AlipayMark />
            <span className="paych-pay-nm">{tr("ui.app.alipay.8f0430e")}</span>
            <span className="paych-rd" />
          </button>
          {WECHAT_PAY_ENABLED && (
            <button className={"paych-pay" + (method === "wx" ? " sel-wx" : "")} onClick={() => setMethod("wx")}>
              <WechatMark />
              <span className="paych-pay-nm">{tr("ui.app.wechat.pay.2d4758a")}</span>
              <span className="paych-rd" />
            </button>
          )}
        </div>
        <div className="paych-qr">
          {phase === "ready" && qr ? (
            <QRCodeSVG value={qr} size={168} level="M" marginSize={2} />
          ) : phase === "error" ? (
            <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: 8, boxSizing: "border-box" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C0392B" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5" /><circle cx="12" cy="16.4" r="0.4" fill="#C0392B" stroke="none" />
              </svg>
              <div style={{ fontSize: 11.5, color: "#C0392B", textAlign: "center", lineHeight: 1.4 }}>{errMsg}</div>
            </div>
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, boxSizing: "border-box" }}>
              {/* 朱赭品牌色转圈(复用全局 tspin 动画) */}
              <div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid #ECEFF2", borderTopColor: "#C05F3C", animation: "tspin 0.8s linear infinite" }} />
              <div style={{ fontSize: 12, color: "#8A93A0", whiteSpace: "nowrap" }}>{tr("ui.app.generating.qr.code.d34f186")}</div>
            </div>
          )}
        </div>
        <div className="paych-qrtip">
          {phase === "ready" ? (
            en
              ? <>{tr("ui.shared.d676e828b0")}<b style={{ color: method === "ali" ? "#1677FF" : "#07C160" }}>{method === "ali" ? tr("ui.billingpanel.message.39270e4d9e") : tr("ui.app.message.8117866388")}</b> {tr("ui.shared.eee53c8ea8")}{price}{tr("ui.shared.2cad3d4d0f")}</>
              : <>{tr("ui.app.message.e8eaee59ff")}<b style={{ color: method === "ali" ? "#1677FF" : "#07C160" }}>{methodName}</b> {tr("ui.app.message.fdab969728")}{price}{tr("ui.app.message.a8fd440aba")}</>
          ) : phase === "error" ? (
            errDetail ? <span style={{ color: "#C0392B", wordBreak: "break-all" }}>{errDetail}</span> : (tr("ui.app.try.another.method.or.retry.later.151d32f"))
          ) : ""}
        </div>
        {phase !== "loading" && (
          <button
            type="button"
            className="paych-refresh"
            onClick={refresh}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, margin: "2px auto 0", width: "fit-content", background: "none", border: "none", color: "#8A93A0", fontSize: 12, cursor: "pointer", padding: "2px 6px" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v5h-5" />
            </svg>
            {tr("ui.app.refresh.qr.code.224bf38")}
          </button>
        )}
        <div className="paych-secure">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          {en ? <>{tr("ui.shared.18dcde73a0")}<b>{tr("ui.billingpanel.message.39270e4d9e")}</b></> : <>{tr("ui.app.message.15af86a28c")}<b>{tr("ui.app.alipay.8f0430e")}</b>{tr("ui.app.message.944de25727")}</>}
        </div>
        <div className="paych-alt">
          <button onClick={onContactSupport}>{tr("ui.app.payment.issue.ddafb72")}</button>
        </div>
      </div>
    </div>
  );
}

// 缺币付款弹窗：并排套餐(¥1体验/Pro/Plus/Max) + 积分包 tab，选中即出支付宝码(国内)/Paddle(海外)。
// 缺币弹窗右侧「下单理由」：每条 = 加粗钩子 + 具体说明，精准戳付费点（顶级模型 / 更快 / 更多额度 / 记忆 / 省钱）。
const PAYNOW_PERKS = (): [string, string][] => [
  [tr("ui.app.message.d9e6eb3900"), tr("ui.app.message.940aef5325")],
  [tr("ui.app.message.c03fe0a52a"), tr("ui.app.message.680d9d213c")],
  [tr("ui.app.message.932ce186c8"), tr("ui.app.message.1d3b654a65")],
  [tr("ui.app.message.e0df3d0c6d"), tr("ui.app.message.776e287254")],
  [tr("ui.app.message.ede191be25"), tr("ui.app.message.bda9921ec6")],
];

// 模型费用说明弹窗：免费/付费模型按平台分组，输入/输出/缓存命中价，可切无为币/人民币/美元。
type PricingUnit = "coin" | "cny" | "usd";
type PricingModel = { id: string; label: string; labelEn: string | null; free: boolean; inCoins: number | null; outCoins: number | null; hitCoins: number | null };
type PricingProvider = { id: string; label: string; labelEn: string | null; hosted: boolean; models: PricingModel[] };
type PricingData = { noteZh: string; noteEn: string; footerZh: string; footerEn: string; cnyPerCoin: number; coinPerUsd: number; providers: PricingProvider[] };

function ModelPricingModal({ lang, onClose, onContact }: { lang: Lang; onClose: () => void; onContact: () => void }) {
  const en = lang !== "zh";
  const [data, setData] = useState<PricingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unit, setUnit] = useState<PricingUnit>((getCurrentLanguage() === "zh" ? "coin" : "usd"));
  useEffect(() => {
    let stop = false;
    const fn = window.wuwei.modelPricing;
    if (typeof fn !== "function") { setLoading(false); setData(null); return; } // 旧版无此接口 → 报错别死等
    fn().then((d) => { if (!stop) { setData((d as PricingData) || null); setLoading(false); } }).catch(() => { if (!stop) setLoading(false); });
    return () => { stop = true; };
  }, []);
  const mLabel = (m: { label: string; labelEn: string | null }) => (en && m.labelEn) || m.label;
  const fmt = (coins: number | null): string => {
    if (coins == null) return "—";
    if (unit === "coin") return `${coins}`;
    if (unit === "cny") return `¥${(coins * (data?.cnyPerCoin ?? 0.01)).toFixed(2)}`;
    const usd = coins / (data?.coinPerUsd ?? 759.6);
    return `$${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)}`;
  };
  const freeModels = (data?.providers ?? []).flatMap((p) => p.models.filter((m) => m.free).map((m) => ({ ...m, provider: p })));
  const paidProviders = (data?.providers ?? []).map((p) => ({ ...p, models: p.models.filter((m) => !m.free) })).filter((p) => p.models.length > 0);
  const unitLabel = en ? { coin: "Coins", cny: "RMB", usd: "USD" } : { coin: tr("ui.app.message.0960356d1a"), cny: tr("ui.app.message.5509489a06"), usd: tr("ui.app.message.b4573f9c94") };

  return (
    <div className="modal-mask" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 14, width: "min(720px,96vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <b style={{ fontSize: 15 }}>{tr("ui.app.model.pricing.7d3da2e")}</b>
          <button onClick={onClose} style={{ border: "none", background: "none", color: "var(--text-muted)", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        {/* 顶部说明（重要）：不在模型上挣钱，只赚会员/积分 */}
        <div style={{ padding: "12px 20px", fontSize: 12.5, lineHeight: 1.7, color: "var(--text-dim)", background: "var(--bg-soft)", borderBottom: "1px solid var(--border)" }}>
          {en ? data?.noteEn ?? "" : data?.noteZh ?? ""}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 20px 0" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{tr("ui.app.unit.per.tokens.2c59d01")}</span>
          <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 7, overflow: "hidden" }}>
            {(["coin", "cny", "usd"] as PricingUnit[]).map((u) => (
              <button key={u} onClick={() => setUnit(u)} style={{ padding: "4px 12px", fontSize: 12, border: "none", cursor: "pointer", background: unit === u ? "var(--spark)" : "transparent", color: unit === u ? "#fff" : "var(--text-dim)" }}>{unitLabel[u]}</button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px 20px" }}>
          {loading && <div style={{ color: "var(--text-muted)", textAlign: "center", padding: 30 }}>{tr("set.brain.warming")}</div>}
          {!loading && !data && <div style={{ color: "var(--text-muted)", textAlign: "center", padding: 30 }}>{tr("ui.app.failed.to.load.pricing.5c904f4")}</div>}
          {data && (
            <>
              {freeModels.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#16a34a", marginBottom: 8 }}>{tr("ui.app.free.models.cost.9b0c278")}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {freeModels.map((m) => (
                      <span key={m.id} style={{ fontSize: 12.5, padding: "4px 10px", borderRadius: 999, background: "rgba(22,163,74,.12)", color: "#16a34a", border: "1px solid rgba(22,163,74,.3)" }}>{mLabel(m)}</span>
                    ))}
                  </div>
                </div>
              )}
              {paidProviders.map((p) => (
                <div key={p.id} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                    {((en && p.labelEn) || p.label).replace(/^(?:无为托管\s*[·・]?\s*|Wuwei(?: Hosted)?\s*[·・]?\s*)/i, "")}
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ color: "var(--text-muted)" }}>
                          <th style={{ textAlign: "left", padding: "5px 8px", fontWeight: 600 }}>{tr("set.m.model")}</th>
                          <th style={{ textAlign: "right", padding: "5px 8px", fontWeight: 600 }}>{tr("ui.app.input.eeace58")}</th>
                          <th style={{ textAlign: "right", padding: "5px 8px", fontWeight: 600 }}>{tr("ui.app.output.1b67a33")}</th>
                          <th style={{ textAlign: "right", padding: "5px 8px", fontWeight: 600 }}>{tr("ui.app.cache.hit.05568ff")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.models.map((m) => (
                          <tr key={m.id} style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={{ padding: "5px 8px" }}>{mLabel(m)}</td>
                            <td style={{ padding: "5px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(m.inCoins)}</td>
                            <td style={{ padding: "5px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(m.outCoins)}</td>
                            <td style={{ padding: "5px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-muted)" }}>{fmt(m.hitCoins)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", fontSize: 12.5, color: "var(--text-dim)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <span>{en ? data?.footerEn ?? "" : data?.footerZh ?? ""}</span>
          <button onClick={onContact} style={{ flex: "0 0 auto", padding: "6px 14px", borderRadius: 8, border: "none", background: "var(--spark)", color: "#fff", fontSize: 12.5, cursor: "pointer" }}>{tr("ui.app.message.support.02ca386")}</button>
        </div>
      </div>
    </div>
  );
}

function TrialPayModal({
  en, balance, rebind, opts, defaultSku, onClose, onPaid, onNeedLogin, onRebind, onPaddle, onCrypto, onContact, onFaq, context = "shortage",
}: {
  en: boolean;
  balance: number;
  context?: "shortage" | "browse" | "weekly" | "freecap"; // shortage=无为币用完；browse=账号菜单主动点充值/升级；weekly=本周额度用完(默认积分包tab)；freecap=免费用完且0币
  rebind?: { providerId: string; model: string; label: string } | null;
  opts: PayPlanOpt[];
  defaultSku: string;
  onClose: () => void;
  onPaid: (balance: number | undefined, orderId: string | undefined, opt: PayPlanOpt) => void;
  onNeedLogin: () => void;
  onRebind?: () => void;
  onPaddle: (opt: PayPlanOpt) => void;
  onCrypto: (opt: PayPlanOpt) => void;
  onContact: () => void;
  onFaq: () => void;
}) {
  const packOpts = buildPackOpts();
  // weekly(本周额度用完)默认落在「积分包」tab——会员已订阅，买包比再升级更顺
  const [tab, setTab] = useState<"plan" | "pack">(context === "weekly" ? "pack" : "plan"); // 顶部 tab：会员套餐 / 积分包
  const curOpts = tab === "plan" ? opts : packOpts;
  const [selSku, setSelSku] = useState(context === "weekly" ? (packOpts.find((o) => o.badgeType === "rec")?.sku ?? packOpts[0].sku) : defaultSku);
  const cur = curOpts.find((o) => o.sku === selSku) ?? curOpts[0];
  const isPack = cur.kind === "pack";
  function switchTab(t: "plan" | "pack") {
    if (t === tab) return;
    setTab(t);
    setSelSku(t === "plan" ? defaultSku : (packOpts.find((o) => o.badgeType === "rec")?.sku ?? packOpts[0].sku));
    void window.wuwei.track?.("credits_shortage_tab", { tab: t });
  }
  const price = money(en, cur.price, cur.priceUsd);
  const unit = en ? cur.unitEn : cur.unit;
  // 积分包 tab 用积分包专属权益；会员 tab 用订阅权益。
  const perks = isPack ? (PACK_PERKS()) : (PAYNOW_PERKS());
  // 第一条「省钱锚定」按选中档动态：普通档对标各家 $20 订阅，顶级 Max 档对标 Claude Max / ChatGPT Pro 的 $200。
  const isMaxTier = cur.sku === "plan_pro_50x";
  const anchorDesc = en
    ? isMaxTier
      ? "Skip $200/mo for ChatGPT Pro, $200 for Claude Max, plus top-tier Gemini. Wuwei runs all of them."
      : "Skip paying $20 for ChatGPT, $20 for Claude, $20 for Gemini. Wuwei runs all of them."
    : isMaxTier
      ? tr("ui.app.message.0446f1cb04")
      : tr("ui.app.message.fa2d760187");
  const [qr, setQr] = useState("");
  const [orderId, setOrderId] = useState("");
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // 国内：进来/切换套餐即下单出支付宝码；海外不出码(走 Paddle 按钮)。
  // 切换套餐用 400ms 防抖：快速点选只对「最终停留」的档下单，避免每点一下都建一张待支付订单。
  useEffect(() => {
    if (en) return;
    let alive = true;
    setPhase("loading"); setQr(""); setOrderId(""); setErrMsg("");
    const timer = setTimeout(() => {
      window.wuwei
        .payCreate(cur.sku, "alipay")
        .then((r) => {
          if (!alive) return;
          if (r?.error === "not_logged_in") { onNeedLogin(); return; }
          if (r?.error === "trial_used") { setPhase("error"); setErrMsg(tr("ui.app.message.4d46aa1230")); return; }
          if (!r || r.error || !r.qr || !r.orderId) { setPhase("error"); setErrMsg(payErrMsg(r?.error)); return; }
          setQr(r.qr); setOrderId(r.orderId); setPhase("ready");
        })
        .catch(() => { if (alive) { setPhase("error"); setErrMsg(tr("ui.app.message.b28de91e65")); } });
    }, 400);
    return () => { alive = false; clearTimeout(timer); };
  }, [en, reloadKey, cur.sku]);

  // 轮询到账
  useEffect(() => {
    if (phase !== "ready" || !orderId) return;
    let alive = true;
    const t = setInterval(async () => {
      const s = await window.wuwei.payStatus(orderId).catch(() => null);
      if (!alive || !s) return;
      if (s.status === "paid") { clearInterval(t); onPaid(s.balance, orderId, cur); }
      else if (s.status === "failed" || s.status === "expired") { clearInterval(t); setPhase("error"); setErrMsg(tr("ui.app.order.expired.reopen.to.retry.2449e6a")); }
    }, 2500);
    return () => { alive = false; clearInterval(t); };
  }, [phase, orderId]);

  const Check = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#3E9E6E" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
  );

  return (
    <div className="perm-overlay pay-overlay" onClick={onClose}>
      <div className="pay-card pay-card-wide" onClick={(e) => e.stopPropagation()}>
        <PayCloseX onClick={onClose} />
        <div className="pay-top" style={{ paddingBottom: (context === "weekly" || context === "freecap") ? 16 : 2, paddingTop: 22 }}>
          <h2>{context === "freecap" ? (tr("ui.app.today.free.quota.is.used.up.3c1ec9e")) : context === "weekly" ? (tr("ui.app.this.month.quota.is.used.up.294cafa")) : context === "browse" ? (tr("ui.app.choose.your.plan.82aa935")) : balance > 0 ? (tr("ui.app.not.enough.coins.for.this.request.adb077c")) : (tr("ui.app.you.re.out.of.credits.f498091"))}</h2>
          <p>{context === "freecap"
            ? (en
                ? <>{tr("ui.shared.8e53ce83b4")}<button type="button" className="pay-inline-link" onClick={() => switchTab("plan")}>{tr("ui.shared.fcf42bc502")}</button> {tr("ui.shared.e162b9b3cf")}<button type="button" className="pay-inline-link" onClick={() => switchTab("pack")}>{tr("ui.shared.213b00cf01")}</button> {tr("ui.shared.eac5ee69b9")}</>
                : <>{tr("ui.app.message.a943cad769")}<button type="button" className="pay-inline-link" onClick={() => switchTab("plan")}>{tr("ui.app.message.710c4321b4")}</button>{tr("ui.app.message.29e7e2a8e7")}<button type="button" className="pay-inline-link" onClick={() => switchTab("pack")}>{tr("ui.app.message.21d96f752c")}</button>{tr("ui.app.message.cd13e81811")}</>)
            : context === "weekly"
            ? (en
                ? <>{tr("ui.shared.2519ac71b4")}<button type="button" className="pay-inline-link" onClick={() => switchTab("pack")}>{tr("ui.shared.213b00cf01")}</button> {tr("ui.shared.eac5ee69b9")}</>
                : <>{tr("ui.app.message.8a3113b8e6")}<button type="button" className="pay-inline-link" onClick={() => switchTab("pack")}>{tr("ui.app.message.21d96f752c")}</button>{tr("ui.app.message.88e4937ba4")}</>)
            : context === "browse" ? (tr("ui.app.more.allowance.for.everyday.agent.work.e4f519a")) : (tr("ui.app.pick.plan.to.continue.value.models.533ff45"))}</p>
        </div>

        {/* weekly/freecap 态不显余额行：一句话说明已足够，余额对这两种场景无关或为0 */}
        {context !== "weekly" && context !== "freecap" && (
          <div className="trial-bal-mini"><span className="pay-coin" /> {context === "browse" ? (tr("ui.app.balance.credits.85f86d9", { p0: formatCredits(balance) })) : (tr("ui.app.balance.credits.upgrade.to.continue.8b1d6e4", { p0: formatCredits(balance) }))}</div>
        )}

        {/* 顶部 tab：会员套餐 / 积分包，直接切换并排选项（替代原「改用积分包」跳窗） */}
        <div className="trial-tabs">
          <button className={"trial-tab" + (tab === "plan" ? " on" : "")} onClick={() => switchTab("plan")}>{tr("ui.app.membership.c297b46")}</button>
          <button className={"trial-tab" + (tab === "pack" ? " on" : "")} onClick={() => switchTab("pack")}>{tr("ui.app.credit.packs.850974e")}</button>
        </div>

        {/* 并排选项：默认选中，可切换；选中谁就驱动下方二维码/Paddle 与右侧详情 */}
        <div className="trial-plans">
          {curOpts.map((o) => {
            // 优惠划线：原价 = 同等币量按最低档(Pro)单价要花多少（= 现价 + 已省，与定价文档「省¥/省%」一致，非虚标）。
            // 只对 Plus/Max（saved>0）展示，制造「越高档越省」，推高客单。
            const savedCn = o.kind === "plan" ? (o.saved || 0) : 0;
            const listCn = savedCn ? o.price + savedCn : 0;
            const pct = listCn ? Math.round((savedCn / listCn) * 100) : 0;
            const listUsd = pct ? Math.round((o.priceUsd / (1 - pct / 100)) * 100) / 100 : 0;
            return (
              <button
                key={o.sku}
                className={"trial-plan-opt" + (o.sku === cur.sku ? " sel" : "")}
                onClick={() => { setSelSku(o.sku); void window.wuwei.track?.("credits_shortage_plan_select", { sku: o.sku, kind: o.kind }); }}
              >
                {o.badge && <span className={"trial-plan-badge2 " + (o.badgeType || "")}>{en ? o.badgeEn : o.badge}</span>}
                <span className="tpo-nm">{en ? o.nameEn : o.name}</span>
                <span className="tpo-price">{money(en, o.price, o.priceUsd)}{(en ? o.unitEn : o.unit) ? <small>{en ? o.unitEn : o.unit}</small> : null}</span>
                {listCn ? (<span className="tpo-save"><s>{tr("ui.app.text.2093f49", { v0: (en ? undefined : listCn), v1: (en ? listUsd : undefined) })}</s><em>{tr("ui.app.text.a33a173", { p0: pct })}</em></span>) : null}
                <span className="tpo-coins">{o.kind === "trial" ? (tr("ui.app.day.full.pro.access.9390033")) : o.kind === "pack" ? (tr("ui.app.never.expires.cbabb19")) : (tr("ui.app.credits.mo.f65069c", { p0: o.coins.toLocaleString() }))}</span>
                <span className="tpo-sub">{o.kind === "plan" ? (tr("ui.app.day.check.in.b008c71", { p0: o.signin })) : (en ? o.subEn : o.sub)}</span>
              </button>
            );
          })}
        </div>

        <div className="trial-grid">
          {/* 左：国内二维码 / 海外 Paddle 按钮（跟随选中套餐） */}
          <div className="trial-pay">
            {en ? (
              <div className="trial-paddle">
                <div className="trial-paddle-price">{price}<small>{unit}</small></div>
                <button className="trial-pay-btn" onClick={() => { void window.wuwei.track?.("paddle_pay_click", { sku: cur.sku, price }); onPaddle(cur); }}>{`Pay ${price}`}<PayArrow /></button>
                {/* 一行说清：安全/可取消/支持卡与PayPal，替代原先两行灰字 */}
                <div className="trial-pay-reassure">{isPack ? "Secure checkout via Paddle · Cards & PayPal" : "Secure checkout · Cancel anytime · Cards & PayPal"}</div>
                {/* 加密货币支付：给卡付不了的地区(俄罗斯/中东等)兜底。走 NOWPayments 收银台(系统浏览器)。
                    稳定可用的支付币是 USDT-TRC20(最低约 $12)，故只在 ≥$12 的档显示；
                    便宜档不显示按钮，由弹窗底部说明统一引导去 $12+ 套餐。 */}
                {cur.priceUsd >= CRYPTO_MIN_USD && (
                  <>
                    <div className="trial-pay-or">or</div>
                    <button className="trial-crypto-btn" onClick={() => { void window.wuwei.track?.("crypto_pay_click", { sku: cur.sku, price }); onCrypto(cur); }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.2v9.6M9.6 9.4h3.5a1.9 1.9 0 0 1 0 3.8H9.6M9.6 13.2h3.8a1.9 1.9 0 0 1 0 3.8H9.6" /></svg>
                      {tr("ui.shared.b328e52dae")}</button>
                    <div className="trial-crypto-note">
                      {cur.priceUsd >= CRYPTO_MULTICOIN_USD
                        ? "USDT · BTC & more · works when cards fail"
                        : "Small amount? Pay with USDT on Solana / BSC"}
                    </div>
                  </>
                )}
              </div>
            ) : phase === "ready" && qr ? (
              <><QRCodeSVG value={qr} size={168} level="M" marginSize={2} /><div className="trial-scan">{tr("ui.app.message.e75104e794")}<b>{price}</b> {tr("ui.app.message.73b322e3f9")}</div></>
            ) : phase === "error" ? (
              <div className="trial-msg err"><span>{errMsg}</span><button onClick={() => setReloadKey((k) => k + 1)}>{tr("ui.billingpanel.retry.2cd6945")}</button></div>
            ) : (
              <div className="trial-msg"><div className="trial-spin" /><span>{tr("ui.app.message.559e9298e5")}</span></div>
            )}
          </div>
          {/* 右：选中套餐详情 + 权益 + 联系客服 */}
          <div className="trial-detail">
            <div className="trial-plan-nm">{en ? cur.nameEn : cur.name}</div>
            <div className="trial-plan-price">{price}<small>{unit}</small></div>
            <ul className="trial-perks">{perks.map(([pt, pd], i) => (<li key={i}><Check /> <span><b>{pt}</b><em>{i === 0 && !isPack ? anchorDesc : pd}</em></span></li>))}</ul>
            <div className="trial-note">{cur.saved ? (tr("ui.app.save.mo.vs.pro.043364b", { p0: cur.saved })) : (en ? cur.subEn : cur.sub)}</div>
            <button className="trial-cs" onClick={onContact}>
              {tr("ui.app.payment.issue.contact.support.029c8ab")}
            </button>
          </div>
        </div>

        {/* 底部加密说明：引导卡/Paddle 付不了的用户，讲清加密只支持 ≥$12 的套餐(选低价档时也看得到) */}
        {en && (
          <div className="trial-crypto-foot">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.2v9.6M9.6 9.4h3.5a1.9 1.9 0 0 1 0 3.8H9.6M9.6 13.2h3.8a1.9 1.9 0 0 1 0 3.8H9.6" /></svg>
            <span>{tr("ui.shared.370420f322")}<b>{tr("ui.shared.44a9713350")}</b> {tr("ui.shared.6a5c6a922e")}<b>{tr("ui.shared.fd9b9842d2")}</b> {tr("ui.shared.31e27e629d")}</span>
          </div>
        )}

        {/* Claude/GPT 订阅改绑：放到最底部(不占主推位)，直连自己的订阅、不扣无为币 */}
        {rebind && (
          <button className="pay-opt pay-opt-plan trial-rebind" onClick={onRebind}>
            <span className="pay-badge">{tr("ui.app.no.credits.a3e0882")}</span>
            <span className="pay-oi"><PaySpark size={18} /></span>
            <span style={{ minWidth: 0 }}>
              <span className="pay-ot">{tr("ui.app.continue.with.6da12ef", { p0: rebind.label })}</span>
              <span className="pay-os" style={{ display: "block" }}>{tr("ui.app.direct.to.your.subscription.no.credits.f2c129c")}</span>
            </span>
            <span className="pay-arr"><PayArrow /></span>
          </button>
        )}

        <div className="pay-foot trial-foot">
          <button className="pay-foot__faq" onClick={onFaq}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M9.4 9a2.6 2.6 0 0 1 5 1c0 1.7-2.4 2-2.4 3.5" /><path d="M12 17.2h.01" /></svg>
            {tr("ui.app.faq.6cbae94")}
          </button>
          <button onClick={onClose}>{tr("ui.app.not.now.73bb3dc")}</button>
        </div>
      </div>
    </div>
  );
}
// 缺币弹窗「常见问题」：高频疑问，降低下单顾虑。问题结构参考同行(Raphael)但按无为实际改写。
const PAY_FAQ: { q: string; qEn: string; a: string; aEn: string }[] = [
  {
    get q() { return tr("ui.app.message.7352ce09d8"); },
    get qEn() { return tr("ui.app.message.7352ce09d8"); },
    get a() { return tr("ui.catalog.app.3fbf838b6d"); },
    get aEn() { return tr("ui.catalog.app.3fbf838b6d"); },
  },
  {
    get q() { return tr("ui.catalog.app.64f50df6e9"); },
    get qEn() { return tr("ui.catalog.app.64f50df6e9"); },
    get a() { return tr("ui.catalog.app.3359440ab6"); },
    get aEn() { return tr("ui.catalog.app.3359440ab6"); },
  },
  {
    get q() { return tr("ui.app.message.72ac8e6c3f"); },
    get qEn() { return tr("ui.app.message.72ac8e6c3f"); },
    get a() { return tr("ui.catalog.app.4f49d38c06"); },
    get aEn() { return tr("ui.catalog.app.4f49d38c06"); },
  },
  {
    get q() { return tr("ui.catalog.app.28f78cff7a"); },
    get qEn() { return tr("ui.catalog.app.28f78cff7a"); },
    get a() { return tr("ui.catalog.app.55bd39cbde"); },
    get aEn() { return tr("ui.catalog.app.55bd39cbde"); },
  },
  {
    get q() { return tr("ui.catalog.app.86070fb727"); },
    get qEn() { return tr("ui.catalog.app.86070fb727"); },
    get a() { return tr("ui.catalog.app.f38bddd62f"); },
    get aEn() { return tr("ui.catalog.app.f38bddd62f"); },
  },
  {
    get q() { return tr("ui.catalog.app.924de37425"); },
    get qEn() { return tr("ui.catalog.app.924de37425"); },
    get a() { return tr("ui.catalog.app.d55394651d"); },
    get aEn() { return tr("ui.catalog.app.d55394651d"); },
  },
];

function PayFaqModal({ en, onClose }: { en: boolean; onClose: () => void }) {
  return (
    <div className="perm-overlay pay-overlay" style={{ zIndex: 62 }} onClick={onClose}>
      <div className="pay-card pay-faq-card" onClick={(e) => e.stopPropagation()}>
        <PayCloseX onClick={onClose} />
        <div className="pay-top" style={{ paddingBottom: 8, paddingTop: 24 }}>
          <h2>{tr("ui.app.common.questions.30949d0")}</h2>
          <p>{tr("ui.app.quick.answers.before.you.subscribe.b254e89")}</p>
        </div>
        <div className="pay-faq-list">
          {PAY_FAQ.map((f, i) => (
            <div className="pay-faq-item" key={i}>
              <div className="pay-faq-q">{en ? f.qEn : f.q}</div>
              <div className="pay-faq-a">{en ? f.aEn : f.a}</div>
            </div>
          ))}
        </div>
        <div className="pay-faq-foot">
          <button onClick={onClose}>{tr("ui.app.back.to.plans.471e3a6")}</button>
        </div>
      </div>
    </div>
  );
}

// 缺币弹窗顶部展示的「升级后畅用」最强顶级模型（官方 SVG logo，取自共用库 modelLogos）。
type PayResult =
  | { kind: "coin"; added: number; bonus: number; balance: number; order: string }
  | { kind: "pro"; planName: string; expire: string; giftCoins: number; signin: number; perks: string[]; saved?: number; order: string }
  | { kind: "fail" };
// 支付结果页：积分到账 / Pro 月付·年付开通 / 失败。真实由 webhook 驱动，此处按订单即时展示。
function PayResultModal({ result, onClose, onRetry }: { result: PayResult; onClose: () => void; onRetry: () => void }) {
  const en = getLang() !== "zh";
  return (
    <div className="perm-overlay pay-overlay" onClick={onClose}>
      <div className={"pay-card payres-card" + (result.kind === "pro" ? " pro" : "")} onClick={(e) => e.stopPropagation()}>
        <PayCloseX onClick={onClose} />
        {result.kind === "coin" && (
          <>
            <div className="payres-ico">
              <div className="payres-mark ok">
                <svg viewBox="0 0 24 24" fill="none" stroke="#3E9E6E" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </div>
              <div className="payres-ttl">{tr("ui.app.payment.successful.e925929")}</div>
              <div className="payres-desc">{tr("ui.app.credits.added.enjoy.wuwei.hosted.models.3a573dc")}</div>
            </div>
            <div className="payres-box">
              <div className="payres-b1">{tr("ui.app.added.this.time.34f7f84")}</div>
              <div className="payres-b2">
                <span className="pay-coin" /> +{result.added.toLocaleString()}
                <span className="u">{tr("pay.credits")}</span>
              </div>
              <div className="payres-b3">
                <span>{result.bonus > 0 ? (tr("ui.app.bonus.138f1c2", { p0: result.bonus })) : ("instant")}</span>
                <span>{tr("ui.app.balance.9a789b2")} <b>{formatCredits(result.balance)}</b></span>
              </div>
            </div>
            <div className="payres-btns"><button className="payres-btn pri ok" onClick={onClose}>{tr("ui.app.start.using.97dac85")}</button></div>
            {result.order && <div className="payres-foot">{tr("ui.app.order.7545718", { p0: result.order })}</div>}
          </>
        )}
        {result.kind === "pro" && (
          <>
            <div className="payres-ico">
              <div className="payres-mark gold">
                <svg viewBox="0 0 24 24" fill="none" stroke="#A97F2E" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </div>
              <div className="payres-ttl">
                {tr("ui.app.activated.ed14381")} <span className="payres-pill"><PaySpark size={11} /> {result.planName}</span>
              </div>
              <div className="payres-desc">
                {tr("ui.app.activated.enjoy.all.member.benefits.3d4548f", { p0: result.planName })}
              </div>
            </div>
            <div className="payres-box gold">
              <div className="payres-b1">{tr("ui.app.valid.until.57a5106")}</div>
              <div className="payres-b2">{en ? result.expire : tr("ui.app.message.a364cced73", {p0: result.expire})}</div>
              <div className="payres-b3">
                <span>{tr("ui.app.daily.check.in.b2563fd", { p0: result.signin })}</span>
              </div>
            </div>
            <div className="payres-perks">
              {result.perks.map((pk) => (<span key={pk}>{pk}</span>))}
            </div>
            <div className="payres-btns"><button className="payres-btn pri gold" onClick={onClose}>{tr("ui.app.start.using.97dac85")}</button></div>
            <div className="payres-foot">
              {result.saved ? (tr("ui.app.saved.order.b97186a", { p0: result.saved, p1: result.order })) : (tr("ui.app.we.ll.remind.you.before.renewal.705e393"))}
            </div>
          </>
        )}
        {result.kind === "fail" && (
          <>
            <div className="payres-ico">
              <div className="payres-mark err">
                <svg viewBox="0 0 24 24" fill="none" stroke="#C0483C" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </div>
              <div className="payres-ttl err">{tr("ui.app.payment.not.completed.a4d8e0e")}</div>
              <div className="payres-desc">{tr("ui.app.this.order.wasn.charged.retry.or.6b7894a")}</div>
            </div>
            <div className="payres-reason">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
              <span>{tr("ui.app.possible.causes.payment.timeout.cancellation.or.b8c76b1")}</span>
            </div>
            <div className="payres-btns">
              <button className="payres-btn pri err" onClick={onRetry}>{tr("ui.app.pay.again.8a454d5")}</button>
              <button className="payres-btn ghost" onClick={onRetry}>{tr("ui.app.change.method.0bb3d1c")}</button>
            </div>
            <div className="payres-foot">{tr("ui.app.still.stuck.contact.support.7195b13")}</div>
          </>
        )}
      </div>
    </div>
  );
}
// 群设置模态：改群名 / 最多唤醒(maxWake) / 协调者。风格复用设置弹窗(add-st-dialog)+玄墨黑 VI。
function RoomSettingsModal({
  en, room, employees, onClose, onSave,
}: {
  en: boolean;
  room: { id: string; name: string; members: string[]; coordinator?: string; maxWake?: number };
  employees: any[];
  onClose: () => void;
  onSave: (patch: { name: string; maxWake: number; coordinator?: string }) => void | Promise<void>;
}) {
  const clamp = (n: number) => Math.min(20, Math.max(1, Math.round(n) || 1));
  const [name, setName] = useState(room.name || "");
  const [maxWake, setMaxWake] = useState(clamp(room.maxWake ?? 3));
  const [coordinator, setCoordinator] = useState<string | undefined>(room.coordinator);
  const [saving, setSaving] = useState(false);
  const members = (room.members || [])
    .map((id) => employees.find((e: any) => e.id === id))
    .filter(Boolean) as any[];
  const save = async () => {
    if (saving) return;
    setSaving(true);
    await onSave({
      name: name.trim() || (tr("ui.app.new.group.f8ac38c")),
      maxWake,
      coordinator: coordinator && (room.members || []).includes(coordinator) ? coordinator : undefined,
    });
  };
  return (
    <div className="perm-overlay" onClick={onClose}>
      <div className="add-st-dialog room-set" onClick={(e) => e.stopPropagation()}>
        <h3>{tr("ui.app.group.settings.d861667")}</h3>
        <div className="st-field">
          <label className="st-label">{tr("ui.app.group.name.8498dfd")}</label>
          <input
            className="st-input"
            value={name}
            maxLength={40}
            placeholder={tr("ui.app.group.name.7833ae9")}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
          />
        </div>
        <div className="st-field">
          <label className="st-label">{tr("ui.app.max.wake.per.message.1d3c1a7")}</label>
          <div className="rs-wake">
            <div className="rs-stepper">
              <button type="button" className="rs-step" disabled={maxWake <= 1} aria-label={tr("ui.app.decrease.0f04f93")} onClick={() => setMaxWake((v) => clamp(v - 1))}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14" /></svg>
              </button>
              <span className="rs-wake-num">{maxWake}</span>
              <button type="button" className="rs-step" disabled={maxWake >= 20} aria-label={tr("ui.app.increase.e2580a8")} onClick={() => setMaxWake((v) => clamp(v + 1))}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </button>
            </div>
            <div className="rs-chips">
              {[3, 5, 8, 12, 20].map((n) => (
                <button type="button" key={n} className={"rs-chip" + (maxWake === n ? " on" : "")} onClick={() => setMaxWake(n)}>{n}</button>
              ))}
            </div>
          </div>
          <p className="st-hint">{tr("ui.app.how.many.teammates.one.message.can.68c4f8f")}</p>
        </div>
        {members.length > 0 && (
          <div className="st-field">
            <label className="st-label">{tr("ui.app.coordinator.457724f")}</label>
            <div className="rs-coord">
              <button type="button" className={"rs-coord-item" + (!coordinator ? " on" : "")} onClick={() => setCoordinator(undefined)}>{tr("ui.app.none.9b96d58")}</button>
              {members.map((m) => (
                <button type="button" key={m.id} className={"rs-coord-item" + (coordinator === m.id ? " on" : "")} onClick={() => setCoordinator(m.id)}>{employeeLabel(m, (getCurrentLanguage()))}</button>
              ))}
            </div>
            <p className="st-hint">{tr("ui.app.the.coordinator.replies.without.being.ed.53ec16c")}</p>
          </div>
        )}
        <div className="btns">
          <button onClick={onClose}>{tr("set.st.cancel")}</button>
          <button className="allow" disabled={saving} onClick={() => void save()}>{saving ? (tr("ui.app.saving.4c8592b")) : (tr("set.st.save"))}</button>
        </div>
      </div>
    </div>
  );
}
// 一人公司设置面板（设置→「一人公司」独立模块）：CEO 把关 + 拍板倒计时 + 转派链层数。改动即存(team.configSet)，无需点保存。
function CompanyTeamSettings({ lang, teamOn, onToggle }: { lang: Lang; teamOn: boolean; onToggle: (v: boolean) => void }) {
  const en = lang !== "zh";
  const api = (window as any).wuwei?.team;
  const clampLv = (n: number) => Math.min(5, Math.max(1, Math.round(n) || 1));
  const clampSec = (n: number) => Math.min(60, Math.max(3, Math.round(n) || 10));
  const [employees, setEmployees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [addingDept, setAddingDept] = useState<string | null>(null);
  const [levels, setLevels] = useState(3);
  const [ceoId, setCeoId] = useState<string>(""); // "" = 自动识别(职位含CEO/名叫小笨)
  const [ceoSec, setCeoSec] = useState(10);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api?.state?.().then((s: any) => { setEmployees(s?.employees || []); setDepartments(s?.departments || []); }).catch(() => {});
    api?.configGet?.().then((c: any) => {
      setLevels(clampLv(c?.maxDmLevels ?? 3));
      setCeoId(c?.ceoEmployeeId || "");
      setCeoSec(clampSec(c?.ceoDecideTimeoutSec ?? 10));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const flash = () => { setSaved(true); window.setTimeout(() => setSaved(false), 1500); };
  const persist = (patch: any) => { api?.configSet?.(patch); flash(); };
  const onLevels = (n: number) => { const v = clampLv(n); setLevels(v); persist({ maxDmLevels: v }); };
  const onCeo = (id: string) => { setCeoId(id); persist({ ceoEmployeeId: id || null }); };
  const onSec = (n: number) => { const v = clampSec(n); setCeoSec(v); persist({ ceoDecideTimeoutSec: v }); };
  const ceoName = employeeLabel(employees.find((e) => e.id === ceoId), (getCurrentLanguage()), tr("ui.app.the.ceo.3ce4585"));
  // 部门 CRUD：改完以后端返回的 departments 为准(含成员互斥规整)。
  const applyDept = (r: any) => { if (r?.departments) setDepartments(r.departments); flash(); };
  const deptCreate = () => api?.deptCreate?.({ name: tr("ui.app.new.department.30a5a9e"), memberIds: [] }).then(applyDept).catch(() => {});
  const deptUpdate = (id: string, patch: any) => api?.deptUpdate?.(id, patch).then(applyDept).catch(() => {});
  const deptDelete = (id: string) => api?.deptDelete?.(id).then(applyDept).catch(() => {});
  const nameOf = (id: string) => employeeLabel(employees.find((e) => e.id === id), (getCurrentLanguage()), id);
  return (
    <>
      {/* 模块总开关：置于一人公司模块顶部。关闭时主进程完全不参与(不注册 IPC、不读写数据目录)；
          开关即决定下方 CEO 把关/转派链/部门等设置与侧边栏入口是否生效。原先在「通用→可选模块」，已上移到此。 */}
      <div className="app-set-row" style={{ cursor: "default", marginBottom: teamOn ? "16px" : "4px" }}>
        <div className="app-set-text">
          <div className="app-set-label">{tr("ui.app.enable.my.company.6aaddfc")}</div>
          <div className="app-set-hint">
            {tr("ui.app.chat.with.ai.teammates.or.bring.f4f2819")}
          </div>
        </div>
        <input
          type="checkbox"
          className="app-set-toggle"
          checked={teamOn}
          onChange={(e) => onToggle(e.target.checked)}
        />
      </div>
      {!teamOn && (
        <div className="app-set-hint" style={{ opacity: 0.8 }}>
          {tr("ui.app.turn.it.on.to.configure.ceo.d2f22fa")}
        </div>
      )}
      {teamOn && (<>
      <CompanyHistorySettings lang={lang} />
      <div className="app-set-group">{tr("ui.app.ceo.gatekeeping.edecead")}</div>
      {/* CEO 是谁 */}
      <div className="app-set-row" style={{ cursor: "default", gap: "10px" }}>
        <div className="app-set-label" style={{ whiteSpace: "nowrap" }}>{tr("ui.app.ceo.9048083")}</div>
        <span style={{ flex: 1 }} />
        <select className="tc-input tc-select" style={{ maxWidth: 240 }} value={ceoId} onChange={(e) => onCeo(e.target.value)}>
          <option value="">{tr("ui.app.auto.ceo.role.default.team.ceo.5a7990c")}</option>
          {employees.map((m: any) => <option key={m.id} value={m.id}>{employeeLabel(m, (getCurrentLanguage()))}{m.title ? ` (${localizeEmployee(m, (getCurrentLanguage())).title})` : ""}</option>)}
        </select>
      </div>
      {/* 拍板倒计时秒数 */}
      <div className="app-set-row" style={{ cursor: "default", gap: "10px" }}>
        <div className="app-set-label" style={{ whiteSpace: "nowrap" }}>{tr("ui.app.ceo.decision.countdown.7fc63a8")}</div>
        <span style={{ flex: 1 }} />
        <div className="set-field">
          <input
            type="number"
            min={3}
            max={60}
            value={ceoSec}
            onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ""); onSec(Number(v) || 10); }}
            className="set-field-input"
          />
          <span className="set-field-unit">{tr("ui.app.sec.f3d066d")}</span>
        </div>
      </div>
      <div className="app-set-hint" style={{ marginBottom: "16px" }}>
        {tr("ui.app.when.teammate.uses.ask.user.gets.b39f425", { p0: ceoName })}
      </div>
      <div className="app-set-group">{tr("ui.app.transfer.chain.274f015")}</div>
      <div className="app-set-row" style={{ cursor: "default", gap: "10px" }}>
        <div className="app-set-label" style={{ whiteSpace: "nowrap" }}>{tr("ui.app.max.transfer.chain.levels.690c2c5")}</div>
        <span style={{ flex: 1 }} />
        <div className="set-field">
          <input
            type="number"
            min={1}
            max={5}
            value={levels}
            onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ""); onLevels(Number(v) || 1); }}
            className="set-field-input"
          />
          <span className="set-field-unit">{tr("ui.app.levels.2967b4c")}</span>
        </div>
      </div>
      <div className="app-set-hint" style={{ marginBottom: "10px" }}>
        {tr("ui.app.how.many.teammates.single.dm.transfer.badb777")}
      </div>

      <div className="app-set-group" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>{tr("ui.app.departments.cd7d6e1")}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="tc-btn" style={{ fontSize: 12, padding: "3px 10px" }} onClick={deptCreate}>+ {tr("ui.app.new.department.46ebda5")}</button>
      </div>
      <div className="app-set-hint" style={{ marginBottom: departments.length ? 10 : 0 }}>
        {tr("ui.app.each.teammate.belongs.to.one.department.c304691")}
      </div>
      {departments.map((d: any) => (
        <div key={d.id} className="dept-card">
          <div className="dept-card-row">
            <DepartmentNameInput department={d} language={(getCurrentLanguage())} onSave={name => deptUpdate(d.id, { name })} />
            <button type="button" className="tc-btn-ghost danger" style={{ fontSize: 12 }} onClick={() => deptDelete(d.id)}>{tr("set.st.delShort")}</button>
          </div>
          <div className="dept-card-row">
            <span className="dept-card-lbl">{tr("ui.app.head.13d4010")}</span>
            <select className="tc-input tc-select" style={{ flex: 1 }} value={d.headId || ""} onChange={(e) => deptUpdate(d.id, { headId: e.target.value || undefined })}>
              <option value="">{tr("ui.app.none.e1dbbb8")}</option>
              {(d.memberIds || []).map((id: string) => <option key={id} value={id}>{nameOf(id)}</option>)}
            </select>
          </div>
          <div className="dept-card-row" style={{ marginTop: 6 }}>
            <span className="dept-card-lbl">{tr("ui.app.members.a4462f0")}</span>
            <button type="button" className="tc-btn-ghost" onClick={() => setAddingDept(addingDept === d.id ? null : d.id)}>{addingDept === d.id ? (tr("pay.msg.done")) : (tr("ui.app.add.member.53197aa"))}</button>
          </div>
          <div className="dept-members">
            {employees.filter(e => (d.memberIds || []).includes(e.id)).map((e) => {
              const inDept = (d.memberIds || []).includes(e.id);
              const otherDept = departments.find((x) => x.id !== d.id && (x.memberIds || []).includes(e.id));
              return (
                <button
                  key={e.id}
                  type="button"
                  className={"dept-chip" + (inDept ? " on" : "")}
                  title={otherDept && !inDept ? (tr("ui.app.move.from.19966d7", { p0: (en ? departmentLabel(otherDept, "en") : otherDept.name) })) : undefined}
                  onClick={() => {
                    const next = inDept ? (d.memberIds || []).filter((m: string) => m !== e.id) : [...(d.memberIds || []), e.id];
                    deptUpdate(d.id, { memberIds: next });
                  }}
                >
                  <span className="dept-chip-av"><EmployeeAvatar icon={e.icon} avatarData={e.avatarData} name={employeeLabel(e, (getCurrentLanguage()))}  /></span>
                  {employeeLabel(e, (getCurrentLanguage()))} <span aria-label={tr("ui.app.remove.member.3f76a15")}>×</span>
                </button>
              );
            })}
          </div>
          {!(d.memberIds || []).length && <div className="app-set-hint">{tr("ui.app.no.members.8eeaea1")}</div>}
          {addingDept === d.id && <div className="dept-add-members" style={{ marginTop: 8 }}>
            <div className="app-set-hint">{tr("ui.app.choose.teammate.members.of.another.department.7372db3")}</div>
            <div className="dept-members">
              {employees.filter(e => !(d.memberIds || []).includes(e.id)).map(e => {
                const from = departments.find(x => (x.memberIds || []).includes(e.id));
                return <button key={e.id} type="button" className="dept-chip" onClick={() => { deptUpdate(d.id, { memberIds: [...(d.memberIds || []), e.id] }); setAddingDept(null); }}>
                  <span className="dept-chip-av"><EmployeeAvatar icon={e.icon} avatarData={e.avatarData} name={employeeLabel(e, (getCurrentLanguage()))} /></span>
                  {employeeLabel(e, (getCurrentLanguage()))}{from ? ` · ${departmentLabel(from, (getCurrentLanguage()))}` : ""}
                </button>;
              })}
              {employees.every(e => (d.memberIds || []).includes(e.id)) && <span className="app-set-hint">{tr("ui.app.all.teammates.added.cd5b48a")}</span>}
            </div>
          </div>}
        </div>
      ))}
      </>)}
      {saved && <div className="app-set-hint" style={{ color: "var(--ok, #3fb950)" }}>{tr("ui.app.saved.0a6bf62")}</div>}
    </>
  );
}
// 定时任务触发规则 → 人话(与主进程 triggerText 镜像)。
function schedTriggerText(t: any, en: boolean): string {
  const p2 = (n: number) => String(n).padStart(2, "0");
  const wk = [tr("ui.index.sun.a18e87c"), tr("ui.index.mon.30b15fa"), tr("ui.index.tue.9e7b616"), tr("ui.index.wed.fc1b35b"), tr("ui.index.thu.10d2d87"), tr("ui.index.fri.444209f"), tr("ui.index.sat.b3e9391")];
  if (!t) return "";
  if (t.kind === "daily") return tr("ui.index.daily.e4f3761", { p0: p2(t.hour), p1: p2(t.minute) });
  if (t.kind === "weekly") return tr("ui.index.text.f63cdcd", { p0: wk[t.weekday], p1: p2(t.hour), p2: p2(t.minute) });
  if (t.kind === "monthly") return tr("ui.index.day.8095ce1", { p0: t.day, p1: p2(t.hour), p2: p2(t.minute) });
  if (t.kind === "interval") return tr("ui.app.every.16046fb", { p0: t.everyMinutes });
  return "";
}

// 定时任务 新建/编辑 弹窗：触发规则(每天/每周/每月/间隔) + 内容(引用SOP 或 内嵌文档) + 启用开关。
function ScheduleModal({ en, employeeId, task, sopNodes, onClose }: { en: boolean; employeeId: string; task?: any; sopNodes: { id: string; name: string }[]; onClose: () => void }) {
  const api = (window as any).wuwei?.team;
  const t0 = task?.trigger || { kind: "daily", hour: 20, minute: 0 };
  const [name, setName] = useState(task?.name || "");
  const [kind, setKind] = useState<string>(t0.kind || "daily");
  const [hour, setHour] = useState<number>(t0.hour ?? 20);
  const [minute, setMinute] = useState<number>(t0.minute ?? 0);
  const [weekday, setWeekday] = useState<number>(t0.weekday ?? 1);
  const [day, setDay] = useState<number>(t0.day ?? 1);
  const [everyMinutes, setEveryMinutes] = useState<number>(t0.everyMinutes ?? 60);
  const [mode, setMode] = useState<"sop" | "doc">(task?.sopId ? "sop" : "doc");
  const [sopId, setSopId] = useState<string>(task?.sopId || (sopNodes[0]?.id || ""));
  const [doc, setDoc] = useState<string>(task?.doc || "");
  const [enabled, setEnabled] = useState<boolean>(task?.enabled !== false);
  const [saving, setSaving] = useState(false);
  const wk = [tr("ui.index.sun.a18e87c"), tr("ui.index.mon.30b15fa"), tr("ui.index.tue.9e7b616"), tr("ui.index.wed.fc1b35b"), tr("ui.index.thu.10d2d87"), tr("ui.index.fri.444209f"), tr("ui.index.sat.b3e9391")];
  const num = (v: string, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.floor(Number(v) || 0)));

  const save = async () => {
    if (saving) return;
    const nm = name.trim();
    if (!nm) return;
    let trigger: any;
    if (kind === "daily") trigger = { kind, hour, minute };
    else if (kind === "weekly") trigger = { kind, weekday, hour, minute };
    else if (kind === "monthly") trigger = { kind, day, hour, minute };
    else trigger = { kind: "interval", everyMinutes: Math.max(1, everyMinutes) };
    const payload: any = { employeeId, name: nm, trigger, enabled };
    if (mode === "sop" && sopId) { payload.sopId = sopId; } else { payload.doc = doc.trim(); }
    if (!payload.sopId && !payload.doc) return; // 内容不能空
    setSaving(true);
    if (task?.id) await api?.scheduleUpdate?.(task.id, payload);
    else await api?.scheduleCreate?.(payload);
    onClose();
  };

  return (
    <div className="perm-overlay" onClick={onClose}>
      <div className="add-st-dialog room-set" onClick={(e) => e.stopPropagation()}>
        <h3>{task?.id ? (tr("ui.app.edit.schedule.e0a9f05")) : (tr("ui.app.new.schedule.60e93cc"))}</h3>
        <div className="st-field">
          <label className="st-label">{tr("ui.app.task.name.dcd497e")}</label>
          <input className="st-input" value={name} maxLength={40} placeholder={tr("ui.app.daily.site.review.77b137f")} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="st-field">
          <label className="st-label">{tr("ui.app.trigger.5e0e100")}</label>
          <div className="rs-chips" style={{ marginBottom: 8 }}>
            {[["daily", tr("ui.app.daily.56d9546")], ["weekly", tr("ui.app.weekly.4cf15a1")], ["monthly", tr("ui.app.monthly.1ba7008")], ["interval", tr("ui.app.interval.7afb527")]].map(([k, lbl]) => (
              <button type="button" key={k} className={"rs-chip" + (kind === k ? " on" : "")} onClick={() => setKind(k)}>{lbl}</button>
            ))}
          </div>
          <div className="sched-trigger-row">
            {kind === "weekly" && (
              <select className="tc-input tc-select" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                {wk.map((w, i) => <option key={i} value={i}>{w}</option>)}
              </select>
            )}
            {kind === "monthly" && (
              <span className="sched-inline">{tr("ui.app.day.e4fd26d")}<input className="st-input sched-num" type="number" min={1} max={31} value={day} onChange={(e) => setDay(num(e.target.value, 1, 31))} />{tr("ui.app.text.7a08b92")}</span>
            )}
            {kind === "interval" ? (
              <span className="sched-inline">{tr("ui.app.every.b943711")}<input className="st-input sched-num" type="number" min={1} value={everyMinutes} onChange={(e) => setEveryMinutes(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />{tr("ui.app.min.11974cf")}</span>
            ) : (
              <span className="sched-inline">
                <input className="st-input sched-num" type="number" min={0} max={23} value={hour} onChange={(e) => setHour(num(e.target.value, 0, 23))} />:
                <input className="st-input sched-num" type="number" min={0} max={59} value={minute} onChange={(e) => setMinute(num(e.target.value, 0, 59))} />
              </span>
            )}
          </div>
          <p className="st-hint">{tr("ui.app.hour.local.time.interval.min.minute.c04631f")}</p>
        </div>
        <div className="st-field">
          <label className="st-label">{tr("ui.app.content.4c48452")}</label>
          <div className="rs-chips" style={{ marginBottom: 8 }}>
            <button type="button" className={"rs-chip" + (mode === "sop" ? " on" : "")} onClick={() => setMode("sop")} disabled={sopNodes.length === 0}>{tr("ui.app.reference.sop.0986837")}</button>
            <button type="button" className={"rs-chip" + (mode === "doc" ? " on" : "")} onClick={() => setMode("doc")}>{tr("ui.app.inline.doc.3a78c89")}</button>
          </div>
          {mode === "sop" ? (
            sopNodes.length > 0 ? (
              <select className="tc-input tc-select" value={sopId} onChange={(e) => setSopId(e.target.value)}>
                {sopNodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            ) : <p className="st-hint">{tr("ui.app.no.sop.yet.write.one.first.e5161f2")}</p>
          ) : (
            <textarea className="tc-textarea" rows={5} value={doc} placeholder={tr("ui.app.write.what.to.do.when.triggered.c934baf")} onChange={(e) => setDoc(e.target.value)} />
          )}
        </div>
        <label className="sched-enable"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> {tr("ui.app.enabled.02606e2")}</label>
        <div className="btns">
          {task?.id && <button className="danger" style={{ marginRight: "auto" }} onClick={async () => { await api?.scheduleDelete?.(task.id); onClose(); }}>{tr("set.st.delShort")}</button>}
          <button onClick={onClose}>{tr("set.st.cancel")}</button>
          <button className="allow" disabled={saving || !name.trim()} onClick={() => void save()}>{saving ? (tr("ui.app.saving.4c8592b")) : (tr("set.st.save"))}</button>
        </div>
      </div>
    </div>
  );
}

// SOP 文字输入弹窗：替代原生 prompt()（Electron 里 prompt 返回 null 不可用）。
// 风格复用 perm-overlay + add-st-dialog + st-input，玄墨黑 VI，回车=确定、Esc/遮罩=取消。
type SopPromptOpts = { title: string; label?: string; defaultValue?: string; placeholder?: string; okText?: string; onOk: (text: string) => void };
function SopPromptDialog({ en, opts, onClose }: { en: boolean; opts: SopPromptOpts; onClose: () => void }) {
  const [val, setVal] = useState(opts.defaultValue || "");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const submit = () => { const tx = val.trim(); onClose(); if (tx) opts.onOk(tx); };
  return (
    <div className="perm-overlay" style={{ zIndex: 1300 }} onClick={onClose}>
      <div className="add-st-dialog" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{opts.title}</h3>
        <div className="st-field" style={{ marginBottom: 0 }}>
          {opts.label && <label className="st-label">{opts.label}</label>}
          <input
            ref={ref}
            className="st-input"
            value={val}
            placeholder={opts.placeholder}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } else if (e.key === "Escape") onClose(); }}
          />
        </div>
        <div className="btns" style={{ marginTop: 16 }}>
          <button onClick={onClose}>{tr("set.st.cancel")}</button>
          <button className="allow" onClick={submit}>{opts.okText || (tr("ui.app.confirm.a1f6762"))}</button>
        </div>
      </div>
    </div>
  );
}
function GlobeIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "0 0 auto", display: "block" }}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.3 3.6 8.5S14.4 18.2 12 20.5c-2.4-2.3-3.6-5.3-3.6-8.5S9.6 5.8 12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
      />
    </svg>
  );
}
function GearIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "0 0 auto" }}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}
function LogoutIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "0 0 auto" }}>
      <path
        d="M14.5 5H6.8A1.8 1.8 0 0 0 5 6.8v10.4A1.8 1.8 0 0 0 6.8 19h7.7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M18.5 12H10m8.5 0-3-3m3 3-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function RefreshIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "0 0 auto" }}>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M20 4v4h-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// —— 会话右键菜单图标（统一简约线性 · currentColor · 无为 VI）——
function HandoffIcon({ size = 15 }: { size?: number }) {
  // 主干下行 → 向右分叉 → 箭头：表意「从本对话交接/分流到一个新对话」
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "0 0 auto" }}>
      <path d="M7 4v6a4 4 0 0 0 4 4h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 11l3.5 3-3.5 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function DoneIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "0 0 auto" }}>
      <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function DiscussIcon({ size = 15 }: { size?: number }) {
  // 带小尾巴的对话气泡 = 待讨论
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "0 0 auto" }}>
      <path d="M5 5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-9l-4 3.5V15H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
function PlusIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "0 0 auto" }}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function ReportIcon({ size = 15 }: { size?: number }) {
  // 带横线的文档 = 一键生成日报
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "0 0 auto" }}>
      <rect x="5" y="4" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.5 9h7M8.5 12.5h7M8.5 16h4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function RestoreSizeIcon({ size = 14 }: { size?: number }) {
  // 四角箭头回中心 = 尺寸复位(恢复默认/跟随输入框)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "0 0 auto" }}>
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function FoldIcon({ size = 14 }: { size?: number }) {
  // 缩小/折叠 = 一条横线（与右上角窗口最小化图标一致，简洁）
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "0 0 auto" }}>
      <path d="M6 12h12" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
function GiftIcon({ size = 22, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: "block" }}>
      <rect x="3.5" y="9" width="17" height="11.5" rx="1.6" stroke={color} strokeWidth="1.6" />
      <path d="M2.5 9h19v3.2h-19z" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 9v11.5" stroke={color} strokeWidth="1.6" />
      <path d="M12 9S10.8 5 8 5a1.8 1.8 0 000 3.6c2 0 4 .4 4 .4Zm0 0s1.2-4 4-4a1.8 1.8 0 010 3.6c-2 0-4 .4-4 .4Z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// 邮箱输入自动补全的常用后缀（国内外主流邮箱，按常用度排序）
const EMAIL_SUFFIXES = [
  "gmail.com",
  "qq.com",
  "163.com",
  "126.com",
  "foxmail.com",
  "outlook.com",
  "hotmail.com",
  "sina.com",
  "139.com",
  "yeah.net",
];

// 应用内登录框（邮箱密码登录 / 邮箱验证码注册 / 手机验证码直登注册 / Google浏览器兜底）
// 后端契约（需 wuwei-site 实现）：
//   POST /api/auth/password    {identifier,password}     → {access_token,refresh_token,expires_at}|{error}
//   POST /api/auth/send-code   {target}                  → {ok}|{error}   (target=邮箱或手机号)
//   POST /api/auth/register    {email,code,password}     → {...tokens}|{error}
//   POST /api/auth/verify-code {target,code}             → {...tokens}|{error}  (无账号自动注册)
// 登录方式开关：手机号 / 微信后端尚未接通，先隐藏；接通后翻成 true 即恢复。
const PHONE_LOGIN_ENABLED = false;
const WECHAT_LOGIN_ENABLED = false;

// 登录激励卡（居中弹窗）：未登录发消息时先弹这张（更多模型 + 注册赠币 10 无为币（24 小时有效）），
// 点「登录」再切到真正的登录表单。比一上来就甩登录框更干净、转化更好。
function LoginIntroModal({ lang, t, onClose, onLogin, onKeepFree, reason, onLang, showLangSwitch }: { lang: Lang; t: T; onClose: () => void; onLogin: () => void; onKeepFree?: () => void; reason?: string | null; onLang?: (l: Lang) => void; showLangSwitch?: boolean }) {
  const zh = lang === "zh";
  return (
    <>
      <div className="mq-overlay" onClick={onClose} />
      <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
        <div
          style={{
            width: 300,
            maxWidth: "90vw",
            background: "var(--bg-raised)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: "22px 22px 20px",
            boxShadow: "0 16px 44px rgba(0,0,0,.28)",
            position: "relative",
            textAlign: "center",
          }}
        >
          {showLangSwitch && onLang && <LanguageSwitcher language={lang} onChange={onLang} />}
          <button
            onClick={onClose}
            title={makeT(getLang())("msg.close")}
            style={{ position: "absolute", top: 8, right: 10, width: 26, height: 26, background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, lineHeight: 1, cursor: "pointer" }}
          >
            ×
          </button>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: "50%",
              margin: "4px auto 12px",
              background: "linear-gradient(135deg,#C87551,#A34E30)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 5px 16px rgba(192,95,60,.35)",
            }}
          >
            <GiftIcon size={22} color="#F4F6F8" />
          </div>
          {/* 弹卡原因：第一眼告诉用户「为啥要登录」(额度用完/需登录)，别让新用户懵。仅有具体原因时显示 */}
          {reason && (
            <div className="login-intro-reason" style={{ fontSize: 11.5, fontWeight: 600, color: "#C05F3C", background: "rgba(192,95,60,.09)", borderRadius: 9, padding: "7px 10px", marginBottom: 12, lineHeight: 1.4, overflowWrap: "anywhere", textAlign: "center" }}>
              {localizeStoredText(reason, getCurrentLanguage())}
            </div>
          )}
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 7, lineHeight: 1.3, letterSpacing: 0.2, color: "var(--text)" }}>
            {zh ? (
              <>
                <span style={{ color: "#C05F3C" }}>{tr("login.signin")}</span>{tr("ui.app.message.97b263eb21")}</>
            ) : (
              <>
                <span style={{ color: "#C05F3C" }}>{tr("usage.clickLogin")}</span> {tr("ui.shared.4c19da5fdb")}</>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.4 }}>
            {tr("ui.app.free.models.have.daily.limits.paid.eb2cb7e")}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, auto)",
              justifyContent: "center",
              columnGap: 16,
              rowGap: 7,
              marginBottom: 13,
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-dim)",
              whiteSpace: "nowrap",
            }}
          >
            {[
              { k: "claude", n: "Claude" },
              { k: "gpt", n: "GPT" },
              { k: "deepseek", n: tr("ui.app.message.f310ff0f0e") },
              { k: "kimi", n: "Kimi" },
            ].map((m) => (
              <span key={m.k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span
                  style={{ width: 18, height: 18, borderRadius: 5, background: "#fff", boxShadow: "0 0 0 1px rgba(0,0,0,.06)", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}
                >
                  <img src={BRAND_LOGOS[m.k]} alt="" width={13} height={13} style={{ display: "block", objectFit: "contain" }} />
                </span>
                {m.n}
              </span>
            ))}
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11.5,
              fontWeight: 500,
              color: "#C05F3C",
              background: "rgba(192,95,60,.09)",
              padding: "3px 11px",
              borderRadius: 20,
              marginBottom: 16,
              whiteSpace: "nowrap",
            }}
          >
            <CoinIcon size={12} />
            {t("login.signupGift")}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", lineHeight: 1.4, marginTop: -10, marginBottom: 12 }}>
            {t("login.signupGiftExpiry")}
          </div>
          <button
            onClick={onLogin}
            style={{ width: "100%", padding: "10px", borderRadius: 10, border: "none", background: "#C05F3C", color: "#F4F6F8", fontSize: 14, fontWeight: 600, letterSpacing: 2, cursor: "pointer", boxShadow: "0 3px 12px rgba(192,95,60,.3)" }}
          >
            {t("login.signin")}
          </button>
          {/* 软出口：不逼登录，给一条「继续免费体验」的路 —— 弹出也不流失，激活→留存更顺。
              点击 = 关卡片、留在免登录免费模型上继续用（转化真凶是"感觉被墙住"，不是没登录）。 */}
          <button
            onClick={() => { void window.wuwei.track?.("login_popup_keep_free", {}); if (onKeepFree) onKeepFree(); else onClose(); }}
            style={{ marginTop: 10, width: "100%", padding: "6px", background: "none", border: "none", color: "var(--text-muted)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
          >
            {tr("ui.app.keep.exploring.free.no.sign.in.35ce4ba")}
          </button>
        </div>
      </div>
    </>
  );
}

function WuweiLoginModal({
  incentive,
  sessionExpired,
  lang,
  t,
  onClose,
  onSuccess,
  onLang,
}: {
  incentive?: boolean;
  sessionExpired?: boolean;
  lang: Lang;
  onLang: (l: Lang) => void;
  t: T;
  onClose: () => void;
  onSuccess: (me: WuweiMe, action?: "login" | "register" | "reset") => void;
}) {
  type Mode = "email-login" | "email-register" | "email-reset" | "phone";
  const zh = lang === "zh";
  const [mode, setMode] = useState<Mode>("email-login");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false); // 验证码发送单独态，不牵连主按钮
  const [err, setErr] = useState("");
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  // 记住登录：账号历史 + 打开时自动填最近一个账号密码
  const [accounts, setAccounts] = useState<{ email: string; password: string }[]>([]);
  const [showAcctDrop, setShowAcctDrop] = useState(false); // 账号输入下拉历史
  useEffect(() => {
    // 兼容旧 preload：新 IPC 未注入时(主进程未重启)优雅跳过，绝不因此白屏
    if (typeof window.wuwei?.rememberGet !== "function") return;
    void window.wuwei
      .rememberGet()
      .then((d) => {
        if (!d) return;
        setAccounts(d.accounts || []);
        const last = d.accounts?.find((a) => a.email === d.last) || d.accounts?.[0];
        if (last) {
          setEmail(last.email);
          setPassword(last.password || "");
        }
      })
      .catch(() => {});
  }, []);

  // 后端可能回错误码(如 missing_credentials)或人类可读消息；码→友好文案，消息→原样。
  function friendlyErr(raw?: string): string {
    const s = (raw || "").trim();
    if (!s) return t("login.err.generic");
    // 1. 精确错误码(如 missing_credentials / email_exists)
    const mapped = t("login.err." + s.toLowerCase(), "");
    if (mapped) return mapped;
    // 2. 已含中文(多为我们后端的可读提示) → 原样显示
    if (/[一-鿿]/.test(s)) {
      const code = Object.entries(systemData.authErrorAliases).find(([, aliases]) => aliases.some(alias => s.includes(alias)))?.[0];
      if (code) return t("login.err." + code);
      const localized = localizeStoredText(s, lang);
      return lang !== "zh" && /[一-鿿]/.test(localized) ? t("login.err.generic") : localized;
    }
    // 3. 匹配已知英文消息(Supabase 等第三方回的) → 映射成中文
    const low = s.toLowerCase();
    const M: [string, string][] = [
      ["invalid login credentials", "login.err.invalid_credentials"],
      ["invalid credentials", "login.err.invalid_credentials"],
      ["email not confirmed", "login.err.email_not_confirmed"],
      ["already registered", "login.err.email_exists"],
      ["already been registered", "login.err.email_exists"],
      ["user not found", "login.err.user_not_found"],
      ["signups not allowed", "login.err.user_not_found"],
      ["has expired", "login.err.code_expired"],
      ["expired", "login.err.code_expired"],
      ["invalid otp", "login.err.invalid_code"],
      ["invalid token", "login.err.invalid_code"],
      ["token is invalid", "login.err.invalid_code"],
      ["should be at least", "login.err.weak_password"],
      ["for security purposes", "login.err.rate_limited"],
      ["rate limit", "login.err.rate_limited"],
      ["too many", "login.err.rate_limited"],
      ["network", "login.err.network"],
      ["failed to fetch", "login.err.network"],
    ];
    for (const [pat, key] of M) if (low.includes(pat)) return t(key);
    // 4. 其它未知英文技术消息 → 通用兜底(绝不把英文技术串丢给用户)
    return t("login.err.generic");
  }
  async function sendCode() {
    const target = mode === "phone" ? phone.trim() : email.trim();
    if (!target) {
      setErr(mode === "phone" ? t("login.needPhone") : t("login.needEmail"));
      return;
    }
    setSending(true);
    setErr("");
    // 注册要求邮箱未注册、找回密码要求已注册 → 后端按 purpose 查重
    const purpose = mode === "email-reset" ? "reset" : mode === "email-register" ? "register" : undefined;
    const r = await window.wuwei.wuweiSendCode(target, lang, purpose);
    setSending(false);
    if (r === true) {
      setCooldown(60);
      return;
    }
    // 注册时邮箱已存在 → 提示并引导去登录
    if (r === "email_exists") {
      setErr(t("login.err.email_exists"));
      setMode("email-login");
      return;
    }
    setErr(typeof r === "string" ? friendlyErr(r) : t("login.sendFail"));
  }
  async function submit() {
    // 客户端先做空值校验，避免把 missing_credentials 这类码丢给用户
    if (mode === "phone") {
      if (!phone.trim()) return setErr(t("login.needPhone"));
      if (!code.trim()) return setErr(t("login.needCode"));
    } else {
      if (!email.trim()) return setErr(t("login.needEmail"));
      if ((mode === "email-register" || mode === "email-reset") && !code.trim()) return setErr(t("login.needCode"));
      if (!password) return setErr(t("login.needPassword"));
    }
    setBusy(true);
    setErr("");
    let res: { me?: WuweiMe; error?: string };
    if (mode === "email-login") res = await window.wuwei.wuweiPasswordLogin(email.trim(), password);
    // 找回密码复用 register 接口：验证码校验通过后重设密码并直接登录
    else if (mode === "email-register" || mode === "email-reset")
      res = await window.wuwei.wuweiRegister(email.trim(), code.trim(), password);
    else res = await window.wuwei.wuweiCodeLogin(phone.trim(), code.trim());
    setBusy(false);
    if (res.me) {
      void window.wuwei.track?.("login_success", { method: mode === "phone" ? "sms" : "email", mode });
      // 登录/注册/改密成功且有密码 → 记住账号密码(手机验证码模式无密码不记)
      if (mode !== "phone" && password) void window.wuwei.rememberSet?.(email.trim(), password);
      onSuccess(res.me, mode === "email-register" ? "register" : mode === "email-reset" ? "reset" : "login");
    } else setErr(friendlyErr(res.error));
  }
  async function googleLogin() {
    setBusy(true);
    setErr("");
    const me = await window.wuwei.wuweiLogin();
    setBusy(false);
    if (me) { void window.wuwei.track?.("login_success", { method: "google" }); onSuccess(me); }
    else setErr(t("login.googleIncomplete"));
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 11px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-input)",
    color: "var(--text)",
    fontSize: 13,
    marginBottom: 9,
    outline: "none",
    boxSizing: "border-box",
  };
  const tabStyle = (on: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "7px 0",
    fontSize: 13,
    cursor: "pointer",
    background: "none",
    border: "none",
    color: on ? "var(--text)" : "var(--text-muted)",
    fontWeight: on ? 600 : 400,
    borderBottom: on ? "2px solid var(--spark)" : "2px solid transparent",
  });
  // 验证码按钮：与输入框同高、主题中性、品牌色文字；冷却/发送时置灰
  const codeBtnStyle: React.CSSProperties = {
    flex: "0 0 auto",
    padding: "0 12px",
    height: 36,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-soft)",
    color: cooldown > 0 || sending ? "var(--text-muted)" : "var(--spark)",
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: "nowrap",
    cursor: cooldown > 0 || sending ? "default" : "pointer",
    marginBottom: 9,
  };
  const codeBtnLabel = cooldown > 0 ? `${cooldown}s` : sending ? t("login.sending") : t("login.getCode");

  return (
    <>
      <div className="mq-overlay" onClick={onClose} />
      <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
        <div
          style={{
            width: 340,
            maxWidth: "90vw",
            background: "var(--bg-raised)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "22px 22px 18px",
            boxShadow: "0 16px 44px rgba(0,0,0,.28)",
            position: "relative",
          }}
        >
          {onLang && <LanguageSwitcher language={lang} onChange={onLang} />}
          <button
            onClick={onClose}
            title={makeT(getLang())("msg.close")}
            style={{ position: "absolute", top: 8, right: 10, width: 26, height: 26, background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, lineHeight: 1, cursor: "pointer" }}
          >
            ×
          </button>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: incentive ? 8 : 16 }}>
            <WuweiLogo size={46} />
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: 0.5 }}>
              {mode === "email-register"
                ? t("login.register")
                : mode === "email-reset"
                  ? t("login.resetTitle")
                  : t("login.signin")}
            </div>
          </div>
          {sessionExpired && <div className="session-expired-notice" role="alert">
            {tr("ui.app.your.session.has.expired.please.sign.8c6802c")}
          </div>}
          {incentive && (
            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>
                {t("login.freeModels")}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{t("login.incentive")}</div>
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4 }}>{t("login.signupGiftExpiry")}</div>
            </div>
          )}
          {/* 邮箱/手机 切换：仅中文版有手机号（后端未接通时整块隐藏） */}
          {zh && PHONE_LOGIN_ENABLED && (
            <div style={{ display: "flex", marginBottom: 14 }}>
              <button style={tabStyle(mode !== "phone")} onClick={() => { setMode("email-login"); setErr(""); }}>
                {t("login.tab.email")}
              </button>
              <button style={tabStyle(mode === "phone")} onClick={() => { setMode("phone"); setErr(""); }}>
                {t("login.tab.phone")}
              </button>
            </div>
          )}

          {mode === "phone" ? (
            <>
              <input style={inputStyle} placeholder={t("login.phone")} value={phone} onChange={(e) => setPhone(e.target.value)} />
              <div style={{ display: "flex", gap: 8 }}>
                <input style={{ ...inputStyle, flex: 1 }} placeholder={t("login.code")} value={code} onChange={(e) => setCode(e.target.value)} />
                <button onClick={sendCode} disabled={sending || cooldown > 0} style={codeBtnStyle}>
                  {codeBtnLabel}
                </button>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>{t("login.autoRegister")}</div>
            </>
          ) : (
            <>
              <div style={{ position: "relative", marginBottom: 9 }}>
                <input
                  style={{ ...inputStyle, marginBottom: 0 }}
                  placeholder={t("login.email")}
                  value={email}
                  autoComplete="off"
                  onChange={(e) => { setEmail(e.target.value); setShowAcctDrop(true); }}
                  onFocus={() => setShowAcctDrop(true)}
                  onBlur={() => setTimeout(() => setShowAcctDrop(false), 150)}
                />
                {showAcctDrop && (() => {
                  const q = email.trim().toLowerCase();
                  const list = accounts.filter((a) => !q || a.email.toLowerCase().includes(q));
                  // 常用邮箱后缀补全：输入前缀(未打 @ 或域名没打完)时，列出 前缀@常用后缀，方便快速填完整邮箱
                  const raw = email.trim();
                  const atIdx = raw.indexOf("@");
                  const local = atIdx >= 0 ? raw.slice(0, atIdx) : raw;
                  const domainPart = atIdx >= 0 ? raw.slice(atIdx + 1).toLowerCase() : "";
                  const savedSet = new Set(list.map((a) => a.email.toLowerCase()));
                  const suffixSug =
                    local && !/\s/.test(local)
                      ? EMAIL_SUFFIXES
                          .filter((d) => !domainPart || (d.startsWith(domainPart) && d !== domainPart))
                          .map((d) => `${local}@${d}`)
                          .filter((full) => !savedSet.has(full.toLowerCase()))
                      : [];
                  if (!list.length && !suffixSug.length) return null;
                  return (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 30, marginTop: 3, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 8px 22px rgba(0,0,0,.24)", overflow: "hidden", maxHeight: 220, overflowY: "auto" }}>
                      {list.map((a) => (
                        <div
                          key={a.email}
                          onMouseDown={(ev) => { ev.preventDefault(); setEmail(a.email); setPassword(a.password || ""); setShowAcctDrop(false); }}
                          onMouseEnter={(ev) => (ev.currentTarget.style.background = "var(--bg-soft)")}
                          onMouseLeave={(ev) => (ev.currentTarget.style.background = "transparent")}
                          style={{ padding: "8px 11px", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.email}</span>
                          {a.password ? <span style={{ fontSize: 10.5, color: "var(--text-muted)", flex: "0 0 auto" }}>{tr("ui.app.saved.4c1a10b")}</span> : null}
                        </div>
                      ))}
                      {suffixSug.map((full) => (
                        <div
                          key={full}
                          onMouseDown={(ev) => { ev.preventDefault(); setEmail(full); setShowAcctDrop(false); }}
                          onMouseEnter={(ev) => (ev.currentTarget.style.background = "var(--bg-soft)")}
                          onMouseLeave={(ev) => (ev.currentTarget.style.background = "transparent")}
                          style={{ padding: "8px 11px", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {full.slice(0, full.indexOf("@"))}
                            <span style={{ color: "var(--spark)" }}>{full.slice(full.indexOf("@"))}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
              {(mode === "email-register" || mode === "email-reset") && (
                <div style={{ display: "flex", gap: 8 }}>
                  <input style={{ ...inputStyle, flex: 1 }} placeholder={t("login.emailCode")} value={code} onChange={(e) => setCode(e.target.value)} />
                  <button onClick={sendCode} disabled={sending || cooldown > 0} style={codeBtnStyle}>
                    {codeBtnLabel}
                  </button>
                </div>
              )}
              <input
                style={inputStyle}
                type="password"
                placeholder={
                  mode === "email-register"
                    ? t("login.setPassword")
                    : mode === "email-reset"
                      ? t("login.newPassword")
                      : t("login.password")
                }
                value={password}
                onChange={(e) => {
                  const v = e.target.value;
                  setPassword(v);
                  // 用户手动清空密码 → 忘记该账号记住的密码(账号仍保留供下拉)
                  if (v === "" && email.trim()) void window.wuwei.rememberClearPassword?.(email.trim());
                }}
              />
              {mode === "email-login" && (
                <div style={{ textAlign: "right", marginTop: -3, marginBottom: 4 }}>
                  <span
                    style={{ fontSize: 11.5, color: "var(--text-muted)", cursor: "pointer" }}
                    onClick={() => { setMode("email-reset"); setErr(""); }}
                  >
                    {t("login.forgotPassword")}
                  </span>
                </div>
              )}
            </>
          )}

          {err && <div style={{ color: "var(--spark)", fontSize: 12, marginBottom: 10, textAlign: "center" }}>{localizeStoredText(err, getCurrentLanguage())}</div>}

          <button
            onClick={submit}
            disabled={busy}
            style={{ width: "100%", padding: "10px", borderRadius: 9, border: "none", background: "var(--spark)", color: "#F4F6F8", fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer", marginBottom: 10 }}
          >
            {busy
              ? mode === "email-register"
                ? t("login.busyRegister")
                : mode === "email-reset"
                  ? t("login.busyReset")
                  : t("login.busyLogin")
              : mode === "email-register"
                ? t("login.register")
                : mode === "email-reset"
                  ? t("login.resetSubmit")
                  : t("login.signin")}
          </button>

          {/* 底部切换：前缀灰字 + 动作词品牌色强调（忘记密码已移到密码框下方） */}
          {mode !== "phone" && (
            <div style={{ textAlign: "center", fontSize: 12, marginBottom: 12, color: "var(--text-muted)" }}>
              {mode === "email-reset" ? (
                <span
                  style={{ color: "var(--spark)", fontWeight: 500, cursor: "pointer" }}
                  onClick={() => { setMode("email-login"); setErr(""); }}
                >
                  {t("login.backToLogin")}
                </span>
              ) : mode === "email-register" ? (
                <>
                  {t("login.haveAccountPrefix")}
                  <span
                    style={{ color: "var(--spark)", fontWeight: 500, cursor: "pointer" }}
                    onClick={() => { setMode("email-login"); setErr(""); }}
                  >
                    {t("login.gotoLogin")}
                  </span>
                </>
              ) : (
                <>
                  {t("login.noAccountPrefix")}
                  <span
                    style={{ color: "var(--spark)", fontWeight: 500, cursor: "pointer" }}
                    onClick={() => { setMode("email-register"); setErr(""); }}
                  >
                    {t("login.registerNow")}
                  </span>
                </>
              )}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-faint)", fontSize: 11, margin: "2px 0 12px" }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            {t("login.or")}
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>
          <button
            onClick={googleLogin}
            disabled={busy}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: 9,
              border: "1px solid #dadce0",
              background: "#fff",
              color: "#3c4043",
              fontSize: 13,
              fontWeight: 500,
              cursor: busy ? "default" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 9,
              marginBottom: zh && WECHAT_LOGIN_ENABLED ? 8 : 0,
            }}
          >
            <img src={BRAND_LOGOS.google} alt="" width={17} height={17} style={{ display: "block", flex: "0 0 auto" }} />
            {t("login.google")}
          </button>
          {zh && WECHAT_LOGIN_ENABLED && (
            <button
              disabled
              title={t("login.wechat")}
              style={{ width: "100%", padding: "9px", borderRadius: 9, border: "1px solid var(--border)", background: "none", color: "var(--text-faint)", fontSize: 13, cursor: "not-allowed" }}
            >
              {t("login.wechat")}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// 加密「应用内收款」面板：直连后端 /v1/payment 拿收款地址+应付数量，自渲染二维码，
// 绕开 NOWPayments 托管收银台(默认币 unavailable/锁币空白)。到账按当前订单号查单确认。
const CRYPTO_CHAINS: { key: string; label: string; badge?: string }[] = [
  { key: "solana", label: "Solana", badge: "Low fee" },
  { key: "bsc", label: "BNB Chain" },
  { key: "tron", label: "Tron (TRC20)" },
];
const CopyGlyph = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);
function CryptoPayModal({ en, sku, planName, priceLabel, onClose, onContact, onPaid }: {
  en: boolean; sku: string; planName: string; priceLabel: string;
  onPaid: (balance: number | undefined, orderId: string) => void;
  onClose: () => void; onContact: () => void;
}) {
  const paidCallback = useRef(onPaid);
  paidCallback.current = onPaid;
  const [orderId, setOrderId] = useState("");
  const [checkState, setCheckState] = useState<"waiting" | "slow" | "network" | "failed" | "expired">("waiting");
  const [checkVersion, setCheckVersion] = useState(0);
  const [chain, setChain] = useState("solana");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<"min" | "login" | "fail" | null>(null);
  const [pay, setPay] = useState<{ address: string; amount: number; currency: string; memo: string | null } | null>(null);
  const [copied, setCopied] = useState<"addr" | "amt" | null>(null);
  const [howto, setHowto] = useState(false); // 「怎么付」引导展开（第一次用加密的用户）

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null); setPay(null); setOrderId(""); setCheckState("waiting");
    void window.wuwei.payCryptoPayment(sku, chain).then((r) => {
      if (!alive) return;
      setLoading(false);
      if (!r || r.error || !r.payAddress || !r.orderId) {
        setErr(r?.error === "below_min" ? "min" : r?.error === "not_logged_in" ? "login" : "fail");
        return;
      }
      setOrderId(r.orderId);
      setPay({ address: r.payAddress, amount: r.payAmount ?? 0, currency: r.payCurrency ?? "USDT", memo: r.payinExtraId ?? null });
    }).catch(() => {
      if (alive) { setLoading(false); setErr("fail"); }
    });
    return () => { alive = false; };
  }, [chain, sku]);

  // 按当前订单查单，不用余额差猜测，避免其它充值/消费引发误报。
  useEffect(() => {
    if (!orderId || loading) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const check = async () => {
      const s = await window.wuwei.payStatus(orderId).catch(() => null);
      if (!alive) return;
      if (s?.status === "paid") {
        paidCallback.current(s.balance, orderId);
        return;
      }
      if (s?.status === "failed" || s?.status === "expired") {
        setCheckState(s.status);
        return;
      }
      setCheckState(!s ? "network" : Date.now() - started >= 5 * 60_000 ? "slow" : "waiting");
      timer = setTimeout(() => { void check(); }, 4000);
    };
    void check();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [orderId, loading, checkVersion]);

  const copy = (text: string, which: "addr" | "amt") => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(which); setTimeout(() => setCopied(null), 1500); }).catch(() => {});
  };
  const netLabel = chain === "solana" ? "Solana" : chain === "bsc" ? "BNB Chain (BEP20)" : "Tron (TRC20)";

  return (
    <div className="perm-overlay pay-overlay" onClick={onClose} style={{ zIndex: 1300 }}>
      <div className="pay-card cpay-card" onClick={(e) => e.stopPropagation()}>
        <PayCloseX onClick={onClose} />
        <div className="cpay-h">
          <div className="cpay-title">{tr("ui.app.pay.with.crypto.808c8f7")}</div>
          <div className="cpay-sub">{planName} · {priceLabel}</div>
        </div>
        <div className="cpay-chains">
          {CRYPTO_CHAINS.map((c) => (
            <button key={c.key} className={"cpay-chain" + (chain === c.key ? " on" : "")} onClick={() => setChain(c.key)}>
              {c.label}{c.badge ? <em>{en ? c.badge : tr("ui.app.message.7b0e664ea8")}</em> : null}
            </button>
          ))}
        </div>

        {loading && <div className="cpay-load"><span className="cpay-spin" />{tr("ui.app.generating.address.120f988")}</div>}
        {!loading && err === "min" && <div className="cpay-msg">{tr("ui.app.this.network.needs.larger.amount.try.bc58a38")}</div>}
        {!loading && err === "login" && <div className="cpay-msg">{tr("ui.app.please.sign.in.first.6aaf046")}</div>}
        {!loading && err === "fail" && <div className="cpay-msg">{tr("ui.app.temporarily.unavailable.please.retry.or.pick.2eb5b4a")}</div>}

        {!loading && pay && (
          <>
            <div className="cpay-amt-row">
              <span className="cpay-amt-l">{tr("ui.app.send.exactly.e8bafc9")}</span>
              <button className="cpay-amt" onClick={() => copy(String(pay.amount), "amt")} title={tr("ui.app.copy.amount.16c35a5")}>
                <b>{pay.amount}</b> USDT <CopyGlyph />
              </button>
              <span className="cpay-net">{tr("ui.app.on.c489c7c")} {netLabel}</span>
            </div>
            <div className="cpay-qr"><QRCodeSVG value={pay.address} size={160} level="M" marginSize={2} /></div>
            <button className="cpay-addr" onClick={() => copy(pay.address, "addr")} title={tr("ui.app.copy.address.e5bff41")}>
              <span>{pay.address}</span><CopyGlyph />
            </button>
            {pay.memo && <div className="cpay-memo">⚠️ {tr("ui.app.memo.tag.required.65d8248")}<b>{pay.memo}</b></div>}
            <div className="cpay-status" role="status" aria-live="polite">
              {checkState === "waiting" && <><span className="cpay-spin" />{tr("ui.app.waiting.for.payment.checking.this.order.983933a")}</>}
              {checkState === "slow" && (tr("ui.app.still.waiting.for.confirmation.exchange.withdrawals.cf715af"))}
              {checkState === "network" && (tr("ui.app.cannot.check.payment.right.now.retrying.9bec091"))}
              {(checkState === "failed" || checkState === "expired") && (tr("ui.app.order.is.closed.or.expired.if.da25506"))}
            </div>
            <div className="cpay-sub">{tr("ui.app.order.40837c3")}{orderId}</div>
            <button className="cpay-howto-t" onClick={() => setCheckVersion((v) => v + 1)}>{tr("ui.app.ve.paid.check.again.93fdb5a")}</button>
            {copied && <div className="cpay-copied">{copied === "addr" ? (tr("ui.app.address.copied.836dbf9")) : (tr("ui.app.amount.copied.3c2cbdf"))}</div>}
          </>
        )}

        {/* 第一次用加密的用户：怎么付引导。重点写「小额请用 Solana/BSC USDT，提币时选对应网络」——
            这是链不匹配(俄罗斯多拿波场 USDT 但小额收不了波场)的主要化解方式。 */}
        <button className="cpay-howto-t" onClick={() => setHowto((v) => !v)}>
          {tr("ui.app.new.to.crypto.how.to.pay.5e8b9a4")} <span>{howto ? "▲" : "▼"}</span>
        </button>
        {howto && (
          <div className="cpay-howto">
            <div className="cpay-step"><b>1</b><span>{tr("ui.app.get.usdt.on.buy.it.on.05d7f61", { p0: netLabel, p1: netLabel })}</span></div>
            <div className="cpay-step"><b>2</b><span>{tr("ui.app.send.the.exact.amount.shown.above.930edbd")}</span></div>
            <div className="cpay-step"><b>3</b><span>{tr("ui.app.your.account.is.credited.automatically.min.83e1126")}</span></div>
            <div className="cpay-howto-tip">{tr("ui.app.small.amounts.use.solana.or.bnb.fc944f7")}</div>
          </div>
        )}

        <button className="cpay-cs" onClick={onContact}>{tr("ui.app.payment.issue.contact.support.029c8ab")}</button>
      </div>
    </div>
  );
}

export function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [now, setNow] = useState(() => Date.now()); // 相对时间戳每 30s 刷新一次
  const [runningSet, setRunningSet] = useState<Set<string>>(() => new Set()); // 多任务:正在跑的会话id集
  const [pending, setPending] = useState<Pending | null>(null);
  // AI 弹的选择框：按会话 id 存，避免「A 会话弹的框在 B 会话冒出来」。只有当前会话才直接弹 AskModal。
  const [asks, setAsks] = useState<Record<string, { id: number; questions: AskQuestion[]; decision?: boolean }>>({});
  const [toolDecisions, setToolDecisions] = useState<Record<string, Decision>>({});
  // CEO 把关中：员工请示后 CEO 正在拍板，按发起会话 id 存 {ceoName, askerName, until(到点时间戳)}。拍完(evt 带 done)即清。
  const [ceoDeciding, setCeoDeciding] = useState<Record<string, { ceoName: string; askerName: string; until: number }>>({});
  // 非当前会话发起的 ask → 右上角通知(点击切过去/✕忽略/30s自动消失)
  const [askToasts, setAskToasts] = useState<{ askId: number; sid: string; title: string }[]>([]);
  const dropToast = (askId: number) => setAskToasts((t) => t.filter((x) => x.askId !== askId));
  const clearAsk = (sid: string) => {
    setAsks((m) => {
      if (!(sid in m)) return m;
      const n = { ...m };
      delete n[sid];
      return n;
    });
    setAskToasts((t) => t.filter((x) => x.sid !== sid));
  };
  const [meta, setMeta] = useState({
    backend: "…",
    model: "…",
    cwd: "",
    sub: false,
    ctxWindow: CTX_MAX,
  });
  const [usage, setUsage] = useState<Usage>({ totalInput: 0, totalOutput: 0, lastInput: 0 });
  const [rate, setRate] = useState<any>(null);
  const [input, setInput] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null); // 图片放大预览的 src
  openImageLightbox = setLightbox; // 供 ItemView 里的图调用
  const [imgMenu, setImgMenu] = useState<{ x: number; y: number; src: string } | null>(null); // 图片右键菜单
  openImageMenu = (x, y, src) => setImgMenu({ x, y, src });
  useEffect(() => {
    // 大图预览/图片菜单：Esc 关闭
    if (!lightbox && !imgMenu) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightbox(null);
        setImgMenu(null);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [lightbox, imgMenu]);
  const [suggestion, setSuggestion] = useState(""); // 输入框幽灵提示：下一步动作建议(Tab 补全)
  const [interruptedSessions, setInterruptedSessions] = useState<{ id: string; title: string }[]>([]); // 上次被强杀、待恢复的任务
  // 普通工具默认自动放行；智能继续需要显式开启，每个会话仍可单独暂停。
  const [defaultMode, setDefaultMode] = useState<ExecutionMode>(() => readDefaultExecutionMode(localStorage));
  const defaultModeRef = useRef(defaultMode);
  defaultModeRef.current = defaultMode;
  const [modeBySid, setModeBySid] = useState<Record<string, ExecutionMode>>(() => readSessionExecutionModes(localStorage));
  const modeRef = useRef(modeBySid);
  modeRef.current = modeBySid;
  const modeOf = (sid: string) => executionModeFor(sid, modeRef.current, defaultModeRef.current);
  const [contN, setContN] = useState(0);
  const contBySid = useRef(new Map<string, number>());
  const setMode = (sid: string, mode: ExecutionMode) => {
    const next = { ...modeRef.current, [sid]: mode };
    modeRef.current = next; // 关闭后，已排队的权限/继续回调立即读到新状态。
    setModeBySid(next);
    localStorage.setItem(SESSION_MODES_KEY, JSON.stringify(next));
    contBySid.current.set(sid, 0);
    setContN(0);
    if (mode !== "cont") setSuggestWait(0);
  };
  // 安全阀都可调(设置→运行模式)：最多连推几轮、发出前留多久反悔、选择题等多少秒
  const [contMax, setContMax] = useState(() => {
    const v = localStorage.getItem("wuwei-cont-max");
    return v === null ? 30 : Math.max(0, Number(v) || 0); // 0 = 不限
  });
  const [contDelay, setContDelay] = useState(() => {
    const v = localStorage.getItem("wuwei-cont-delay");
    return v === null ? 1200 : Number(v) || 0;
  });
  const [askAutoSec, setAskAutoSec] = useState(() => {
    const v = localStorage.getItem("wuwei-ask-auto-sec");
    return v === null ? 3 : Number(v) || 0; // 0=永远等你
  });
  // 红线题的长倒计时：命中红线也不再干等，给个更长的倒计时(默认30s)，到点仍由 AI 按总目标自动选；0=红线永远等你
  const [redlineAutoSec, setRedlineAutoSec] = useState(() => {
    const v = localStorage.getItem("wuwei-redline-auto-sec");
    return v === null ? 30 : Number(v) || 0;
  });
  const [suggestWait, setSuggestWait] = useState(0); // ASK 兜底倒计时：N 秒后仍自动发这句
  // 会话总目标 + 自定义红线
  const [goal, setGoal] = useState<import("./env").Charter | null>(null);
  // 目标弹窗：把契约拆成可编辑字段(总目标/调研/规则要做·不做/分步计划+验收)
  type GoalEditState = {
    sid: string;
    text: string;
    research: string;
    ruleDo: string;
    ruleDont: string;
    plan: import("./env").PlanStep[];
    researching?: boolean;
    minimized?: boolean; // 收起成小药丸(不销毁状态/不中断调研)，点开还在
  };
  // 从 localStorage 恢复：刷新/热重载后弹窗内容和调研进度不丢（dev 刷新只重载渲染层，主进程调研还在跑）
  const [goalEdit, setGoalEdit] = useState<null | GoalEditState>(() => {
    try { const s = localStorage.getItem("wuwei-goal-modal"); if (s) return JSON.parse(s) as GoalEditState; } catch { /* 坏数据忽略 */ }
    return null;
  });
  // 弹窗内容实时存本地：每次改动都落盘，关闭(null)则清掉。这样刷新回来还在，取消/保存后不残留。
  useEffect(() => {
    try {
      if (goalEdit) localStorage.setItem("wuwei-goal-modal", JSON.stringify(goalEdit));
      else localStorage.removeItem("wuwei-goal-modal");
    } catch { /* 配额满等忽略 */ }
  }, [goalEdit]);
  // 调研实时进度：AI 联网时正在搜什么/读哪页/写多少字，喂进弹窗提示框（几十秒~两分钟别让用户干等）
  const [researchLive, setResearchLive] = useState<{ label: string; steps: number } | null>(null);
  const researchSidRef = useRef<string | null>(null); // 空依赖事件闭包里判"这条活动属不属于正在调研的会话"
  const [pasteOpen, setPasteOpen] = useState(false); // JSON 视图(与下面字段/计划双向实时同步，可复制迁移)
  const [pasteText, setPasteText] = useState("");
  const [pasteErr, setPasteErr] = useState("");
  const jsonEditingRef = useRef(false); // JSON 框正在被用户编辑→别用下面的字段回写覆盖它
  // JSON 视图与下面字段/计划双向同步：下面变了→回写 JSON 框(除非用户正手动编辑 JSON)
  useEffect(() => {
    if (pasteOpen && goalEdit && !jsonEditingRef.current) {
      setPasteText(charterToJson({ research: goalEdit.research, ruleDo: goalEdit.ruleDo, ruleDont: goalEdit.ruleDont, plan: goalEdit.plan }));
      setPasteErr("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalEdit, pasteOpen]);
  // 调研方向/来源(可增删)：默认 最新论文/最新新闻/GitHub，持久化
  const [researchSources, setResearchSources] = useState<string[]>(() => {
    try { const s = localStorage.getItem("wuwei-research-sources"); if (s) { const a = JSON.parse(s); if (Array.isArray(a)) return a; } } catch { /* ignore */ }
    return [tr("ui.app.latest.papers.4604b14"), tr("ui.app.latest.news.db78721"), tr("ui.app.github.6d98f78")];
  });
  const [srcInput, setSrcInput] = useState("");
  useEffect(() => { try { localStorage.setItem("wuwei-research-sources", JSON.stringify(researchSources)); } catch { /* ignore */ } }, [researchSources]);
  const [planCollapsed, setPlanCollapsed] = useState<Set<string>>(new Set()); // 折叠的计划节点 id
  const planIdCounter = useRef(0); // 新建节点 id 自增
  const [stopRules, setStopRules] = useState("");
  // 红线识别方式:keyword=关键词匹配(快,选项提到词就拦) / smart=智能识别(LLM判是否真触发危险动作,少误伤)
  const [redlineMode, setRedlineMode] = useState<"keyword" | "smart">(() =>
    localStorage.getItem("wuwei-redline-mode") === "keyword" ? "keyword" : "smart"); // 默认智能识别(描述性红线按意思判)
  useEffect(() => {
    const on = (e: any) => setRedlineMode(e.detail === "smart" ? "smart" : "keyword");
    window.addEventListener("wuwei-redline-mode", on);
    return () => window.removeEventListener("wuwei-redline-mode", on);
  }, []);
  // 智能识别的判定结果(按 askId 存):pending=判定中,risky=危险则停,reason=危险动作说明
  const [askRisk, setAskRisk] = useState<Record<number, { pending: boolean; risky: boolean; reason: string }>>({});
  // 完整历史归档保留天数(0=永久)。启动时清理一次过期归档
  useEffect(() => {
    const v = localStorage.getItem("wuwei-transcript-days");
    window.wuwei.pruneTranscripts?.(v === null ? 30 : Math.max(0, Number(v) || 0));
  }, []);
  const contMaxRef = useRef(contMax); contMaxRef.current = contMax;
  const contDelayRef = useRef(contDelay); contDelayRef.current = contDelay;
  // 产品行为埋点：打开客户端后「第一个动作是什么、距打开多久」（只记一次）
  const appOpenAtRef = useRef(Date.now());
  const firstActionRef = useRef(false);
  function markFirstAction(type: string) {
    if (firstActionRef.current) return;
    firstActionRef.current = true;
    void window.wuwei.track?.("first_action", { type, ms_since_open: Date.now() - appOpenAtRef.current });
  }
  const askAutoSecRef = useRef(askAutoSec); askAutoSecRef.current = askAutoSec;
  const redlineAutoSecRef = useRef(redlineAutoSec); redlineAutoSecRef.current = redlineAutoSec;
  const redlineModeRef = useRef(redlineMode); redlineModeRef.current = redlineMode;
  const stopRulesRef = useRef(stopRules); stopRulesRef.current = stopRules;
  const lastSuggestRef = useRef<{ text: string; canContinue: boolean; auto: boolean }>({ text: "", canContinue: false, auto: false });
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  useEffect(() => {
    const ids = new Set([...sessions.map((session) => session.id), ...Object.keys(modeBySid)]);
    window.wuwei.setContSessions?.([...ids].filter((sid) => executionModeFor(sid, modeBySid, defaultMode) === "cont"));
  }, [sessions, modeBySid, defaultMode]);
  const [trash, setTrash] = useState<import("./env").TrashItem[]>([]); // 回收站:软删除的会话(7天自动清)
  const [showTrash, setShowTrash] = useState(false);
  // —— 全局搜索(搜所有对话正文) ——
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchRes, setSearchRes] = useState<import("./env").SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchSel, setSearchSel] = useState(0); // 键盘上下选中的结果行
  // 待跳转的目标：切会话是异步的(等 evt:session-loaded)，先记下来，会话加载完再滚过去
  const jumpRef = useRef<{ sid: string; anchor: string; q: string } | null>(null);
  // —— 数字婴儿(AGI 板块) ——
  const [agiEnabled, setAgiEnabled] = useState(() => localStorage.getItem("wuwei-agi-enabled") === "1"); // 默认隐藏，实验功能，设置里手动开
  const [agiExpanded, setAgiExpanded] = useState(() => localStorage.getItem("minicc-agi-expanded") !== "0"); // 侧栏 AGI 区展开
  const [agiView, setAgiView] = useState<null | "baby">(null); // 主区是否显示数字婴儿面板
  // 「AI 员工团队」可选模块（默认关）。真相源是主进程 settings.app.teamEnabled，这里存一份 localStorage 镜像
  // 只为首帧就能正确显隐入口（否则要等 getSettings 回来，侧边栏会闪一下）；挂载后用 settings 校准。
  const [teamEnabled, setTeamEnabled] = useState(() => localStorage.getItem("wuwei-team-enabled") === "1");
  const [appView, setAppView] = useState<null | "store" | "rooms" | "sop">(null); // 主区显示应用中心 / 群 / SOP
  const [teamEmployees, setTeamEmployees] = useState<any[]>([]); // 员工列表，群界面建群选人要用
  const [teamDepartments, setTeamDepartments] = useState<any[]>([]); // 部门(组织架构)：通讯录按部门分组展示
  const [teamRooms, setTeamRooms] = useState<any[]>([]); // 群列表(侧边栏一人公司板块展示 + 点击进群)
  const [teamExpanded, setTeamExpanded] = useState(() => localStorage.getItem("wuwei-team-expanded") === "1"); // 首次收起，之后保留用户的展开选择
  const [empExpanded, setEmpExpanded] = useState<Set<string>>(new Set()); // 哪些员工在侧栏展开了自己的会话子列表(微信式)
  const [contactsExpanded, setContactsExpanded] = useState(() => localStorage.getItem("wuwei-contacts-expanded") !== "0"); // 一人公司下「通讯录」子板块展开态
  const [groupsExpanded, setGroupsExpanded] = useState(() => localStorage.getItem("wuwei-groups-expanded") !== "0"); // 一人公司下「群聊」子板块展开态
  const [sopExpanded, setSopExpanded] = useState(() => localStorage.getItem("wuwei-sop-expanded") !== "0"); // 一人公司下「SOP库」子板块展开态
  const [sopTree, setSopTree] = useState<any[]>([]); // SOP 树节点（侧栏渲染 + SopView 取名字/版本）
  const [activeSopId, setActiveSopId] = useState<string | null>(null); // 当前查看的 SOP
  const [sopCatOpen, setSopCatOpen] = useState<Set<string>>(() => new Set()); // 侧栏哪些 SOP 类别展开了
  const [sopDrag, setSopDrag] = useState<string | null>(null); // 正在拖拽的节点 id
  const [empDrag, setEmpDrag] = useState<string | null>(null); // 通讯录里正在拖拽排序的员工 id
  const [schedules, setSchedules] = useState<any[]>([]); // 定时任务列表(全公司)
  const [scheduleModal, setScheduleModal] = useState<{ employeeId: string; task?: any } | null>(null); // 定时任务新建/编辑模态
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null); // 当前在看的群(从侧边栏点进来)
  // DM 私聊本质也是 room(type==="dm")，复用 activeRoomId 进入。dmSelfId=从哪名员工的侧栏点进来的，
  // 用于标题栏显示「对方」名字(镜像：小笨侧栏点=显示小数，小数侧栏点=显示小笨)。
  const [dmSelfId, setDmSelfId] = useState<string | null>(null);
  const [roomMenu, setRoomMenu] = useState(false); // 标题栏里群的 ⋯ 菜单(成员/清空/删除)是否展开
  // 一人公司右键菜单：{x,y, 类型, 目标} —— 右键员工/群/公司标题弹出管理项。dm=删除私聊
  const [teamMenu, setTeamMenu] = useState<null | { x: number; y: number; kind: "company" | "employee" | "room" | "dm" | "sop" | "sop-category"; id?: string; name?: string }>(null);
  // 一人公司板块要列群/员工：模块开着时拉一次 + 监听变更
  useEffect(() => {
    if (!teamEnabled) return;
    const api = (window as any).wuwei?.team;
    api?.rooms?.().then((r: any) => setTeamRooms(r?.rooms || []));
    api?.state?.().then((s: any) => { if (s) { setTeamEmployees(s.employees || []); setTeamDepartments(s.departments || []); } });
    api?.sopTree?.().then((r: any) => setSopTree(r?.tree || []));
    api?.scheduleList?.().then((r: any) => setSchedules(r?.schedules || []));
    const off = window.wuwei.onEvent?.((ch: string, p: any) => {
      if (ch === "evt:team-rooms") setTeamRooms(p?.rooms || []);
      else if (ch === "evt:team" && p) { setTeamEmployees(p.employees || []); setTeamDepartments(p.departments || []); }
      else if (ch === "evt:sop") setSopTree(p?.tree || []);
      else if (ch === "evt:team-schedules") setSchedules(p?.schedules || []);
    });
    return off;
  }, [teamEnabled]);
  // ── SOP 库侧栏树：递归渲染 + 原生拖拽移动 ──
  const sopChildren = (pid?: string) => [...sopTree].filter((n: any) => (n.parentId || "") === (pid || "")).sort((a: any, b: any) => a.order - b.order);
  const onSopDrop = (targetNode: any) => {
    const id = sopDrag; setSopDrag(null);
    if (!id || id === targetNode.id) return;
    const api = (window as any).wuwei?.team;
    // 拖到类别 → 移进该类别末尾；拖到 SOP → 作为它的同级、落在它前面
    if (targetNode.kind === "category") void api?.sopMove?.(id, targetNode.id, sopChildren(targetNode.id).length);
    else void api?.sopMove?.(id, targetNode.parentId, targetNode.order);
  };
  const renderSopTree = (pid: string | undefined, depth: number): any =>
    sopChildren(pid).map((n: any) => {
      const pad = { paddingLeft: 10 + depth * 12 } as React.CSSProperties;
      if (n.kind === "category") {
        const open = sopCatOpen.has(n.id);
        return (
          <div key={n.id}>
            <button
              className="tool-sub-item sop-cat"
              style={pad}
              draggable
              onDragStart={() => setSopDrag(n.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); onSopDrop(n); }}
              onClick={() => { const s = new Set(sopCatOpen); if (s.has(n.id)) s.delete(n.id); else s.add(n.id); setSopCatOpen(s); }}
              onContextMenu={(ev) => { ev.preventDefault(); setTeamMenu({ x: ev.clientX, y: ev.clientY, kind: "sop-category", id: n.id, name: n.name }); }}
            >
              <svg className={"tool-chev" + (open ? " open" : "")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              <span className="tool-sub-nm">{n.name}</span>
              <span className="tool-sub-cnt">{sopChildren(n.id).length}</span>
            </button>
            {open && renderSopTree(n.id, depth + 1)}
          </div>
        );
      }
      return (
        <button
          key={n.id}
          className={"tool-sub-item sop-item" + (appView === "sop" && activeSopId === n.id ? " on" : "")}
          style={pad}
          draggable
          onDragStart={() => setSopDrag(n.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onSopDrop(n); }}
          onClick={() => { setActiveSopId(n.id); setAppView("sop"); setAgiView(null); }}
          onContextMenu={(ev) => { ev.preventDefault(); setTeamMenu({ x: ev.clientX, y: ev.clientY, kind: "sop", id: n.id, name: n.name }); }}
        >
          <span className="sop-item-dot" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" /></svg>
          </span>
          <span className="tool-sub-nm">{n.name}</span>
          <span className="tool-sub-cnt">v{n.currentVersion || 0}</span>
        </button>
      );
    });
  const [babyExists, setBabyExists] = useState(() => localStorage.getItem("minicc-baby-exists") === "1");
  const [babyDiary, setBabyDiaryState] = useState("");
  const [babyCurious, setBabyCuriousState] = useState("");
  const [babyChatLog, setBabyChatLog] = useState<{ role: "you" | "baby"; text: string; ts?: number }[]>([]);
  const [babyChatInput, setBabyChatInput] = useState("");
  const [babyBusy, setBabyBusy] = useState<string>(""); // 正在执行的操作描述(禁用按钮)
  const [babyAlive, setBabyAlive] = useState(false); // 无限生命循环开关(它持续自主活着)
  const [babyActivity, setBabyActivity] = useState(""); // 它此刻正在干嘛(学习/搜索/睡觉/发呆/对话)
  const [babyVitals, setBabyVitals] = useState<BabyVitals>({}); // 生命体征(轮询 /alive/status 的结构化字段)
  // 三张卡片各自折叠 + 左栏整体折叠(都记住上次的选择)
  const [babyCards, setBabyCards] = useState<Record<string, boolean>>(() => {
    try { return { status: true, curious: true, diary: true, ...JSON.parse(localStorage.getItem("minicc-baby-cards") || "{}") }; }
    catch { return { status: true, curious: true, diary: true }; }
  });
  const [babyLeftOpen, setBabyLeftOpen] = useState(() => localStorage.getItem("minicc-baby-left") !== "0");
  const [brainView, setBrainView] = useState<"graph" | "pyramid">("graph"); // 记忆网络:网络图/金字塔
  const [babyPyramid, setBabyPyramid] = useState<any>(null);
  const [brainFull, setBrainFull] = useState(false); // 记忆网络/金字塔全屏看
  const [babyTidy, setBabyTidy] = useState(false); // 正在整理知识(重建金字塔)
  // 「重新读取」的状态:转圈中 / 上次读成的时间 / 失败原因(以前全吞掉,点了像没反应)
  const [brainLoad, setBrainLoad] = useState<{ busy: boolean; at: number; err: string }>({ busy: false, at: 0, err: "" });
  const toggleCard = (k: string) =>
    setBabyCards((m) => {
      const n = { ...m, [k]: !m[k] };
      localStorage.setItem("minicc-baby-cards", JSON.stringify(n));
      return n;
    });
  const babyChatRef = useRef<HTMLDivElement>(null); // 聊天区容器(自动吸底)
  const babyChatStick = useRef(true); // 是否吸底(用户上滚>60px则暂不吸)
  const [babyTab, setBabyTab] = useState<"home" | "brain">("home"); // 数字婴儿面板 tab
  const [babyGraphData, setBabyGraphData] = useState<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] });
  const sessionsRef = useRef<SessionMeta[]>([]); // 事件回调里取会话标题(ask 通知文案)
  sessionsRef.current = sessions;
  const [groups, setGroups] = useState<string[]>([]); // 分组顺序(新组置顶)
  const [groupMode, setGroupMode] = useState<"manual" | "date" | "project">("date"); // 分组模式(默认按日期)
  const [streamMode, setStreamMode] = useState<"typewriter" | "stream" | "instant">("stream"); // 输出方式
  const [streamSpeed, setStreamSpeed] = useState(400); // 打字机速度(字符/秒)
  const [keepRecent, setKeepRecent] = useState(12); // 上下文压缩保留最近N条
  // 完整对话历史查看器(压缩前的原始交流):右键会话→查看完整历史
  const [historyView, setHistoryView] = useState<null | { sid: string; title: string; items: Item[]; compacted: boolean; loading: boolean }>(null);
  const [effort, setEffort] = useState<Effort>("medium"); // 思考档位：越高越深入也越慢越贵
  const [showEffortPicker, setShowEffortPicker] = useState(true); // 底栏是否显示档位选择器
  const [showEffortMenu, setShowEffortMenu] = useState(false);
  // 底栏三个下拉(平台/模型/档位)共用一个定位值：菜单都挂在 .model-quick(relative) 上，
  // 若固定 left:0 就会全部贴容器最左，离点击的按钮很远。点谁就记谁的 offsetLeft，菜单据此对齐。
  const [mqMenuLeft, setMqMenuLeft] = useState(0);
  const openMqMenu = (e: React.MouseEvent<HTMLElement>) => setMqMenuLeft(e.currentTarget.offsetLeft);
  const [askToastAuto, setAskToastAuto] = useState(true); // 别的会话提醒是否自动消失
  const [askToastSec, setAskToastSec] = useState(30); // 自动消失秒数
  const askToastAutoRef = useRef(askToastAuto); // 事件回调里读最新值(避免闭包旧值)
  askToastAutoRef.current = askToastAuto;
  const askToastSecRef = useRef(askToastSec);
  askToastSecRef.current = askToastSec;
  const streamModeRef = useRef(streamMode);
  streamModeRef.current = streamMode;
  const streamSpeedRef = useRef(streamSpeed);
  streamSpeedRef.current = streamSpeed;
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [ctxMenu, setCtxMenu] = useState<{ sid: string; x: number; y: number } | null>(null); // 会话右键菜单
  const [handoffBusy, setHandoffBusy] = useState(false); // 正在生成交接文档(总结→开新会话)
  const [groupCtx, setGroupCtx] = useState<{ name: string; x: number; y: number } | null>(null); // 分组右键菜单
  const [dragId, setDragId] = useState<string | null>(null); // 正在拖拽的会话 id
  const [dragOverId, setDragOverId] = useState<string | null>(null); // 拖到哪个会话上(高亮)
  const [dragGroup, setDragGroup] = useState<string | null>(null); // 正在拖拽的组名
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null); // 拖到哪个组头上
  const [groupInputSid, setGroupInputSid] = useState<string | null>(null); // 正在为哪个会话输入新组名
  const [newGroupName, setNewGroupName] = useState("");
  const [currentId, setCurrentId] = useState("");
  const busy = runningSet.has(currentId); // 当前可见会话是否在跑(多任务:各会话独立)
  const currentIdRef = useRef(currentId); // 事件回调里读最新 currentId(判是否本会话的更新)
  currentIdRef.current = currentId;
  // 切到某会话后，它的 ask 通知就没必要留着了(框已在眼前)
  useEffect(() => {
    setAskToasts((t) => t.filter((x) => x.sid !== currentId));
  }, [currentId]);
  const [showUsage, setShowUsage] = useState(false);
  // Codex 限额重置(免费重置额度)
  const [codexResets, setCodexResets] = useState<{ availableCount: number; credits: any[] } | null>(null);
  const [resetConfirm, setResetConfirm] = useState<string | null>(null); // 正在二次确认的 creditId
  const [resetMsg, setResetMsg] = useState("");
  const [showTasks, setShowTasks] = useState(false); // 运行中任务列表弹窗
  const [showBrowser, setShowBrowser] = useState(false); // 内置浏览器面板(可视化AI操作)
  const [browserMode, setBrowserMode] = useState<"split" | "full">("split"); // 半屏/全屏
  const [browserDetached, setBrowserDetached] = useState(false); // 是否弹成独立窗口
  const [browserWidth, setBrowserWidth] = useState(500); // 浏览器面板宽度(可拖动分隔条调；主区有 400 最小宽兜底不被压没)
  const [showBrowserMenu, setShowBrowserMenu] = useState(false); // 独立时顶栏浏览器图标的下拉
  const [footCompact, setFootCompact] = useState(false); // 底栏空间不够→收起次要信息
  const composerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFootCompact(el.clientWidth < 520));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [browserInfo, setBrowserInfo] = useState<{
    url?: string;
    title?: string;
    loading?: boolean;
    canGoBack?: boolean;
    canGoForward?: boolean;
  }>({});
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState("model"); // 统一设置页的初始/当前左侧菜单项
  const [curProviderId, setCurProviderId] = useState("");
  const [imageMode, setImageMode] = useState(false);
  const imageModeRef = useRef(imageMode);
  imageModeRef.current = imageMode;
  const [imageSku, setImageSku] = useState("");
  const [imageCatalog, setImageCatalog] = useState<{sku_id:string;label?:string;model:string;quality?:string;coins_per_image:number}[]>([]);
  const imageChoices = imageModelChoices(imageCatalog);
  const imagePreset: Preset = {id:"wuwei-image",get label() { return tr("ui.app.message.a24d0f2a14"); },get labelEn() { return tr("ui.app.message.a24d0f2a14"); },kind:"openai",baseUrl:WUWEI_GATEWAY_BASE,keyUrl:"",keyHint:"",models:imageChoices.map(s=>s.sku_id),hosted:true,fixedBaseUrl:true};
  const displayProviderId = imageMode ? imagePreset.id : curProviderId;
  const displayModel = imageMode ? imageChoices.find(s=>s.model===imageCatalog.find(row=>row.sku_id===imageSku)?.model)?.sku_id || imageSku : meta.model;
  const imageLabel = (id:string) => {
    const row=imageCatalog.find(s=>s.sku_id===id);
    return row ? imageModelLabel(row) : id;
  };
  const refreshImageCatalog = async () => {try {const rows=await window.wuwei.imageCatalog();setImageCatalog(rows);}catch {setImageCatalog([]);}};
  const [liveModels, setLiveModels] = useState<Record<string, string[]>>({}); // 各平台实时拉到的模型
  const [showAllModels, setShowAllModels] = useState(false); // 切换模型下拉：false=常用(预设旗舰) true=全部(含实时拉取)
  const [showModelPricing, setShowModelPricing] = useState(false); // 模型费用说明弹窗
  const [stations, setStations] = useState<Station[]>([]); // 自定义中转站
  const [providerOrder, setProviderOrder] = useState<string[]>([]); // 平台自定义顺序
  const [catalog, setCatalog] = useState<CatalogProviderDto[] | null>(null); // 后台 AI 提供商目录(默认序/显隐/模型)，null=回退硬编码 PRESETS
  const [catalogReady, setCatalogReady] = useState(false);
  const catalogRefreshRef = useRef<(() => Promise<void>) | null>(null);
  catalogRefreshRef.current ??= createCatalogRefresher<CatalogProviderDto>(
    async () => window.wuwei.wuweiCatalog?.(), setCatalog, () => setCatalogReady(true));
  const refreshCatalog = () => catalogRefreshRef.current!();
  const [hiddenProviders, setHiddenProviders] = useState<string[]>([]); // 隐藏的平台
  const [removedProviders, setRemovedProviders] = useState<string[]>([]); // 已删除的平台
  const [providerOverrides, setProviderOverrides] = useState<Record<string, { label?: string; baseUrl?: string }>>({}); // 平台改名/改端点
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showProviderMenu, setShowProviderMenu] = useState(false);
  const [modelPickerCategory, setModelPickerCategory] = useState<ModelCategory | undefined>();
  const [valueSwitchBusy, setValueSwitchBusy] = useState(false);
  const [sidebarW, setSidebarW] = useState(
    () => Number(localStorage.getItem("wuwei-sidebar-w")) || 232,
  );
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("wuwei-sidebar-collapsed") === "1",
  );
  const sidebarWRef = useRef(sidebarW);
  sidebarWRef.current = sidebarW;
  // 一人公司面板高度：两块同时显示时可上下拖拽分割(员工多时拉高看全，历史多时压低)。0=未设过，走自适应默认
  const [toolsH, setToolsH] = useState(
    () => Number(localStorage.getItem("wuwei-tools-h")) || 0,
  );
  const toolsHRef = useRef(toolsH);
  toolsHRef.current = toolsH;
  // 顶部图标控制两块的显隐：一人公司 / 对话列表，各自独立收起或展开(至少留一个开着)
  const [showTeam, setShowTeam] = useState(() => localStorage.getItem("wuwei-side-show-team") !== "0");
  const [showChats, setShowChats] = useState(() => localStorage.getItem("wuwei-side-show-chats") !== "0");
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  // 输入框草稿：每个会话【各存各的】，切会话互不影响。存 localStorage(wuwei-drafts: {sid:{text,images}})，重开/更新后恢复。
  // draftLoadedRef 保证「先加载完再回写」，避免初始空草稿把已存内容冲掉。
  const draftLoadedRef = useRef(false);
  const draftsRef = useRef<Record<string, { text: string; images: string[] }>>({});
  const prevSidRef = useRef(currentId);
  const draftValsRef = useRef<{ text: string; images: string[] }>({ text: input, images: pendingImages }); // 最新文字/图片(供切会话/落盘读)
  draftValsRef.current = { text: input, images: pendingImages };
  useEffect(() => {
    try { const s = localStorage.getItem("wuwei-drafts"); if (s) draftsRef.current = JSON.parse(s) || {}; } catch { /* ignore */ }
    // 迁移：老的全局单份草稿(~/.wuwei/draft.json)首次并入当前会话，之后各会话独立
    const applyCur = () => {
      const d = draftsRef.current[currentId];
      if (d) { if (d.text) setInput(d.text); if (d.images?.length) setPendingImages(d.images); }
      draftLoadedRef.current = true;
    };
    if (draftsRef.current[currentId]) { applyCur(); }
    else { window.wuwei.draftGet().then((d) => { if (d?.text || d?.images?.length) draftsRef.current[currentId] = { text: d.text || "", images: d.images || [] }; }).catch(() => {}).finally(applyCur); }
  }, []);
  // 切会话：把正在编辑的存进「走的那个会话」，再载入「切来的会话」自己的草稿(各存各的)
  useEffect(() => {
    const prev = prevSidRef.current;
    if (prev === currentId) return;
    draftsRef.current[prev] = { text: draftValsRef.current.text, images: draftValsRef.current.images };
    const d = draftsRef.current[currentId] || { text: "", images: [] };
    setInput(d.text); setPendingImages(d.images);
    prevSidRef.current = currentId;
    try { localStorage.setItem("wuwei-drafts", JSON.stringify(draftsRef.current)); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);
  // 草稿落盘：节流+trailing，而非纯防抖。纯防抖在连续快速打字时每次输入都重置计时器→一直不落盘→
  // 重启就丢一大段。节流保证连打时也每 ~400ms 落一次(最多丢最后一小段)；用 ref 读最新值，
  // 避免 trailing 触发时存到旧文本。
  const draftTimerRef = useRef<number | null>(null);
  const draftLastSaveRef = useRef(0);
  // 把当前会话的草稿写进按会话的表并落 localStorage（每会话各存各的）
  const persistDraft = () => {
    draftsRef.current[currentIdRef.current] = { text: draftValsRef.current.text, images: draftValsRef.current.images };
    try { localStorage.setItem("wuwei-drafts", JSON.stringify(draftsRef.current)); } catch { /* ignore */ }
  };
  useEffect(() => {
    if (!draftLoadedRef.current) return;
    const flush = () => {
      draftTimerRef.current = null;
      draftLastSaveRef.current = Date.now();
      persistDraft(); // 存到【当前会话】名下，不再是全局单份
    };
    const since = Date.now() - draftLastSaveRef.current;
    const GAP = 400;
    if (since >= GAP) flush(); // 距上次够久→立即落盘(leading)
    else if (draftTimerRef.current == null)
      draftTimerRef.current = window.setTimeout(flush, GAP - since); // 否则排一次 trailing，别在每次输入时清它
  }, [input, pendingImages]);
  // 关窗/刷新前兜底再落一次(尽量少丢；硬 kill 无法拦，靠上面的节流兜底)
  useEffect(() => {
    const onUnload = () => {
      if (draftLoadedRef.current) persistDraft(); // 存到当前会话名下
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);
  // 脑网络后台进度：主进程为真相源，无论设置弹窗开没开都持续订阅，供底部状态栏实时显示。
  const [idxProg, setIdxProg] = useState<{
    building: boolean;
    phase: string;
    files: number;
    total: number;
    done: number;
  } | null>(null);
  const [conProg, setConProg] = useState<{
    running: boolean;
    phase: string;
    total: number;
    done: number;
    created: number;
    cur?: string;
  } | null>(null);
  useEffect(() => {
    window.wuwei.brainDocProgress?.().then((s: any) => setIdxProg(s)).catch(() => {});
    window.wuwei.brainConceptProgress?.().then((s: any) => setConProg(s)).catch(() => {});
    const off = window.wuwei.onEvent((ch, p: any) => {
      if (ch === "evt:brain-docs") setIdxProg(p);
      else if (ch === "evt:brain-concepts") setConProg(p);
      else if (ch === "evt:tray-settings") setShowSettings(true); // 托盘菜单「设置」→ 打开设置面板
    });
    return off;
  }, []);
  // 发送前检测到的疑似新密钥→确认弹窗
  type SecCand = {
    value: string;
    masked: string;
    kind: string;
    suggestedName: string;
    note?: string;
    existing?: { id: string; name: string; note?: string }; // 该值已在保险箱(备注不同)→三选一
  };
  const [secretPrompt, setSecretPrompt] = useState<{
    text: string; // 原始文本(供存入后重新扫描)
    redacted: string; // 已把已入库密钥换成占位符的版本(用于显示/发送)
    imgs: string[];
    inject: boolean;
    candidates: SecCand[];
    checked: boolean[]; // 新密钥:是否存入
    dupChoice: ("new" | "overwrite" | "ignore")[]; // 重复项:新增/覆盖备注/忽略
  } | null>(null);
  const [account, setAccount] = useState<{
    loggedIn: boolean;
    email: string | null;
    label?: string;
    providerId?: string;
    nickname?: string;
    avatar?: string;
    balance?: { total?: string; currency: string; consumed: string };
    expired?: boolean;
  }>({
    loggedIn: false,
    email: null,
  });
  const [showAcctMenu, setShowAcctMenu] = useState(false);
  const [coinPackOpen, setCoinPackOpen] = useState(false); // ② 购买积分包弹窗
  const [planOpen, setPlanOpen] = useState(false); // ③ 升级套餐弹窗
  const [payCheckout, setPayCheckout] = useState<PayOrder | null>(null); // ④ 付款页(扫码)
  const [billingOpen,setBillingOpen]=useState(false);
  const [billingPage,setBillingPage]=useState<'plans'|'ledger'>('plans');
  const billingPreview=import.meta.env.DEV && new URLSearchParams(window.location.search).has('billingPreview');
  useEffect(()=>{if(billingPreview)setBillingOpen(true);},[billingPreview]);
  const [payResult, setPayResult] = useState<PayResult | null>(null); // ⑤ 支付结果页
  // 加密应用内收款面板：{sku, 显示名, 价格文案}。面板按订单号轮询到账，成功时置空关闭。
  const [cryptoPay, setCryptoPay] = useState<{ sku: string; name: string; price: string } | null>(null);
  const [roomSettings, setRoomSettings] = useState<{ id: string } | null>(null); // 群设置模态(改群名/最多唤醒/协调者)
  const [editEmp, setEditEmp] = useState<any | null>(null); // 右键员工「编辑」→ 在当前界面直接弹编辑框(不跳转到一人公司管理页)
  // 统一样式化确认弹窗(替代原生 confirm())：玄墨黑 VI、遮罩点击关、圆角卡片，复用 perm-overlay + add-st-dialog
  const [confirmDlg, setConfirmDlg] = useState<{ title?: string; message: string; danger?: boolean; okText?: string; onOk: () => void } | null>(null);
  const askConfirm = (opts: { title?: string; message: string; danger?: boolean; okText?: string; onOk: () => void }) => setConfirmDlg(opts);
  // SOP 文字输入弹窗（替代 Electron 里不可用的 prompt()）：新建类别/新建SOP/重命名
  const [sopPrompt, setSopPrompt] = useState<SopPromptOpts | null>(null);
  const askPrompt = (opts: SopPromptOpts) => setSopPrompt(opts);
  const [showLoginForm, setShowLoginForm] = useState(false); // 应用内登录框
  const [showLoginIntro, setShowLoginIntro] = useState(false); // 未登录发消息先弹的登录激励卡（点登录再切登录框）
  const [loginIntroReason, setLoginIntroReason] = useState<string | null>(null); // 弹登录卡的具体原因(额度用完/需登录等)，直接显在卡里，别让新用户懵
  const [langSwitchOnCard, setLangSwitchOnCard] = useState(true); // 登录卡小地球语言切换是否显示(后台 catalog flag 控制，缺省显示)
  const [acctLangOpen, setAcctLangOpen] = useState(false); // 账号菜单游客卡上小地球语言下拉的开合
  const [unavailModel, setUnavailModel] = useState<string | null>(null); // 上游暂不可用(upstream_error)的模型 → 错误栏给「一键换可用模型」引导
  const [showSupport, setShowSupport] = useState(false); // 联系客服弹窗（支付遇到问题 / 账号菜单都可开）
  const [showSupportChat, setShowSupportChat] = useState(false); // 在线客服实时对话窗
  const [supportUnread, setSupportUnread] = useState(0); // 客服未读回复数（悬浮球红点）
  const [scLauncherHidden, setScLauncherHidden] = useState(() => localStorage.getItem("wuwei-sc-launcher-hidden") === "1"); // 用户关掉了悬浮球
  const [showLeaveMsg, setShowLeaveMsg] = useState(false); // 留言表单（客服弹窗内点「直接留言」/ 账号菜单「留言反馈」进入）
  const [leaveMsgFromSupport, setLeaveMsgFromSupport] = useState(false); // 区分来源：从客服弹窗进=显返回；从菜单直接进=无返回
  const [showMsgCenter, setShowMsgCenter] = useState(false); // 消息中心弹窗
  const [showGuide, setShowGuide] = useState(false); // 使用手册弹窗

  // —— 产品行为埋点：弹窗展示 / 用户菜单打开（每次弹出/打开记一次，供后台漏斗分析）——
  useEffect(() => { if (coinPackOpen) void window.wuwei.track?.("buy_credits_popup_shown"); }, [coinPackOpen]);
  useEffect(() => { if (planOpen) void window.wuwei.track?.("upgrade_member_popup_shown"); }, [planOpen]);
  useEffect(() => { if (showLoginIntro) void window.wuwei.track?.("login_popup_shown", { kind: "intro" }); }, [showLoginIntro]);
  useEffect(() => { if (showLoginForm) void window.wuwei.track?.("login_popup_shown", { kind: "form" }); }, [showLoginForm]);
  useEffect(() => { if (showAcctMenu) { markFirstAction("open_menu"); void window.wuwei.track?.("user_menu_open"); } }, [showAcctMenu]);
  useEffect(() => { if (showSettings) void window.wuwei.track?.("settings_open"); }, [showSettings]); // 打开设置面板
  const [msgUnread, setMsgUnread] = useState(0); // 消息中心未读数（菜单红点）
  const [showBrainIntro, setShowBrainIntro] = useState(false); // 免费脑网络功能介绍弹窗
  const [checkinToast, setCheckinToast] = useState(""); // 每日签到到账轻量提示
  const [checkinDone, setCheckinDone] = useState(false); // 今日是否已签到（手动签或已签后置 true）
  const [checkinBusy, setCheckinBusy] = useState(false); // 签到请求中，防重复点击
  const [checkinPop, setCheckinPop] = useState<{ amount: number; streak?: number } | "already" | null>(null); // 居中签到弹窗
  const [loginResume, setLoginResume] = useState(false); // 登录成功后是否续发刚才拦下的消息
  const loginSendRef = useRef<{ userId: string; sid: string; text: string; images: string[] } | null>(null);
  const lang = useLanguage(); // 界面语言
  const t = makeT(lang);
  useTx(); // 订阅翻译显示层：译文到货/切换翻译态时刷新本组件里的 tx() 覆盖文本
  const [translateMode, setTranslateMode] = useState(false); // 翻译显示态(仅供发英文版截图，纯覆盖不改数据)
  // 供空依赖 onEvent 事件 handler 取「最新」语言/翻译函数：闭包会冻结挂载时的 lang/t，
  // 直接用会导致切换界面语言后、事件生成的提示/报错仍是挂载时旧语言(如中文版仍显示英文报错)。
  const langRef = useRef(lang);
  langRef.current = lang;
  const tRef = useRef(t);
  tRef.current = t;
  const previewLanguageRef = useRef("zh");
  function changeLang(l: Lang, preview = false) {
    if (!preview) { setTranslateMode(false); setTxMode(false); }
    persistLang(l);

    // 同步到主进程 settings.app.lang → 刷新 WUWEI_LANG，让主进程 tt()/工具描述/系统提示默认跟随界面语言
    window.wuwei.setAppSettings({ lang: l });
  }
  const [webLoginBusy, setWebLoginBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState(false); // 失败处一键授权 Claude 进行中
  const [codexBusy, setCodexBusy] = useState(false); // Codex 一键授权进行中
  // 无为账号（B2：全新正交账号态，≠模型商账号，独立身份区。最终顶栏样式待小美定稿换皮）
  const [wuwei, setWuweiState] = useState<{
    user: { id: string; email: string | null; name: string | null; avatar: string | null };
    coin: { balance: number; lastSignin?: string | null };
    membership?: {
      tier: "free" | "pro_month" | "pro_year";
      expireAt?: string | number;
      plan?: string | null; // 档位显示名 Pro/Plus/Max
      weeklyQuota?: { active: boolean; remainingPct: number; resetsAt: string | null };
    };
    flags?: string[];
    trialEligible?: boolean; // 从未付费 → 缺币弹 ¥1 体验；否则弹「升级正式会员」
    providers?: { hidden?: string[] };
  } | null>(null);
  const [wuweiReady, setWuweiReady] = useState(false);
  const wuweiRef = useRef(wuwei); // 空依赖事件闭包里读最新登录态(否则 wuwei 冻结在挂载时=未登录)
  wuweiRef.current = wuwei;
  const wuweiRevisionRef = useRef(0);
  function setWuwei(value: React.SetStateAction<typeof wuwei>) {
    ++wuweiRevisionRef.current;
    setWuweiReady(true);
    setWuweiState(current => {
      const next = typeof value === 'function' ? value(current) : value;
      wuweiRef.current = next;
      return next;
    });
  }
  const [balanceRefresh, setBalanceRefresh] = useState<AccountRefreshState>({ busy: false, error: false, updatedAt: null });
  const accountRefreshRef = useRef<ReturnType<typeof createAccountRefresher<WuweiMe>> | null>(null);
  accountRefreshRef.current ??= createAccountRefresher<WuweiMe>(
    () => window.wuwei.wuweiMe(), () => wuweiRef.current,
    (me) => setWuwei((current) => current?.user.id === me.user.id ? me : current), setBalanceRefresh,
    15_000, () => handleWuweiSessionExpired());
  const sessionExpiredPromptRef = useRef(false);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(false);
  function handleWuweiSessionExpired() {
    if (sessionExpiredPromptRef.current) return;
    sessionExpiredPromptRef.current = true;
    ++connCheckSeqRef.current; // An older successful ping must not restore the green light.
    accountRefreshRef.current?.cancel();
    setWuwei(null);
    setShowAcctMenu(false);
    setCoinShortage(null); setFreeCapModal(null); setCryptoPay(null);
    setShowLoginIntro(false);
    setSessionExpiredNotice(true);
    setShowLoginForm(true);
    setConn({ status: 'red', reason: tr("ui.index.your.session.has.expired.please.sign.3bf7b7e") });
  }
  useEffect(() => {
    const refresh = accountRefreshRef.current!;
    refresh.reset();
    return () => refresh.cancel();
  }, [wuwei?.user.id]);
  // 菜单关闭后仍更新缓存余额；反复开关/手动刷新共用进行中的请求。
  useEffect(() => {
    if (showAcctMenu) void accountRefreshRef.current!.refresh();
  }, [showAcctMenu, wuwei?.user.id]);
  // 海外 Paddle 结账后台轮询定时器：付款在系统浏览器完成，客户端无回调，只能轮询 wuweiMe 检测到账。
  // 存 ref 便于「再次点付款先清上一个」+「组件卸载清理」，绝不留下永远跑的定时器。
  const enPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (enPollRef.current) { clearInterval(enPollRef.current); enPollRef.current = null; } }, []);
  // 后台轮询客服未读（不清未读）：登录 且 聊天窗未开时，每 20s 查一次，有回复亮红点
  useEffect(() => {
    if (!wuwei || showSupportChat) return;
    let alive = true;
    const check = async () => { const r = await window.wuwei.supportThread(false).catch(() => null); if (alive && r) setSupportUnread(r.unread || 0); };
    void check();
    const iv = setInterval(check, 20000);
    return () => { alive = false; clearInterval(iv); };
  }, [wuwei, showSupportChat]);
  // 灰度开关（C2）：订阅版是否显示，完全由后端 flags 决定，默认隐藏。客户端只渲染不判定。
  const showSubscription = !!wuwei?.flags?.includes("subscription");
  const [wuweiBusy, setWuweiBusy] = useState(false);
  // rebind：当前绑的是「无为托管·Claude」且用户已授权 Claude 订阅时，弹窗给「一键改用订阅继续」（订阅走账号额度、不扣无为币）
  const [coinShortage, setCoinShortage] = useState<{ message: string; balance?: number; rebind?: { providerId: string; model: string; label: string }; browse?: boolean; freecap?: boolean } | null>(null);
  const [freeCapModal, setFreeCapModal] = useState<{ model: string; balance: number; hasMemberQuota?: boolean } | null>(null);
  const usageLimitHandlerRef = useRef<(kind: 'free' | 'balance', message: string) => void>(() => {});
  const usageLimitRequestRef = useRef<{ user: string; sid: string; model: string; at: number; pending: boolean } | null>(null);
  const [quotaWarn, setQuotaWarn] = useState<{ model: string; usedPct: number; resetsAt: string | null } | null>(null); // 用高价模型烧周额度过快(≥50/80%)→弹窗建议切省钱模型
  // 所有付费/提醒弹窗「展示」统一埋点：依赖用 !!state(布尔)，只在弹窗打开的一刻发一次(对象内容更新不重复发)。
  // 后台「弹窗提示总数」按这些 *_shown 事件汇总，可下钻看谁/IP/地区/时间/弹了什么/点了什么。
  useEffect(() => {
    if (coinShortage) void window.wuwei.track?.("credits_shortage_shown", { context: coinShortage.freecap ? "freecap" : coinShortage.browse ? "browse" : (coinShortage.message || "shortage"), canRebind: !!coinShortage.rebind, payPage: (getCurrentLanguage() === "zh" ? "alipay" : "paddle") });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!coinShortage]);
  useEffect(() => {
    if (quotaWarn) void window.wuwei.track?.("quota_warn_shown", { model: quotaWarn.model, usedPct: quotaWarn.usedPct });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!quotaWarn]);
  useEffect(() => {
    if (freeCapModal) void window.wuwei.track?.("free_cap_guide_shown", { model: freeCapModal.model, balance: freeCapModal.balance });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!freeCapModal]);
  const [payFaqOpen, setPayFaqOpen] = useState(false); // 缺币弹窗「常见问题」答疑弹窗（叠在支付弹窗之上，关闭即返回）
  const [debugCtx, setDebugCtx] = useState<null | "weekly" | "shortage" | "freecap" | "browse">(null); // 仅 dev：调试快捷键强制支付弹窗的 context，覆盖真实推断
  const shortageShownAt = useRef(0); // 余额不足弹窗展示时刻，用于算用户看了多久
  // 关闭余额不足弹窗并记录用户动作 + 停留时长。action: close(叉/暂不) | upgrade(升级会员) | buy_pack(买积分包) | rebind(改用订阅)
  function closeShortage(action: string) {
    const dwellMs = shortageShownAt.current ? Date.now() - shortageShownAt.current : 0;
    void window.wuwei.track?.("credits_shortage_action", { action, dwell_ms: dwellMs });
    usageLimitRequestRef.current = null;
    shortageShownAt.current = 0;
    setCoinShortage(null);
    setDebugCtx(null); // 关掉调试强制的 context
  }
  // 【仅开发预览】调试快捷键，逐个弹出各弹窗看文案/效果。import.meta.env.DEV 门控，生产构建自动剥离。
  //   Ctrl+Shift+1 本月额度用完(weekly)  ·  2 无为币用完(shortage)  ·  3 今日免费额度用完(freecap购买)
  //   Ctrl+Shift+4 选择套餐(browse)      ·  5 月额度烧太快提醒(quotaWarn)  ·  6 免费次数用完切托管(freeCapModal)
  useEffect(() => {
    if (!(import.meta as { env?: { DEV?: boolean } }).env?.DEV) return;
    const openPay = (ctx: null | "weekly" | "shortage" | "freecap" | "browse") => {
      setDebugCtx(ctx);
      setCoinShortage({ message: tr("ui.app.message.57f40416c4"), balance: 0 });
      shortageShownAt.current = Date.now();
    };
    const h = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey) return;
      const c = e.code;
      if (c === "Digit1") { e.preventDefault(); openPay("weekly"); }
      else if (c === "Digit2") { e.preventDefault(); openPay("shortage"); }
      else if (c === "Digit3") { e.preventDefault(); openPay("freecap"); }
      else if (c === "Digit4") { e.preventDefault(); openPay("browse"); }
      else if (c === "Digit5") { e.preventDefault(); setQuotaWarn({ model: "claude-opus-4-8", usedPct: 85, resetsAt: new Date(Date.now() + 20 * 864e5).toISOString() }); }
      else if (c === "Digit6") { e.preventDefault(); setFreeCapModal({ model: "nemotron-super-free", balance: 100 }); }
      else if (c === "Digit9") { e.preventDefault(); openPay("shortage"); } // 兼容旧快捷键
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  // 一键三合一（Ctrl/⌘+Shift+T）：在「中文原文」和「英文(UI 语言 + 动态内容都翻成英文)」之间来回切。
  // 专供发 X 英文版截图：一按切英文 UI 并把会话/员工/群标题与消息临时译成英文覆盖显示；再按切回中文显示原文。
  // 纯覆盖层，绝不改底层数据；缓存常驻内存，来回切直接命中。
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.code === "KeyT" || e.key === "t" || e.key === "T")) {
        e.preventDefault();
        const goEn = langRef.current !== "en";
        if (goEn) previewLanguageRef.current = getLanguagePreference();
        changeLang(goEn ? "en" : previewLanguageRef.current, true); // 切 i18n UI 语言(现有机制)
        setTranslateMode(goEn); // 状态栏提示
        setTxMode(goEn); // 开/关动态内容翻译覆盖
      }
    };
    // Language switching remains available inside dialogs that stop key bubbling.
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, []);
  // 客户端公告：启动拉取，未读过该版本(version)且 active 才弹；读过存本地，同版本不再弹，后台更新(version 变)则再弹。
  const announcementDeliveryRef = useRef<ReturnType<typeof createAnnouncementDelivery> | null>(null);
  const [announce, setAnnounce] = useState<UnreadAnnouncement | null>(null);
  // 自动更新：版本号 + 检查态 + 新版就绪(已下载好，点即装)
  const [appVer, setAppVer] = useState("");
  const [updateReady, setUpdateReady] = useState<{ version: string; notes: string } | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false); // 升级弹窗开关：药丸/菜单点击才开，下载好不再自动弹
  const [updateMsg, setUpdateMsg] = useState(""); // 「检查中/已是最新/发现新版下载中…」等提示
  const [hasUpdate, setHasUpdate] = useState(false); // 有新版可用(小红点标志)：发现新版即 true
  // 左下角「重启更新」药丸：新版下载好后常驻显示，点主体即装、点叉关闭；关掉的版本记 localStorage，同版本不再弹、更新的版本会重新出现
  const [updateChipHidden, setUpdateChipHidden] = useState<string>(() => { try { return localStorage.getItem("wuwei_dismissed_update_chip") || ""; } catch { return ""; } });
  const lastUpdCheck = useRef(0); // 发消息时顺带静默检测新版本的节流(2分钟)，多一个触发点
  const [dlProgress, setDlProgress] = useState<{ percent: number; bytesPerSecond: number } | null>(null); // 更新下载进度(0-100)，下载完清空
  const [dlVer, setDlVer] = useState(""); // 正在下载的新版本号（左下角提示用）
  async function refreshWuweiForShortage(message: string) {
    // 去抖：自主推进/智能继续的会话会连续重试，每次撞余额都会调这里 → 弹窗弹好几次。
    // 3 秒内已弹过就跳过(点「刷新余额」按钮走的是同函数，但那是用户主动、间隔一般 >3s，不受影响)。
    usageLimitRequestRef.current = null;
    if (coinShortage && Date.now() - shortageShownAt.current < 3000) return;
    // 直接打开充值付款界面，后台刷新账号不阻塞展示。
    setFreeCapModal(null); setQuotaWarn(null); setShowAcctMenu(false);
    setShowProviderMenu(false); setShowModelMenu(false); setDebugCtx(null);
    const userId = wuweiRef.current?.user.id;
    setCoinShortage({ message, balance: wuweiRef.current?.coin.balance ?? 0 });
    shortageShownAt.current = Date.now();
    try {
      const me = await window.wuwei.wuweiMe();
      if (me && me.user.id === userId && wuweiRef.current?.user.id === userId) {
        setWuwei(me);
        setCoinShortage((current) => current?.message === message ? { ...current, balance: me.coin.balance } : current);
      }
    } catch {
      /* 弹窗仍然保留充值入口 */
    }
  }
  async function handleUsageLimit(kind: 'free' | 'balance', message: string) {
    const account = wuweiRef.current;
    if (!account) { requestModelLogin(); return; }
    if (kind === 'balance') { void refreshWuweiForShortage(message); return; }
    const previous = usageLimitRequestRef.current;
    const sid = currentIdRef.current;
    const model = quotaModelRef.current.model;
    if (previous?.user === account.user.id && previous.sid === sid && previous.model === model && (previous.pending || Date.now() - previous.at < 3000)) return;
    const request = { user: account.user.id, sid, model, at: Date.now(), pending: true };
    usageLimitRequestRef.current = request;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refreshed = await Promise.race([
      window.wuwei.wuweiMe().catch(() => null),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 3000); }),
    ]);
    clearTimeout(timer);
    if (usageLimitRequestRef.current !== request) return;
    request.pending = false;
    if (wuweiRef.current?.user.id !== request.user || currentIdRef.current !== sid || quotaModelRef.current.model !== model) return;
    const latest = refreshed?.user.id === request.user ? refreshed : wuweiRef.current;
    if (refreshed?.user.id === request.user) setWuwei(refreshed);
    setShowAcctMenu(false); setShowProviderMenu(false); setShowModelMenu(false); setQuotaWarn(null); setDebugCtx(null);
    if (usageLimitDestination(kind, latest) === 'recommend') {
      setCoinShortage(null);
      setFreeCapModal({ model, balance: latest.coin.balance, hasMemberQuota: !!latest.membership?.weeklyQuota?.active && (latest.membership.weeklyQuota.remainingPct ?? 0) > 0 });
    } else {
      setFreeCapModal(null);
      setCoinShortage({ message: 'freecap', balance: latest.coin.balance, freecap: true });
      shortageShownAt.current = Date.now();
    }
  }
  async function doWuweiLogout() {
    await window.wuwei.wuweiLogout();
    setWuwei(null);
    setCheckinDone(false);
  }
  // 手动签到：账号面板点「签到」触发。后端幂等，给币则弹 toast + 刷新余额；无论刚签/已签都标记当天完成。
  async function doCheckin() {
    if (checkinBusy || checkinDone) return;
    void window.wuwei.track?.("menu_item_click", { item: "checkin" });
    setCheckinBusy(true);
    try {
      const r = await window.wuwei.checkin();
      if (r?.success && (r.amount ?? 0) > 0) {
        setCheckinPop({ amount: r.amount ?? 0, streak: r.streak }); // 居中成功弹窗
        window.wuwei.wuweiMe().then((m) => { if (m) setWuwei(m); }).catch(() => {});
      } else if (r) {
        setCheckinPop("already"); // 今日已签到，也给个反馈
      }
      if (r) setCheckinDone(true);
      if (r) setTimeout(() => setCheckinPop(null), 2800); // 自动消失
    } catch {
      /* 忽略，稍后可重试 */
    } finally {
      setCheckinBusy(false);
    }
  }
  // 海外结账：英文用户点购买/升级 → 系统浏览器打开网页 Paddle 结账页(已验证可付+webhook发币)。
  // clientSku=人民币档 sku，经 EN_SKU 映射成美元档 sku。内嵌 3DS 走不通，故用系统浏览器。
  function startEnCheckout(clientSku: string) {
    const enSku = EN_SKU[clientSku];
    if (!enSku) return;
    const uid = wuwei?.user.id;
    const email = wuwei?.user.email ?? "";
    const url =
      `https://wuweiai.io/en/checkout?sku=${encodeURIComponent(enSku)}` +
      (uid ? `&uid=${encodeURIComponent(uid)}&email=${encodeURIComponent(email)}` : "");
    window.wuwei.openExternal(url);
    pollPaymentArrival(clientSku);
  }
  // 加密货币结账：给卡付不了的地区(俄罗斯/中东等)兜底。调后端建 NOWPayments 发票 →
  // 系统浏览器打开收银台(可付 USDT/BTC 等任意币) → 付款成功走 IPN 回调发币 → 同 Paddle 靠轮询检测到账。
  async function startCryptoCheckout(clientSku: string) {
    const uid = wuwei?.user.id;
    if (!uid) { setShowLoginForm(true); return; }
    try {
      const resp = await window.wuwei.payCryptoCreate(clientSku);
      const inv = resp?.invoiceUrl as string | undefined;
      if (!inv) {
        push({ type: "notice", text: tr("ui.app.crypto.checkout.unavailable.please.try.card.9b0b8c0") });
        return;
      }
      window.wuwei.openExternal(inv);
      pollPaymentArrival(clientSku);
    } catch {
      push({ type: "notice", text: tr("ui.app.failed.to.start.crypto.checkout.please.b0837ab") });
    }
  }
  // 结账后后台轮询：付款在系统浏览器/收银台完成，无内嵌回调，靠轮询 wuweiMe 检测到账 → 弹成功窗。
  // Paddle 和 加密支付 共用此逻辑。
  function pollPaymentArrival(clientSku: string) {
    // 先抓基线（余额 / 会员态）；付款成功即以「新值 vs 基线」判定，成功后停轮询并弹 PayResultModal。
    const base = wuweiRef.current;
    const baseBalance = base?.coin.balance ?? 0;
    const baseTier = base?.membership?.tier ?? "free";
    const tsOf = (v?: string | number | null): number => {
      if (v == null) return 0;
      const n = typeof v === "number" ? v : Date.parse(v);
      return Number.isNaN(n) ? 0 : n;
    };
    const baseExpire = tsOf(base?.membership?.expireAt);
    const baseWqActive = base?.membership?.weeklyQuota?.active ?? false;
    const isPlan = clientSku.startsWith("plan_"); // plan_* = 会员订阅→"pro"；其余 = 积分包→"coin"
    // 再次点付款：先清掉上一个轮询，避免叠加多个定时器
    if (enPollRef.current) { clearInterval(enPollRef.current); enPollRef.current = null; }
    let ticks = 0;
    const MAX_TICKS = 75; // 4s × 75 ≈ 5 分钟，超时静默停（不弹错误）
    const stop = () => { if (enPollRef.current) { clearInterval(enPollRef.current); enPollRef.current = null; } };
    enPollRef.current = setInterval(() => {
      ticks += 1;
      if (ticks > MAX_TICKS) { stop(); return; } // 超时静默停
      void window.wuwei.wuweiMe().then((me) => {
        if (!me || !enPollRef.current) return; // 已被清理（卸载/重开）则丢弃这次结果
        if (isPlan) {
          const m = me.membership;
          const newTier = m?.tier ?? "free";
          const newExpire = tsOf(m?.expireAt);
          const newWqActive = m?.weeklyQuota?.active ?? false;
          const ok =
            (newTier !== "free" && (baseTier === "free" || newTier !== baseTier)) || // 无→有 / tier 升级
            newExpire > baseExpire ||                                                 // expire_at 变新（续费/延长）
            (newWqActive && !baseWqActive);                                           // 周额度 inactive→active
          if (!ok) return;
          stop();
          setCoinShortage(null); setFreeCapModal(null); setCryptoPay(null); // 付款成功：关大 paywall / 免费额度 / 加密面板，再弹成功窗
          setWuwei(me);
          void runConnCheck(); // 重测连通灯：会员激活/到账后该模型即可用，灯从黄→绿，别让用户以为还有问题
          const plan = PRO_PLANS.find((p) => p.sku === clientSku);
          const isTrial = clientSku === "plan_trial";
          const planName = isTrial
            ? (tr("ui.app.trial.192d185"))
            : plan ? (lang !== "zh" ? plan.nameEn : plan.name) : (m?.plan || "Pro");
          const expTs = tsOf(m?.expireAt);
          const expire = expTs
            ? fmtDate(new Date(expTs))
            : fmtDate(isTrial ? new Date(Date.now() + 7 * 24 * 3600_000) : addMonths(new Date(), 1));
          setPayResult({
            kind: "pro",
            planName,
            expire,
            giftCoins: isTrial ? 0 : ((lang !== "zh" ? plan?.coinsEn : plan?.coins) ?? 0),
            signin: isTrial ? 20 : (plan?.signin ?? 0),
            perks: (PRO_FEATS()).map(([tt]) => tt),
            saved: plan?.saved || undefined,
            order: "",
          });
        } else {
          const newBalance = me.coin.balance;
          if (newBalance <= baseBalance) return; // 未到账继续等
          stop();
          setCoinShortage(null); setFreeCapModal(null); setCryptoPay(null); // 付款成功：关大 paywall / 免费额度 / 加密面板，再弹成功窗
          setWuwei(me);
          void runConnCheck(); // 重测连通灯：会员激活/到账后该模型即可用，灯从黄→绿，别让用户以为还有问题
          setPayResult({ kind: "coin", added: newBalance - baseBalance, bonus: 0, balance: newBalance, order: "" });
        }
      }).catch(() => { /* 单次拉取失败忽略，下个 tick 再试 */ });
    }, 4000);
  }
  // 应用内登录框成功回调：更新账号 + 关框 + (若从发送门槛来)续发刚才拦下的消息
  function onWuweiLoggedIn(me: WuweiMe, action?: "login" | "register" | "reset") {
    sessionExpiredPromptRef.current = false;
    setSessionExpiredNotice(false);
    setWuwei(me);
    setWuweiReady(true);
    setShowLoginForm(false);
    void runConnCheck(); // 登录后立刻重测连通灯，避免登录前的黄灯一直挂着（凭证已变、必须重探）
    const en = getLang() !== "zh";
    const who = me.user.name || me.user.email || ("user");
    const msg =
      action === "register"
        ? (tr("ui.app.registered.welcome.to.wuwei.signed.in.f59e4e2", { p0: who }))
        : action === "reset"
          ? (tr("ui.app.password.reset.signed.in.automatically.53f3ba3", { p0: who }))
          : (tr("ui.app.signed.in.7b22eca", { p0: who }));
    push({ type: "notice", text: msg });
    if (loginResume) {
      const t = input.trim();
      if (t || pendingImages.length) {
        // Wait for the signed-in default before resuming; otherwise an old
        // premium model can receive the first request while login is rendering.
        loginSendRef.current = { userId: me.user.id, sid: currentId, text: t, images: [...pendingImages] };
      }
      setLoginResume(false);
    }
  }
  async function doCodexLogin() {
    setCodexBusy(true);
    try {
      const ok = await window.wuwei.codexLogin();
      push({
        type: "notice",
        text: ok
          ? (tr("ui.app.codex.authorized.choose.model.in.my.37f5b58"))
          : (tr("ui.app.codex.authorization.didn.complete.cancelled.timeout.2fb3523")),
      });
    } finally {
      setCodexBusy(false);
    }
  }
  const [needAuth, setNeedAuth] = useState(false); // 检测到缺授权：授权条常驻显示
  const [authDismissed, setAuthDismissed] = useState(false); // 用户手动 × 关掉了授权条
  const [oauthStep, setOauthStep] = useState<"idle" | "awaiting-code">("idle"); // 浏览器授权：等回填授权码
  const [codeInput, setCodeInput] = useState(""); // 授权码输入
  const [apiKeyStep, setApiKeyStep] = useState<"idle" | "awaiting">("idle"); // API Key 平台：等复制/粘贴 key
  const [apiKeyInput, setApiKeyInput] = useState(""); // API Key 输入
  const [apiKeyBusy, setApiKeyBusy] = useState(false); // 正在验证 key
  const lastClipRef = useRef(""); // 上次检测过的剪贴板内容(去重)
  const keyTestingRef = useRef(false); // 防并发验证
  const [conn, setConn] = useState<{ status: "green" | "yellow" | "red" | "checking"; reason: string }>({
    status: "checking",
    reason: tr("ui.app.checking.connection.ab4a5e8"),
  });
  const [showConn, setShowConn] = useState(false); // 状态灯说明气泡
  const connCheckSeqRef = useRef(0);
  const thinkStartRef = useRef<number | null>(null); // 本轮开始时间（思考计时）
  const charsRef = useRef(0); // 本轮已流式字符数（估算 token）
  const turnTextRef = useRef(""); // 本轮已生成的正文(含 instant 模式还没揭示的),供状态栏悬停预览
  // 已"总是允许"的工具（记住授权，跨重启，手动模式下不再提示）
  const alwaysAllowRef = useRef<Set<string>>(
    new Set((() => {
      try {
        return JSON.parse(localStorage.getItem("wuwei-allow") || "[]");
      } catch {
        return [];
      }
    })()),
  );
  const streamRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true); // 用户是否贴着底部：滚上去看历史时暂停自动吸底，滚回底部再恢复
  // 强制吸底截止时间戳(0=不强制)。切换会话/发消息后的这段时间里，滚动是"内容异步撑高"引起的，
  // 不是用户意图：期间无条件吸底，且不让这些程序滚动改写 atBottomRef——
  // 否则内容刚替换那一帧 scrollTop 还是 0 而 scrollHeight 已很大，会被判成"用户已离底"，
  // 把后面几次兜底吸底全挡掉，表现就是"要点两下才到底部"。
  const forceBottomUntilRef = useRef(0);
  const [awayFromBottom, setAwayFromBottom] = useState(false); // 离底(=已暂停吸底)：显示"回到底部"按钮
  const [serverCtxMax, setServerCtxMax] = useState(0); // 服务端报错里学到的真实上下文上限(0=还没学到)
  const taRef = useRef<HTMLTextAreaElement>(null);
  const history = useRef<string[]>([]);
  const histIdx = useRef<number>(-1);

  const push = (it: Item) => setItems((p) => [...p, it]);

  // 流式出字：把到手文本先缓冲，再按「输出方式」揭示。
  //  stream=每 30ms 把缓冲一次性吐出(唰的一下)；typewriter=每 ~16ms 匀速吐 speed 字/秒；
  //  instant=流式期间不吐，攒到段落边界(工具/结束)一次性整段出。
  //  正在流的那条渲染纯文本(不重解析 markdown)，流完再切完整 Markdown。
  const pendingDeltaRef = useRef("");
  const flushTimerRef = useRef<number | null>(null);
  const TW_TICK = 16;
  function scheduleFlush() {
    if (flushTimerRef.current != null) return;
    const delay = streamModeRef.current === "typewriter" ? TW_TICK : 30;
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      flushDelta(false);
    }, delay);
  }
  // force=true：段落边界(工具开始/回合结束)整段吐出，无视模式，别把内容卡在缓冲里
  function flushDelta(force = false) {
    if (flushTimerRef.current != null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const buf = pendingDeltaRef.current;
    if (!buf) return;
    const mode = streamModeRef.current;
    let chunk: string;
    if (force || mode === "stream") {
      chunk = buf;
      pendingDeltaRef.current = "";
    } else if (mode === "instant") {
      return; // 流式期间不揭示，等边界 force 整段出
    } else {
      // typewriter：按速度取前 N 字，其余留缓冲，继续排下一次
      const n = Math.max(1, Math.round((streamSpeedRef.current * TW_TICK) / 1000));
      chunk = buf.slice(0, n);
      pendingDeltaRef.current = buf.slice(n);
    }
    setItems((p) => {
      const last = p[p.length - 1];
      if (last && last.type === "assistant") {
        const c = [...p];
        c[c.length - 1] = { ...last, text: last.text + chunk };
        return c;
      }
      return [...p, { type: "assistant", text: chunk, ts: Date.now() }];
    });
    if (pendingDeltaRef.current) scheduleFlush(); // 还有剩(typewriter)继续吐
  }

  // 每 15s 刷新一次「多久之前」相对时间(实时递增)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  // 当前平台预设(用于右下角模型快切列出该平台模型)；设置面板关闭后刷新
  useEffect(() => {
    window.wuwei.getSettings().then((r) => {
      if (r?.systemLanguage) setSystemLanguage(r.systemLanguage);
      // 首启兜底：从未选过平台(providerId 为空)时默认落到「免费体验(wuwei-free, anon 免登录)」，
      // 让全新未登录用户下载后第一条消息就能直接聊、不撞登录墙(头号转化真凶)。已登录/已选过平台者 providerId 非空不受影响。
      setCurProviderId(r?.settings?.providerId || "wuwei-free");
      setImageMode(!!r?.settings?.imageMode);
      setImageSku(r?.settings?.imageSku || "");
      // 首启兜底不能只改 UI：若从未选过平台(providerId 空)，把 wuwei-free 的完整配置(kind=openai/网关 baseUrl)
      // 真正落盘。否则界面显示免费、settings.kind 却停在默认(anthropic) → 免费模型被当 anthropic 发、报"无法解析鉴权"。
      if (!r?.settings?.providerId) {
        const freeP = PRESETS.find((x) => x.id === "wuwei-free");
        if (freeP) {
          window.wuwei.setSettings({ ...(r?.settings || {}), kind: freeP.kind, providerId: freeP.id, baseUrl: freeP.baseUrl, apiKey: undefined, oauthToken: undefined, modelChoiceExplicit: false, model: freeP.models.includes(r?.settings?.model || "") ? r.settings.model : freeP.models[0] });
        }
      }
      // 可选模块开关：以主进程 settings 为准校准本地镜像（用户可能在别处改过/换了机器）
      {
        const on = (r?.settings as any)?.app?.teamEnabled === true;
        setTeamEnabled(on);
        localStorage.setItem("wuwei-team-enabled", on ? "1" : "0");
      }
      setStations(r?.settings?.customStations || []);
      setProviderOrder(r?.settings?.providerOrder || []);
      setHiddenProviders(r?.settings?.hiddenProviders || []);
      setRemovedProviders((r?.settings as any)?.removedProviders || []);
      setProviderOverrides((r?.settings as any)?.providerOverrides || {});
      setGroupMode((r?.settings as any)?.groupMode || "date");
      setStreamMode((r?.settings as any)?.streamMode || "stream");
      setStreamSpeed((r?.settings as any)?.streamSpeed || 400);
      setKeepRecent((r?.settings as any)?.keepRecent || 12);
      setEffort((r?.settings as any)?.effort || "medium");
      setShowEffortPicker((r?.settings as any)?.showEffortPicker !== false); // 默认显示
      setAskToastAuto((r?.settings as any)?.askToastAutoDismiss !== false); // 默认开
      setAskToastSec((r?.settings as any)?.askToastDismissSec || 30);
      // 应用主题(深色已下线，默认白色；存量 dark 回退白色)
      const theme = resolveTheme((r?.settings as any)?.theme);
      document.documentElement.setAttribute("data-theme", theme);
    });
    document.documentElement.setAttribute("data-platform", window.wuwei.platform);
  }, [showSettings]);
  // 后台「AI 提供商」目录：默认序 / 显隐 / 模型（含免费）由后台可配。带登录 token 拉(应用每用户显隐)。
  // 拉不到(离线/老后端)→ catalog=null → 全量回退硬编码 PRESETS + PROVIDER_ORDER，保证永远能用。
  useEffect(() => {
    void refreshCatalog();
  }, [wuwei?.user?.id]);
  useEffect(() => { void refreshImageCatalog(); }, [wuwei?.user?.id]);

  // 内置平台 + 用户自定义供应商：先应用用户的删除/改名/改端点覆盖，再按托管登录+后台可见性过滤，
  // 最后按用户自定义顺序排、隐藏项不进切换菜单
  const backendHidden = wuwei?.providers?.hidden ?? []; // 后台下发的隐藏供应商(全局+按用户)
  // 把后台目录并入内置预设：已知平台沿用本地元数据(kind/baseUrl/note)、仅用 catalog 覆盖模型列表；
  // 后台新增的平台则整条按 catalog 构造。免费模型 id 收集给下拉打「免费」标。catalog=null 时原样返回。
  const freeModelIds = new Set<string>();
  const modelBadges = new Map<string, string>(); // 后台配的模型角标(如「快」)，下拉里显示
  // 后台角标中英对照：DB 里混存中文词(限免/快/更强/深度思考/识图)与英文码(new/hot/top)，英文界面统一映射成英文
  const badgeEn = (b: string) => localizeModelBadge(b, lang);
  // 英文码 → 中文角标：后台 badge 存的是 new/hot/top 这类码，中文下拉直接显原码(如"top")很丑，这里统一映射
  const badgeCn = (b: string) => localizeModelBadge(b, lang);
  const modelLabels = new Map<string, string>(); // 后台配的模型显示名(如 gpt-5.6→"GPT-5.6 Sol")，下拉里优先显示 label
  const modelLabelsEn = new Map<string, string>(); // 后台配的英文显示名(ai_model.label_en)，英文界面优先显示
  const loginReqModelIds = new Set<string>(); // 免费列表里「需登录才可用」的便宜模型 id（匿名灰置引导登录）
  // 缺币付款两态：从未付费(trialEligible)→¥1 体验；否则→升级正式会员。未登录/老后端缺省按体验。
  const trialEligible = wuwei?.trialEligible !== false; // 从未付费 → 含 ¥1 体验档
  const payOpts = buildPayOpts(trialEligible);
  const payDefaultSku = PAYOPT_DEFAULT_SKU(trialEligible);
  const mergedPresets = mergeCatalogIntoPresets(PRESETS, catalog, freeModelIds, curProviderId, modelBadges, modelLabels, modelLabelsEn, loginReqModelIds);
  const catalogOrder = catalog ? catalog.slice().sort((a, b) => a.sort - b.sort).map((p) => p.id) : undefined;
  const providerListRaw = arrangePresets(
    // 托管平台需登录可见；anon(免登录)平台未登录也可见；后台隐藏的一律不显示(供应商上下架由后台控制)
    applyProviderEdits([...mergedPresets, ...stations.map(stationToPreset)], providerOverrides, removedProviders).filter(
      // 游客也显示全部平台(含托管)——点托管平台发消息时才引导登录(见发送门槛)；仅按后台隐藏过滤。
      (p) => !backendHidden.includes(p.id),
    ),
    providerOrder,
    hiddenProviders,
    false,
    catalogOrder,
  );
  // 未登录：免费体验(anon)恒置顶(稳定排序，其余相对序不变)——访客第一眼就是免费体验，也是唯一可用项。
  const providerList = [...providerListRaw.filter(p=>p.id==="wuwei-free"), imagePreset, ...providerListRaw.filter(p=>p.id!=="wuwei-free")];
  const curPreset = imageMode ? imagePreset : providerList.find((p) => p.id === curProviderId);
  const selectedModelKey = imageMode ? `wuwei-image/${displayModel}` : `${curProviderId}/${meta.model}`;
  const imageBillingScopeRef = useRef({ sid: currentId, user: wuwei?.user.id, model: selectedModelKey });
  const imageBillingToolsRef = useRef(new Map<string, object>());
  if (imageBillingScopeRef.current.sid !== currentId || imageBillingScopeRef.current.user !== wuwei?.user.id || imageBillingScopeRef.current.model !== selectedModelKey) {
    imageBillingScopeRef.current = { sid: currentId, user: wuwei?.user.id, model: selectedModelKey };
    imageBillingToolsRef.current.clear();
  }
  const pickerCatalog = (catalog || []).filter((provider) => providerList.some((p) => p.id === provider.id));
  const extraConnections = providerList.filter((p) => !p.hosted && !pickerCatalog.some((row) => row.id === p.id)).map((p) => ({
    id: p.id, hosted: false, sort: 999, label: p.label, labelEn: p.labelEn,
    models: [...new Set([...p.models, ...(liveModels[p.id] || []), ...(p.id === curProviderId ? [meta.model] : [])])].filter((m) => m && m !== "…").map((id) => ({ id, label: id, free: false })),
  }));
  const pickerChoices: ModelChoice[] = [
    ...catalogModelChoices([...pickerCatalog, ...extraConnections], selectedModelKey),
    ...imageChoices.map((row, index) => ({ key: `wuwei-image/${row.sku_id}`, providerId: "wuwei-image", modelId: row.sku_id,
      label: imageModelLabel(row), labelEn: imageModelLabel(row), category: "images" as const, rank: index, recommended: false, defaultForNewUsers: false,
      free: false, needsLogin: true, imageModel: row.model,
      imageQuality: imageCatalog.filter(entry => entry.model === row.model).sort((a,b) => a.coins_per_image-b.coins_per_image)[0]?.quality,
      imageCoins: Math.min(...imageCatalog.filter((entry) => entry.model === row.model).map((entry) => entry.coins_per_image)),
    })),
  ];
  const selectedChoice = pickerChoices.find((choice) => choice.key === selectedModelKey);
  const pickerChoicesRef = useRef(pickerChoices);
  pickerChoicesRef.current = pickerChoices;
  const providerListRef = useRef(providerList);
  providerListRef.current = providerList;
  const [modelRetry, setModelRetry] = useState<{ sid: string; userId: string | null; key: string; text: string; images: string[] } | null>(null);
  const quotaModelRef = useRef({ model: meta.model, free: freeModelIds.has(meta.model) });
  quotaModelRef.current = { model: meta.model, free: freeModelIds.has(meta.model) };
  usageLimitHandlerRef.current = (kind, message) => { void handleUsageLimit(kind, message); };
  useEffect(() => {
    // A response from before an account/session/model change cannot open a stale dialog.
    usageLimitRequestRef.current = null;
    setFreeCapModal(null); setCoinShortage(null);
  }, [wuwei?.user.id, currentId, selectedModelKey]);
  const selectedCategory = selectedChoice?.category ?? (imageMode ? "images" : curPreset?.hosted ? "premium" : "connections");
  const selectedCategoryLabel = MODEL_CATEGORIES.find((category) => category.id === selectedCategory)!;
  const closeModelPicker = () => {
    setShowProviderMenu(false); setShowModelMenu(false);
    setModelPickerCategory(undefined);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".mq-select")?.focus());
  };
  const modelDefaultRef = useRef<{ userId: string | null; handled: Set<string> }>({ userId: null, handled: new Set() });
  const modelDefaultSendRef = useRef<object | null>(null);
  if (modelDefaultRef.current.userId !== (wuwei?.user.id ?? null)) {
    modelDefaultRef.current = { userId: wuwei?.user.id ?? null, handled: new Set() };
    if (loginSendRef.current?.userId !== wuwei?.user.id) loginSendRef.current = null;
  }
  const modelDefaultScopeRef = useRef({ sid: currentId, empty: true, busy: false });
  modelDefaultScopeRef.current = { sid: currentId, empty: !items.some(item => item.type === 'user'), busy };
  const requestModelLogin = () => {
    setShowProviderMenu(false); setShowModelMenu(false);
    setLoginResume(false); setLoginIntroReason(null);
    setShowLoginIntro(false); setShowLoginForm(true);
  };
  async function selectModelChoice(choice: ModelChoice, automatic = false, premiumConfirmed = false): Promise<boolean> {
    const approved = premiumConfirmed ? choice : undefined;
    const resolveChoice = () => {
      const current = pickerChoicesRef.current.find(c => c.key === choice.key);
      if (!current) throw new Error('Model unavailable');
      return current;
    };
    if (!automatic && premiumSelectionNeedsConfirmation(resolveChoice(), approved)) {
      setModelPickerCategory('premium'); setShowModelMenu(false); setShowProviderMenu(true);
      return false;
    }
    const defaults = modelDefaultRef.current;
    const sid = currentIdRef.current;
    if (!automatic) defaults.handled.add(sid);
    if (automatic && defaults.handled.has(sid)) return false;
    if (choice.needsLogin && !wuweiRef.current) { requestModelLogin(); return false; }
    const r = await window.wuwei.getSettings(); const cur = r?.settings || {};
    if (modelDefaultRef.current !== defaults || currentIdRef.current !== sid) return false;
    choice = resolveChoice();
    if (!automatic && premiumSelectionNeedsConfirmation(choice, approved)) {
      setModelPickerCategory('premium'); setShowModelMenu(false); setShowProviderMenu(true);
      return false;
    }
    if (!automatic) setModelRetry(null);
    const userId = wuweiRef.current?.user.id;
    const choices = pickerChoicesRef.current;
    const remembered = userId ? rememberedModelChoice(choices, cur, userId) : undefined;
    if (automatic) {
      const scope = modelDefaultScopeRef.current;
      const hosted = providerListRef.current.find(p => p.id === cur.providerId)?.hosted === true || cur.providerId?.startsWith('wuwei-') === true;
      const target = userId ? remembered ?? recommendedValueModel(choices) : anonymousDefaultModel(choices);
      const eligible = userId ? !!remembered || shouldApplyEconomyDefault(cur, true, scope.empty, hosted) : hosted || !cur.providerId;
      if (defaults.handled.has(sid) || defaults.userId !== (userId ?? null) || scope.sid !== sid || scope.busy || !scope.empty || !eligible || target?.key !== choice.key) return false;
      defaults.handled.add(sid);
    }
    // A first-login default is not a preference. Only explicit signed-in
    // choices, including confirmed premium models, are remembered by account.
    const remember = !!userId && (!automatic || remembered?.key === choice.key);
    const modelPreferences = remember ? { ...(cur.modelPreferences || {}), [userId!]: { providerId: choice.providerId, modelId: choice.modelId } } : cur.modelPreferences;
    const modelChoiceExplicit = !automatic || remember;
    if (automatic && !cur.imageMode && cur.providerId === choice.providerId && cur.model === choice.modelId && (!remember || cur.modelPreferences?.[userId!])) return true;
    if (choice.category === "images") {
      if (!imageCatalog.some((row) => row.sku_id === choice.modelId)) throw new Error("Image model unavailable");
      window.wuwei.setSettings({ ...cur, modelPreferences, kind: "openai", providerId: "wuwei-free", baseUrl: WUWEI_GATEWAY_BASE, model: "glm-4.7-flash", apiKey: undefined, oauthToken: undefined, imageMode: true, imageSku: choice.modelId, modelChoiceExplicit });
      setCurProviderId("wuwei-free"); setImageMode(true); setImageSku(choice.modelId);
    } else {
      const provider = providerListRef.current.find((p) => p.id === choice.providerId);
      if (!provider) throw new Error("Provider unavailable");
      const slot = (cur.creds || {})[provider.id] || {};
      window.wuwei.setSettings({ ...cur, modelPreferences, kind: provider.kind, providerId: provider.id, model: choice.modelId, imageMode: false,
        apiKey: slot.apiKey, oauthToken: slot.oauthToken, baseUrl: provider.fixedBaseUrl ? provider.baseUrl : slot.baseUrl || provider.baseUrl, modelChoiceExplicit });
      setCurProviderId(provider.id); setImageMode(false); setRate(null);
    }
    if (!automatic) markFirstAction("switch_model");
    void window.wuwei.track?.("model_switch", { model: choice.modelId, provider: choice.providerId, category: choice.category, automatic });
    return true;
  }
  async function applyDefaultModel() {
    const defaults = modelDefaultRef.current;
    const sid = currentIdRef.current;
    if (defaults.handled.has(sid)) return;
    const r = await window.wuwei.getSettings();
    if (defaults !== modelDefaultRef.current || sid !== currentIdRef.current) return;
    const userId = wuweiRef.current?.user.id;
    const choice = userId ? rememberedModelChoice(pickerChoices, r?.settings || {}, userId) ?? recommendedValueModel(pickerChoices) : anonymousDefaultModel(pickerChoices);
    if (choice) await selectModelChoice(choice, true);
  }
  async function switchToRecommendedValue() {
    if (valueSwitchBusy) return;
    const choice = recommendedValueModel(pickerChoices);
    if (!choice) {
      setModelPickerCategory('economy'); setShowModelMenu(false); setShowProviderMenu(true);
      void refreshCatalog(); return;
    }
    if (choice.needsLogin && !wuwei) { requestModelLogin(); return; }
    setValueSwitchBusy(true);
    try {
      if (busy) window.wuwei.stop(currentId);
      if (!await selectModelChoice(choice)) return;
      setShowProviderMenu(false); setShowModelMenu(false);
    } catch {
      push({ type: 'notice', text: tr("ui.app.could.not.switch.models.please.choose.4392bcd") });
    } finally { setValueSwitchBusy(false); }
  }
  useEffect(() => {
    if (!wuweiReady || !catalogReady || !currentId || meta.model === "…" || busy) return;
    let alive = true;
    void (async () => {
      if (!items.some(item => item.type === 'user')) await applyDefaultModel();
      if (!alive) return;
      const pending = loginSendRef.current;
      if (pending && pending.userId === wuweiRef.current?.user.id && pending.sid === currentIdRef.current) {
        loginSendRef.current = null;
        doSend(pending.text, pending.images);
        clearComposer();
      }
    })().catch(() => { /* Keep the pending login send for a successful directory refresh. */ });
    return () => { alive = false; };
  }, [wuwei?.user?.id, wuweiReady, catalog, catalogReady, currentId, meta.model, items.length, busy]);

  // 动态实时模型(从平台 /models 拉)并入预设，去重；预设在前(保证旗舰置顶)，实时补充新模型；
  // 再并入当前生效的模型(meta.model)——自建端点等没有预设列表时，配好的模型也能在快切里看到/切换。
  const quickModels = [
    ...new Set(
      [...(curPreset?.models ?? []), ...(liveModels[curProviderId] || []), meta.model].filter(
        Boolean,
      ) as string[],
    ),
  ];
  // 切换模型下拉展示：常用=预设旗舰(+当前选中项)，全部=预设+实时拉取全量
  const commonModels = curPreset?.models ?? [];
  const shownModels = imageMode ? imagePreset.models : showAllModels
    ? quickModels
    : [...new Set([...commonModels, ...(meta.model && !commonModels.includes(meta.model) ? [meta.model] : [])])];
  const hasMoreModels = !imageMode && quickModels.length > commonModels.length;
  // 连通状态检测：更新状态灯（红/黄/绿）
  async function runConnCheck() {
    const seq = ++connCheckSeqRef.current;
    setConn({ status: "checking", reason: tr("ui.app.checking.connection.ab4a5e8") });
    try {
      const r = await window.wuwei.checkConn();
      if (seq !== connCheckSeqRef.current) return;
      setConn(r);
      // 需登录/配 Key 的平台(非托管)一旦红灯且属「缺凭证/未授权」→ 主动亮一键授权引导条，
      // 别让用户对着红灯反复重试却不知道要先登录(线上见过选 Codex 没登录 ChatGPT 就卡死循环)。
      if (!imageModeRef.current && r.status === "red" && curPreset && !curPreset.hosted && isAuthErrorText(r.reason || "")) {
        setNeedAuth(true);
        setAuthDismissed(false);
      }
      // 产品行为埋点：模型连通检测结果(green=通/其它=不通)，诊断「选了模型能不能用」
      void window.wuwei.track?.("model_connect", { ok: r.status === "green", status: r.status }, r.reason?.slice(0, 500));
    } catch {
      if (seq !== connCheckSeqRef.current) return;
      setConn({ status: "yellow", reason: tr("ui.app.check.failed.please.retry.85b1dfd") });
    }
  }
  useEffect(() => { if (imageMode) void runConnCheck(); }, [imageMode, imageSku, wuwei?.user?.id, lang]);

  // ——— API Key 平台：一键获取 → 复制自动检测 → 通了自动设置 ———
  // 把验证过的 key 存进当前平台槽并切换生效
  async function saveApiKeyToSettings(key: string) {
    const r = await window.wuwei.getSettings();
    const s = r?.settings || {};
    const pid = s.providerId || curProviderId;
    const creds = { ...(s.creds || {}) };
    creds[pid] = { ...(creds[pid] || {}), apiKey: key };
    window.wuwei.setSettings({ ...s, apiKey: key, oauthToken: undefined, creds });
  }

  // 试一个候选 key：先测连通，通了才落库+提示成功。silent=剪贴板自动检测时不打扰
  async function tryApiKey(candidate: string, silent = false): Promise<boolean> {
    const key = (candidate || "").trim();
    if (!key || keyTestingRef.current) return false;
    keyTestingRef.current = true;
    setApiKeyBusy(true);
    try {
      const res = await window.wuwei.testKey(key);
      if (res.ok) {
        await saveApiKeyToSettings(key);
        push({ type: "notice", text: tr("ui.app.api.key.verified.and.set.ready.57a34af") });
        setNeedAuth(false);
        setAuthDismissed(false);
        setApiKeyStep("idle");
        setApiKeyInput("");
        setConn({ status: "green", reason: tr("ui.app.connected.ready.anytime.59dfee3") });
        return true;
      }
      if (keyRejected(res.reason)) {
        // 真·鉴权失败：Key 无效，不保存
        if (!silent) push({ type: "notice", text: (tr("ui.app.this.key.is.invalid.auth.failed.c7e5715")) + res.reason });
        return false;
      }
      // Key 有效但请求未通过(余额/额度/账单等)：照样保存，给提醒；灯转黄
      await saveApiKeyToSettings(key);
      push({
        type: "notice",
        text: (tr("ui.app.key.saved.valid.but.the.request.cfdb53e")) + res.reason,
      });
      setNeedAuth(false);
      setAuthDismissed(false);
      setApiKeyStep("idle");
      setApiKeyInput("");
      setConn({ status: "yellow", reason: res.reason });
      return true;
    } finally {
      keyTestingRef.current = false;
      setApiKeyBusy(false);
    }
  }

  // 点「去获取 API Key」：打开官网 + 进入等待态(启动剪贴板自动检测)
  function startApiKeyFlow() {
    if (curPreset?.keyUrl) window.wuwei.openExternal(curPreset.keyUrl);
    lastClipRef.current = "";
    setApiKeyInput("");
    setApiKeyStep("awaiting");
  }

  // Authorization saves credentials; it must not implicitly select a Claude model.
  async function saveClaudeToken(tok: string) {
    const r = await window.wuwei.getSettings();
    const s = r?.settings || {};
    const creds = { ...(s.creds || {}) };
    creds["claude-oauth"] = { ...(creds["claude-oauth"] || {}), oauthToken: tok };
    window.wuwei.setSettings({ ...s, creds, ...(s.providerId === "claude-oauth" ? { oauthToken: tok } : {}) });
    push({ type: "notice", text: tr("ui.app.claude.subscription.authorized.please.resend.your.3550c14") });
    setNeedAuth(false); // 授权完成，收起授权条
    setAuthDismissed(false);
    setOauthStep("idle");
  }

  // 应用内弹窗授权(自行输账号密码，自动捕获)
  async function authorizeWindow() {
    if (authBusy) return;
    setAuthBusy(true);
    try {
      const tok = await window.wuwei.claudeLogin();
      if (tok) await saveClaudeToken(tok);
      else push({ type: "notice", text: tr("ui.app.authorization.didn.complete.cancelled.timeout.you.e39f2d6") });
    } finally {
      setAuthBusy(false);
    }
  }

  // 系统浏览器授权 第1步：开浏览器(复用已登录 Google)，进入「等回填授权码」态
  async function authorizeBrowser() {
    await window.wuwei.claudeOauthOpen();
    setCodeInput("");
    setOauthStep("awaiting-code");
    push({
      type: "notice",
      text: tr("ui.app.opened.the.authorization.page.in.your.8cdbf30"),
    });
  }

  // 系统浏览器授权 第2步：用授权码换 token（输入框留空则自动读剪贴板）
  async function completeBrowserAuth() {
    if (authBusy) return;
    setAuthBusy(true);
    try {
      let code = codeInput.trim();
      if (!code) code = (await window.wuwei.readClipboard()).trim();
      if (!code) {
        push({ type: "notice", text: tr("ui.app.no.code.found.copy.the.authorization.3b1576c") });
        return;
      }
      const tok = await window.wuwei.claudeOauthExchange(code);
      if (tok) await saveClaudeToken(tok);
      else push({ type: "notice", text: tr("ui.app.the.code.is.invalid.or.expired.0b5df91") });
    } finally {
      setAuthBusy(false);
    }
  }

  // 每会话绑定模型：切到某会话时，把它记住的平台+模型完整应用(和 quickProvider 同套逻辑，
  // 从 PRESETS 取 kind/baseUrl、从 creds 取 key/token，避免只换 providerId 导致 invalid_token)。
  async function applyBoundModel(providerId?: string, model?: string) {
    if (!providerId && !model) return;
    const r = await window.wuwei.getSettings();
    const cur = { ...(r?.settings || {}), imageMode: false };
    if (r?.settings?.imageMode) { setImageMode(false); window.wuwei.setSettings(cur); }
    // 已经就是它 → 不重复切(避免 setSettings 抖动)
    if ((!providerId || cur.providerId === providerId) && (!model || cur.model === model)) return;
    if (providerId && cur.providerId !== providerId) {
      const p = providerListRef.current.find(x => x.id === providerId);
      if (p) {
        // A provider-only legacy binding is not an explicit premium choice.
        if (p.hosted && !p.anon && !model) return;
        const slot = (cur.creds || {})[providerId] || {};
        const boundModel = model || slot.model || defaultModelOf(p);
        if (!boundModel) return;
        window.wuwei.setSettings({
          ...cur,
          kind: p.kind,
          providerId,
          apiKey: slot.apiKey,
          oauthToken: slot.oauthToken,
          baseUrl: p.fixedBaseUrl ? p.baseUrl : slot.baseUrl || p.baseUrl,
          model: boundModel,
        });
        setCurProviderId(providerId);
        return;
      }
      // 平台不在预设(如自定义中转站)：连槽位一起带出，至少把 providerId/model/凭证换过去
      const slot = (cur.creds || {})[providerId] || {};
      if (!model && !slot.model) return;
      markFirstAction("switch_platform");
      void window.wuwei.track?.("platform_switch", { providerId, model: model || slot.model || cur.model });
      window.wuwei.setSettings({ ...cur, providerId, apiKey: slot.apiKey, oauthToken: slot.oauthToken, baseUrl: slot.baseUrl, model: model || slot.model });
      setCurProviderId(providerId);
      return;
    }
    // 同平台只换模型
    if (model && cur.model !== model) window.wuwei.setSettings({ ...cur, model });
  }

  // 切平台时该默认选哪个模型：未登录时跳过「需登录」的，选第一个免登录可用的。
  // 免费池顺序由后台 sort 决定，第一个未必 anon 可用(现在排头的 Nex N2.5 Pro 就需登录)——
  // 直接取 models[0] 会让未登录用户默认选中一个用不了的模型，发消息时才被自动切走，白多一次摩擦。
  function defaultModelOf(p: { id?: string; hosted?: boolean; anon?: boolean; models: string[] }): string | undefined {
    if (p.hosted && !p.anon) return recommendedValueModel(pickerChoicesRef.current.filter(c => c.providerId === p.id))?.modelId;
    if (p.anon) return anonymousDefaultModel(pickerChoicesRef.current.filter(c => c.providerId === p.id))?.modelId ?? p.models.find(m => m === 'openrouter-auto-free');
    return undefined;
  }
  // 快捷切换供应商：带出该平台已存的 key/baseUrl，默认用该平台第一个模型
  async function quickProvider(p: (typeof PRESETS)[number]) {
    // 访客门禁：未登录只能选「免费体验(anon)」，切到别的平台一律引导登录
    if (!wuwei && !p.anon) {
      setShowProviderMenu(false);
      setShowLoginIntro(true);
      return;
    }
    if (p.id === "wuwei-image") {
      setModelPickerCategory('images'); setShowModelMenu(false); setShowProviderMenu(true); return;
    }
    // Hosted platform lists can start with an expensive model. Use the same
    // recommended choice as login, instead of treating models[0] as a default.
    if (p.hosted && !p.anon) {
      await switchToRecommendedValue();
      return;
    }
    modelDefaultRef.current.handled.add(currentIdRef.current);
    const r = await window.wuwei.getSettings();
    const cur = r?.settings || {};
    setImageMode(false);
    const slot = (cur.creds || {})[p.id] || {};
    const targetModel = slot.model || defaultModelOf(p);
    if (!targetModel) { setModelPickerCategory('connections'); setShowModelMenu(false); setShowProviderMenu(true); return; }
    window.wuwei.setSettings({
      ...cur,
      kind: p.kind,
      providerId: p.id,
      imageMode: false,
      apiKey: slot.apiKey,
      oauthToken: slot.oauthToken,
      baseUrl: p.fixedBaseUrl ? p.baseUrl : slot.baseUrl || p.baseUrl,
      model: targetModel,
    });
    setRate(null); // 清掉上一个平台的订阅额度残留(余额类无 evt:ratelimits 不会覆盖)，新平台 emitAccount 会重推
    setCurProviderId(p.id);
    setShowProviderMenu(false);
  }
  // 免费模型 → 对应的「托管付费」模型：去掉 -free 后在各托管付费平台(hosted 且非 anon)里找同名，找不到返回 null
  // 在托管(非匿名)provider 里找带指定 model 的那个
  function findHostedModel(modelId: string): { provider: (typeof providerList)[number]; model: string } | null {
    for (const prov of providerList) {
      if (!prov.hosted || prov.anon) continue;
      if (modelId && prov.models?.includes(modelId)) return { provider: prov, model: modelId };
    }
    return null;
  }
  // 一键切到指定托管平台+模型(和 quickProvider 同套配置，但指定具体 model)
  async function switchToHosted(prov: (typeof providerList)[number], model: string) {
    const choice = pickerChoices.find(c => c.providerId === prov.id && c.modelId === model);
    if (choice) { await selectModelChoice(choice); return; }
    setModelPickerCategory('economy'); setShowModelMenu(false); setShowProviderMenu(true);
    void refreshCatalog();
  }

  // 启动即把当前界面语言同步进主进程 settings.app.lang → WUWEI_LANG，
  // 保证主进程 tt()/工具描述/系统提示默认从一开始就跟随界面语言（此后已持久化，下次启动即正确）。
  useEffect(() => {
    window.wuwei.setAppSettings({ lang: getLanguagePreference() });
  }, [lang]);

  // 自动更新：拿版本号 + 监听「发现新版下载中/已下载好」事件
  useEffect(() => {
    window.wuwei.getAppVersion().then(setAppVer).catch(() => {});
    const off = window.wuwei.onEvent((ch, p: any) => {
      // 发现新版 → 立刻在左下角显示「发现新版·下载中」(不只小红点)；下载好了换成「升级重启」
      if (ch === "evt:update-available") { setHasUpdate(true); setDlVer(p?.version || ""); setDlProgress((d) => d ?? { percent: 0, bytesPerSecond: 0 }); }
      else if (ch === "evt:update-progress") setDlProgress({ percent: Math.round(p?.percent ?? 0), bytesPerSecond: p?.bytesPerSecond ?? 0 });
      else if (ch === "evt:update-downloaded") { setHasUpdate(true); setDlProgress(null); setUpdateReady({ version: p?.version || "", notes: p?.notes || "" }); }
      else if (ch === "evt:tray-check-update") checkUpdateRef.current(); // 托盘菜单「检查更新」→ 走与账号菜单同一套检查流程
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 高价模型(托管 Claude/GPT)烧周额度过快提醒：跨过 50%/80% 时弹窗，建议切到更省的 DeepSeek/GLM Flash。
  // 每档每周只弹一次(按 resetsAt 分周，存 localStorage)；用户点「继续用」= 不再打扰这档。
  useEffect(() => {
    const wq = wuwei?.membership?.weeklyQuota;
    if (!wq?.active) return;
    // 仅无为托管平台：周额度是托管特有，用自己的 Claude/GPT 订阅号时不算周额度，不提醒。
    if (!curProviderId.startsWith("wuwei-")) return;
    // 高价模型按「模型名」判断(claude/gpt 家族)，不依赖具体 model id——托管目录后台动态下发。
    const pricey = /claude|gpt/i.test(meta.model || "");
    if (!pricey) return;
    const usedPct = Math.max(0, Math.min(100, 100 - wq.remainingPct));
    // 已耗尽(≥100%)时不弹「切便宜模型省着用」——没额度可省了，交给发消息时的付费窗处理
    if (usedPct >= 100) return;
    const threshold = usedPct >= 80 ? 80 : usedPct >= 50 ? 50 : 0;
    if (!threshold) return;
    const TEST_ALWAYS = false; // 每档每周只弹一次(按 resetsAt 分周去重)；测试时可临时改 true
    const key = `wuwei:quotaWarn:${wq.resetsAt || "na"}`;
    let shown: number[] = [];
    try { shown = JSON.parse(localStorage.getItem(key) || "[]"); } catch { /* ignore */ }
    if (!TEST_ALWAYS && shown.includes(threshold)) return;
    // 直接跨到 80% 时把 50 也一并标记，避免回落刷新再补弹 50 档
    const next = [...new Set([...shown, ...(threshold === 80 ? [50, 80] : [50])])];
    if (!TEST_ALWAYS) { try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ } }
    setQuotaWarn({ model: meta.model, usedPct, resetsAt: wq.resetsAt });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wuwei?.membership?.weeklyQuota?.remainingPct, wuwei?.membership?.weeklyQuota?.active, wuwei?.membership?.weeklyQuota?.resetsAt, meta.model, curProviderId]);

  // 定时刷新会员/余额(每90s + 窗口聚焦)：只在扣费时推送会导致免费模型使用期「本周额度%」长期显示旧值(不刷新)。
  useEffect(() => {
    const refresh = () => { void accountRefreshRef.current!.refresh(); };
    const iv = setInterval(refresh, 90_000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(iv); window.removeEventListener("focus", onFocus); };
  }, []);

  // 今日已签到判定：拿到账号数据后，若最近签到日=今天(UTC，与后端签到日一致)则按钮直接显「已签到」且禁用，不用点了才知道。
  useEffect(() => {
    const last = wuwei?.coin.lastSignin;
    if (last && last === new Date().toISOString().slice(0, 10)) setCheckinDone(true);
  }, [wuwei?.coin.lastSignin]);

  async function checkUpdateNow() {
    setShowAcctMenu(false); // 关菜单，结果用居中弹窗显示
    setUpdateMsg(tr("ui.app.checking.for.updates.ce6b51d"));
    const r = await window.wuwei.checkUpdate();
    if (r.available) {
      setHasUpdate(true);
      if (r.downloaded) {
        // 已下载好：直接弹「升级并重启」，不再停留在「下载中」
        setUpdateReady({ version: r.version || "", notes: r.notes || "" });
        setDlProgress(null);
        setUpdateMsg("");
        setShowUpdateModal(true);
      } else {
        setUpdateMsg(tr("ui.app.new.version.found.downloading.in.the.44e0ef9", { p0: r.version }));
      }
    }
    else setUpdateMsg(r.error ? (tr("ui.app.can.check.updates.right.now.dev.75ffe29")) : (tr("ui.app.you.re.on.the.latest.version.dffc458", { p0: appVer })));
  }
  // 托盘菜单从主进程事件触发检查更新：用 ref 持有最新闭包，避免 onEvent(空依赖)调到旧的 lang/appVer
  const checkUpdateRef = useRef(checkUpdateNow);
  checkUpdateRef.current = checkUpdateNow;

  // 消息中心未读数：启动拉一次 + 每 5 分钟轮询（登录后才有；未登录返回 0）。面板打开会置 0。
  useEffect(() => {
    let alive = true;
    const pull = () => window.wuwei.getMessages().then((r) => { if (alive) setMsgUnread(r?.unread || 0); }).catch(() => {});
    pull();
    const timer = setInterval(pull, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(timer); };
  }, [wuwei?.user?.id]);

  // 本地开发预览：独立于线上公告及已读状态，不调用公告 API。
  const [announcementPreview, setAnnouncementPreview] = useState<AnnouncementSource | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const preview = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail && ["titleZh", "bodyZh", "titleEn", "bodyEn"].some(key => typeof detail[key] === "string")) {
        setAnnouncementPreview(Object.fromEntries(["titleZh", "bodyZh", "titleEn", "bodyEn"].map(key => [key, typeof detail[key] === "string" ? detail[key] : ""])));
      }
    };
    let alive = true;
    let loading = false;
    const hotkey = async (event: KeyboardEvent) => {
      const primary = /Mac/i.test(navigator.platform)
        ? event.metaKey && !event.ctrlKey
        : event.ctrlKey && !event.metaKey;
      if (!primary || !event.shiftKey || event.altKey || (event.code !== "KeyN" && event.key.toLowerCase() !== "n") || event.isComposing || event.defaultPrevented) return;
      event.preventDefault();
      if (event.repeat || loading) return;
      loading = true;
      try {
        const { default: fixture } = await import("../../../tests/fixtures/announcement-current.json");
        if (!alive) return;
        window.dispatchEvent(new CustomEvent("wuwei:preview-announcement", {
          detail: fixture,
        }));
      } catch (error) {
        console.warn("DEV announcement fixture unavailable", error);
      } finally {
        loading = false;
      }
    };
    window.addEventListener("wuwei:preview-announcement", preview);
    window.addEventListener("keydown", hotkey);
    return () => {
      alive = false;
      window.removeEventListener("wuwei:preview-announcement", preview);
      window.removeEventListener("keydown", hotkey);
    };
  }, []);

  // Startup + reconnect/focus + low-frequency checks. Only explicit "Got it" marks read.
  useEffect(() => {
    const delivery = createAnnouncementDelivery({
      fetch: async () => {
        const [a, appVersion] = await Promise.all([window.wuwei.getAnnouncement(), window.wuwei.getAppVersion()]);
        return { ...a, appVersion };
      },
      storage: {
        getItem: key => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
      },
      show: setAnnounce,
    });
    announcementDeliveryRef.current = delivery;
    const refresh = () => { void delivery.check(); };
    const reconnect = () => { void delivery.check(true); };
    void delivery.check(true);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", reconnect);
    return () => {
      delivery.stop();
      announcementDeliveryRef.current = null;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", reconnect);
    };
  }, []);


  useEffect(() => {
    const off = window.wuwei.onEvent((ch, payload: any) => {
      // ⚠ 本 onEvent 是空依赖注册(见本 effect 末尾 }, [])，闭包冻结挂载时的 lang/t。用 ref 取最新语言/翻译，
      // 否则切换界面语言后，本 handler 里所有 lang===/friendlyError(…,t) 生成的提示与报错仍是挂载时旧语言。
      const lang = langRef.current;
      const t = tRef.current;
      // 看门狗心跳：任何来自某会话的事件都刷新它的「最后活动时间」，供自主推进兜底判定是否僵死
      { const asid = payload?.sid; if (asid) lastActivityRef.current.set(asid, Date.now()); }
      // 长命令心跳(evt:heartbeat)：只为刷新上面的活动时间而发，无其它语义——刷完即返回，别触发落定/switch
      if (ch === "evt:heartbeat") return;
      // 用户点了停止 → 主进程已摘掉该会话的自主推进，这里把「连推」切回「自动」。
      // 不这么做的话：软停只停当前这一轮，收尾后前端立刻又续下一轮，用户点多少次都追不上
      // (实测连点 5 次仍停不下来，表现就是"点停止没反应、界面像卡死")。
      if (ch === "evt:cont-off") {
        const csid = payload?.sid;
        if (csid && modeRef.current[csid] === "cont") setMode(csid, "auto");
        return;
      }
      // 结构性事件(工具/完成/切换…)前先把累积的流式文本落定，保证顺序不乱
      if (ch !== "evt:assistant-delta" && pendingDeltaRef.current) flushDelta(true); // 段落边界整段吐
      switch (ch) {
        case "evt:context-window":
          if (payload.sid && payload.sid !== currentIdRef.current) break;
          setServerCtxMax(0);
          setMeta((prev) => ({ ...prev, ctxWindow: payload.contextWindow }));
          break;
        case "evt:ready":
          setMeta(payload);
          setServerCtxMax(0); // 换了模型/平台，上一条链路学到的上限不再适用
          setApiKeyStep("idle"); // 切平台/模型：重置 key 等待态，避免残留
          setOauthStep("idle");
          void runConnCheck(); // 启动 / 切平台切模型后自动检测连通状态
          break;
        case "evt:sessions":
          setSessions(payload);
          break;
        case "evt:groups":
          setGroups(Array.isArray(payload) ? payload : []);
          break;
        case "evt:trash":
          setTrash(Array.isArray(payload) ? payload : []);
          break;
        case "evt:account":
          setAccount(payload);
          // 每会话绑定模型:切会话后主进程按会话切了平台→同步底栏当前平台(否则平台/模型下拉停在旧的)。
          // 值相同时 React 自动跳过，不会多余重渲染。
          if (payload?.providerId) setCurProviderId(payload.providerId);
          break;
        case "evt:wuwei-auth-expired":
          handleWuweiSessionExpired();
          break;
        case "evt:wuwei-me":
          setWuwei(payload); // 托管平台扣币后主进程推来的最新账号+余额
          setWuweiReady(true);
          break;
        case "evt:tasks":
          setRunningSet(new Set<string>(payload.running || []));
          break;
        case "evt:browser":
          setBrowserInfo(payload || {});
          break;
        case "evt:browser-activity":
          setShowBrowser(true); // AI 用浏览器时自动弹面板，实时可见
          break;
        case "evt:browser-detached":
          setBrowserDetached(!!payload);
          break;
        case "evt:session-loaded": {
          setCurrentId(payload.id);
          setServerCtxMax(0);
          if (payload.contextWindow) setMeta((prev) => ({ ...prev, ctxWindow: payload.contextWindow }));
          setAppView(null); // 切会话/新建对话 → 退出一人公司面板，露出对话界面
          setAgiView(null); // 数字婴儿面板同理
          // 搜索结果点进来的：目标不是底部而是命中那条 → 别吸底，交给下面的跳转 effect
          const jumping = jumpRef.current?.sid === payload.id;
          clearSearchHighlight(); // 上一次搜索的高亮不跨会话残留(要跳转的话下面会重新打)
          atBottomRef.current = !jumping; // 打开/切换会话：定位到最新(底部)，不用手滚
          forceBottomUntilRef.current = jumping ? 0 : Date.now() + 700; // 跳转时不吸底(=0)，交给跳转 effect
          setAwayFromBottom(false);
          setItems(messagesToItems(payload.messages));
          // 每会话绑定模型：切到该会话→用它上次绑定的平台/模型(渲染端切，带全 kind/鉴权，避免 invalid_token)
          if (payload.boundProviderId || payload.boundModel) void applyBoundModel(payload.boundProviderId, payload.boundModel);
          break;
        }
        case "evt:assistant-delta":
          if (payload.sid !== currentIdRef.current) break; // 只画当前可见会话
          charsRef.current += (payload.delta as string).length;
          turnTextRef.current += payload.delta; // 本轮全量正文(供悬停预览,instant 模式也能看到)
          pendingDeltaRef.current += payload.delta; // 累积，节流 flush
          scheduleFlush();
          break;
        case "evt:charter-progress":
          // 独立调研子会话的实时动作(搜什么/读哪页)→喂进弹窗进度条，不进聊天。持久化(收起/刷新可恢复)
          if (researchSidRef.current === payload.sid) {
            setResearchLive((prev) => {
              const live = { label: researchToolLabel(payload.name, payload.input, langRef.current), steps: (prev?.steps || 0) + 1 };
              saveResearchState(payload.sid, { researching: true, live });
              return live;
            });
          }
          break;
        case "evt:tool-start":
          if (payload.sid !== currentIdRef.current) break;
          if (payload.name === 'platform_imagegen' && payload.id) imageBillingToolsRef.current.set(payload.id, imageBillingScopeRef.current);
          push({ type: "tool", id: payload.id, name: payload.name, input: payload.input, status: "running" });
          break;
        case "evt:tool-end":
          if (payload.sid !== currentIdRef.current) break;
          if (imageBillingToolsRef.current.get(payload.id) === imageBillingScopeRef.current) {
            imageBillingToolsRef.current.delete(payload.id);
            if (imageToolBalanceFailure('platform_imagegen', payload.result, payload.isError === true)) {
              usageLimitHandlerRef.current('balance', tr("ui.app.not.enough.quota.and.coins.to.956023b"));
            }
          }
          setItems((p) => {
            // 优先按 id 精确匹配(并行时多个 running)；无 id 时回退到最后一个 running
            let real = payload.id
              ? p.findIndex((i) => i.type === "tool" && (i as any).id === payload.id)
              : -1;
            if (real === -1) {
              const idx = [...p].reverse().findIndex((i) => i.type === "tool" && i.status === "running");
              if (idx === -1) return p;
              real = p.length - 1 - idx;
            }
            const c = [...p];
            c[real] = { ...(c[real] as any), result: payload.result, isError: payload.isError, status: "done", image: payload.image || (c[real] as any).image };
            return c;
          });
          break;
        case "evt:permission-resolved":
          setPending(previous => previous?.id === payload.id ? null : previous);
          break;
        case "evt:ask-resolved":
          setAsks(previous => { if (previous[payload.sid]?.id !== payload.id) return previous; const next = { ...previous }; delete next[payload.sid]; return next; });
          break;
        case "evt:permission-request":
          // manual 模式每步问；auto/cont 自动放行(等价旧 autoMode)。按发起会话的模式判。
          if (modeOf(payload.sid || currentIdRef.current) !== "manual" || alwaysAllowRef.current.has(payload.name))
            window.wuwei.respondPermission(payload.id, "allow");
          else setPending(payload);
          break;
        case "evt:ceo-deciding": {
          // CEO 把关：员工请示后 CEO 正在拍板(或拍完)。拍完就清，拍完后若升级到董事长，evt:ask-user 紧随而来。
          const csid = payload.sid || currentIdRef.current;
          if (payload.done) {
            setCeoDeciding((m) => { if (!(csid in m)) return m; const n = { ...m }; delete n[csid]; return n; });
          } else {
            const sec = Math.max(1, Number(payload.sec) || 10);
            setCeoDeciding((m) => ({ ...m, [csid]: { ceoName: payload.ceoName || tr("team.default.wj-ceo.title"), askerName: payload.askerName || "", until: Date.now() + sec * 1000 } }));
          }
          break;
        }
        case 'evt:decision-request':
          if (shouldAutoApproveToolPermission(payload, modeRef.current, alwaysAllowRef.current, defaultModeRef.current)) {
            window.wuwei.respondDecision(payload.permId, { action: 'allow' });
          } else {
            setToolDecisions(previous => ({ ...previous, [payload.permId]: payload }));
          }
          break;
        case 'evt:decision-resolved':
          setToolDecisions(previous => { const next = { ...previous }; delete next[payload.permId]; return next; });
          break;
        case "evt:ask-user": {
          // AI 请用户选择：按发起会话 id 存。当前会话→直接弹框；别的会话→右上角通知，不打断当前对话。
          const askSid = payload.sid || currentIdRef.current;
          // 该会话 CEO 把关结束(升级到了董事长)→ 清掉「拍板中」提示，换成选择框。
          setCeoDeciding((m) => { if (!(askSid in m)) return m; const n = { ...m }; delete n[askSid]; return n; });
          setAsks((m) => ({ ...m, [askSid]: { id: payload.id, questions: payload.questions || [], decision: payload.decision === true } }));
          const isCur0 = askSid === currentIdRef.current;
          // 后台会话到点自答的公共动作(当前会话交给 AskModal 的可见倒计时)
          const bgAutoAnswer = (sec: number) => {
            if (sec <= 0) return;
            window.setTimeout(() => {
              setAsks((m) => {
                if (modeOf(askSid) !== "cont" || m[askSid]?.id !== payload.id) return m; // 关闭继续/已被人回答时别抢
                const qs = m[askSid].questions || [];
                window.wuwei.answerAsk(payload.id, {
                  list: qs.map(() => ({ selected: [], text: tr("ui.app.you.decide.based.on.the.overall.f7b0fe6") })),
                });
                const n = { ...m }; delete n[askSid]; return n;
              });
            }, sec * 1000);
          };
          // 智能继续 cont 模式：红线判定分两种方式
          if (!payload.decision && modeOf(askSid) === "cont") {
            if (redlineModeRef.current === "smart") {
              // 智能识别：先让 LLM 判"自主答会不会真触发危险动作"，结果存 askRisk 给 AskModal 用
              setAskRisk((r) => ({ ...r, [payload.id]: { pending: true, risky: false, reason: "" } }));
              window.wuwei.judgeAskRisk?.(payload.questions || [], stopRulesRef.current)
                .then((v) => {
                  setAskRisk((r) => ({ ...r, [payload.id]: { pending: false, risky: !!v?.risky, reason: v?.reason || "" } }));
                  // 后台会话:安全题走普通倒计时;红线题走长倒计时(redlineAutoSec，0=永不自答)。都不干等。
                  if (!isCur0) bgAutoAnswer(v?.risky ? redlineAutoSecRef.current : askAutoSecRef.current);
                })
                .catch(() => setAskRisk((r) => ({ ...r, [payload.id]: { pending: false, risky: false, reason: "" } })));
            } else if (!isCur0) {
              // 关键词匹配 + 后台会话：不碰红线到点自答；碰红线走长倒计时(不干等)
              const kwSec = askAutoSecFor(payload.questions || [], askAutoSecRef.current, stopRulesRef.current);
              const isRed = !!riskyHitOf(payload.questions || [], stopRulesRef.current);
              bgAutoAnswer(isRed ? redlineAutoSecRef.current : kwSec);
            }
          }
          if (askSid !== currentIdRef.current) {
            const title = sessionsRef.current.find((s) => s.id === askSid)?.title || (tr("ui.app.another.chat.d6b9d9c"));
            setAskToasts((t) => [...t.filter((x) => x.sid !== askSid), { askId: payload.id, sid: askSid, title }]);
            // 自动消失：按设置的开关与秒数(关掉则常驻，直到点开/✕忽略)
            if (askToastAutoRef.current) {
              window.setTimeout(() => dropToast(payload.id), Math.max(1, askToastSecRef.current) * 1000);
            }
          }
          break;
        }
        case "evt:usage":
          if (payload.sid !== currentIdRef.current) break; // 只显示当前会话用量
          setUsage(payload.usage);
          // 实时盖到本轮正在生成的最后一条助手气泡上：footer 悬停即见本轮 token(每完成一段就刷新)。
          // 仅当带 round(每步上报)才盖，避免 bootstrap/切会话的无 round 快照冲掉已有值。
          if (payload.usage?.round) {
            setItems((p) => {
              for (let k = p.length - 1; k >= 0; k--) {
                if (p[k].type === "assistant") {
                  const c = [...p];
                  c[k] = { ...(c[k] as any), usage: payload.usage };
                  return c;
                }
                if (p[k].type === "user") break; // 本轮还没出助手文字(如直接调工具)→先不盖，等出正文
              }
              return p;
            });
          }
          break;
        case "evt:ratelimits":
          setRate(payload);
          break;
        case "evt:charter-draft": {
          // 「调研并拟计划」跑完：把 AI 拟的调研/规则/计划回填到当前弹窗(仅当弹窗还开着且是同一会话)
          applyCharterDraft(payload.sid, payload.draft as import("./env").CharterDraft);
          break;
        }
        case "evt:suggest": {
          const sid = payload.sid;
          const cur = sid === currentIdRef.current;
          // 推理模型(z1 等)会带 <think>…</think>：只取思考后的正文当建议
          const go = splitThinking(payload.text || "").answer.trim();
          if (cur) {
            // 建议条/幽灵提示只画当前会话；后台会话不占屏幕，只在下面照常往下推进
            setSuggestion(go);
            lastSuggestRef.current = { text: go, canContinue: !!payload.canContinue, auto: false };
          }
          // 智能继续：只有"纯推进确认"(canContinue)才自动接话；危险/要你拿主意的一律停下。
          // 开没开看这个会话自己的模式——跟它在不在屏幕上无关，否则切走的会话就永远断在这儿。
          const n0 = contBySid.current.get(sid) || 0;
          if (modeOf(sid) !== "cont" || !go || (contMaxRef.current > 0 && n0 >= contMaxRef.current)) break;
          if (payload.canContinue) {
            if (cur) lastSuggestRef.current.auto = true;
            // 反悔窗口(设置里可调)：这期间你一打字或按停，autoContinue 里会再校验一次
            setTimeout(() => autoContinue(sid, go), Math.max(0, contDelayRef.current));
          } else if (
            // 判成 ASK 的兜底：只要这句本身不碰红线，就延时自动往下走；碰红线的才真停住等你
            askAutoSecFor([{ question: go, header: "", options: [] }], askAutoSecRef.current, stopRulesRef.current) > 0
          ) {
            const sec = Math.max(3, askAutoSecRef.current * 2);
            if (cur) setSuggestWait(sec); // 当前会话:屏上走秒，你随时能点"等我"
            else setTimeout(() => autoContinue(sid, go), sec * 1000); // 后台会话:静默等同样久再走
          }
          break;
        }
        case "evt:assistant-replace":
          // 清理泄漏工具调用/噪音后：把屏上那条 assistant 换成干净正文(为空则移除该气泡)
          if (payload.sid !== currentIdRef.current) break;
          flushDelta(true);
          setItems((p) => {
            const c = [...p];
            for (let k = c.length - 1; k >= 0; k--) {
              if (c[k].type === "assistant") {
                if ((payload.text || "").trim()) c[k] = { ...(c[k] as any), text: payload.text };
                else c.splice(k, 1); // 清理后无正文→去掉空气泡
                break;
              }
            }
            return c;
          });
          break;
        case "evt:compact":
          if (payload.sid !== currentIdRef.current) break;
          push({ type: "notice", text: tr("ui.app.context.compacted.messages.3f22c22", { p0: payload.before, p1: payload.after }) });
          break;
        case "evt:done":
          if (payload.sid === currentIdRef.current) thinkStartRef.current = null;
          setNeedAuth(false); // 成功完成一轮=鉴权已通，收起授权条
          setConn({ status: "green", reason: tr("ui.app.connected.ready.anytime.59dfee3") }); // 成功=绿灯
          break;
        case "evt:stopped":
          if (payload.sid !== currentIdRef.current) break;
          thinkStartRef.current = null;
          push({ type: "notice", text: tr("set.brain.exStopped") });
          break;
        case "evt:handoff":
          // 交接进度反馈:总结中(在源会话提示)/完成(已切到新会话)/失败
          if (payload.phase === "summarizing")
            push({ type: "notice", text: tr("ui.app.summarizing.valuable.content.generating.handoff.doc.ea52274") });
          else if (payload.phase === "done")
            push({ type: "notice", text: tr("ui.app.handoff.doc.ready.continuing.in.new.0be859f") });
          break;
        case "evt:error": {
          if (payload.sid && payload.sid !== currentIdRef.current) break;
          thinkStartRef.current = null;
          const rawMsg = String(payload.message ?? payload);
          const friendly = friendlyError(rawMsg, t, quotaModelRef.current.free);
          // 产品行为埋点：用中报错/限额（报错原文进 detail，供后台诊断分析）
          void window.wuwei.track?.("error_shown", { friendly: friendly.slice(0, 100) }, rawMsg.slice(0, 2000));
          // 服务端报了真实上限就记下来，占用条改按它算(比客户端按模型名猜准)
          const realLimit = parseServerCtxLimit(rawMsg);
          // Agent 主进程已学习并同步预算；报错本身不再单独改 UI 窗口。
          void realLimit;
          const loggedIn = !!wuweiRef.current;
          const limitKind = usageLimitKind(rawMsg, quotaModelRef.current.free);
          if (['invalid_token', 'no_token', 'anon_login_required', 'anon_not_allowed'].includes(gatewayCode(rawMsg))) {
            usageLimitRequestRef.current = null;
            wuweiRef.current = null; setWuwei(null);
            setFreeCapModal(null); setCoinShortage(null); setQuotaWarn(null);
            setNeedAuth(false); setUnavailModel(null);
            requestModelLogin();
            setConn({ status: 'yellow', reason: friendly });
            break;
          }
          let suppressInlineNotice = false;
          if (limitKind && loggedIn) {
            usageLimitHandlerRef.current(limitKind, friendly);
            suppressInlineNotice = true;
          } else if (!loggedIn && (limitKind || /free_trial_disabled|anon_login_required/i.test(rawMsg))) {
            setLoginIntroReason(
              /anon_login_required/i.test(rawMsg)
                ? "ui.app.sign.in.to.use.this.model.8ff2e81"
                : "ui.app.guest.free.quota.used.up.today.6a44a62",
            );
            setShowLoginIntro(true);
          }
          // 上游暂不可用(厂商抖动) → 记下当前模型，错误栏给「一键换到可用模型继续」，不让用户对着死路干等
          setUnavailModel(/upstream_error/i.test(rawMsg) ? quotaModelRef.current.model : null);
          // 去重：与上一条完全相同的出错提示不重复堆叠（免费次数用完已弹窗→不再叠 inline）
          if (!suppressInlineNotice) setItems((p) => {
            const last = p[p.length - 1];
            if (last && last.type === "notice" && last.text === friendly) return p;
            return [...p, { type: "notice", text: friendly, rawError: rawMsg, freeModel: quotaModelRef.current.free }];
          });
          // 订阅平台(Codex/Claude 订阅)没登录时，上游常回 404「page not found」/ 未授权——不是标准 401，
          // 走不到 isAuthErrorText 就只甩一句生僻报错，用户不知道要登录。这里补判：订阅平台 + 连接类失败 → 也当缺授权。
          const subNoLogin =
            (curPreset?.kind === "codex" || curPreset?.kind === "anthropic-oauth") &&
            /\b404\b|not found|page not found|no credentials|isn't authorized|not authorized/i.test(rawMsg);
          // 鉴权类错误：授权条常驻(重置手动关闭态，让它重新出现)；灯转红/黄
          if (isAuthErrorText(friendly) || subNoLogin) {
            setNeedAuth(true);
            setAuthDismissed(false);
            setConn({ status: "red", reason: friendly });
          } else {
            setConn({ status: "yellow", reason: friendly }); // 已配置但报错
          }
          break;
        }
      }
    });
    return () => {
      off?.(); // 卸载事件监听，防 HMR/重挂载叠加导致事件被重复处理
      if (flushTimerRef.current != null) clearTimeout(flushTimerRef.current);
    };
  }, []);

  useEffect(() => {
    // 强制窗内(刚切会话/刚发消息)无条件吸底；否则只有用户本来就贴着底部时才吸，往上滚看历史时不打扰
    const forcing = () => Date.now() < forceBottomUntilRef.current;
    if (!forcing() && !atBottomRef.current) return;
    const el = streamRef.current;
    if (!el) return;
    const toBottom = () => el.scrollTo({ top: el.scrollHeight });
    toBottom();
    // 二次校正：长会话/代码高亮/图片会在下一帧改变高度，再吸一次确保真到底
    requestAnimationFrame(() => {
      if (forcing() || atBottomRef.current) toBottom();
    });
    // 仅在强制窗内挂多帧兜底：切会话/发消息后内容(markdown/代码高亮/图片)会持续改变高度，
    // 多吸几次才能稳稳停在最新消息。流式输出时 items 高频变化，这里不能无条件挂定时器。
    if (!forcing()) return;
    const timers = [50, 130, 260, 450, 650].map((ms) =>
      setTimeout(() => {
        if (forcing() || atBottomRef.current) toBottom();
      }, ms),
    );
    return () => timers.forEach(clearTimeout);
  }, [items, busy, pending]);

  // 搜索结果点进来：会话渲染好后滚到命中的那条消息，并把关键词高亮出来。
  // 和上面的「切会话吸底」互斥(session-loaded 里跳转时已把 forceBottomUntil 置 0、atBottom 置 false)。
  useEffect(() => {
    const jump = jumpRef.current;
    if (!jump || jump.sid !== currentId) return;
    const el = streamRef.current;
    if (!el || !items.length) return;
    jumpRef.current = null;
    atBottomRef.current = false;
    let stopped = false;
    let lastH = -1;
    let stable = 0;
    const t0 = Date.now();
    // markdown / 代码高亮 / 图片会连续几帧改高度，反复对齐直到高度稳定或超时
    const step = () => {
      if (stopped) return;
      const target =
        el.querySelector<HTMLElement>(`[data-anchor="${jump.anchor}"]`) ||
        el.querySelector<HTMLElement>(`[data-anchor^="${jump.anchor.split(":")[0]}:"]`);
      if (target) {
        target.classList.add("search-flash");
        const first = highlightMatches(target, jump.q); // 关键词整块高亮,返回第一处
        const box = (first || target).getBoundingClientRect();
        const cont = el.getBoundingClientRect();
        const delta = box.top - cont.top - el.clientHeight / 3; // 命中处落在视口上三分之一
        if (Math.abs(delta) > 2) el.scrollTop += delta;
        const h = el.scrollHeight;
        if (h === lastH) stable++;
        else {
          stable = 0;
          lastH = h;
        }
        if (stable >= 4) {
          window.setTimeout(() => target.classList.remove("search-flash"), 2400);
          return;
        }
      }
      if (Date.now() - t0 < 2000) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return () => {
      stopped = true;
    };
  }, [items, currentId]);

  useEffect(() => {
    setSuggestion(""); // 切换会话清掉上个会话的建议
  }, [currentId]);

  // 打开用量面板且当前是 Codex：拉取可用的免费限额重置次数
  useEffect(() => {
    if (!showUsage || curProviderId !== "codex") {
      setCodexResets(null);
      setResetConfirm(null);
      setResetMsg("");
      return;
    }
    window.wuwei.codexResetCredits().then((r) => {
      if (r.ok) setCodexResets({ availableCount: r.availableCount ?? 0, credits: r.credits ?? [] });
    });
  }, [showUsage, curProviderId]);
  const doConsumeReset = async (creditId: string) => {
    setResetConfirm(null);
    setResetMsg(tr("login.busyReset"));
    const r = await window.wuwei.codexConsumeReset(creditId);
    if (r.ok) {
      setResetMsg(tr("ui.app.reset.quota.refreshes.after.you.send.09207c1"));
      const rr = await window.wuwei.codexResetCredits();
      if (rr.ok) setCodexResets({ availableCount: rr.availableCount ?? 0, credits: rr.credits ?? [] });
    } else {
      setResetMsg((tr("ui.app.reset.failed.b71d291")) + (r.error || ""));
    }
  };

  // 平台切换后拉该平台实时模型列表(/models)，并入下拉；延迟一点等主进程 applySettings 落定
  useEffect(() => {
    if (!curProviderId) return;
    const t = setTimeout(() => {
      window.wuwei.fetchModels().then((ids) => {
        if (ids && ids.length) setLiveModels((m) => ({ ...m, [curProviderId]: ids }));
      });
    }, 400);
    return () => clearTimeout(t);
  }, [curProviderId]);

  useEffect(() => {
    window.wuwei.getAccount().then(setAccount);
    const revision = wuweiRevisionRef.current;
    window.wuwei
      .wuweiMe()
      .then((me) => {
        if (wuweiRevisionRef.current === revision) setWuwei(me);
        // 签到改为手动：点账号面板「签到」按钮才触发（见 doCheckin），登录不再自动签，
        // 这样点击时才真正到账并弹「+N credits」toast。
      })
      .catch(() => {})
      .finally(() => { if (wuweiRevisionRef.current === revision) setWuweiReady(true); });
    // 主动拉取当前后端/模型，避免 evt:ready 推送早于订阅被丢导致显示「…」
    window.wuwei.getSettings().then((r: any) => {
      if (r?.backend) setMeta(m => m.model === '…' ? { ...m, backend: r.backend, model: r.model || m.model } : m);
    });
    // 主动拉取会话列表+当前会话，避免启动推送早于监听导致空白页(需发消息才加载的bug)
    window.wuwei.bootstrap().then((r) => {
      if (!r) return;
      setSessions(r.sessions || []);
      setGroups(r.groups || []);
      if (r.currentId) setCurrentId(r.currentId);
      atBottomRef.current = true; // 初次打开：定位到最新(底部)
      setAwayFromBottom(false);
      setItems(messagesToItems(r.messages || []));
      if (r.usage) setUsage(r.usage);
      if (r.rateLimits) setRate(r.rateLimits);
      if (r.interrupted?.length) setInterruptedSessions(r.interrupted); // 上次被强杀的任务→提示恢复
    });
  }, []);

  // 崩溃恢复：点「继续」让 AI 接着未完成的工作；点「忽略」只清标记。
  function resumeInterrupted(id: string) {
    window.wuwei.resumeSession(id);
    setInterruptedSessions((l) => l.filter((x) => x.id !== id));
  }
  function dismissInterrupted(id: string) {
    window.wuwei.dismissInterrupted(id);
    setInterruptedSessions((l) => l.filter((x) => x.id !== id));
  }

  // API Key 等待态：轮询剪贴板，检测到像 key 的新内容就自动验证+设置(零手填)
  useEffect(() => {
    if (apiKeyStep !== "awaiting") return;
    const timer = setInterval(async () => {
      if (keyTestingRef.current) return;
      const clip = (await window.wuwei.readClipboard()).trim();
      if (!clip || clip === lastClipRef.current || !isLikelyKey(clip)) return;
      lastClipRef.current = clip;
      setApiKeyInput(clip);
      await tryApiKey(clip, true); // 静默：不通就继续等，通了自动完成
    }, 1200);
    return () => clearInterval(timer);
  }, [apiKeyStep]);

  // 点用量面板外部时自动关闭
  useEffect(() => {
    if (!showUsage) return;
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".usage-panel") && !t.closest(".usage-btn")) setShowUsage(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showUsage]);

  // 拖动侧边栏右边缘调宽度
  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWRef.current;
    const move = (ev: MouseEvent) => {
      const w = Math.min(420, Math.max(170, startW + ev.clientX - startX));
      setSidebarW(w);
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      localStorage.setItem("wuwei-sidebar-w", String(sidebarWRef.current));
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  // 拖动一人公司面板下边缘调高度(上下)。未设过时以当前实际渲染高度为起点，拖动即固定
  function startToolsResize(e: React.MouseEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const el = (e.currentTarget as HTMLElement).previousElementSibling as HTMLElement | null;
    const startH = el ? el.getBoundingClientRect().height : 220;
    let expandedByDrag = false;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    const move = (ev: MouseEvent) => {
      // 收起时不占用保存的高度；向下拖动分界线可重新展开。
      if (!teamExpanded && !expandedByDrag) {
        if (ev.clientY - startY < 8) return;
        expandedByDrag = true;
        setTeamExpanded(true);
        localStorage.setItem("wuwei-team-expanded", "1");
      }
      const h = Math.min(Math.round(window.innerHeight * 0.72), Math.max(72, startH + ev.clientY - startY));
      toolsHRef.current = h;
      setToolsH(h);
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem("wuwei-tools-h", String(toolsHRef.current));
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  // 顶部图标收/展某一块：不能两块都收(至少留一个)。收起后另一块自动满高。
  function toggleSidePanel(which: "team" | "chats") {
    if (which === "team") {
      const next = !showTeam;
      if (!next && !showChats) return;
      setShowTeam(next);
      localStorage.setItem("wuwei-side-show-team", next ? "1" : "0");
    } else {
      const next = !showChats;
      if (!next && !showTeam) return;
      setShowChats(next);
      localStorage.setItem("wuwei-side-show-chats", next ? "1" : "0");
    }
  }

  function toggleCollapse(v: boolean) {
    setCollapsed(v);
    localStorage.setItem("wuwei-sidebar-collapsed", v ? "1" : "0");
  }

  // 读取图片文件为 dataURL(过大自动缩到长边1568，避免超长截图被 API 拒)
  function addFiles(files: FileList | File[]) {
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      readImageDownscaled(f).then((url) => setPendingImages((p) => [...p, url])).catch(() => {});
    }
  }

  // 真正发送一条(立即入队跑)
  function doSend(text: string, imgs: string[]) {
    const sid = currentIdRef.current;
    const userId = wuweiRef.current?.user.id;
    if (userId && modelDefaultScopeRef.current.empty && selectedCategory !== 'connections' && !modelDefaultRef.current.handled.has(sid)) {
      if (modelDefaultSendRef.current) return;
      const request = {};
      modelDefaultSendRef.current = request;
      void applyDefaultModel().then(() => {
        if (currentIdRef.current !== sid || wuweiRef.current?.user.id !== userId) return;
        if (modelDefaultRef.current.handled.has(sid)) doSend(text, imgs);
        else { push({ type: 'notice', text: tr("ui.app.loading.models.please.try.again.shortly.705bbba") }); void refreshCatalog(); }
      }).catch(() => {
        push({ type: 'notice', text: tr("ui.app.could.not.load.the.recommended.model.bb5ca8b") });
      }).finally(() => { if (modelDefaultSendRef.current === request) modelDefaultSendRef.current = null; });
      return;
    }
    modelDefaultRef.current.handled.add(currentIdRef.current);
    setUnavailModel(null); // 新发/重发即清「上游不可用」提示
    markFirstAction("send_input");
    // 每次发消息都埋点(behavior)：字数/是否带图/平台·模型，供分析活跃与使用深度
    void window.wuwei.track?.("send_message", { len: (text || "").length, images: imgs.length, provider: curProviderId, model: meta.model });
    // 发消息时顺带静默检测新版本（节流 2 分钟）——多一个触发点，发现新版即在药丸提示，不弹检查窗
    if (Date.now() - lastUpdCheck.current > 120000) { lastUpdCheck.current = Date.now(); void window.wuwei.checkUpdate?.().catch(() => {}); }
    if (text) {
      history.current.push(text);
      histIdx.current = history.current.length;
    }
    push({ type: "user", text, images: imgs.length ? imgs : undefined, ts: Date.now() });
    atBottomRef.current = true; // 发新消息=想看这轮回复：重新贴底,后续流式自动吸底(哪怕刚才滚上去看历史)
    forceBottomUntilRef.current = Date.now() + 700; // 多帧兜底吸底：AI 回复开始撑高度/异步渲染时也稳稳落到最新，不用手滚一下
    setAwayFromBottom(false);
    setRunningSet((s) => new Set(s).add(currentId)); // 乐观置为运行中(主进程随后 evt:tasks 校准)
    thinkStartRef.current = Date.now();
    charsRef.current = 0;
    turnTextRef.current = ""; // 新一轮:清掉上轮预览缓冲
    window.wuwei.send(currentId, text, imgs.length ? imgs : undefined);
  }

  // —— 智能继续：自动接话 ——
  const runningSetRef = useRef(runningSet); runningSetRef.current = runningSet;
  const lastActivityRef = useRef<Map<string, number>>(new Map()); // 各会话最后一次收到事件的时刻，自主推进看门狗判僵死用
  // 自主推进看门狗可配参数(秒)：巡检间隔 + 判停阈值(无活动多久判卡住并自动续)。存 localStorage，设置里可改
  const [wdIntervalSec, setWdIntervalSec] = useState(() => { const v = Number(localStorage.getItem("wuwei-wd-interval")); return v >= 10 ? v : 40; });
  const [wdIdleSec, setWdIdleSec] = useState(() => { const v = Number(localStorage.getItem("wuwei-wd-idle")); return v >= 20 ? v : 30; });
  const wdIdleRef = useRef(wdIdleSec); wdIdleRef.current = wdIdleSec;
  const inputRef = useRef(input); inputRef.current = input;
  const suggestionRef = useRef(suggestion); suggestionRef.current = suggestion;
  // 后台会话没有输入框/建议条，直接投递给它自己的 sid，不碰当前屏幕。
  // (只在最后落笔前再校验一次各种闸门，因为从收到建议到真发出去中间隔着"反悔窗口")
  const autoContinue = async (sid: string, text: string) => {
    const go = (text || "").trim();
    if (!go || !sid) return;
    if (modeOf(sid) !== "cont") return; // 这期间被关掉了智能继续/点了暂停
    if (runningSetRef.current.has(sid)) return; // 它又跑起来了(用户手动发了/上一轮还没完)
    const cur = sid === currentIdRef.current;
    if (cur && inputRef.current.trim()) return; // 当前会话:你正在打字就别抢
    const n = (contBySid.current.get(sid) || 0) + 1;
    if (contMaxRef.current > 0 && n > contMaxRef.current) return; // 连推轮数封顶(0=不限)
    // 权威确认:主进程 runs 才是唯一裁判。它若还在跑就直接返回——不画气泡、不发送,从根上杜绝"孤儿气泡"
    // (看门狗按时序误判、乐观清了 runningSet 也没用,这里以主进程真实态为准)。查不到(老版本)就按老逻辑继续。
    try { if (await window.wuwei.isRunning?.(sid)) return; } catch { /* ignore */ }
    // await 之后状态可能已变,关键闸门再校验一次
    if (modeOf(sid) !== "cont" || runningSetRef.current.has(sid)) return;
    if (cur && inputRef.current.trim()) return;
    contBySid.current.set(sid, n);
    setRunningSet((s) => new Set(s).add(sid)); // 乐观置运行中(主进程随后 evt:tasks 校准)
    if (cur) {
      setContN(n);
      setSuggestion("");
      // 关键:自主推进≠用户意图看回复。只有你本来就贴着底时才继续吸底；
      // 你滚上去看历史时(atBottomRef=false)绝不把你拽回底部，随它在下面自己更新。
      if (atBottomRef.current) {
        forceBottomUntilRef.current = Date.now() + 700;
        setAwayFromBottom(false);
      }
      thinkStartRef.current = Date.now();
      charsRef.current = 0;
      turnTextRef.current = "";
      push({ type: "user", text: go, ts: Date.now() }); // 只有看得见的会话才画气泡
    }
    window.wuwei.send(sid, go, undefined, true); // auto=true:软续跑,主进程若发现该会话还在跑就静默跳过(不报错刷屏)
  };
  // 自主推进看门狗：定时兜底「不看就停」。开着智能继续(cont)的会话若长时间无任何流式活动
  // (单轮报错断链 / 后台 setTimeout 被节流 / 主进程僵死)，就自动朝总目标续上，不靠某一次性调度。
  // 静默阈值分两档：主进程已停(非 running)90s 即救(链断了，安全)；仍标 running 则等 240s(避免打断真在跑的长工具)。
  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now();
      const modes = modeRef.current;
      const idleMs = Math.max(20, wdIdleRef.current) * 1000; // 判停阈值(可配)
      for (const sid of new Set([...Object.keys(modes), ...lastActivityRef.current.keys()])) {
        if (modeOf(sid) !== "cont") continue; // 只兜「智能继续」的会话；用户点暂停/完成会切走该模式
        const last = lastActivityRef.current.get(sid) ?? 0;
        if (last === 0) continue; // 从没跑过 → 不动
        const running = runningSetRef.current.has(sid);
        // 正常在跑就别打扰：一轮在跑时(running)靠心跳/流式活动证明它还活着——工具执行期间每 25s 有心跳、
        // 流式输出有 delta，只要在动 now-last 就一直很小、绝不触发。只有「在跑却整整 10 分钟零活动」= 真卡死
        // 才介入恢复(极长命令也早有心跳，不会误伤)。没在跑(两轮空档)则到判停阈值(默认30s)即快速续下一步。
        const RUNNING_HANG_MS = 600000; // 在跑时判"真卡死"的零活动阈值(10分钟)
        if (now - last < (running ? RUNNING_HANG_MS : idleMs)) continue;
        if (sid === currentIdRef.current && inputRef.current.trim()) continue; // 你正在打字
        if (contMaxRef.current > 0 && (contBySid.current.get(sid) || 0) >= contMaxRef.current) continue; // 到封顶轮数
        // 判僵死 → 直接清可能卡住的运行标(改 ref，否则 autoContinue 的 has(sid) 会挡回)，朝总目标续
        runningSetRef.current.delete(sid);
        setRunningSet((s) => { const n = new Set(s); n.delete(sid); return n; });
        lastActivityRef.current.set(sid, now); // 占位，避免下一巡重复触发
        autoContinue(sid, tr("ui.app.keep.going.toward.the.overall.goal.34a5392"));
      }
    }, Math.max(10, wdIntervalSec) * 1000);
    return () => clearInterval(iv);
  }, [wdIntervalSec]);
  // ASK 兜底倒计时：每秒减一，减到头仍然把这句发出去(智能继续下不该干等)
  useEffect(() => {
    if (suggestWait <= 0) return;
    const t = setTimeout(() => {
      if (suggestWait > 1) { setSuggestWait(suggestWait - 1); return; }
      setSuggestWait(0);
      const go = suggestionRef.current.trim();
      if (!go) return;
      lastSuggestRef.current = { text: go, canContinue: false, auto: true };
      autoContinue(currentIdRef.current, go);
    }, 1000);
    return () => clearTimeout(t);
  }, [suggestWait]);
  useEffect(() => { if (input.trim()) setSuggestWait(0); }, [input]); // 你一动手就别自动发了
  // 切会话/启动时读这个会话的总目标 + 全局红线
  useEffect(() => {
    let alive = true;
    window.wuwei.goalGet?.(currentId).then((gg) => { if (alive) setGoal(gg || null); }).catch(() => {});
    return () => { alive = false; };
  }, [currentId]);
  useEffect(() => {
    window.wuwei.stopRulesGet?.().then((tt) => setStopRules(tt || "")).catch(() => {});
    const onRules = (e: any) => setStopRules(String(e.detail || ""));
    window.addEventListener("wuwei-stop-rules", onRules);
    return () => window.removeEventListener("wuwei-stop-rules", onRules);
  }, []);
  // 设置面板改了连推安全阀 → 同步到运行时状态
  useEffect(() => {
    const onCont = (e: any) => {
      if (typeof e.detail?.max === "number") setContMax(e.detail.max);
      if (typeof e.detail?.delay === "number") setContDelay(e.detail.delay);
      if (typeof e.detail?.askSec === "number") setAskAutoSec(e.detail.askSec);
      if (typeof e.detail?.redlineSec === "number") setRedlineAutoSec(e.detail.redlineSec);
    };
    window.addEventListener("wuwei-cont-cfg", onCont);
    return () => window.removeEventListener("wuwei-cont-cfg", onCont);
  }, []);
  // 打开目标弹窗：把已存契约拆进可编辑字段（新建则给空）；并恢复该会话的"调研中+进度"状态
  function openGoalEdit(sid: string, g: import("./env").Charter | null) {
    const rs = loadResearchState(sid); // 上次没做完的调研状态(独立于弹窗持久化)
    setGoalEdit({
      sid,
      text: g?.text || "",
      research: g?.research || "",
      ruleDo: g?.rules?.do || "",
      ruleDont: g?.rules?.dont || "",
      plan: (g?.plan || []).map((s) => ({ ...s })),
      researching: rs?.researching || undefined,
      minimized: false,
    });
    if (rs?.researching) {
      researchSidRef.current = sid;
      setResearchLive(rs.live || { label: tr("ui.app.reconnecting.to.research.b1dbf26"), steps: 0 });
      // 补拉重载/关窗间隙可能已完成的草稿（拿到就回填并清掉"调研中"）
      window.wuwei.charterDraftGet?.(sid).then((d) => { if (d) applyCharterDraft(sid, d); }).catch(() => {});
    } else {
      researchSidRef.current = null;
      setResearchLive(null);
    }
  }

  // 「调研并拟计划」：跑一个【独立隔离子会话】的 Agent（有 web_search/web_fetch）专做调研，
  // 主进程 await 到完整结果再解析回填——彻底避开在用户对话里的流式竞态/上下文臃肿/被自身动量带偏。
  // 不污染当前聊天；进度走 evt:charter-progress；完成经 IPC 返回 + evt:charter-draft 双回填(刷新也稳)。
  function startResearch() {
    if (!goalEdit) return;
    const tx = goalEdit.text.trim();
    if (!tx) return;
    const sid = goalEdit.sid;
    if (sid !== currentId) return;
    researchSidRef.current = sid;
    const live0 = { label: tr("ui.app.starting.research.75ea9b5"), steps: 0 };
    setResearchLive(live0);
    saveResearchState(sid, { researching: true, live: live0 }); // 按会话持久化，"只保存"/收起/刷新后重开还能恢复
    setGoalEdit({ ...goalEdit, researching: true, minimized: false });
    const srcLine = researchSources.map((s) => s.trim()).filter(Boolean).join(tr("ui.index.text.6486d4e")); // 调研方向/来源
    const prompt = tr("ui.app.research.task.only.research.do.not.35c7fb8", { p0: tx, p1: (lang !== "zh" ? srcLine ? `\nFocus your research on these directions / sources: ${srcLine}.\n` : "" : srcLine ? tr("ui.app.message.f4a7bb2e4f", {p0: srcLine}) : "") });
    // 独立子会话跑调研；await 完整结果后回填(evt:charter-draft 也会回填，applyCharterDraft 幂等)
    window.wuwei.charterResearch(sid, prompt)
      .then((r) => { if (r?.ok && r.draft) applyCharterDraft(sid, r.draft); else applyCharterDraft(sid, null); })
      .catch(() => applyCharterDraft(sid, null));
  }

  // 调研草稿回填弹窗（事件到达 or 刷新后补拉，都走这里）
  function applyCharterDraft(sid: string, draft: import("./env").CharterDraft) {
    saveResearchState(sid, null); // 调研收尾(成功或失败)：清掉持久化的"调研中"，避免下次重开卡在转圈
    if (researchSidRef.current === sid) { researchSidRef.current = null; setResearchLive(null); }
    setGoalEdit((prev) => {
      if (!prev || prev.sid !== sid) return prev; // 弹窗已关或切了会话→忽略(草稿已缓存/持久化)
      if (!draft) return { ...prev, researching: false }; // 没抽到 JSON→仅结束 loading
      return {
        ...prev,
        researching: false,
        research: draft.research || prev.research,
        ruleDo: draft.rules?.do || prev.ruleDo,
        ruleDont: draft.rules?.dont || prev.ruleDont,
        plan: Array.isArray(draft.plan) && draft.plan.length ? draftNodesToPlan(draft.plan) : prev.plan,
      };
    });
  }
  // 刷新/重载后若弹窗恢复出"调研中"状态：重连进度，并补拉重载间隙可能错过的已完成草稿(不重跑调研)
  useEffect(() => {
    if (goalEdit?.researching && goalEdit.sid) {
      researchSidRef.current = goalEdit.sid;
      setResearchLive((prev) => prev || { label: tr("ui.app.reconnecting.to.research.b1dbf26"), steps: 0 });
      window.wuwei.charterDraftGet?.(goalEdit.sid).then((d) => { if (d) applyCharterDraft(goalEdit.sid, d); }).catch(() => {});
    }
    // 仅挂载时跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 把弹窗字段拼成契约对象（计划为树，递归清洗，丢掉整棵空标题节点）
  function cleanPlanTree(nodes: import("./env").PlanStep[], prefix = "s"): import("./env").PlanStep[] {
    return nodes
      .filter((s) => s.title.trim() || (s.children && s.children.length))
      .map((s, i) => {
        const id = s.id || `${prefix}${i + 1}`;
        const kids = s.children && s.children.length ? cleanPlanTree(s.children, id + "_") : undefined;
        const node: import("./env").PlanStep = { id, title: s.title.trim(), acceptance: (s.acceptance || "").trim(), status: s.status || "todo" };
        if (s.description && s.description.trim()) node.description = s.description.trim();
        if (kids && kids.length) node.children = kids;
        return node;
      });
  }
  function buildCharter(e: NonNullable<typeof goalEdit>, active: boolean): import("./env").Charter {
    const plan = cleanPlanTree(e.plan);
    const rd = e.ruleDo.trim();
    const rdo = e.ruleDont.trim();
    return {
      text: e.text.trim(),
      active,
      done: false,
      research: e.research.trim() || undefined,
      rules: rd || rdo ? { do: rd, dont: rdo } : undefined,
      plan: plan.length ? plan : undefined,
    };
  }

  // 执行时发给 Agent 的完整工作约定：目标+调研+计划(带验收)+规则+每步自检+里程碑写知识宫殿
  function charterExecPrompt(c: import("./env").Charter): string {
    const en = lang !== "zh";
    const parts: string[] = [];
    parts.push(tr("ui.app.overall.goal.for.this.conversation.f376d91", { p0: c.text }));
    if (c.research?.trim()) parts.push((tr("ui.app.research.findings.7c669ec")) + c.research.trim());
    if (c.plan?.length) {
      // 树形序列化：编号 1 / 1.2 / 1.2.3，缩进带层级，含说明+验收
      const lines: string[] = [];
      const walk = (nodes: import("./env").PlanStep[], prefix: string, indent: string) => {
        nodes.forEach((s, i) => {
          const no = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
          const desc = s.description?.trim() ? (tr("ui.app.text.bb29376", { v0: s.description.trim() })) : "";
          const acc = s.acceptance?.trim() ? (tr("ui.app.acceptance.51e37b2", { p0: s.acceptance.trim() })) : "";
          lines.push(`${indent}${no}. ${s.title}${desc}${acc}`);
          if (s.children?.length) walk(s.children, no, indent + "  ");
        });
      };
      walk(c.plan, "", "");
      parts.push((tr("ui.app.execution.plan.hierarchical.advance.node.by.3f9208f")) + lines.join("\n"));
    }
    if (c.rules?.do?.trim()) parts.push((tr("ui.app.must.do.aac3887")) + c.rules.do.trim());
    if (c.rules?.dont?.trim()) parts.push((tr("ui.app.never.do.touching.these.means.drifting.e55cb3c")) + c.rules.dont.trim());
    const method = tr("ui.app.how.to.work.from.now.on.2a77be0");
    return parts.join("\n\n") + method;
  }

  // 定好目标就交给它自己跑。有计划/规则/调研就走完整契约提示，纯目标沿用可自定义的老模板（向后兼容）。
  function startGoal(e: NonNullable<typeof goalEdit>) {
    const tx = e.text.trim();
    if (!tx) return;
    const sid = e.sid;
    const c = buildCharter(e, true);
    window.wuwei.goalSet?.(sid, c);
    // 开始执行=不再收草稿：解除调研武装+清进度，否则这轮执行输出会被误当调研 JSON 解析
    window.wuwei.charterDraftDisarm?.(sid);
    saveResearchState(sid, null);
    researchSidRef.current = null;
    setResearchLive(null);
    setGoalEdit(null);
    // doSend 只发往当前会话；给别的会话设的目标只持久化+置为推进中，切过去点「继续」即可开跑
    if (sid !== currentId) return;
    setGoal(c);
    setMode(sid, "cont");
    const rich = !!(c.research || c.rules || (c.plan && c.plan.length));
    if (rich) {
      doSend(charterExecPrompt(c), []);
    } else {
      const tpl = goalPromptOf();
      doSend(tpl.includes("{goal}") || tpl.includes(systemData.goalPlaceholder) ? tpl.replaceAll("{goal}", tx).replaceAll(systemData.goalPlaceholder, tx) : tr("goal.withCustomPrompt", {goal:tx,prompt:tpl}), []);
    }
  }

  // 打开某会话的完整历史(压缩前原文 + 当前)，用聊天布局渲染
  async function openHistory(sid: string, title: string) {
    setHistoryView({ sid, title, items: [], compacted: false, loading: true });
    try {
      const r = await window.wuwei.getTranscript(sid);
      setHistoryView({ sid, title, items: messagesToItems(r.full || []), compacted: !!r.compacted, loading: false });
    } catch {
      setHistoryView({ sid, title, items: [], compacted: false, loading: false });
    }
  }

  function clearComposer() {
    setInput("");
    setPendingImages([]);
    if (taRef.current) taRef.current.style.height = "auto";
    window.wuwei.draftSet({ text: "", images: [] }); // 发送后立即清空落盘草稿
  }

  // 真正把消息投递出去(注入 or 新发)——已入库密钥由主进程兜底脱敏
  function dispatchMessage(text: string, imgs: string[], inject: boolean) {
    if (inject) {
      push({ type: "user", text, images: imgs.length ? imgs : undefined, ts: Date.now() });
      if (text) {
        history.current.push(text);
        histIdx.current = history.current.length;
      }
      window.wuwei.inject(currentId, text, imgs.length ? imgs : undefined);
    } else {
      doSend(text, imgs);
    }
  }

  // 上一条是否「被中断」：两种来源——
  //   ① 网关重连全失败后优雅收尾，会以助手正文补一句「回复「继续」…」（finish_reason=stop，不算报错）
  //   ② 客户端到网关这段自己断了 → notice 走 friendlyError 的 err.interrupted 文案
  const lastWasInterrupted = useMemo(() => {
    const last = items[items.length - 1];
    if (!last || (last.type !== "notice" && last.type !== "assistant")) return false;
    return /连接中断|被切断|回复「继续」|dropped|cut off|reply "continue"/i.test(last.text || "");
  }, [items]);

  // 被中断 → 给输入框挂「继续」幽灵提示：按 Tab 即填入（复用既有补全机制），或点提示条的「继续」直接发
  useEffect(() => {
    if (!busy && lastWasInterrupted) setSuggestion("continue");
  }, [busy, lastWasInterrupted, lang]);

  // override：不经过输入框直接发一句（如中断后点「继续」）。缺省仍用输入框内容。
  // 防御 typeof：万一哪个 onClick 直接写成 {submit}，传进来的是 MouseEvent，
  // 对它调 .trim() 会当场抛异常把整个界面炸成白屏——这里一律只认字符串。
  async function switchAnonymousAndRetry(text: string, images: string[]) {
    const choice = anonymousDefaultModel(pickerChoicesRef.current);
    if (!choice) { requestModelLogin(); return; }
    const sid = currentIdRef.current;
    try {
      if (!await selectModelChoice(choice)) return;
      if (sid !== currentIdRef.current || wuweiRef.current) return;
      setPendingImages(images);
      setModelRetry({ sid, userId: null, key: choice.key, text, images });
    } catch { push({ type: 'notice', text: tr("ui.app.could.not.switch.models.please.retry.f1bb49c") }); }
  }
  function submit(override?: string) {
    const text = (typeof override === "string" ? override : input).trim();
    if (!text && pendingImages.length === 0) return;
    if (text === "/reset") {
      window.wuwei.reset();
      setInput("");
      return;
    }
    // 未登录发任何消息 → 先弹居中的登录激励卡(更多模型 + 注册赠币 10 无为币（24 小时有效）)，
    // 用户点「登录」再切到登录表单，比一上来就甩登录框干净、转化更好。
    // 例外：选中的是 anon(免登录免费体验)平台 → 直接放行，让未登录用户零摩擦试用。
    // 双保险：未登录且当前非 anon 平台时，若存在 anon 免费体验平台，自动切过去(quickProvider 写 settings)
    // 并提示用户再发一次，而不是弹登录墙。仅当确实无任何 anon 平台可用才引导登录。
    if (imageMode && !wuwei) { requestModelLogin(); return; }
    const anonUsable = freeModelIds.has(meta.model) && !loginReqModelIds.has(meta.model);
    if (!wuwei && (!curPreset?.anon || !anonUsable)) {
      void switchAnonymousAndRetry(text, [...pendingImages]);
      return;
    }
    // 前置拦截仅针对「真的没额度可用」：余额≤0 且 会员周额度也没有(非会员/额度用尽)。
    // 会员本周订阅额度还有(remainingPct>0) → 放行，用量走周额度(服务端按额度扣，见网关预检)，
    // 否则付费会员余额为0会被客户端提前误拦、根本发不出请求。
    // 免登录免费体验(anon)走网关匿名分支、不扣无为币 → 绝不做余额拦截(否则登录用户选免费模型、
    // 余额为0时会被误拦弹"无为币不足")。只对真正按量扣币的托管平台做前置拦截。
    if (curPreset?.hosted && !curPreset?.anon && wuwei && (imageMode || !freeModelIds.has(meta.model)) && !hasPaidAllowance(wuwei)) {
      void refreshWuweiForShortage(imageMode ? (tr("ui.app.not.enough.quota.and.coins.to.956023b")) : (tr("ui.app.out.of.credits.top.up.to.13b0bb4")));
      return;
    }
    setSuggestion(""); // 发送后清掉旧的下一步建议(回复完会重新生成)
    const imgs = pendingImages;
    if (imageMode && imgs.length) {
      push({type:"notice",text:tr("ui.app.these.presets.currently.generate.from.text.fcea283")});
      return;
    }
    const inject = busy; // 跑动中→注入到当前回合
    // 铁律:发送绝不能依赖密钥扫描。扫描失败/无该接口都要照常发,主进程还会兜底脱敏。
    const go = () => {
      dispatchMessage(text, imgs, inject);
      clearComposer();
    };
    const scan = text ? window.wuwei.secretsScan?.(text) : undefined;
    if (!scan) {
      go();
      return;
    }
    scan
      .then((r) => {
        if (r?.candidates?.length > 0) {
          setSecretPrompt({
            text,
            redacted: r.redacted ?? text,
            imgs,
            inject,
            candidates: r.candidates,
            checked: r.candidates.map(() => true),
            dupChoice: r.candidates.map(() => "ignore" as const),
          });
        } else {
          // 用脱敏后的文本显示+发送:已入库密钥在气泡里也是占位符,不明文示人
          dispatchMessage(r?.redacted ?? text, imgs, inject);
          clearComposer();
        }
      })
      .catch(() => go()); // 扫描出错→照常发
  }

  // 密钥确认弹窗：新密钥按勾选存入;重复项按三选一(新增/覆盖备注/忽略);再发送
  useEffect(() => {
    if (!modelRetry) return;
    if (modelRetry.sid !== currentId || modelRetry.userId !== (wuwei?.user.id ?? null)) { setModelRetry(null); return; }
    if (busy || selectedModelKey !== modelRetry.key) return;
    setModelRetry(null);
    submit(modelRetry.text);
  }, [modelRetry, selectedModelKey, currentId, wuwei?.user.id, busy]);

  async function confirmSecretPrompt(store: boolean) {
    const sp = secretPrompt;
    if (!sp) return;
    let outText = sp.redacted; // 默认:已入库的已脱敏,新密钥保持原样(用户选了不存)
    if (store) {
      for (let i = 0; i < sp.candidates.length; i++) {
        const c = sp.candidates[i];
        if (c.existing) {
          // 重复项:值已在保险箱,只处理备注/新增
          const choice = sp.dupChoice[i];
          if (choice === "new") {
            await window.wuwei.secretsAdd({ name: c.suggestedName, value: c.value, note: c.note, force: true });
          } else if (choice === "overwrite") {
            await window.wuwei.secretsUpdate(c.existing.id, { note: c.note });
          } // ignore: 不动
        } else {
          if (!sp.checked[i]) continue;
          await window.wuwei.secretsAdd({ name: c.suggestedName, value: c.value, note: c.note });
        }
      }
      // 存好后重新扫描:刚入库的这批也会被替换成占位符
      try {
        outText = (await window.wuwei.secretsScan(sp.text))?.redacted ?? sp.redacted;
      } catch {
        outText = sp.redacted;
      }
    }
    setSecretPrompt(null);
    dispatchMessage(outText, sp.imgs, sp.inject);
    clearComposer();
  }

  const stop = () => window.wuwei.stop(currentId);

  // ——— 侧栏分组/排序辅助 ———
  const orderKey = (s: SessionMeta) => (s.order != null ? s.order : -s.updatedAt);
  // 相对时间(最新消息多久前)：随 now(每15s)更新
  const relTime = (ts: number): string => {
    const sec = Math.max(0, Math.floor((now - ts) / 1000));
    if (sec < 60) return t("rel.sec").replace("{n}", String(sec));
    const min = Math.floor(sec / 60);
    if (min < 60) return t("rel.min").replace("{n}", String(min));
    const hr = Math.floor(min / 60);
    if (hr < 24) return t("rel.hour").replace("{n}", String(hr));
    const day = Math.floor(hr / 24);
    if (day < 30) return t("rel.day").replace("{n}", String(day));
    const mo = Math.floor(day / 30);
    return mo < 12 ? t("rel.month").replace("{n}", String(mo)) : t("rel.year").replace("{n}", String(Math.floor(mo / 12)));
  };
  // 组内排序：已完成沉底 → 优先级(数字大在前) → 手动拖拽键(未拖过=按最近更新)
  const sortRows = (arr: SessionMeta[]) =>
    [...arr].sort(
      (a, b) =>
        (a.done ? 1 : 0) - (b.done ? 1 : 0) ||
        (b.priority || 0) - (a.priority || 0) ||
        orderKey(a) - orderKey(b),
    );
  // 日期分组的桶名 + 排序权重
  const dateBucket = (ts: number): string => {
    const d = new Date(ts);
    const now = new Date();
    const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(now) - day(d)) / 86400000);
    const en = getLang() !== "zh";
    if (diff <= 0) return tr("ui.app.today.76c71c0");
    if (diff === 1) return tr("ui.app.yesterday.1f69424");
    if (diff <= 7) return tr("ui.app.last.days.f458b0e");
    if (diff <= 30) return tr("ui.app.last.days.0ebce0c");
    if (d.getFullYear() === now.getFullYear())
      return en ? d.toLocaleString("en-US", { month: "long" }) : tr("ui.app.message.1e21afd591", {p0: d.getMonth() + 1});
    return tr("ui.app.text.00a1806", { p0: d.getFullYear() });
  };
  const RECENT_BUCKETS = [tr("ui.app.today.76c71c0"), tr("ui.app.yesterday.1f69424"), tr("ui.app.last.days.f458b0e"), tr("ui.app.last.days.0ebce0c")];
  const dateRank = (b: string) =>
    RECENT_BUCKETS.indexOf(b) >= 0 ? RECENT_BUCKETS.indexOf(b) : 100; // 具体月/年桶排后面，用桶内最新时间兜底排序
  // 会话所属分组(按当前模式)
  const groupOf = (s: SessionMeta): string =>
    groupMode === "date" ? dateBucket(s.updatedAt) : groupMode === "project" ? s.project || (tr("ui.app.uncategorized.c834627")) : s.group || "";

  // 拖拽会话到某会话上→插入并写 order；手动模式下跨组=移动分组
  function dropOnSession(e: React.DragEvent, target: SessionMeta, list: SessionMeta[]) {
    e.preventDefault();
    setDragOverId(null);
    const id = dragId;
    setDragId(null);
    if (!id || id === target.id) return;
    const dragged = sessions.find((s) => s.id === id);
    if (!dragged) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const below = e.clientY > rect.top + rect.height / 2;
    const others = list.filter((r) => r.id !== id);
    const ti = others.findIndex((r) => r.id === target.id);
    const above = below ? others[ti] : others[ti - 1];
    const belowItem = below ? others[ti + 1] : others[ti];
    let newOrder: number;
    if (above && belowItem) newOrder = (orderKey(above) + orderKey(belowItem)) / 2;
    else if (above) newOrder = orderKey(above) + 1e6;
    else if (belowItem) newOrder = orderKey(belowItem) - 1e6;
    else newOrder = orderKey(target);
    if (groupMode === "manual" && (dragged.group || "") !== (target.group || ""))
      window.wuwei.setSessionGroup(id, target.group || null);
    window.wuwei.setSessionOrder(id, newOrder);
  }

  // 拖拽组头重排(仅手动模式)
  function dropOnGroup(e: React.DragEvent, targetGroup: string, ordered: string[]) {
    e.preventDefault();
    const g = dragGroup;
    setDragGroup(null);
    setDragOverGroup(null);
    if (!g || g === targetGroup) return;
    const without = ordered.filter((x) => x !== g);
    const ti = without.indexOf(targetGroup);
    const next = [...without.slice(0, ti), g, ...without.slice(ti)];
    const rest = groups.filter((x) => !next.includes(x)); // 无会话的组保持在后
    window.wuwei.reorderGroups([...next, ...rest]);
  }

  function changeGroupMode(m: "manual" | "date" | "project") {
    setGroupMode(m);
    window.wuwei.setGroupMode(m);
  }
  function changeStream(mode: "typewriter" | "stream" | "instant", speed: number) {
    setStreamMode(mode);
    setStreamSpeed(speed);
    window.wuwei.setStreamOutput(mode, speed);
  }
  function changeKeepRecent(n: number) {
    setKeepRecent(n);
    window.wuwei.setKeepRecent(n);
  }
  function changeShowEffortPicker(v: boolean) {
    setShowEffortPicker(v);
    if (!v) setShowEffortMenu(false); // 关掉显示时顺手收起已展开的菜单
    void (async () => {
      const r = await window.wuwei.getSettings();
      window.wuwei.setSettings({ ...((r?.settings as any) || {}), showEffortPicker: v });
    })();
  }
  function changeAskToast(auto: boolean, sec: number) {
    setAskToastAuto(auto);
    setAskToastSec(sec);
    window.wuwei.setAskToast(auto, sec);
  }

  function answerPerm(decision: "allow" | "deny") {
    if (!pending) return;
    window.wuwei.respondPermission(pending.id, decision);
    setPending(null);
  }

  function allowAlways() {
    if (!pending) return;
    alwaysAllowRef.current.add(pending.name);
    localStorage.setItem("wuwei-allow", JSON.stringify([...alwaysAllowRef.current]));
    window.wuwei.respondPermission(pending.id, "allow");
    setPending(null);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab" && input === "" && suggestion) {
      // 幽灵提示补全：输入框为空且有建议时，Tab 把建议填进输入框
      e.preventDefault();
      setInput(suggestion);
      setSuggestion("");
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === "ArrowUp" && input === "") {
      if (histIdx.current > 0) {
        histIdx.current -= 1;
        setInput(history.current[histIdx.current] ?? "");
      }
    } else if (e.key === "Escape") {
      setInput("");
    }
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (searchOpen) return; // 搜索框里在打字：y/n/a/Esc 归搜索用，别当权限快捷键
      if (pending) {
        if (e.key === "Escape" || e.key === "n" || e.key === "N") answerPerm("deny");
        if (e.key === "y" || e.key === "Y") answerPerm("allow");
        if (e.key === "a" || e.key === "A") allowAlways();
      } else if (busy && e.key === "Escape") {
        stop();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [pending, busy, searchOpen]);

  // —— 全局搜索 ——
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const openSearch = () => {
    setSearchOpen(true);
    setSearchSel(0);
  };
  // 打开时选中上次的关键词：想接着看就直接回车，想换词直接打字即可覆盖
  useEffect(() => {
    if (searchOpen) requestAnimationFrame(() => searchInputRef.current?.select());
  }, [searchOpen]);
  // ⌘/Ctrl+F 打开搜索
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  // 输入防抖 300ms 再去主进程搜（首次会建索引，之后是内存里扫）
  useEffect(() => {
    if (!searchOpen) return;
    const q = searchQ.trim();
    if (!q) {
      setSearchRes(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    let dead = false;
    const t = window.setTimeout(async () => {
      try {
        const r = await window.wuwei.searchSessions(q);
        if (dead) return;
        setSearchRes(r);
        setSearchSel(0);
      } catch {
        if (!dead) setSearchRes({ hits: [], total: 0, sessions: 0, truncated: false });
      } finally {
        if (!dead) setSearching(false);
      }
    }, 300);
    return () => {
      dead = true; // 打字很快时丢掉上一次的结果，避免旧结果盖新结果
      clearTimeout(t);
    };
  }, [searchQ, searchOpen]);
  // 点某条结果：切到那个会话并滚到命中的位置（同会话则直接滚）
  const gotoHit = (hit: import("./env").SearchHit) => {
    setSearchOpen(false);
    const q = searchQ.trim();
    if (hit.anchor) jumpRef.current = { sid: hit.sid, anchor: hit.anchor, q };
    if (hit.sid !== currentIdRef.current) {
      window.wuwei.switchSession(hit.sid);
      return;
    }
    if (!hit.anchor) return; // 标题命中且就在当前会话：无需跳转
    // 已经在这个会话：主进程不会再发 session-loaded，自己触发一次跳转
    setItems((p) => [...p]);
  };

  // ——— AGI 板块:数字婴儿 操作 ———
  async function babyRefresh() {
    try {
      const [di, cu] = await Promise.all([window.wuwei.babyDiary(), window.wuwei.babyCurious()]);
      setBabyDiaryState(di || ""); setBabyCuriousState(cu || "");
    } catch { /* 轮询失败不打扰界面，下一轮再来 */ }
  }
  // 读网络图/金字塔。**故意会往外抛错**：要静默的调用点自己 .catch(()=>{})。
  async function loadBabyGraph() {
    const g = JSON.parse(await window.wuwei.babyGraph());
    setBabyGraphData({ nodes: g.nodes || [], edges: g.edges || [] });
  }
  async function loadBabyPyramid() {
    setBabyPyramid(JSON.parse(await window.wuwei.babyPyramid()));
  }
  // 「重新读取」：转圈 + 读完报「已更新 时:分:秒」+ 失败把原因显出来。
  async function reloadBabyBrain() {
    if (brainLoad.busy) return;
    setBrainLoad({ busy: true, at: 0, err: "" });
    try {
      await Promise.all([loadBabyGraph(), loadBabyPyramid()]);
      setBrainLoad({ busy: false, at: Date.now(), err: "" });
    } catch (e: any) {
      setBrainLoad({ busy: false, at: 0, err: String(e?.message || e).slice(0, 80) });
    }
  }
  // 「整理知识」：让它主动做一次深度整理(自组织重建整座金字塔)，完事刷新两个视图。
  async function babyTidyUp() {
    if (babyTidy) return;
    setBabyTidy(true);
    try {
      const note = await window.wuwei.babyReorganize();
      setBabyChatLog((l) => [...l, { role: "baby", text: tr("ui.app.message.45bf964d93", {p0: note || ""}), ts: Date.now() }]);
      await Promise.all([loadBabyGraph().catch(() => {}), loadBabyPyramid().catch(() => {}), babyRefresh()]);
    } finally { setBabyTidy(false); }
  }
  async function toggleBabyAlive() {
    if (babyAlive) { setBabyAlive(false); try { await window.wuwei.babyAliveStop(); } catch {} }
    else { setBabyAlive(true); try { await window.wuwei.babyAliveStart(); } catch {} }
  }
  async function babyDoChat() {
    const msg = babyChatInput.trim(); if (!msg || babyBusy) return;
    setBabyChatInput("");
    setBabyChatLog((l) => [...l, { role: "you", text: msg, ts: Date.now() }]);
    setBabyBusy(tr("ui.app.message.f4aa8d50b3"));
    try {
      const ans = await window.wuwei.babyChat(msg);
      setBabyChatLog((l) => [...l, { role: "baby", text: ans || tr("ui.app.message.9c5f40ac78"), ts: Date.now() }]);
      await babyRefresh(); // 聊天可能上网学到新东西(进记忆/日志)，刷新状态区
    } finally { setBabyBusy(""); }
  }
  function createBaby() {
    setBabyExists(true); localStorage.setItem("minicc-baby-exists", "1");
    setAgiView("baby"); babyRefresh();
  }
  function deleteBaby() {
    askConfirm({
      message: tr("ui.app.remove.this.digital.baby.connection.its.0f15622"),
      danger: true,
      onOk: () => {
        setBabyExists(false); localStorage.setItem("minicc-baby-exists", "0");
        if (agiView === "baby") setAgiView(null);
      },
    });
  }
  function openBaby() {
    setAgiView("baby"); babyRefresh();
    // 同步"是否正在持续活着"(重开面板/重启后恢复开关状态)
    window.wuwei.babyAliveStatus().then((s: string) => { try { setBabyAlive(!!JSON.parse(s).alive); } catch {} }).catch(() => {});
  }
  // 聊天区自动吸底(新消息/它在想时滚到最新)，用户主动上滚>60px 时不打断
  useEffect(() => {
    const el = babyChatRef.current;
    if (el && babyChatStick.current) el.scrollTop = el.scrollHeight;
  }, [babyChatLog, babyBusy]);
  // AGI 板块显隐开关(设置里切换)
  useEffect(() => {
    const onToggle = (e: any) => setAgiEnabled(!!e.detail);
    window.addEventListener("wuwei-agi-toggle", onToggle);
    return () => window.removeEventListener("wuwei-agi-toggle", onToggle);
  }, []);
  // 面板打开就每 2 秒轮询：更新"它在干嘛"活动状态 + 进度；活着时每轮刷状态区，歇着每 10 轮刷一次
  useEffect(() => {
    if (agiView !== "baby") return;
    let n = 0;
    const tick = async () => {
      try {
        const j = JSON.parse(await window.wuwei.babyAliveStatus());
        setBabyActivity(j.activity || "");
        setBabyAlive(!!j.alive);
        setBabyVitals(j);
        if (j.alive || n % 10 === 0) babyRefresh();
      } catch { /* ignore */ }
      n++;
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => clearInterval(t);
  }, [agiView]);
  // 记忆网络全屏时 Esc 退出
  useEffect(() => {
    if (!brainFull) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setBrainFull(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [brainFull]);

  // 优先用服务端亲口报过的上限(实测值)，其次主进程按模型算的值，最后才是兜底常量
  const ctxWin = serverCtxMax || meta.ctxWindow || CTX_MAX;
  const ctxPct = Math.min(100, Math.round((usage.lastInput / ctxWin) * 100));
  const ctxWinLabel = ctxWin >= 1_000_000 ? (ctxWin / 1_000_000).toFixed(1) + "M" : Math.round(ctxWin / 1000) + "k";

  // 共享底栏：主对话 composer-foot 抽成渲染函数，群/私聊(RoomView) 复用同一套。
  // opts.roomMode：隐藏 mode-mini(那是主会话 per-session 模式，对群无意义)；opts.contextK：群自己的上下文估算值。
  const renderComposerFoot = (opts?: { roomMode?: boolean; contextK?: number; roomRunning?: boolean }) => {
    const roomMode = !!opts?.roomMode;
    const roomRunning = !!opts?.roomRunning; // 群/私聊底栏那颗灯：反映「本房间 turn」运行态，而非主会话 runningSet(否则误导排障)
    const ctxK = opts?.contextK ?? usage.lastInput / 1000;
    return (
          <div className={"composer-foot" + (footCompact ? " compact" : "")}>
            <div className="conn-light-wrap">
              <button
                className={`conn-light conn-${conn.status}`}
                title={t("conn.lightTitle")}
                onClick={() => setShowConn((v) => !v)}
              />
              {showConn && (
                <>
                  <div className="mq-overlay" onClick={() => setShowConn(false)} />
                  <div className="conn-pop">
                    <div className="conn-pop-title">
                      <span className={`conn-dot conn-${conn.status}`} />
                      {conn.status === "green"
                        ? (tr("ui.app.connected.01c9b5a"))
                        : conn.status === "yellow"
                          ? (tr("ui.app.errors.not.fully.connected.ac1e6dd"))
                          : conn.status === "red"
                            ? (tr("ui.app.not.connected.not.configured.ba0e318"))
                            : (tr("ui.app.checking.4186bc8"))}
                    </div>
                    <p className="conn-pop-reason">{localizeStoredText(conn.reason, lang)}</p>
                    <div className="conn-pop-actions">
                      <button
                        onClick={() => {
                          setShowConn(false);
                          void runConnCheck();
                        }}
                      >
                        {tr("ui.app.re.check.4156bee")}
                      </button>
                      {(conn.status === "red" || conn.status === "yellow") && (
                        <button
                          className="allow"
                          onClick={() => {
                            setShowConn(false);
                            if (imageMode) {
                              if (conn.status === 'red') setShowLoginIntro(true);
                              else { void refreshImageCatalog(); void runConnCheck(); }
                              return;
                            }
                            setSettingsTab("model");
                            setShowSettings(true);
                          }}
                        >
                          {imageMode ? conn.status === 'red' ? (tr("login.signin")) : (tr("ui.app.refresh.models.9b97c68")) : conn.status === "red" ? (tr("ui.app.configure.authorize.cb85a9c")) : (tr("ui.app.resolve.2926549"))}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            {/* 脑网络后台进度：索引构建 / 概念抽取，实时可见，点击进设置查看 */}
            {(idxProg?.building || conProg?.running) && (
              <button
                className="brain-prog"
                title={t("brainprog.title")}
                onClick={() => {
                  setSettingsTab("brain");
                  setShowSettings(true);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "2px 8px",
                  border: "1px solid var(--border, #e2e2e2)",
                  borderRadius: 999,
                  background: "var(--chip-bg, #f4f4f5)",
                  fontSize: 11,
                  color: "var(--text-2, #666)",
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#3b82f6",
                    animation: "pulse 1.2s ease-in-out infinite",
                  }}
                />
                {idxProg?.building
                  ? idxProg.phase === "scan"
                    ? (tr("ui.app.index.scanning.docs.288eb35", { p0: idxProg.files }))
                    : (tr("ui.app.index.chunks.55b7058", { p0: idxProg.done, p1: idxProg.total || "…" }))
                  : (tr("ui.app.extract.51c3e98", { p0: conProg?.done, p1: conProg?.total }))}
              </button>
            )}

            <div className="model-quick">
              <button className="mq-btn mq-select" title={`${lang !== "zh" ? selectedCategoryLabel.en : selectedCategoryLabel.zh} · ${imageMode ? imageLabel(imageSku) : selectedChoice ? (lang !== "zh" ? selectedChoice.labelEn : selectedChoice.label) : meta.model}`} onClick={(e) => {
                openMqMenu(e);
                setModelPickerCategory(undefined);
                if (!showProviderMenu) { void refreshCatalog(); void refreshImageCatalog(); }
                setShowModelMenu(false); setShowProviderMenu((value) => !value);
              }}>
                <span className="mq-txt"><span className="mq-category-name">{!selectedChoice && !imageMode ? (tr("set.m.model")) : lang !== "zh" ? selectedCategoryLabel.en : selectedCategoryLabel.zh} · </span>{imageMode ? imageLabel(imageSku) : selectedChoice ? (lang !== "zh" ? selectedChoice.labelEn : selectedChoice.label) : modelLabelsEn.get(meta.model) || modelLabels.get(meta.model) || meta.model}</span>
                <span className="mq-caret">▾</span>
              </button>
              {/* 思考档位：只对支持 effort 的模型出现（Claude 4.5+/Sonnet 5、GPT-5、o 系）。
                  档位越高思考越深，也越慢越贵；时长受限时降档能明显提高「一次跑完」的概率。 */}
              {showEffortPicker && EFFORT_MODELS.test(meta.model) && (
                <>
                  <span className="mq-mid">·</span>
                  <button
                    className="mq-btn mq-eff"
                    title={t("eff.title")}
                    onClick={(e) => {
                      openMqMenu(e);
                      setShowEffortMenu((v) => !v);
                    }}
                  >
                    <span className="mq-txt">{effortLabel(effort, lang)}</span>
                    <span className="mq-caret">▾</span>
                  </button>
                </>
              )}
              {showEffortMenu && (
                <>
                  <div className="mq-overlay" onClick={() => setShowEffortMenu(false)} />
                  <div className="mq-menu mq-menu-eff" style={{ left: mqMenuLeft }}>
                    <div className="mq-head">{t("eff.head")}</div>
                    {EFFORT_OPTIONS.map((o) => (
                      <button
                        key={o.id}
                        className={"mq-item mq-item-col" + (o.id === effort ? " on" : "")}
                        onClick={() => {
                          setEffort(o.id);
                          setShowEffortMenu(false);
                          void (async () => {
                            const r = await window.wuwei.getSettings();
                            window.wuwei.setSettings({ ...((r?.settings as any) || {}), effort: o.id });
                          })();
                        }}
                      >
                        <span className="mq-item-main">
                          {lang !== "zh" ? o.en : o.zh}
                          {o.id === effort && <span className="mq-check">✓</span>}
                        </span>
                        <span className="mq-item-sub">{lang !== "zh" ? o.enDesc : o.zhDesc}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {(showProviderMenu || showModelMenu) && <>
                <div className="mq-overlay" onClick={closeModelPicker} />
                <ModelPicker choices={pickerChoices} selectedKey={selectedModelKey} loggedIn={!!wuwei} lang={lang} loading={!catalogReady}
                  initialCategory={modelPickerCategory}
                  onRequireLogin={requestModelLogin}
                  onChoose={async choice => { if (!await selectModelChoice(choice, false, choice.category === 'premium')) throw new Error('Model selection cancelled'); }} onClose={closeModelPicker} onConnections={() => { closeModelPicker(); setSettingsTab("platforms"); setShowSettings(true); }} />
              </>}
            </div>

            <span className="foot-spacer" />

            <span
              className="foot-status"
              title={t("foot.statusTitle")}
              onClick={() => setShowUsage((v) => !v)}
            >
              <span
                className={"fs-hit" + (busy || runningSet.size > 0 ? " fs-busy" : "") + (runningSet.size > 0 ? " fs-clickable" : "")}
                title={runningSet.size > 0 ? (tr("ui.app.click.to.view.stop.running.tasks.97f6493")) : undefined}
                onClick={(e) => {
                  if (runningSet.size === 0) return;
                  e.stopPropagation(); // 别触发用量面板
                  setShowTasks((v) => !v);
                  setShowUsage(false);
                }}
              >
                {roomMode
                  ? `○ ${t("foot.ready")}` /* 群/私聊底栏不显示「员工干活中」(会撑长导致换行)——运行态已由进度块+停止按钮体现，这里只保持默认 */
                  : runningSet.size > 1
                  ? `● ${runningSet.size} ${t("foot.tasksSuffix")}`
                  : busy
                    ? `● ${t("foot.running")}`
                    : runningSet.size === 1
                      ? `● ${t("foot.bgRunning")}`
                      : `○ ${t("foot.ready")}`}
              </span>
              <span className="fs-extra fs-hit">
                <span title={roomMode ? (tr("ui.app.estimated.from.this.room.message.text.c966edc")) : undefined}>
                  {t("foot.context")} {roomMode ? "~" : ""}{ctxK.toFixed(1)}k
                </span>
                {/* 无为托管会员：底部栏常显本周额度已用%，≥50%黄、≥80%红，提醒省着用。
                    仅「纯无为托管付费平台+付费模型」显示：排除免费体验(anon)和免费模型——它们不吃周额度；
                    切到 Claude/GPT 自己的订阅号(非 wuwei-)也不显示。 */}
                {curProviderId.startsWith("wuwei-") && !curPreset?.anon && !freeModelIds.has(meta.model) && wuwei?.membership?.weeklyQuota?.active && (() => {
                  const wq = wuwei.membership!.weeklyQuota!;
                  const usedPct = Math.max(0, Math.min(100, 100 - wq.remainingPct));
                  const tone = usedPct >= 80 ? " danger" : usedPct >= 50 ? " warn" : "";
                  return (
                    <>
                      <span className="fs-dot">·</span>
                      <span className={"fs-quota" + tone}>{tr("ui.app.month.7db01cb")} {usedPct}%</span>
                    </>
                  );
                })()}
                {/* 群/私聊(roomMode)里员工跑订阅号会真的吃你的订阅额度，所以只要 rate 有数据就显示 5小时/周；
                    主对话则按当前会话是否订阅(meta.sub)判断。 */}
                {(meta.sub || roomMode) && rate && typeof rate.primaryUsedPercent === "number" && (
                  <>
                    <span className="fs-dot">·</span>
                    {(rate.primaryWindowMinutes ?? 300) >= 1440 ? (
                      // 主窗口已是周尺度(Codex 168h)：只显示一个「周」用量，不再摆短窗口
                      <span>{tr("ui.app.week.ace7b32")} {rate.primaryUsedPercent}%</span>
                    ) : (
                      <>
                        <span>{tr("ui.app.text.eae1367")} {rate.primaryUsedPercent}%</span>
                        <span className="fs-dot">·</span>
                        <span>{tr("ui.app.week.ace7b32")} {rate.secondaryUsedPercent ?? 0}%</span>
                      </>
                    )}
                  </>
                )}
                {!meta.sub && account.balance && (
                  <>
                    <span className="fs-dot">·</span>
                    <span>
                      {account.balance.total
                        ? (tr("ui.app.balance.99c4b38", { p0: account.balance.total }))
                        : (tr("ui.app.spent.4d7b89a", { p0: account.balance.consumed }))}
                    </span>
                  </>
                )}
              </span>
              <span className="fs-caret">▾</span>
            </span>
          </div>
    );
  };

  return (
    <div className={"shell" + (showBrowser && !browserDetached && browserMode === "full" ? " browser-full" : "")}>
      {/* 翻译显示态提示条已移除：用户要对整个窗口截图，提示条会入镜不合适。翻译态仍由 translateMode 驱动（Ctrl/⌘+Shift+T 切换），只是不再显示这个浮动提示。 */}
      {/* 侧栏收起时，更新药丸改为固定浮动在左下角——否则药丸只在侧栏里，收起后用户永远看不到「发现新版本」 */}
      {collapsed && updateReady && updateReady.version !== updateChipHidden && (
        <div style={{ position: "fixed", left: 14, bottom: 14, zIndex: 60, width: 190, WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <div className="update-chip" role="button" onClick={() => setShowUpdateModal(true)} title={tr("ui.app.new.version.available.0001bc0", { p0: updateReady.version })}>
            <span className="update-chip__icon">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 16.5V8" /><path d="M8.5 11.5 12 8l3.5 3.5" /></svg>
            </span>
            <span className="update-chip__text">
              <span className="update-chip__title">{tr("ui.app.new.version.191f526")}</span>
              <span className="update-chip__ver">v{updateReady.version}</span>
            </span>
            <span className="update-chip__arrow">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </span>
            <button className="update-chip__x" onClick={(e) => { e.stopPropagation(); const v = updateReady.version; setUpdateChipHidden(v); try { localStorage.setItem("wuwei_dismissed_update_chip", v); } catch {} }} title={tr("ui.app.dismiss.900510d")} aria-label={tr("ui.app.dismiss.900510d")}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </div>
      )}
      {/* 侧边栏：会话历史（可拖宽/可折叠） */}
      {!collapsed && (
      <div className="sidebar" style={{ width: sidebarW }}>
        <div className="sidebar-top">
          {teamEnabled && (
            <div className="side-seg" role="tablist">
              <button
                className={"icon-btn side-seg-btn" + (showTeam ? " on" : "")}
                role="tab"
                aria-selected={showTeam}
                title={tr("ui.app.my.company.toggle.e7af576")}
                onClick={() => toggleSidePanel("team")}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
                  <circle cx="9.5" cy="7" r="3.2" />
                  <path d="M17 11l2 2 3.5-3.5" />
                </svg>
              </button>
              <button
                className={"icon-btn side-seg-btn" + (showChats ? " on" : "")}
                role="tab"
                aria-selected={showChats}
                title={tr("ui.app.chats.toggle.3f85e2f")}
                onClick={() => toggleSidePanel("chats")}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19l1-4.2A7.5 7.5 0 1 1 21 11.5z" />
                  <path d="M8.5 10.5h7M8.5 13.5h4" />
                </svg>
              </button>
            </div>
          )}
          <button className="icon-btn" title={t("side.search")} onClick={openSearch}>
            <SearchIcon />
          </button>
          <button className="icon-btn" title={t("side.collapse")} onClick={() => toggleCollapse(true)}>
            «
          </button>
        </div>
        {/* 多功能区：置于「新对话」之上，与下面的对话列表用一条分隔线区分开。
            目前放「应用中心」一个入口，以后要加别的全局功能入口也进这里。
            整块受 teamEnabled 控制；摘除模块时删掉这个 {teamEnabled && ...} 块即可，不影响其它。 */}
        {teamEnabled && showTeam && (
          <>
          <div
            className={"side-tools" + (!teamExpanded ? " collapsed" : !showChats ? " full" : "")}
            style={teamExpanded && showChats && toolsH > 0 ? ({ height: toolsH, maxHeight: "72vh", flex: "0 0 auto" } as React.CSSProperties) : undefined}
          >
            {/* 一人公司：可展开板块（像微信）。标题行点箭头展开/收起；点标题图标进管理页(员工)。
                展开后列群 + 员工私聊入口。右键标题弹「新建员工/导入/建群」（TODO 下一步）。 */}
            <div className={"tool-item-row" + (appView === "store" ? " on" : "")}>
              <button
                className={"tool-item tool-item-main" + (appView === "store" ? " on" : "")}
                onClick={() => { setAppView("store"); setAgiView(null); }}
                onContextMenu={(ev) => { ev.preventDefault(); setTeamMenu({ x: ev.clientX, y: ev.clientY, kind: "company" }); }}
              >
                <svg className="tool-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
                  <circle cx="9.5" cy="7" r="3.2" />
                  <path d="M17 11l2 2 3.5-3.5" />
                </svg>
                <span className="tool-label">{tr("ui.app.my.company.05b42c6")}</span>
              </button>
              <button
                className="tool-expand"
                title={teamExpanded ? (tr("set.mcp.collapse")) : (tr("ui.app.expand.369944d"))}
                onClick={() => { const v = !teamExpanded; setTeamExpanded(v); localStorage.setItem("wuwei-team-expanded", v ? "1" : "0"); }}
              >
                <svg className={"tool-chev" + (teamExpanded ? " open" : "")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
            {teamExpanded && (
              <div className="tool-sub">
                {/* 通讯录子板块头：可展开/收起，列所有员工 */}
                <button
                  className="tool-sub-sec"
                  onClick={() => { const v = !contactsExpanded; setContactsExpanded(v); localStorage.setItem("wuwei-contacts-expanded", v ? "1" : "0"); }}
                >
                  <svg className={"tool-chev" + (contactsExpanded ? " open" : "")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                  <span className="tool-sub-sec-nm">{tr("ui.app.contacts.b2a595e")}</span>
                  <span className="tool-sub-sec-cnt">{teamEmployees.length}</span>
                </button>
                {/* 员工：一个固定专属会话入口 + 可展开的会话子列表（微信通讯录式）。支持拖拽调整顺序。 */}
                {contactsExpanded && (() => {
                  // 排序：置顶(pinnedAt)优先，其次手动拖拽序(order)，都没有按原序。
                  const sortedEmps = [...teamEmployees].sort((a: any, b: any) => (b.pinnedAt || 0) - (a.pinnedAt || 0) || (a.order ?? 9999) - (b.order ?? 9999));
                  // 各部门负责人 id 集合：成员行里负责人名字后面挂个灰色「负责人」标。
                  const headIds = new Set(teamDepartments.map((d: any) => d.headId).filter(Boolean));
                  // 拖拽落下：把被拖的员工插到目标位置，重排后把新顺序落库(order=下标)。
                  const onEmpDrop = (targetId: string) => {
                    const id = empDrag; setEmpDrag(null);
                    if (!id || id === targetId) return;
                    const ids = sortedEmps.map((x: any) => x.id).filter((x: string) => x !== id);
                    const ti = ids.indexOf(targetId);
                    ids.splice(ti < 0 ? ids.length : ti, 0, id);
                    void (window as any).wuwei?.team?.employeeReorder?.(ids);
                  };
                  const renderEmp = (e: any) => {
                  const empSessions = sessions.filter((s) => s.employeeId === e.id).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
                  // 该员工参与的私聊(镜像)：同一条 dm 会在双方侧栏各显示一次，各自显示「对方」
                  const empDms = teamRooms.filter((r: any) => r.type === "dm" && (r.members || []).includes(e.id)).sort((a:any,b:any)=>(b.updatedAt||0)-(a.updatedAt||0));
                  const empSchedules = schedules.filter((s: any) => s.employeeId === e.id);
                  const isExpanded = empExpanded.has(e.id);
                  const activeEmp = sessions.find((s) => s.id === currentId)?.employeeId === e.id && appView === null;
                  // 点员工行 = 进他固定的专属会话(最近那次，延续上下文)；没聊过才新建
                  const openLatest = () => {
                    const last = empSessions[0];
                    if (last) window.wuwei.switchSession(last.id);
                    else void (window as any).wuwei?.team?.chat?.(e.id);
                    setAppView(null); setAgiView(null);
                  };
                  return (
                    <div className="tool-sub-emp" key={e.id}>
                      <div
                        className={"tool-sub-row" + (activeEmp ? " on" : "") + (empDrag === e.id ? " dragging" : "")}
                        draggable
                        onDragStart={() => setEmpDrag(e.id)}
                        onDragEnd={() => setEmpDrag(null)}
                        onDragOver={(ev) => { if (empDrag) ev.preventDefault(); }}
                        onDrop={(ev) => { ev.preventDefault(); onEmpDrop(e.id); }}
                      >
                        <button
                          className="tool-sub-item"
                          title={tr("ui.app.chat.with.e3dbfcc", { p0: (lang !== "zh" ? employeeLabel(e, lang) : e.name) })}
                          onClick={openLatest}
                          onContextMenu={(ev) => { ev.preventDefault(); setTeamMenu({ x: ev.clientX, y: ev.clientY, kind: "employee", id: e.id, name: e.name }); }}
                        >
                          <span className="tool-sub-av"><EmployeeAvatar icon={e.icon} avatarData={e.avatarData} name={employeeLabel(e, lang)} /></span>
                          <span className="tool-sub-nm">{employeeLabel(e, lang)}</span>
                          {headIds.has(e.id) && <span className="tool-sub-lead" title={tr("ui.app.department.head.539e0fb")}>{tr("ui.app.head.13d4010")}</span>}
                        </button>
                        {(empSessions.length > 0 || empDms.length > 0) && (
                          <button
                            className="tool-sub-chev"
                            title={isExpanded ? (tr("set.mcp.collapse")) : (tr("ui.app.show.chats.dd3ec3e"))}
                            onClick={() => setEmpExpanded((prev) => { const n = new Set(prev); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })}
                          >
                            <svg className={"tool-chev" + (isExpanded ? " open" : "")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                          </button>
                        )}
                      </div>
                      {isExpanded && (
                        <div className="tool-sub-convos">
                          {/* 模块①：你和这名员工的对话 */}
                          <div className="tool-sub-grouplabel">{tr("ui.app.chats.81d1f69")}</div>
                          {empSessions.map((s) => (
                            <div
                              key={s.id}
                              role="button"
                              tabIndex={0}
                              className={"tool-sub-convo" + (s.id === currentId && appView === null ? " on" : "")}
                              onClick={() => { window.wuwei.switchSession(s.id); setAppView(null); setAgiView(null); }}
                              onContextMenu={(ev) => { ev.preventDefault(); setCtxMenu({ sid: s.id, x: ev.clientX, y: ev.clientY }); }}
                            >
                              <span className="tool-sub-convo-t">{employeeSessionTitle(s, e, lang) || (tr("ui.app.new.chat.fca06b0"))}</span>
                              <span className="tool-sub-convo-tm">{relTime(s.updatedAt)}</span>
                              <button
                                className="tool-sub-convo-del"
                                title={tr("ui.app.delete.6f27c71")}
                                onClick={(e) => { e.stopPropagation(); window.wuwei.deleteSession(s.id); }}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                              </button>
                            </div>
                          ))}
                          <button className="tool-sub-newconvo" onClick={() => { void (window as any).wuwei?.team?.chat?.(e.id); setAppView(null); setAgiView(null); }}>
                            + {tr("ui.app.new.chat.fca06b0")}
                          </button>
                          {/* 模块②：该员工与其他同事的私聊(镜像)。有才显示，带灰字标题 + 与上一块留间距，两块视觉独立。 */}
                          {empDms.length > 0 && <div className="tool-sub-grouplabel with-gap">{tr("ui.app.dms.with.teammates.dfb705d")}</div>}
                          {empDms.map((r: any) => {
                            const otherId = (r.members || []).find((m: string) => m !== e.id);
                            const other = teamEmployees.find((x: any) => x.id === otherId);
                            const onDm = appView === "rooms" && activeRoomId === r.id;
                            return (
                              <div
                                key={r.id}
                                role="button"
                                tabIndex={0}
                                className={"tool-sub-convo tool-sub-dm" + (onDm ? " on" : "")}
                                title={tr("ui.app.dm.with.75896e4", { p0: (lang !== "zh" ? employeeLabel(other, lang, otherId) : other?.name || otherId) })}
                                onClick={() => { setDmSelfId(e.id); setActiveRoomId(r.id); setAppView("rooms"); setAgiView(null); }}
                                onContextMenu={(ev) => { ev.preventDefault(); setTeamMenu({ x: ev.clientX, y: ev.clientY, kind: "dm", id: r.id, name: other?.name || otherId }); }}
                              >
                                <span className="tool-sub-av mini"><EmployeeAvatar icon={other?.icon} avatarData={other?.avatarData} name={employeeLabel(other, lang, otherId)} /></span>
                                <span className="tool-sub-convo-t">{employeeLabel(other, lang, otherId)}</span>
                                <span className="tool-sub-convo-tm">{relTime(r.updatedAt)}</span>
                                <button
                                  className="tool-sub-convo-del"
                                  title={tr("ui.app.delete.chat.3a8eb82")}
                                  onClick={(e) => { e.stopPropagation(); askConfirm({ message: tr("ui.app.delete.this.private.chat.8783704", { v0: (lang !== "zh" ? undefined : other?.name || otherId) }), danger: true, onOk: () => { void (window as any).wuwei?.team?.roomDelete?.(r.id); if (activeRoomId === r.id) { setActiveRoomId(null); setAppView("store"); } } }); }}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                                </button>
                              </div>
                            );
                          })}
                          {/* 模块③：该员工的定时任务。到点自动唤醒他按内容执行。 */}
                          <div className="tool-sub-grouplabel with-gap">{tr("ui.app.schedules.992b43d")}</div>
                          {empSchedules.map((s: any) => (
                            <div key={s.id} className="tool-sub-convo tool-sub-sched" title={schedTriggerText(s.trigger, lang !== "zh")}>
                              <span className={"sched-dot" + (s.enabled ? " on" : "")} />
                              <span className="tool-sub-convo-t">{s.name}</span>
                              <span className="tool-sub-convo-tm">{schedTriggerText(s.trigger, lang !== "zh")}</span>
                              <button className="tool-sub-convo-del" title={tr("set.st.editShort")} onClick={(ev) => { ev.stopPropagation(); setScheduleModal({ employeeId: e.id, task: s }); }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                              </button>
                            </div>
                          ))}
                          <button className="tool-sub-newconvo" onClick={() => setScheduleModal({ employeeId: e.id })}>
                            + {tr("ui.app.new.schedule.60e93cc")}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                  };
                  // 按部门分组：建了部门就分组显示(部门名 + 负责人标记)，没归属的落「未分组」；
                  // 一个部门都没建=扁平管理，直接平铺不显示分组头(2 人以上才建议建部门)。
                  const depts = [...teamDepartments].sort((a: any, b: any) => (a.order ?? 9999) - (b.order ?? 9999));
                  if (!depts.length) return sortedEmps.map(renderEmp);
                  const empById = new Map(sortedEmps.map((e: any) => [e.id, e]));
                  const assigned = new Set<string>();
                  const groups = depts.map((d: any) => {
                    const mems = (d.memberIds || [])
                      .map((id: string) => empById.get(id))
                      .filter(Boolean)
                      // 负责人置顶，其余按置顶/手动序。负责人名字后的「负责人」灰标在成员行里显示(见 renderEmp)。
                      .sort((a: any, b: any) => {
                        const ah = a.id === d.headId ? 1 : 0, bh = b.id === d.headId ? 1 : 0;
                        if (ah !== bh) return bh - ah;
                        return (b.pinnedAt || 0) - (a.pinnedAt || 0) || (a.order ?? 9999) - (b.order ?? 9999);
                      });
                    mems.forEach((m: any) => assigned.add(m.id));
                    return { dept: d, mems };
                  });
                  const ungrouped = sortedEmps.filter((e: any) => !assigned.has(e.id));
                  return (
                    <>
                      {groups.map(({ dept, mems }: any) => (
                        <div className="tool-dept" key={dept.id}>
                          <div className="tool-dept-head">
                            <span className="tool-dept-nm">{departmentLabel(dept, lang)}</span>
                            <span className="tool-dept-cnt">{mems.length}</span>
                          </div>
                          {mems.length === 0 ? <div className="tool-dept-empty">{tr("ui.app.no.members.yet.5e608a1")}</div> : mems.map(renderEmp)}
                        </div>
                      ))}
                      {ungrouped.length > 0 && (
                        <div className="tool-dept">
                          <div className="tool-dept-head">
                            <span className="tool-dept-nm tool-dept-nm-muted">{tr("ui.app.unassigned.c1fa93f")}</span>
                            <span className="tool-dept-cnt">{ungrouped.length}</span>
                          </div>
                          {ungrouped.map(renderEmp)}
                        </div>
                      )}
                    </>
                  );
                })()}
                {/* 群聊子板块头：独立展开/收起，后续群多了(按项目分)也清爽 */}
                <button
                  className="tool-sub-sec"
                  onClick={() => { const v = !groupsExpanded; setGroupsExpanded(v); localStorage.setItem("wuwei-groups-expanded", v ? "1" : "0"); }}
                >
                  <svg className={"tool-chev" + (groupsExpanded ? " open" : "")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                  <span className="tool-sub-sec-nm">{tr("ui.app.groups.f080cef")}</span>
                  <span className="tool-sub-sec-cnt">{teamRooms.filter((r:any)=>r.type!=="dm").length}</span>
                </button>
                {/* 群入口。私聊(type==="dm")不在这里列——它们镜像挂在各自参与员工的通讯录子列表下 */}
                {groupsExpanded && [...teamRooms].filter((r:any)=>r.type!=="dm").sort((a:any,b:any)=>(b.pinnedAt||0)-(a.pinnedAt||0)).map((r: any) => (
                  <button
                    key={r.id}
                    className={"tool-sub-item" + (appView === "rooms" && activeRoomId === r.id ? " on" : "")}
                    onClick={() => { setActiveRoomId(r.id); setAppView("rooms"); setAgiView(null); }}
                    onContextMenu={(ev) => { ev.preventDefault(); setTeamMenu({ x: ev.clientX, y: ev.clientY, kind: "room", id: r.id, name: r.name }); }}
                  >
                    <span className="tool-sub-stack">
                      {(r.members || []).slice(0, 3).map((mid: string) => {
                        const m = teamEmployees.find((x: any) => x.id === mid);
                        return <span className="tool-sub-av mini" key={mid}><EmployeeAvatar icon={m?.icon} avatarData={m?.avatarData} name={employeeLabel(m, lang, mid)} /></span>;
                      })}
                    </span>
                    <span className="tool-sub-nm">{tx(r.name)}</span>
                    <span className="tool-sub-cnt">{r.members?.length || 0}</span>
                  </button>
                ))}
                {groupsExpanded && teamRooms.filter((r:any)=>r.type!=="dm").length === 0 && (
                  <div className="tool-sub-hint">{tr("ui.app.right.click.to.add.group.7971838")}</div>
                )}
                {/* SOP 库子板块头：公司标准流程文档库（树形，可展开/折叠、右键管理、拖拽） */}
                <button
                  className="tool-sub-sec"
                  onClick={() => { const v = !sopExpanded; setSopExpanded(v); localStorage.setItem("wuwei-sop-expanded", v ? "1" : "0"); }}
                  onContextMenu={(ev) => { ev.preventDefault(); setTeamMenu({ x: ev.clientX, y: ev.clientY, kind: "sop-category" }); }}
                >
                  <svg className={"tool-chev" + (sopExpanded ? " open" : "")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                  <span className="tool-sub-sec-nm">{tr("ui.app.sops.c42d895")}</span>
                  <span className="tool-sub-sec-cnt">{sopTree.filter((n:any)=>n.kind==="sop").length}</span>
                </button>
                {sopExpanded && renderSopTree(undefined, 0)}
                {sopExpanded && sopTree.length === 0 && (
                  <div className="tool-sub-hint">{tr("ui.app.right.click.to.add.an.sop.717586a")}</div>
                )}
                {teamEmployees.length === 0 && teamRooms.length === 0 && (
                  <button className="tool-sub-empty" onClick={() => { setAppView("store"); setAgiView(null); }}>
                    {tr("ui.app.add.teammates.8ae67bb")}
                  </button>
                )}
              </div>
            )}
          </div>
          {showChats && (
            <div
              className="side-tools-resizer"
              onMouseDown={startToolsResize}
              onDoubleClick={() => { setToolsH(0); localStorage.removeItem("wuwei-tools-h"); }}
              title={tr("ui.app.drag.to.resize.double.click.to.971a87d")}
            />
          )}
          </>
        )}
        {/* 一人公司右键菜单：公司标题=新建/导入/建群；员工=私聊/编辑/置顶/删除；群=进入/置顶/删除 */}
        {teamMenu && (() => {
          const api = (window as any).wuwei?.team;
          const close = () => setTeamMenu(null);
          // 手动刷新：重拉员工/群/SOP（没等到自动广播时兜底，免得重启）
          const refreshTeam = () => {
            api?.rooms?.().then((r: any) => setTeamRooms(r?.rooms || []));
            api?.state?.().then((s: any) => { if (s) { setTeamEmployees(s.employees || []); setTeamDepartments(s.departments || []); } });
            api?.sopTree?.().then((r: any) => setSopTree(r?.tree || []));
            api?.scheduleList?.().then((r: any) => setSchedules(r?.schedules || []));
            close();
          };
          const pin = (kind: "employee" | "room", id: string) => {
            if (kind === "employee") void api?.employeePin?.(id);
            else void api?.roomPin?.(id);
            close();
          };
          const Item = ({ label, on, danger }: { label: string; on: () => void; danger?: boolean }) => (
            <button className={"team-cm-item" + (danger ? " danger" : "")} onClick={() => { on(); }}>{label}</button>
          );
          return (
            <>
              <div className="team-cm-mask" onClick={close} onContextMenu={(e) => { e.preventDefault(); close(); }} />
              <div className="team-cm" style={{ left: Math.min(teamMenu.x, window.innerWidth - 180), top: teamMenu.y }}>
                {teamMenu.kind === "company" && (<>
                  <Item label={tr("ui.app.add.teammate.a3a4d45")} on={() => { setAppView("store"); setAgiView(null); close(); }} />
                  <Item label={tr("ui.app.new.group.e0bb42b")} on={() => { setActiveRoomId(null); setAppView("rooms"); setAgiView(null); close(); }} />
                  <Item label={tr("set.title")} on={() => { setSettingsTab("team"); setShowSettings(true); close(); }} />
                  <Item label={tr("set.brain.refresh")} on={refreshTeam} />
                </>)}
                {teamMenu.kind === "employee" && (<>
                  <Item label={tr("ui.app.chat.98f8e01")} on={() => { void api?.chat?.(teamMenu.id); setAppView(null); setAgiView(null); close(); }} />
                  <Item label={tr("set.st.editShort")} on={() => { const emp = teamEmployees.find((x: any) => x.id === teamMenu.id); if (emp) setEditEmp(emp); close(); }} />
                  <Item label={tr("ui.app.pin.to.top.ebf047a")} on={() => pin("employee", teamMenu.id!)} />
                  <Item label={tr("set.brain.refresh")} on={refreshTeam} />
                  <Item danger label={tr("set.st.delShort")} on={() => { close(); askConfirm({ message: tr("ui.app.delete.53ff44e", { p0: teamMenu.name }), danger: true, onOk: () => { void api?.removeEmployee?.(teamMenu.id); } }); }} />
                </>)}
                {teamMenu.kind === "room" && (<>
                  <Item label={tr("ui.app.open.dc6a395")} on={() => { setActiveRoomId(teamMenu.id!); setAppView("rooms"); setAgiView(null); close(); }} />
                  <Item label={tr("ui.app.settings.c1e3e79")} on={() => { setRoomSettings({ id: teamMenu.id! }); close(); }} />
                  <Item label={tr("ui.app.pin.to.top.ebf047a")} on={() => pin("room", teamMenu.id!)} />
                  <Item danger label={tr("set.st.delShort")} on={() => { close(); askConfirm({ message: tr("ui.app.delete.group.5c64be3", { p0: teamMenu.name }), danger: true, onOk: () => { void api?.roomDelete?.(teamMenu.id); } }); }} />
                </>)}
                {teamMenu.kind === "dm" && (<>
                  <Item danger label={tr("ui.app.delete.chat.3a8eb82")} on={() => { close(); askConfirm({ message: tr("ui.app.delete.this.private.chat.8783704", { v0: (lang !== "zh" ? undefined : teamMenu.name) }), danger: true, onOk: () => { void api?.roomDelete?.(teamMenu.id); if (activeRoomId === teamMenu.id) { setActiveRoomId(null); setAppView("store"); } } }); }} />
                </>)}
                {/* SOP 类别（含顶层「SOP库」头：teamMenu.id 为空=在根建）：新建子类别/新建SOP/重命名/删除 */}
                {teamMenu.kind === "sop-category" && (<>
                  <Item label={tr("ui.app.new.subcategory.7feaadc")} on={() => { const pid = teamMenu.id; close(); askPrompt({ title: tr("ui.app.new.subcategory.7feaadc"), label: tr("ui.app.category.name.8ba8cd6"), placeholder: tr("ui.app.deployment.07b688c"), onOk: (nm) => { void api?.sopCreate?.("category", nm, pid); } }); }} />
                  <Item label={tr("ui.app.new.sop.275e292")} on={() => { const pid = teamMenu.id; close(); askPrompt({ title: tr("ui.app.new.sop.275e292"), label: tr("ui.app.sop.title.6ade855"), placeholder: tr("ui.app.deploy.to.vercel.b7a8e9c"), onOk: async (nm) => { const key = nm.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || undefined; const r = await api?.sopCreate?.("sop", nm, pid, { taskKey: key }); if (r?.exists) { const eid = r?.node?.id; askConfirm({ title: tr("ui.app.sop.already.exists.63f7566"), message: tr("ui.app.one.process.one.sop.open.the.afdc60b"), okText: tr("ui.app.open.dd010a1"), onOk: () => { if (eid) { setActiveSopId(eid); setAppView("sop"); setAgiView(null); } } }); return; } if (r?.node?.id) { setActiveSopId(r.node.id); setAppView("sop"); setAgiView(null); } if (pid) setSopCatOpen((s) => new Set(s).add(pid)); } }); }} />
                  {teamMenu.id && <Item label={tr("ui.app.rename.f510124")} on={() => { const id = teamMenu.id, cur = teamMenu.name; close(); askPrompt({ title: tr("ui.app.rename.f510124"), label: tr("ui.app.new.name.a3abdaf"), defaultValue: cur, onOk: (nm) => { void api?.sopRename?.(id, nm); } }); }} />}
                  {teamMenu.id && <Item danger label={tr("set.st.delShort")} on={() => { const id = teamMenu.id, nm = teamMenu.name; close(); askConfirm({ message: tr("ui.app.delete.category.and.everything.inside.f548450", { p0: nm }), danger: true, onOk: () => { void api?.sopDelete?.(id); } }); }} />}
                  <Item label={tr("set.brain.refresh")} on={() => { api?.sopTree?.().then((r: any) => setSopTree(r?.tree || [])); close(); }} />
                </>)}
                {/* 单个 SOP：重命名/删除（新建子项走类别菜单） */}
                {teamMenu.kind === "sop" && (<>
                  <Item label={tr("ui.app.open.a211eef")} on={() => { close(); setActiveSopId(teamMenu.id!); setAppView("sop"); setAgiView(null); }} />
                  <Item label={tr("ui.app.rename.f510124")} on={() => { const id = teamMenu.id, cur = teamMenu.name; close(); askPrompt({ title: tr("ui.app.rename.f510124"), label: tr("ui.app.new.name.a3abdaf"), defaultValue: cur, onOk: (nm) => { void api?.sopRename?.(id, nm); } }); }} />
                  <Item danger label={tr("set.st.delShort")} on={() => { const id = teamMenu.id, nm = teamMenu.name; close(); askConfirm({ message: tr("ui.app.delete.sop.15e6a37", { p0: nm }), danger: true, onOk: () => { void api?.sopDelete?.(id); if (activeSopId === id) { setActiveSopId(null); setAppView(null); } } }); }} />
                </>)}
              </div>
            </>
          );
        })()}
        {showChats && (<>
        <button className="new-session" onClick={() => { void window.wuwei.track?.("new_chat"); window.wuwei.newSession(); }}>
          {t("session.new")}
        </button>
        {/* AGI 板块：数字婴儿入口(迁自 minicc)。默认隐藏，设置里开 */}
        {agiEnabled && (
        <div className="agi-panel">
          <div className="agi-head" onClick={() => { const v = !agiExpanded; setAgiExpanded(v); localStorage.setItem("minicc-agi-expanded", v ? "1" : "0"); }}>
            <span className="agi-title">
              <svg className="agi-glyph" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 4.5a3 3 0 0 0-3 3 2.6 2.6 0 0 0-1.4 4.6A2.6 2.6 0 0 0 9 16.8a3 3 0 0 0 3 1.7" />
                <path d="M12 4.5a3 3 0 0 1 3 3 2.6 2.6 0 0 1 1.4 4.6A2.6 2.6 0 0 1 15 16.8a3 3 0 0 1-3 1.7" />
                <path d="M12 4.5v14" />
              </svg>
              AGI
            </span>
            <span className="agi-caret">{agiExpanded ? "▾" : "▸"}</span>
          </div>
          {agiExpanded && (
            <div className="agi-items">
              {babyExists ? (
                <div className={"agi-item" + (agiView === "baby" ? " active" : "")}>
                  <span className="agi-item-name" onClick={openBaby} title={tr("ui.app.open.digital.baby.eaa504f")}>
                    <BabyGlyph />
                    {tr("ui.app.digital.baby.4f3790f")}
                  </span>
                  <span className="agi-item-del" title={tr("ui.app.remove.f2814ee")} onClick={deleteBaby}>✕</span>
                </div>
              ) : (
                <div className="agi-add" onClick={createBaby} title={tr("ui.app.add.digital.baby.1ead128")}>＋ {tr("ui.app.add.digital.baby.e0d2f13")}</div>
              )}
            </div>
          )}
        </div>
        )}
        <div className="session-list">
          {sessions.filter((s) => !s.employeeId).length === 0 && <div className="empty">{tr("ui.app.no.conversations.yet.b8bca7a")}</div>}
          {(() => {
            const byGroup = new Map<string, SessionMeta[]>();
            for (const s of sessions) {
              if (s.employeeId) continue; // 员工私聊会话不进普通列表，归一人公司板块下
              const g = groupOf(s);
              if (!byGroup.has(g)) byGroup.set(g, []);
              byGroup.get(g)!.push(s);
            }
            // 组顺序：手动=groups 顺序(新组置顶)；日期=按时间桶权重；项目=按最新会话时间
            let orderedGroups: string[];
            if (groupMode === "date") {
              orderedGroups = [...byGroup.keys()]
                .filter((g) => g !== "")
                .sort(
                  (a, b) =>
                    dateRank(a) - dateRank(b) ||
                    Math.max(...byGroup.get(b)!.map((s) => s.updatedAt)) -
                      Math.max(...byGroup.get(a)!.map((s) => s.updatedAt)),
                );
            } else if (groupMode === "project") {
              orderedGroups = [...byGroup.keys()]
                .filter((g) => g !== "")
                .sort(
                  (a, b) =>
                    Math.max(...byGroup.get(b)!.map((s) => s.updatedAt)) -
                    Math.max(...byGroup.get(a)!.map((s) => s.updatedAt)),
                );
            } else {
              orderedGroups = groups.filter((g) => byGroup.has(g));
            }
            const manual = groupMode === "manual";
            const renderRow = (s: SessionMeta, list: SessionMeta[]) => (
              <div
                key={s.id}
                className={
                  "session-item" +
                  (s.id === currentId ? " active" : "") +
                  (s.done ? " done" : "") +
                  (s.id === dragId ? " dragging" : "") +
                  (s.id === dragOverId ? " drag-over" : "")
                }
                draggable
                onDragStart={(e) => {
                  setDragId(s.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragId && dragId !== s.id) setDragOverId(s.id);
                }}
                onDragLeave={() => setDragOverId((v) => (v === s.id ? null : v))}
                onDrop={(e) => dropOnSession(e, s, list)}
                onDragEnd={() => {
                  setDragId(null);
                  setDragOverId(null);
                }}
                onClick={() => window.wuwei.switchSession(s.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setGroupInputSid(null);
                  setCtxMenu({ sid: s.id, x: e.clientX, y: e.clientY });
                }}
              >
                {runningSet.has(s.id) && <span className="s-run" title={t("thinking.running")} />}
                {s.priorityTag && (
                  <span
                    className={"s-prio p" + (s.priority || 0)}
                    title={PRIO_TITLE[s.priorityTag] || s.priorityTag}
                  >
                    {s.priorityTag}
                  </span>
                )}
                {s.discuss && <span className="s-discuss" title={t("side.discuss")}>{t("side.discussBadge")}</span>}
                {s.done && <span className="s-done" title={t("side.done")}>✓</span>}
                <span className="s-title">{tx(s.title)}</span>
                <span className="s-time" title={new Date(s.updatedAt).toLocaleString()}>
                  {relTime(s.updatedAt)}
                </span>
                <button
                  className="s-del"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.wuwei.deleteSession(s.id);
                  }}
                >
                  ×
                </button>
              </div>
            );
            return (
              <>
                {orderedGroups.map((g) => {
                  const collapsed = collapsedGroups.has(g);
                  const rows = sortRows(byGroup.get(g)!);
                  return (
                    <div key={"g:" + g} className="session-group">
                      <div
                        className={
                          "group-head" +
                          (g === dragOverGroup ? " g-drag-over" : "") +
                          (g === dragGroup ? " g-dragging" : "")
                        }
                        draggable={manual}
                        onDragStart={
                          manual
                            ? (e) => {
                                setDragGroup(g);
                                e.stopPropagation();
                                e.dataTransfer.effectAllowed = "move";
                              }
                            : undefined
                        }
                        onDragOver={
                          manual
                            ? (e) => {
                                if (dragGroup && dragGroup !== g) {
                                  e.preventDefault();
                                  setDragOverGroup(g);
                                }
                              }
                            : undefined
                        }
                        onDragLeave={
                          manual ? () => setDragOverGroup((v) => (v === g ? null : v)) : undefined
                        }
                        onDrop={manual ? (e) => dropOnGroup(e, g, orderedGroups) : undefined}
                        onDragEnd={
                          manual
                            ? () => {
                                setDragGroup(null);
                                setDragOverGroup(null);
                              }
                            : undefined
                        }
                        onClick={() =>
                          setCollapsedGroups((prev) => {
                            const n = new Set(prev);
                            if (n.has(g)) n.delete(g);
                            else n.add(g);
                            return n;
                          })
                        }
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setGroupCtx({ name: g, x: e.clientX, y: e.clientY });
                        }}
                      >
                        <span className="group-caret">{collapsed ? "▸" : "▾"}</span>
                        <span className="group-name" title={g}>
                          {tx(g)}
                        </span>
                        <span className="group-count">{rows.length}</span>
                      </div>
                      {!collapsed && rows.map((s) => renderRow(s, rows))}
                    </div>
                  );
                })}
                {(() => {
                  const un = sortRows(byGroup.get("") || []);
                  return un.map((s) => renderRow(s, un));
                })()}
              </>
            );
          })()}
        </div>
        </>)}
        {ctxMenu &&
          (() => {
            const s = sessions.find((x) => x.id === ctxMenu.sid);
            if (!s) return null;
            // 员工私聊会话：分组/优先级/四象限/完成/讨论都只作用在普通历史列表，员工会话不进那个列表(见下方 s.employeeId 过滤)，
            // 这些项点了没有任何效果，故对员工会话隐藏，只保留作用在会话本身的交接/总目标/查看历史。
            const isEmp = !!s.employeeId;
            const close = () => {
              setCtxMenu(null);
              setGroupInputSid(null);
              setNewGroupName("");
            };
            const move = (g: string | null) => {
              window.wuwei.setSessionGroup(ctxMenu.sid, g);
              close();
            };
            return (
              <>
                <div
                  className="ctx-overlay"
                  onClick={close}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    close();
                  }}
                />
                <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
                  <button
                    className="ctx-item ctx-ico"
                    disabled={handoffBusy}
                    onClick={async () => {
                      const sid = ctxMenu.sid;
                      close();
                      setHandoffBusy(true);
                      try {
                        const r = await window.wuwei.handoffSession(sid);
                        if (!r?.ok)
                          push({ type: "notice", text: tr("ui.app.handoff.failed.nothing.to.distill.from.1100e99") });
                        else if (r.goalCarried && r.newId) {
                          // 源会话带总目标 → 新会话自动开智能继续，交接后接着朝目标自主推进
                          setMode(r.newId, "cont");
                          push({ type: "notice", text: tr("ui.app.goal.carried.to.the.new.chat.cd9ecfd") });
                        }
                      } finally {
                        setHandoffBusy(false);
                      }
                    }}
                    title={t("ctx.handoffTip")}
                  >
                    <HandoffIcon />
                    <span>{t("ctx.handoff")}</span>
                  </button>
                  <div className="ctx-sep" />
                  <button
                    className="ctx-item ctx-ico"
                    title={tr("ui.app.set.an.overall.goal.for.this.42a5121")}
                    onClick={() => {
                      const sid = ctxMenu.sid;
                      close();
                      window.wuwei.goalGet?.(sid)
                        .then((g) => openGoalEdit(sid, g))
                        .catch(() => openGoalEdit(sid, null));
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="8" />
                      <circle cx="12" cy="12" r="3.4" />
                    </svg>
                    <span>{tr("ui.app.set.overall.goal.846f9cb")}</span>
                  </button>
                  <button
                    className="ctx-item ctx-ico"
                    title={tr("ui.app.view.the.full.conversation.including.exchanges.655d876")}
                    onClick={() => {
                      const sid = ctxMenu.sid;
                      const title = sessions.find((x) => x.id === sid)?.title || (tr("ui.app.conversation.b284fab"));
                      close();
                      openHistory(sid, title);
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H18a2 2 0 0 1 2 2v11.5a1.5 1.5 0 0 1-1.5 1.5H7a3 3 0 0 1-3-3V5.5z" />
                      <path d="M8 8.5h8M8 12h8M8 15.5h5" />
                    </svg>
                    <span>{tr("ui.app.view.full.history.17b4cd4")}</span>
                  </button>
                  {!isEmp && (
                  <>
                  <div className="ctx-sep" />
                  <button
                    className="ctx-item ctx-ico ctx-done"
                    onClick={() => {
                      window.wuwei.setSessionDone(ctxMenu.sid, !s.done);
                      close();
                    }}
                  >
                    <DoneIcon />
                    <span>{s.done ? t("ctx.markUndone") : t("ctx.markDone")}</span>
                  </button>
                  <button
                    className="ctx-item ctx-ico ctx-discuss"
                    onClick={() => {
                      window.wuwei.setSessionDiscuss(ctxMenu.sid, !s.discuss);
                      close();
                    }}
                  >
                    <DiscussIcon />
                    <span>{s.discuss ? t("ctx.unmarkDiscuss") : t("ctx.markDiscuss")}</span>
                  </button>
                  <div className="ctx-sep" />
                  <div className="ctx-head">{t("ctx.moveToGroup")}</div>
                  {groups
                    .filter((g) => g !== s.group)
                    .map((g) => (
                      <button key={g} className="ctx-item" onClick={() => move(g)}>
                        {g}
                      </button>
                    ))}
                  {s.group && (
                    <button className="ctx-item" onClick={() => move(null)}>
                      {t("ctx.moveOut").replace("{g}", s.group)}
                    </button>
                  )}
                  {groupInputSid === ctxMenu.sid ? (
                    <input
                      className="ctx-input"
                      autoFocus
                      placeholder={t("ctx.newGroupPlaceholder")}
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newGroupName.trim()) move(newGroupName.trim());
                        if (e.key === "Escape") {
                          setGroupInputSid(null);
                          setNewGroupName("");
                        }
                      }}
                    />
                  ) : (
                    <button
                      className="ctx-item ctx-ico ctx-new"
                      onClick={() => {
                        setGroupInputSid(ctxMenu.sid);
                        setNewGroupName("");
                      }}
                    >
                      <PlusIcon />
                      <span>{t("ctx.newGroup")}</span>
                    </button>
                  )}
                  <div className="ctx-sep" />
                  <div className="ctx-head">{t("ctx.priority")}</div>
                  <div className="ctx-prio">
                    <button
                      className={"ctx-prio-b" + (!s.priorityTag ? " on" : "")}
                      onClick={() => {
                        window.wuwei.setSessionPriority(ctxMenu.sid, 0, "");
                        close();
                      }}
                    >
                      {t("ctx.prioNone")}
                    </button>
                    {PRIO_HL.map((p) => (
                      <button
                        key={p.tag}
                        className={"ctx-prio-b" + (s.priorityTag === p.tag ? " on" : "")}
                        onClick={() => {
                          window.wuwei.setSessionPriority(ctxMenu.sid, p.weight, p.tag);
                          close();
                        }}
                      >
                        {lang !== "zh" ? p.labelEn : p.label}
                      </button>
                    ))}
                  </div>
                  <div className="ctx-head">{t("ctx.quadrant")}</div>
                  <div className="ctx-quad">
                    {PRIO_QUAD.map((p) => (
                      <button
                        key={p.tag}
                        className={"ctx-quad-b p" + p.weight + (s.priorityTag === p.tag ? " on" : "")}
                        onClick={() => {
                          window.wuwei.setSessionPriority(ctxMenu.sid, p.weight, p.tag);
                          close();
                        }}
                      >
                        {lang !== "zh" ? p.labelEn : p.label}
                      </button>
                    ))}
                  </div>
                  </>
                  )}
                </div>
              </>
            );
          })()}
        {groupCtx &&
          (() => {
            const close = () => setGroupCtx(null);
            return (
              <>
                <div
                  className="ctx-overlay"
                  onClick={close}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    close();
                  }}
                />
                <div className="ctx-menu" style={{ left: groupCtx.x, top: groupCtx.y }}>
                  <div className="ctx-head">{tr("ui.app.group.c7680a9", { p0: groupCtx.name })}</div>
                  <button
                    className="ctx-item ctx-ico ctx-new"
                    onClick={() => {
                      const ids = sessions.filter((s) => groupOf(s) === groupCtx.name).map((s) => s.id);
                      window.wuwei.generateReport(groupCtx.name, ids);
                      close();
                    }}
                  >
                    <ReportIcon />
                    <span>{tr("ui.app.generate.daily.report.68bd935")}</span>
                  </button>
                </div>
              </>
            );
          })()}
        {trash.length > 0 && (
          <button
            className="trash-entry"
            title={tr("ui.app.trash.deleted.chats.are.here.restorable.76c556e")}
            onClick={() => setShowTrash(true)}
          >
            <TrashIcon /> {tr("ui.app.trash.54c3cd7")} <span className="trash-count">{trash.length}</span>
          </button>
        )}
        {(() => {
          const name =
            account.nickname || account.email || account.label || (account.loggedIn ? (tr("ui.app.signed.in.0ea6d5a")) : (tr("ui.app.not.signed.in.3252057")));
          return (
            <>
              {/* 下载进度：正在下载新版时显示实时百分比进度条（下载完成后由「发现新版本」药丸接替） */}
              {dlProgress && !updateReady && (
                <div style={{ padding: "0 10px", marginTop: 12, marginBottom: 4, WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "var(--text-dim)", marginBottom: 6 }}>
                      <span>{tr("ui.app.new.version.downloading.56c60e0", { p0: dlVer ? ` v${dlVer}` : "" })}</span>
                      <span>{dlProgress.percent}%</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 999, background: "var(--bg-raised)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${dlProgress.percent}%`, background: "var(--accent)", transition: "width .2s" }} />
                    </div>
                  </div>
                </div>
              )}
              {/* 更新药丸：新版下载好即独立悬浮在账号分隔线之上（不属于账号边框）；点整卡=弹升级窗(不直接重启)，点右上角叉=关闭该版本不再提示 */}
              {updateReady && updateReady.version !== updateChipHidden && (
                <div style={{ padding: "0 10px", marginTop: 12, marginBottom: 10, position: "relative", zIndex: 1, WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                  <div
                    className="update-chip"
                    role="button"
                    onClick={() => setShowUpdateModal(true)}
                    title={tr("ui.app.new.version.available.0001bc0", { p0: updateReady.version })}
                  >
                    <span className="update-chip__icon">
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 16.5V8" />
                        <path d="M8.5 11.5 12 8l3.5 3.5" />
                      </svg>
                    </span>
                    <span className="update-chip__text">
                      <span className="update-chip__title">{tr("ui.app.new.version.191f526")}</span>
                      <span className="update-chip__ver">v{updateReady.version}</span>
                    </span>
                    <span className="update-chip__arrow">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </span>
                    <button
                      className="update-chip__x"
                      onClick={(e) => { e.stopPropagation(); const v = updateReady.version; setUpdateChipHidden(v); try { localStorage.setItem("wuwei_dismissed_update_chip", v); } catch {} }}
                      title={tr("ui.app.dismiss.900510d")}
                      aria-label={tr("ui.app.dismiss.900510d")}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            <div className="sidebar-foot">
              {/* 订阅版入口（C2 占位）：默认隐藏，仅当后端 flags 含 "subscription" 才出现。
                  后台可按用户名/机器指纹对指定客户端单独放开——判定全在后端，客户端只渲染。 */}
              {showSubscription && (
                <button
                  onClick={() => push({ type: "notice", text: tr("ui.app.subscription.entry.rollout.enabled.subscription.page.045d69f") })}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    width: "100%",
                    padding: "6px 8px",
                    marginBottom: 6,
                    borderRadius: 8,
                    background: "none",
                    border: "1px solid #C05F3C",
                    color: "#F4F6F8",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: "#C05F3C" }}>✨</span> {tr("ui.app.subscription.8e99882")}
                </button>
              )}
              <button className="acct-btn" onClick={() => setShowAcctMenu((v) => !v)}>
                <div className={"acct-av" + (wuwei ? "" : " off")}>
                  {/* 未登录的头像首字也要跟语言：中文「游」/英文 G，别让英文界面里冒出个汉字 */}
                  <UserAvatar
                    url={wuwei?.user.avatar}
                    fallback={(wuwei?.user.name || wuwei?.user.email || t("acct.guestInitial")).slice(0, 1).toUpperCase()}
                  />
                </div>
                <div
                  className="acct-name"
                  title={wuwei ? wuwei.user.name || wuwei.user.email || (tr("ui.app.wuwei.user.c08095c")) : t("acct.notLoggedIn")}
                >
                  {wuweiBusy ? (tr("usage.loggingIn")) : wuwei ? wuwei.user.name || wuwei.user.email || (tr("ui.app.wuwei.user.c08095c")) : t("acct.guest")}
                </div>
                <span className="acct-caret">⋯</span>
                {/* 未读消息红点：菜单收起时也常驻可见，否则用户根本不知道有站内消息（回访/奖励/活动通知）。
                    菜单展开后消息中心项自带数字红点，这里就不重复显示。 */}
                {msgUnread > 0 && !showAcctMenu && (
                  <span className="acct-unread">{msgUnread > 99 ? "99+" : msgUnread}</span>
                )}
              </button>
              {showAcctMenu && (
                <>
                  <div className="mq-overlay" onClick={() => setShowAcctMenu(false)} />
                  <div className="acct-menu">
                    {/* 无为账号（与模型商账号合并进同一入口）。未登录只给登录入口，设置等登录后才显示 */}
                    {wuwei ? (
                      (() => {
                        const tier = wuwei.membership?.tier ?? "free";
                        const isPro = tier !== "free";
                        // 徽标/会员条：主标显档位名(Pro/Plus/Max，后端按套餐档给)，档位(月付/年付)作小灰字
                        const tierMain = tier === "free" ? (tr("ui.app.free.42f9771")) : (wuwei.membership?.plan || "Pro");
                        const tierQual = tier === "pro_year" ? ("yearly") : tier === "pro_month" ? ("monthly") : "";
                        const tierLabel = tierMain + (tierQual ? " " + tierQual : "");
                        const exp = wuwei.membership?.expireAt;
                        const expStr = exp ? new Date(exp).toISOString().slice(0, 10) : "";
                        // 快到期(≤7天)才提示到期日 + 续费按钮；刚买还早就别催，只显「生效中」
                        const daysLeft = exp ? Math.ceil((new Date(exp).getTime() - Date.now()) / 86400000) : Infinity;
                        const nearExpiry = daysLeft <= 7;
                        const bal = wuwei.coin.balance;
                        // 充值/升级统一走这个支付弹窗(browse 态：顶部显示「选择你的套餐」而非「无为币不足」)。
                        const openBrowsePay = (item: string) => {
                          void window.wuwei.track?.("menu_item_click", { item });
                          setShowAcctMenu(false);
                          // 立即弹窗(用本地已知余额)，不等网络——弹窗内容是同步的，无需 await。
                          setCoinShortage({ message: "browse", balance: wuwei?.coin.balance, browse: true });
                          shortageShownAt.current = Date.now();
                          // 后台刷新最新余额，到了自动更新弹窗里的余额显示。
                          void window.wuwei.wuweiMe().then((me) => {
                            if (!me) return;
                            setWuwei(me);
                            setCoinShortage((cur) => (cur ? { ...cur, balance: me.coin.balance } : cur));
                          }).catch(() => {});
                        };
                        const openPack = () => void openBrowsePay("topup"); // 充值 → 统一支付弹窗
                        const openPlan = () => void openBrowsePay("upgrade"); // 开通/续费 → 统一支付弹窗
                        // 已登录但没昵称/邮箱时的兜底首字：中文取「无」(无为)，英文取 W
                        const initial = (wuwei.user.name || wuwei.user.email || t("acct.userInitial")).slice(0, 1).toUpperCase();
                        const Spark = () => (
                          <svg className="acct-spark" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                            <path d="M8 1.4l1.5 5.1 5.1 1.5-5.1 1.5L8 14.6 6.5 9.5 1.4 8l5.1-1.5z" />
                          </svg>
                        );
                        return (
                          <>
                            {/* 身份区：头像(Pro金光晕) + 昵称 + tier chip + 邮箱 */}
                            <div className="acct-id">
                              <div className={"acct-avatar" + (isPro ? " pro" : "")}>
                                <UserAvatar url={wuwei.user.avatar} fallback={initial} />
                              </div>
                              <div className="acct-id-txt">
                                <div className="acct-nm">
                                  <span className="acct-name">{wuwei.user.name || wuwei.user.email || (tr("ui.app.wuwei.user.c08095c"))}</span>
                                  {/* 顶部 chip 只显 Pro/Free 主标；月付/年付档位交给下方会员卡，避免同一行重复又过长 */}
                                  <span className={"acct-tier " + (isPro ? "pro" : "free")}>
                                    {isPro && <Spark />}
                                    {tierMain}
                                  </span>
                                </div>
                                {wuwei.user.email && <div className="acct-mail">{wuwei.user.email}</div>}
                              </div>
                            </div>

                            {/* 无为币钱包卡 */}
                            <div className="acct-wallet">
                              <button
                                type="button"
                                className={"acct-balance-refresh" + (balanceRefresh.busy ? " busy" : "")}
                                disabled={balanceRefresh.busy}
                                aria-label={tr("ui.app.refresh.balance.d87c149")}
                                aria-busy={balanceRefresh.busy}
                                title={balanceRefresh.busy ? (tr("ui.app.refreshing.balance.fab873f"))
                                  : balanceRefresh.error ? (tr("ui.app.refresh.failed.click.to.retry.713077a"))
                                  : balanceRefresh.updatedAt ? (tr("ui.app.refresh.balance.updated.579ef27")) + new Date(balanceRefresh.updatedAt).toLocaleTimeString(getCurrentLanguage(), { hour12: false })
                                  : (tr("ui.app.refresh.balance.d87c149"))}
                                onClick={() => { void accountRefreshRef.current!.refresh(); }}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M20 7v5h-5M4 17v-5h5" />
                                  <path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17" />
                                </svg>
                              </button>
                              <div className="acct-wallet-row">
                                <div>
                                  <div className="acct-wallet-lbl">
                                    <CoinIcon size={14} /> {t("usage.coinBal")}
                                  </div>
                                  <div className="acct-bal">
                                    {formatCredits(bal)}
                                  </div>
                                </div>
                                {bal <= 0 && !isPro && (
                                  <button className="acct-topup" onClick={openPack}>
                                    {tr("menu.donate")}
                                  </button>
                                )}
                              </div>
                              {balanceRefresh.error && <div className="acct-balance-refresh-error" role="status">{tr("ui.app.could.not.refresh.try.again.ab58e97")}</div>}
                              {/* 签到按钮永远显示：0 余额非会员反而最该签到领免费币，不能因 bal<=0 把它藏掉。
                                  0 余额非会员额外在下方追加充值引导。 */}
                              <button
                                type="button"
                                className={"acct-checkin" + (checkinDone ? " done" : "")}
                                disabled={checkinDone || checkinBusy}
                                onClick={doCheckin}
                                title={
                                  checkinDone
                                    ? t("menu.checkedInTitle")
                                    : isPro
                                      ? t("menu.hintProGift")
                                      : t("menu.hintDailyCheckin")
                                }
                              >
                                {checkinBusy ? <span className="acct-checkin-spin" aria-hidden="true" /> : checkinDone ? <CheckinDoneIcon size={13} /> : <CheckinIcon size={13} />}
                                <span>{checkinBusy ? t("menu.checkinBusy") : checkinDone ? t("menu.checkedInShort") : t("menu.checkinShort")}</span>
                              </button>
                              {bal <= 0 && !isPro && (
                                <div className="acct-hint zero">{t("menu.hintTopup")}</div>
                              )}
                            </div>

                            {/* 会员条：Pro 平时不显(顶部 chip 已标档位，避免重复)，仅快到期(≤7天)时作续费提醒出现；免费=靛青升级引导 */}
                            {isPro ? (
                              nearExpiry ? (
                                <div className="acct-memb on">
                                  <div>
                                    <div className="acct-memb-ttl">
                                      <Spark /> {tierMain}{tierQual && <span className="acct-tier-q">{tierQual}</span>}
                                    </div>
                                    <div className="acct-memb-sub">
                                      {tr("ui.app.expires.ab9cb0a", { p0: expStr })}
                                    </div>
                                  </div>
                                  <button className="acct-renew" onClick={openPlan}>
                                    {tr("ui.app.renew.2d5e514")}
                                  </button>
                                </div>
                              ) : null
                            ) : bal <= 0 ? (
                              // 只在无为币用完(余额=0)后才推会员——自然的升级时机，不打扰仍有币的用户
                              <div className="acct-memb up" onClick={openPlan}>
                                <div>
                                  <div className="acct-memb-ttl">
                                    <span className="acct-crown">
                                      <Spark />
                                    </span>{" "}
                                    {tr("ui.app.upgrade.to.pro.21a61f3")}
                                  </div>
                                  <div className="acct-memb-sub">{tr("ui.app.more.quota.better.value.from.mo.c4f58cd")}</div>
                                </div>
                                <span className="acct-go">{tr("ui.app.upgrade.now.3da50eb")}</span>
                              </div>
                            ) : null}

                            <div className="acct-sep" />
                            <div className="acct-items">
                              {(wuwei.flags?.includes('billing_v2') || billingPreview) && <button className="acct-it" onClick={()=>{setShowAcctMenu(false);setBillingPage('ledger');setBillingOpen(true);}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>{tr("ui.app.credit.details.a3a619a")}</button>}
                              <button className="acct-it" onClick={openPack}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="5" width="18" height="14" rx="2.5" />
                                  <path d="M3 10h18M7 15h4" />
                                </svg>
                                {t("menu.donate")}
                              </button>
                              <button
                                className="acct-it"
                                onClick={() => {
                                  void window.wuwei.track?.("menu_item_click", { item: "settings" });
                                  setShowAcctMenu(false);
                                  setSettingsTab("general");
                                  setShowSettings(true);
                                }}
                              >
                                <GearIcon size={16} />
                                {t("acct.settings")}
                              </button>
                              {/* 消息中心：奖励到账/活动/系统/反馈回复通知；有未读标红点 */}
                              <button
                                className="acct-it"
                                onClick={() => {
                                  void window.wuwei.track?.("menu_item_click", { item: "messages" });
                                  setShowAcctMenu(false);
                                  setShowMsgCenter(true);
                                }}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                                  <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                                </svg>
                                <span style={{ flex: 1, textAlign: "left", whiteSpace: "nowrap" }}>{tr("ui.app.messages.adbff5a")}</span>
                                {msgUnread > 0 && (
                                  <span style={{ flex: "0 0 auto", fontSize: 10, fontWeight: 700, color: "#fff", background: "#E5484D", borderRadius: 999, padding: "1px 6px", minWidth: 16, textAlign: "center", whiteSpace: "nowrap" }}>
                                    {msgUnread > 99 ? "99+" : msgUnread}
                                  </span>
                                )}
                              </button>
                              {/* 使用手册：新用户从0把无为玩透（模式/右键秘技/总目标/脑网络/会员…），中英文 */}
                              <button
                                className="acct-it"
                                onClick={() => {
                                  void window.wuwei.track?.("menu_item_click", { item: "guide" });
                                  setShowAcctMenu(false);
                                  setShowGuide(true);
                                }}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v18H6.5A2.5 2.5 0 0 1 4 18.5V5.5z" />
                                  <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H12v18h5.5a2.5 2.5 0 0 0 2.5-2.5V5.5z" />
                                </svg>
                                {tr("ui.app.user.guide.f2562f4")}
                              </button>

                              <button
                                className="acct-it"
                                onClick={() => {
                                  void window.wuwei.track?.("menu_item_click", { item: "support" });
                                  setShowAcctMenu(false);
                                  setShowSupportChat(true); // 账号菜单「联系客服」直接开在线对话窗（实时收发）
                                }}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
                                  <rect x="3" y="13" width="4" height="6" rx="1.5" />
                                  <rect x="17" y="13" width="4" height="6" rx="1.5" />
                                  <path d="M20 19a4 4 0 0 1-4 4h-2" />
                                </svg>
                                {t("menu.contactSupport")}
                              </button>
                              {/* 留言反馈：直接开留言弹窗（被采纳有奖）；与客服弹窗内「直接留言」共用同一表单 */}
                              <button
                                className="acct-it"
                                onClick={() => {
                                  void window.wuwei.track?.("menu_item_click", { item: "feedback" });
                                  setShowAcctMenu(false);
                                  setLeaveMsgFromSupport(false);
                                  setShowLeaveMsg(true);
                                }}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M21 11.5a8.5 8.5 0 0 1-11.7 7.9L4 20l1.4-4A8.5 8.5 0 1 1 21 11.5z" />
                                  <path d="M8.5 11.5h7M8.5 8.5h4" />
                                </svg>
                                {t("menu.feedback")}
                              </button>
                              {/* 帮助 · 检查更新：平时只显「更新」，有新版才标小红点；点击弹窗看结果/版本信息 */}
                              <button className="acct-it" onClick={() => { void window.wuwei.track?.("menu_item_click", { item: "update" }); return updateReady ? (setShowAcctMenu(false), setShowUpdateModal(true)) : checkUpdateNow(); }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <circle cx="12" cy="12" r="9" />
                                  <path d="M9.5 9a2.5 2.5 0 0 1 4.5 1.5c0 1.5-2 2-2 2.5" />
                                  <circle cx="12" cy="16.5" r="0.5" fill="currentColor" />
                                </svg>
                                <span style={{ flex: 1, textAlign: "left", whiteSpace: "nowrap" }}>{tr("ui.app.updates.c50e856")}</span>
                                {hasUpdate && (
                                  <span style={{ flex: "0 0 auto", fontSize: 10, fontWeight: 700, color: "#fff", background: "#E5484D", borderRadius: 999, padding: "1px 6px", whiteSpace: "nowrap" }}>
                                    {tr("ui.app.new.c00956e")}
                                  </span>
                                )}
                              </button>
                              <button
                                className="acct-it danger"
                                onClick={() => {
                                  void window.wuwei.track?.("menu_item_click", { item: "logout" });
                                  setShowAcctMenu(false);
                                  void doWuweiLogout();
                                }}
                              >
                                <LogoutIcon size={16} />
                                {t("acct.logout")}
                              </button>
                            </div>
                          </>
                        );
                      })()
                    ) : (
                      <div style={{ padding: "20px 18px 12px", textAlign: "center", position: "relative" }}>
                        {/* 小地球语言切换：右上角，点开选中/英，即时切界面语言(主要给快速测试)。后台可开关 */}
                        {langSwitchOnCard && (
                          <div style={{ position: "absolute", top: 8, right: 10, zIndex: 6 }}>
                            <button
                              onClick={() => setAcctLangOpen((v) => !v)}
                              title={tr("ui.app.language.f4b9f0e")}
                              style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0 }}
                            >
                              <GlobeIcon size={15} />
                            </button>
                            {acctLangOpen && (
                              <div style={{ position: "absolute", top: 26, right: 0, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,.18)", overflow: "hidden", zIndex: 7, minWidth: 78 }}>
                                {getLanguages().map(({code, nativeName: label}) => (
                                  <button
                                    key={code}
                                    data-language-name={code}
                                    onClick={() => { changeLang(code); setAcctLangOpen(false); }}
                                    style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 12px", background: lang === code ? "rgba(192,95,60,.10)" : "none", border: "none", color: lang === code ? "#C05F3C" : "var(--text)", fontSize: 12.5, fontWeight: lang === code ? 600 : 400, cursor: "pointer", whiteSpace: "nowrap" }}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <div
                          style={{
                            width: 46,
                            height: 46,
                            borderRadius: "50%",
                            margin: "0 auto 12px",
                            background: "linear-gradient(135deg,#C87551,#A34E30)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: "0 5px 16px rgba(192,95,60,.35)",
                          }}
                        >
                          <GiftIcon size={22} color="#F4F6F8" />
                        </div>
                        {/* 重点：免费顶级模型（核心卖点「免费」用朱赭点出，做出层次） */}
                        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 7, lineHeight: 1.3, letterSpacing: 0.2, color: "var(--text)" }}>
                          {lang === "zh" ? (
                            <>
                              <span style={{ color: "#C05F3C" }}>{tr("login.signin")}</span>{tr("ui.app.message.97b263eb21")}</>
                          ) : (
                            <>
                              <span style={{ color: "#C05F3C" }}>{tr("usage.clickLogin")}</span> {tr("ui.shared.4c19da5fdb")}</>
                          )}
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.4 }}>
                          {tr("ui.app.free.models.have.daily.limits.paid.eb2cb7e")}
                        </div>
                        {/* 具体模型名，让「顶级」落地 */}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(2, auto)",
                            justifyContent: "center",
                            columnGap: 16,
                            rowGap: 7,
                            marginBottom: 13,
                            fontSize: 12,
                            fontWeight: 500,
                            color: "var(--text-dim)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {[
                            { k: "claude", n: "Claude" },
                            { k: "gpt", n: "GPT" },
                            { k: "deepseek", n: tr("ui.app.message.f310ff0f0e") },
                            { k: "kimi", n: "Kimi" },
                          ].map((m) => (
                            <span key={m.k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                              <span
                                style={{
                                  width: 18,
                                  height: 18,
                                  borderRadius: 5,
                                  background: "#fff",
                                  boxShadow: "0 0 0 1px rgba(0,0,0,.06)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flex: "0 0 auto",
                                }}
                              >
                                <img
                                  src={BRAND_LOGOS[m.k]}
                                  alt=""
                                  width={13}
                                  height={13}
                                  style={{ display: "block", objectFit: "contain" }}
                                />
                              </span>
                              {m.n}
                            </span>
                          ))}
                        </div>
                        {/* 次要：无为币激励，小徽章 */}
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            fontSize: 11.5,
                            fontWeight: 500,
                            color: "#C05F3C",
                            background: "rgba(192,95,60,.09)",
                            padding: "3px 11px",
                            borderRadius: 20,
                            marginBottom: 16,
                            whiteSpace: "nowrap",
                          }}
                        >
                          <CoinIcon size={12} />
                          {t("login.signupGift")}
                        </div>
                        <div style={{ fontSize: 10.5, color: "var(--text-muted)", lineHeight: 1.4, marginTop: -10, marginBottom: 12 }}>
                          {t("login.signupGiftExpiry")}
                        </div>
                        <button
                          onClick={() => {
                            setShowAcctMenu(false);
                            setLoginResume(false);
                            setShowLoginForm(true);
                          }}
                          style={{
                            width: "100%",
                            padding: "10px",
                            borderRadius: 10,
                            border: "none",
                            background: "#C05F3C",
                            color: "#F4F6F8",
                            fontSize: 14,
                            fontWeight: 600,
                            letterSpacing: 2,
                            cursor: "pointer",
                            boxShadow: "0 3px 12px rgba(192,95,60,.3)",
                          }}
                        >
                          {t("login.signin")}
                        </button>
                      </div>
                    )}
                    {!wuwei && (
                      <button className="acct-it" onClick={() => {
                        setShowAcctMenu(false);
                        setShowGuide(true);
                      }}>
                        {tr("ui.app.user.guide.f2562f4")}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
            </>
          );
        })()}
        <div className="resizer" onMouseDown={startResize} />
      </div>
      )}

      {/* 主区 */}
      <div className="main">
        {/* 数字婴儿面板(迁自 minicc)：agiView==="baby" 时占据主区 */}
        {/* 应用中心 / 房间（可选模块）：整块占据主区，与数字婴儿面板同级。摘除模块时删掉这个块。 */}
        {teamEnabled && (appView === "store" || appView === "rooms") && (
          <div className="team-panel">
            {/* 进入某个群后，顶部这条(一人公司/员工·群/返回)隐藏——群名/⋯已上移到软件标题栏 */}
            {!(appView === "rooms" && activeRoomId) && (
            <div className="team-panel-head">
              <span className="team-panel-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
                  <circle cx="9.5" cy="7" r="3.2" />
                  <path d="M17 11l2 2 3.5-3.5" />
                </svg>
                {tr("ui.app.my.company.05b42c6")}
              </span>
              <div className="team-seg">
                <button className={appView === "store" ? "on" : ""} onClick={() => setAppView("store")}>
                  {tr("ui.app.teammates.661ab3c")}
                </button>
                <button className={appView === "rooms" ? "on" : ""} onClick={() => setAppView("rooms")}>
                  {tr("ui.app.groups.a47bd17")}
                </button>
              </div>
              <button className="team-panel-close" onClick={() => setAppView(null)} title={tr("ui.app.back.to.chat.5b99500")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
                {tr("pay.msg.back")}
              </button>
            </div>
            )}
            <div className="team-panel-body">
              {appView === "store" ? (
                <AppStore
                  en={lang !== "zh"}
                  onEmployees={setTeamEmployees}
                  onOpenChat={() => setAppView(null)}
                  providers={providerList.map((p) => ({ id: p.id, label: p.label || p.id, models: (p.models || []) as string[], choices: pickerChoices.filter(c => c.providerId === p.id) }))}
                  loggedIn={!!wuwei} onRequireLogin={requestModelLogin}
                  onConnections={() => { setSettingsTab('platforms'); setShowSettings(true); }}
                />
              ) : (
                <RoomView
                  en={lang !== "zh"}
                  employees={teamEmployees}
                  initialRoomId={activeRoomId}
                  dmSelfId={dmSelfId}
                  renderMd={(t) => <MarkdownView text={t} />}
                  onBack={() => setAppView("store")}
                  renderRoomAsk={(memberIds, anchorRef) => {
                    // 群/私聊里成员的会话 sid 是 __room_<empId>；找本群哪位成员正在 ask_user 或被 CEO 把关。
                    const sid = memberIds.map((id) => `__room_${id}`).find((s) => asks[s] || ceoDeciding[s]);
                    if (!sid) return null;
                    return (
                      <>
                        {ceoDeciding[sid] && !asks[sid] && <CeoDecidingPill lang={lang} anchor={anchorRef} info={ceoDeciding[sid]} />}
                        {asks[sid] && (() => {
                          const a = asks[sid];
                          // 群里不走「智能继续」自动倒计时(那是 per-session 的)，直接把选择框弹给用户。
                          return (
                            <AskModal
                              key={a.id}
                              t={t}
                              lang={lang}
                              data={a}
                              anchor={anchorRef}
                              autoSec={0}
                              redlineHit={null}
                              judging={false}
                              onSubmit={(list, images) => { window.wuwei.answerAsk(a.id, { list, images }); clearAsk(sid); }}
                              onCancel={() => { window.wuwei.answerAsk(a.id, { cancelled: true }); clearAsk(sid); }}
                            />
                          );
                        })()}
                      </>
                    );
                  }}
                  footer={(ctx) => (
                    // 群/私聊底部状态栏：复用主对话完整的 <ComposerFoot>。roomMode 隐藏 per-session 的自动/智能继续档，
                    // 平台/模型选择器切的是全局默认模型(和主对话同一套 state)，上下文统计传本群自己的估算值(ctx.contextK)。
                    renderComposerFoot({ roomMode: true, contextK: ctx.contextK, roomRunning: ctx.running })
                  )}
                />
              )}
            </div>
          </div>
        )}
        {/* SOP 库详情：侧栏点某个 SOP 进来，主区显示查看/编辑/版本 */}
        {teamEnabled && appView === "sop" && activeSopId && (
          <div className="team-panel">
            <div className="team-panel-head">
              <span className="team-panel-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" />
                </svg>
                {tr("ui.app.sop.811a818")}
              </span>
              <button className="team-panel-close" onClick={() => setAppView(null)} title={tr("ui.app.back.to.chat.5b99500")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
                {tr("pay.msg.back")}
              </button>
            </div>
            <div className="team-panel-body">
              <SopView en={lang !== "zh"} sopId={activeSopId} nodes={sopTree} renderMd={(tx) => <MarkdownView text={tx} />} askConfirm={askConfirm} />
            </div>
          </div>
        )}
        {agiView === "baby" && (
          <div className="baby-panel">
            <div className="baby-header">
              {babyTab === "home" && (
                <button className="baby-rail-btn" title={babyLeftOpen ? tr("ui.app.message.27cefc5ee8") : tr("ui.app.message.bd468bda19")}
                  onClick={() => { const v = !babyLeftOpen; setBabyLeftOpen(v); localStorage.setItem("minicc-baby-left", v ? "1" : "0"); }}>
                  {babyLeftOpen ? <Ic.IcPanelLeft size={17} /> : <Ic.IcPanelRight size={17} />}
                </button>
              )}
              <span className="baby-brand">
                <span className="by-mark"><Ic.IcBaby size={17} /></span>
                {tr("ui.app.message.90a172548d")}<span className="baby-brand-sub">{babyVitals.age || "—"} · {babyVitals.mood || "—"}</span>
              </span>
              <div className="baby-tabs">
                <button className={"baby-tab" + (babyTab === "home" ? " on" : "")} onClick={() => setBabyTab("home")}>
                  <Ic.IcHome size={15} />{tr("ui.app.message.7a3a828abd")}</button>
                <button className={"baby-tab" + (babyTab === "brain" ? " on" : "")}
                  onClick={() => { setBabyTab("brain"); void reloadBabyBrain(); }}>
                  <Ic.IcBrain size={15} />{tr("ui.app.message.22b362d347")}</button>
              </div>
              <button className="baby-close" onClick={() => setAgiView(null)} title={tr("ui.app.back.to.chat.5b99500")}>
                <Ic.IcBack size={15} />{tr("pay.msg.back")}</button>
            </div>
            {babyTab === "brain" ? (
              <div className={"baby-brain" + (brainFull ? " fs" : "")}>
                <div className="baby-brain-bar">
                  <div className="by-seg">
                    <button className={brainView === "graph" ? "on" : ""} onClick={() => { setBrainView("graph"); loadBabyGraph().catch(() => {}); }}>
                      <Ic.IcNodes size={14} />{tr("ui.app.message.69062e7aea")}</button>
                    <button className={brainView === "pyramid" ? "on" : ""} onClick={() => { setBrainView("pyramid"); loadBabyPyramid().catch(() => {}); }}>
                      <Ic.IcPyramid size={14} />{tr("ui.app.message.4a72a3deda")}</button>
                  </div>
                  <div className="by-brain-stats">
                    <span><b>{babyGraphData.nodes.length}</b> {tr("set.brain.statNodes")}</span>
                    <span><b>{babyGraphData.edges.length}</b> {tr("ui.app.message.72d7e03935")}</span>
                    {!!babyPyramid?.stats && (
                      <>
                        <span><b>{babyPyramid.stats.depth}</b> {tr("ui.app.message.b03601ce3f")}</span>
                        <span><b>{babyPyramid.stats.loose}</b> {tr("ui.app.message.c6014672ac")}</span>
                      </>
                    )}
                    {/* 读取反馈：数字不变时页面看不出差别，靠这行区分"读到了但没变" vs "根本没读到" */}
                    {brainLoad.err ? (
                      <span className="by-load-err" title={brainLoad.err}>{tr("ui.app.message.af23eee80c")}{brainLoad.err}</span>
                    ) : brainLoad.at > 0 ? (
                      <span className="by-load-ok">{tr("ui.app.message.04629417b1")}{new Date(brainLoad.at).toLocaleTimeString()}</span>
                    ) : null}
                  </div>
                  <button className="by-tidy ghost" style={{ marginLeft: "auto" }}
                    onClick={() => setBrainFull((v) => !v)} title={brainFull ? tr("ui.app.message.be0f59e929") : tr("ui.app.message.4216fb469c")}>
                    {brainFull ? <Ic.IcShrink size={14} /> : <Ic.IcExpand size={14} />}
                    {brainFull ? tr("ui.app.message.ff1e136913") : tr("ui.app.message.dc5adb9f17")}
                  </button>
                  {brainFull && (
                    <button className="by-tidy ghost" title={tr("ui.app.message.02dc802a68")}
                      onClick={() => { setBrainFull(false); setAgiView(null); }}>
                      <Ic.IcBack size={14} />{tr("ui.app.back.to.chat.5b99500")}</button>
                  )}
                  <button className="by-tidy ghost" data-busy-self="1" disabled={babyTidy || brainLoad.busy}
                    onClick={() => void reloadBabyBrain()} title={tr("ui.app.message.286e5b26b3")}>
                    <span className={brainLoad.busy ? "by-spin" : ""} style={{ display: "flex" }}><Ic.IcRefresh size={14} /></span>
                    {brainLoad.busy ? tr("ui.app.message.b3b7ee9c56") : tr("ui.app.message.3dbb6a70f9")}
                  </button>
                  <button className="by-tidy" data-busy-self="1" disabled={babyTidy} onClick={babyTidyUp}
                    title={tr("ui.app.message.1378628edd")}>
                    <span className={babyTidy ? "by-spin" : ""} style={{ display: "flex" }}><Ic.IcSparkle size={14} /></span>
                    {babyTidy ? tr("ui.app.message.df2e697ba4") : tr("ui.app.message.4045380844")}
                  </button>
                </div>
                <div className="baby-brain-canvas">
                  {brainView === "graph" ? (
                    <>
                      <BabyBrainGraph nodes={babyGraphData.nodes} edges={babyGraphData.edges} />
                      {babyGraphData.nodes.length === 0 && (
                        <div className="baby-brain-empty">{tr("ui.app.message.9e78915cf2")}</div>
                      )}
                    </>
                  ) : (
                    <BabyPyramid data={babyPyramid} />
                  )}
                </div>
                <div className="baby-brain-tip">
                  <Ic.IcSparkle size={12} />
                  {brainView === "graph"
                    ? tr("ui.app.message.c87dc803a5")
                    : tr("ui.app.message.007fbedd16")}
                </div>
              </div>
            ) : (
            <div className="baby-body">
              {babyLeftOpen ? (
              <div className="baby-left">
                <div className="baby-card">
                  <div className="by-card-head" onClick={() => toggleCard("status")}>
                    <span className="by-card-ico"><Ic.IcPulse size={15} /></span>
                    <span className="by-card-t">{tr("ui.app.message.8042eaf126")}</span>
                    <span className="by-card-meta">{babyAlive ? tr("ui.app.message.8dd0b7c7d2") : tr("ui.app.message.fbf16a8272")}</span>
                    <span className={"by-caret" + (babyCards.status ? "" : " off")}><Ic.IcChevron size={15} /></span>
                  </div>
                  {babyCards.status && (
                    <div className="by-card-body">
                      <BabyHero vitals={babyVitals} alive={babyAlive} activity={babyActivity}
                        busy={babyBusy} onToggleAlive={toggleBabyAlive} />
                    </div>
                  )}
                </div>
                <div className="baby-card">
                  <div className="by-card-head" onClick={() => toggleCard("curious")}>
                    <span className="by-card-ico"><Ic.IcSprout size={15} /></span>
                    <span className="by-card-t">{tr("ui.app.message.599cbf99f8")}</span>
                    <span className="by-card-meta">{babyVitals.curiosity ?? 0}</span>
                    <span className={"by-caret" + (babyCards.curious ? "" : " off")}><Ic.IcChevron size={15} /></span>
                  </div>
                  {babyCards.curious && (
                    <div className="by-card-body">
                      <AutoStickPre className="baby-pre baby-scroll" text={babyCurious || tr("ui.app.message.38a6d4ed93")} />
                    </div>
                  )}
                </div>
                <div className="baby-card">
                  <div className="by-card-head" onClick={() => toggleCard("diary")}>
                    <span className="by-card-ico"><Ic.IcJournal size={15} /></span>
                    <span className="by-card-t">{tr("ui.app.message.dd6234c8d8")}</span>
                    <span className="by-card-meta">{babyVitals.ticks ?? 0} {tr("ui.app.message.c09bdeb16b")}</span>
                    <span className={"by-caret" + (babyCards.diary ? "" : " off")}><Ic.IcChevron size={15} /></span>
                  </div>
                  {babyCards.diary && (
                    <div className="by-card-body">
                      <AutoStickPre className="baby-pre baby-scroll" text={babyDiary || tr("ui.app.message.38a6d4ed93")} />
                    </div>
                  )}
                </div>
              </div>
              ) : (
              <div className="baby-rail" title={tr("ui.app.message.bd468bda19")}>
                <button className="baby-rail-btn" onClick={() => { setBabyLeftOpen(true); localStorage.setItem("minicc-baby-left", "1"); }}>
                  <Ic.IcPanelRight size={17} />
                </button>
                <BabyAvatar state={inferBabyState(babyActivity, babyAlive)} happiness={babyVitals.happiness ?? 55}
                  energy={babyVitals.energy ?? 100} alive={babyAlive} size={32} minimal />
                <span className={"baby-rail-dot" + (babyAlive ? " live" : "")} />
                <span className="baby-rail-vert">{babyAlive ? tr("ui.app.message.8dd0b7c7d2") : tr("ui.app.message.fbf16a8272")}</span>
              </div>
              )}
              <div className="baby-right">
                <div className="by-chat-head">
                  <span className="by-card-ico"><Ic.IcChat size={15} /></span>{tr("ui.app.message.6d1cf18942")}</div>
                <div className="by-thread" ref={babyChatRef}
                  onScroll={(e) => { const el = e.currentTarget; babyChatStick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
                  {babyChatLog.length === 0 && (
                    <div className="by-empty">
                      <div className="by-empty-art">
                        <BabyAvatar state={inferBabyState(babyActivity, babyAlive)} happiness={babyVitals.happiness ?? 55}
                          energy={babyVitals.energy ?? 100} alive={babyAlive} size={88} />
                      </div>
                      {tr("ui.app.message.edf1252ad1")}<br />
                      {tr("ui.app.message.d72cf9f268")}</div>
                  )}
                  {babyChatLog.map((m, i) =>
                    m.role === "you" ? (
                      <div className="by-turn user-block" key={i}>
                        <div className="msg user"><div className="body">{m.text}</div></div>
                        <div className="turn-foot user">
                          <div className="tf-actions"><CopyBtn text={m.text} /></div>
                          {!!m.ts && <span className="tf-time">{relTime(m.ts)}</span>}
                        </div>
                      </div>
                    ) : (
                      <div className="by-turn" key={i}>
                        <AssistantMsg text={m.text} />
                        <div className="turn-foot">
                          <div className="tf-actions"><CopyBtn text={m.text} /></div>
                          {!!m.ts && <span className="tf-time">{relTime(m.ts)}</span>}
                        </div>
                      </div>
                    ),
                  )}
                  {!!babyBusy && (
                    <div className="by-turn">
                      <span className="by-typing"><i /><i /><i /></span>
                    </div>
                  )}
                </div>
                <div className="by-composer">
                  <div className="input-wrap">
                    <textarea
                      rows={1}
                      value={babyChatInput}
                      placeholder={tr("ui.app.message.11fa2e77fa")}
                      onChange={(e) => {
                        setBabyChatInput(e.target.value);
                        e.target.style.height = "auto";
                        e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          babyDoChat();
                          (e.target as HTMLTextAreaElement).style.height = "auto";
                        }
                      }}
                    />
                    <button className={"send-btn" + (babyChatInput.trim() && !babyBusy ? " active" : "")}
                      onClick={babyDoChat} disabled={!babyChatInput.trim() || !!babyBusy} title={tr("composer.send")}>
                      <Ic.IcSend size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            )}
          </div>
        )}
        <div
          className={
            "titlebar" +
            (collapsed && window.wuwei.platform === "darwin" ? " tb-collapsed" : "")
          }
        >
          <span className="tb-title">
            {(() => {
              // 群里：头像=成员堆叠圆头像，标题=群名
              const room = teamEnabled && appView === "rooms" && activeRoomId ? teamRooms.find((x: any) => x.id === activeRoomId) : null;
              if (room && room.type === "dm") {
                // 私聊：标题=对方名(镜像，按 dmSelfId 判定自己是谁)，单头像
                const otherId = (room.members || []).find((m: string) => m !== dmSelfId) || (room.members || [])[0];
                const other = teamEmployees.find((x: any) => x.id === otherId);
                return (
                  <>
                    <span className="tb-avatar"><EmployeeAvatar icon={other?.icon} avatarData={other?.avatarData} name={employeeLabel(other, lang, otherId)} /></span>
                    <span className="tb-title-txt">{employeeLabel(other, lang, otherId)}</span>
                  </>
                );
              }
              if (room) {
                return (
                  <>
                    <span className="tb-avatar stack">
                      {(room.members || []).slice(0, 3).map((mid: string) => {
                        const m = teamEmployees.find((x: any) => x.id === mid);
                        return <span className="tb-av-mini" key={mid}><EmployeeAvatar icon={m?.icon} avatarData={m?.avatarData} name={employeeLabel(m, lang, mid)} /></span>;
                      })}
                    </span>
                    <span className="tb-title-txt">{tx(room.name)}</span>
                    <span className="tb-room-cnt">（{room.members?.length || 0}）</span>
                  </>
                );
              }
              // 员工私聊：头像=员工圆头像，标题=员工名（固定，不随消息标题变）
              const curEmpId = teamEnabled && appView === null ? sessions.find((s) => s.id === currentId)?.employeeId : undefined;
              const curEmp = curEmpId ? teamEmployees.find((e: any) => e.id === curEmpId) : null;
              if (curEmp) {
                return (
                  <>
                    <span className="tb-avatar"><EmployeeAvatar icon={curEmp.icon} avatarData={curEmp.avatarData} name={employeeLabel(curEmp, lang)} /></span>
                    <span className="tb-title-txt">{tx(employeeLabel(curEmp, lang))}</span>
                  </>
                );
              }
              if (teamEnabled && appView === "store") return <><WuweiMark /><span className="tb-title-txt">{tr("ui.app.my.company.05b42c6")}</span></>;
              if (teamEnabled && appView === "rooms") return <><WuweiMark /><span className="tb-title-txt">{tr("ui.app.groups.f080cef")}</span></>;
              if (teamEnabled && appView === "sop") return <><WuweiMark /><span className="tb-title-txt">{tr("ui.app.sops.3f7e53e")}</span></>;
              const st = sessions.find((s) => s.id === currentId)?.title;
              const isDefault = !st || st === tr("ui.app.new.chat.fca06b0", {}, "zh") || st === tr("ui.app.new.chat.fca06b0", {}, "en");
              return <><WuweiMark /><span className="tb-title-txt">{isDefault ? (tr("splash.brand")) : tx(st)}</span></>;
            })()}
            {/* 群 ⋯ 菜单：群成员 / 清空消息 / 删除群，紧跟群名 */}
            {teamEnabled && appView === "rooms" && activeRoomId && (() => {
              const room = teamRooms.find((x: any) => x.id === activeRoomId);
              if (!room || room.type === "dm") return null; // 私聊不显示群菜单(成员/删群)——删私聊走侧栏右键
              return (
                <span className="tb-room-menu-wrap">
                  <button className="tb-room-menu-btn" onClick={() => setRoomMenu((v) => !v)} title={tr("ui.app.group.4c47cce")}>
                    <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
                  </button>
                  {roomMenu && (
                    <>
                      <div className="tb-room-menu-mask" onClick={() => setRoomMenu(false)} />
                      <div className="tb-room-menu">
                        <div className="tb-room-menu-sec">{tr("ui.app.members.0c73770")} · {room.members.length}</div>
                        <div className="tb-room-menu-members">
                          {room.members.map((mid: string) => {
                            const m = teamEmployees.find((x: any) => x.id === mid);
                            return (
                              <span className="tb-room-mem" key={mid}>
                                <span className="tb-room-mem-av"><EmployeeAvatar icon={m?.icon} avatarData={m?.avatarData} name={employeeLabel(m, lang, mid)} /></span>
                                <span className="tb-room-mem-nm">{employeeLabel(m, lang, mid)}</span>
                                {room.coordinator === mid && <span className="tb-room-mem-host">{tr("ui.app.host.7056d6d")}</span>}
                              </span>
                            );
                          })}
                        </div>
                        <button className="tb-room-menu-item" onClick={() => { setRoomMenu(false); setRoomSettings({ id: room.id }); }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                          {tr("ui.app.group.settings.d861667")}
                        </button>
                        <button className="tb-room-menu-item" onClick={() => { setRoomMenu(false); askConfirm({ message: tr("ui.app.clear.all.messages.in.this.group.68ae9d7"), danger: true, onOk: () => { void (window as any).wuwei?.team?.roomClear(room.id); } }); }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" /></svg>
                          {tr("ui.app.clear.messages.b76e4a3")}
                        </button>
                        <button className="tb-room-menu-item danger" onClick={() => { setRoomMenu(false); askConfirm({ message: tr("ui.app.delete.group.chat.history.is.removed.86b25ba", { p0: room.name }), danger: true, onOk: () => { void (window as any).wuwei?.team?.roomDelete(room.id); setActiveRoomId(null); setAppView("store"); } }); }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                          {tr("ui.app.delete.group.3cff385")}
                        </button>
                      </div>
                    </>
                  )}
                </span>
              );
            })()}
          </span>
          <span className="tb-spacer" />
          {showBrowser && browserDetached && (
            <span className="tb-browser-wrap">
              <button
                className="tb-browser"
                title={t("hdr.browserDetached")}
                onClick={() => setShowBrowserMenu((v) => !v)}
              >
                <svg
                  className="tb-browser-ico"
                  width="15"
                  height="15"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect
                    x="1.6"
                    y="2.6"
                    width="12.8"
                    height="10.8"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.3"
                  />
                  <path d="M1.6 5.7h12.8" stroke="currentColor" strokeWidth="1.3" />
                  <circle cx="4" cy="4.15" r="0.62" fill="currentColor" />
                  <circle cx="6.1" cy="4.15" r="0.62" fill="currentColor" />
                </svg>
                <span className="tb-caret">▾</span>
              </button>
              {showBrowserMenu && (
                <>
                  <div className="mq-overlay" onClick={() => setShowBrowserMenu(false)} />
                  <div className="tb-browser-menu">
                    <button
                      onClick={() => {
                        setBrowserMode("split");
                        window.wuwei.browserReattach();
                        setShowBrowserMenu(false);
                      }}
                    >
                      {tr("ui.app.dock.to.split.83f3880")}
                    </button>
                    <button
                      onClick={() => {
                        setBrowserMode("full");
                        window.wuwei.browserReattach();
                        setShowBrowserMenu(false);
                      }}
                    >
                      {tr("ui.app.dock.to.full.13c6ef2")}
                    </button>
                    <button
                      className="tb-bm-close"
                      onClick={() => {
                        window.wuwei.browserReattach();
                        setShowBrowser(false);
                        setShowBrowserMenu(false);
                      }}
                    >
                      {tr("ui.app.close.browser.4e4937f")}
                    </button>
                  </div>
                </>
              )}
            </span>
          )}
          {window.wuwei.platform !== "darwin" && (
            <span className="win-ctrl">
              <button className="wc-btn" title={t("win.minimize")} onClick={() => window.wuwei.winMinimize()}>
                ─
              </button>
              <button className="wc-btn" title={t("win.maximize")} onClick={() => window.wuwei.winMaximize()}>
                ☐
              </button>
              <button
                className="wc-btn wc-close"
                title={t("win.close")}
                onClick={() => window.wuwei.winClose()}
              >
                ✕
              </button>
            </span>
          )}
        </div>

        {collapsed && (
          <div className="toolbar-min">
            <button className="icon-btn" title={t("side.expand")} onClick={() => toggleCollapse(false)}>
              »
            </button>
          </div>
        )}

        <div
          className="stream"
          ref={streamRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            // 只认"真的贴着底"(留 48px 容差抵消行高取整/惯性回弹)。
            // 早先按"距底一屏"算贴底，结果往上滚半屏看历史会被下一段流式输出硬拽回底部，上面的内容就看不成了。
            // 强制窗内的滚动来自"切会话/发消息后内容异步撑高"，不是用户意图——
            // 此时若按当帧位置判定，会把 atBottomRef 误写成 false，兜底吸底就全被挡掉了。
            if (Date.now() < forceBottomUntilRef.current) return;
            const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 48;
            if (atBottomRef.current !== atBottom) setAwayFromBottom(!atBottom); // 只在跨越边界时 setState，滚动中不空转渲染
            atBottomRef.current = atBottom;
          }}
        >
          {items.length === 0 && (
            <div className="welcome">
              <div className="wc-hero">
                <WuweiLogo size={58} />
                <p className="wc-eyebrow">{tr("ui.app.one.intention.everything.follows.11408cd")}</p>
                <h1 className="wc-h1">
                  {tr("ui.app.one.sentence.and.5dd4e2f")}
                  <span className="wc-spark">{tr("ui.app.ai.gets.it.done.de3eb46")}</span>
                </h1>
                <p className="wc-lead">
                  {tr("ui.app.describe.what.you.need.and.ai.315ffdc")}
                </p>
                {/* 激活→首条消息的临门一脚：明确「免费·无需登录·直接在下方开聊」，降低"要不要注册"的犹豫。
                    仅未登录时显示（已登录用户不需要这句）。 */}
                {!wuwei && (
                  <div className="wc-freehint">
                    <span className="wc-freehint__dot" />
                    {tr("ui.app.free.to.start.no.sign.in.993f2f0")}
                  </div>
                )}
                <div className="wc-feats">
                  {[
                    { get zh() { return tr("ui.catalog.app.bbbca54a97"); }, get en() { return tr("ui.catalog.app.bbbca54a97"); }, path: <><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" /><circle cx="7" cy="7" r="1.3" /></> },
                    { get zh() { return tr("ui.app.message.074d141a22"); }, get en() { return tr("ui.app.message.074d141a22"); }, path: <><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></> },
                    { get zh() { return tr("ui.catalog.app.e83011c3ba"); }, get en() { return tr("ui.catalog.app.e83011c3ba"); }, path: <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" /> },
                    // 国内直连仅中文版显示（对海外用户无意义）
                    ...(lang !== "zh" ? [] : [{ get zh() { return tr("ui.catalog.app.c73d9fdd06"); }, get en() { return tr("ui.catalog.app.c73d9fdd06"); }, path: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z" /></> }]),
                  ].map((f) => (
                    <span className="wc-feat" key={f.zh}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{f.path}</svg>
                      {lang !== "zh" ? f.en : f.zh}
                    </span>
                  ))}
                </div>
              </div>
              <div className="wc-flow">
                <div className="wc-step">
                  <em>{tr("ui.app.you.ask.79beab1")}</em>
                  <b>{tr("ui.app.say.what.you.want.done.0152ba1")}</b>
                </div>
                <span className="wc-arrow" aria-hidden="true">→</span>
                <div className="wc-step">
                  <em>{tr("ui.app.ai.works.cf10379")}</em>
                  <b>{tr("ui.app.ai.agents.break.it.down.call.c9f24d1")}</b>
                </div>
                <span className="wc-arrow" aria-hidden="true">→</span>
                <div className="wc-step">
                  <em>{tr("ui.app.you.get.e07b88e")}</em>
                  <b>{tr("ui.app.results.file.paths.how.to.verify.190e7f1")}</b>
                </div>
              </div>
              {/* 脑网络入口 + 特性标签：先隐藏（改 false→true 即恢复） */}
              {false && (
                <>
                  <button className="wc-brain" onClick={() => setShowBrainIntro(true)} title={t("wc.brainTitle")}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 3a4 4 0 0 0-4 4 3.5 3.5 0 0 0-1 6.8V17a3 3 0 0 0 5 2 3 3 0 0 0 5-2v-3.2A3.5 3.5 0 0 0 16 7a4 4 0 0 0-4-4Z" />
                    </svg>
                    <span className="wc-brain-tx">
                      <b>{tr("set.tab.brain")}</b>
                      {tr("ui.app.keeps.learning.long.term.memory.that.4b2c901")}
                    </span>
                    <svg className="wc-brain-arr" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 3l5 5-5 5" />
                    </svg>
                  </button>
                  <div className="wc-tags">{tr("ui.app.fewer.steps.no.interruptions.results.first.cea02b0")}</div>
                </>
              )}
            </div>
          )}
          {(() => {
            const turns = groupTurns(items);
            let userOrd = -1; // 已见的用户输入序号(与主进程 messages 里的用户输入一一对应)
            // 上一 AI 回合末的累计用量，用于算本轮增量(输入/输出/缓存命中/新增/步数)
            let prevCum = { totalInput: 0, totalOutput: 0, totalCacheHit: 0, totalCacheMiss: 0, totalSteps: 0 };
            const canDel = !busy; // 运行中不允许删(历史正在变)
            const delExchange = (ord: number) => {
              if (ord < 0) return;
              window.wuwei.deleteExchange(currentId, ord);
            };
            // 撤回一条用户消息(像微信撤回)：收回 + 文字放回输入框可改可重发
            const recallUser = async (it: Extract<Item, { type: "user" }>, ord: number) => {
              if (busy) {
                // 运行中：只有还没被 AI 处理(仍在注入缓冲)的才能干净撤回
                const ok = await window.wuwei.recallInject(currentId, it.text);
                if (ok) {
                  setItems((p) => p.filter((x) => x !== it));
                  setInput((cur) => cur || it.text);
                } else {
                  push({
                    type: "notice",
                    text: tr("ui.app.this.message.is.already.being.processed.e5a9ead"),
                  });
                }
              } else {
                setInput((cur) => cur || it.text);
                delExchange(ord); // 闲时：删掉这轮(含回复)，文字回到输入框
              }
            };
            return turns.map((t, i) => {
              if (t.kind === "solo") {
                if (t.item.type === "user") {
                  userOrd++;
                  const ord = userOrd;
                  const uItem = t.item;
                  return (
                    <ItemView
                      key={i}
                      item={uItem}
                      now={now}
                      onDelete={canDel ? () => delExchange(ord) : undefined}
                      onEdit={() => recallUser(uItem, ord)}
                      onResend={busy ? undefined : () => doSend(uItem.text, uItem.images || [])}
                    />
                  );
                }
                return <ItemView key={i} item={t.item} now={now} />;
              }
              const ord = userOrd; // AI 回合归属最近一条用户输入这一轮
              const aiTs = aiTurnTs(t.blocks);
              const lastTurn = i === turns.length - 1; // 只有最后一个回合可能正在流
              // 本轮 token = 本轮末累计 − 上轮末累计(输入含每步重发上下文的真实消耗)；上下文=最近一次请求输入量
              const endCum = aiTurnUsage(t.blocks);
              let tok:
                | { inT: number; outT: number; steps: number; hit: number; miss: number; split: boolean }
                | undefined;
              if (endCum?.round) {
                // 本轮自足值:缓存命中/真正新增各自独立,单价能分开算,不受历史污染
                const r = endCum.round;
                tok = { inT: r.input, outT: r.output, steps: r.steps, hit: r.cacheHit, miss: r.cacheMiss, split: true };
                prevCum = {
                  totalInput: endCum.totalInput,
                  totalOutput: endCum.totalOutput,
                  totalCacheHit: endCum.totalCacheHit ?? 0,
                  totalCacheMiss: endCum.totalCacheMiss ?? 0,
                  totalSteps: endCum.totalSteps ?? 0,
                };
              } else if (endCum) {
                // 旧快照(无 round):只能按累计做差给总量,缓存拆分不可靠→不显示
                tok = {
                  inT: Math.max(0, endCum.totalInput - prevCum.totalInput),
                  outT: Math.max(0, endCum.totalOutput - prevCum.totalOutput),
                  steps: Math.max(0, (endCum.totalSteps ?? 0) - prevCum.totalSteps),
                  hit: 0,
                  miss: 0,
                  split: false,
                };
                prevCum = {
                  totalInput: endCum.totalInput,
                  totalOutput: endCum.totalOutput,
                  totalCacheHit: endCum.totalCacheHit ?? prevCum.totalCacheHit,
                  totalCacheMiss: endCum.totalCacheMiss ?? prevCum.totalCacheMiss,
                  totalSteps: endCum.totalSteps ?? prevCum.totalSteps,
                };
              }
              return (
                <div className="aiturn" key={i}>
                  <div className="aiturn-body">
                    {t.blocks.map((b, j) =>
                      b.kind === "item" ? (
                        <AssistantMsg
                          key={j}
                          text={(b.item as Extract<Item, { type: "assistant" }>).text}
                          anchor={(b.item as Extract<Item, { type: "assistant" }>).anchor}
                          streaming={busy && lastTurn && j === t.blocks.length - 1}
                        />
                      ) : (
                        <ToolGroup key={j} tools={b.tools} />
                      ),
                    )}
                  </div>
                  <div className="turn-foot ai">
                    <div className="tf-actions">
                      <CopyBtn
                        text={t.blocks
                          .filter((b) => b.kind === "item")
                          .map((b) => (b as { kind: "item"; item: Item }).item)
                          .filter((it): it is Extract<Item, { type: "assistant" }> => it.type === "assistant")
                          .map((it) => it.text)
                          .join("\n\n")}
                      />
                      {canDel && ord >= 0 && (
                        <button className="tf-icon del" title={makeT(getLang())("msg.delete")} onClick={() => delExchange(ord)}>
                          <TrashIcon />
                        </button>
                      )}
                    </div>
                    {aiTs && (
                      <span className="tf-time" title={new Date(aiTs).toLocaleString()}>
                        {relTime(aiTs)}
                      </span>
                    )}
                    {tok && (
                      <span className="tf-tok">
                        <span className="tf-tok-badge">
                          {/* ↑ 显示「新增输入」(真正新花的·贵)，不显示总输入(含缓存重发的累计，看着大但没意义)；
                              无 round 明细的旧快照才回退到总输入。完整拆分见悬浮面板。 */}
                          {tok.steps > 0 ? `${tok.steps}${tr("ui.app.steps.6870398")} · ` : ""}↑{fmtTok(tok.split ? tok.miss : tok.inT)} ↓{fmtTok(tok.outT)}
                        </span>
                        <span className="tf-tok-pop">
                          {tok.steps > 0 && (
                            <span>
                              <b>{tr("ui.app.steps.this.turn.07f03d1")}</b>
                              <em>{tok.steps}{tr("ui.app.text.bc7d1ac")}</em>
                            </span>
                          )}
                          {tok.steps > 0 && (
                            <span>
                              <b>{tr("ui.app.context.per.step.6ce775f")}</b>
                              <em>≈{fmtTok(Math.round(tok.inT / tok.steps))}{tr("ui.app.avg.ea5edd9")}</em>
                            </span>
                          )}
                          {tok.split ? (
                            // 有缓存拆分：突出「新增输入」(真花钱)，总输入/缓存命中降为淡色副行(折叠感)
                            <>
                              <span className="tf-tok-div" style={{ fontWeight: 600 }}>
                                <b>{tr("ui.app.new.input.a409723")}</b>
                                <em style={{ color: "var(--accent, #C05F3C)", fontWeight: 700 }}>{tok.miss.toLocaleString()}{tr("ui.app.costly.dbc4cad")}</em>
                              </span>
                              <span className="tf-tok-sub" style={{ opacity: 0.55 }}>
                                <b>{tr("ui.app.total.input.18816e6")}</b>
                                <em>{tok.inT.toLocaleString()}</em>
                              </span>
                              <span className="tf-tok-sub" style={{ opacity: 0.55 }}>
                                <b>{tr("ui.app.cache.hit.a39f154")}</b>
                                <em>{tok.hit.toLocaleString()}{tr("ui.app.cheap.f65a97b")}</em>
                              </span>
                            </>
                          ) : (
                            <span className="tf-tok-div">
                              <b>{tr("ui.app.total.input.3363822")}</b>
                              <em>{tok.inT.toLocaleString()}</em>
                            </span>
                          )}
                          <span style={{ fontWeight: 600 }}>
                            <b>{tr("ui.app.new.output.d2726fc")}</b>
                            <em style={{ color: "var(--accent, #C05F3C)", fontWeight: 700 }}>{tok.outT.toLocaleString()}</em>
                          </span>
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              );
            });
          })()}
          {busy && !pending && (
            <ThinkingBar startRef={thinkStartRef} charsRef={charsRef} textRef={turnTextRef} items={items} />
          )}
        </div>

        {/* 离底时才出现：一键回到最新并恢复自动跟随(不点就一直停在你正看的位置) */}
        {awayFromBottom && (
          <button
            className="to-bottom"
            title={t("stream.toBottom")}
            onClick={() => {
              const el = streamRef.current;
              if (!el) return;
              el.scrollTo({ top: el.scrollHeight });
              atBottomRef.current = true;
              setAwayFromBottom(false);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14" />
              <path d="m19 12-7 7-7-7" />
            </svg>
          </button>
        )}

        <div className="composer" ref={composerRef}>
          {selectedChoice?.category === 'premium' && <PremiumModelNotice key={selectedModelKey} en={lang !== "zh"} busy={busy} switching={valueSwitchBusy} onSwitch={()=>void switchToRecommendedValue()} />}
          {/* 鉴权提示条：检测到缺授权后常驻，直到授权成功或用户手动 × 关闭 */}
          {needAuth && !authDismissed && (
            <div className="err-fix err-auth">
              <button className="err-close" title={makeT(getLang())("msg.close")} onClick={() => setAuthDismissed(true)}>
                ×
              </button>
              {curPreset?.kind === "anthropic-oauth" ? (
                // Claude 订阅：一键 OAuth
                oauthStep === "awaiting-code" ? (
                  <>
                    <span>{tr("ui.app.after.approving.in.the.browser.paste.1ae6035")}</span>
                    <div className="err-auth-actions">
                      <input
                        className="code-input"
                        value={codeInput}
                        onChange={(e) => setCodeInput(e.target.value)}
                        placeholder={t("authbar.pasteCodePh")}
                      />
                      <button className="allow" onClick={completeBrowserAuth} disabled={authBusy}>
                        {authBusy ? (tr("set.m.verifying")) : (tr("ui.app.complete.authorization.016f419"))}
                      </button>
                      <button onClick={() => setOauthStep("idle")} disabled={authBusy}>
                        {tr("pay.msg.back")}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span>{tr("ui.app.claude.subscription.needs.authorization.sign.in.81c237c")}</span>
                    <div className="err-auth-actions">
                      <button className="allow" onClick={authorizeBrowser} disabled={authBusy}>
                        {tr("ui.app.sign.in.via.browser.recommended.reuse.55cb044")}
                      </button>
                      <button onClick={authorizeWindow} disabled={authBusy}>
                        {authBusy ? (tr("ui.app.authorizing.f4c7513")) : (tr("ui.app.sign.in.in.app.230c5b8"))}
                      </button>
                      <button onClick={() => setShowSettings(true)}>{tr("ui.app.set.key.in.settings.ad07084")}</button>
                    </div>
                  </>
                )
              ) : curPreset?.kind === "codex" ? (
                // Codex 订阅：应用内一键 ChatGPT 授权(无需本机 codex CLI)
                <>
                  <span>
                    {lang !== "zh" ? <>{tr("ui.shared.1897d09923")}<b>{tr("ui.shared.b7a2eeec2b")}</b> {tr("ui.shared.da80d1669c")}</> : <>{tr("ui.app.message.c218c9f44f")}<b>{tr("ui.app.message.9f01687639")}</b>{tr("ui.app.message.34cdd7ecc9")}</>}
                  </span>
                  <div className="err-auth-actions">
                    <button className="allow" onClick={doCodexLogin} disabled={codexBusy}>
                      {codexBusy ? (tr("ui.app.authorizing.finish.login.in.browser.0c3f951")) : (tr("ui.app.one.click.authorize.chatgpt.login.c92e4bf"))}
                    </button>
                  </div>
                </>
              ) : apiKeyStep === "awaiting" ? (
                // 已打开官网，等复制 key：自动检测剪贴板 + 可手动粘贴
                <>
                  <span>
                    {lang !== "zh" ? <>{tr("ui.shared.8e24f830e8")}<b>{tr("ui.shared.4ca1e3ae95")}</b>{tr("ui.shared.93b4ea5eac")}</> : <>{tr("ui.app.message.d3b7ef5876")}<b>{tr("ui.app.message.5b0b626f05")}</b>{tr("ui.app.message.95dc47e53d")}</>}
                  </span>
                  <div className="err-auth-actions">
                    <input
                      className="code-input"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder={t("authbar.keyDetectPh")}
                      disabled={apiKeyBusy}
                    />
                    <button className="allow" onClick={() => tryApiKey(apiKeyInput)} disabled={apiKeyBusy}>
                      {apiKeyBusy ? (tr("ui.app.detecting.3524fe6")) : (tr("ui.app.finish.setup.c825552"))}
                    </button>
                    <button onClick={() => setApiKeyStep("idle")} disabled={apiKeyBusy}>
                      {tr("pay.msg.back")}
                    </button>
                  </div>
                </>
              ) : (
                // API Key 平台（通义千问 / DeepSeek / OpenAI / 智谱 …）：引导去各自官网拿 key
                <>
                  <span>
                    {t("authbar.platformNeedKey").replace("{name}", String(curPreset ? pLabel(curPreset, lang) : meta.backend))}
                  </span>
                  <div className="err-auth-actions">
                    {curPreset?.keyUrl ? (
                      <button className="allow" onClick={startApiKeyFlow}>
                        {tr("ui.app.get.an.api.key.for.af14b75", { p0: (lang !== "zh" ? pLabel(curPreset, lang) : curPreset.label) })}
                      </button>
                    ) : (
                      <button className="allow" onClick={() => setApiKeyStep("awaiting")}>
                        {tr("ui.app.paste.api.key.aa004a7")}
                      </button>
                    )}
                    <button onClick={() => setShowSettings(true)}>{tr("ui.app.set.key.in.settings.ad07084")}</button>
                  </div>
                </>
              )}
              {/* 逃生入口：不想现在登录/配 Key 的用户，一键切到「免费体验（免登录）」先把产品跑起来，
                  避免对着红灯反复重试却走不下去(线上见过选订阅平台没登录就卡死)。当前已是免费体验则不显示。 */}
              {curProviderId !== "wuwei-free" && (
                <div style={{ marginTop: 6 }}>
                  <button
                    onClick={() => {
                      const free = PRESETS.find((x) => x.id === "wuwei-free");
                      if (free) void quickProvider(free);
                      setNeedAuth(false);
                      setAuthDismissed(false);
                    }}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", opacity: 0.75, textDecoration: "underline", fontSize: "inherit" }}
                  >
                    {tr("ui.app.or.try.the.free.tier.first.fb3d89d")}
                  </button>
                </div>
              )}
            </div>
          )}
          {/* 上游厂商暂不可用(upstream_error) → 一键换到可用免费模型，并重试上一句。
              这类错误文案不以「出错/Error」开头，走不到下面那条栏，故单列。绝不让用户对着「不可用」干等。 */}
          {!busy && unavailModel && (() => {
            // 兜底模型只从后台下发的「免费池」里按序取第一个可用的，绝不硬编码具体模型名。
            // 曾硬编码 deepseek-v4-flash-free / glm-5.3-flash-free：这俩名字带 free、实际走厂商付费通道，
            // 后台下架(hidden)后老逻辑照推不误，用户点一下就在烧真金。付费模型一律只出现在无为托管里。
            const fallback = pickerChoices.find(c => c.free && c.modelId !== unavailModel && (wuwei || !c.needsLogin));
            const fb = fallback?.modelId;
            if (!fb) return null;
            const fbLabel = MODEL_LABEL_OVERRIDES[fb] || (lang !== "zh" ? modelLabelsEn.get(fb) : undefined) || modelLabels.get(fb) || fb;
            return (
              <div className="err-fix">
                <span>{tr("ui.app.this.model.is.temporarily.unavailable.d743acc")}</span>
                <button
                  className="primary"
                  onClick={async () => {
                    if (!fallback) return;
                    const sid = currentIdRef.current;
                    const userId = wuweiRef.current?.user.id ?? null;
                    const lastUser = [...items].reverse().find(it => it.type === 'user') as { text?: string; images?: string[] } | undefined;
                    try {
                      if (!await selectModelChoice(fallback)) return;
                      if (sid !== currentIdRef.current || userId !== (wuweiRef.current?.user.id ?? null)) return;
                      setUnavailModel(null);
                      await window.wuwei.undoLast?.();
                      if (lastUser?.text && sid === currentIdRef.current) {
                        setPendingImages(lastUser.images || []);
                        setModelRetry({ sid, userId, key: fallback.key, text: lastUser.text, images: lastUser.images || [] });
                      }
                    } catch { push({ type: 'notice', text: tr("ui.app.could.not.switch.models.please.retry.f1bb49c") }); }
                  }}
                >
                  {tr("ui.app.switch.to.and.retry.8a34edf", { p0: fbLabel })}
                </button>
              </div>
            );
          })()}
          {/* 非鉴权类错误：中断类主推「继续」（一键从中断处接着做），其它错误仍给「删除这条」。
              注意判断要中英都认——英文界面的报错以 "Error" 开头，旧代码只认「出错」，导致英文下这条提示条从不出现。 */}
          {!busy &&
            !needAuth &&
            items.length > 0 &&
            items[items.length - 1].type === "notice" &&
            /^(出错|Error)/.test((items[items.length - 1] as { type: "notice"; text: string }).text) && (
              <div className="err-fix">
                {lastWasInterrupted ? (
                  <>
                    <span>{t("err.fix.interrupted")}</span>
                    <button className="primary" onClick={() => submit("continue")}>
                      {t("err.fix.continue")}
                    </button>
                  </>
                ) : (
                  <>
                    <span>{tr("ui.app.the.last.message.errored.may.block.d8a7ab7")}</span>
                    <button onClick={() => window.wuwei.undoLast()}>{tr("ui.app.delete.it.and.continue.6171cf9")}</button>
                  </>
                )}
              </div>
            )}
          {pendingImages.length > 0 && (
            <div className="img-strip">
              {pendingImages.map((src, i) => (
                <div className="thumb" key={i}>
                  <img
                    src={src}
                    alt=""
                    style={{ cursor: "zoom-in" }}
                    onClick={() => setLightbox(src)}
                  />
                  <button onClick={() => setPendingImages((p) => p.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {goal && (
            <div className={"goal-bar" + (goal.active ? " on" : "") + (goal.done ? " done" : "")}>
              <span className="goal-ico">{goal.done ? "✓" : "◎"}</span>
              <span className="goal-text" title={goal.text}>{goal.text}</span>
              {goal.active ? (
                <>
                  <span className="goal-state">{tr("ui.app.advancing.3b052de")}{modeOf(currentId) === "cont" && contN > 0 ? (tr("ui.app.step.b9f480f", { p0: contN })) : ""}</span>
                  <button
                    onClick={() => {
                      const g = { ...goal, active: false, done: goal.done };
                      window.wuwei.goalSet?.(currentId, g);
                      setGoal(g);
                      setMode(currentId, "auto"); // 暂停 = 回到自动，不再替你接话
                    }}
                  >
                    {tr("ui.app.pause.f55ca3a")}
                  </button>
                </>
              ) : (
                <>
                  {goal.done && <span className="goal-state">{tr("ui.app.done.486b41d")}</span>}
                  <button
                    className="on"
                    onClick={() => {
                      const g = { ...goal, active: true, done: false };
                      window.wuwei.goalSet?.(currentId, g);
                      setGoal(g);
                      setMode(currentId, "cont");
                      doSend(tr("ui.app.keep.advancing.toward.the.overall.goal.d9f303b"), []);
                    }}
                  >
                    {goal.done ? (tr("ui.app.restart.5a3a374")) : (tr("ui.app.resume.c70543e"))}
                  </button>
                </>
              )}
              <button onClick={() => openGoalEdit(currentId, goal)}>{tr("ui.app.edit.d4bf0a1")}</button>
              {!goal.done && (
                <button
                  title={tr("ui.app.mark.this.goal.as.achieved.02574d0")}
                  onClick={() => {
                    const g = { ...goal, active: false, done: true };
                    window.wuwei.goalSet?.(currentId, g);
                    setGoal(g);
                    setMode(currentId, "auto");
                  }}
                >
                  {tr("ui.app.done.cf6857b")}
                </button>
              )}
            </div>
          )}
          {suggestion && input === "" && (
            <div
              className="suggest-bar"
              title={t("suggest.title")}
              onClick={() => {
                // 点击=一步到位直接发；想先改的走 Tab 填入输入框
                const s = suggestion;
                setSuggestion("");
                submit(s);
              }}
            >
              <svg className="suggest-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3a6 6 0 0 0-3.4 10.9c.5.4.9 1 1 1.6h4.8c.1-.6.5-1.2 1-1.6A6 6 0 0 0 12 3z" />
                <path d="M9.6 18.5h4.8M10.5 21h3" />
              </svg>
              <span className="suggest-text">{suggestion}</span>
              {suggestWait > 0 ? (
                <button
                  className="suggest-wait"
                  title={tr("ui.app.smart.continue.judged.this.low.risk.1f0154d")}
                  onClick={(e) => { e.stopPropagation(); setSuggestWait(0); }}
                >
                  {tr("ui.app.auto.send.in.click.to.wait.23eb33f", { p0: suggestWait })}
                </button>
              ) : (
                <span className="suggest-key">{modeOf(currentId) === "cont" ? (tr("ui.app.smart.continue.26a845a")) : t("suggest.key")}</span>
              )}
              <button
                className="suggest-x"
                title={t("suggest.dismiss")}
                aria-label={t("suggest.dismiss")}
                onClick={(e) => {
                  e.stopPropagation(); // 别冒泡到整条(那会直接发送)
                  setSuggestWait(0); // 智能继续:关掉建议同时取消自动发送倒计时
                  setSuggestion("");
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M5 5l14 14M19 5L5 19" />
                </svg>
              </button>
            </div>
          )}
          <div className="input-wrap">
            <textarea
              ref={taRef}
              rows={1}
              placeholder={t("composer.placeholder")}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
              }}
              onKeyDown={onKeyDown}
              onPaste={(e) => {
                const its = e.clipboardData?.items;
                if (!its) return;
                const files: File[] = [];
                for (const it of its)
                  if (it.type.startsWith("image/")) {
                    const f = it.getAsFile();
                    if (f) files.push(f);
                  }
                if (files.length) {
                  e.preventDefault();
                  addFiles(files);
                }
              }}
            />
            {busy ? (
              <button className="send-btn stop" onClick={stop} title={t("composer.stop")}>
                <span className="stop-sq" />
              </button>
            ) : modeOf(currentId) === "cont" && !input.trim() && pendingImages.length === 0 ? (
              // 自主推进模式开着、此刻没在跑、输入框空 → 显示「待续跑」转圈，明确表示"活着、稍后自动继续"，
              // 避免两轮空档里显示成普通发送图标、让人误以为停了。点它可立即续跑，不必等看门狗。
              <button
                className="send-btn cont-wait"
                onClick={() => void autoContinue(currentId, tr("ui.app.keep.going.toward.the.overall.goal.34a5392"))}
                title={t("composer.contWait")}
              >
                <span className="by-spin" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}><Ic.IcRefresh size={15} /></span>
              </button>
            ) : (
              <button
                className={"send-btn" + (input.trim() || pendingImages.length ? " active" : "")}
                onClick={() => submit()} // 必须包一层：直接 onClick={submit} 会把 MouseEvent 当 override 传进去
                title={t("composer.send")}
                disabled={!input.trim() && pendingImages.length === 0}
              >
                ↵
              </button>
            )}
          </div>

          {/* 只在主对话视图渲染主底栏；群/私聊(appView==="rooms")用 RoomView 自己的底栏，
              否则两处 renderComposerFoot 同时挂载会让连通/额度等弹窗重复出现两个。 */}
          {appView === null && renderComposerFoot()}
        </div>

        {showTasks && runningSet.size > 0 && (
          <>
            <div className="mq-overlay" onClick={() => setShowTasks(false)} />
            <div className="tasks-panel">
              <div className="tp-head">{tr("ui.app.running.tasks.73db050", { p0: runningSet.size })}</div>
              {[...runningSet].map((sid) => {
                const meta = sessions.find((s) => s.id === sid);
                const title = meta?.title || (sid === currentId ? (tr("ui.app.current.chat.be080be")) : (tr("ui.app.untitled.chat.228167e")));
                return (
                  <div key={sid} className={"tp-item" + (sid === currentId ? " cur" : "")}>
                    <span className="tp-dot" />
                    <span
                      className="tp-title"
                      title={t("tasks.switchTo")}
                      onClick={() => {
                        if (sid !== currentId) window.wuwei.switchSession(sid);
                        setShowTasks(false);
                      }}
                    >
                      {title}
                    </span>
                    <button
                      className="tp-stop"
                      title={t("tasks.stopThis")}
                      onClick={() => window.wuwei.stop(sid)}
                    >
                      {tr("composer.stop")}
                    </button>
                  </div>
                );
              })}
              <div className="tp-foot">
                <button className="tp-stopall" onClick={() => [...runningSet].forEach((s) => window.wuwei.stop(s))}>
                  {tr("ui.app.stop.all.1b2f691")}
                </button>
              </div>
            </div>
          </>
        )}

        {showUsage && (
          <div className="usage-panel">
            <div className="u-row">
              <span>{t("usage.ctxWindow")}</span>
              <span>
                {(usage.lastInput / 1000).toFixed(1)}k / {ctxWinLabel} ({ctxPct}%)
              </span>
            </div>
            <div className="u-bar">
              <div className="u-fill" style={{ width: ctxPct + "%" }} />
            </div>

            {/* 余额/额度未登录或过期：给个可点登录入口（kimi看额度rate，deepseek/zhipu看余额；有数据就不显示） */}
            {((account.providerId === "kimi-sub" && (account.expired || !rate)) ||
              ((account.providerId === "deepseek" || account.providerId === "zhipu") &&
                (account.expired || !account.balance?.total))) && (
                <div
                  className="u-row"
                  style={{ color: "#C05F3C", cursor: webLoginBusy ? "default" : "pointer", alignItems: "center" }}
                  title={t("usage.webLoginTitle")}
                  onClick={async () => {
                    if (webLoginBusy) return;
                    setWebLoginBusy(true);
                    await window.wuwei.webLogin(account.providerId!);
                    setWebLoginBusy(false);
                  }}
                >
                  <span>
                    {account.providerId === "kimi-sub"
                      ? account.expired
                        ? t("usage.quotaExpired")
                        : t("usage.quotaNoLogin")
                      : account.expired
                        ? t("usage.balExpired")
                        : t("usage.balNoLogin")}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {webLoginBusy ? t("usage.loggingIn") : t("usage.clickLogin")}
                    <RefreshIcon size={13} />
                  </span>
                </div>
              )}

            {meta.sub && rate ? (
              // 订阅类后端(Codex/Claude)：显示 5小时/周额度
              <>
                {rate.planType && (
                  <div className="u-row">
                    <span>{t("usage.plan")}</span>
                    <span style={{ textTransform: "capitalize" }}>
                      {rate.planType}
                      {rate.creditsUnlimited ? t("usage.unlimited") : ""}
                    </span>
                  </div>
                )}
                {typeof rate.primaryUsedPercent === "number" && (
                  <LimitRow
                    // 主窗口≥24h(如 Codex 现在的 168h=7天)：本身就是周尺度，直接标「周限额」，不再单列短窗口
                    label={(rate.primaryWindowMinutes ?? 300) >= 1440 ? t("limit.weekly") : windowLabel(rate.primaryWindowMinutes)}
                    used={rate.primaryUsedPercent}
                    resetSec={rate.primaryResetAfterSeconds}
                  />
                )}
                {(rate.primaryWindowMinutes ?? 300) < 1440 && typeof rate.secondaryUsedPercent === "number" && (
                  <LimitRow
                    label={t("limit.weekly")}
                    used={rate.secondaryUsedPercent}
                    resetSec={rate.secondaryResetAfterSeconds}
                  />
                )}
                {curProviderId === "codex" && codexResets && codexResets.availableCount > 0 && (
                  <div className="u-reset">
                    <div className="u-row">
                      <span>{t("usage.limitReset")}</span>
                      <span>{t("usage.availCount").replace("{n}", String(codexResets.availableCount))}</span>
                    </div>
                    {codexResets.credits
                      .filter((c) => c.status === "available")
                      .map((c) => (
                        <div key={c.id} className="u-reset-item">
                          <div className="u-reset-info">
                            <span className="u-reset-title">{c.title || "Full reset"}</span>
                            {c.expires_at && (
                              <span className="u-reset-exp">{t("usage.expiresOn").replace("{d}", new Date(c.expires_at).toLocaleDateString())}</span>
                            )}
                          </div>
                          {resetConfirm === c.id ? (
                            <span className="u-reset-confirm">
                              {t("usage.useThis")}
                              <button className="allow" onClick={() => doConsumeReset(c.id)}>
                                {t("usage.confirm")}
                              </button>
                              <button onClick={() => setResetConfirm(null)}>{tr("set.st.cancel")}</button>
                            </span>
                          ) : (
                            <button className="u-reset-btn" onClick={() => setResetConfirm(c.id)}>
                              {t("usage.useReset")}
                            </button>
                          )}
                        </div>
                      ))}
                    {resetMsg && <div className="u-reset-msg">{resetMsg}</div>}
                  </div>
                )}
                <div className="u-note">{t("usage.subNote")}</div>
              </>
            ) : curPreset?.hosted || curProviderId.startsWith("wuwei-") ? (
              // 无为托管：显示无为币余额（未登录则引导登录）
              wuwei ? (
                <>
                  {(!curPreset?.anon && !freeModelIds.has(meta.model) && wuwei.membership?.weeklyQuota?.active) ? (() => {
                    // 订阅版：隐藏无为币余额，只显本周「已用百分比」进度条(用多少涨多少) + 重置日。
                    // 仅纯无为托管付费平台+付费模型显示；免费体验(anon)/免费模型不吃周额度，走下面余额分支。
                    const wq = wuwei.membership!.weeklyQuota!;
                    const usedPct = Math.max(0, Math.min(100, 100 - wq.remainingPct));
                    const rd = wq.resetsAt ? new Date(wq.resetsAt) : null;
                    const rs = rd ? (lang !== "zh" ? rd.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : tr("ui.app.message.e83b0888fd", {p0: rd.getMonth() + 1, p1: rd.getDate()})) : "";
                    return (
                      <div style={{ margin: "2px 0 4px" }}>
                        <div className="u-row" style={{ marginBottom: 4 }}>
                          <span>{tr("ui.app.this.month.60c3b82")}</span>
                          <span>{tr("ui.app.used.1faca69", { p0: usedPct, p1: (lang !== "zh" ? rs ? ` · resets ${rs}` : "" : rs ? tr("ui.app.message.2f3db82794", {p0: rs}) : "") })}</span>
                        </div>
                        <div className="u-bar"><div className={"u-fill" + (usedPct >= 80 ? " danger" : usedPct >= 50 ? " warn" : "")} style={{ width: usedPct + "%" }} /></div>
                      </div>
                    );
                  })() : (
                    <div className="u-row">
                      <span>{t("usage.coinBal")}</span>
                      <span>{t("usage.coinAmount").replace("{n}", formatCredits(wuwei.coin.balance))}</span>
                    </div>
                  )}
                  <div className="u-row">
                    <span>{t("usage.sessTokens")}</span>
                    <span>
                      ↑{usage.totalInput.toLocaleString()} ↓{usage.totalOutput.toLocaleString()}
                    </span>
                  </div>
                  {/* 订阅版隐藏「按token扣无为币」说明——不让订阅用户感知币数 */}
                  {!wuwei.membership?.weeklyQuota?.active && (
                    <div className="u-note">{t("usage.hostedNote")}</div>
                  )}
                </>
              ) : curPreset?.anon ? (
                // 免登录免费体验：不显余额，给零摩擦提示 + 登录解锁引导
                <div
                  className="u-row"
                  style={{ color: "#C05F3C", cursor: "pointer", alignItems: "center" }}
                  onClick={() => {
                    setLoginResume(false);
                    setShowLoginForm(true);
                  }}
                >
                  <span>{t("usage.freeTrial")}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{t("usage.loginUnlock")}</span>
                </div>
              ) : (
                <div
                  className="u-row"
                  style={{ color: "#C05F3C", cursor: "pointer", alignItems: "center" }}
                  onClick={() => {
                    setLoginResume(false);
                    setShowLoginForm(true);
                  }}
                >
                  <span>{t("usage.coinBal")}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{t("usage.loginToView")}</span>
                </div>
              )
            ) : account.balance ? (
              // 计费类后端(DeepSeek 等)：显示账户余额 + 本会话已消耗
              <>
                {account.balance.total && (
                  <div className="u-row">
                    <span>{t("usage.acctBal")}</span>
                    <span>{t("usage.yuanAmount").replace("{n}", String(account.balance.total))}</span>
                  </div>
                )}
                {account.balance.consumed && (
                  <div className="u-row">
                    <span>{t("usage.sessConsumed")}</span>
                    <span>≈ {t("usage.yuanAmount").replace("{n}", String(account.balance.consumed))}</span>
                  </div>
                )}
                <div className="u-row">
                  <span>{t("usage.sessTokens")}</span>
                  <span>
                    ↑{usage.totalInput.toLocaleString()} ↓{usage.totalOutput.toLocaleString()}
                  </span>
                </div>
                <div className="u-note">
                  {account.balance.total
                    ? t("usage.balNote").replace("{label}", account.label ?? "")
                    : t("usage.consumeNote")}
                </div>
              </>
            ) : (
              // 无额度/无余额信息：显示 token 统计
              <>
                <div className="u-row">
                  <span>{t("usage.totalIn")}</span>
                  <span>{usage.totalInput.toLocaleString()} tokens</span>
                </div>
                <div className="u-row">
                  <span>{t("usage.totalOut")}</span>
                  <span>{usage.totalOutput.toLocaleString()} tokens</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {showBrowser && (
        <BrowserPanel
          t={t}
          info={browserInfo}
          mode={browserMode}
          detached={browserDetached}
          width={browserWidth}
          onResize={setBrowserWidth}
          onMode={setBrowserMode}
          onDetach={() => window.wuwei.browserDetach()}
          onReattach={() => window.wuwei.browserReattach()}
          onClose={() => {
            if (browserDetached) window.wuwei.browserReattach();
            setShowBrowser(false);
          }}
        />
      )}
      {/* 全局搜索：搜所有对话正文，下拉给「会话标题 + 关键词上下文摘要」，点一下切过去并滚到命中位置 */}
      {searchOpen && (
        <>
          <div className="mq-overlay" onClick={() => setSearchOpen(false)} />
          <div className="search-modal">
            <div className="search-bar">
              <SearchIcon />
              <input
                className="search-input"
                ref={searchInputRef}
                autoFocus
                placeholder={tr("ui.app.search.all.conversations.3a7961c")}
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => {
                  const hits = searchRes?.hits || [];
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setSearchOpen(false);
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSearchSel((i) => Math.min(i + 1, hits.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSearchSel((i) => Math.max(0, i - 1));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const h = hits[searchSel];
                    if (h) gotoHit(h);
                  }
                }}
              />
              {searchQ && (
                <button
                  className="search-clear"
                  title={tr("ui.app.clear.c69ad09")}
                  onMouseDown={(e) => e.preventDefault()} // 别把焦点从输入框抢走，清空后接着打字
                  onClick={() => setSearchQ("")}
                >
                  ×
                </button>
              )}
              <button className="search-x" title={tr("ui.app.close.esc.7afe0a1")} onClick={() => setSearchOpen(false)}>
                ×
              </button>
            </div>
            <div className="search-stat">
              {searching
                ? tr("ui.app.searching.first.run.builds.an.index.e8eef5c")
                : searchRes
                  ? searchRes.hits.length
                    ? tr("ui.app.matches.conversations.to.select.enter.to.8642956", { p0: searchRes.total, p1: searchRes.sessions, p2: (lang !== "zh" ? searchRes.truncated ? "（showing the most relevant）" : "" : searchRes.truncated ? tr("ui.app.message.c2893d4ef0") : "") })
                    : tr("ui.app.no.content.matching.e908bab", { p0: searchQ.trim() })
                  : tr("ui.app.search.across.all.questions.and.replies.255dbc7")}
            </div>
            {searchRes && searchRes.hits.length > 0 && (
              <div className="search-list">
                {searchRes.hits.map((h, i) => (
                  <div
                    key={h.sid + "|" + h.anchor + "|" + i}
                    className={"search-row" + (i === searchSel ? " sel" : "")}
                    ref={(el) => {
                      if (i === searchSel && el) el.scrollIntoView({ block: "nearest" });
                    }}
                    onMouseEnter={() => setSearchSel(i)}
                    onClick={() => gotoHit(h)}
                  >
                    <div className="search-row-top">
                      <span className="search-row-title" title={h.title}>
                        {h.title || (tr("ui.app.new.chat.fca06b0"))}
                      </span>
                      <span className={"search-role " + h.role}>
                        {h.role === "user"
                          ? tr("ui.index.me.d269d05")
                          : h.role === "assistant"
                            ? "AI"
                            : tr("ui.app.title.e7ded3b")}
                      </span>
                      <span className="search-row-time">{relTime(h.updatedAt)}</span>
                    </div>
                    <div className="search-snip">
                      {h.pre}
                      <mark>{h.match}</mark>
                      {h.post}
                      {h.more > 0 && (
                        <span className="search-more">
                          {tr("ui.app.more.here.4087fa7", { p0: h.more })}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      {historyView && (
        <>
          <div className="mq-overlay" onClick={() => setHistoryView(null)} />
          <div className="history-modal">
            <div className="history-head">
              <span className="history-title" title={historyView.title}>
                {historyView.title} · {tr("ui.app.full.history.0d22e9f")}
                {historyView.compacted && <span className="history-badge">{tr("ui.app.incl.pre.compaction.5165a66")}</span>}
              </span>
              <button className="history-close" title={tr("msg.close")} onClick={() => setHistoryView(null)}>✕</button>
            </div>
            <div className="history-body stream">
              {historyView.loading ? (
                <div className="history-empty">{tr("set.brain.warming")}</div>
              ) : historyView.items.length === 0 ? (
                <div className="history-empty">{tr("ui.app.no.history.for.this.conversation.yet.bc04cb1")}</div>
              ) : (
                historyView.items.map((it, i) => <ItemView key={i} item={it} now={now} />)
              )}
            </div>
          </div>
        </>
      )}
      {goalEdit && (() => {
        const en = lang !== "zh";
        const ge = goalEdit;
        const setGE = (patch: Partial<NonNullable<typeof goalEdit>>) => setGoalEdit({ ...ge, ...patch });
        // —— 树形计划的增删改(按 id 递归) ——
        type PN = import("./env").PlanStep;
        const newNode = (): PN => ({ id: "n" + ++planIdCounter.current, title: "", acceptance: "", status: "todo" });
        const updNode = (nodes: PN[], id: string, patch: Partial<PN>): PN[] =>
          nodes.map((n) => (n.id === id ? { ...n, ...patch } : n.children ? { ...n, children: updNode(n.children, id, patch) } : n));
        const rmNode = (nodes: PN[], id: string): PN[] =>
          nodes.filter((n) => n.id !== id).map((n) => (n.children ? { ...n, children: rmNode(n.children, id) } : n));
        const addChildTo = (nodes: PN[], pid: string): PN[] =>
          nodes.map((n) => (n.id === pid ? { ...n, children: [...(n.children || []), newNode()] } : n.children ? { ...n, children: addChildTo(n.children, pid) } : n));
        const setStepId = (id: string, patch: Partial<PN>) => setGE({ plan: updNode(ge.plan, id, patch) });
        const delStepId = (id: string) => setGE({ plan: rmNode(ge.plan, id) });
        const addChildId = (pid: string) => { setGE({ plan: addChildTo(ge.plan, pid) }); setPlanCollapsed((s) => { const n = new Set(s); n.delete(pid); return n; }); };
        const addRootStep = () => setGE({ plan: [...ge.plan, newNode()] });
        const toggleCollapse = (id: string) => setPlanCollapsed((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
        // 递归渲染计划树(depth 1..3)
        const renderNodes = (nodes: PN[], depth: number, prefix: string): any =>
          nodes.map((s, i) => {
            const no = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
            const hasKids = !!(s.children && s.children.length);
            const collapsed = planCollapsed.has(s.id);
            return (
              <div className="goal-node" key={s.id} style={{ marginLeft: (depth - 1) * 16 }}>
                <div className="goal-node-row">
                  <span className="goal-node-gutter">
                    {hasKids ? (
                      <button type="button" className="goal-node-toggle" onClick={() => toggleCollapse(s.id)}>{collapsed ? "▸" : "▾"}</button>
                    ) : (
                      <span className="goal-node-dot" />
                    )}
                    <span className="goal-node-no">{no}</span>
                  </span>
                  <div className="goal-node-body">
                    <div className="goal-node-titlerow">
                      <input className="goal-node-title" value={s.title} placeholder={tr("ui.app.node.title.57405dc")} onChange={(e) => setStepId(s.id, { title: e.target.value })} />
                      {depth < 3 && <button type="button" className="goal-node-add" title={tr("ui.app.add.sub.node.04101ed")} onClick={() => addChildId(s.id)}>+{tr("ui.app.sub.00e7cfe")}</button>}
                      <button type="button" className="goal-node-del" title={tr("set.mcp.delete")} onClick={() => delStepId(s.id)}>×</button>
                    </div>
                    <textarea className="goal-node-desc" rows={2} value={s.description || ""} placeholder={tr("ui.app.description.optional.can.be.detailed.6dd52b6")} onChange={(e) => setStepId(s.id, { description: e.target.value })} />
                    <input className="goal-node-acc" value={s.acceptance} placeholder={tr("ui.app.acceptance.criterion.1424093")} onChange={(e) => setStepId(s.id, { acceptance: e.target.value })} />
                  </div>
                </div>
                {hasKids && !collapsed && renderNodes(s.children!, depth + 1, no)}
              </div>
            );
          });
        // 彻底关闭放弃：解除调研武装 + 清掉持久化的调研状态。用于 ×/取消/删除目标。
        const discard = () => { window.wuwei.charterResearchCancel?.(ge.sid); window.wuwei.charterDraftDisarm?.(ge.sid); saveResearchState(ge.sid, null); researchSidRef.current = null; setResearchLive(null); setGoalEdit(null); };
        // 缩小：收起成小药丸，不动任何状态——调研继续在后台跑、进度继续记，点开还在。
        const minimize = () => setGoalEdit({ ...ge, minimized: true });
        // 只保存：存下当前字段，但不解除调研、不清进度——关掉后调研照跑，重开自动恢复+补回草稿。
        const saveOnly = () => {
          const c = buildCharter(ge, false);
          const g = c.text.trim() ? c : null;
          window.wuwei.goalSet?.(ge.sid, g);
          if (ge.sid === currentId) setGoal(g);
          setGoalEdit(null);
        };
        // 收起态：只画一个悬浮小药丸(带调研进度)，点它展开
        if (ge.minimized) {
          return (
            <button
              className={"goal-mini" + (ge.researching ? " researching" : "")}
              title={tr("ui.app.open.goal.setup.68a9832")}
              onClick={() => setGoalEdit({ ...ge, minimized: false })}
            >
              {ge.researching ? <span className="goal-research-spin" /> : <span className="goal-mini-ico">◎</span>}
              <span className="goal-mini-text">{ge.researching && researchLive ? researchLive.label : ge.text || (tr("ui.app.goal.setup.0ffd459"))}</span>
              {ge.researching && researchLive && researchLive.steps > 0 && <span className="goal-mini-step">#{researchLive.steps}</span>}
            </button>
          );
        }
        return (
        <>
          <div className="mq-overlay goal-modal-overlay" onClick={minimize} />
          <div className="goal-modal goal-modal-lg">
            <div className="goal-modal-h">
              <span className="goal-modal-h-t">◎ {tr("ui.app.overall.goal.for.this.conversation.82ea34e")}</span>
              <span style={{ flex: 1 }} />
              <button className="goal-modal-icon" title={tr("ui.app.minimize.keeps.researching.in.background.b08cede")} onClick={minimize} aria-label={tr("ui.shared.0c3639c109")}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><line x1="3.5" y1="8" x2="12.5" y2="8" /></svg>
              </button>
              <button className="goal-modal-icon" title={tr("ui.app.close.discards.this.research.0295168")} onClick={discard} aria-label={tr("ui.shared.da38860cb8")}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" /></svg>
              </button>
            </div>
            <div className="goal-modal-scroll">
              <div className="goal-modal-sub">
                {tr("ui.app.describe.what.you.want.to.achieve.668a184")}
              </div>
              {/* 总目标 */}
              <div className="goal-field-label">{tr("ui.app.overall.goal.b2b0bbd")}</div>
              <textarea
                autoFocus
                rows={3}
                value={ge.text}
                placeholder={tr("ui.app.research.the.latest.literature.converge.on.641db33")}
                onChange={(e) => setGE({ text: e.target.value })}
              />
              {/* 调研并拟计划 */}
              <div className="goal-sec-row">
                <button className="goal-research-btn" disabled={!ge.text.trim() || ge.researching} onClick={startResearch}>
                  {ge.researching ? (tr("ui.app.researching.2c42485")) : (tr("ui.app.research.draft.plan.6faab6e"))}
                </button>
                <span className="goal-sec-hint">
                  {tr("ui.app.let.ai.search.the.latest.papers.fb7e30e")}
                </span>
              </div>
              {/* 调研方向/来源(可增删)：默认 最新论文/最新新闻/GitHub */}
              <div className="goal-src-row">
                <span className="goal-src-label">{tr("ui.app.sources.directions.b6b3480")}</span>
                {researchSources.map((s, i) => (
                  <span className="goal-src-chip" key={i}>
                    {s}
                    <button type="button" title={tr("msg.remove")} onClick={() => setResearchSources((arr) => arr.filter((_, j) => j !== i))}>×</button>
                  </span>
                ))}
                <input
                  className="goal-src-input"
                  value={srcInput}
                  placeholder={tr("ui.app.add.source.7331b73")}
                  onChange={(e) => setSrcInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && srcInput.trim()) { e.preventDefault(); setResearchSources((arr) => arr.includes(srcInput.trim()) ? arr : [...arr, srcInput.trim()]); setSrcInput(""); }
                  }}
                />
              </div>
              {ge.researching && (
                <div className="goal-researching">
                  <div>{tr("ui.app.ai.is.researching.in.an.isolated.216a4af")}</div>
                  {researchLive && (
                    <div className="goal-research-live">
                      <span className="goal-research-spin" />
                      <span className="goal-research-step">{researchLive.steps > 0 ? `#${researchLive.steps}` : ""}</span>
                      <span className="goal-research-label" title={researchLive.label}>{researchLive.label}</span>
                    </div>
                  )}
                </div>
              )}
              {/* JSON 视图：与下面字段/计划双向实时同步。改下面→JSON 跟着变；改 JSON→下面跟着变；可整份复制迁移到别的对话 */}
              <button type="button" className="goal-paste-toggle" onClick={() => setPasteOpen((v) => !v)}>
                {pasteOpen ? (tr("ui.app.json.live.synced.with.the.fields.c1c11f0")) : (tr("ui.app.view.edit.copy.as.json.live.174e851"))}
              </button>
              {pasteOpen && (
                <div className="goal-paste">
                  <textarea
                    className="goal-json-view"
                    rows={8}
                    value={pasteText}
                    placeholder={tr("ui.app.the.whole.charter.as.json.edit.d1cf330")}
                    onFocus={() => { jsonEditingRef.current = true; }}
                    onBlur={() => {
                      jsonEditingRef.current = false;
                      // 失焦时若能解析，用规范格式回刷一遍(整理缩进)；解析不了就保留原文+错误
                      const p = parseCharterText(pasteText);
                      if (p) setPasteText(charterToJson({ research: ge.research, ruleDo: ge.ruleDo, ruleDont: ge.ruleDont, plan: ge.plan }));
                    }}
                    onChange={(e) => {
                      const raw = e.target.value;
                      jsonEditingRef.current = true;
                      setPasteText(raw);
                      const p = parseCharterText(raw);
                      if (p) {
                        setPasteErr("");
                        setGE({ research: p.research, ruleDo: p.ruleDo, ruleDont: p.ruleDont, plan: p.plan.length ? p.plan : ge.plan });
                      } else {
                        setPasteErr(tr("ui.app.invalid.json.fields.below.keep.the.a9e415a"));
                      }
                    }}
                  />
                  <div className="goal-paste-b">
                    {pasteErr && <span className="goal-paste-err">{pasteErr}</span>}
                    <span style={{ flex: 1 }} />
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        const txt = charterToJson({ research: ge.research, ruleDo: ge.ruleDo, ruleDont: ge.ruleDont, plan: ge.plan });
                        navigator.clipboard?.writeText(txt).then(() => { setPasteErr(tr("ui.app.copied.86221c1")); setTimeout(() => setPasteErr(""), 1500); }).catch(() => {});
                      }}
                    >
                      {tr("ui.app.copy.json.00dbb88")}
                    </button>
                  </div>
                </div>
              )}
              {/* 调研结论 */}
              <div className="goal-field-label">{tr("ui.app.research.findings.494f67c")}<span className="goal-field-opt">{tr("ui.app.optional.a52b3ba")}</span></div>
              <textarea
                rows={4}
                value={ge.research}
                placeholder={tr("ui.app.findings.from.the.research.above.or.f587b09")}
                onChange={(e) => setGE({ research: e.target.value })}
              />
              {/* 计划(树形，最多3层，每节点带说明+验收，可展开子节点) */}
              <div className="goal-field-label">{tr("ui.app.execution.plan.tree.up.to.levels.de8ea8c")}</div>
              <div className="goal-plan">
                {ge.plan.length === 0 && (
                  <div className="goal-plan-empty">{tr("ui.app.no.nodes.yet.click.research.above.c6e4fcd")}</div>
                )}
                {renderNodes(ge.plan, 1, "")}
                <button className="goal-plan-add" onClick={addRootStep}>{tr("ui.app.add.node.a531190")}</button>
              </div>
              {/* 规则：要做 / 绝不做 */}
              <div className="goal-rules">
                <div className="goal-rules-col">
                  <div className="goal-field-label">{tr("ui.app.must.do.c161293")}</div>
                  <textarea rows={3} value={ge.ruleDo} placeholder={tr("ui.app.verify.each.step.with.real.data.d2a3210")} onChange={(e) => setGE({ ruleDo: e.target.value })} />
                </div>
                <div className="goal-rules-col">
                  <div className="goal-field-label goal-field-dont">{tr("ui.app.never.do.drift.guard.147a137")}</div>
                  <textarea rows={3} value={ge.ruleDont} placeholder={tr("ui.app.don.turn.this.into.an.unrelated.43a8616")} onChange={(e) => setGE({ ruleDont: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="goal-modal-b">
              {goal && (
                <button
                  className="ghost"
                  onClick={() => {
                    window.wuwei.goalSet?.(ge.sid, null);
                    if (ge.sid === currentId) setGoal(null);
                    discard();
                  }}
                >
                  {tr("ui.app.delete.goal.0a158b0")}
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button className="ghost" onClick={discard}>{tr("set.st.cancel")}</button>
              <button className="ghost" onClick={saveOnly}>{tr("ui.app.save.only.d223118")}</button>
              <button className="primary" disabled={!ge.text.trim()} onClick={() => startGoal(ge)}>
                {tr("ui.app.start.08913c7")}
              </button>
            </div>
          </div>
        </>
        );
      })()}
      {showTrash && (
        <>
          <div className="mq-overlay" onClick={() => setShowTrash(false)} />
          <div className="trash-modal">
            <div className="trash-head">
              <span className="trash-head-t"><TrashIcon /> {tr("ui.app.trash.54c3cd7")}</span>
              <span className="trash-sub">{tr("ui.app.deleted.chats.can.be.restored.auto.f1acc97")}</span>
              <button className="trash-x" title={tr("msg.close")} onClick={() => setShowTrash(false)}>×</button>
            </div>
            <div className="trash-list">
              {trash.length === 0 && <div className="empty">{tr("ui.app.trash.is.empty.72fe978")}</div>}
              {trash.map((ti) => {
                const leftMs = ti.deletedAt + 7 * 24 * 3600 * 1000 - Date.now();
                const leftDays = Math.max(0, Math.ceil(leftMs / (24 * 3600 * 1000)));
                const title = ti.title || (tr("ui.app.new.chat.fca06b0"));
                return (
                  <div key={ti.id} className="trash-row">
                    <div className="trash-info">
                      <div className="trash-title" title={title}>{title}</div>
                      <div className="trash-meta">
                        {ti.group ? (tr("ui.app.group.a254736", { p0: ti.group })) : ""}
                        {tr("ui.app.deleted.clears.in.1028f2e", { p0: relTime(ti.deletedAt), p1: leftDays })}
                      </div>
                    </div>
                    <button className="trash-restore" onClick={() => window.wuwei.restoreSession(ti.id)}>
                      {tr("ui.app.restore.88f8a7e")}
                    </button>
                    <button
                      className="trash-purge"
                      title={tr("ui.app.delete.permanently.cannot.undo.8717b03")}
                      onClick={() => {
                        askConfirm({ message: tr("ui.app.permanently.delete.this.cannot.be.undone.a400f65", { p0: title }), danger: true, onOk: () => window.wuwei.purgeTrash(ti.id) });
                      }}
                    >
                      {tr("ui.app.delete.8bafad6")}
                    </button>
                  </div>
                );
              })}
            </div>
            {trash.length > 0 && (
              <div className="trash-foot">
                <button
                  className="trash-empty"
                  onClick={() => {
                    askConfirm({ message: tr("ui.app.empty.trash.this.permanently.deletes.chat.990b2db", { p0: trash.length }), danger: true, onOk: () => window.wuwei.emptyTrash() });
                  }}
                >
                  {tr("ui.app.empty.trash.b26a3f8")}
                </button>
              </div>
            )}
          </div>
        </>
      )}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          userId={wuwei?.user.id}
          onHostedModels={providerId => {
            setShowSettings(false);
            setModelPickerCategory(pickerChoices.find(c => c.providerId === providerId)?.category ?? 'economy');
            setShowModelMenu(false); setShowProviderMenu(true);
          }}
          catalog={catalog}
          liveModels={liveModels}
          initialTab={settingsTab}
          executionMode={modeOf(currentId)}
          onExecutionMode={(mode) => {
            modeRef.current = sessionModesAfterSettingsChange(currentId, mode, sessions.map((session) => session.id), modeRef.current, defaultModeRef.current);
            defaultModeRef.current = mode;
            setDefaultMode(mode);
            localStorage.setItem(DEFAULT_MODE_KEY, mode);
            setMode(currentId, mode);
          }}
          groupMode={groupMode}
          onGroupMode={changeGroupMode}
          streamMode={streamMode}
          streamSpeed={streamSpeed}
          onStream={changeStream}
          keepRecent={keepRecent}
          onKeepRecent={changeKeepRecent}
          watchdogInterval={wdIntervalSec}
          watchdogIdle={wdIdleSec}
          onWatchdog={(interval, idle) => {
            setWdIntervalSec(interval); localStorage.setItem("wuwei-wd-interval", String(interval));
            setWdIdleSec(idle); localStorage.setItem("wuwei-wd-idle", String(idle));
          }}
          showEffortPicker={showEffortPicker}
          onShowEffortPicker={changeShowEffortPicker}
          lang={lang}
          onLang={changeLang}
          t={t}
          askToastAuto={askToastAuto}
          askToastSec={askToastSec}
          onAskToast={changeAskToast}
          onTeamEnabled={(v) => {
            setTeamEnabled(v);
            localStorage.setItem("wuwei-team-enabled", v ? "1" : "0");
            if (!v) setAppView(null); // 关掉时收起面板，别让用户停在一个已消失模块的空白页
          }}
        />
      )}
      {/* 每日签到：窗口居中小弹窗，自动消失。点任意处也可关。 */}
      {checkinPop && (
        <div className="checkin-pop-overlay" onClick={() => setCheckinPop(null)}>
          <div className="checkin-pop" onClick={(e) => e.stopPropagation()}>
            <div className="checkin-pop-ic">
              <CheckinDoneIcon size={30} />
            </div>
            {checkinPop === "already" ? (
              <div className="checkin-pop-title">{t("checkin.popAlready")}</div>
            ) : (
              <>
                <div className="checkin-pop-title">{t("checkin.popTitle")}</div>
                <div className="checkin-pop-amt">
                  <CoinIcon size={18} /> +{checkinPop.amount} {t("pay.credits")}
                </div>
                {checkinPop.streak && checkinPop.streak > 1 && (
                  <div className="checkin-pop-sub">{t("checkin.popStreak").replace("{d}", String(checkinPop.streak))}</div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {/* 免费脑网络介绍：打开实际设置，不创建付费订单 */}
      {showBrainIntro && (
        <BrainIntroModal
          t={t}
          onClose={() => setShowBrainIntro(false)}
          onOpenMemory={() => {
            setShowBrainIntro(false);
            setSettingsTab("brain");
            setShowSettings(true);
          }}
        />
      )}
      {/* 联系客服弹窗：支付遇到问题 / 账号菜单「联系客服」都可打开 */}
      {showSupport && (
        <ContactSupportModal
          t={t}
          onClose={() => setShowSupport(false)}
          onChat={() => { setShowSupport(false); setShowSupportChat(true); }}
          onLeaveMessage={() => {
            setShowSupport(false);
            setLeaveMsgFromSupport(true);
            setShowLeaveMsg(true);
          }}
        />
      )}
      {showSupportChat && (
        <SupportChatModal t={t} loggedIn={!!wuwei} onClose={() => setShowSupportChat(false)} />
      )}
      {showModelPricing && (
        <ModelPricingModal
          lang={lang}
          onClose={() => setShowModelPricing(false)}
          onContact={() => { setShowModelPricing(false); setShowSupport(true); }}
        />
      )}
      {/* 右下角悬浮客服球：常驻入口 + 有回复亮红点。可一键关掉(记住)，之后走账号菜单「联系客服」。 */}
      {wuwei && !showSupportChat && !scLauncherHidden && (
        <div className="sc-launcher-wrap">
          <button
            className="sc-launcher"
            title={tr("ui.app.support.chat.94aec4a")}
            onClick={() => { setSupportUnread(0); setShowSupportChat(true); }}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 13v-1a8 8 0 0 1 16 0v1" /><rect x="2.5" y="13" width="4" height="6" rx="1.6" /><rect x="17.5" y="13" width="4" height="6" rx="1.6" /><path d="M20 19a4 4 0 0 1-4 4h-2" />
            </svg>
            {supportUnread > 0 && <span className="sc-launcher-dot">{supportUnread > 9 ? "9+" : supportUnread}</span>}
          </button>
          <button
            className="sc-launcher-x"
            title={tr("ui.app.hide.reach.via.account.menu.cd14e14")}
            onClick={() => { setScLauncherHidden(true); localStorage.setItem("wuwei-sc-launcher-hidden", "1"); }}
          >
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      )}
      {/* 留言表单：客服弹窗点「直接留言」进入(带返回)；账号菜单「留言反馈」直接进入(无返回) */}
      {showLeaveMsg && (
        <LeaveMessageModal
          t={t}
          onClose={() => setShowLeaveMsg(false)}
          onBack={
            leaveMsgFromSupport
              ? () => {
                  setShowLeaveMsg(false);
                  setLeaveMsgFromSupport(false);
                  setShowSupport(true);
                }
              : undefined
          }
        />
      )}
      {/* 消息中心：账号菜单进入；进入即标全部已读并清红点 */}
      {showMsgCenter && (
        <MessageCenterModal
          t={t}
          lang={lang}
          onClose={() => setShowMsgCenter(false)}
          onRead={(u) => setMsgUnread(u)}
        />
      )}
      {showGuide && <HelpManualModal lang={lang} onClose={() => setShowGuide(false)} />}
      {/* 未登录发消息先弹的居中登录激励卡；点登录再切到下面的登录框 */}
      {showLoginIntro && (
        <LoginIntroModal
          lang={lang}
          t={t}
          reason={loginIntroReason ? t(loginIntroReason) : null}
          onLang={changeLang}
          showLangSwitch={langSwitchOnCard}
          onClose={() => { setShowLoginIntro(false); setLoginIntroReason(null); }}
          onKeepFree={async () => {
            // 继续免费体验：显式切到免登录免费模型(wuwei-free + glm-4.7-flash，唯一 anon 免登录)，
            // 保证关卡片后用户落在能直接用的免费模型上，而不是停在刚点的需登录模型上。
            setShowLoginIntro(false); setLoginIntroReason(null);
            const choice = anonymousDefaultModel(pickerChoicesRef.current);
            if (choice) await selectModelChoice(choice);
          }}
          onLogin={() => {
            setShowLoginIntro(false);
            setLoginIntroReason(null);
            setLoginResume(true);
            setShowLoginForm(true);
          }}
        />
      )}
      {/* 应用内登录框：邮箱/手机号/Google。未登录点发送(loginResume)或点账号登录时弹出 */}
      {showLoginForm && (
        <WuweiLoginModal
          sessionExpired={sessionExpiredNotice}
          incentive={false} /* 激励已由前置的 LoginIntroModal 展示，登录框保持干净，避免重复。loginResume 仍用于登录后续发消息 */
          lang={lang}
          t={t}
          onClose={() => {
            setShowLoginForm(false);
            setLoginResume(false);
          }}
          onLang={changeLang}
          onSuccess={onWuweiLoggedIn}
        />
      )}
      {/* 统一确认弹窗：替代原生 confirm()，玄墨黑 VI、遮罩点击=取消、danger 用红色确定按钮 */}
      {confirmDlg && (
        <div className="perm-overlay" style={{ zIndex: 1300 }} onClick={() => setConfirmDlg(null)}>
          <div className="add-st-dialog confirm-dialog" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            {confirmDlg.title && <h3 style={{ marginTop: 0 }}>{confirmDlg.title}</h3>}
            <div className="s-note" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, margin: confirmDlg.title ? "0 0 4px" : "2px 0 4px" }}>{confirmDlg.message}</div>
            <div className="btns" style={{ marginTop: 16 }}>
              <button onClick={() => setConfirmDlg(null)}>{tr("set.st.cancel")}</button>
              <button className={"allow" + (confirmDlg.danger ? " danger" : "")} onClick={() => { const fn = confirmDlg.onOk; setConfirmDlg(null); fn(); }}>
                {confirmDlg.okText || (tr("ui.app.confirm.a1f6762"))}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* SOP 文字输入弹窗：替代原生 prompt()（新建类别/新建SOP/重命名） */}
      {sopPrompt && <SopPromptDialog en={lang !== "zh"} opts={sopPrompt} onClose={() => setSopPrompt(null)} />}
      {/* 检查更新结果：居中弹窗提示（检查中/已最新/发现新版下载中） */}
      {updateMsg && (
        <div className="perm-overlay" onClick={() => setUpdateMsg("")}>
          <div className="add-st-dialog" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "6px 2px 2px", fontSize: 14, lineHeight: 1.6 }}>{updateMsg}</div>
            {dlProgress && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-dim)", marginBottom: 6 }}>
                  <span>{tr("ui.app.downloading.568fdf7")}</span>
                  <span>{dlProgress.percent}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: "var(--bg-raised)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${dlProgress.percent}%`, background: "var(--accent)", transition: "width .2s" }} />
                </div>
              </div>
            )}
            <div className="btns" style={{ marginTop: 14, justifyContent: "flex-end" }}>
              <button className="allow" onClick={() => setUpdateMsg("")}>{tr("ui.app.ok.c86991f")}</button>
            </div>
          </div>
        </div>
      )}
      {/* 新版已下载好：点药丸/菜单才弹此窗，提示一键升级重启（含改进说明）。「稍后」只关弹窗，药丸保留 */}
      {showUpdateModal && updateReady && (
        <div className="perm-overlay" onClick={() => setShowUpdateModal(false)}>
          <div className="add-st-dialog" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{tr("ui.app.new.version.is.ready.ccf8e2e", { p0: updateReady.version })}</h3>
            <div className="s-note" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, maxHeight: 240, overflow: "auto" }}>
              {updateReady.notes || (tr("ui.app.improvements.and.fixes.update.now.to.5499b8c"))}
            </div>
            <div className="btns" style={{ marginTop: 16 }}>
              <button onClick={() => setShowUpdateModal(false)}>{tr("ui.app.later.4fe0ba0")}</button>
              <button className="allow" onClick={() => window.wuwei.installUpdate()}>{tr("ui.app.update.restart.aed3107")}</button>
            </div>
          </div>
        </div>
      )}
      {/* 客户端公告：按安装版本 + 公告版本确认已读；暂时关闭不写入已读。 */}
      {import.meta.env.DEV && announcementPreview && <AnnouncementModal
        version="" {...selectAnnouncementLocale(announcementPreview, lang)}
        onClose={() => setAnnouncementPreview(null)}
        onOpenManual={() => { setAnnouncementPreview(null); setShowGuide(true); }}
      />}
      {announce && !announcementPreview && (() => {
        const closeAnnounce = () => announcementDeliveryRef.current?.dismiss(announce);
        return (
          <AnnouncementModal
            version={announce.version}
            {...selectAnnouncementLocale(announce, lang)}
            onClose={closeAnnounce}
            onAcknowledge={() => announcementDeliveryRef.current?.acknowledge(announce)}
            onOpenManual={() => { closeAnnounce(); setShowGuide(true); }}
          />
        );
      })()}
      {freeCapModal && <FreeQuotaGuide
        lang={lang}
        balance={freeCapModal.balance}
        hasMemberQuota={!!freeCapModal.hasMemberQuota}
        recommendations={pickerChoices.filter((choice) => choice.category === 'economy' && choice.recommended).slice(0, 3).map((choice) => lang !== "zh" ? choice.labelEn : choice.label)}
        onClose={() => { usageLimitRequestRef.current = null; setFreeCapModal(null); }}
        onChoose={() => {
          usageLimitRequestRef.current = null;
          setFreeCapModal(null); setModelPickerCategory('economy');
          setShowModelMenu(false); setShowProviderMenu(true);
          void refreshCatalog();
          void window.wuwei.track?.('free_cap_choose_value_models', { model: freeCapModal.model, balance: freeCapModal.balance });
        }}
      />}
      {/* 高价模型烧周额度过快：建议一键切到更省的 DeepSeek V4 Flash / GLM-5.3 Flash；点「继续用」则不再打扰这档 */}
      {quotaWarn && (() => {
        const en = lang !== "zh";
        const labelOf = (m: string) => MODEL_LABEL_OVERRIDES[m] || (en ? modelLabelsEn.get(m) : undefined) || modelLabels.get(m) || m;
        const curLabel = labelOf(quotaWarn.model);
        const ds = findHostedModel("deepseek-v4-flash");
        const glm = findHostedModel("glm-5.3-flash");
        const rd = quotaWarn.resetsAt ? new Date(quotaWarn.resetsAt) : null;
        const rs = rd ? (en ? rd.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : tr("ui.app.message.e83b0888fd", {p0: rd.getMonth() + 1, p1: rd.getDate()})) : "";
        const switchTo = (t: { provider: (typeof providerList)[number]; model: string } | null) => { if (t) void switchToHosted(t.provider, t.model); setQuotaWarn(null); };
        return (
          <>
            <div className="mq-overlay" style={{ zIndex: 200 }} onClick={() => setQuotaWarn(null)} />
            <div className="freecap-modal">
              <button className="freecap-x" title={tr("msg.close")} onClick={() => setQuotaWarn(null)}>×</button>
              <div className="freecap-title">{tr("ui.app.you.re.burning.your.monthly.quota.40a3a73")}</div>
              <div className="freecap-sub">
                {tr("ui.app.you.re.on.which.costs.more.d223630", { p0: curLabel, p1: quotaWarn.usedPct, p2: (en ? rs ? ` (resets ${rs})` : "" : rs ? tr("ui.app.message.6a84bc0152", {p0: rs}) : "") })}
              </div>
              <div className="freecap-actions">
                {ds && (
                  <button className="freecap-primary" onClick={() => switchTo(ds)}>
                    {tr("ui.app.switch.to.f34fba7", { p0: labelOf(ds.model) })}
                  </button>
                )}
                {glm && (
                  <button className="freecap-secondary" onClick={() => switchTo(glm)}>
                    {tr("ui.app.switch.to.f34fba7", { p0: labelOf(glm.model) })}
                  </button>
                )}
                <button className="freecap-ghost" onClick={() => setQuotaWarn(null)}>{tr("ui.app.keep.using.4edaefa", { p0: curLabel })}</button>
              </div>
            </div>
          </>
        );
      })()}
      {/* ① 无为币不足触发弹窗（v2）：金色升级Pro在上(更划算) + 朱色购买积分包在下 */}
      {coinShortage && !wuwei?.flags?.includes('billing_v2') && !billingPreview && (
        <TrialPayModal
          en={lang !== "zh"}
          balance={coinShortage.balance != null ? coinShortage.balance : wuwei?.coin.balance ?? 0}
          rebind={coinShortage.rebind}
          context={debugCtx ?? (coinShortage.freecap ? "freecap" : coinShortage.browse ? "browse" : ((wuwei?.membership?.weeklyQuota?.active && (wuwei.membership.weeklyQuota.remainingPct ?? 0) <= 0) ? "weekly" : "shortage"))}
          opts={payOpts}
          defaultSku={payDefaultSku}
          onClose={() => closeShortage("close")}
          onRebind={async () => {
            const rb = coinShortage.rebind!;
            closeShortage("rebind");
            await applyBoundModel(rb.providerId, rb.model);
            push({
              type: "notice",
              text:
                tr("ui.app.switched.this.chat.to.direct.no.37523df", { p0: rb.label }),
            });
          }}
          onPaddle={(opt) => { closeShortage("pay_paddle"); startEnCheckout(opt.sku); }}
          onCrypto={(opt) => {
            if (!wuwei?.user.id) { setShowLoginForm(true); return; }
            closeShortage("pay_crypto");
            setCryptoPay({ sku: opt.sku, name: lang !== "zh" ? opt.nameEn : opt.name, price: money(lang !== "zh", opt.price, opt.priceUsd) });
          }}
          onContact={() => { closeShortage("contact"); setShowSupportChat(true); }}
          onFaq={() => { void window.wuwei.track?.("credits_shortage_action", { action: "faq" }); setPayFaqOpen(true); }}
          onNeedLogin={() => {
            closeShortage("need_login");
            setWuwei(null);
            setLoginResume(false);
            setShowLoginForm(true);
          }}
          onPaid={(balance, orderId, opt) => {
            closeShortage("pay_paid");
            if (opt.kind === "pack") {
              // 积分包：到账即加无为币，走「积分到账」结果页
              setPayResult({ kind: "coin", added: opt.coins, bonus: 0, balance: balance ?? (wuwei?.coin.balance ?? 0) + opt.coins, order: orderId || "" });
            } else {
              setPayResult({
                kind: "pro",
                planName: lang !== "zh" ? opt.nameEn : opt.name,
                expire: fmtDate(opt.kind === "trial" ? new Date(Date.now() + opt.days * 24 * 3600_000) : addMonths(new Date(), 1)),
                giftCoins: opt.coins,
                signin: opt.signin,
                perks: (PRO_FEATS()).map(([tt]) => tt),
                saved: opt.saved,
                order: orderId || "",
              });
            }
            void window.wuwei.wuweiMe().then((me) => { if (me) setWuwei(me); }).catch(() => {}); // 拉最新会员/余额
          }}
        />
      )}
      {payFaqOpen && <PayFaqModal en={lang !== "zh"} onClose={() => setPayFaqOpen(false)} />}
      {coinPackOpen && !wuwei?.flags?.includes('billing_v2') && !billingPreview && (
        <CoinPackModal
          t={t}
          lang={lang}
          packs={wuwei?.flags?.includes("coinpack_test") ? [TEST_COIN_PACK, ...COIN_PACKS] : COIN_PACKS}
          onClose={() => setCoinPackOpen(false)}
          onCheckout={(pack) => {
            setCoinPackOpen(false);
            if (lang !== "zh") { startEnCheckout(pack.sku); return; } // 海外走网页 Paddle 结账
            setPayCheckout({ kind: "pack", pack });
          }}
          onUpgrade={() => {
            setCoinPackOpen(false);
            setPlanOpen(true);
          }}
        />
      )}
      {planOpen && !wuwei?.flags?.includes('billing_v2') && !billingPreview && (
        <PlanModal
          t={t}
          lang={lang}
          onClose={() => setPlanOpen(false)}
          onCheckout={(plan) => {
            setPlanOpen(false);
            if (lang !== "zh") { startEnCheckout(plan.sku); return; } // 海外走网页 Paddle 结账
            setPayCheckout({ kind: "plan", plan });
          }}
        />
      )}
      {wuwei && (billingOpen || ((wuwei.flags?.includes('billing_v2') || billingPreview) && (coinShortage || coinPackOpen || planOpen))) && (
        <BillingPanel key={wuwei.user.id}
          lang={lang} accountId={wuwei.user.id} balance={wuwei.coin.balance} models={pickerChoices}
          initialPage={billingOpen?billingPage:'plans'} initialPeriod={coinPackOpen?'pack':"monthly"}
          insufficient={!!coinShortage&&!coinShortage.browse} imageMode={imageMode}
          onClose={()=>{setBillingOpen(false);setBillingPage('plans');setCoinPackOpen(false);setPlanOpen(false);if(coinShortage)closeShortage("close");}}
          onNeedLogin={()=>{setBillingOpen(false);setCoinShortage(null);setCoinPackOpen(false);setPlanOpen(false);setWuwei(null);setShowLoginForm(true);}}
          onPaid={()=>{const paidUser=wuwei.user.id;void window.wuwei.wuweiMe().then(me=>{if(me?.user.id===paidUser)setWuwei(current=>current?.user.id===paidUser?me:current);}).catch(()=>{});}}
          onSwitch={async choice=>{if(!await selectModelChoice(choice))throw new Error('model_switch_failed');push({type:'notice',text:tr("ui.app.model.switched.send.your.message.when.c9fcf0d")});}}
        />
      )}
      {payCheckout && (
        <PayCheckoutModal
          order={payCheckout}
          onClose={() => setPayCheckout(null)}
          onPaid={(balance, orderId) => {
            const o = payCheckout;
            const ord = orderId || ""; // 真实后端订单号（拿不到就留空，不再瞎编）
            if (o.kind === "pack") {
              const added = o.pack.coins + o.pack.bonus;
              setPayResult({ kind: "coin", added, bonus: o.pack.bonus, balance: balance ?? (wuwei?.coin.balance ?? 0) + added, order: ord });
            } else {
              setPayResult({
                kind: "pro",
                planName: o.plan.name,
                expire: fmtDate(addMonths(new Date(), 1)), // 月付：+1 个月
                giftCoins: o.plan.coins,
                signin: o.plan.signin,
                perks: (PRO_FEATS()).map(([tt]) => tt), // 各档同样的会员权益
                saved: o.plan.saved || undefined,
                order: ord,
              });
            }
            setPayCheckout(null);
            void window.wuwei.wuweiMe().then((me) => { if (me) setWuwei(me); }).catch(() => {}); // 拉最新余额/会员(接后端后即真数据)
          }}
          onContactSupport={() => setShowSupport(true)}
          onNeedLogin={() => {
            setPayCheckout(null);   // 关掉支付页
            setWuwei(null);         // 本地登录态失效，账号菜单回落到「登录」
            setLoginResume(false);
            setShowLoginForm(true); // 直接弹登录框
          }}
        />
      )}
      {payResult && (
        <PayResultModal
          result={payResult}
          onClose={() => setPayResult(null)}
          onRetry={() => {
            setPayResult(null);
            setCoinShortage(null);
          }}
        />
      )}
      {cryptoPay && (
        <CryptoPayModal
          en={lang !== "zh"}
          sku={cryptoPay.sku}
          planName={cryptoPay.name}
          priceLabel={cryptoPay.price}
          onPaid={(balance, orderId) => {
            const sku = cryptoPay.sku;
            setCryptoPay(null); setCoinShortage(null); setFreeCapModal(null);
            if (balance !== undefined) setWuwei((me) => me ? { ...me, coin: { ...me.coin, balance } } : me);
            const opt = [...buildPackOpts(), ...buildPayOpts(true)].find((o) => o.sku === sku);
            if (opt?.kind === "pack") {
              setPayResult({ kind: "coin", added: opt.coins, bonus: 0, balance: balance ?? 0, order: orderId });
            } else if (opt) {
              setPayResult({ kind: "pro", planName: lang !== "zh" ? opt.nameEn : opt.name,
                expire: fmtDate(opt.kind === "trial" ? new Date(Date.now() + opt.days * 86400_000) : addMonths(new Date(), 1)),
                giftCoins: opt.coins, signin: opt.signin,
                perks: (PRO_FEATS()).map(([tt]) => tt), order: orderId });
            } else {
              push({ type: "notice", text: tr("ui.app.payment.received.your.account.has.been.57690aa") });
            }
            void window.wuwei.wuweiMe().then((me) => { if (me) setWuwei(me); }).catch(() => {});
            void runConnCheck();
          }}
          onClose={() => setCryptoPay(null)}
          onContact={() => { setCryptoPay(null); setShowSupportChat(true); }}
        />
      )}
      {roomSettings && (() => {
        const room = teamRooms.find((r: any) => r.id === roomSettings.id);
        if (!room) return null;
        return (
          <RoomSettingsModal
            en={lang !== "zh"}
            room={room}
            employees={teamEmployees}
            onClose={() => setRoomSettings(null)}
            onSave={async (patch) => {
              const api = (window as any).wuwei?.team;
              const res = await api?.roomUpdate?.(room.id, patch);
              if (res?.rooms) setTeamRooms(res.rooms); // 主进程也会广播 evt:team-rooms，这里直接用返回值即时刷新
              setRoomSettings(null);
            }}
          />
        );
      })()}
      {/* 右键员工「编辑」：顶层弹编辑框，覆盖在当前界面上，不切走 appView。保存后 evt:team 广播自动刷新侧栏。 */}
      {editEmp && (
        <EmployeeEditModal
          en={lang !== "zh"}
          providers={providerList.map((p) => ({ id: p.id, label: p.label || p.id, models: (p.models || []) as string[], choices: pickerChoices.filter(c => c.providerId === p.id) }))}
          loggedIn={!!wuwei} onRequireLogin={requestModelLogin}
          onConnections={() => { setSettingsTab('platforms'); setShowSettings(true); }}
          employee={editEmp}
          onClose={() => setEditEmp(null)}
        />
      )}
      {scheduleModal && (
        <ScheduleModal
          en={lang !== "zh"}
          employeeId={scheduleModal.employeeId}
          task={scheduleModal.task}
          sopNodes={(sopTree || []).filter((n: any) => n.kind === "sop").map((n: any) => ({ id: n.id, name: n.name }))}
          onClose={() => setScheduleModal(null)}
        />
      )}
      {secretPrompt && (
        <div className="perm-overlay" onClick={() => setSecretPrompt(null)}>
          <div className="add-st-dialog sec-prompt" onClick={(e) => e.stopPropagation()}>
            <h3>{tr("ui.app.possible.secret.detected.a1e27ea")}</h3>
            <p className="s-note">
              {tr("ui.app.found.the.sensitive.info.below.check.7b5555c")}
            </p>
            <div className="sec-cand-list">
              {secretPrompt.candidates.map((c, i) =>
                c.existing ? (
                  // 值已在保险箱、但这次描述不同→让用户三选一
                  <div key={i} className="sec-cand sec-cand-dup">
                    <div className="sec-cand-dup-top">
                      <span className="sec-cand-kind dup">{tr("ui.app.exists.bb929ba")}</span>
                      <span className="sec-cand-val">{c.masked}</span>
                      <span className="sec-cand-meta">
                        {tr("ui.app.old.note.19596fd")}{c.existing.note || (tr("set.mcp.dNone"))} → {tr("ui.app.new.a7dba94")}<b>{c.note}</b>
                      </span>
                    </div>
                    <div className="sec-seg">
                      {(["new", "overwrite", "ignore"] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          className={"sec-seg-btn" + (secretPrompt.dupChoice[i] === opt ? " on" : "")}
                          onClick={() => {
                            const dupChoice = [...secretPrompt.dupChoice];
                            dupChoice[i] = opt;
                            setSecretPrompt({ ...secretPrompt, dupChoice });
                          }}
                        >
                          {opt === "new" ? (tr("ui.app.save.as.new.f986488")) : opt === "overwrite" ? (tr("ui.app.overwrite.note.dd850d9")) : (tr("ui.app.don.save.d7a577e"))}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <label key={i} className="sec-cand">
                    <input
                      type="checkbox"
                      checked={secretPrompt.checked[i]}
                      onChange={(e) => {
                        const checked = [...secretPrompt.checked];
                        checked[i] = e.target.checked;
                        setSecretPrompt({ ...secretPrompt, checked });
                      }}
                    />
                    <span className="sec-cand-kind">{c.kind}</span>
                    <span className="sec-cand-val">{c.masked}</span>
                    <span className="sec-cand-meta">
                      → <b>{c.suggestedName}</b>
                      {c.note ? ` · ${c.note}` : ""}
                    </span>
                  </label>
                ),
              )}
            </div>
            <div className="btns">
              <button onClick={() => setSecretPrompt(null)}>{tr("ui.app.cancel.send.445481e")}</button>
              <button onClick={() => confirmSecretPrompt(false)}>{tr("ui.app.send.without.saving.d0fafb8")}</button>
              <button className="allow" onClick={() => confirmSecretPrompt(true)}>
                {tr("ui.app.save.replace.send.5857e4f")}
              </button>
            </div>
          </div>
        </div>
      )}
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img
            src={lightbox}
            alt=""
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => {
              e.preventDefault();
              openImageMenu?.(e.clientX, e.clientY, lightbox);
            }}
          />
          <button
            className="lightbox-close"
            title={t("lightbox.close")}
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(null);
            }}
          >
            ×
          </button>
        </div>
      )}

      {imgMenu && (
        <div
          className="img-menu-overlay"
          onClick={() => setImgMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setImgMenu(null);
          }}
        >
          <div
            className="img-menu"
            style={{ left: Math.min(imgMenu.x, window.innerWidth - 168), top: Math.min(imgMenu.y, window.innerHeight - 130) }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={async () => {
                const src = imgMenu.src;
                setImgMenu(null);
                const ok = await copyImageToClipboard(src);
                if (!ok) push({ type: "notice", text: tr("ui.app.failed.to.copy.image.try.save.68316ba") });
              }}
            >
              {tr("ui.app.copy.image.409f504")}
            </button>
            <button
              onClick={() => {
                saveImage(imgMenu.src);
                setImgMenu(null);
              }}
            >
              {tr("ui.app.save.image.8f2cf19")}
            </button>
            <button
              onClick={() => {
                setLightbox(imgMenu.src);
                setImgMenu(null);
              }}
            >
              {tr("ui.app.view.full.size.7d3f099")}
            </button>
          </div>
        </div>
      )}

      {ceoDeciding[currentId] && !asks[currentId] && (
        <CeoDecidingPill lang={lang} anchor={composerRef} info={ceoDeciding[currentId]} />
      )}

      {Object.values(toolDecisions)[0] && <ToolDecisionModal
        lang={lang}
        key={Object.values(toolDecisions)[0].permId} decision={Object.values(toolDecisions)[0]}
        onRespond={response => window.wuwei.respondDecision(Object.values(toolDecisions)[0].permId, response)} />}
      {asks[currentId] && (() => {
        const a = asks[currentId];
        const cont = !a.decision && modeOf(currentId) === "cont";
        // 红线识别:两种方式算出"能不能自动倒计时/命中了啥"
        let autoSec = 0;
        let redlineHit: { word: string; src: "builtin" | "custom" | "smart" } | null = null;
        let judging = false;
        if (cont) {
          if (redlineMode === "smart") {
            const rk = askRisk[a.id];
            if (!rk || rk.pending) judging = true; // 判定中：先不倒计时
            else if (rk.risky) { redlineHit = { word: rk.reason || (tr("ui.index.risky.action.e172e0c")), src: "smart" }; autoSec = redlineAutoSec; } // 红线：走「长倒计时」而非干等
            else autoSec = askAutoSec; // 判定安全：走倒计时(用原始秒数设置，不再做关键词拦截)
          } else {
            autoSec = askAutoSecFor(a.questions || [], askAutoSec, stopRules);
            redlineHit = riskyHitOf(a.questions || [], stopRules);
            if (redlineHit && autoSec <= 0) autoSec = redlineAutoSec; // 关键词命中红线：也给长倒计时
          }
        }
        return (
        <AskModal
          key={a.id}
          t={t}
          lang={lang}
          data={a}
          anchor={composerRef}
          autoSec={autoSec}
          redlineHit={redlineHit}
          judging={judging}
          onAuto={() => {
            if (modeOf(currentId) !== "cont") return;
            // 倒计时到点：按总目标替你选(不勾具体项，让 AI 挑最合理的继续)
            window.wuwei.answerAsk(a.id, {
              list: (a.questions || []).map(() => ({ selected: [], text: tr("ui.app.you.decide.based.on.the.overall.f7b0fe6") })),
            });
            clearAsk(currentId);
          }}
          onSubmit={(list, images) => {
            window.wuwei.answerAsk(a.id, { list, images });
            clearAsk(currentId);
          }}
          onCancel={() => {
            window.wuwei.answerAsk(a.id, { cancelled: true });
            clearAsk(currentId);
          }}
        />
        );
      })()}

      {/* 别的会话发起的 ask → 右上角通知：点击切过去选择 / ✕ 忽略 / 30s 自动消失 */}
      {askToasts.some((x) => x.sid !== currentId) && (
        <div className="ask-toasts">
          {askToasts
            .filter((x) => x.sid !== currentId)
            .map((t) => (
              <div
                key={t.askId}
                className="ask-toast"
                onClick={() => {
                  window.wuwei.switchSession(t.sid);
                  dropToast(t.askId);
                }}
              >
                <div className="ask-toast-body">
                  <div className="ask-toast-title">{makeT(getLang())("asktoast.title")}</div>
                  <div className="ask-toast-sub">
                    {makeT(getLang())("asktoast.sub").replace("{title}", t.title)}
                  </div>
                </div>
                <button
                  type="button"
                  className="ask-toast-x"
                  title={makeT(getLang())("asktoast.ignore")}
                  onClick={(e) => {
                    e.stopPropagation();
                    dropToast(t.askId);
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
        </div>
      )}

      {/* 崩溃恢复：上次被强制中断的任务→贴输入框上方的非模态框(仿 ask_user)，问是否继续 */}
      {interruptedSessions.length > 0 && (
        <ResumeBox
          sessions={interruptedSessions}
          anchor={composerRef}
          onResume={resumeInterrupted}
          onDismiss={dismissInterrupted}
          onDismissAll={() => interruptedSessions.forEach((s) => dismissInterrupted(s.id))}
        />
      )}

      {pending && (
        <div className="perm-overlay">
          <div className="perm">
            <h3>
              {tr("ui.app.allow.20f3849")}<span className="tname">{pending.name}</span>{tr("ui.app.text.a1f32f8")}
            </h3>
            <div className="args">{JSON.stringify(pending.input, null, 2)}</div>
            <div className="btns">
              <button onClick={() => answerPerm("deny")}>{tr("ui.app.deny.c43c7fd")}</button>
              <button onClick={allowAlways}>{tr("ui.app.always.allow.905b7e4")}</button>
              <button className="allow" onClick={() => answerPerm("allow")}>
                {tr("ui.app.allow.d85a488")}
              </button>
            </div>
            <div className="hint">{tr("ui.app.allow.once.always.allow.this.tool.9fded62")}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// 本轮(到上一条用户消息为止)正在执行的工具
function runningTools(items: Item[]): Extract<Item, { type: "tool" }>[] {
  const out: Extract<Item, { type: "tool" }>[] = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.type === "user" || it.type === "notice") break;
    if (it.type === "tool" && it.status === "running") out.push(it);
  }
  return out;
}

// 实时状态短语：随执行内容动态变——并行多工具/单工具/思考/生成
function liveStatus(items: Item[], chars: number, elapsed: number): string {
  const running = runningTools(items);
  const en = getLang() !== "zh";
  if (running.length > 1) return tr("ui.app.running.operations.in.parallel.ec72a4d", { p0: running.length });
  // 前缀「正在」占了 2 个字，标签本身再收紧一点，别顶到右侧的耗时/token
  if (running.length === 1) return (tr("ui.app.text.c2000d4")) + oneLineLabel(toolMetaRaw(running[0]).label, 48);
  if (chars === 0) return en ? (elapsed > 20 ? tr("ui.app.message.53ab91b63d") : "Waiting for model response") : (elapsed > 20 ? tr("ui.app.message.53ab91b63d") : tr("ui.app.message.e7445b706c"));
  return tr("ui.app.generating.reply.ed854d1");
}

function ThinkingBar({
  startRef,
  charsRef,
  textRef,
  items,
}: {
  startRef: React.MutableRefObject<number | null>;
  charsRef: React.MutableRefObject<number>;
  textRef?: React.MutableRefObject<string>;
  items: Item[];
}) {
  const [, force] = useState(0);
  const [previewOn, setPreviewOn] = useState(false); // 悬停 token 数→预览已生成正文
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 400);
    return () => clearInterval(t);
  }, []);
  const start = startRef.current;
  const elapsed = start ? Math.floor((Date.now() - start) / 1000) : 0;
  const chars = charsRef.current;
  const toks = Math.max(0, Math.round(chars / 3));
  const tokLabel = toks >= 1000 ? (toks / 1000).toFixed(1) + "k" : String(toks);
  const mm = Math.floor(elapsed / 60);
  const ss = elapsed % 60;
  const time = mm > 0 ? `${mm}m ${ss}s` : `${ss}s`;
  const status = liveStatus(items, chars, elapsed);
  const runningNow = runningTools(items);
  const running = runningNow.length;
  const en = getLang() !== "zh";
  // 悬停看完整命令：单个工具在跑时给未截断的原文，其余情况就是状态本身
  const fullStatus = running === 1 ? toolMetaRaw(runningNow[0]).label : status;
  return (
    <div className="thinking">
      <span className="tspark">✳</span>
      {/* title 给完整内容：标签已截断，悬停能看全在跑什么 */}
      <span className="tstatus" title={fullStatus}>
        {status}…
      </span>
      <span
        className="tmeta tmeta-hover"
        onMouseEnter={() => setPreviewOn(true)}
        onMouseLeave={() => setPreviewOn(false)}
        title={tr("ui.app.hover.to.preview.generated.text.4d50f46")}
      >
        {time} · {tokLabel} tokens · {running > 0 ? (tr("ui.app.task.running.4eaa7e6", { p0: running })) : (tr("ui.app.working.713443b"))}
        {previewOn && (() => {
          const preview = (textRef?.current || "").slice(-2000);
          return (
            <div className="tpreview">
              {preview
                ? preview
                : tr("ui.app.nothing.generated.yet.if.it.stays.520d657")}
            </div>
          );
        })()}
      </span>
    </div>
  );
}

function fmtReset(sec?: number): string {
  if (!sec || sec <= 0) return "";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const en = getLang() !== "zh";
  if (d > 0) return tr("ui.app.resets.in.c78fc09", { p0: d, p1: h });
  if (h > 0) return tr("ui.app.resets.in.4c2254b", { p0: h, p1: m });
  return tr("ui.app.resets.in.2b9f2b6", { p0: m });
}

// 额度窗口时长 → 友好标签：≥48h 用「N天限额」，否则「X小时限额」(数据来自订阅接口返回的窗口时长)
function windowLabel(min?: number, fallback = 300): string {
  const h = Math.round((min ?? fallback) / 60);
  const en = getLang() !== "zh";
  return h >= 48 ? (tr("ui.app.day.limit.d5bc1c1", { p0: Math.round(h / 24) })) : (tr("ui.app.hour.limit.5254d9d", { p0: h }));
}

function LimitRow({ label, used, resetSec }: { label: string; used: number; resetSec?: number }) {
  return (
    <div className="limit">
      <div className="u-row">
        <span>{label}</span>
        <span>
          {tr("ui.app.used.bd689cc", { p0: used })}
          {resetSec ? <span className="reset"> · {fmtReset(resetSec)}</span> : null}
        </span>
      </div>
      <div className="u-bar">
        <div className="u-fill" style={{ width: Math.min(100, used) + "%" }} />
      </div>
    </div>
  );
}

// 相对时间：刚刚 / X秒前 / X分钟前 / X小时前 / X天前 / 超过一周显示月日
function relTime(ts: number, now: number, tt?: T): string {
  const t = tt ?? makeT(getLang());
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 10) return t("rel.now");
  if (s < 60) return t("rel.sec").replace("{n}", String(s));
  const m = Math.floor(s / 60);
  if (m < 60) return t("rel.min").replace("{n}", String(m));
  const h = Math.floor(m / 60);
  if (h < 24) return t("rel.hour").replace("{n}", String(h));
  const d = Math.floor(h / 24);
  if (d < 7) return t("rel.day").replace("{n}", String(d));
  const dt = new Date(ts);
  return t("rel.date").replace("{mo}", String(dt.getMonth() + 1)).replace("{d}", String(dt.getDate()));
}


// 内置浏览器面板：与聊天同层的一列(半屏)/独占(全屏)/或弹成独立窗口。页面区是原生 WebContentsView，按此区域 bounds 贴合。
function BrowserPanel({
  t,
  info,
  mode,
  detached,
  width,
  onResize,
  onMode,
  onDetach,
  onReattach,
  onClose,
}: {
  t: T;
  info: { url?: string; title?: string; loading?: boolean; canGoBack?: boolean; canGoForward?: boolean };
  mode: "split" | "full";
  detached: boolean;
  width: number;
  onResize: (w: number) => void;
  onMode: (m: "split" | "full") => void;
  onDetach: () => void;
  onReattach: () => void;
  onClose: () => void;
}) {
  const regionRef = useRef<HTMLDivElement>(null);
  // 拖动左边缘调整浏览器面板宽度(面板在右→宽度=窗口宽-鼠标x)
  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const move = (ev: MouseEvent) => {
      const w = Math.min(window.innerWidth - 420, Math.max(360, window.innerWidth - ev.clientX));
      onResize(w);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }
  const [urlEdit, setUrlEdit] = useState(info.url || "");
  useEffect(() => setUrlEdit(info.url || ""), [info.url]);
  useEffect(() => {
    if (detached) return; // 独立窗口时不占主窗口区域(视图已移到弹出窗)
    const push = () => {
      const el = regionRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      window.wuwei.browserShow({ x: r.x, y: r.y, width: r.width, height: r.height });
    };
    push();
    const t = setTimeout(push, 60);
    const ro = new ResizeObserver(push);
    if (regionRef.current) ro.observe(regionRef.current);
    window.addEventListener("resize", push);
    return () => {
      clearTimeout(t);
      ro.disconnect();
      window.removeEventListener("resize", push);
      window.wuwei.browserHide();
    };
  }, [detached]);

  // 独立窗口时不占任何主窗口空间(控件移到顶栏 🖥 图标的下拉)
  if (detached) return null;
  return (
    <div className={"browser-panel " + mode} style={mode === "split" ? { flexBasis: width } : undefined}>
      {mode === "split" && <div className="bp-resizer" onMouseDown={startResize} title={t("browser.resize")} />}
      <div className="bp-bar">
        <button className="bp-nav" disabled={!info.canGoBack} onClick={() => window.wuwei.browserNav("back")} title={t("browser.back")}>
          ‹
        </button>
        <button
          className="bp-nav"
          disabled={!info.canGoForward}
          onClick={() => window.wuwei.browserNav("forward")}
          title={t("browser.forward")}
        >
          ›
        </button>
        <button className="bp-nav" onClick={() => window.wuwei.browserNav("reload")} title={t("browser.reload")}>
          ⟳
        </button>
        <input
          className="bp-url"
          value={urlEdit}
          onChange={(e) => setUrlEdit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") window.wuwei.browserNav("open", urlEdit);
          }}
          placeholder={t("browser.urlPlaceholder")}
        />
        {info.loading && <span className="bp-loading">…</span>}
        <button className={"bp-mode" + (mode === "split" ? " on" : "")} onClick={() => onMode("split")} title={t("browser.split")}>
          ◫
        </button>
        <button className={"bp-mode" + (mode === "full" ? " on" : "")} onClick={() => onMode("full")} title={t("browser.full")}>
          ▢
        </button>
        <button className="bp-mode" onClick={onDetach} title={t("browser.detach")}>
          ⇱
        </button>
        <button className="bp-close" onClick={onClose} title={t("browser.close")}>
          ✕
        </button>
      </div>
      <div className="bp-region" ref={regionRef} />
    </div>
  );
}

function ItemView({
  item,
  now,
  onDelete,
  onEdit,
  onResend,
}: {
  item: Item;
  now: number;
  onDelete?: () => void;
  onEdit?: () => void;
  onResend?: () => void;
}) {
  const txf = useTx(); // 翻译显示层订阅：翻译态下用户消息正文也译成英文覆盖显示
  if (item.type === "user")
    return (
      <div className="user-block" data-anchor={item.anchor}>
        <div className="msg user">
          <div className="body">
            {item.images && item.images.length > 0 && (
              <div className="msg-imgs">
                {item.images.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt=""
                    style={{ cursor: "zoom-in" }}
                    onClick={() => openImageLightbox?.(src)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      openImageMenu?.(e.clientX, e.clientY, src);
                    }}
                  />
                ))}
              </div>
            )}
            {maskSecrets(txf(item.text))}
          </div>
        </div>
        <div className="turn-foot user">
          <div className="tf-actions">
            <CopyBtn text={item.text} />
            {onResend && (
              <button
                className="tf-icon"
                title={makeT(getLang())("msg.resend")}
                onClick={onResend}
              >
                <ResendIcon />
              </button>
            )}
            {onEdit && (
              <button
                className="tf-icon"
                title={makeT(getLang())("msg.edit")}
                onClick={onEdit}
              >
                ↩
              </button>
            )}
            {onDelete && (
              <button className="tf-icon del" title={makeT(getLang())("msg.delete")} onClick={onDelete}>
                <TrashIcon />
              </button>
            )}
          </div>
          {item.ts && (
            <span className="tf-time" title={new Date(item.ts).toLocaleString()}>
              {relTime(item.ts, now)}
            </span>
          )}
        </div>
      </div>
    );
  if (item.type === "assistant") return <AssistantMsg text={item.text} anchor={item.anchor} />;
  if (item.type === "notice") return <div className="notice">ⓘ {item.rawError ? friendlyError(item.rawError, makeT(getLang()), item.freeModel) : localizeStoredText(item.text, getLang())}</div>;
  return <ToolView item={item} />;
}

// 把"松散列表"(列表项间有空行)转成紧凑列表，从源头消除列表大间距；段落空行保留
// 显示层给密码/密钥打码：防止截图/上下文泄露(历史里保留原文供 AI 使用，仅屏上遮盖)。
// 只遮盖「凭据类关键词 + 分隔符 + 值」，如 密码是 xxx / server_pass="xxx" / token=xxx。
function maskSecrets(t: string): string {
  if (!t) return t;
  return t.replace(
    /((?:密码|口令|密钥|私钥|凭据|凭证|password|passwd|pwd|pass|secret|token|api[_-]?key|access[_-]?key|secret[_-]?key|auth)\s*[为是:：=]{1,3}\s*["'`「」]?)([^\s"'`，,。；;）)「」]{3,})/gi,
    (_m, pre: string) => pre + "••••••",
  );
}

function tightenMarkdown(t: string): string {
  let s = t.replace(/\n{3,}/g, "\n\n");
  // AI 有时用 • ‣ ◦ · ▪ 等字符当项目符号(非标准 markdown → 被当普通段落，间距大)，归一成 -
  s = s.replace(/^([ \t]*)[•‣◦·▪∙]\s+/gm, "$1- ");
  const listItem = /^[ \t]*([-*+]|\d+[.)])\s/;
  const lines = s.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    if (cur.trim() === "") {
      const prev = out[out.length - 1] ?? "";
      const next = lines[i + 1] ?? "";
      if (listItem.test(prev) && listItem.test(next)) continue; // 删列表项之间的空行
    }
    out.push(cur);
  }
  return out.join("\n").trimEnd();
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <path
        d="M12 1.6 Q13.6 10.4 13.6 10.4 Q13.6 10.4 22.4 12 Q13.6 13.6 13.6 13.6 Q13.6 13.6 12 22.4 Q10.4 13.6 10.4 13.6 Q10.4 13.6 1.6 12 Q10.4 10.4 10.4 10.4 Q10.4 10.4 12 1.6 Z"
        fill="#d97757"
      />
    </svg>
  );
}

// 复制/删除小图标(线条风，14px，currentColor)
function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
// 简洁放大镜(全局搜索)：线性描边，随文字色
function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.6-3.6" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
// 重发图标(循环箭头)
function ResendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

// ask_user：AI 弹出的可点击选择框(单选/多选/可多问)
type AskOption = { label: string; description?: string };
type AskQuestion = { question: string; header?: string; multiSelect?: boolean; allowCustom?: boolean; options: AskOption[] };
// 崩溃恢复框：仿 ask_user，贴输入框上方对齐，非模态。列出被中断的任务，逐个「继续 / 忽略」。
function ResumeBox({
  sessions,
  anchor,
  onResume,
  onDismiss,
  onDismissAll,
}: {
  sessions: { id: string; title: string }[];
  anchor: React.RefObject<HTMLDivElement | null>;
  onResume: (id: string) => void;
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
}) {
  // 对齐到输入框：同左、同宽、贴其正上方 8px(与 AskModal 一致)
  const [box, setBox] = useState<{ left: number; width: number; bottom: number } | null>(null);
  useLayoutEffect(() => {
    const upd = () => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      const padT = parseFloat(cs.paddingTop) || 0;
      setBox({ left: r.left + padL, width: r.width - padL - padR, bottom: window.innerHeight - (r.top + padT) + 8 });
    };
    upd();
    window.addEventListener("resize", upd);
    return () => window.removeEventListener("resize", upd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);
  const many = sessions.length > 1;
  const en = getLang() !== "zh";
  return (
    <div
      className="ask resume-ask"
      style={box ? { left: box.left, width: box.width, bottom: box.bottom } : { visibility: "hidden" }}
    >
      <div className="ask-qhead">
        <span className="ask-tag">{tr("ui.app.task.interrupted.58ee670")}</span>
        <span className="ask-title">
          {many
            ? (tr("ui.app.tasks.were.running.when.you.last.81c6b97", { p0: sessions.length }))
            : (tr("ui.app.this.task.was.interrupted.last.time.074be93"))}
        </span>
      </div>
      <div className="resume-rows">
        {sessions.map((s) => (
          <div key={s.id} className="resume-row">
            <span className="resume-title" title={s.title}>💬 {s.title || (tr("ui.app.new.chat.fca06b0"))}</span>
            <span className="resume-btns">
              <button type="button" className="allow" onClick={() => onResume(s.id)}>
                {tr("err.fix.continue")}
              </button>
              <button type="button" onClick={() => onDismiss(s.id)}>
                {tr("ui.app.ignore.bc67d4b")}
              </button>
            </span>
          </div>
        ))}
      </div>
      {many && (
        <div className="resume-foot">
          <button type="button" onClick={onDismissAll}>
            {tr("ui.app.ignore.all.7411fda")}
          </button>
        </div>
      )}
    </div>
  );
}

// CEO 把关中的可见提示：员工请示后 CEO 正在拍板，贴输入框上方显示「🧑‍💼 X 拍板中… Ns」实时倒计时。
// 能定就直接定、不打扰董事长；超时/拿不准才紧随弹出选择框(届时本提示被清)。
function CeoDecidingPill({ lang, anchor, info }: { lang: Lang; anchor: React.RefObject<HTMLDivElement | null>; info: { ceoName: string; askerName: string; until: number } }) {
  const en = lang !== "zh";
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tm = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(tm);
  }, []);
  const [box, setBox] = useState<{ left: number; width: number; bottom: number } | null>(null);
  useLayoutEffect(() => {
    const el = anchor.current;
    if (!el) return;
    const upd = () => { const r = el.getBoundingClientRect(); setBox({ left: r.left, width: r.width, bottom: window.innerHeight - r.top + 8 }); };
    upd();
    window.addEventListener("resize", upd);
    return () => window.removeEventListener("resize", upd);
  }, [anchor]);
  const left = Math.max(0, Math.ceil((info.until - now) / 1000));
  const txt = left > 0
    ? (tr("ui.app.is.deciding.you.re.only.pinged.5bed423", { p0: info.ceoName, p1: left }))
    : (tr("ui.app.is.deciding.7233a21", { p0: info.ceoName }));
  return (
    <div
      className="ask ceo-deciding"
      style={box ? { left: box.left, width: box.width, bottom: box.bottom } : { visibility: "hidden" }}
    >
      <span className="ceo-deciding-txt">{txt}</span>
    </div>
  );
}
function AskModal({
  data,
  anchor,
  onSubmit,
  onCancel,
  t,
  lang,
  autoSec = 0,
  onAuto,
  redlineHit,
  judging = false,
}: {
  data: { id: number; questions: AskQuestion[] };
  anchor: React.RefObject<HTMLDivElement | null>; // 输入框(composer)，用于对齐定位
  onSubmit: (list: { selected: string[]; text?: string }[], images: string[]) => void;
  onCancel: () => void;
  t: T;
  lang?: Lang;
  autoSec?: number; // 智能继续:>0 则显示倒计时，到点自动按目标替你定(0=不自动)
  onAuto?: () => void; // 倒计时到点的回调(父组件提交"你自己定"的答案)
  redlineHit?: { word: string; src: "builtin" | "custom" | "smart" } | null; // 命中红线才有值:显示灰字说明为啥没自动
  judging?: boolean; // 智能识别模式:LLM 判定中(先不倒计时，显示"智能判断中…")
}) {
  const qs = data.questions;
  const [sel, setSel] = useState<Record<number, string[]>>({});
  const [other, setOther] = useState<Record<number, string>>({});
  const [imgs, setImgs] = useState<Record<number, string[]>>({}); // 每题附带的截图(dataURL)
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0); // 分步：一次只问一题，答完再出下一题
  const q = qs[step];
  const isLast = step === qs.length - 1;
  const curMulti = !!q.multiSelect;
  const curImgs = imgs[step] || [];
  // 读图片文件为 dataURL，追加到当前题
  const addImgFiles = (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      readImageDownscaled(f).then((url) => setImgs((m) => ({ ...m, [step]: [...(m[step] || []), url] }))).catch(() => {});
    }
  };
  const buildList = (s: Record<number, string[]>) =>
    qs.map((_, qi) => ({ selected: s[qi] || [], text: (other[qi] || "").trim() || undefined }));
  const allImgs = () => qs.flatMap((_, qi) => imgs[qi] || []); // 所有题的截图汇总一并回传
  const answeredAt = (s: Record<number, string[]>, qi: number) =>
    (s[qi]?.length || (other[qi] || "").trim().length || (imgs[qi]?.length || 0)) > 0;
  const curAnswered = answeredAt(sel, step);
  // 进入下一题；已是最后一题则整体提交
  const advance = (s: Record<number, string[]> = sel) => {
    if (!answeredAt(s, step)) return;
    if (isLast) onSubmit(buildList(s), allImgs());
    else setStep((v) => v + 1);
  };
  const pick = (label: string, multi: boolean) => {
    const cur = sel[step] || [];
    const next = multi ? (cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label]) : cur.includes(label) ? [] : [label];
    const merged = { ...sel, [step]: next };
    setSel(merged);
    // 单选即进：自动进入下一题/提交。但本题已附截图时不自动交——留时间让用户补完图文再手动提交
    if (!multi && next.length && !curImgs.length) advance(merged);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 智能继续：可见倒计时。你一旦动手(选了/输入了/翻到下一题)就停表，交回你自己决定
  const touched = step > 0 || Object.values(sel).some((a) => a?.length) ||
    Object.values(other).some((s) => (s || "").trim()) || Object.values(imgs).some((a) => a?.length);
  const [left, setLeft] = useState(autoSec);
  const [autoCancelled, setAutoCancelled] = useState(false);
  // autoSec 变化就把倒计时重置(关键:智能识别是异步的，判定中 autoSec=0，判完才变 3——
  // 若不重置，left 仍停在 0，倒计时 effect 会当场判 left<=0 立即自动提交，把你正在输入的文字/图片顶掉)
  useEffect(() => { setLeft(autoSec); }, [autoSec]);
  const autoOn = autoSec > 0 && !touched && !autoCancelled && !!onAuto;
  useEffect(() => {
    if (!autoOn) return;
    if (left <= 0) { onAuto?.(); return; }
    const tm = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(tm);
  }, [autoOn, left]);
  // 对齐到输入框：同左、同宽、贴其正上方 8px
  const [box, setBox] = useState<{ left: number; width: number; bottom: number } | null>(null);
  useLayoutEffect(() => {
    const el = anchor.current;
    if (!el) return;
    const upd = () => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el); // composer 有左右 padding，对齐到内容区(真正的输入条)
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      const padT = parseFloat(cs.paddingTop) || 0;
      setBox({ left: r.left + padL, width: r.width - padL - padR, bottom: window.innerHeight - (r.top + padT) + 8 });
    };
    upd();
    window.addEventListener("resize", upd);
    // 直接观察输入框尺寸：浏览器面板开合等布局变化 window resize 监听不到，用 ResizeObserver 才能自动跟随复位
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => {
      window.removeEventListener("resize", upd);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);
  // 手动尺寸覆盖：拖右上角手柄放大/缩小后记住宽高；null=跟随输入框自动尺寸
  const panelRef = useRef<HTMLDivElement>(null);
  const [userSize, setUserSize] = useState<{ w: number; h: number } | null>(null);
  const [collapsed, setCollapsed] = useState(false); // 折叠成小条：挡住后面内容时先缩起来看，再展开选择
  function onResizeDown(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    const startW = userSize?.w ?? panelRef.current?.offsetWidth ?? box?.width ?? 360;
    const startH = userSize?.h ?? panelRef.current?.offsetHeight ?? 240;
    const leftEdge = box?.left ?? 0;
    const move = (ev: MouseEvent) => {
      const maxW = Math.max(260, window.innerWidth - leftEdge - 12);
      const maxH = Math.round(window.innerHeight * 0.9);
      // 右上角手柄：右移加宽；底边锚定，上移(clientY 变小)即向上长高
      const w = Math.min(maxW, Math.max(260, startW + (ev.clientX - sx)));
      const h = Math.min(maxH, Math.max(120, startH + (sy - ev.clientY)));
      setUserSize({ w, h });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }
  // 单个单选题靠点击即交，不显示按钮；多选题/多题分步/已附截图时显示「下一步/提交」
  // 显示「提交/下一步」按钮：多选、多题、带图，或**在「其它」框手动输入了文字**(否则单选题里
  // 手打答案没有可点的提交按钮，只能按回车——很多人不知道，会以为卡住)。
  // 无选项的问题(模型只写了正文没给 options)：也要显示「提交」，否则只剩输入框、没可点按钮会让人以为卡住。
  const showPrimary = curMulti || qs.length > 1 || curImgs.length > 0 || (other[step] || "").trim().length > 0 || !(q.options?.length);
  // 折叠态：只剩一个小条(不挡后面内容)，点「展开」还原
  if (box && collapsed) {
    return (
      <div className="ask ask-collapsed" style={{ left: box.left, bottom: box.bottom }}>
        <span className="ask-collapsed-title">{tr("ui.app.choice.is.waiting.43c9604")}</span>
        <button type="button" className="ask-expand" onClick={() => setCollapsed(false)}>
          {tr("ui.app.expand.369944d")}
        </button>
      </div>
    );
  }
  return (
    <div
      ref={panelRef}
      className="ask"
      style={
        box
          ? {
              left: box.left,
              width: userSize ? userSize.w : box.width,
              bottom: box.bottom,
              ...(userSize ? { height: userSize.h, maxHeight: "none" } : null),
            }
          : { visibility: "hidden" }
      }
    >
      {/* 右上角：复位(仅放大后显示) + 折叠 + 调尺寸手柄 */}
      {userSize && (
        <button
          type="button"
          className="ask-ctl ask-restore"
          title={t("ask.restoreSize")}
          onClick={() => setUserSize(null)}
        >
          <RestoreSizeIcon />
        </button>
      )}
      <button
        type="button"
        className="ask-ctl ask-fold"
        title={t("ask.fold")}
        onClick={() => setCollapsed(true)}
      >
        <FoldIcon />
      </button>
      <span className="ask-resize" onMouseDown={onResizeDown} title={t("ask.resize")} />
      <div className="ask-q">
        <div className="ask-qhead">
          {q.header && <span className="ask-tag">{q.header}</span>}
          <span className="ask-title">{q.question}</span>
          {q.multiSelect && <span className="ask-multi">{tr("ui.app.multi.select.0aa524c")}</span>}
        </div>
        {autoOn && (
          <div className="ask-auto">
            <span className="ask-auto-txt">
              {redlineHit
                ? (tr("ui.app.redline.auto.picking.toward.the.goal.65a90b6", { p0: redlineHit.word, p1: left }))
                : (tr("ui.app.smart.continue.auto.picking.the.best.9577bf9", { p0: left }))}
            </span>
            <button type="button" className="ask-auto-wait" onClick={() => setAutoCancelled(true)}>
              {tr("ui.app.let.me.choose.6925cfe")}
            </button>
          </div>
        )}
        {!autoOn && judging && (
          <div className="ask-redline">
            {tr("ui.app.smart.continue.checking.whether.this.is.dfea0ef")}
          </div>
        )}
        {!autoOn && !judging && redlineHit && (
          <div className="ask-redline" title={tr("ui.app.smart.continue.won.auto.decide.on.b2b1c53")}>
            {(() => {
              const srcZh = redlineHit.src === "custom" ? tr("ui.app.message.18abba924a") : redlineHit.src === "smart" ? tr("ui.app.message.5cd4145ced") : tr("ui.app.message.16c03e7785");
              const srcEn = redlineHit.src === "custom" ? "your custom rule" : redlineHit.src === "smart" ? "smart-detected" : "built-in";
              return tr("ui.app.redline.hit.waiting.for.you.no.ebcdb05", { p0: redlineHit.word, p1: ((lang || getLang()) === "en" ? srcEn : srcZh) });
            })()}
          </div>
        )}
        <div className="ask-opts">
          {(q.options || []).map((o, oi) => {
            const on = (sel[step] || []).includes(o.label);
            return (
              <button key={oi} type="button" className={"ask-opt" + (on ? " on" : "")} onClick={() => pick(o.label, curMulti)}>
                <span className="ask-opt-label">{o.label}</span>
                {o.description && <span className="ask-opt-desc">{o.description}</span>}
              </button>
            );
          })}
        </div>
        {curImgs.length > 0 && (
          <div className="img-strip ask-imgs">
            {curImgs.map((src, i) => (
              <div className="thumb" key={i}>
                <img src={src} alt="" />
                <button
                  type="button"
                  title={t("msg.remove")}
                  onClick={() => setImgs((m) => ({ ...m, [step]: (m[step] || []).filter((_, j) => j !== i) }))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="ask-other-row">
          <input
            className="ask-other"
            disabled={q.allowCustom === false}
            placeholder={t("ask.otherPlaceholder")}
            value={other[step] || ""}
            onFocus={() => setAutoCancelled(true)} // 一点进手动输入框就取消自动提交，别抢你正在打的字/图
            onChange={(e) => setOther((o) => ({ ...o, [step]: e.target.value }))}
            onPaste={(e) => {
              const its = e.clipboardData?.items;
              if (!its) return;
              const files: File[] = [];
              for (const it of its)
                if (it.type.startsWith("image/")) {
                  const f = it.getAsFile();
                  if (f) files.push(f);
                }
              if (files.length) {
                e.preventDefault();
                addImgFiles(files);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && curAnswered) advance();
            }}
          />
          <button
            type="button"
            className="ask-attach"
            title={t("ask.addShot")}
            onClick={() => { setAutoCancelled(true); fileRef.current?.click(); }}
          >
            📎
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files?.length) addImgFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>
      <div className="ask-foot">
        <button type="button" onClick={onCancel}>
          {tr("set.st.cancel")}
        </button>
        {qs.length > 1 && (
          <span className="ask-step">
            {step + 1} / {qs.length}
          </span>
        )}
        <span className="ask-foot-spacer" />
        {step > 0 && (
          <button type="button" onClick={() => setStep((v) => v - 1)}>
            {tr("ui.app.back.5bf6faa")}
          </button>
        )}
        {showPrimary && (
          <button type="button" className="allow" disabled={!curAnswered} onClick={() => advance()}>
            {isLast ? (tr("ui.app.submit.3c850bc")) : (tr("ui.app.next.9cff86c"))}
          </button>
        )}
      </div>
    </div>
  );
}
// 复制按钮：点后短暂显示绿色勾 + "已复制"提示
// 智能继续：自定义红线编辑(设置面板)
function StopRulesSettings({ lang }: { lang: Lang }) {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    window.wuwei.stopRulesGet?.().then((t) => setText(t || "")).catch(() => {});
  }, []);
  return (
    <>
      <div className="app-set-row" style={{ cursor: "default" }}>
        <div className="app-set-label">{tr("ui.app.when.it.must.stop.and.ask.3e5992f")}</div>
      </div>
      <textarea
        rows={5}
        style={{ width: "100%", boxSizing: "border-box", resize: "vertical", background: "var(--bg-input)", color: "var(--text)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: "10px 12px", fontFamily: "var(--sans)", fontSize: 13, lineHeight: 1.6, outline: "none" }}
        value={text}
        placeholder={tr("ui.app.one.per.line.touch.the.prod.b54c531")}
        onChange={(e) => { setText(e.target.value); setSaved(false); }}
        onBlur={() => {
          window.wuwei.stopRulesSet?.(text);
          window.dispatchEvent(new CustomEvent("wuwei-stop-rules", { detail: text }));
          setSaved(true);
        }}
      />
      <div style={{ fontSize: 11, opacity: saved ? 0.75 : 0.45, margin: "4px 0 10px" }}>
        {saved ? (tr("ui.app.saved.saves.when.you.leave.the.9c94023")) : (tr("ui.app.click.elsewhere.to.save.dd97ab8"))}
      </div>
    </>
  );
}

// 智能继续：连推安全阀(设置面板)
function ContSettings({ lang }: { lang: Lang }) {
  const [max, setMax] = useState(() => {
    const v = localStorage.getItem("wuwei-cont-max");
    return v === null ? 30 : Math.max(0, Number(v) || 0);
  });
  const [delay, setDelay] = useState(() => {
    const v = localStorage.getItem("wuwei-cont-delay");
    return v === null ? 1200 : Number(v) || 0;
  });
  const [askSec, setAskSec] = useState(() => {
    const v = localStorage.getItem("wuwei-ask-auto-sec");
    return v === null ? 3 : Number(v) || 0;
  });
  const [redlineSec, setRedlineSec] = useState(() => {
    const v = localStorage.getItem("wuwei-redline-auto-sec");
    return v === null ? 30 : Number(v) || 0;
  });
  const pushCfg = (m: number, d: number, a: number, rl: number) => {
    localStorage.setItem("wuwei-cont-max", String(m));
    localStorage.setItem("wuwei-cont-delay", String(d));
    localStorage.setItem("wuwei-ask-auto-sec", String(a));
    localStorage.setItem("wuwei-redline-auto-sec", String(rl));
    window.dispatchEvent(new CustomEvent("wuwei-cont-cfg", { detail: { max: m, delay: d, askSec: a, redlineSec: rl } }));
  };
  return (
    <>
      <div className="app-set-row" style={{ cursor: "default", gap: "10px" }}>
        <div className="app-set-label" style={{ whiteSpace: "nowrap" }}>{tr("ui.app.smart.continue.max.rounds.e288bdb")}</div>
        <span style={{ flex: 1 }} />
        <input
          type="number"
          min={0}
          value={max}
          style={{ width: 96, textAlign: "right", padding: "4px 8px", fontFamily: "var(--mono)", background: "var(--bg-input)", color: "var(--text)", border: "1px solid var(--border-strong)", borderRadius: 8, outline: "none" }}
          onChange={(e) => { const v = Math.max(0, Math.floor(Number(e.target.value) || 0)); setMax(v); pushCfg(v, delay, askSec, redlineSec); }}
        />
        <div className="app-set-hint" style={{ minWidth: 56, textAlign: "right" }}>
          {max <= 0 ? (tr("ui.app.text.3b8a002")) : ("rounds")}
        </div>
      </div>
      <div style={{ fontSize: 11, opacity: .5, margin: "-2px 0 8px" }}>
        {tr("ui.app.any.number.unlimited.keeps.going.until.5dbd9d7")}
      </div>
      <div className="app-set-row" style={{ cursor: "default", gap: "10px" }}>
        <div className="app-set-label" style={{ whiteSpace: "nowrap" }}>{tr("ui.app.undo.window.before.sending.41e4cfb")}</div>
        <input type="range" min={0} max={10000} step={100} value={delay} style={{ flex: 1 }} onChange={(e) => { const v = Number(e.target.value); setDelay(v); pushCfg(max, v, askSec, redlineSec); }} />
        <div className="app-set-hint" style={{ minWidth: 44, textAlign: "right" }}>
          {delay === 0 ? ("instant") : (delay / 1000).toFixed(1) + ("s")}
        </div>
      </div>
      <div className="app-set-row" style={{ cursor: "default", gap: "10px" }}>
        <div className="app-set-label" style={{ whiteSpace: "nowrap" }}>{tr("ui.app.auto.answer.choices.after.9ca55e3")}</div>
        <input type="range" min={0} max={30} step={1} value={askSec} style={{ flex: 1 }} onChange={(e) => { const v = Number(e.target.value); setAskSec(v); pushCfg(max, delay, v, redlineSec); }} />
        <div className="app-set-hint" style={{ minWidth: 44, textAlign: "right" }}>
          {askSec === 0 ? (tr("ui.app.always.wait.d342b22")) : askSec + ("s")}
        </div>
      </div>
      {/* 红线题(命中危险动作)的长倒计时：不再干等，到点仍由 AI 按总目标自己挑。你不在时不浪费时间 */}
      <div className="app-set-row" style={{ cursor: "default", gap: "10px" }}>
        <div className="app-set-label" style={{ whiteSpace: "nowrap" }}>{tr("ui.app.redline.auto.answer.after.11efa60")}</div>
        <input type="range" min={0} max={120} step={5} value={redlineSec} style={{ flex: 1 }} onChange={(e) => { const v = Number(e.target.value); setRedlineSec(v); pushCfg(max, delay, askSec, v); }} />
        <div className="app-set-hint" style={{ minWidth: 44, textAlign: "right" }}>
          {redlineSec === 0 ? (tr("ui.app.always.wait.d342b22")) : redlineSec + ("s")}
        </div>
      </div>
      <div style={{ fontSize: 11, opacity: .5, margin: "-2px 0 8px" }}>
        {tr("ui.app.even.risky.redline.choices.get.longer.e96fb9f")}
      </div>
    </>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className={"tf-icon" + (done ? " ok" : "")}
      title={done ? (tr("pay.support.copied")) : (tr("pay.support.copy"))}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1300);
      }}
    >
      {done ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

// 助手文字块：无头像、整块左对齐、纯 markdown 渲染
// memo：只有 text/streaming 变的那条才重渲染，其余消息跳过——流式不卡的关键。
// 流式中「按段提交」：以最后一个空行(\n\n)为界，前面已完成的段落即时渲染 Markdown
// (MarkdownView 有 memo，committed 不变就不重解析→只在跨段时解析一次)，最后没写完的一段用纯文本。
// 流完(streaming=false)整体走完整 Markdown + 代码高亮。
// 用户头像：Google 头像(lh3.googleusercontent.com)带 Referer 会被 403 → referrerPolicy=no-referrer；
// 仍加载失败(裂图)则退回首字母，绝不显示破图。
function UserAvatar({ url, fallback }: { url?: string | null; fallback: string }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) return <>{fallback}</>;
  return <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
}

// 抽取开头的 <think>…</think>（推理模型思考流，provider 已把 reasoning_content 也归一成 <think>）。
// open=true 表示流式中 <think> 还没闭合（正在思考）。只认开头，避免误伤正文里的代码/文本。
function splitThinking(text: string): { think: string; answer: string; open: boolean } {
  const closed = text.match(/^\s*<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>\s*/i);
  if (closed) return { think: closed[1].trim(), answer: text.slice(closed[0].length), open: false };
  const opening = text.match(/^\s*<think(?:ing)?>([\s\S]*)$/i);
  if (opening) return { think: opening[1], answer: "", open: true };
  return { think: "", answer: text, open: false };
}

// 可折叠「深度思考」块：思考时自动展开，思考完自动收起（用户仍可点开）。
function ThinkBlock({ content, live }: { content: string; live?: boolean }) {
  const en = getLang() !== "zh";
  if (!content.trim() && !live) return null;
  return (
    <details className="think-block" open={live ? true : undefined}>
      <summary>
        <svg className="tk-ico" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2.5c.32 3.6 2.28 5.56 5.9 5.88-3.62.32-5.58 2.28-5.9 5.9-.32-3.62-2.28-5.58-5.9-5.9 3.62-.32 5.58-2.28 5.9-5.88Z" />
          <path d="M18.6 13.8c.16 1.82 1.14 2.8 2.96 2.96-1.82.16-2.8 1.14-2.96 2.96-.16-1.82-1.14-2.8-2.96-2.96 1.82-.16 2.8-1.14 2.96-2.96Z" />
        </svg>
        <span>{tr("ui.app.deep.thinking.96f8b8b")}</span>
        {live && <span className="tk-live">{tr("ui.app.thinking.5810665")}</span>}
      </summary>
      <div className="tk-body">{content.trim()}</div>
    </details>
  );
}

// 数字婴儿：简约线性头像图标(替代 👶 emoji，跟随 currentColor)
function BabyGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg className="agi-glyph" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="13" r="7.5" />
      <path d="M11.8 5.5c.2-1.3 1.2-2 2.4-1.5" />
      <path d="M9.6 12.4v.5M14.4 12.4v.5" />
      <path d="M10 15.7c.9.7 3.1.7 4 0" />
    </svg>
  );
}

// —— 数字婴儿：自动吸底 pre + 知识网络力导向图(迁自 minicc) ——
function AutoStickPre({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLPreElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [text]);
  return (
    <pre
      ref={ref}
      className={className}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
    >{text}</pre>
  );
}

function BabyBrainGraph({ nodes, edges }: { nodes: any[]; edges: any[] }) {
  // 画布随概念数放大：概念越多铺得越开，节点才不会挤成一坨(看全貌时整体缩放显示，
  // 滚轮放大读细节)。固定 1400×900 装 200+ 概念必然重叠。
  const spread = Math.min(3.4, Math.max(1, Math.sqrt(nodes.length / 55)));
  const W = Math.round(1400 * spread), H = Math.round(900 * spread);
  // 概念来源 → 固定语义色(不再用哈希随机色)：一眼分清哪些是自己上网学的、哪些是睡梦里涌现的
  const TYPE_COLOR: Record<string, string> = systemData.nodeColors;
  const color = (n: any) => {
    if (typeof n === "string") return TYPE_COLOR[n] || "#8b949c";
    if (n?.isDao) return "#c05f3c";
    if (n?.level === "abstract") return ["#9a7fbe", "#8a6fb4", "#7a5faa", "#6a4fa0"][Math.min(3, (n.depth || 1) - 1)];
    return TYPE_COLOR[n?.type] || "#8b949c";
  };
  // 节点大小：层级为主(睡梦涌现的上层认知更大、塔尖最大)，连接数为辅
  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const e of edges) { d.set(e.from, (d.get(e.from) || 0) + 1); d.set(e.to, (d.get(e.to) || 0) + 1); }
    return d;
  }, [edges]);
  const radiusOf = (n: any) => {
    const deg = degree.get(n.id) || 0;
    if (n.isDao) return 26;
    if (n.level === "abstract") return 11 + (n.depth || 1) * 3.6 + Math.min(7, (n.children?.length || 0) * 0.45);
    return 4.2 + Math.min(6.5, deg * 0.75);
  };
  // 布局：以「语义坐标」为骨架——后端把概念向量降到 2 维，意思相近的天然在一起、
  // 不相干的隔得远。力学只做两件事：把上层认知拉到它孩子们中间、把挤在一起的推开，
  // 不再让弹簧把语义结构揉乱(所以有锚定力把每个点拽回它的语义位置)。
  const layout = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    const vel = new Map<string, { vx: number; vy: number }>();
    const anchor = new Map<string, { x: number; y: number }>();
    const byId = new Map<string, any>(nodes.map((n) => [n.id, n]));
    const MX = 150, MY = 90;
    let seed = 20240814;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const hasSem = nodes.some((n) => typeof n.sx === "number");
    for (const n of nodes) {
      const p = typeof n.sx === "number"
        ? { x: MX + n.sx * (W - 2 * MX), y: MY + n.sy * (H - 2 * MY) }
        : { x: W / 2 + (rnd() - 0.5) * 700, y: H / 2 + (rnd() - 0.5) * 500 };
      pos.set(n.id, { ...p });
      anchor.set(n.id, { ...p });
      vel.set(n.id, { vx: 0, vy: 0 });
    }
    // 上层认知的锚点挪到它收编的那批概念的质心：塔尖自然浮在整片知识的正中
    for (const n of nodes) {
      if (n.level !== "abstract" || !n.children?.length) continue;
      let sx = 0, sy = 0, k = 0;
      for (const c of n.children) { const p = anchor.get(c); if (p) { sx += p.x; sy += p.y; k++; } }
      if (k) {
        const a = anchor.get(n.id)!;
        a.x = hasSem ? a.x * 0.35 + (sx / k) * 0.65 : sx / k;
        a.y = hasSem ? a.y * 0.35 + (sy / k) * 0.65 : sy / k;
        pos.set(n.id, { ...a });
      }
    }
    const ids = nodes.map((n) => n.id);
    // 每个节点的占位框 = 圆 + 右边那截标签(只算常显标签的)。
    // 只按圆心距离防重叠是不够的——挤在一起的其实是文字，框算进标签才真的分得开。
    const box = new Map<string, { w: number; h: number; ox: number }>();
    for (const n of nodes) {
      const r = radiusOf(n);
      const abs = n.level === "abstract";
      const showLabel = abs || r >= 8.5;
      const fs = abs ? Math.min(17, 11 + (n.depth || 1) * 1.6) : 10.5;
      const nm = String(n.name || "").slice(0, 22);
      let lw = 0;
      if (showLabel) for (const ch of nm) lw += /[⺀-鿿＀-￯]/.test(ch) ? fs : fs * 0.56;
      box.set(n.id, {
        w: 2 * r + (lw ? lw + 8 : 0),
        h: Math.max(2 * r, showLabel ? fs * 1.35 : 2 * r),
        ox: lw ? (lw + 8) / 2 : 0,
      });
    }
    const PADX = 16, PADY = 9; // 框与框之间还要留的呼吸空间
    const separate = (k: number) => {
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const A = pos.get(ids[i])!, B = pos.get(ids[j])!;
        const ba = box.get(ids[i])!, bb = box.get(ids[j])!;
        const dx = A.x + ba.ox - (B.x + bb.ox), dy = A.y - B.y;
        const ox = (ba.w + bb.w) / 2 + PADX - Math.abs(dx);
        if (ox <= 0) continue;
        const oy = (ba.h + bb.h) / 2 + PADY - Math.abs(dy);
        if (oy <= 0) continue;
        const va = vel.get(ids[i])!, vb = vel.get(ids[j])!;
        if (ox < oy) { // 沿更省力的那个轴推开
          const f = (dx >= 0 ? 1 : -1) * ox * k;
          va.vx += f; vb.vx -= f;
        } else {
          const f = (dy >= 0 ? 1 : -1) * oy * k;
          va.vy += f; vb.vy -= f;
        }
      }
    };
    const ANCHOR_K = hasSem ? 0.026 : 0.002; // 有语义坐标就以它为准，否则退回向心力
    const ITER = ids.length > 200 ? 220 : 380;
    for (let it = 0; it < ITER; it++) {
      separate(0.24);
      for (const e of edges) {
        const a = pos.get(e.from), b = pos.get(e.to); if (!a || !b) continue;
        // 层级边(抽象自)拉得紧→同一个上层认知的概念抱成一团；普通关联很松，只给一点点牵引
        const belong = e.kind === "belong";
        const rest = belong ? 78 : 150, k = belong ? 0.028 : 0.006;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, f = (d - rest) * k;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        const va = vel.get(e.from)!, vb = vel.get(e.to)!;
        va.vx += fx; va.vy += fy; vb.vx -= fx; vb.vy -= fy;
      }
      for (const id of ids) {
        const p = pos.get(id)!, v = vel.get(id)!, a = anchor.get(id)!;
        const isAbs = byId.get(id)?.level === "abstract";
        const ak = isAbs ? ANCHOR_K * 1.6 : ANCHOR_K; // 上层认知更贴紧它孩子的质心
        v.vx += (a.x - p.x) * ak; v.vy += (a.y - p.y) * ak;
        v.vx *= 0.84; v.vy *= 0.84; p.x += v.vx; p.y += v.vy;
      }
    }
    // 收尾：只解重叠，不再拉锚点/弹簧——保证最后谁也不压着谁
    for (let it = 0; it < 130; it++) {
      separate(0.5);
      for (const id of ids) {
        const p = pos.get(id)!, v = vel.get(id)!, b = box.get(id)!;
        v.vx *= 0.55; v.vy *= 0.55; p.x += v.vx; p.y += v.vy;
        p.x = Math.max(b.w / 2 + 10, Math.min(W - b.w / 2 - 10, p.x)); // 别飘出画布
        p.y = Math.max(b.h / 2 + 10, Math.min(H - b.h / 2 - 10, p.y));
      }
    }
    return pos;
  }, [nodes, edges]);
  const [override, setOverride] = useState<Map<string, { x: number; y: number }>>(new Map());
  const gp = (id: string) => override.get(id) || layout.get(id) || { x: W / 2, y: H / 2 };
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [hover, setHover] = useState<{ kind: "node" | "edge"; id: string; mx: number; my: number } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ id?: string; kind: "node" | "pan"; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const nodeById = useMemo(() => { const m = new Map<string, any>(); for (const n of nodes) m.set(n.id, n); return m; }, [nodes]);
  const toWorld = (cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const vx = ((cx - r.left) / r.width) * W, vy = ((cy - r.top) / r.height) * H;
    return { x: (vx - view.x) / view.k, y: (vy - view.y) / view.k };
  };
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = dragRef.current; if (!d) return;
      const w = toWorld(e.clientX, e.clientY);
      if (d.kind === "node" && d.id) { d.moved = true; setOverride((m) => { const n = new Map(m); n.set(d.id!, { x: w.x, y: w.y }); return n; }); }
      else { const r = svgRef.current!.getBoundingClientRect(); const scale = W / r.width; setView((v) => ({ ...v, x: d.ox + (e.clientX - d.sx) * scale, y: d.oy + (e.clientY - d.sy) * scale })); }
    };
    const up = (e: MouseEvent) => { const d = dragRef.current; if (d && d.kind === "node" && !d.moved && d.id) setSel(d.id); dragRef.current = null; };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  });
  useEffect(() => {
    const svg = svgRef.current; if (!svg) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const r = svg.getBoundingClientRect(); const vx = ((e.clientX - r.left) / r.width) * W, vy = ((e.clientY - r.top) / r.height) * H; setView((v) => { const wx = (vx - v.x) / v.k, wy = (vy - v.y) / v.k; const k = Math.max(0.3, Math.min(4, v.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12))); return { k, x: vx - wx * k, y: vy - wy * k }; }); };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);
  const selNode = sel ? nodeById.get(sel) : null;
  const hoverNode = hover?.kind === "node" ? nodeById.get(hover.id) : null;
  const hoverEdge = hover?.kind === "edge" ? edges.find((e) => e.id === hover.id) : null;
  return (
    <div className="bbg-wrap">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="bbg-svg"
        onMouseDown={(e) => { const w = toWorld(e.clientX, e.clientY); dragRef.current = { kind: "pan", sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false }; setSel(null); }}>
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {edges.map((e) => { const a = gp(e.from), b = gp(e.to); if (!a || !b) return null; const on = sel && (e.from === sel || e.to === sel); const belong = e.kind === "belong"; return (
            <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={on ? "var(--accent)" : belong ? "#9a7fbe" : "#8b949c"}
              strokeWidth={on ? 1.8 : belong ? 1 : 0.6}
              strokeDasharray={belong ? "4 4" : undefined}
              strokeOpacity={sel && !on ? 0.12 : belong ? 0.5 : 0.34}
              onMouseEnter={(ev) => setHover({ kind: "edge", id: e.id, mx: ev.clientX, my: ev.clientY })} onMouseLeave={() => setHover(null)} />
          ); })}
          {nodes.map((n) => {
            const p = gp(n.id); const r = radiusOf(n); const abs = n.level === "abstract";
            const dim = sel && sel !== n.id && !edges.some((e) => (e.from === sel && e.to === n.id) || (e.to === sel && e.from === n.id));
            // 标签只给"够大的"节点常显(小概念挤在一起会糊成一片)，放大到 1.5 倍以上或选中/悬停时全显
            const showLabel = abs || r >= 8.5 || view.k >= 1.5 || sel === n.id || hover?.id === n.id;
            return (
            <g key={n.id} transform={`translate(${p.x},${p.y})`} style={{ cursor: "pointer", opacity: dim ? 0.22 : 1 }}
              onMouseDown={(ev) => { ev.stopPropagation(); const w = toWorld(ev.clientX, ev.clientY); dragRef.current = { id: n.id, kind: "node", sx: ev.clientX, sy: ev.clientY, ox: 0, oy: 0, moved: false }; }}
              onMouseEnter={(ev) => setHover({ kind: "node", id: n.id, mx: ev.clientX, my: ev.clientY })} onMouseLeave={() => setHover(null)}>
              {abs && <circle r={r + 7} fill={color(n)} opacity={0.13} />}
              <circle r={r} fill={color(n)} stroke={sel === n.id ? "var(--text)" : "var(--bg)"} strokeWidth={sel === n.id ? 2.4 : abs ? 2 : 1} />
              {showLabel && (
                <text x={r + 3} y={abs ? 5 : 3.6} fontSize={abs ? Math.min(17, 11 + (n.depth || 1) * 1.6) : 10.5}
                  fontWeight={abs ? 700 : 400} fill="var(--text)" style={{ pointerEvents: "none" }}>
                  {n.name.length > 22 ? n.name.slice(0, 21) + "…" : n.name}
                </text>
              )}
            </g>
          ); })}
        </g>
      </svg>
      {(hoverNode || hoverEdge) && (
        <div className="bbg-tip" style={{ left: Math.min((hover!.mx - (svgRef.current?.getBoundingClientRect().left || 0)) + 14, W), top: (hover!.my - (svgRef.current?.getBoundingClientRect().top || 0)) + 14 }}>
          {hoverNode ? (<>
            <div className="bbg-tip-h"><span className="bbg-dot" style={{ background: color(hoverNode) }} />{hoverNode.name}</div>
            <div className="bbg-tip-type">
              {hoverNode.level === "abstract"
                ? (hoverNode.isDao ? tr("ui.app.message.13cc2df711") : tr("ui.app.message.4e5abb13af", {p0: hoverNode.depth, p1: hoverNode.children?.length || 0}))
                : hoverNode.type + (hoverNode.parent ? tr("ui.app.message.db363010d8", {p0: hoverNode.parent}) : tr("ui.app.message.306d253f31"))}
            </div>
            {hoverNode.summary && <div className="bbg-tip-sum">{hoverNode.summary}</div>}
          </>) : (<>
            <div className="bbg-tip-h">{hoverEdge.relation}</div>
            <div className="bbg-tip-sum">{hoverEdge.from} → {hoverEdge.to}</div>
          </>)}
        </div>
      )}
      {selNode && (
        <div className="bbg-detail">
          <div className="bbg-detail-h"><span className="bbg-dot" style={{ background: color(selNode) }} />{selNode.name}<button onClick={() => setSel(null)}><Ic.IcBack size={13} /></button></div>
          <div className="bbg-detail-type">
            {selNode.level === "abstract"
              ? (selNode.isDao ? tr("ui.app.message.13cc2df711") : tr("ui.app.message.029fc72f0a", {p0: selNode.depth}))
              : tr("ui.app.message.d129b5033a", {p0: selNode.type})}
          </div>
          {selNode.level === "abstract" && !!selNode.children?.length && (
            <div className="bbg-detail-row"><b>{tr("ui.app.message.a8fdd5411e")}{selNode.children.length}）</b><div>{selNode.children.join("、")}</div></div>
          )}
          {selNode.level !== "abstract" && (
            <div className="bbg-detail-row"><b>{tr("ui.app.message.7a564126f1")}</b><div>{selNode.parent ? tr("ui.app.message.c2015af321", {p0: selNode.parent}) : tr("ui.app.message.12b1c3d48b")}</div></div>
          )}
          {selNode.summary && <div className="bbg-detail-row"><b>{tr("ui.app.message.48f1e8870b")}</b><div>{selNode.summary}</div></div>}
          {selNode.attrs && Object.entries(selNode.attrs).map(([k, v]) => (<div key={k} className="bbg-detail-row"><b>{k}</b><div>{String(v)}</div></div>))}
        </div>
      )}
    </div>
  );
}

const AssistantMsg = React.memo(function AssistantMsg({
  text,
  streaming,
  anchor,
}: {
  text: string;
  streaming?: boolean;
  anchor?: string; // 搜索定位锚点(见 Item.anchor)
}) {
  const { think, answer, open } = splitThinking(text);
  const thinkEl = (think || (streaming && open)) ? <ThinkBlock content={think} live={streaming && open} /> : null;
  if (!streaming) {
    return (
      <div className="aimsg" data-anchor={anchor}>
        {thinkEl}
        {answer && <MarkdownView text={answer} highlight={true} />}
      </div>
    );
  }
  const cut = answer.lastIndexOf("\n\n"); // 最后一个段落边界
  const committed = cut >= 0 ? answer.slice(0, cut) : "";
  const tail = cut >= 0 ? answer.slice(cut + 2) : answer;
  return (
    <div className="aimsg" data-anchor={anchor}>
      {thinkEl}
      {committed && <MarkdownView text={committed} highlight={false} />}
      {tail && <div className="md md-streaming">{maskSecrets(tail)}</div>}
    </div>
  );
});

// 代码块：右上角一键复制(取 <pre> 的纯文本)
function CodeBlock({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [done, setDone] = useState(false);
  const copy = () => {
    const t = ref.current?.textContent ?? "";
    navigator.clipboard.writeText(t).then(() => {
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    });
  };
  return (
    <div className="code-wrap">
      <button className={"code-copy" + (done ? " ok" : "")} onClick={copy} title={makeT(getLang())("code.copy")}>
        {done ? (tr("ui.app.copied.2aff14e")) : (tr("pay.support.copy"))}
      </button>
      <pre ref={ref}>{children}</pre>
    </div>
  );
}

// memo：text/highlight 不变就不重新解析——流式「按段提交」时已完成段落不会每帧重解析的关键
const MarkdownView = React.memo(function MarkdownView({
  text,
  highlight = true,
}: {
  text: string;
  highlight?: boolean;
}) {
  const txf = useTx(); // 翻译显示层：翻译态下把消息正文临时译成英文覆盖显示(纯覆盖，不改数据)
  const clean = maskSecrets(tightenMarkdown(txf(text)));
  return (
    <div className="md">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={highlight ? [rehypeHighlight] : []}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault();
                if (href) window.wuwei.openExternal(href);
              }}
            >
              {children}
            </a>
          ),
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        }}
      >
        {clean}
      </Markdown>
    </div>
  );
});

function baseName(p: string): string {
  return p.split("/").pop() || p;
}

// 单段命令→动作名
function segAction(seg: string): string {
  const c = seg.toLowerCase().trim();
  const en = getLang() !== "zh";
  if (/\b(test|pytest|jest|vitest|go test|npm (run )?test)\b/.test(c)) return tr("ui.app.test.d2d526c");
  if (/(electron-vite build|vite build|tsc\b|\b(npm|yarn|pnpm) (run )?build\b|cargo build|go build|\bmake\b)/.test(c))
    return tr("ui.app.build.28ffc2e");
  if (/(electron-builder|--dir|\bpkg\b|package)/.test(c)) return tr("ui.app.package.b42a1d4");
  if (/\b(deploy|scp|rsync|publish)\b|docker (push|cp)|rm -rf .*app|cp -R .*\.app|xattr/.test(c))
    return tr("ui.app.deploy.287233d");
  if (/\b(install|pip install|npm i\b|yarn add|apt|brew install)\b/.test(c)) return tr("ui.app.install.deps.7703235");
  if (/\bgit\b/.test(c)) return tr("ui.app.git.852f8c2");
  if (/\b(grep|rg|ag|ack)\b/.test(c)) return tr("ui.app.search.e8d64c0");
  if (/\b(ls|find|tree|du|stat|fd)\b/.test(c)) return tr("ui.app.list.dir.a23dcd3");
  if (/\b(cat|head|tail|less|more|sed|awk)\b/.test(c)) return tr("ui.app.view.file.930094d");
  if (/\b(mkdir|touch|cp|mv|rm|chmod|ln)\b/.test(c)) return tr("ui.app.file.op.362815f");
  if (/\b(node|python3?|electron|osascript|open|kill|pkill)\b|(^|\s)\.\//.test(c)) return tr("ui.app.run.42fad98");
  return tr("ui.app.run.command.f87631e");
}
// 把整条命令按 && / ; / | / 换行 拆开，逐段识别动作，拼成"构建 · 部署 · 运行"这种摘要
function bashIntent(cmd: string): { label: string; category: string } {
  const segs = cmd
    .split(/&&|\|\||;|\n|\|/)
    .map((s) => s.trim())
    .filter((s) => s && !/^(cd|export|set|echo)\b/.test(s.toLowerCase())); // 跳过无信息量的
  const acts: string[] = [];
  for (const s of segs) {
    const a = segAction(s);
    if (!acts.includes(a)) acts.push(a);
  }
  const uniq = acts.length ? acts : [tr("ui.app.run.command.f87631e")];
  return { label: uniq.slice(0, 4).join(" · "), category: uniq[0] };
}

// 工具的图标 + 意图描述 + 类别（分组用）+ 行数增删
// 工具标签压成单行并截断：命令/URL/搜索词可能很长、还可能带换行，
// 原样拼进标签会把同一行右侧的耗时/token/状态挤掉(甚至撑成多行)。完整内容展开后在 .tcmd 里看。
function oneLineLabel(s: string, max = 64): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}
function toolMeta(item: Extract<Item, { type: "tool" }>): {
  icon: string;
  label: string;
  category: string;
  add?: number;
  del?: number;
} {
  const m = toolMetaRaw(item);
  return { ...m, label: oneLineLabel(m.label) };
}
// 未截断的原始标签(悬停提示用完整版)
function toolMetaRaw(item: Extract<Item, { type: "tool" }>): {
  icon: string;
  label: string;
  category: string;
  add?: number;
  del?: number;
} {
  const inp = item.input as any;
  const en = getLang() !== "zh";
  switch (item.name) {
    case "bash": {
      const bi = bashIntent(String(inp.command || ""));
      return { icon: "⌘", label: bi.label, category: bi.category };
    }
    case "powershell":
      return { icon: "⌘", label: (tr("ui.app.powershell.a67fc8d")) + String(inp.command || ""), category: tr("ui.app.windows.command.03cb5be") };
    case "read_file":
      return {
        icon: "◎",
        label: (tr("ui.app.read.6fc7605")) + baseName(String(inp.path || "")),
        category: tr("ui.app.read.file.559fbbe"),
      };
    case "write_file":
      return {
        icon: "✎",
        label: (tr("ui.app.create.4421661")) + baseName(String(inp.path || "")),
        category: tr("ui.app.create.file.f820687"),
        add: String(inp.content ?? "").length, // 字符数
      };
    case "edit_file":
      return {
        icon: "✎",
        label: (tr("ui.app.edit.1b6b802")) + baseName(String(inp.path || "")),
        category: tr("ui.app.edit.file.629bfa2"),
        add: String(inp.new_string ?? "").length, // 新增字符数
        del: String(inp.old_string ?? "").length, // 删除字符数
      };
    case "glob":
      return { icon: "⌕", label: tr("ui.app.find.files.ad2679f"), category: tr("ui.app.search.e8d64c0") };
    case "grep":
      return { icon: "⌕", label: tr("ui.app.search.content.11370d4"), category: tr("ui.app.search.e8d64c0") };
    case "web_search":
      return { icon: "🌐", label: (tr("ui.app.web.search.c0da4a0")) + String(inp.query || ""), category: tr("ui.app.web.search.972741a") };
    case "web_fetch":
      return { icon: "🌐", label: (tr("ui.app.fetch.page.a33a091")) + String(inp.url || ""), category: tr("ui.app.read.page.ac9f1ef") };
    case "browser_open":
      return { icon: "🖥", label: (tr("ui.app.browser.open.5b46ddf")) + String(inp.url || ""), category: tr("set.tools.badgeBrowser") };
    case "browser_read":
      return { icon: "🖥", label: tr("ui.app.read.current.page.d4dd429"), category: tr("set.tools.badgeBrowser") };
    case "browser_click":
      return { icon: "🖥", label: (tr("ui.app.click.737993f")) + String(inp.selector || ""), category: tr("set.tools.badgeBrowser") };
    case "remember":
      return { icon: "✦", label: (tr("ui.app.remember.b532336")) + String(inp.text || ""), category: tr("ui.app.save.memory.f51e8a2") };
    default:
      return { icon: "•", label: item.name, category: item.name };
  }
}

// 工具输入预览：展开后显示"具体在执行啥"(运行中也能看)
function toolInputPreview(item: Extract<Item, { type: "tool" }>): string {
  const inp = (item.input || {}) as any;
  const en = getLang() !== "zh";
  switch (item.name) {
    case "bash":
      return "$ " + String(inp.command || "");
    case "powershell":
      return "PS> " + String(inp.command || "");
    case "read_file":
      return (tr("ui.app.read.6fc7605")) + String(inp.path || "");
    case "write_file":
      return (tr("ui.app.write.9e9d809")) + String(inp.path || "");
    case "edit_file":
      return (tr("ui.app.edit.1b6b802")) + String(inp.path || "");
    case "grep":
      return (tr("ui.app.search.fb60fef", { p0: inp.pattern ?? "" })) + (inp.path ? (tr("ui.app.path.e4b1db3", { p0: inp.path })) : "");
    case "glob":
      return (tr("ui.app.match.d1583ce", { p0: inp.pattern ?? inp.glob ?? "" })) + (inp.path ? (tr("ui.app.path.e4b1db3", { p0: inp.path })) : "");
    case "web_search":
      return (tr("ui.app.web.search.94d87ab", { p0: inp.query ?? "" }));
    case "web_fetch":
      return (tr("ui.app.fetch.00892a8", { p0: inp.url ?? "" }));
    case "browser_open":
      return (tr("ui.app.browser.open.95458e0", { p0: inp.url ?? "" }));
    case "browser_click":
      return (tr("ui.app.click.484a51d", { p0: inp.selector ?? "" }));
    case "remember":
      return (tr("ui.app.remember.7bbaec5", { p0: inp.text ?? "" }));
    default: {
      const s = JSON.stringify(inp);
      return s === "{}" ? "" : s;
    }
  }
}

const ToolView = React.memo(function ToolView({ item }: { item: Extract<Item, { type: "tool" }> }) {
  useLanguage();
  const [open, setOpen] = useState(false); // 默认折叠
  const m = toolMeta(item);
  const en = getLang() !== "zh";
  const running = item.status === "running";
  const diff = renderDiff(item);
  const cmd = (item.name === "bash" || item.name === "powershell") ? String((item.input as any).command || "") : "";
  const inputStr = toolInputPreview(item);
  // 有输入/结果/diff 都可展开——运行中也能点开看正在执行的输入
  const hasDetail = !!diff || !!item.result || !!inputStr;
  return (
    <div className="tool">
      <div className="trow" onClick={() => hasDetail && setOpen((v) => !v)}>
        <span className="tlabel" title={toolMetaRaw(item).label}>
          {m.label}
        </span>
        {(m.add != null || m.del != null) && (
          <span
            className="tdelta"
            title={tr("ui.app.chars.a06e241", { p0: m.add ?? 0, p1: (en ? m.del != null ? ` · -${m.del} chars` : "" : m.del != null ? tr("ui.app.message.ae8b09bbbc", {p0: m.del}) : "") })}
          >
            {m.add != null && <span className="add">+{m.add}</span>}
            {m.del != null && <span className="del">-{m.del}</span>}
            <span className="tunit">{tr("ui.app.chars.dffc869")}</span>
          </span>
        )}
        <span className="tspacer" />
        <span className={"tstat " + (running ? "run" : item.isError ? "err" : "ok")}>
          {running ? (tr("thinking.running")) : item.isError ? (tr("ui.app.failed.1dad492")) : (tr("pay.msg.done"))}
        </span>
        {hasDetail && <span className="tcaret">{open ? "▾" : "▸"}</span>}
      </div>
      {/* 工具产出的图片(截图 / send_image 生图)：始终内联显示，点开看大图。 */}
      {item.image && (
        <div className="tool-img" onClick={() => openImageLightbox?.(item.image!)} title={tr("ui.app.click.to.view.340301c")}>
          <img src={item.image} alt="" />
        </div>
      )}
      {open && cmd && <div className="tcmd">$ {cmd}</div>}
      {open && !cmd && inputStr && <div className="tcmd">{inputStr}</div>}
      {open && diff}
      {open && !diff && item.result && (
        <div className={"result" + (item.isError ? " err" : "")}>{clip(item.result, 60)}</div>
      )}
    </div>
  );
});

type ToolItem = Extract<Item, { type: "tool" }>;

// 连续的工具调用合并成一组，收起显示概括；点开列步骤，再点开看命令
function ToolGroup({ tools }: { tools: ToolItem[] }) {
  const [open, setOpen] = useState(false);
  if (tools.length === 1) return <ToolView item={tools[0]} />;
  const running = tools.some((t) => t.status === "running");
  const done = tools.filter((t) => t.status === "done").length;
  const counts: Record<string, number> = {};
  for (const t of tools) {
    const c = toolMeta(t).category;
    counts[c] = (counts[c] || 0) + 1;
  }
  const en = getLang() !== "zh";
  const mainCat = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || (tr("ui.app.actions.d4eb333"));
  const imgTools = tools.filter((t) => t.image); // 组里产出图片的步骤(截图 / send_image 生图)
  return (
    <div className="tool">
      <div className="trow" onClick={() => setOpen((v) => !v)}>
        <span className="tlabel">
          {mainCat} · {tools.length}{tr("ui.app.steps.95059a8")}{running ? `（${done}/${tools.length}）` : ""}
        </span>
        <span className="tspacer" />
        <span className="tcaret">{open ? "▾" : "▸"}</span>
      </div>
      {/* 折叠态也始终内联显示组里产出的图片——图是发给用户看的内容，不该被折叠藏起来(send_image 的二维码/截图)。
          展开态由下面每个 ToolView 自己渲染图，故这里只在折叠时补。 */}
      {!open && imgTools.length > 0 && (
        <div className="tgroup-imgs">
          {imgTools.map((t, i) => (
            <div key={i} className="tool-img" onClick={() => openImageLightbox?.(t.image!)} title={tr("ui.app.click.to.view.340301c")}>
              <img src={t.image} alt="" />
            </div>
          ))}
        </div>
      )}
      {open && (
        <div className="tgroup-items">
          {tools.map((t, i) => (
            <ToolView key={i} item={t} />
          ))}
        </div>
      )}
    </div>
  );
}

type RenderBlock = { kind: "item"; item: Item } | { kind: "tools"; tools: ToolItem[] };
function groupBlocks(items: Item[]): RenderBlock[] {
  const blocks: RenderBlock[] = [];
  for (const it of dedupeDisplayedToolImages(items)) {
    if (it.type === "tool") {
      const last = blocks[blocks.length - 1];
      if (last && last.kind === "tools") last.tools.push(it);
      else blocks.push({ kind: "tools", tools: [it] });
    } else {
      blocks.push({ kind: "item", item: it });
    }
  }
  return blocks;
}

// 一个 AI 回合 = 连续的助手文字 + 工具块，整组左对齐、底部左侧只放一个星星
type Turn = { kind: "solo"; item: Item } | { kind: "ai"; blocks: RenderBlock[] };
function groupTurns(items: Item[]): Turn[] {
  const turns: Turn[] = [];
  for (const rb of groupBlocks(items)) {
    const solo = rb.kind === "item" && (rb.item.type === "user" || rb.item.type === "notice");
    if (solo) {
      turns.push({ kind: "solo", item: (rb as { kind: "item"; item: Item }).item });
      continue;
    }
    const last = turns[turns.length - 1];
    if (last && last.kind === "ai") last.blocks.push(rb);
    else turns.push({ kind: "ai", blocks: [rb] });
  }
  return turns;
}

// 取一个 AI 回合的时间戳=回合内最后一条助手文字的 ts(没有则不显示)
function aiTurnTs(blocks: RenderBlock[]): number | undefined {
  for (let k = blocks.length - 1; k >= 0; k--) {
    const b = blocks[k];
    if (b.kind === "item" && b.item.type === "assistant" && b.item.ts) return b.item.ts;
  }
  return undefined;
}
// 取一个 AI 回合末尾的累计用量快照(回合内最后一条带 usage 的助手文字)
function aiTurnUsage(blocks: RenderBlock[]): UsageSnap | undefined {
  for (let k = blocks.length - 1; k >= 0; k--) {
    const b = blocks[k];
    if (b.kind === "item" && b.item.type === "assistant" && (b.item as any).usage)
      return (b.item as any).usage as UsageSnap;
  }
  return undefined;
}
// token 数紧凑显示：1234→1.2k，1200000→1.2M
function fmtTok(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0) + "k";
  return (n / 1_000_000).toFixed(1) + "M";
}

function renderDiff(item: Extract<Item, { type: "tool" }>) {
  if (item.status !== "done") return null;
  if (item.name === "edit_file" && item.input.old_string && item.input.new_string) {
    const del = String(item.input.old_string).split("\n");
    const add = String(item.input.new_string).split("\n");
    return (
      <div className="diff">
        {del.map((l, i) => (
          <div key={"d" + i} className="line del">
            - {l}
          </div>
        ))}
        {add.map((l, i) => (
          <div key={"a" + i} className="line add">
            + {l}
          </div>
        ))}
      </div>
    );
  }
  if (item.name === "write_file" && typeof item.input.content === "string") {
    const add = String(item.input.content).split("\n").slice(0, 40);
    return (
      <div className="diff">
        {add.map((l, i) => (
          <div key={"a" + i} className="line add">
            + {l}
          </div>
        ))}
      </div>
    );
  }
  return null;
}

function clip(text: string, lines = 12): string {
  const arr = text.split("\n");
  return arr.length > lines ? arr.slice(0, lines).join("\n") + (tr("ui.app.truncated.e415cdf")) : text;
}

type Kind = "codex" | "anthropic-oauth" | "anthropic-apikey" | "openai";
interface Preset {
  id: string;
  label: string;
  labelEn?: string; // 后台 ai_provider.label_en：英文界面优先显示。缺省回退 PRESET_EN 或中文 label
  kind: Kind;
  baseUrl: string;
  keyUrl: string;
  keyHint: string;
  models: string[];
  modelLabels?: Record<string, string>; // 模型 id → 灰字说明(如"基于 Qwen3-VL-8B 微调")
  note?: string;
  fixedBaseUrl: boolean;
  custom?: boolean; // 用户自定义中转站(可删除)
  hosted?: boolean; // 无为托管平台(走网关、按 token 扣无为币)；仅灰度放开的用户可见
  anon?: boolean; // 未登录也可见/可用(匿名试用免费模型；hosted 平台但免登录，靠设备/IP 每日护栏)
}

// 用户自定义中转站
type Station = { id: string; label: string; baseUrl: string; relay?: boolean };
// 自定义供应商/中转站 → 伪预设(OpenAI 兼容)，并入平台下拉。relay=true 才加「（中转）」后缀
// 模块级函数拿不到组件里的 lang，直接读 getLang()
function stationToPreset(s: Station): Preset {
  const en = getLang() !== "zh";
  return {
    id: s.id,
    label: s.relay ? s.label + (tr("ui.app.relay.eea1124")) : s.label,
    kind: "openai",
    baseUrl: s.baseUrl,
    keyUrl: "",
    keyHint: "sk-...",
    models: [],
    note: s.relay
      ? tr("ui.app.custom.relay.openai.compatible.one.key.9b7e7c4")
      : tr("ui.app.self.hosted.custom.provider.openai.compatible.43f1f60"),
    fixedBaseUrl: true,
    custom: true,
  };
}

// 应用用户对平台的「删除/改名/改端点」覆盖：过滤掉 removed，再按 overrides 改 label/baseUrl(含内置平台)
function applyProviderEdits(
  presets: Preset[],
  overrides: Record<string, { label?: string; baseUrl?: string }>,
  removed: string[],
): Preset[] {
  return presets
    .filter((p) => !removed.includes(p.id))
    .map((p) => {
      const o = overrides[p.id];
      if (!o) return p;
      return { ...p, label: o.label ?? p.label, baseUrl: o.baseUrl ?? p.baseUrl };
    });
}

// 无为托管网关地址：2026-09 从 Vercel(wuweiai.io)迁到海外常驻 gw.wuweiai.io，聊天流量不再穿 Vercel。
// 老用户已存旧 URL 的，由 provider.ts::fetchWithRetry 运行时改写兜底；此处让新安装直接存新地址。
const WUWEI_GATEWAY_BASE = "https://gw.wuweiai.io/api/gateway/v1";

// 私有版：保留 Codex/Claude 两种订阅后端，其余为各平台 API Key 预设（模型 id 均取自官网 2026-07）
const PRESETS: Preset[] = [
  {
    // 免费体验：无需登录、无需 Key，直接试用智谱免费模型（GLM-*-Flash）。走网关匿名分支，靠设备/IP 每日护栏防滥用。
    id: "wuwei-free",
    get label() { return tr("ui.app.message.2bdf2c7988"); },
    kind: "openai",
    baseUrl: WUWEI_GATEWAY_BASE,
    keyUrl: "",
    keyHint: "",
    models: ["openrouter-auto-free", "glm-4.7-flash", "glm-4-flash", "glm-z1-flash", "glm-4v-flash"],
    get note() { return tr("ui.app.message.cb4ce6d244"); },
    fixedBaseUrl: true,
    hosted: true,
    anon: true,
  },
  {
    // 无为托管：走网关、用无为币按 token 扣费，无需自己的 Key。仅灰度放开的用户可见。
    id: "wuwei-deepseek",
    get label() { return tr("ui.app.message.e791b28d2b"); },
    kind: "openai",
    baseUrl: WUWEI_GATEWAY_BASE,
    keyUrl: "",
    keyHint: "",
    models: ["deepseek-v4-pro", "deepseek-v4-flash"],
    get note() { return tr("ui.app.message.290ef044f9"); },
    fixedBaseUrl: true,
    hosted: true,
  },
  {
    id: "wuwei-zhipu",
    get label() { return tr("ui.app.message.d4222af7ee"); },
    kind: "openai",
    baseUrl: WUWEI_GATEWAY_BASE,
    keyUrl: "",
    keyHint: "",
    models: ["glm-5.2"],
    get note() { return tr("ui.app.message.5839304560"); },
    fixedBaseUrl: true,
    hosted: true,
  },
  {
    id: "wuwei-kimi",
    get label() { return tr("ui.app.message.d9484c2a0b"); },
    kind: "openai",
    baseUrl: WUWEI_GATEWAY_BASE,
    keyUrl: "",
    keyHint: "",
    models: ["kimi-k3"],
    get note() { return tr("ui.app.message.640b7e1663"); },
    fixedBaseUrl: true,
    hosted: true,
  },
  {
    id: "wuwei-claude",
    get label() { return tr("ui.app.message.cba48ff5ea"); },
    kind: "openai",
    baseUrl: WUWEI_GATEWAY_BASE,
    keyUrl: "",
    keyHint: "",
    models: ["claude-opus-4-8"],
    get note() { return tr("ui.app.message.8ba05e6c14"); },
    fixedBaseUrl: true,
    hosted: true,
  },
  {
    id: "wuwei-gpt",
    get label() { return tr("ui.app.message.570f899d17"); },
    kind: "openai",
    baseUrl: WUWEI_GATEWAY_BASE,
    keyUrl: "",
    keyHint: "",
    models: ["gpt-6-astra", "gpt-5.6", "gpt-5.5"],
    get note() { return tr("ui.app.message.d6f81fea7d"); },
    fixedBaseUrl: true,
    hosted: true,
  },
  {
    id: "codex",
    get label() { return tr("ui.app.message.b486441944"); },
    kind: "codex",
    baseUrl: "",
    keyUrl: "",
    keyHint: "",
    models: [
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
    ],
    get note() { return tr("ui.app.message.0cfc3e1d47"); },
    fixedBaseUrl: true,
  },
  {
    id: "claude-oauth",
    get label() { return tr("ui.app.message.4f50e061b5"); },
    kind: "anthropic-oauth",
    baseUrl: "",
    keyUrl: "",
    get keyHint() { return tr("ui.app.message.0f034a21dd"); },
    models: [
      "claude-opus-5-5",
      "claude-fable-5-1",
      "claude-opus-5",
      "claude-sonnet-5",
      "claude-fable-5",
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
    ],
    note: "",
    fixedBaseUrl: true,
  },
  {
    id: "anthropic",
    label: "Claude API Key（Anthropic）",
    kind: "anthropic-apikey",
    baseUrl: "",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyHint: "sk-ant-...",
    models: [
      "claude-opus-5-5",
      "claude-opus-5",
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-opus-4-6",
      "claude-sonnet-5",
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
      "claude-fable-5-1",
      "claude-fable-5",
    ],
    fixedBaseUrl: true,
  },
  {
    id: "openai",
    label: "OpenAI（GPT）",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    keyUrl: "https://platform.openai.com/api-keys",
    keyHint: "sk-...",
    models: [
      "gpt-5.6-terra",
      "gpt-5.6-sol",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.4-nano",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "o3",
      "o4-mini",
    ],
    get note() { return tr("ui.app.message.01cf7f650e"); },
    fixedBaseUrl: true,
  },
  {
    id: "openrouter",
    get label() { return tr("ui.app.message.3df80165c2"); },
    kind: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    keyUrl: "https://openrouter.ai/keys",
    keyHint: "sk-or-...",
    models: [
      "anthropic/claude-opus-4-8",
      "anthropic/claude-sonnet-5",
      "anthropic/claude-haiku-4-5",
      "openai/gpt-5.5",
      "openai/gpt-5.6-terra",
      "google/gemini-3-pro",
      "deepseek/deepseek-chat",
      "x-ai/grok-4.5",
      "qwen/qwen3-max",
      "moonshotai/kimi-k2",
    ],
    get note() { return tr("ui.app.message.ef5b59dbb7"); },
    fixedBaseUrl: true,
  },
  {
    id: "deepseek",
    get label() { return tr("ui.app.message.f310ff0f0e"); },
    kind: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    keyUrl: "https://platform.deepseek.com/api_keys",
    keyHint: "sk-...",
    models: ["deepseek-v4-pro", "deepseek-v4-flash"],
    get note() { return tr("ui.app.message.14efcc0c0b"); },
    fixedBaseUrl: true,
  },
  {
    id: "qwen",
    get label() { return tr("ui.app.message.798f3e9d7f"); },
    kind: "openai",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    keyUrl: "https://bailian.console.aliyun.com/",
    keyHint: "sk-...",
    models: [
      "qwen3.7-max",
      "qwen3.7-plus",
      "qwen3.6-flash",
      "qwen3-max",
      "qwen-max",
      "qwen-plus",
      "qwen-flash",
      "qwen-turbo",
      "qwen-long",
      "qwen3-coder-plus",
      "qwen3-coder-flash",
    ],
    fixedBaseUrl: true,
  },
  {
    id: "doubao",
    get label() { return tr("ui.app.message.40e8a569fb"); },
    kind: "openai",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    keyUrl: "https://console.volcengine.com/ark",
    get keyHint() { return tr("ui.app.message.55785aa619"); },
    models: [
      "doubao-seed-2-0-pro-260215",
      "doubao-seed-1-8-251228",
      "doubao-seed-1-6-251015",
      "doubao-seed-1-6-flash-250828",
      "doubao-seed-1-6-lite-251015",
      "doubao-1-5-pro-32k-250115",
      "doubao-1-5-lite-32k-250115",
    ],
    get note() { return tr("ui.app.message.77b2057b9e"); },
    fixedBaseUrl: true,
  },
  {
    id: "minimax",
    label: "MiniMax",
    kind: "openai",
    baseUrl: "https://api.minimaxi.com/v1",
    keyUrl: "https://platform.minimaxi.com/user-center/basic-information/interface-key",
    keyHint: "MiniMax API Key",
    models: [
      "MiniMax-M3",
      "MiniMax-M2.7",
      "MiniMax-M2.7-highspeed",
      "MiniMax-M2.5",
      "MiniMax-M2.5-highspeed",
      "MiniMax-M2.1",
      "MiniMax-M2.1-highspeed",
      "MiniMax-M2",
    ],
    fixedBaseUrl: true,
  },
  {
    id: "zhipu",
    get label() { return tr("ui.app.message.faff5e02f1"); },
    kind: "openai",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    keyUrl: "https://open.bigmodel.cn/apikey/platform",
    get keyHint() { return tr("ui.app.message.7300e1bf69"); },
    models: [
      "glm-5.2",
      "glm-5.1",
      "glm-5",
      "glm-5-turbo",
      "glm-4.7",
      "glm-4.6",
      "glm-4.5",
      "glm-4.7-flash",
      "glm-5v-turbo",
      "glm-4.6v",
      "glm-4.6v-flash",
      "glm-4.1v-thinking",
    ],
    get note() { return tr("ui.app.message.36660f8315"); },
    fixedBaseUrl: true,
  },
  {
    id: "kimi",
    get label() { return tr("ui.app.message.afc3dd1129"); },
    kind: "openai",
    baseUrl: "https://api.moonshot.cn/v1",
    keyUrl: "https://platform.kimi.com/console/api-keys",
    keyHint: "sk-...",
    models: [
      "kimi-k3",
      "kimi-k2.7-code",
      "kimi-k2.7-code-highspeed",
      "kimi-k2.6",
      "kimi-k2.5",
      "kimi-latest",
      "moonshot-v1-128k",
      "moonshot-v1-32k",
      "moonshot-v1-8k",
      "moonshot-v1-128k-vision-preview",
      "moonshot-v1-32k-vision-preview",
      "moonshot-v1-8k-vision-preview",
    ],
    get note() { return tr("ui.app.message.4630eb3e45"); },
    fixedBaseUrl: false,
  },
  {
    id: "kimi-sub",
    get label() { return tr("ui.app.message.5dffcaecb5"); },
    kind: "openai",
    baseUrl: "https://api.kimi.com/coding/v1",
    keyUrl: "https://www.kimi.com/code",
    get keyHint() { return tr("ui.app.message.cdb8762af2"); },
    models: ["k3", "kimi-for-coding", "kimi-for-coding-highspeed"],
    get note() { return tr("ui.app.message.35172f39f4"); },
    fixedBaseUrl: false,
  },
  {
    id: "hunyuan",
    get label() { return tr("ui.app.message.75fd7b2dc6"); },
    kind: "openai",
    baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    keyUrl: "https://console.cloud.tencent.com/hunyuan/api-key",
    get keyHint() { return tr("ui.app.message.edb0ff8f66"); },
    models: [
      "hunyuan-turbos-latest",
      "hunyuan-t1-latest",
      "hunyuan-turbo-latest",
      "hunyuan-large",
      "hunyuan-standard",
      "hunyuan-lite",
      "hunyuan-vision",
    ],
    get note() { return tr("ui.app.message.3332b5ebbd"); },
    fixedBaseUrl: true,
  },
  {
    id: "grok",
    label: "Grok（xAI）",
    kind: "openai",
    baseUrl: "https://api.x.ai/v1",
    keyUrl: "https://console.x.ai",
    keyHint: "xai-...",
    models: [
      "grok-4.5",
      "grok-4.3",
      "grok-4.20-0309-reasoning",
      "grok-4.20-0309-non-reasoning",
      "grok-4.20-multi-agent-0309",
    ],
    get note() { return tr("ui.app.message.e02c67fd36"); },
    fixedBaseUrl: true,
  },
  {
    id: "custom",
    get label() { return tr("ui.app.message.6f759dc793"); },
    kind: "openai",
    baseUrl: "http://localhost:8000/v1",
    keyUrl: "",
    get keyHint() { return tr("ui.app.message.6abce90faf"); },
    models: [],
    get note() { return tr("ui.app.message.45948c32d7"); },
    fixedBaseUrl: false,
  },
];

// 供应商目录英文覆盖（仅 EN 显示时用；缺省回退中文）。key = preset.id。不改 PRESETS 本体。
const PRESET_EN: Record<string, { label?: string; note?: string; keyHint?: string }> = {
  "wuwei-deepseek": { label: "Wuwei Hosted · DeepSeek", note: "Hosted credits: no key needed — charged per actual token usage (balance in the account menu). Same models as DeepSeek direct (V4 Pro/Flash)." },
  "wuwei-zhipu": { label: "Wuwei Hosted · Zhipu", note: "Hosted: no key needed, credits charged per token. Zhipu GLM-5.2 flagship." },
  "wuwei-kimi": { label: "Wuwei Hosted · Kimi", note: "Hosted: no key needed, credits charged per token. Kimi K3 flagship." },
  "wuwei-claude": { label: "Wuwei Hosted · Claude", note: "Hosted: no key needed, credits charged per token. Claude Opus 4.8." },
  "wuwei-gpt": { label: "Wuwei Hosted · GPT", note: "Hosted: no key needed, credits charged per token. GPT-5.5 / 5.6." },
  codex: { label: "Codex subscription (ChatGPT login)", note: "Uses your local ~/.codex login — no credentials needed. Only gpt-5.5 is device-verified; whether other models route through the subscription depends — watch the status light / actual requests after switching (a failure shows amber)." },
  get "claude-oauth"() { return { label: tr("ui.app.message.4f50e061b5"), keyHint: "sk-ant-oat… (auto-filled after one-click authorize above)" }; },
  "wuwei-free": { label: "Free trial (no login)", note: "Free trial: no login, no API key — try Zhipu's free models (GLM-*-Flash) right away. Limited uses per device per day; sign in to unlock more models and higher limits." },
  anthropic: { label: "Claude API Key (Anthropic)" },
  openai: { label: "OpenAI (GPT)", note: "gpt-5.6-terra balanced / sol strongest / luna cheapest" },
  openrouter: { label: "OpenRouter (all providers)", note: "One key for Claude / GPT / Gemini and more. Use “vendor/model” slugs (full list at openrouter.ai/models), or pick “Custom” to enter any slug." },
  get deepseek() { return { label: tr("ui.app.message.f310ff0f0e"), note: "V4 Pro/Flash (deepseek-chat/deepseek-reasoner retired 2026-07-24, removed)" }; },
  qwen: { label: "Tongyi Qwen (Alibaba Bailian)" },
  doubao: { label: "Doubao (Volcano Ark)", keyHint: "Volcano Ark API Key", note: "Doubao usually needs an endpoint ID (ep-...) created under Ark “Online Inference”; dated model names change — use “Custom” to fill the latest." },
  get zhipu() { return { label: tr("ui.app.message.faff5e02f1"), keyHint: "Zhipu API Key", note: "glm-5.2 flagship (1M context); glm-5v-turbo / glm-4.6v are vision multimodal (text+image)" }; },
  get kimi() { return { label: tr("ui.app.message.afc3dd1129"), note: "kimi-k3 flagship (2.8T/1M context); for the international site use https://api.moonshot.ai/v1; kimi-latest and *-vision-preview support text+image" }; },
  "kimi-sub": { label: "Kimi Code subscription (membership)", keyHint: "sk-... (created in the Kimi Code console for members)", note: "Uses membership subscription quota (not pay-as-you-go API). base=/coding/v1; flagship model is k3 (≠ the open-platform kimi-k3). Create keys in the Kimi Code console — up to 5, shown only once. ⚠ Official rule: don't change the User-Agent to impersonate other tools, or your membership may be banned." },
  hunyuan: { label: "Tencent Hunyuan (Yuanbao)", keyHint: "Hunyuan API Key", note: "Yuanbao maps to the Tencent Hunyuan API; hunyuan-vision supports text+image" },
  grok: { label: "Grok (xAI)", note: "grok-4.x is natively multimodal (text+image); grok-4.3 is the 1M-context flagship" },
  get custom() { return { label: tr("ui.app.message.6f759dc793"), keyHint: "Can be left blank locally", note: "Any OpenAI-compatible endpoint — just fill your Base URL + model name" }; },
};
// Hosted entries use the catalog's primary model name in the selected language.
const pLabel = (p: Preset, lang: Lang) => p.hosted && p.id !== "wuwei-free"
  ? (lang !== "zh" ? p.labelEn || p.models[0] || tr("set.m.model") : p.label).replace(/^(?:无为托管\s*[·・]?\s*|Wuwei(?: Hosted)?\s*[·・]?\s*)/i, "")
  : (lang !== "zh" && (PRESET_EN[p.id]?.label || p.labelEn)) || p.label;
const pKeyHint = (p: Preset, lang: Lang) => (lang !== "zh" && PRESET_EN[p.id]?.keyHint) || p.keyHint;
const pNote = (p: Preset, lang: Lang) => (lang !== "zh" ? PRESET_EN[p.id]?.note ?? p.note : p.note);

// 菜单/下拉里的展示顺序(不改 PRESETS 定义本身，PRESETS[0]=codex 仍作默认)
// 后台目录可用时按后台顺序；离线时回退本地排序和此默认顺序。
// 此常量是离线兜底：拉不到 catalog 时用它排。与后台迁移 ai_provider.sort 保持一致。
const PROVIDER_ORDER = [
  "wuwei-free",
  "wuwei-claude",
  "wuwei-gpt",
  "wuwei-deepseek",
  "wuwei-kimi",
  "wuwei-zhipu",
  "claude-oauth",
  "codex",
  "kimi-sub",
  "deepseek",
  "zhipu",
  "anthropic",
  "openrouter",
  "openai",
  "qwen",
  "doubao",
  "minimax",
  "hunyuan",
  "grok",
  "custom",
];

// 依据用户自定义顺序(order)+隐藏集(hidden)对预设列表排序/过滤。
// order 里没有的(新平台/新中转站)按内置 PROVIDER_ORDER 默认序、再按原始相对序补到末尾——保证永不漏显示。
// includeHidden=true 时保留隐藏项(设置里的平台管理列表用)，false 时过滤掉(切换菜单/正常展示用)。
// 把后台目录并入内置预设：
//  - catalog=null(离线/老后端) → 原样返回 base，全量回退硬编码，行为不变；
//  - 已知 id(在 base 里) → 保留本地 kind/baseUrl/keyUrl/note 等元数据，仅当 catalog 给了模型时覆盖 models；
//  - 未知 id(后台新增平台) → 整条按 catalog 字段构造 OpenAI 兼容 Preset；
//  - catalog 未含的内置平台视为"后台已隐藏"不返回，但强制保留 keepId(当前选中)避免用户被甩飞；
//  - 顺带收集免费模型 id 到 freeSet（给模型下拉打「免费」标）。
function mergeCatalogIntoPresets(
  base: Preset[],
  catalog: CatalogProviderDto[] | null,
  freeSet: Set<string>,
  keepId?: string,
  badgeMap?: Map<string, string>,
  labelMap?: Map<string, string>,
  labelEnMap?: Map<string, string>,
  loginReqSet?: Set<string>,
): Preset[] {
  if (!catalog || catalog.length === 0) {
    // 离线/老后端/首帧未回来：catalog 拿不到时也要把内置「免费体验(anon)」平台的模型标为免费，
    // 否则下拉丢「免登录」绿标、发送护栏(freeSet/loginReqSet)拿不到数据 → 游客可能撞死墙。
    // 这些内置模型本地已知都是免登录(anon)，故只进 freeSet、不进 loginReqSet。
    for (const p of base) {
      if (p.anon) for (const m of p.models) freeSet.add(m);
    }
    return base;
  }
  const byId = new Map(base.map((p) => [p.id, p]));
  const out: Preset[] = [];
  const seen = new Set<string>();
  for (const c of catalog) {
    for (const m of c.models) {
      if (m.free) freeSet.add(m.id);
      // 免费列表里 anon=false 的便宜模型：展示但需登录（下拉灰置 + 点击引导登录）
      if (loginReqSet && m.free && m.anon === false) loginReqSet.add(m.id);
      if (m.badge && badgeMap) badgeMap.set(m.id, m.badge);
      // 后台配了显示名且与 id 不同 → 记下，下拉里优先显示 label(如 gpt-5.6→"GPT-5.6 Sol")
      if (labelMap && m.label && m.label !== m.id) labelMap.set(m.id, m.label);
      // 英文显示名：后台 ai_model.label_en，英文界面优先显示（缺省回退中文 label）
      if (labelEnMap) { const enLabel = m.labelEn || m.label_en; if (enLabel) labelEnMap.set(m.id, enLabel); }
    }
    const models = c.models.map((m) => m.id);
    const primary = c.hosted && c.id !== "wuwei-free" ? c.models[0] : undefined;
    const modelLabel = primary?.label || c.label;
    const modelLabelEn = primary ? primary.labelEn || primary.label_en || primary.id : c.labelEn;
    const local = byId.get(c.id);
    if (local) {
      // 已知平台：保留本地元数据，模型用 catalog 覆盖；anon(未登录可见)由后台控制，跟随 catalog。
      // labelEn 跟随 catalog(后台 label_en)，让后台新增/改名的英文标签即时生效。
      out.push({ ...local, ...(models.length ? { models } : {}), anon: c.anon, ...(primary ? { label: modelLabel } : {}), labelEn: modelLabelEn ?? local.labelEn });
    } else {
      out.push({
        id: c.id,
        label: modelLabel,
        labelEn: modelLabelEn ?? undefined,
        kind: (c.kind as Kind) || "openai",
        baseUrl: c.baseUrl,
        keyUrl: c.keyUrl,
        keyHint: c.keyHint,
        models,
        note: c.note,
        fixedBaseUrl: c.hosted || !!c.baseUrl,
        custom: c.custom,
        hosted: c.hosted,
        anon: c.anon,
      });
    }
    seen.add(c.id);
  }
  // 强制保留当前选中平台（即便后台把它隐藏了），避免正在用的平台从下拉里消失导致无法发送
  if (keepId && !seen.has(keepId)) {
    const cur = byId.get(keepId);
    if (cur) out.push(cur);
  }
  return out;
}

function arrangePresets(
  all: Preset[],
  order: string[] | undefined,
  hidden: string[] | undefined,
  includeHidden: boolean,
  defaultOrder?: string[], // 后台目录优先；本地排序只用于自定义平台和离线回退。
): Preset[] {
  return arrangeProviderEntries(all, order, hidden, includeHidden, PROVIDER_ORDER, defaultOrder);
}

type ModelCap = { noTools?: boolean; vision?: boolean };
type CredSlot = { apiKey?: string; baseUrl?: string; oauthToken?: string; nickname?: string; model?: string; systemPrompt?: string; noTools?: boolean; vision?: boolean; modelCaps?: Record<string, ModelCap>; customModels?: string[] };

// 简约线条眼睛图标：off=true 显示"划掉的眼睛"(当前明文，点击隐藏)
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
      {off && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

// MCP 服务器配置项
type McpServer = { command: string; args?: string[]; env?: Record<string, string>; disabled?: boolean };
// 把配置 JSON(数组 或 {mcpServers}) 解析成 {name: server}
function parseMcpServers(text: string): Record<string, McpServer> {
  try {
    const r = JSON.parse(text);
    if (r?.mcpServers && typeof r.mcpServers === "object") return r.mcpServers;
    if (Array.isArray(r))
      return Object.fromEntries(
        r.map((s: any) => [s.name, { command: s.command, args: s.args, env: s.env, disabled: s.disabled }]),
      );
  } catch {
    /* 非法 JSON */
  }
  return {};
}
// 配置字段：指向某个 arg 下标或某个 env 键，带说明；有默认值的装上直接可用
type McpConfigField =
  | { arg: number; label: string; hint: string }
  | { env: string; label: string; hint: string };
type CatalogItem = {
  name: string;
  label: string;
  desc: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  config?: McpConfigField[]; // 需/可配置的字段(编辑器只显示这些，其余固定参数隐藏)
};
// 常用 MCP 服务器目录(搜索+一键安装)。有默认值的开箱即用；<...> 是必须填的密钥/连接串
const MCP_CATALOG: CatalogItem[] = [
  {
    name: "filesystem",
    get label() { return tr("ui.app.message.71c1e6fc2a"); },
    get desc() { return tr("ui.app.message.4b2684cfd5"); },
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "~/Desktop"],
    get config() { return [{ arg: 2, label: tr("ui.app.message.8b2f522787"), hint: tr("ui.app.message.43c432a5eb") }]; },
  },
  { name: "puppeteer", get label() { return tr("ui.app.message.d2f42a90e0"); }, get desc() { return tr("ui.app.message.4e5a9cc69d"); }, command: "npx", args: ["-y", "@modelcontextprotocol/server-puppeteer"] },
  { name: "memory", get label() { return tr("ui.app.message.1c55db8163"); }, get desc() { return tr("ui.app.message.95247f47ba"); }, command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"] },
  { name: "sequential-thinking", get label() { return tr("ui.app.message.bcc2eee457"); }, get desc() { return tr("ui.app.message.5b95eac09a"); }, command: "npx", args: ["-y", "@modelcontextprotocol/server-sequential-thinking"] },
  {
    name: "github",
    get label() { return tr("ui.app.github.6d98f78"); },
    get desc() { return tr("ui.app.message.9294fcaca9"); },
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "<token>" },
    get config() { return [{ env: "GITHUB_PERSONAL_ACCESS_TOKEN", label: "GitHub Token", hint: tr("ui.app.message.f464fc2523") }]; },
  },
  {
    name: "brave-search",
    get label() { return tr("ui.app.message.1f5f64e03b"); },
    get desc() { return tr("ui.app.message.a2ca25c852"); },
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    env: { BRAVE_API_KEY: "<key>" },
    get config() { return [{ env: "BRAVE_API_KEY", label: "Brave API Key", hint: tr("ui.app.message.a3f5505e0c") }]; },
  },
  {
    name: "postgres",
    label: "Postgres",
    get desc() { return tr("ui.app.message.df722912c2"); },
    command: "npx",
    get args() { return ["-y", "@modelcontextprotocol/server-postgres", tr("ui.app.message.cc9ae0cb5d")]; },
    get config() { return [{ arg: 2, label: tr("ui.app.message.eb2a7c3558"), hint: tr("ui.app.message.3aa0a871d3") }]; },
  },
  {
    name: "slack",
    label: "Slack",
    get desc() { return tr("ui.app.message.8a13676117"); },
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    env: { SLACK_BOT_TOKEN: "<token>", SLACK_TEAM_ID: "<team>" },
    get config() { return [
      { env: "SLACK_BOT_TOKEN", label: "Bot Token", hint: tr("ui.app.message.42d3d4da45") },
      { env: "SLACK_TEAM_ID", label: "Team ID", hint: tr("ui.app.message.cac591a498") },
    ]; },
  },
];

// MCP 目录英文覆盖（仅 EN 用；缺省回退中文）。key=name；fields key = env 名或 `arg{下标}`。
const MCP_EN: Record<string, { label?: string; desc?: string; fields?: Record<string, { label?: string; hint?: string }> }> = {
  get filesystem() { return { label: tr("ui.app.message.71c1e6fc2a"), desc: "Read/write & search files in allowed dirs", fields: { arg2: { label: "Accessible directory", hint: "Directory the AI can read/write; defaults to Desktop — keep it or point to your project dir" } } }; },
  get puppeteer() { return { label: tr("ui.app.message.d2f42a90e0"), desc: "Headless browser control/screenshots, works out of the box" }; },
  memory: { label: "Knowledge-graph memory", desc: "Persistent knowledge-graph memory, works out of the box" },
  get "sequential-thinking"() { return { label: tr("ui.app.message.bcc2eee457"), desc: "Structured multi-step reasoning, works out of the box" }; },
  github: { desc: "Repo / issue / PR operations", fields: { GITHUB_PERSONAL_ACCESS_TOKEN: { hint: "Generate at github.com/settings/tokens with repo scope" } } },
  get "brave-search"() { return { label: tr("ui.app.message.1f5f64e03b"), desc: tr("ui.app.message.a2ca25c852"), fields: { BRAVE_API_KEY: { hint: "Free at brave.com/search/api" } } }; },
  get postgres() { return { desc: "Query Postgres (read-only)", fields: { arg2: { label: tr("ui.app.message.eb2a7c3558"), hint: "postgresql://user:password@host:5432/dbname" } } }; },
  get slack() { return { desc: "Read/write Slack messages", fields: { SLACK_BOT_TOKEN: { hint: tr("ui.app.message.42d3d4da45") }, SLACK_TEAM_ID: { hint: tr("ui.app.message.cac591a498") } } }; },
};
const mcpLabel = (c: CatalogItem, lang: Lang) => (lang !== "zh" && MCP_EN[c.name]?.label) || c.label;
const mcpDesc = (c: CatalogItem, lang: Lang) => (lang !== "zh" && MCP_EN[c.name]?.desc) || c.desc;
const mcpFieldEn = (name: string, key: string, kind: "label" | "hint", fallback: string, lang: Lang) =>
  (lang !== "zh" && MCP_EN[name]?.fields?.[key]?.[kind]) || fallback;

// 内置工具描述的英文（仅设置页 Tools 标签显示用；模型侧描述仍走 src/tools 原文）。按工具名。


// 记忆默认种子头 # 记忆 / # Memory 跟随界面语言互换（只换开头那一行 H1，用户后加的内容不动）
function swapMemHeader(text: string, lang: Lang): string {
  return lang !== "zh" ? text.replace(/^# 记忆(\s|$)/, "# Memory$1") : text.replace(/^# Memory(\s|$)/, systemData.memoryHeaderZh);
}


type ToolGroupRaw = { source: string; kind: "builtin" | "browser" | "mcp"; tools: { name: string; description: string; readOnly: boolean; inputSchema: any }[] };
const toolDesc = (name: string, fallback: string, lang: Lang) => localizeToolMetadata({ name, description: fallback, inputSchema: {} }, lang).description;
// 把 getTools 返回的分组按语言彻底本地化：source 名、工具描述、inputSchema 参数说明（List/JSON 视图共用）。
function localizeToolGroups(groups: ToolGroupRaw[], lang: Lang): ToolGroupRaw[] { return groups.map(group => ({ ...group, source: localizeStoredText(group.source, lang), tools: group.tools.map(tool => localizeToolMetadata(tool, lang)) })); }

// 迁移：把已装服务器里的旧 <占位> 自动补成目录里的默认值(如 sqlite 的 <db路径>→~/wuwei.db)，让老配置也开箱可用
function migrateMcpDefaults(text: string): { text: string; changed: boolean } {
  const servers = parseMcpServers(text);
  let changed = false;
  for (const [name, sv] of Object.entries(servers)) {
    const cat = MCP_CATALOG.find((c) => c.name === name);
    if (!cat?.config) continue;
    for (const f of cat.config) {
      if ("arg" in f) {
        const cur = sv.args?.[f.arg];
        const def = cat.args[f.arg];
        if ((cur == null || String(cur).includes("<")) && def && !def.includes("<")) {
          sv.args = [...(sv.args || [])];
          sv.args[f.arg] = def;
          changed = true;
        }
      } else {
        const cur = sv.env?.[f.env];
        const def = cat.env?.[f.env];
        if ((cur == null || String(cur).includes("<")) && def && !def.includes("<")) {
          sv.env = { ...(sv.env || {}), [f.env]: def };
          changed = true;
        }
      }
    }
  }
  return { text: changed ? JSON.stringify({ mcpServers: servers }, null, 2) : text, changed };
}

// Brain 属性 <-> 文本（每行「键: 值」）互转，供脑网络面板编辑属性
function attrsToText(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}
function textToAttrs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

// 概念网络力导向图：纯本地 SVG 简易力模拟(斥力+边弹簧+向心+阻尼)，无外部库(CSP 安全)。
// 点节点=选中(联动右侧编辑)+固定详情卡；拖节点=挪位置并钉住(脱离力学，双击解除)；
// 点边=看边详情；鼠标悬停节点/边=浮动详情提示。节点大小=权重，颜色=类型。
function ConceptGraph({
  nodes,
  edges,
  selectedId,
  onSelect,
}: {
  nodes: import("./env").BrainNodeLite[];
  edges: import("./env").BrainEdgeLite[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const W = 1000;
  const H = 700;
  const posRef = useRef<Map<string, { x: number; y: number; vx: number; vy: number }>>(new Map());
  const pinnedRef = useRef<Set<string>>(new Set()); // 被拖动过=钉住的节点，力学不再拉走
  const dragRef = useRef<
    // node: ox/oy=抓取点与节点中心的世界坐标偏移(保持不跳)；cx/cy=按下时屏幕坐标(判断是否越过拖动阈值)
    | { kind: "node"; id: string; moved: boolean; ox: number; oy: number; cx: number; cy: number }
    | { kind: "pan"; sx: number; sy: number; ox: number; oy: number }
    | null
  >(null);
  const viewRef = useRef({ x: 0, y: 0, k: 1 }); // 画布平移(x,y)+缩放(k)，滚轮缩放/拖背景平移
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null); // 外层容器(定位浮动详情卡)
  const tipRef = useRef<HTMLDivElement | null>(null); // 浮动详情卡 DOM(跟随鼠标，直接改 style 不触发重渲染)
  const cursorRef = useRef({ x: 0, y: 0 }); // 最近一次鼠标在容器内的相对坐标
  // 悬停(hover)优先显示，其次是点击固定(pinned)的详情
  const [hover, setHover] = useState<{ kind: "node" | "edge"; id: string } | null>(null);
  const [pinInfo, setPinInfo] = useState<{ kind: "node" | "edge"; id: string } | null>(null);
  const [, forceRender] = useState(0);
  const seedRef = useRef(12345);
  const rnd = () => {
    seedRef.current = (seedRef.current * 1103515245 + 12345) & 0x7fffffff;
    return seedRef.current / 0x7fffffff;
  };
  // 同步节点集合到位置表(新节点随机撒点,消失的删掉)
  useEffect(() => {
    const pos = posRef.current;
    const ids = new Set(nodes.map((n) => n.id));
    for (const id of [...pos.keys()]) if (!ids.has(id)) pos.delete(id);
    for (const n of nodes)
      if (!pos.has(n.id))
        pos.set(n.id, { x: W / 2 + (rnd() - 0.5) * 500, y: H / 2 + (rnd() - 0.5) * 380, vx: 0, vy: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);
  // 力模拟:概念面板打开时持续跑,边跑边渲染
  useEffect(() => {
    let raf = 0;
    let alive = true;
    const tick = () => {
      const pos = posRef.current;
      const arr = nodes.map((n) => pos.get(n.id)).filter(Boolean) as {
        x: number;
        y: number;
        vx: number;
        vy: number;
      }[];
      const N = arr.length;
      for (let i = 0; i < N; i++)
        for (let j = i + 1; j < N; j++) {
          const a = arr[i];
          const b = arr[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy || 0.01;
          const d = Math.sqrt(d2);
          const f = 7000 / d2;
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
      for (const e of edges) {
        const a = pos.get(e.from);
        const b = pos.get(e.to);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const f = (d - 130) * 0.02;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
      for (const n of nodes) {
        const p = pos.get(n.id);
        if (!p) continue;
        const dr = dragRef.current;
        if ((dr?.kind === "node" && dr.id === n.id) || pinnedRef.current.has(n.id)) {
          // 正在拖 或 已钉住：位置固定，只清速度(仍对别的节点施加斥力/弹簧)
          p.vx = 0;
          p.vy = 0;
          continue;
        }
        p.vx += (W / 2 - p.x) * 0.0015;
        p.vy += (H / 2 - p.y) * 0.0015;
        p.vx *= 0.9;
        p.vy *= 0.9;
        p.x += p.vx;
        p.y += p.vy;
        p.x = Math.max(24, Math.min(W - 24, p.x));
        p.y = Math.max(24, Math.min(H - 24, p.y));
      }
      forceRender((t) => (t + 1) & 0xffff);
      if (alive) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [nodes, edges]);
  const toVB = (cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((cx - r.left) / r.width) * W, y: ((cy - r.top) / r.height) * H };
  };
  // 拖拽:全局监听 move/up；未移动即视为点击=选中
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const vb = toVB(e.clientX, e.clientY);
      if (d.kind === "node") {
        // 越过 3px 才算拖动，避免手抖把点击误判成拖拽(否则点不动就选不中)
        if (!d.moved && Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < 3) return;
        d.moved = true;
        const p = posRef.current.get(d.id);
        if (p) {
          const view = viewRef.current;
          // 屏幕→世界坐标(去掉平移/缩放)，再加抓取偏移：节点跟随光标移动的距离，而不是把中心吸到光标
          p.x = (vb.x - view.x) / view.k + d.ox;
          p.y = (vb.y - view.y) / view.k + d.oy;
          p.vx = 0;
          p.vy = 0;
        }
      } else {
        viewRef.current.x = d.ox + (vb.x - d.sx); // 平移画布
        viewRef.current.y = d.oy + (vb.y - d.sy);
      }
    };
    const up = () => {
      const d = dragRef.current;
      if (d && d.kind === "node") {
        if (d.moved) {
          pinnedRef.current.add(d.id); // 拖动过=钉住，之后力学不再拉走
          forceRender((t) => (t + 1) & 0xffff);
        } else {
          onSelect(d.id); // 未移动=点击=选中(联动右侧编辑)
          setPinInfo({ kind: "node", id: d.id }); // 并固定详情卡展示全内容
        }
      }
      dragRef.current = null;
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSelect]);
  // 滚轮缩放(以光标为中心)。用原生非被动监听才能 preventDefault、不连带滚动设置面板。
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const vb = toVB(e.clientX, e.clientY);
      const v = viewRef.current;
      const wx = (vb.x - v.x) / v.k;
      const wy = (vb.y - v.y) / v.k;
      const k = Math.max(0.25, Math.min(5, v.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      v.k = k;
      v.x = vb.x - wx * k;
      v.y = vb.y - wy * k;
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 在空白处按下=开始平移画布；同时收起点击固定的详情卡
  const onBgDown = (e: React.MouseEvent) => {
    const vb = toVB(e.clientX, e.clientY);
    const v = viewRef.current;
    dragRef.current = { kind: "pan", sx: vb.x, sy: vb.y, ox: v.x, oy: v.y };
    setPinInfo(null);
  };
  const color = (type: string) => {
    let h = 0;
    for (const c of type) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
    return `hsl(${h % 360}, 60%, 55%)`;
  };
  // 鼠标在容器内移动:记录相对坐标并让详情卡跟随光标(直接改 DOM，避免高频重渲染)
  const onWrapMove = (e: React.MouseEvent) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    cursorRef.current = { x, y };
    positionTip(x, y, r.width, r.height);
  };
  const positionTip = (x: number, y: number, w: number, h: number) => {
    const tip = tipRef.current;
    if (!tip) return;
    const tw = tip.offsetWidth || 240;
    const th = tip.offsetHeight || 120;
    let lx = x + 16;
    let ly = y + 16;
    if (lx + tw > w) lx = Math.max(4, x - tw - 16);
    if (ly + th > h) ly = Math.max(4, h - th - 4);
    tip.style.left = lx + "px";
    tip.style.top = ly + "px";
  };
  // 详情卡出现/切换目标时，用最近光标位置摆好(点击固定时光标可能不在动)
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const { x, y } = cursorRef.current;
    positionTip(x, y, r.width, r.height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover, pinInfo]);

  const pos = posRef.current;
  const maxW = Math.max(1, ...nodes.map((n) => n.weight || 1));
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const info = hover || pinInfo; // 悬停优先，其次点击固定
  const infoNode = info?.kind === "node" ? byId.get(info.id) : undefined;
  const infoEdge = info?.kind === "edge" ? edges.find((e) => e.id === info.id) : undefined;
  const fmtTime = (t?: number) => {
    if (!t) return "";
    const d = new Date(t);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", width: "100%", height: "100%" }}
      onMouseMove={onWrapMove}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseDown={onBgDown}
        style={{ width: "100%", height: "100%", display: "block", cursor: "grab", userSelect: "none" }}
      >
        <g transform={`translate(${viewRef.current.x},${viewRef.current.y}) scale(${viewRef.current.k})`}>
          {edges.map((e, i) => {
            const a = pos.get(e.from);
            const b = pos.get(e.to);
            if (!a || !b) return null;
            const on = info?.kind === "edge" && info.id === e.id;
            return (
              <g key={e.id || "e" + i}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={on ? "var(--accent, #e0533d)" : "var(--border-strong, #bbb)"} strokeWidth={on ? 2 : 1} opacity={on ? 0.9 : 0.5} />
                {/* 透明加粗命中线:让又细又斜的边也好悬停/点击 */}
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="transparent"
                  strokeWidth={14}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHover({ kind: "edge", id: e.id })}
                  onMouseLeave={() => setHover((h) => (h?.kind === "edge" && h.id === e.id ? null : h))}
                  onMouseDown={(ev) => {
                    ev.stopPropagation(); // 别触发背景平移
                    setPinInfo({ kind: "edge", id: e.id });
                  }}
                />
                <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} fontSize={9} fill="var(--text-2, #999)" textAnchor="middle" style={{ pointerEvents: "none" }}>
                  {e.relation}
                </text>
              </g>
            );
          })}
          {nodes.map((n) => {
            const p = pos.get(n.id);
            if (!p) return null;
            const r = 6 + (Math.min(n.weight, maxW) / maxW) * 10;
            const sel = n.id === selectedId;
            const on = info?.kind === "node" && info.id === n.id;
            const pinned = pinnedRef.current.has(n.id);
            return (
              <g
                key={n.id}
                transform={`translate(${p.x},${p.y})`}
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  ev.stopPropagation(); // 别冒泡到背景平移，否则拖节点变成拖画布
                  const vb = toVB(ev.clientX, ev.clientY);
                  const view = viewRef.current;
                  // 记录抓取点相对节点中心的偏移(世界坐标)：拖动时保持这个偏移，节点不跳
                  const ox = p.x - (vb.x - view.x) / view.k;
                  const oy = p.y - (vb.y - view.y) / view.k;
                  dragRef.current = { kind: "node", id: n.id, moved: false, ox, oy, cx: ev.clientX, cy: ev.clientY };
                }}
                onDoubleClick={(ev) => {
                  ev.stopPropagation();
                  pinnedRef.current.delete(n.id); // 双击解除固定，节点重回力学布局
                  forceRender((t) => (t + 1) & 0xffff);
                }}
                onMouseEnter={() => setHover({ kind: "node", id: n.id })}
                onMouseLeave={() => setHover((h) => (h?.kind === "node" && h.id === n.id ? null : h))}
                style={{ cursor: "pointer" }}
              >
                {pinned && <circle r={r + 4} fill="none" stroke="var(--accent, #e0533d)" strokeWidth={1} strokeDasharray="2 2" opacity={0.7} />}
                <circle r={r} fill={color(n.type)} stroke={sel || on ? "var(--accent, #e0533d)" : "#fff"} strokeWidth={sel || on ? 3 : 1.2} />
                <text y={r + 12} fontSize={11} fill="var(--text, #333)" textAnchor="middle" fontWeight={sel ? 700 : 400} style={{ pointerEvents: "none" }}>
                  {n.name}
                </text>
              </g>
            );
          })}
        </g>
        {nodes.length === 0 && (
          <text x={W / 2} y={H / 2} fontSize={16} fill="var(--text-2, #999)" textAnchor="middle">
            {makeT(getLang())("set.brain.graphEmpty")}
          </text>
        )}
      </svg>

      {/* 浮动详情卡:悬停即显，点击节点/边固定；pointerEvents:none 不挡鼠标避免闪烁 */}
      {info && (infoNode || infoEdge) && (
        <div
          ref={tipRef}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            maxWidth: 300,
            pointerEvents: "none",
            background: "var(--panel, #fff)",
            color: "var(--text, #222)",
            border: "1px solid var(--border, #ddd)",
            borderRadius: 8,
            boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
            padding: "10px 12px",
            fontSize: 12,
            lineHeight: 1.5,
            zIndex: 20,
            whiteSpace: "normal",
            wordBreak: "break-word",
          }}
        >
          {infoNode && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: color(infoNode.type), flex: "0 0 auto" }} />
                <span style={{ fontWeight: 700, fontSize: 13 }}>{infoNode.name}</span>
                <span style={{ color: "var(--text-2, #888)" }}>{infoNode.type}</span>
              </div>
              {infoNode.summary && <div style={{ marginBottom: 4 }}>{infoNode.summary}</div>}
              {infoNode.aliases?.length > 0 && (
                <div style={{ color: "var(--text-2, #888)", marginBottom: 4 }}>{makeT(getLang())("brain.info.aliases", tr("ui.app.message.dbdd6e5356"))}{tr("ui.app.text.7f29e73")}{infoNode.aliases.join(tr("ui.index.text.6486d4e"))}</div>
              )}
              {Object.keys(infoNode.attrs || {}).length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  {Object.entries(infoNode.attrs).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", gap: 6 }}>
                      <span style={{ color: "var(--text-2, #888)", flex: "0 0 auto" }}>{k}</span>
                      <span>{v}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ color: "var(--text-2, #888)", fontSize: 11 }}>
                {tr("ui.app.weight.hits.48e21b3", { p0: infoNode.weight, p1: infoNode.hits })}
                {infoNode.updatedAt ? (tr("ui.app.updated.61cf84e", { p0: fmtTime(infoNode.updatedAt) })) : ""}
              </div>
              {pinInfo?.kind === "node" && !hover && (
                <div style={{ color: "var(--text-2, #aaa)", fontSize: 11, marginTop: 4 }}>{tr("ui.app.drag.to.reposition.pin.double.click.5481948")}</div>
              )}
            </>
          )}
          {infoEdge && (
            <>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                {byId.get(infoEdge.from)?.name || infoEdge.from}
                <span style={{ color: "var(--accent, #e0533d)" }}> ──{infoEdge.relation}→ </span>
                {byId.get(infoEdge.to)?.name || infoEdge.to}
              </div>
              <div style={{ color: "var(--text-2, #888)", marginBottom: 4 }}>{tr("ui.app.relation.2715b83")}{infoEdge.relation}</div>
              <div style={{ color: "var(--text-2, #888)", fontSize: 11 }}>
                {tr("ui.app.weight.hits.48e21b3", { p0: infoEdge.weight, p1: infoEdge.hits })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function LockGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4, flex: "0 0 auto", opacity: 0.75 }} aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
function SettingsModal({
  onClose,
  userId,
  onHostedModels,
  catalog,
  liveModels,
  initialTab,
  executionMode,
  onExecutionMode,
  groupMode,
  onGroupMode,
  streamMode,
  streamSpeed,
  onStream,
  keepRecent,
  onKeepRecent,
  watchdogInterval,
  watchdogIdle,
  onWatchdog,
  showEffortPicker,
  onShowEffortPicker,
  lang,
  onLang,
  t,
  askToastAuto,
  askToastSec,
  onAskToast,
  onTeamEnabled,
}: {
  onClose: () => void;
  userId?: string;
  onHostedModels: (providerId: string) => void;
  catalog: CatalogProviderDto[] | null;
  liveModels: Record<string, string[]>;
  initialTab?: string;
  executionMode: ExecutionMode;
  onExecutionMode: (mode: ExecutionMode) => void;
  groupMode: "manual" | "date" | "project";
  onGroupMode: (m: "manual" | "date" | "project") => void;
  streamMode: "typewriter" | "stream" | "instant";
  streamSpeed: number;
  onStream: (mode: "typewriter" | "stream" | "instant", speed: number) => void;
  keepRecent: number;
  onKeepRecent: (n: number) => void;
  watchdogInterval: number;
  watchdogIdle: number;
  onWatchdog: (interval: number, idle: number) => void;
  showEffortPicker: boolean;
  onShowEffortPicker: (v: boolean) => void;
  lang: Lang;
  onLang: (l: Lang) => void;
  t: T;
  askToastAuto: boolean;
  askToastSec: number;
  onAskToast: (auto: boolean, sec: number) => void;
  onTeamEnabled: (v: boolean) => void; // 「AI 员工团队」开关：本组件够不着主区的 appView，回调给主组件同步侧边栏入口
}) {
  // 上下文压缩·token/消息条数阈值：本地暂存 + 挂载时从 settings 载入，onChange 走独立 IPC(setCompact)
  const [compThr, setCompThr] = useState(""); // token 阈值(空=自动，按模型上下文80%)
  const [compMsgThr, setCompMsgThr] = useState(""); // 消息条数阈值(空/0=关，只按 token)
  useEffect(() => {
    window.wuwei.getSettings().then((r: any) => {
      const ct = Number(r?.settings?.compactThreshold); if (Number.isFinite(ct) && ct > 0) setCompThr(String(ct));
      const cm = Number(r?.settings?.compactMsgThreshold); if (Number.isFinite(cm) && cm > 0) setCompMsgThr(String(cm));
    });
  }, []);
  // 会话提醒(自动消失/倒计时)：本页先暂存草稿,点「保存」才提交——走独立 IPC(setAskToast),
  // 与模型/凭证的大配置(settings:set)分开落盘、互不覆盖。弹窗每次开都重新挂载,草稿从 props 初始化=最新已存值。
  const [toastAutoDraft, setToastAutoDraft] = useState(askToastAuto);
  const [toastSecDraft, setToastSecDraft] = useState(askToastSec);
  const [pid, setPid] = useState("wuwei-free");
  const [model, setModel] = useState(PRESETS[0].models[0]);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [oauthToken, setOauthToken] = useState("");
  const [nickname, setNickname] = useState("");
  const [customModel, setCustomModel] = useState(false);
  const [modelError, setModelError] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [claudeBusy, setClaudeBusy] = useState(false); // Claude 一键授权进行中
  const [sCodexBusy, setSCodexBusy] = useState(false); // 设置里 Codex 一键授权进行中
  const [sysPrompt, setSysPrompt] = useState(""); // 系统提示词(可编辑)
  const [sysPromptDefault, setSysPromptDefault] = useState(""); // 中文默认模板
  const [sysPromptDefaultEn, setSysPromptDefaultEn] = useState(""); // 英文默认模板(随界面语言实时切)
  const [sysPromptTouched, setSysPromptTouched] = useState(false); // 是否自定义过(否则存 undefined=用默认)
  // 脑网络说明提示词(脑网络页「提示词」视图查看/编辑) + 密钥说明提示词(密钥页查看/编辑)
  const [brainView, setBrainView] = useState<"graph" | "prompt">("graph"); // 脑网络页：可视化 / 提示词
  const [brainPrompt, setBrainPrompt] = useState("");
  const [brainPromptDefault, setBrainPromptDefault] = useState("");
  const [brainPromptDefaultEn, setBrainPromptDefaultEn] = useState("");
  const [brainPromptTouched, setBrainPromptTouched] = useState(false);
  const [secretsPrompt, setSecretsPrompt] = useState("");
  const [secretsPromptDefault, setSecretsPromptDefault] = useState("");
  const [secretsPromptDefaultEn, setSecretsPromptDefaultEn] = useState("");
  const [secretsPromptTouched, setSecretsPromptTouched] = useState(false);
  const [platPromptOn, setPlatPromptOn] = useState(false); // 当前平台是否用专属提示词覆盖全局
  const [platPrompt, setPlatPrompt] = useState(""); // 当前平台专属提示词内容
  const [sKeyWaiting, setSKeyWaiting] = useState(false); // 设置里：已开官网，等复制 key 自动检测
  const [sKeyMsg, setSKeyMsg] = useState(""); // key 验证内联反馈
  const sLastClipRef = useRef(""); // 设置里剪贴板去重
  const sKeyTestingRef = useRef(false); // 设置里防并发验证
  const [sAwaitCode, setSAwaitCode] = useState(false); // 设置里浏览器授权：等回填授权码
  const [sCode, setSCode] = useState(""); // 设置里授权码输入
  const [creds, setCreds] = useState<Record<string, CredSlot>>({}); // 各平台凭证分槽
  const credsRef = useRef(creds); // 镜像最新 creds，避免切换时读到过时闭包(会误显示空 key→保存覆盖)
  // ── 文档冷存储（知识宫殿等）──
  const [docStat, setDocStat] = useState<{ chunks: number; files: number; dir: string; builtAt: number }>({ chunks: 0, files: 0, dir: "", builtAt: 0 });
  // 默认目录跟随界面语言：英文界面别塞中文路径
  const [docDir, setDocDir] = useState(tr("ui.app.documents.knowledge.efc5cd1"));
  const [docBuilding, setDocBuilding] = useState(false);
  const [docProg, setDocProg] = useState("");
  credsRef.current = creds;
  const loadedRef = useRef<any>({}); // 保存加载时的完整 settings，保存时 spread 保留 theme/app 等本页不管的字段
  // 三个应用级开关(app.*)：undefined 一律视为「开」，保持历史默认；改动即时落盘+热更(走独立 settings:set-app，不重启 provider)
  const [secretsDetect, setSecretsDetect] = useState(true); // 发送前扫描/拦截疑似新密钥
  const [brainOn, setBrainOn] = useState(true); // 启用本地脑网络 Brain
  const [brainDocsOn, setBrainDocsOn] = useState(true); // recall 连带扫描『相关文档』
  const [resumeDetect, setResumeDetect] = useState(true); // 启动时检测被中断/干到一半的任务并提示恢复
  const [claudeAutoRefresh, setClaudeAutoRefresh] = useState(true); // Claude 订阅 token 快过期自动续期
  const [telemetry, setTelemetry] = useState(true); // 发送诊断信息用于改善体验(默认开，可关)
  const [teamOn, setTeamOn] = useState(false); // 「AI 员工团队」可选模块：默认关，用户主动开(与上面几个默认开的相反)
  const [remoteOn, setRemoteOn] = useState(false); // 允许手机端远程调用本机：默认关，用户主动开(开了才连relay、本机才在手机"在线设备"里)
  const [remoteShareSub, setRemoteShareSub] = useState(false); // 同步本机订阅版模型给手机：默认关
  const [remoteDeviceName, setRemoteDeviceName] = useState(""); // 设备名(手机端显示)；空=用主机名
  const setAppToggle = (patch: Record<string, boolean>) => {
    const cur = loadedRef.current || {};
    loadedRef.current = { ...cur, app: { ...(cur.app || {}), ...patch } }; // 同步本地，避免后续「保存」把开关刷回
    window.wuwei.setAppSettings(patch);
    // 设置项变更埋点：改了哪个开关、开还是关（用于分析用户在设置里动了什么）
    for (const [key, value] of Object.entries(patch)) void window.wuwei.track?.("setting_change", { key, value });
  };
  const [stations, setStations] = useState<Station[]>([]); // 自定义中转站
  const [newStName, setNewStName] = useState(""); // 新增中转站：名称
  const [newStUrl, setNewStUrl] = useState(""); // 新增中转站：baseURL
  const [newModelName, setNewModelName] = useState(""); // 给当前平台手动加模型：输入框
  const [editStationId, setEditStationId] = useState<string | null>(null); // 非空=编辑该中转站(改名/改URL)，空=新增
  const [newStRelay, setNewStRelay] = useState(false); // 新增/编辑：类型 false=自建供应商 true=中转站(仅影响显示后缀/用途说明)
  const [showAddStation, setShowAddStation] = useState(false); // 添加中转站独立弹窗
  const stationsRef = useRef(stations);
  stationsRef.current = stations;
  const [order, setOrder] = useState<string[]>([]); // 平台自定义顺序(全量 id 列表)
  const [hidden, setHidden] = useState<string[]>([]); // 隐藏的平台
  const orderRef = useRef(order);
  orderRef.current = order;
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const [removed, setRemoved] = useState<string[]>([]); // 已删除的平台(含内置)
  const removedRef = useRef(removed);
  removedRef.current = removed;
  const [overrides, setOverrides] = useState<Record<string, { label?: string; baseUrl?: string }>>({}); // 改名/改端点
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  const [editIsBuiltin, setEditIsBuiltin] = useState(false); // 编辑对象是否内置平台(内置只改名)
  const [dragOverIdx, setDragOverIdx] = useState(-1); // 拖拽悬停到第几行(高亮)
  const dragIdxRef = useRef(-1); // 拖起始行
  const [tab, setTab] = useState<
    "general" | "team" | "remote" | "model" | "platforms" | "prompt" | "memory" | "brain" | "mcp" | "tools" | "secrets"
  >((initialTab as any) || "model"); // 设置分块标签页(左侧菜单)
  const [maxed, setMaxed] = useState(false); // 设置弹窗最大化(脑网络等大结构需放大看)
  const [memory, setMemory] = useState(""); // 全局长期记忆
  const memoryTouchedRef = useRef(false); // 是否改过记忆(保存时才写)
  // ── 本地脑网络 Brain ──
  const [brainNodes, setBrainNodes] = useState<import("./env").BrainNodeLite[]>([]);
  const [brainEdges, setBrainEdges] = useState<import("./env").BrainEdgeLite[]>([]);
  const [brainStat, setBrainStat] = useState<{ nodes: number; edges: number; embedded: number }>({ nodes: 0, edges: 0, embedded: 0 });
  const [brainFilter, setBrainFilter] = useState(""); // 概念列表过滤
  const [brainSel, setBrainSel] = useState<string | null>(null); // 选中编辑的节点 id
  const [brainDraft, setBrainDraft] = useState<import("./env").BrainNodeLite | null>(null); // 编辑草稿
  const [brainLeftOpen, setBrainLeftOpen] = useState(true); // 左侧概念列表：可收起给图谱腾地方
  const [brainRightOpen, setBrainRightOpen] = useState(true); // 右侧详情编辑：可收起(选中仍在，收成小条)
  const [brainRecallQ, setBrainRecallQ] = useState(""); // 检索测试输入
  const [brainRecallOut, setBrainRecallOut] = useState(""); // 检索测试结果
  const [brainWarming, setBrainWarming] = useState(false); // 模型预热中
  const [brainWarmMsg, setBrainWarmMsg] = useState(""); // 预热结果提示
  const [conExtract, setConExtract] = useState<{ running: boolean; phase: string; total: number; done: number; created: number; cur?: string } | null>(null); // 概念抽取进度
  const [brainNewEdge, setBrainNewEdge] = useState({ relation: "", to: "" }); // 给选中节点加关系
  const reloadBrain = () =>
    Promise.all([window.wuwei.brainGraph(), window.wuwei.brainStats()]).then(([g, st]) => {
      setBrainNodes(g.nodes);
      setBrainEdges(g.edges);
      setBrainStat(st);
    });
  const [mcpConfig, setMcpConfig] = useState(""); // MCP 服务器配置(JSON，源真相)
  const [mcpStatus, setMcpStatus] = useState<
    { name: string; status: string; error: string; disabled?: boolean; toolInfos?: { name: string; description: string }[] }[]
  >([]);
  const mcpTouchedRef = useRef(false);
  const [mcpSearch, setMcpSearch] = useState(""); // 搜索(过滤已装+目录+在线库)
  const [mcpExpanded, setMcpExpanded] = useState<string | null>(null); // 展开看工具的服务器
  const [mcpRawEdit, setMcpRawEdit] = useState(false); // 高级：直接编辑 JSON
  const [mcpEdit, setMcpEdit] = useState<string | null>(null); // 就地编辑配置的服务器
  const [mcpEditArgs, setMcpEditArgs] = useState<string[]>([]); // 完整 args(写回用)
  const [mcpEditEnvMap, setMcpEditEnvMap] = useState<Record<string, string>>({}); // 完整 env(写回用)
  // 只展示这些可配置字段(带说明)，其余固定参数隐藏
  const [mcpEditFields, setMcpEditFields] = useState<
    { label: string; hint: string; kind: "arg" | "env"; idx?: number; key?: string }[]
  >([]);
  type RegItem = {
    name: string;
    fullName: string;
    description: string;
    command: string;
    args: string[];
    repo: string;
    version: string;
  };
  const [mcpOnline, setMcpOnline] = useState<RegItem[]>([]);
  const [mcpCursor, setMcpCursor] = useState(""); // 下一页游标
  const [mcpSearching, setMcpSearching] = useState(false);
  const [mcpLoadingMore, setMcpLoadingMore] = useState(false);
  const [mcpOnlineOpen, setMcpOnlineOpen] = useState<string | null>(null); // 展开详情的在线结果
  const mcpSearchRef = useRef(""); // 当前搜索词(翻页时校验没变)
  // ── 工具面板：当前生效的全部工具（按来源分组）──
  type ToolInfo = { name: string; description: string; readOnly: boolean; inputSchema: any };
  type ToolGroup = { source: string; kind: "builtin" | "browser" | "mcp"; tools: ToolInfo[] };
  const [rawToolGroups, setToolGroups] = useState<ToolGroup[]>([]);
  const toolGroups = localizeToolGroups(rawToolGroups, lang);
  const [toolTotal, setToolTotal] = useState(0);
  const [toolView, setToolView] = useState<"list" | "json">("list"); // 列表 / JSON 视图
  const [toolSel, setToolSel] = useState<ToolInfo | null>(null); // 点开看详情的工具
  const [toolFilter, setToolFilter] = useState(""); // 工具名/描述过滤
  // 切到「工具」页时拉一次当前工具集
  useEffect(() => {
    if (tab !== "tools") return;
    window.wuwei.getTools().then((r) => {
      setToolGroups(r.groups);
      setToolTotal(r.total);
    });
  }, [tab, lang]);
  // 切到「脑网络」页时拉一次图谱 + 文档库统计，并监听建索引/概念抽取进度。
  // 关键：主进程是进度真相源——重开设置时先查一次当前状态回填，避免"关了再开状态就没了"。
  useEffect(() => {
    if (tab !== "brain") return;
    reloadBrain();
    window.wuwei.brainDocStats().then((s) => {
      setDocStat(s);
      if (s.dir) setDocDir(s.dir);
    });
    // 回填：索引是否正在构建 + 向量模型是否已就绪 + 概念抽取是否在跑
    window.wuwei.brainDocProgress().then((d) => {
      if (d?.building) {
        setDocBuilding(true);
        setDocProg(
          d.phase === "scan"
            ? (tr("ui.app.found.docs.vectorizing.85161cb", { p0: d.files }))
            : (tr("ui.app.vectorizing.chunks.c7f63ec", { p0: d.done, p1: d.total })),
        );
      }
    });
    window.wuwei.brainEmbedReady().then((r) => {
      if (r) setBrainWarmMsg(tr("set.brain.warmOk"));
    });
    window.wuwei.brainConceptProgress().then((c) => setConExtract(c));
    const off = window.wuwei.onEvent((ch, p) => {
      if (ch === "evt:brain-docs") {
        const d = p as { building?: boolean; phase: string; files?: number; total?: number; done?: number };
        if (d.phase === "scan") setDocProg(tr("ui.app.found.docs.vectorizing.85161cb", { p0: d.files }));
        else if (d.phase === "embed") setDocProg(tr("ui.app.vectorizing.chunks.c7f63ec", { p0: d.done, p1: d.total }));
        else if (d.phase === "done") {
          setDocProg(tr("ui.app.done.chunks.total.a4ca753", { p0: d.total }));
          setDocBuilding(false);
          window.wuwei.brainDocStats().then(setDocStat);
        } else if (d.phase === "error") {
          setDocProg(tr("ui.app.build.failed.54b069f"));
          setDocBuilding(false);
        }
      } else if (ch === "evt:brain-concepts") {
        const c = p as { running: boolean; phase: string; total: number; done: number; created: number; cur?: string };
        setConExtract(c);
        if (!c.running) reloadBrain(); // 抽完刷新概念/关系数
      }
    });
    return off;
  }, [tab]);
  // ── 密钥管理器 ──
  type SecretRow = { id: string; name: string; envVar: string; masked: string; note?: string; createdAt: number };
  const [secrets, setSecrets] = useState<SecretRow[]>([]);
  const [secretsAvail, setSecretsAvail] = useState(true);
  const [secNew, setSecNew] = useState({ name: "", envVar: "", value: "", note: "" });
  const [secEdit, setSecEdit] = useState<string | null>(null); // 正在编辑的密钥 id
  const [secEditDraft, setSecEditDraft] = useState({ name: "", envVar: "", note: "" });
  const [secMore, setSecMore] = useState(false); // 展开环境变量名/备注(默认收起)
  const [secImportOpen, setSecImportOpen] = useState(false);
  const [secImportText, setSecImportText] = useState("");
  const [secErr, setSecErr] = useState("");
  // 查看明文:需输入本机账号密码解锁(退出设置即失效——本状态随弹窗卸载清空)
  const [revealed, setRevealed] = useState<Record<string, string> | null>(null);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockPw, setUnlockPw] = useState("");
  const [unlockErr, setUnlockErr] = useState("");
  async function doUnlock() {
    setUnlockErr("");
    const r = await window.wuwei.secretsReveal(unlockPw);
    if (!r.ok) {
      setUnlockErr(r.error || (tr("ui.app.verification.failed.601f440")));
      return;
    }
    const map: Record<string, string> = {};
    for (const it of r.items || []) map[it.id] = it.value;
    setRevealed(map);
    setUnlockOpen(false);
    setUnlockPw("");
  }
  const reloadSecrets = () =>
    window.wuwei.secretsList().then((r) => {
      setSecrets(r.entries);
      setSecretsAvail(r.available);
    });
  useEffect(() => {
    if (tab === "secrets") reloadSecrets();
  }, [tab]);
  async function addSecret() {
    setSecErr("");
    if (!secNew.value.trim()) {
      setSecErr(t("set.sec.needValue"));
      return;
    }
    const r = await window.wuwei.secretsAdd({
      name: secNew.name.trim() || undefined,
      envVar: secNew.envVar.trim() || undefined,
      value: secNew.value,
      note: secNew.note.trim() || undefined,
    });
    if (!r.ok) {
      setSecErr(r.error || (tr("ui.app.add.failed.4bda4aa")));
      return;
    }
    setSecNew({ name: "", envVar: "", value: "", note: "" });
    reloadSecrets();
  }
  async function doImportEnv() {
    const r = await window.wuwei.secretsImportEnv(secImportText);
    if (r.ok) {
      setSecImportText("");
      setSecImportOpen(false);
      reloadSecrets();
    } else setSecErr(r.error || (tr("ui.app.import.failed.8a3942a")));
  }
  // 内置平台 + 中转站(合并成一份预设列表；下拉与查找都用它)
  const allPresets = applyProviderEdits(
    [...mergeCatalogIntoPresets(PRESETS, catalog, new Set(), pid), ...stations.map(stationToPreset)],
    overrides,
    removed,
  );
  const settingsCatalogOrder = catalog?.slice().sort((a, b) => a.sort - b.sort).map(p => p.id);
  const orderedPresets = arrangePresets(allPresets, order, hidden, true, settingsCatalogOrder);
  const preset = allPresets.find((p) => p.id === pid) ?? PRESETS[0];
  // 模型下拉：预设在前(旗舰置顶)+ 平台实时拉到的新模型(liveModels) + 该平台记住/当前选的模型(自建端点等
  // 没有预设列表时也能在下拉里看到并切换)，去重去空。
  const modelOptions = [
    ...new Set(
      [
        ...(preset.models ?? []),
        ...(creds[pid]?.customModels ?? []), // 用户为该平台手动加的模型
        ...(liveModels[pid] || []),
        creds[pid]?.model,
        model,
      ].filter(Boolean) as string[],
    ),
  ];
  // 给当前平台增/删自定义模型(存进该平台槽的 customModels，保存时随 creds 落盘)
  function addCustomModel(name: string) {
    const m = name.trim();
    if (!m) return;
    const slot = credsRef.current[pid] || {};
    if ((slot.customModels || []).includes(m) || (preset.models || []).includes(m)) {
      setModel(m); // 已在列表→直接选中
      return;
    }
    const next = { ...credsRef.current, [pid]: { ...slot, customModels: [...(slot.customModels || []), m] } };
    credsRef.current = next;
    setCreds(next);
    setModel(m); // 加完即选中
  }
  function delCustomModel(name: string) {
    const slot = credsRef.current[pid] || {};
    const next = {
      ...credsRef.current,
      [pid]: { ...slot, customModels: (slot.customModels || []).filter((x) => x !== name) },
    };
    credsRef.current = next;
    setCreds(next);
    if (model === name) setModel(preset.anon ? 'openrouter-auto-free' : '');
  }
  // 当前「模型」的能力开关(工具调用/看图)：按模型名存 modelCaps[model]，回退旧的平台级(迁移兼容)
  const curCaps: ModelCap =
    creds[pid]?.modelCaps?.[model] || { noTools: creds[pid]?.noTools, vision: creds[pid]?.vision };
  function setModelCap(patch: ModelCap) {
    if (!model) return;
    const slot = credsRef.current[pid] || {};
    const caps = { ...(slot.modelCaps || {}) };
    caps[model] = { ...(caps[model] || { noTools: slot.noTools, vision: slot.vision }), ...patch };
    const next = { ...credsRef.current, [pid]: { ...slot, modelCaps: caps } };
    credsRef.current = next;
    setCreds(next);
  }

  // 把某平台槽里的凭证取出来填进字段(没存过就空/回退默认 baseUrl)
  function slotFields(c: Record<string, CredSlot>, id: string, p: Preset) {
    const slot = c[id] || {};
    return {
      apiKey: slot.apiKey || "",
      // 固定端点的平台始终用预设 baseUrl，忽略旧存值(避免端点迁移后残留旧地址连不上)
      baseUrl: p.fixedBaseUrl ? p.baseUrl : slot.baseUrl || p.baseUrl,
      oauthToken: slot.oauthToken || "",
      nickname: slot.nickname || "",
      systemPrompt: slot.systemPrompt, // string=有专属覆盖 / undefined=跟随全局
      model: slot.model || "", // 该平台记住的模型(空=用预设默认)
      noTools: !!slot.noTools, // 该平台/模型不发 tools 参数
      vision: !!slot.vision, // 该平台/模型强制看图
    };
  }

  // 语言切换时，记忆里的默认种子头 # 记忆/# Memory 跟着换（用户内容不动）
  useEffect(() => {
    setMemory((cur) => swapMemHeader(cur, lang));
  }, [lang]);
  // 语言切换时，未自定义的「默认提示词」跟着切中英（系统/脑网络/密钥三段）
  useEffect(() => {
    if (!sysPromptTouched && sysPromptDefaultEn) setSysPrompt(tr("agent.defaultPrompt", {}, lang));
    if (!brainPromptTouched && brainPromptDefaultEn) setBrainPrompt(tr("agent.brainNote", {}, lang));
    if (!secretsPromptTouched && secretsPromptDefaultEn) setSecretsPrompt(tr("agent.secretsNote", systemData.secretDelimiters, lang));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);
  useEffect(() => {
    window.wuwei.getMemory().then((m) => setMemory(swapMemHeader(m || "", lang)));
    window.wuwei.getMcp().then((r) => {
      const mig = migrateMcpDefaults(r?.config || "");
      setMcpConfig(mig.text);
      setMcpStatus(r?.status || []);
      if (mig.changed) {
        window.wuwei.setMcp(mig.text); // 自动把旧占位补默认值→重连(sqlite等直接可用)
        setTimeout(() => window.wuwei.getMcp().then((x) => setMcpStatus(x?.status || [])), 2800);
      }
    });
  }, []);
  const reloadMcpStatus = () => window.wuwei.getMcp().then((r) => setMcpStatus(r?.status || []));
  // 写回 MCP 配置(标准 {mcpServers}) + 重连 + 稍后刷新状态
  function writeMcp(servers: Record<string, McpServer>) {
    const text = JSON.stringify({ mcpServers: servers }, null, 2);
    setMcpConfig(text);
    mcpTouchedRef.current = false;
    window.wuwei.setMcp(text);
    setMcpStatus((s) => s.map((x) => ({ ...x, status: "connecting" }))); // 乐观置连接中
    setTimeout(reloadMcpStatus, 2800);
  }
  function mcpToggle(name: string) {
    const servers = parseMcpServers(mcpConfig);
    if (!servers[name]) return;
    servers[name] = { ...servers[name], disabled: !servers[name].disabled };
    writeMcp(servers);
  }
  function mcpRemove(name: string) {
    const servers = parseMcpServers(mcpConfig);
    delete servers[name];
    writeMcp(servers);
  }
  function mcpInstall(c: { name: string; command: string; args: string[]; env?: Record<string, string> }) {
    const servers = parseMcpServers(mcpConfig);
    servers[c.name] = { command: c.command, args: c.args, ...(c.env ? { env: c.env } : {}) };
    writeMcp(servers);
    // 有占位需填→自动展开就地编辑表单
    if (JSON.stringify(servers[c.name]).includes("<")) startEditMcp(c.name, servers[c.name]);
    else setMcpExpanded(c.name);
  }
  function startEditMcp(name: string, sv?: McpServer) {
    const s = sv || parseMcpServers(mcpConfig)[name];
    if (!s) return;
    const args = [...(s.args || [])];
    const envMap = { ...(s.env || {}) };
    // 优先用目录里定义的可配置字段(带说明)；目录里没有的服务器→回退到检测 <占位>
    const cat = MCP_CATALOG.find((c) => c.name === name);
    const fields: { label: string; hint: string; kind: "arg" | "env"; idx?: number; key?: string }[] = [];
    if (cat?.config) {
      for (const f of cat.config) {
        if ("arg" in f) fields.push({ label: mcpFieldEn(name, "arg" + f.arg, "label", f.label, lang), hint: mcpFieldEn(name, "arg" + f.arg, "hint", f.hint, lang), kind: "arg", idx: f.arg });
        else fields.push({ label: mcpFieldEn(name, f.env, "label", f.label, lang), hint: mcpFieldEn(name, f.env, "hint", f.hint, lang), kind: "env", key: f.env });
      }
    } else {
      args.forEach((a, i) => {
        if (a.includes("<")) fields.push({ label: (tr("ui.app.arg.2d286ab")) + (i + 1), hint: "", kind: "arg", idx: i });
      });
      Object.entries(envMap).forEach(([k, v]) => {
        if (String(v).includes("<")) fields.push({ label: k, hint: "", kind: "env", key: k });
      });
    }
    setMcpEdit(name);
    setMcpEditArgs(args);
    setMcpEditEnvMap(envMap);
    setMcpEditFields(fields);
    setMcpExpanded(null);
  }
  function saveEditMcp(name: string) {
    const servers = parseMcpServers(mcpConfig);
    if (!servers[name]) return;
    servers[name] = {
      ...servers[name],
      args: mcpEditArgs,
      ...(Object.keys(mcpEditEnvMap).length ? { env: mcpEditEnvMap } : {}),
    };
    writeMcp(servers);
    setMcpEdit(null);
  }
  // 在线搜索官方 MCP Registry（防抖 400ms，首页）
  useEffect(() => {
    if (tab !== "mcp") return;
    const q = mcpSearch.trim();
    mcpSearchRef.current = q;
    if (q.length < 2) {
      setMcpOnline([]);
      setMcpCursor("");
      setMcpSearching(false);
      return;
    }
    setMcpSearching(true);
    const t = setTimeout(() => {
      window.wuwei.searchMcp(q).then((r) => {
        if (mcpSearchRef.current !== q) return; // 词已变，丢弃过期结果
        setMcpOnline(r?.results || []);
        setMcpCursor(r?.nextCursor || "");
        setMcpSearching(false);
      });
    }, 400);
    return () => clearTimeout(t);
  }, [mcpSearch, tab]);
  // 下滑翻页：加载下一页并追加
  function loadMoreMcp() {
    const q = mcpSearchRef.current;
    if (!mcpCursor || mcpLoadingMore || q.length < 2) return;
    setMcpLoadingMore(true);
    window.wuwei.searchMcp(q, mcpCursor).then((r) => {
      if (mcpSearchRef.current !== q) {
        setMcpLoadingMore(false);
        return;
      }
      setMcpOnline((prev) => [...prev, ...(r?.results || [])]);
      setMcpCursor(r?.nextCursor || "");
      setMcpLoadingMore(false);
    });
  }

  useEffect(() => {
    window.wuwei.getSettings().then((r) => {
      const s = r?.settings;
      if (!s) return;
      loadedRef.current = s; // 存完整 settings，保存时 spread 保留本页不管的字段
      // 三个应用级开关：undefined 视为开
      setSecretsDetect(s.app?.secretsDetect !== false);
      setBrainOn(s.app?.brainEnabled !== false);
      setBrainDocsOn(s.app?.brainDocs !== false);
      setResumeDetect(s.app?.resumeDetect !== false);
      setClaudeAutoRefresh(s.app?.claudeAutoRefresh !== false);
      setTelemetry(s.app?.telemetry !== false);
      setTeamOn(s.app?.teamEnabled === true); // 可选模块，只有显式为 true 才算开
      setRemoteOn(s.app?.remoteEnabled === true); // 手机远程:默认关,显式true才开
      setRemoteShareSub(s.app?.remoteShareSubscription === true);
      setRemoteDeviceName(s.app?.remoteDeviceName || "");
      const sts: Station[] = s.customStations || [];
      setStations(sts);
      stationsRef.current = sts;
      const ord = s.providerOrder || [];
      setOrder(ord);
      orderRef.current = ord;
      const hid = s.hiddenProviders || [];
      setHidden(hid);
      hiddenRef.current = hid;
      const rmv = (s as any).removedProviders || [];
      setRemoved(rmv);
      removedRef.current = rmv;
      const ovr = (s as any).providerOverrides || {};
      setOverrides(ovr);
      overridesRef.current = ovr;
      const pool = applyProviderEdits([...mergeCatalogIntoPresets(PRESETS, catalog, new Set(), s.providerId), ...sts.map(stationToPreset)], ovr, rmv);
      const p =
        pool.find((x) => x.id === s.providerId) ??
        PRESETS.find((x) => x.kind === s.kind) ??
        PRESETS[0];
      const c: Record<string, CredSlot> = { ...(s.creds || {}) };
      // 兼容旧配置(只有顶层单套凭证)：迁移到当前平台槽
      if (!c[p.id] && (s.apiKey || s.baseUrl || s.oauthToken)) {
        c[p.id] = { apiKey: s.apiKey, baseUrl: s.baseUrl, oauthToken: s.oauthToken };
      }
      setCreds(c);
      credsRef.current = c;
      const f = slotFields(c, p.id, p);
      setPid(p.id);
      // 当前平台的模型：顶层 s.model(上次生效值) 优先，其次槽记住的，再回退预设默认
      const curModel = s.model || f.model || (p.anon ? 'openrouter-auto-free' : '');
      setModel(curModel);
      setApiKey(f.apiKey);
      setBaseUrl(f.baseUrl);
      setOauthToken(f.oauthToken);
      setNickname(f.nickname);
      setPlatPromptOn(typeof f.systemPrompt === "string");
      setPlatPrompt(typeof f.systemPrompt === "string" ? f.systemPrompt : "");
      setCustomModel(!!curModel && !p.models.includes(curModel));
      // 系统提示词：有自定义(含空串)就用它+标记已改；否则显示默认模板(未改，保存时不写入=跟随默认)
      const defZh = r?.defaultPrompt || "";
      const defEn = (r as any)?.defaultPromptEn || defZh;
      setSysPromptDefault(defZh);
      setSysPromptDefaultEn(defEn);
      const def = tr("agent.defaultPrompt", {}, lang); // 按当前界面语言选默认
      if (typeof s.systemPrompt === "string") {
        setSysPrompt(s.systemPrompt);
        setSysPromptTouched(true);
      } else {
        setSysPrompt(def);
        setSysPromptTouched(false);
      }
      // 脑网络说明提示词：有覆盖就用它+标记已改，否则回填默认(未改，保存不写=跟随默认)
      const bDefZh = (r as any)?.defaultBrainPrompt || "";
      const bDefEn = (r as any)?.defaultBrainPromptEn || bDefZh;
      setBrainPromptDefault(bDefZh);
      setBrainPromptDefaultEn(bDefEn);
      if (typeof s.brainPrompt === "string") {
        setBrainPrompt(s.brainPrompt);
        setBrainPromptTouched(true);
      } else {
        setBrainPrompt(tr("agent.brainNote", {}, lang));
        setBrainPromptTouched(false);
      }
      // 密钥说明提示词：同上
      const sDefZh = (r as any)?.defaultSecretsPrompt || "";
      const sDefEn = (r as any)?.defaultSecretsPromptEn || sDefZh;
      setSecretsPromptDefault(sDefZh);
      setSecretsPromptDefaultEn(sDefEn);
      if (typeof s.secretsPrompt === "string") {
        setSecretsPrompt(s.secretsPrompt);
        setSecretsPromptTouched(true);
      } else {
        setSecretsPrompt(tr("agent.secretsNote", systemData.secretDelimiters, lang));
        setSecretsPromptTouched(false);
      }
    });
  }, []);

  function changePreset(id: string) {
    const p = allPresets.find((x) => x.id === id) ??
      PRESETS[0];
    if (p.hosted) { onHostedModels(p.id); return; }
    // 先把当前平台的凭证存回它自己的槽，再从「最新」creds(ref)带出目标平台的槽
    // 用 credsRef 而非闭包 creds：否则连续切换会读到过时值→目标 key 显示空→保存把空覆盖回去
    // 展开原槽保留 avatar/webToken 等本页不管的字段(别切平台就抹掉头像/登录态)
    const merged = {
      ...credsRef.current,
      [pid]: {
        ...(credsRef.current[pid] || {}),
        apiKey,
        baseUrl,
        oauthToken,
        nickname,
        model: model || undefined, // 切走前记住当前平台选的模型
        systemPrompt: platPromptOn ? platPrompt : undefined,
      },
    };
    credsRef.current = merged;
    setCreds(merged);
    const f = slotFields(merged, id, p);
    setPid(id);
    // 优先用目标平台记住的模型，没有才回退到预设默认(不再无脑重置成默认，切回来模型还在)
    const targetModel = f.model || (p.anon ? 'openrouter-auto-free' : '');
    setModel(targetModel);
    setApiKey(f.apiKey);
    setBaseUrl(f.baseUrl);
    setOauthToken(f.oauthToken);
    setNickname(f.nickname);
    setPlatPromptOn(typeof f.systemPrompt === "string");
    setPlatPrompt(typeof f.systemPrompt === "string" ? f.systemPrompt : "");
    setCustomModel(!!targetModel && !p.models.includes(targetModel)); // 记住的模型不在预设列表→自定义输入态
    setShowKey(false);
    setSKeyWaiting(false); // 切平台：清掉上一个平台的 key 自动检测态
    setSKeyMsg("");
  }

  // key/token 只含可见 ASCII：清掉粘贴带进来的空白/非 ASCII 乱码字符(否则网关直接 401)
  const cleanKey = (v: string) => v.replace(/[^\x20-\x7E]/g, "").trim();

  // 测当前所选平台(可能还没生效)时给 testKey 的平台/端点/模型覆盖
  function keyOverride() {
    return {
      provider: preset.kind === "anthropic-apikey" ? "anthropic" : "openai",
      baseUrl: preset.kind === "openai" ? baseUrl.trim() || preset.baseUrl : undefined,
      model: model || undefined,
    };
  }

  // 试一个候选 key：按所选平台测连通，通了就填入+落库(不关弹窗)+内联提示成功
  async function trySettingsKey(candidate: string, silent = false): Promise<boolean> {
    const key = (candidate || "").trim();
    if (!key || sKeyTestingRef.current) return false;
    sKeyTestingRef.current = true;
    if (!silent) setSKeyMsg(tr("ui.app.checking.4186bc8"));
    try {
      const res = await window.wuwei.testKey(key, keyOverride());
      if (res.ok) {
        setApiKey(key);
        persist({ apiKeyOverride: key, close: false }); // 保存但不关，留在弹窗看结果
        setSKeyWaiting(false);
        setSKeyMsg(tr("ui.app.api.key.verified.and.set.ready.94666e1"));
        return true;
      }
      if (keyRejected(res.reason)) {
        if (!silent) setSKeyMsg((tr("ui.app.key.invalid.auth.failed.bd1002d")) + res.reason);
        return false;
      }
      // Key 有效但请求未通过(余额/额度/账单等)：照样保存并提醒
      setApiKey(key);
      persist({ apiKeyOverride: key, close: false });
      setSKeyWaiting(false);
      setSKeyMsg((tr("ui.app.key.saved.valid.but.the.request.05c89ae")) + res.reason);
      return true;
    } finally {
      sKeyTestingRef.current = false;
    }
  }

  // 点「去获取」：开官网 + 进入等待态(启动剪贴板自动检测)
  function startGetKey() {
    if (preset.keyUrl) window.wuwei.openExternal(preset.keyUrl);
    sLastClipRef.current = "";
    setSKeyMsg(tr("ui.app.opened.the.sign.up.page.copy.ce4046f"));
    setSKeyWaiting(true);
  }

  // 等待态：轮询剪贴板，检测到像 key 的新内容就自动验证+设置
  useEffect(() => {
    if (!sKeyWaiting) return;
    const timer = setInterval(async () => {
      if (sKeyTestingRef.current) return;
      const clip = (await window.wuwei.readClipboard()).trim();
      if (!clip || clip === sLastClipRef.current || !isLikelyKey(clip)) return;
      sLastClipRef.current = clip;
      setApiKey(clip);
      await trySettingsKey(clip, true);
    }, 1200);
    return () => clearInterval(timer);
  }, [sKeyWaiting]);

  // 应用内弹窗授权(自行输账号密码)
  async function claudeLoginWindow() {
    if (claudeBusy) return;
    setClaudeBusy(true);
    try {
      const tok = await window.wuwei.claudeLogin();
      if (tok) {
        setOauthToken(tok);
        save(tok);
      } else alert(tr("ui.app.authorization.didn.go.through.cancelled.timed.28df40d"));
    } finally {
      setClaudeBusy(false);
    }
  }

  // 系统浏览器授权 第1步：开浏览器(复用已登录 Google)，进入等回填授权码
  async function claudeOpenBrowser() {
    await window.wuwei.claudeOauthOpen();
    setSCode("");
    setSAwaitCode(true);
  }

  // 系统浏览器授权 第2步：用授权码换 token（留空则自动读剪贴板）
  async function claudeCompleteBrowser() {
    if (claudeBusy) return;
    setClaudeBusy(true);
    try {
      let code = sCode.trim();
      if (!code) code = (await window.wuwei.readClipboard()).trim();
      if (!code) {
        alert(tr("ui.app.no.authorization.code.found.copy.it.b4292a6"));
        return;
      }
      const tok = await window.wuwei.claudeOauthExchange(code);
      if (tok) {
        setSAwaitCode(false);
        setOauthToken(tok);
        save(tok);
      } else alert(tr("ui.app.the.code.is.invalid.or.expired.d67977f"));
    } finally {
      setClaudeBusy(false);
    }
  }

  // 落库(可指定 key/token 覆盖，绕开 setState 异步)；close=false 时保存但不关闭弹窗
  async function persist(opts?: { apiKeyOverride?: string; oauthOverride?: string; close?: boolean }) {
    if (preset.hosted && (pid !== loadedRef.current.providerId || model !== loadedRef.current.model)) {
      onHostedModels(pid); return;
    }
    if (!model.trim()) { setModelError(tr("ui.app.choose.model.before.saving.c33f84e")); return; }
    setModelError('');
    const apiKind = preset.kind === "anthropic-apikey" || preset.kind === "openai";
    const prevSlot = credsRef.current[pid] || {};
    const slot: CredSlot = {
      ...prevSlot, // 保留 avatar/webToken 等本页不动的字段，别保存时抹掉头像/登录态
      // 空则回退到已存的 key/token，绝不用空把原凭证覆盖掉(防误抹)
      apiKey: apiKind
        ? cleanKey(opts?.apiKeyOverride ?? apiKey) || prevSlot.apiKey || undefined
        : undefined,
      baseUrl: preset.kind === "openai" ? baseUrl.trim() || preset.baseUrl : undefined,
      // OAuth Token 只读、由授权流程填入，不存在「误留空」；故清空即真清空(不回退旧值)，
      // 便于过期后手动清掉、改用下方 API Key。授权流程用 oauthOverride 传入新 token。
      oauthToken:
        preset.kind === "anthropic-oauth"
          ? cleanKey(opts?.oauthOverride ?? oauthToken) || undefined
          : undefined,
      nickname: nickname.trim() || prevSlot.nickname || undefined,
      systemPrompt: platPromptOn ? platPrompt : undefined, // 本平台专属提示词(关掉=undefined 跟随全局)
      model: model || prevSlot.model || undefined, // 记住本平台选的模型，切走再切回不丢
      // noTools/vision/modelCaps 由 ...prevSlot 原样保留(按模型存在 modelCaps，切模型时即时更新 creds)
      // 手输的自定义模型自动收进列表(下次在下拉里可选/可删)；预设自带的不入
      customModels: (() => {
        const base = prevSlot.customModels || [];
        return model && !(preset.models || []).includes(model) && !base.includes(model)
          ? [...base, model]
          : base.length
            ? base
            : undefined;
      })(),
    };
    const newCreds = { ...credsRef.current, [pid]: slot }; // 存进当前平台的槽(用最新creds,别丢其它槽)
    // 只发本页负责的字段(模型/凭证/平台/系统提示/中转站)。主进程 settings:set 会合并到磁盘,
    // 其余字段(会话提醒/保留条数/输出方式/主题/app 开关等各走独立 IPC)一律不碰、不覆盖。
    window.wuwei.setSettings({
      kind: preset.kind,
      providerId: pid,
      model: model || undefined,
      ...(userId && model && (pid !== loadedRef.current.providerId || model !== loadedRef.current.model) ? {
        modelChoiceExplicit: true,
        modelPreferences: { ...(loadedRef.current.modelPreferences || {}), [userId]: { providerId: pid, modelId: model } },
      } : {}),
      apiKey: slot.apiKey, // 顶层=当前生效平台的凭证(loadConfig 用)
      baseUrl: slot.baseUrl,
      oauthToken: slot.oauthToken,
      creds: newCreds,
      // 自定义过才写入(含空串=强制空提示词)；没改则留 undefined=跟随默认模板
      systemPrompt: sysPromptTouched ? sysPrompt : undefined,
      customStations: stationsRef.current, // 一并保存中转站列表，别丢
    });
    if (memoryTouchedRef.current) window.wuwei.setMemory(memory); // 手动改过记忆才写盘
    if (mcpTouchedRef.current) window.wuwei.setMcp(mcpConfig); // 改过 MCP 配置才写盘+重连
    if (opts?.close !== false) onClose();
  }

  // 新增中转站：校验 baseURL，落库，选中它
  function addStation() {
    const label = newStName.trim();
    let url = newStUrl.trim();
    if (!label || !url) {
      alert(tr("ui.app.please.fill.in.both.the.relay.2299eee"));
      return;
    }
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const id = "st_" + crypto.randomUUID().slice(0, 8);
    const st: Station = { id, label, baseUrl: url, relay: newStRelay || undefined };
    const next = [...stationsRef.current, st];
    stationsRef.current = next;
    setStations(next);
    setNewStName("");
    setNewStUrl("");
    // 直接切到新站(带出空槽)，并持久化列表；旧平台槽展开保留 model/systemPrompt/avatar 等本页不动的字段
    const merged = {
      ...credsRef.current,
      [pid]: { ...(credsRef.current[pid] || {}), apiKey, baseUrl, oauthToken, nickname, model: model || undefined },
    };
    credsRef.current = merged;
    setCreds(merged);
    setPid(id);
    setModel("");
    setApiKey("");
    setBaseUrl(url);
    setOauthToken("");
    setNickname("");
    setCustomModel(true);
    setShowKey(false);
    setShowAddStation(false); // 关闭添加弹窗
    void persistStationsOnly(next); // 持久化中转站列表
  }

  // 只更新 customStations(不动当前平台选择/凭证)——增删站用
  async function persistStationsOnly(next: Station[]) {
    const r = await window.wuwei.getSettings();
    const s = r?.settings || {};
    window.wuwei.setSettings({ ...s, customStations: next });
  }

  // 打开「编辑供应商」弹窗：自定义站带出名称/URL/类型；内置平台只改名(带出当前显示名)
  function openEditStation(id?: string) {
    const tid = id || pid;
    const st = stationsRef.current.find((x) => x.id === tid);
    if (st) {
      setEditIsBuiltin(false);
      setEditStationId(st.id);
      setNewStName(st.label);
      setNewStUrl(st.baseUrl);
      setNewStRelay(!!st.relay);
      setShowAddStation(true);
      return;
    }
    // 内置平台：只改显示名(端点仍在上一页 Base URL 改)
    const bp = PRESETS.find((x) => x.id === tid);
    if (!bp) return;
    setEditIsBuiltin(true);
    setEditStationId(tid);
    setNewStName(overridesRef.current[tid]?.label ?? pLabel(bp, lang));
    setNewStUrl("");
    setShowAddStation(true);
  }
  // 保存编辑：内置→写 providerOverrides.label；自定义站→改 label/URL/类型
  function saveStationEdit() {
    const label = newStName.trim();
    if (!label) {
      alert(tr("ui.app.please.fill.in.name.ad0f802"));
      return;
    }
    if (editIsBuiltin) {
      const id = editStationId!;
      const bp = PRESETS.find((x) => x.id === id);
      const ovr = { ...overridesRef.current };
      // 与预设原名相同=清掉覆盖(恢复默认名)，否则存 label 覆盖
      if (bp && (label === bp.label || label === pLabel(bp, lang))) delete ovr[id];
      else ovr[id] = { ...(ovr[id] || {}), label };
      overridesRef.current = ovr;
      setOverrides(ovr);
      loadedRef.current = { ...loadedRef.current, providerOverrides: ovr };
      setShowAddStation(false);
      setEditStationId(null);
      setEditIsBuiltin(false);
      void persistProviderMeta({ providerOverrides: ovr });
      return;
    }
    let url = newStUrl.trim();
    if (!url) {
      alert(tr("ui.app.please.fill.in.the.base.url.c99db6a"));
      return;
    }
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const next = stationsRef.current.map((s) =>
      s.id === editStationId ? { ...s, label, baseUrl: url, relay: newStRelay || undefined } : s,
    );
    stationsRef.current = next;
    setStations(next);
    if (pid === editStationId) setBaseUrl(url); // 改的是当前选中站→同步端点输入框
    setShowAddStation(false);
    setEditStationId(null);
    void persistStationsOnly(next);
  }
  // 删除平台：自定义站→删站；内置→加入 removedProviders(可一键恢复)。删到当前平台则切回第一个可用平台
  function deleteProvider(id: string) {
    const isStation = stationsRef.current.some((x) => x.id === id);
    if (isStation) {
      deleteStation(id);
      return;
    }
    const rmv = removedRef.current.includes(id) ? removedRef.current : [...removedRef.current, id];
    removedRef.current = rmv;
    setRemoved(rmv);
    loadedRef.current = { ...loadedRef.current, removedProviders: rmv };
    void persistProviderMeta({ removedProviders: rmv });
    if (pid === id) {
      const fallback = applyProviderEdits([...PRESETS, ...stationsRef.current.map(stationToPreset)], overridesRef.current, rmv)[0];
      if (fallback) changePreset(fallback.id);
    }
  }
  // 一键恢复所有已删除的平台
  function restoreRemovedProviders() {
    removedRef.current = [];
    setRemoved([]);
    loadedRef.current = { ...loadedRef.current, removedProviders: [] };
    void persistProviderMeta({ removedProviders: [] });
  }
  // 拉最新 settings 再合并 removedProviders/providerOverrides(别覆盖本页不管的字段)
  async function persistProviderMeta(patch: { removedProviders?: string[]; providerOverrides?: Record<string, { label?: string; baseUrl?: string }> }) {
    const r = await window.wuwei.getSettings();
    const s = r?.settings || {};
    window.wuwei.setSettings({ ...s, ...patch });
  }

  // 只更新平台顺序/隐藏(拉最新 settings 再合并，避免覆盖本页不管的字段)
  async function persistArrangement(ord: string[], hid: string[]) {
    const r = await window.wuwei.getSettings();
    const s = r?.settings || {};
    window.wuwei.setSettings({ ...s, providerOrder: ord, hiddenProviders: hid });
  }
  function applyOrder(ids: string[]) {
    orderRef.current = ids;
    setOrder(ids);
    loadedRef.current = { ...loadedRef.current, providerOrder: ids }; // 让随后的 save() 不回退
    void persistArrangement(ids, hiddenRef.current);
  }
  // 拖拽：把第 from 行插到第 to 行位置，得到新的全量顺序并落库
  function moveProvider(from: number, to: number) {
    const ids = arrangePresets(allPresets, orderRef.current, hiddenRef.current, true, settingsCatalogOrder).map((p) => p.id);
    if (from < 0 || from >= ids.length || from === to) return;
    const [m] = ids.splice(from, 1);
    ids.splice(to, 0, m);
    applyOrder(ids);
  }
  // 显/隐某平台(当前选中平台不许隐藏，保证切换菜单至少留一项且不锁死自己)
  function toggleHidden(id: string) {
    if (id === pid && !hiddenRef.current.includes(id)) return;
    const set = new Set(hiddenRef.current);
    set.has(id) ? set.delete(id) : set.add(id);
    const next = [...set];
    hiddenRef.current = next;
    setHidden(next);
    loadedRef.current = { ...loadedRef.current, hiddenProviders: next };
    void persistArrangement(orderRef.current, next);
  }

  // 删除中转站
  function deleteStation(id: string) {
    const next = stationsRef.current.filter((s) => s.id !== id);
    stationsRef.current = next;
    setStations(next);
    void persistStationsOnly(next);
    if (pid === id) changePreset(PRESETS[0].id); // 删的是当前选中的→退回默认
  }
  // oauthOverride：一键授权拿到 token 后直接传入保存并关闭
  // 防呆：若被当 onClick 直接调用会收到事件对象，只认字符串，别把事件塞给 cleanKey
  function save(oauthOverride?: string) {
    // 先提交本页暂存的小配置(会话提醒)——走各自独立 IPC,与下面的大配置(模型/凭证)分开落盘、互不覆盖。
    onAskToast(toastAutoDraft, toastSecDraft);
    persist({ oauthOverride: typeof oauthOverride === "string" ? oauthOverride : undefined, close: true });
  }

  return (
    <>
    <div className="perm-overlay settings-overlay">
      <div className={"settings tabbed sidenav" + (maxed ? " maxed" : "")} onClick={(e) => e.stopPropagation()}>
        {/* 左侧竖排菜单 */}
        <aside className="set-side">
          <div className="set-side-title">{t("set.title")}</div>
          <nav className="set-tabs">
          <button type="button" className={"set-tab" + (tab === "general" ? " on" : "")} onClick={() => setTab("general")}>
            {t("set.tab.general")}
          </button>
          {teamOn && (
            <button type="button" className={"set-tab" + (tab === "team" ? " on" : "")} onClick={() => setTab("team")}>
              {t("set.tab.team")}
            </button>
          )}
          <button type="button" className={"set-tab" + (tab === "remote" ? " on" : "")} onClick={() => setTab("remote")}>
            {tr("ui.app.mobile.remote.0b45b14")}
          </button>
          <button type="button" data-testid="settings-tab-model" className={"set-tab" + (tab === "model" ? " on" : "")} onClick={() => setTab("model")}>
            {t("set.tab.model")}
          </button>
          <button type="button" className={"set-tab" + (tab === "platforms" ? " on" : "")} onClick={() => setTab("platforms")}>
            {t("set.tab.platforms")}
          </button>
          <button type="button" className={"set-tab" + (tab === "prompt" ? " on" : "")} onClick={() => setTab("prompt")}>
            {t("set.tab.prompt")}
          </button>
          <button type="button" className={"set-tab" + (tab === "memory" ? " on" : "")} onClick={() => setTab("memory")}>
            {t("set.tab.memory")}
          </button>
          <button
            type="button"
            className={"set-tab" + (tab === "brain" ? " on" : "")}
            onClick={() => setTab("brain")}
          >
            {t("set.tab.brain")}
          </button>
          <button type="button" className={"set-tab" + (tab === "mcp" ? " on" : "")} onClick={() => setTab("mcp")}>
            {t("set.tab.mcp")}
          </button>
          <button type="button" className={"set-tab" + (tab === "tools" ? " on" : "")} onClick={() => setTab("tools")}>
            {t("set.tab.tools")}
          </button>
          <button type="button" className={"set-tab" + (tab === "secrets" ? " on" : "")} onClick={() => setTab("secrets")}>
            {t("set.tab.secrets")}
          </button>
          </nav>
        </aside>

        {/* 右侧主区：头(窗口按钮) + 内容 + 底部保存 */}
        <div className="set-main">
          <div className="set-main-head">
            <div className="settings-winbtns">
              <button
                type="button"
                className="set-win-btn"
                title={maxed ? t("set.win.restore") : t("set.win.maximize")}
                onClick={async () => {
                  const next = !maxed;
                  setMaxed(next);
                  // 进入最大化时,把整个应用窗口也最大化——否则 96vw 弹窗只铺满小窗口、铺不满屏幕
                  if (next && !(await window.wuwei.winIsMaximized?.())) window.wuwei.winMaximize();
                }}
              >
                {maxed ? (
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <rect x="3" y="5" width="8" height="8" rx="1.3" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M5.5 5V3.5A1.2 1.2 0 016.7 2.3H12.5A1.2 1.2 0 0113.7 3.5V9.3A1.2 1.2 0 0112.5 10.5H11" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <rect x="2.8" y="2.8" width="10.4" height="10.4" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                )}
              </button>
              <button type="button" className="set-win-btn" title={t("win.close")} onClick={onClose}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

        <div className="set-body">
          {/* ── 一人公司：CEO 把关 + 拍板倒计时 + 转派链(独立模块，仅模块开启时可见) ── */}
          {tab === "team" && (
            <CompanyTeamSettings
              lang={lang}
              teamOn={teamOn}
              onToggle={(v) => {
                setTeamOn(v);
                setAppToggle({ teamEnabled: v });
                onTeamEnabled(v); // 通知主组件：显隐侧边栏入口、关掉时收起面板
              }}
            />
          )}
          {/* ── 通用：会话分组 + 上下文压缩 + 账号读取 ── */}
          {tab === "general" && (
            <>
              <LanguagePicker language={lang} onChange={onLang}/>
              <div className="app-set-group">{t("set.g.grouping")}</div>
              <div className="theme-pick" style={{ marginBottom: "6px" }}>
                {[
                  { id: "manual", label: t("set.g.manual") },
                  { id: "date", label: t("set.g.byDate") },
                  { id: "project", label: t("set.g.byProject") },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={"theme-opt" + (groupMode === m.id ? " on" : "")}
                    onClick={() => onGroupMode(m.id as any)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="app-set-hint" style={{ marginBottom: "16px" }}>
                {t("set.g.groupingHint")}
              </div>
              <div className="app-set-group">{t("set.g.compaction")}</div>
              <div className="app-set-row" style={{ cursor: "default", gap: "10px" }}>
                <div className="app-set-label" style={{ whiteSpace: "nowrap" }}>
                  {t("set.g.keepRecent")}
                </div>
                <span style={{ flex: 1 }} />
                <div className="set-field">
                  <input
                    type="number"
                    min={2}
                    max={2000}
                    value={keepRecent}
                    onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ""); const n = Math.min(2000, Math.max(2, Number(v) || 2)); onKeepRecent(n); }}
                    className="set-field-input"
                  />
                  <span className="set-field-unit">{t("set.g.items")}</span>
                </div>
              </div>
              <div className="app-set-hint" style={{ marginBottom: "16px" }}>
                {t("set.g.compactionHint")}
              </div>
              {/* 触发压缩的两个阈值：token 阈值(空=自动按模型上下文80%) + 消息条数阈值(0=关)。任一命中即压 */}
              <div className="app-set-row" style={{ cursor: "default", gap: "10px" }}>
                <div className="app-set-label" style={{ whiteSpace: "nowrap" }}>{tr("ui.app.token.threshold.326b19a")}</div>
                <span style={{ flex: 1 }} />
                <div className="set-field">
                  <input
                    type="number"
                    min={0}
                    placeholder={tr("ui.app.auto.bdef013")}
                    value={compThr}
                    onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ""); setCompThr(v); window.wuwei.setCompact?.({ threshold: Number(v) || 0 }); }}
                    className="set-field-input"
                  />
                  <span className="set-field-unit">token</span>
                </div>
              </div>
              <div className="app-set-hint" style={{ marginBottom: "12px" }}>
                {tr("ui.app.compaction.triggers.when.the.previous.turn.6c36f42")}
              </div>
              <div className="app-set-row" style={{ cursor: "default", gap: "10px" }}>
                <div className="app-set-label" style={{ whiteSpace: "nowrap" }}>{tr("ui.app.message.count.threshold.b5f2b0c")}</div>
                <span style={{ flex: 1 }} />
                <div className="set-field">
                  <input
                    type="number"
                    min={0}
                    placeholder={tr("ui.app.off.879acbe")}
                    value={compMsgThr}
                    onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ""); setCompMsgThr(v); window.wuwei.setCompact?.({ msgThreshold: Number(v) || 0 }); }}
                    className="set-field-input"
                  />
                  <span className="set-field-unit">{tr("ui.app.msgs.f040f03")}</span>
                </div>
              </div>
              <div className="app-set-hint" style={{ marginBottom: "16px" }}>
                {tr("ui.app.also.compact.when.the.message.count.9475f10")}
              </div>
              {/* 完整对话历史归档：压缩前原文永不丢，右键会话→查看完整历史。这里设保留天数 */}
              <div className="app-set-group">{tr("ui.app.full.history.archive.e05c9b4")}</div>
              <div className="app-set-row" style={{ cursor: "default", gap: "10px" }}>
                <div className="app-set-label" style={{ whiteSpace: "nowrap" }}>{tr("ui.app.keep.archived.logs.for.8ba7ccb")}</div>
                <span style={{ flex: 1 }} />
                <div className="set-field">
                  <input
                    type="number"
                    min={0}
                    defaultValue={(() => { const v = localStorage.getItem("wuwei-transcript-days"); return v === null ? 30 : Math.max(0, Number(v) || 0); })()}
                    className="set-field-input"
                    onChange={(e) => localStorage.setItem("wuwei-transcript-days", String(Math.max(0, Math.floor(Number(e.target.value) || 0))))}
                  />
                  <span className="set-field-unit">{tr("ui.app.days.236e6f1")}</span>
                </div>
              </div>
              <div className="app-set-hint" style={{ marginBottom: "16px" }}>
                {tr("ui.app.every.exchange.is.archived.before.context.5149c51")}
              </div>
              {/* 自主推进看门狗：开着智能继续的会话卡住时，定时巡检自动朝总目标续。间隔+判停阈值可配 */}
              <div className="app-set-group">{tr("ui.app.autonomous.watchdog.4ffd18c")}</div>
              <div className="app-set-row" style={{ cursor: "default", gap: "10px" }}>
                <div className="app-set-label" style={{ whiteSpace: "nowrap" }}>{tr("ui.app.stall.timeout.a180ee9")}</div>
                <span style={{ flex: 1 }} />
                <div className="set-field">
                  <input
                    type="number"
                    min={20}
                    value={watchdogIdle}
                    onChange={(e) => { const v = Math.max(20, Number(e.target.value.replace(/[^\d]/g, "")) || 90); onWatchdog(watchdogInterval, v); }}
                    className="set-field-input"
                  />
                  <span className="set-field-unit">{tr("ui.app.sec.f3d066d")}</span>
                </div>
              </div>
              <div className="app-set-hint" style={{ marginBottom: "12px" }}>
                {tr("ui.app.for.chats.with.smart.continue.on.d92e0fa")}
              </div>
              <div className="app-set-row" style={{ cursor: "default", gap: "10px" }}>
                <div className="app-set-label" style={{ whiteSpace: "nowrap" }}>{tr("ui.app.check.interval.6640d02")}</div>
                <span style={{ flex: 1 }} />
                <div className="set-field">
                  <input
                    type="number"
                    min={10}
                    value={watchdogInterval}
                    onChange={(e) => { const v = Math.max(10, Number(e.target.value.replace(/[^\d]/g, "")) || 40); onWatchdog(v, watchdogIdle); }}
                    className="set-field-input"
                  />
                  <span className="set-field-unit">{tr("ui.app.sec.f3d066d")}</span>
                </div>
              </div>
              <div className="app-set-hint" style={{ marginBottom: "16px" }}>
                {tr("ui.app.how.often.the.watchdog.checks.for.885d9e4")}
              </div>
              <div className="app-set-group">{t("set.g.effortGroup")}</div>
              <div className="app-set-row" style={{ cursor: "default" }}>
                <div className="app-set-text">
                  <div className="app-set-label">{t("set.g.effortPicker")}</div>
                  <div className="app-set-hint">
                    {t("set.g.effortPickerHint")}
                  </div>
                </div>
                <input
                  type="checkbox"
                  className="app-set-toggle"
                  checked={showEffortPicker}
                  onChange={(e) => onShowEffortPicker(e.target.checked)}
                />
              </div>
              <div className="app-set-hint" style={{ marginBottom: "16px" }} />
              <div className="app-set-group">{t("set.g.remindGroup")}</div>
              <div className="app-set-row" style={{ cursor: "default" }}>
                <div className="app-set-text">
                  <div className="app-set-label">{t("set.g.autoDismiss")}</div>
                  <div className="app-set-hint">
                    {t("set.g.autoDismissHint")}
                  </div>
                </div>
                <input
                  type="checkbox"
                  className="app-set-toggle"
                  checked={toastAutoDraft}
                  onChange={(e) => setToastAutoDraft(e.target.checked)}
                />
              </div>
              {toastAutoDraft && (
                <div className="app-set-row" style={{ cursor: "default", gap: "10px", marginBottom: "16px" }}>
                  <div className="app-set-label" style={{ whiteSpace: "nowrap" }}>
                    {t("set.g.countdown")}
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={120}
                    step={5}
                    value={toastSecDraft}
                    onChange={(e) => setToastSecDraft(Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <div className="app-set-hint" style={{ minWidth: 44, textAlign: "right" }}>
                    {t("set.g.seconds").replace("{n}", String(toastSecDraft))}
                  </div>
                </div>
              )}
              <div className="app-set-group">{t("set.g.taskResumeGroup")}</div>
              <div className="app-set-row" style={{ cursor: "default", marginBottom: "16px" }}>
                <div className="app-set-text">
                  <div className="app-set-label">{t("set.g.taskResume")}</div>
                  <div className="app-set-hint">
                    {t("set.g.taskResumeHint")}
                  </div>
                </div>
                <input
                  type="checkbox"
                  className="app-set-toggle"
                  checked={resumeDetect}
                  onChange={(e) => {
                    setResumeDetect(e.target.checked);
                    setAppToggle({ resumeDetect: e.target.checked });
                  }}
                />
              </div>

              <div className="app-set-group">{tr("ui.app.claude.subscription.auth.b4dbb3e")}</div>
              <div className="app-set-row" style={{ cursor: "default", marginBottom: "16px" }}>
                <div className="app-set-text">
                  <div className="app-set-label">{tr("ui.app.auto.refresh.token.before.expiry.ddef7cc")}</div>
                  <div className="app-set-hint">
                    {tr("ui.app.refreshes.the.claude.subscription.token.with.8d342df")}
                  </div>
                </div>
                <input
                  type="checkbox"
                  className="app-set-toggle"
                  checked={claudeAutoRefresh}
                  onChange={(e) => { setClaudeAutoRefresh(e.target.checked); setAppToggle({ claudeAutoRefresh: e.target.checked }); }}
                />
              </div>

              <div className="app-set-group">{tr("ui.app.privacy.diagnostics.76c385c")}</div>
              <div className="app-set-row" style={{ cursor: "default", marginBottom: "16px" }}>
                <div className="app-set-text">
                  <div className="app-set-label">{tr("ui.app.send.diagnostics.to.improve.the.app.5b78fc6")}</div>
                  <div className="app-set-hint">
                    {tr("ui.app.sends.anonymous.error.and.usage.diagnostics.7db1b68")}
                  </div>
                </div>
                <input
                  type="checkbox"
                  className="app-set-toggle"
                  checked={telemetry}
                  onChange={(e) => {
                    setTelemetry(e.target.checked);
                    setAppToggle({ telemetry: e.target.checked });
                  }}
                />
              </div>

              {/* 「一人公司」模块开关已移到设置→「一人公司」模块顶部（独立模块自管开关）。 */}

              {/* 外观：输出方式（原「外观」独立菜单已并入通用，只此一处设置，无需单开一页） */}
              <div className="app-set-group">{t("set.d.output")}</div>
              <div className="theme-pick" style={{ marginBottom: "6px" }}>
                {[
                  { id: "stream", label: t("set.d.stream") },
                  { id: "typewriter", label: t("set.d.typewriter") },
                  { id: "instant", label: t("set.d.instant") },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={"theme-opt" + (streamMode === m.id ? " on" : "")}
                    onClick={() => onStream(m.id as any, streamSpeed)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {streamMode === "typewriter" && (
                <div className="app-set-row" style={{ cursor: "default", gap: "10px" }}>
                  <div className="app-set-label" style={{ whiteSpace: "nowrap" }}>
                    {t("set.d.typeSpeed")}
                  </div>
                  <input
                    type="range"
                    min={80}
                    max={2000}
                    step={20}
                    value={streamSpeed}
                    onChange={(e) => onStream("typewriter", Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <div className="app-set-hint" style={{ minWidth: 66, textAlign: "right" }}>
                    {streamSpeed} {t("set.d.cps")}
                  </div>
                </div>
              )}
              <div className="app-set-hint" style={{ marginBottom: "16px" }}>
                {t("set.d.outputHint")}
              </div>

              <div className="app-set-group">{tr("ui.app.execution.86d3b21")}</div>
              <div className="app-set-hint" style={{ marginBottom: "10px" }}>
                {tr("ui.app.ordinary.tools.are.allowed.automatically.by.59705ad")}
              </div>
              <label className="app-set-row" style={{ marginBottom: "6px" }}>
                <div className="app-set-text">
                  <div className="app-set-label">{tr("mode.auto")}</div>
                  <div className="app-set-hint">
                    {tr("ui.app.approve.tool.permissions.automatically.when.off.8e3d147")}
                  </div>
                </div>
                <input type="checkbox" className="app-set-toggle" aria-label={tr("mode.auto")}
                  checked={executionMode !== "manual"}
                  onChange={(e) => onExecutionMode(e.target.checked ? "auto" : "manual")} />
              </label>
              <label className="app-set-row" style={{ marginBottom: "10px" }}>
                <div className="app-set-text">
                  <div className="app-set-label">{tr("ui.app.smart.continue.269f877")}</div>
                  <div className="app-set-hint">
                    {tr("ui.app.keep.advancing.after.each.turn.enabling.35578f8")}
                  </div>
                </div>
                <input type="checkbox" className="app-set-toggle" aria-label={tr("ui.app.smart.continue.269f877")}
                  checked={executionMode === "cont"}
                  onChange={(e) => onExecutionMode(e.target.checked ? "cont" : "auto")} />
              </label>
              {executionMode === "cont" && <>
              <ContSettings lang={lang} />
              <div style={{ height: 8 }} />
              {/* 红线识别方式：智能识别(LLM判是否真危险) / 关键词匹配(选项含词即停) */}
              <div className="app-set-row" style={{ cursor: "default", marginBottom: "2px" }}>
                <div className="app-set-label">{tr("ui.app.redline.detection.fd7651a")}</div>
              </div>
              <div className="theme-pick" style={{ marginBottom: "6px" }}>
                {[
                  { id: "smart", label: tr("ui.app.smart.ai.617b5da") },
                  { id: "keyword", label: tr("ui.app.keywords.e823fc2") },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={"theme-opt" + ((localStorage.getItem("wuwei-redline-mode") === "keyword" ? "keyword" : "smart") === m.id ? " on" : "")}
                    onClick={() => {
                      localStorage.setItem("wuwei-redline-mode", m.id);
                      window.dispatchEvent(new CustomEvent("wuwei-redline-mode", { detail: m.id }));
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="app-set-hint" style={{ marginBottom: "12px" }}>
                {tr("ui.app.keywords.stop.whenever.an.option.text.d60c433")}
              </div>
              <StopRulesSettings lang={lang} />
              </>}
              <div className="app-set-hint" style={{ marginBottom: "16px" }} />

              {/* AGI 板块(实验性)：暂时隐藏（false 包裹，保留代码以便日后恢复） */}
              {false && (
                <>
                  <div className="app-set-group">{tr("ui.app.agi.experimental.5797589")}</div>
                  <div className="app-set-row" style={{ cursor: "default", marginBottom: "6px" }}>
                    <div className="app-set-text">
                      <div className="app-set-label">{tr("ui.app.show.agi.section.digital.baby.in.0c3f45a")}</div>
                      <div className="app-set-hint">
                        {tr("ui.app.curiosity.driven.digital.baby.that.self.d3cb0d6")}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      className="app-set-toggle"
                      defaultChecked={localStorage.getItem("wuwei-agi-enabled") === "1"}
                      onChange={(e) => {
                        localStorage.setItem("wuwei-agi-enabled", e.target.checked ? "1" : "0");
                        window.dispatchEvent(new CustomEvent("wuwei-agi-toggle", { detail: e.target.checked }));
                      }}
                    />
                  </div>
                  <div className="app-set-hint" style={{ marginBottom: "16px" }} />
                </>
              )}
            </>
          )}

          {/* ── 手机端远程：独立菜单（原在通用页内，抽出单列）。允许手机用本机(含 Claude Code 订阅)执行 ── */}
          {tab === "remote" && (
            <>
              <div className="app-set-group">{tr("ui.app.mobile.remote.0b45b14")}</div>
              <div className="app-set-row" style={{ cursor: "default", marginBottom: remoteOn ? "8px" : "16px" }}>
                <div className="app-set-text">
                  <div className="app-set-label">{tr("ui.app.allow.mobile.app.to.use.this.91ae461")}</div>
                  <div className="app-set-hint">
                    {tr("ui.app.when.on.this.computer.stays.connected.0c793d4")}
                  </div>
                </div>
                <input
                  type="checkbox"
                  className="app-set-toggle"
                  checked={remoteOn}
                  onChange={(e) => {
                    setRemoteOn(e.target.checked);
                    setAppToggle({ remoteEnabled: e.target.checked });
                  }}
                />
              </div>
              {remoteOn && (
                <>
                  <div className="app-set-row" style={{ cursor: "default", marginBottom: "8px", paddingLeft: "12px" }}>
                    <div className="app-set-text">
                      <div className="app-set-label">{tr("ui.app.share.this.machine.subscription.models.8ff93f5")}</div>
                      <div className="app-set-hint">
                        {tr("ui.app.let.the.phone.use.this.machine.11eca90")}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      className="app-set-toggle"
                      checked={remoteShareSub}
                      onChange={(e) => {
                        setRemoteShareSub(e.target.checked);
                        setAppToggle({ remoteShareSubscription: e.target.checked });
                      }}
                    />
                  </div>
                  <div className="app-set-row" style={{ cursor: "default", marginBottom: "16px", paddingLeft: "12px" }}>
                    <div className="app-set-text">
                      <div className="app-set-label">{tr("ui.app.device.name.shown.on.phone.753f5f2")}</div>
                    </div>
                    <input
                      type="text"
                      className="set-field-input"
                      style={{ width: "160px" }}
                      placeholder={tr("ui.app.my.macbook.6d1cd08")}
                      value={remoteDeviceName}
                      onChange={(e) => setRemoteDeviceName(e.target.value)}
                      onBlur={() => setAppToggle({ remoteDeviceName: remoteDeviceName.trim() } as any)}
                    />
                  </div>
                </>
              )}
            </>
          )}
          {/* ── 板块一：模型（选平台 / 打通模型 / 填凭证）── */}
          {tab === "model" && (
            <>
              <label className="field">
                <span>{t("set.m.platform")}</span>
                <select data-testid="settings-provider" value={pid} onChange={(e) => changePreset(e.target.value)}>
                  {orderedPresets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {pLabel(p, lang)}
                    </option>
                  ))}
                </select>
              </label>

              {/* 中转站：一个小按钮弹独立对话框添加；选中自定义站时可删除 */}
              <div className="station-bar">
                <button
                  type="button"
                  className="station-add-btn"
                  onClick={() => {
                    setEditStationId(null);
                    setNewStName("");
                    setNewStUrl("");
                    setNewStRelay(false);
                    setEditIsBuiltin(false);
                    setShowAddStation(true);
                  }}
                >
                  {t("set.m.addStation")}
                </button>
                {preset.custom && (
                  <button type="button" className="station-edit" onClick={() => openEditStation()}>
                    {tr("set.st.editShort")}
                  </button>
                )}
                {preset.custom && (
                  <button type="button" className="station-del" onClick={() => deleteStation(pid)}>
                    {t("set.m.delete")}{tr("ui.app.text.0f67eef", { v0: (lang !== "zh" ? undefined : preset.label.replace(/（中转）$/, "")), v1: (lang !== "zh" ? pLabel(preset, lang).replace(/（中转）$/, "") : undefined) })}
                  </button>
                )}
              </div>

              <label className="field">
                <span>{t("set.m.model")}</span>
                {modelOptions.length > 0 && !customModel ? (
                  <select data-testid="settings-model"
                    value={model}
                    onChange={(e) => {
                      if (preset.hosted) { onHostedModels(pid); return; }
                      if (e.target.value === "__custom__") {
                        setCustomModel(true);
                        setModel("");
                      } else {
                        setModel(e.target.value);
                      }
                    }}
                  >
                    {!model && <option value="" disabled>{tr("ui.app.choose.model.0d10839")}</option>}
                    {modelOptions.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                    <option value="__custom__">{t("set.m.custom")}</option>
                  </select>
                ) : (
                  <input
                    value={model}
                    onChange={(e) => { if (preset.hosted) { onHostedModels(pid); return; } setModel(e.target.value); }}
                    placeholder={t("set.m.modelPlaceholder")}
                  />
                )}
              </label>
              {modelError && <p role="alert" style={{ color: 'var(--spark)' }}>{modelError}</p>}
              {preset.modelLabels?.[model] && <p className="model-sub">{preset.modelLabels[model]}</p>}

              {/* 模型列表管理：手动加/删该平台的模型(自定义加的可删，预设自带的不可删) */}
              <div className="model-list-mgr">
                <div className="mlm-head">{t("set.m.modelList")}</div>
                <div className="mlm-chips">
                  {modelOptions.length === 0 && <span className="mlm-empty">{t("set.m.noModels")}</span>}
                  {modelOptions.map((m) => {
                    const isCustom = (creds[pid]?.customModels || []).includes(m);
                    return (
                      <span key={m} className={"mlm-chip" + (m === model ? " on" : "")}>
                        <button type="button" className="mlm-pick" title={t("set.m.pickTitle")} onClick={() => { if (preset.hosted) { onHostedModels(pid); return; } setModel(m); setCustomModel(false); }}>
                          {m}
                        </button>
                        {isCustom && (
                          <button type="button" className="mlm-del" title={t("set.m.delTitle")} onClick={() => delCustomModel(m)}>
                            ✕
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
                <div className="mlm-add">
                  <input
                    value={newModelName}
                    onChange={(e) => setNewModelName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); addCustomModel(newModelName); setNewModelName(""); }
                    }}
                    placeholder={t("set.m.addModelPlaceholder")}
                  />
                  <button type="button" onClick={() => { addCustomModel(newModelName); setNewModelName(""); }}>
                    ＋ {t("set.m.add")}
                  </button>
                </div>
              </div>

              {/* 该模型能力开关(按【模型】各存各的，切模型即时切换；保存后生效) */}
              <div className="model-caps">
                <div className="model-caps-head">
                  {t("set.m.capsFor")} <b>{model || t("set.m.noneSel")}</b>
                </div>
                <label className="cap-row" title={t("set.m.toolcallTitle")}>
                  <input
                    type="checkbox"
                    checked={!curCaps.noTools}
                    disabled={!model}
                    onChange={(e) => setModelCap({ noTools: !e.target.checked })}
                  />
                  <span className="cap-text">
                    <b>{t("set.m.toolcall")}</b>
                    <em>{t("set.m.toolcallHint")}</em>
                  </span>
                </label>
                <label className="cap-row" title={t("set.m.visionTitle")}>
                  <input
                    type="checkbox"
                    checked={!!curCaps.vision}
                    disabled={!model}
                    onChange={(e) => setModelCap({ vision: e.target.checked })}
                  />
                  <span className="cap-text">
                    <b>{t("set.m.vision")}</b>
                    <em>{t("set.m.visionHint")}</em>
                  </span>
                </label>
              </div>

              {(preset.kind === "anthropic-apikey" || preset.kind === "openai") && preset.keyUrl && (
                <div className="key-guide">
                  {t("set.m.noKey")}
                  <a onClick={startGetKey}>
                    {tr("ui.app.get.one.from.7e114ee", { p0: (!(lang === "zh") ? pLabel(preset, lang) : preset.label) })}
                  </a>
                  <span className="key-steps">{t("set.m.getKeySteps")}</span>
                  {(sKeyWaiting || sKeyMsg) && (
                    <p className={"skey-msg" + (sKeyMsg.startsWith("✓") ? " ok" : sKeyMsg.startsWith("✗") ? " err" : "")}>
                      {sKeyMsg}
                      {sKeyWaiting && (
                        <button
                          type="button"
                          className="link-inline"
                          onClick={() => trySettingsKey(apiKey)}
                        >
                          {t("set.m.verifyNow")}
                        </button>
                      )}
                    </p>
                  )}
                </div>
              )}

              {pNote(preset, lang) && <p className="s-note">{pNote(preset, lang)}</p>}

              {preset.kind === "anthropic-oauth" && (
                <>
                  {sAwaitCode ? (
                    <>
                      <p className="s-note">{t("set.m.oauthCodeHint")}</p>
                      <div className="key-wrap">
                        <input
                          value={sCode}
                          onChange={(e) => setSCode(e.target.value)}
                          placeholder={t("set.m.pasteCode")}
                        />
                      </div>
                      <button
                        type="button"
                        className="allow oauth-login-btn"
                        onClick={claudeCompleteBrowser}
                        disabled={claudeBusy}
                      >
                        {claudeBusy ? t("set.m.verifying") : t("set.m.completeAuth")}
                      </button>
                      <p className="s-note" style={{ marginTop: 14, textAlign: "center" }}>
                        <a className="link-inline" onClick={() => !claudeBusy && setSAwaitCode(false)}>
                          {t("set.m.back")}
                        </a>
                      </p>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="allow oauth-login-btn"
                        onClick={claudeOpenBrowser}
                        disabled={claudeBusy}
                      >
                        {t("set.m.authBrowser")}
                      </button>
                      <p className="s-note">
                        {tr("ui.app.opens.the.authorization.page.in.your.9ff932a")}
                        <a className="link-inline" onClick={() => !claudeBusy && claudeLoginWindow()}>
                          {t("set.m.useInApp")}
                        </a>
                      </p>
                    </>
                  )}
                  {/* OAuth Token 由授权流程自动填入；授权前不显示、授权后只读展示——避免用户误把授权码填进来 */}
                  {oauthToken ? (
                    <label className="field">
                      <span>{t("set.m.oauthToken")}</span>
                      <div className="key-wrap oauth">
                        <input type={showKey ? "text" : "password"} value={oauthToken} readOnly />
                        <button
                          type="button"
                          className="eye-btn"
                          onClick={() => setShowKey((v) => !v)}
                          title={showKey ? t("set.m.hide") : t("set.m.show")}
                        >
                          <EyeIcon off={showKey} />
                        </button>
                        <button
                          type="button"
                          className="eye-btn clr"
                          onClick={() => setOauthToken("")}
                          title={t("set.m.clearToken")}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M5 7h14M10 7V5.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V7M7 7l.8 11a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L18 7" />
                          </svg>
                        </button>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                        {tr("ui.app.when.the.auth.token.expires.click.e48afbd")}
                      </div>
                    </label>
                  ) : null}
                </>
              )}

              {preset.kind === "codex" && (
                <>
                  <button
                    type="button"
                    className="allow oauth-login-btn"
                    disabled={sCodexBusy}
                    onClick={async () => {
                      setSCodexBusy(true);
                      try {
                        const ok = await window.wuwei.codexLogin();
                        if (ok) await persist({ close: true });
                        else alert(tr("ui.app.codex.authorization.failed.canceled.timeout.port.3ab24e1"));
                      } finally {
                        setSCodexBusy(false);
                      }
                    }}
                  >
                    {sCodexBusy ? t("set.m.codexAuthing") : t("set.m.codexAuth")}
                  </button>
                  <p className="s-note">
                    {tr("ui.app.opens.chatgpt.login.in.your.default.0564278")}
                  </p>
                </>
              )}

              {(preset.kind === "anthropic-apikey" || preset.kind === "openai") && !preset.hosted && (
                <label className="field">
                  <span>{t("set.m.apiKey")}</span>
                  <div className="key-wrap">
                    <input
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={pKeyHint(preset, lang)}
                    />
                    <button
                      type="button"
                      className="eye-btn"
                      onClick={() => setShowKey((v) => !v)}
                      title={showKey ? (tr("set.m.hide")) : (tr("set.m.show"))}
                    >
                      <EyeIcon off={showKey} />
                    </button>
                  </div>
                </label>
              )}

              {!preset.fixedBaseUrl && (
                <label className="field">
                  <span>Base URL</span>
                  <input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="http://localhost:8000/v1"
                  />
                </label>
              )}

            </>
          )}

          {/* ── 板块二：平台管理（拖拽排序 + 显隐，即时保存）── */}
          {tab === "platforms" && (
            <>
              <p className="prov-manage-hint">{t("set.p.hint")}</p>
              <div className="prov-manage-bar">
                <button
                  type="button"
                  className="station-add-btn"
                  onClick={() => {
                    setEditStationId(null);
                    setNewStName("");
                    setNewStUrl("");
                    setNewStRelay(false);
                    setEditIsBuiltin(false);
                    setShowAddStation(true);
                  }}
                >
                  {t("set.st.addBtn")}
                </button>
              </div>
              <div className="prov-list">
                {orderedPresets.map((p, i) => {
                  const isHidden = hidden.includes(p.id);
                  const lockOn = p.id === pid && !isHidden; // 当前平台不可隐藏
                  return (
                    <div
                      key={p.id}
                      className={
                        "prov-row" +
                        (isHidden ? " off" : "") +
                        (dragOverIdx === i ? " dragover" : "")
                      }
                      draggable
                      onDragStart={() => {
                        dragIdxRef.current = i;
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragOverIdx !== i) setDragOverIdx(i);
                      }}
                      onDragEnd={() => {
                        setDragOverIdx(-1);
                        dragIdxRef.current = -1;
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from = dragIdxRef.current;
                        if (from >= 0 && from !== i) moveProvider(from, i);
                        setDragOverIdx(-1);
                        dragIdxRef.current = -1;
                      }}
                    >
                      <span className="prov-grip" title={t("set.p.dragSort")}>
                        ⋮⋮
                      </span>
                      <span className="prov-name">{pLabel(p, lang)}</span>
                      <button
                        type="button"
                        className="prov-mini"
                        title={p.custom ? t("set.st.editBtnCustom") : t("set.st.renameBtn")}
                        onClick={() => openEditStation(p.id)}
                      >
                        {t("set.st.editShort")}
                      </button>
                      <button
                        type="button"
                        className="prov-mini del"
                        title={p.custom ? t("set.st.delCustom") : t("set.st.delBuiltin")}
                        disabled={orderedPresets.length <= 1}
                        onClick={() => deleteProvider(p.id)}
                      >
                        {t("set.st.delShort")}
                      </button>
                      <button
                        type="button"
                        className="prov-eye"
                        disabled={lockOn}
                        title={lockOn ? t("set.p.lockOn") : isHidden ? t("set.p.hiddenClickShow") : t("set.p.clickHide")}
                        onClick={() => toggleHidden(p.id)}
                      >
                        <EyeIcon off={isHidden} />
                      </button>
                    </div>
                  );
                })}
              </div>
              {removed.length > 0 && (
                <div className="prov-restore">
                  {tr("ui.app.default.provider.removed.2b40a1f", { p0: removed.length })}
                  <button type="button" className="link-inline" onClick={restoreRemovedProviders}>
                    {tr("ui.app.restore.defaults.e3f4b7e")}
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── 板块三：系统提示词（全局默认 + 每平台可覆盖）── */}
          {tab === "prompt" && (
            <div className="prompt-pane">
              <label className="field pp-grow">
                <span>
                  {t("set.pr.globalPrompt")}
                  {sysPromptTouched ? t("set.pr.customized") : t("set.pr.default")}
                </span>
                <textarea
                  className="sysprompt-area pp-fill"
                  value={sysPrompt}
                  onChange={(e) => {
                    setSysPrompt(e.target.value);
                    setSysPromptTouched(true);
                  }}
                  placeholder={t("set.pr.emptyHint")}
                />
              </label>
              <p className="s-note pp-fixed">
                {tr("ui.app.the.first.instruction.sent.to.the.bd7905f")}
                <code>{"{model}"}</code>
                {tr("ui.app.current.model.a93eca6")}
                <code>{"{cwd}"}</code>
                {tr("ui.app.working.dir.replaced.automatically.70dcd75")}
                {sysPromptTouched && (
                  <button
                    type="button"
                    className="link-inline"
                    onClick={() => {
                      setSysPrompt(tr("agent.defaultPrompt", {}, lang));
                      setSysPromptTouched(false);
                    }}
                  >
                    {t("set.pr.restore")}
                  </button>
                )}
              </p>

              {/* 每平台覆盖：勾选后本平台用单独的提示词，不影响其它平台 */}
              <label className="prov-override-toggle pp-fixed">
                <input
                  type="checkbox"
                  checked={platPromptOn}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setPlatPromptOn(on);
                    // 首次开启且为空：用当前全局做起点，方便改
                    if (on && !platPrompt) setPlatPrompt(sysPromptTouched ? sysPrompt : sysPromptDefault);
                  }}
                />
                <span>
                  {tr("ui.app.override.for.this.provider.only.ec7818d", { p0: (!(lang === "zh") ? pLabel(preset, lang) : preset.label) })}
                </span>
              </label>
              {platPromptOn && (
                <label className="field pp-grow">
                  <span>{tr("ui.app.text.113068a", { v0: (lang !== "zh" ? undefined : preset.label), v1: (lang !== "zh" ? pLabel(preset, lang) : undefined) })}{t("set.pr.overrideLabelSuffix")}</span>
                  <textarea
                    className="sysprompt-area pp-fill"
                    value={platPrompt}
                    onChange={(e) => setPlatPrompt(e.target.value)}
                    placeholder={t("set.pr.overridePlaceholder")}
                  />
                </label>
              )}
            </div>
          )}

          {/* ── 板块四：记忆（全局长期记忆，注入每次对话）── */}
          {tab === "memory" && (
            <div className="prompt-pane">
              <label className="field pp-grow">
                <span>{t("set.mem.global")}</span>
                <textarea
                  className="sysprompt-area pp-fill"
                  value={memory}
                  onChange={(e) => {
                    setMemory(e.target.value);
                    memoryTouchedRef.current = true;
                  }}
                  placeholder={t("set.mem.placeholder")}
                />
              </label>
              <p className="s-note pp-fixed">
                {tr("ui.app.when.you.tell.the.model.remember.ac61c00")}
                <code>~/.wuwei/memory.md</code>{tr("ui.app.text.76b3731")}
              </p>
            </div>
          )}

          {/* ── 板块 · 脑网络 Brain（概念图谱：查看/检索/编辑）── */}
          {tab === "brain" &&
            (() => {
              const q = brainFilter.trim().toLowerCase();
              const filteredNodes = q
                ? brainNodes.filter(
                    (n) =>
                      n.name.toLowerCase().includes(q) ||
                      n.type.toLowerCase().includes(q) ||
                      n.summary.toLowerCase().includes(q) ||
                      n.aliases.some((a) => a.toLowerCase().includes(q)),
                  )
                : brainNodes;
              const sorted = [...filteredNodes].sort((a, b) => b.weight - a.weight);
              const nodeName = (id: string) => brainNodes.find((n) => n.id === id)?.name || id;
              return (
                <div className="prompt-pane" style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, overflowY: "auto" }}>
                  {/* 视图切换：可视化网络 / 脑网络说明提示词 */}
                  <div
                    style={{
                      order: -3,
                      display: "flex",
                      alignSelf: "flex-start",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      overflow: "hidden",
                    }}
                  >
                    {(["graph", "prompt"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setBrainView(v)}
                        style={{
                          padding: "4px 16px",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 13,
                          background: brainView === v ? "var(--accent)" : "transparent",
                          color: brainView === v ? "#fff" : "var(--text)",
                        }}
                      >
                        {v === "graph" ? t("set.brain.viewGraph") : t("set.brain.viewPrompt")}
                      </button>
                    ))}
                  </div>
                  {/* 总开关：关掉后不注入脑网络说明、不再提供 brain_* 工具 */}
                  <div className="app-set-row" style={{ order: -2, cursor: "default" }}>
                    <div className="app-set-text">
                      <div className="app-set-label">{t("set.brain.enableTitle")}</div>
                      <div className="app-set-hint">
                        {t("set.brain.enableHint")}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      className="app-set-toggle"
                      checked={brainOn}
                      onChange={(e) => {
                        setBrainOn(e.target.checked);
                        setAppToggle({ brainEnabled: e.target.checked });
                      }}
                    />
                  </div>
                  {/* 子开关：recall 是否连带扫描『相关文档』(文档冷存储) */}
                  <div className="app-set-row" style={{ order: -1, cursor: "default", opacity: brainOn ? 1 : 0.5 }}>
                    <div className="app-set-text">
                      <div className="app-set-label">{t("set.brain.scanDocsTitle")}</div>
                      <div className="app-set-hint">
                        {t("set.brain.scanDocsHint")}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      className="app-set-toggle"
                      checked={brainDocsOn}
                      disabled={!brainOn}
                      onChange={(e) => {
                        setBrainDocsOn(e.target.checked);
                        setAppToggle({ brainDocs: e.target.checked });
                      }}
                    />
                  </div>
                  {brainView === "prompt" ? (
                    <>
                      <label className="field pp-grow">
                        <span>{t("set.brain.promptLabel")} {brainPromptTouched ? t("set.pr.customized") : t("set.pr.default")}</span>
                        <textarea
                          className="sysprompt-area pp-fill"
                          value={brainPrompt}
                          onChange={(e) => {
                            setBrainPrompt(e.target.value);
                            setBrainPromptTouched(true);
                          }}
                          onBlur={() => window.wuwei.setBrainPrompt(brainPromptTouched ? brainPrompt : null)}
                          placeholder={t("set.brain.promptPlaceholder")}
                        />
                      </label>
                      <p className="s-note pp-fixed">
                        {t("set.brain.promptNote")}
                        {brainPromptTouched && (
                          <button
                            type="button"
                            className="link-inline"
                            onClick={() => {
                              setBrainPrompt(tr("agent.brainNote", {}, lang));
                              setBrainPromptTouched(false);
                              window.wuwei.setBrainPrompt(null);
                            }}
                          >
                            {t("set.pr.restore")}
                          </button>
                        )}
                      </p>
                    </>
                  ) : (
                  <>
                  <div style={{ order: -2, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span className="s-note" style={{ margin: 0 }}>
                      {t("set.brain.statNodes")} <b>{brainStat.nodes}</b> · {t("set.brain.statEdges")}{" "}
                      <b>{brainStat.edges}</b> · {t("set.brain.statEmbedded")}{" "}
                      <b>{brainStat.embedded}</b>/{brainStat.nodes}
                    </span>
                    <button type="button" onClick={() => reloadBrain()}>
                      {t("set.brain.refresh")}
                    </button>
                    <button
                      type="button"
                      disabled={brainWarming}
                      onClick={async () => {
                        setBrainWarming(true);
                        setBrainWarmMsg(t("set.brain.warmLoading"));
                        const ok = await window.wuwei.brainWarmup();
                        setBrainWarming(false);
                        setBrainWarmMsg(ok ? t("set.brain.warmOk") : t("set.brain.warmFail"));
                        reloadBrain();
                      }}
                    >
                      {brainWarming ? t("set.brain.warming") : t("set.brain.warmBtn")}
                    </button>
                    {brainWarmMsg && (
                      <span className="s-note" style={{ margin: 0 }}>
                        {localizeStoredText(brainWarmMsg, getCurrentLanguage())}
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      style={{ flex: 1 }}
                      placeholder={t("set.brain.recallPlaceholder")}
                      value={brainRecallQ}
                      onChange={(e) => setBrainRecallQ(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter")
                          setBrainRecallOut((await window.wuwei.brainRecall(brainRecallQ)) || t("set.brain.noHit"));
                      }}
                    />
                    <button
                      type="button"
                      onClick={async () =>
                        setBrainRecallOut((await window.wuwei.brainRecall(brainRecallQ)) || t("set.brain.noHit"))
                      }
                    >
                      {t("set.brain.recall")}
                    </button>
                  </div>
                  {brainRecallOut && (
                    <div style={{ position: "relative", flex: "0 0 auto" }}>
                      <button
                        type="button"
                        onClick={() => setBrainRecallOut("")}
                        title={t("set.brain.closeResult")}
                        style={{ position: "absolute", top: 4, right: 4, zIndex: 1, width: 20, height: 20, lineHeight: "18px", textAlign: "center", padding: 0, borderRadius: 4, border: "none", background: "rgba(127,127,127,0.15)", cursor: "pointer", fontSize: 13 }}
                      >
                        ✕
                      </button>
                      <pre
                        style={{
                          margin: 0,
                          maxHeight: 140,
                          overflow: "auto",
                          fontSize: 12,
                          whiteSpace: "pre-wrap",
                          opacity: 0.85,
                          background: "rgba(127,127,127,0.08)",
                          padding: 8,
                          paddingRight: 28,
                          borderRadius: 6,
                        }}
                      >
                        {brainRecallOut}
                      </pre>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 12, flex: "1 1 auto", minHeight: 200 }}>
                    {/* 左：概念列表（可收起成竖条，给中间图谱腾空间） */}
                    {brainLeftOpen ? (
                    <div style={{ width: 220, flex: "0 0 220px", display: "flex", flexDirection: "column", gap: 6, minHeight: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className="s-note" style={{ margin: 0, flex: 1, fontWeight: 600 }}>{t("set.brain.conceptList")}</span>
                        <button type="button" className="brain-col-btn" title={t("set.brain.collapseList")} onClick={() => setBrainLeftOpen(false)}>
                          ◀
                        </button>
                      </div>
                      <input
                        placeholder={t("set.brain.filterPlaceholder")}
                        value={brainFilter}
                        onChange={(e) => setBrainFilter(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setBrainSel(null);
                          setBrainDraft({
                            id: "",
                            name: "",
                            aliases: [],
                            type: tr("ui.app.concept.86125d3"),
                            summary: "",
                            attrs: {},
                            weight: 1,
                            hits: 0,
                            createdAt: 0,
                            updatedAt: 0,
                          });
                        }}
                      >
                        {t("set.brain.newNode")}
                      </button>
                      <div style={{ overflow: "auto", flex: 1 }}>
                        {sorted.map((n) => (
                          <div
                            key={n.id}
                            onClick={() => {
                              setBrainSel(n.id);
                              setBrainDraft({ ...n, attrs: { ...n.attrs }, aliases: [...n.aliases] });
                            }}
                            style={{
                              padding: "6px 8px",
                              cursor: "pointer",
                              borderRadius: 6,
                              background: brainSel === n.id ? "rgba(127,127,127,0.18)" : "transparent",
                            }}
                          >
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{n.name}</div>
                            <div className="s-note" style={{ margin: 0 }}>
                              {n.type} · {t("set.brain.hits")}{n.hits}
                            </div>
                          </div>
                        ))}
                        {sorted.length === 0 && (
                          <div className="s-note">{t("set.brain.emptyNodes")}</div>
                        )}
                      </div>
                    </div>
                    ) : (
                      <button
                        type="button"
                        className="brain-col-rail"
                        title={t("set.brain.expandList")}
                        onClick={() => setBrainLeftOpen(true)}
                      >
                        <span className="brain-rail-arrow">▶</span>
                        <span className="brain-rail-label">{t("set.brain.conceptList")}</span>
                      </button>
                    )}

                    {/* 中：概念网络力导向图（占最大空间，点节点选中、拖节点挪位） */}
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        minHeight: 0,
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        background: "rgba(127,127,127,0.04)",
                        overflow: "hidden",
                      }}
                    >
                      <ConceptGraph
                        nodes={brainNodes}
                        edges={brainEdges}
                        selectedId={brainSel}
                        onSelect={(id) => {
                          const n = brainNodes.find((x) => x.id === id);
                          if (n) {
                            setBrainSel(id);
                            setBrainDraft({ ...n, attrs: { ...n.attrs }, aliases: [...n.aliases] });
                          }
                        }}
                      />
                    </div>

                    {/* 右：详情编辑（仅选中概念时出现；可收起成竖条，或叉掉取消选中让图谱铺满） */}
                    {brainDraft && !brainRightOpen && (
                      <div style={{ flex: "0 0 26px", width: 26, display: "flex", flexDirection: "column", gap: 4, minHeight: 0 }}>
                        <button
                          type="button"
                          className="brain-col-btn"
                          title={t("set.brain.closeDetail")}
                          onClick={() => {
                            setBrainDraft(null);
                            setBrainSel(null);
                          }}
                          style={{ padding: "2px 0" }}
                        >
                          ✕
                        </button>
                        <button
                          type="button"
                          className="brain-col-rail"
                          title={t("set.brain.expandDetail")}
                          onClick={() => setBrainRightOpen(true)}
                          style={{ flex: "1 1 auto", width: "auto" }}
                        >
                          <span className="brain-rail-arrow">◀</span>
                          <span className="brain-rail-label">{t("set.brain.detail")}</span>
                        </button>
                      </div>
                    )}
                    {brainDraft && brainRightOpen && (
                      <div style={{ width: 300, flex: "0 0 300px", minHeight: 0, overflow: "auto" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span className="s-note" style={{ margin: 0, flex: 1, fontWeight: 600 }}>{t("set.brain.detail")}</span>
                            <button type="button" className="brain-col-btn" title={t("set.brain.collapseDetail")} onClick={() => setBrainRightOpen(false)}>
                              ▶
                            </button>
                            <button
                              type="button"
                              className="brain-col-btn"
                              title={t("set.brain.closeDetail")}
                              onClick={() => {
                                setBrainDraft(null);
                                setBrainSel(null);
                              }}
                            >
                              ✕
                            </button>
                          </div>
                          <label className="field">
                            <span>{t("set.brain.fName")}</span>
                            <input
                              value={brainDraft.name}
                              onChange={(e) => setBrainDraft({ ...brainDraft, name: e.target.value })}
                            />
                          </label>
                          <label className="field">
                            <span>{t("set.brain.fType")}</span>
                            <input
                              value={brainDraft.type}
                              placeholder={t("set.brain.fTypePlaceholder")}
                              onChange={(e) => setBrainDraft({ ...brainDraft, type: e.target.value })}
                            />
                          </label>
                          <label className="field">
                            <span>{t("set.brain.fSummary")}</span>
                            <input
                              value={brainDraft.summary}
                              onChange={(e) => setBrainDraft({ ...brainDraft, summary: e.target.value })}
                            />
                          </label>
                          <label className="field">
                            <span>{t("set.brain.fAliases")}</span>
                            <input
                              value={brainDraft.aliases.join(", ")}
                              onChange={(e) =>
                                setBrainDraft({
                                  ...brainDraft,
                                  aliases: e.target.value
                                    .split(/[,，]/)
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                })
                              }
                            />
                          </label>
                          <label className="field">
                            <span>{t("set.brain.fAttrs")}</span>
                            <textarea
                              className="sysprompt-area"
                              style={{ minHeight: 90 }}
                              value={attrsToText(brainDraft.attrs)}
                              placeholder={t("set.brain.fAttrsPlaceholder")}
                              onChange={(e) => setBrainDraft({ ...brainDraft, attrs: textToAttrs(e.target.value) })}
                            />
                          </label>
                          {brainDraft.id && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <span className="s-note" style={{ margin: 0 }}>
                                {t("set.brain.relations")}
                              </span>
                              {brainEdges
                                .filter((ed) => ed.from === brainDraft.id)
                                .map((ed) => (
                                  <div key={ed.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                    <span style={{ fontSize: 13 }}>
                                      ──{ed.relation}→ {nodeName(ed.to)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        await window.wuwei.brainDeleteEdge(ed.id);
                                        reloadBrain();
                                      }}
                                    >
                                      {t("set.brain.delEdge")}
                                    </button>
                                  </div>
                                ))}
                              <div style={{ display: "flex", gap: 6 }}>
                                <input
                                  style={{ width: 110 }}
                                  placeholder={t("set.brain.relationName")}
                                  value={brainNewEdge.relation}
                                  onChange={(e) => setBrainNewEdge({ ...brainNewEdge, relation: e.target.value })}
                                />
                                <input
                                  style={{ flex: 1 }}
                                  placeholder={t("set.brain.targetNode")}
                                  value={brainNewEdge.to}
                                  onChange={(e) => setBrainNewEdge({ ...brainNewEdge, to: e.target.value })}
                                />
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (brainNewEdge.relation.trim() && brainNewEdge.to.trim()) {
                                      await window.wuwei.brainAddEdge(
                                        brainDraft.name,
                                        brainNewEdge.relation.trim(),
                                        brainNewEdge.to.trim(),
                                      );
                                      setBrainNewEdge({ relation: "", to: "" });
                                      reloadBrain();
                                    }
                                  }}
                                >
                                  {t("set.brain.addEdge")}
                                </button>
                              </div>
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!brainDraft.name.trim()) return;
                                await window.wuwei.brainSaveNode({
                                  id: brainDraft.id || undefined,
                                  name: brainDraft.name.trim(),
                                  type: brainDraft.type,
                                  summary: brainDraft.summary,
                                  aliases: brainDraft.aliases,
                                  attrs: brainDraft.attrs,
                                });
                                await reloadBrain();
                                setBrainWarmMsg(t("set.brain.saved"));
                              }}
                            >
                              {t("set.brain.save")}
                            </button>
                            {brainDraft.id && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await window.wuwei.brainDeleteNode(brainDraft.id);
                                  setBrainDraft(null);
                                  setBrainSel(null);
                                  reloadBrain();
                                }}
                              >
                                {t("set.brain.delNode")}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      order: -1,
                      borderBottom: "1px solid var(--border)",
                      paddingBottom: 10,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <span className="s-note" style={{ margin: 0 }}>
                      {t("set.brain.docLib")}{" "}
                      <b>{docStat.chunks}</b> {t("set.brain.docChunks")} / <b>{docStat.files}</b> {t("set.brain.docFiles")}
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        style={{ flex: 1 }}
                        placeholder={t("set.brain.docDirPlaceholder")}
                        value={docDir}
                        onChange={(e) => setDocDir(e.target.value)}
                      />
                      <button
                        type="button"
                        disabled={docBuilding || conExtract?.running}
                        onClick={async () => {
                          const picked = await window.wuwei.selectFolder();
                          if (picked) setDocDir(picked);
                        }}
                      >
                        {t("set.brain.docBrowse")}
                      </button>
                      <button
                        type="button"
                        disabled={docBuilding || conExtract?.running || !docDir.trim()}
                        onClick={async () => {
                          setDocBuilding(true);
                          setDocProg(t("set.brain.docPreparing"));
                          try {
                            const s = await window.wuwei.brainBuildDocs(docDir.trim());
                            setDocStat(s);
                          } catch (e: any) {
                            setDocProg("✗ " + (e?.message || t("set.brain.docBuildFail")));
                          } finally {
                            setDocBuilding(false);
                          }
                        }}
                      >
                        {docBuilding ? t("set.brain.docBuilding") : docStat.chunks > 0 ? t("set.brain.docRebuild") : t("set.brain.docBuild")}
                      </button>
                    </div>
                    {docProg && (
                      <span className="s-note" style={{ margin: 0 }}>
                        {localizeStoredText(docProg, getCurrentLanguage())}
                      </span>
                    )}
                    {/* 概念抽取：用当前对话模型(k3)从已索引文档批量抽概念+关系填进 graph。按文档级调用，省 token；可停。 */}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        disabled={docStat.files === 0 || conExtract?.running}
                        title={t("set.brain.extractNewTitle")}
                        onClick={async () => {
                          const r = await window.wuwei.brainExtractConcepts({ all: false });
                          if (!r.started) setBrainWarmMsg("✗ " + (r.reason || t("set.brain.extractFail")));
                        }}
                      >
                        {conExtract?.running ? t("set.brain.extracting") : t("set.brain.extractNew")}
                      </button>
                      <button
                        type="button"
                        disabled={docStat.files === 0 || conExtract?.running}
                        title={t("set.brain.extractAllTitle")}
                        onClick={async () => {
                          const r = await window.wuwei.brainExtractConcepts({ all: true });
                          if (!r.started) setBrainWarmMsg("✗ " + (r.reason || t("set.brain.extractFail")));
                        }}
                      >
                        {t("set.brain.extractAll")}
                      </button>
                      {conExtract?.running && (
                        <button type="button" className="allow" onClick={() => window.wuwei.brainStopConcepts()}>
                          {t("set.brain.stop")}
                        </button>
                      )}
                      {conExtract && (conExtract.running || conExtract.phase === "done" || conExtract.phase === "stopped") && (
                        <span className="s-note" style={{ margin: 0 }}>
                          {conExtract.running
                            ? `${t("set.brain.exRunning")} ${conExtract.done}/${conExtract.total} ${t("set.brain.exDocs")} · ${t("set.brain.exGen")} ${conExtract.created} ${t("set.brain.exConcepts")}${conExtract.cur ? " · " + conExtract.cur : ""}`
                            : conExtract.phase === "stopped"
                              ? `${t("set.brain.exStopped")} (${conExtract.done}/${conExtract.total} ${t("set.brain.exDocs")}, ${conExtract.created} ${t("set.brain.exConcepts")})`
                              : `${t("set.brain.exDone")} · ${t("set.brain.exTotalGen")} ${conExtract.created} ${t("set.brain.exConcepts")}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="s-note pp-fixed">
                    {t("set.brain.footDesc")}
                  </p>
                  </>
                  )}
                </div>
              );
            })()}

          {/* ── 板块五：MCP 服务器管理（列表/搜索/安装/启停/删除）── */}
          {tab === "mcp" &&
            (() => {
              const servers = parseMcpServers(mcpConfig);
              const names = Object.keys(servers);
              const q = mcpSearch.trim().toLowerCase();
              const statusOf = (n: string) => mcpStatus.find((s) => s.name === n);
              const matchServer = (n: string) => {
                if (!q) return true;
                const st = statusOf(n);
                return (
                  n.toLowerCase().includes(q) ||
                  (st?.toolInfos || []).some(
                    (t) => t.name.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q),
                  )
                );
              };
              return (
                <div className="mcp-pane">
                  <input
                    className="mcp-search"
                    placeholder={t("set.mcp.search")}
                    value={mcpSearch}
                    onChange={(e) => setMcpSearch(e.target.value)}
                  />
                  <div
                    className="mcp-scroll"
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 90) loadMoreMcp();
                    }}
                  >
                    <div className="mcp-sec">{t("set.mcp.configured")}（{names.length}）</div>
                    {names.length === 0 && <div className="mcp-empty">{t("set.mcp.empty")}</div>}
                    {names.filter(matchServer).map((n) => {
                      const sv = servers[n];
                      const st = statusOf(n);
                      const badge = sv.disabled ? "disabled" : st?.status || "connecting";
                      const tools = st?.toolInfos || [];
                      return (
                        <div key={n} className={"mcp-card " + badge}>
                          <div className="mcp-card-head">
                            <span className={"mcp-dot " + badge} />
                            <span
                              className={"mcp-name" + (badge === "ready" ? " clk" : "")}
                              onClick={() => badge === "ready" && setMcpExpanded(mcpExpanded === n ? null : n)}
                            >
                              {n}
                            </span>
                            <span
                              className={"mcp-count" + (badge === "ready" ? " clk" : "")}
                              onClick={() => badge === "ready" && setMcpExpanded(mcpExpanded === n ? null : n)}
                            >
                              {badge === "disabled"
                                ? t("set.mcp.disabled")
                                : badge === "needs-config"
                                  ? t("set.mcp.needsConfig")
                                  : badge === "ready"
                                    ? `${tools.length} ${t("set.mcp.tools")} ${mcpExpanded === n ? "▴" : "▾"}`
                                    : badge === "error"
                                      ? t("set.mcp.error")
                                      : t("set.mcp.connecting")}
                            </span>
                            <span className="mcp-actions">
                              <button
                                type="button"
                                className="mcp-btn"
                                onClick={() => (mcpEdit === n ? setMcpEdit(null) : startEditMcp(n, sv))}
                              >
                                {mcpEdit === n ? t("set.mcp.collapse") : t("set.mcp.edit")}
                              </button>
                              <button type="button" className="mcp-btn" onClick={() => mcpToggle(n)}>
                                {sv.disabled ? t("set.mcp.enable") : t("set.mcp.disable")}
                              </button>
                              <button type="button" className="mcp-btn del" onClick={() => mcpRemove(n)}>
                                {t("set.mcp.delete")}
                              </button>
                            </span>
                          </div>
                          {st?.error && (st.status === "error" || st.status === "needs-config") && (
                            <div className={"mcp-err" + (st.status === "needs-config" ? " hint" : "")}>{st.error}</div>
                          )}
                          {mcpEdit === n && (
                            <div className="mcp-editor">
                              {mcpEditFields.length === 0 && (
                                <div className="mcp-ed-none">{t("set.mcp.edNone")}</div>
                              )}
                              {mcpEditFields.map((f, fi) => {
                                const raw = f.kind === "arg" ? mcpEditArgs[f.idx!] ?? "" : mcpEditEnvMap[f.key!] ?? "";
                                const isPh = String(raw).includes("<"); // 占位=还没填
                                const val = isPh ? "" : raw; // 占位→空框(用 placeholder 灰字提示)
                                return (
                                  <div className="mcp-ed-field" key={fi}>
                                    <div className="mcp-ed-flabel">
                                      {f.label}
                                      {isPh && <span className="mcp-ed-req">{t("set.mcp.edReq")}</span>}
                                    </div>
                                    {f.hint && <div className="mcp-ed-fhint">{f.hint}</div>}
                                    <input
                                      className={"mcp-ed-input" + (isPh ? " ph" : "")}
                                      value={val}
                                      placeholder={isPh ? String(raw).replace(/[<>]/g, "") : ""}
                                      onChange={(e) => {
                                        const nv = e.target.value;
                                        if (f.kind === "arg")
                                          setMcpEditArgs((prev) => prev.map((x, i) => (i === f.idx ? nv : x)));
                                        else setMcpEditEnvMap((prev) => ({ ...prev, [f.key!]: nv }));
                                      }}
                                    />
                                  </div>
                                );
                              })}
                              <div className="mcp-ed-actions">
                                <button type="button" className="mcp-btn" onClick={() => setMcpEdit(null)}>
                                  {t("set.cancel")}
                                </button>
                                <button type="button" className="mcp-btn save" onClick={() => saveEditMcp(n)}>
                                  {t("set.mcp.saveReconnect")}
                                </button>
                              </div>
                            </div>
                          )}
                          {mcpExpanded === n && tools.length > 0 && (
                            <div className="mcp-tools">
                              {tools
                                .filter((t) => !q || t.name.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q))
                                .map((t) => (
                                  <div key={t.name} className="mcp-tool">
                                    <code>{t.name}</code>
                                    <span>{t.description}</span>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <div className="mcp-sec">{t("set.mcp.installable")}</div>
                    {MCP_CATALOG.filter(
                      (c) => !q || c.name.toLowerCase().includes(q) || c.label.includes(mcpSearch) || c.desc.includes(mcpSearch),
                    ).map((c) => {
                      const installed = names.includes(c.name);
                      return (
                        <div key={c.name} className="mcp-cat">
                          <div className="mcp-cat-info">
                            <span className="mcp-cat-label">
                              {mcpLabel(c, lang)} <code>{c.name}</code>
                            </span>
                            <span className="mcp-cat-desc">{mcpDesc(c, lang)}</span>
                          </div>
                          <button type="button" className="mcp-btn" disabled={installed} onClick={() => mcpInstall(c)}>
                            {installed ? t("set.mcp.installed") : t("set.mcp.install")}
                          </button>
                        </div>
                      );
                    })}

                    {/* 在线库：搜索整个官方 MCP Registry */}
                    {q.length >= 2 && (
                      <>
                        <div className="mcp-sec">{t("set.mcp.online")}{mcpSearching ? t("set.mcp.searching") : ""}</div>
                        {!mcpSearching && mcpOnline.length === 0 && (
                          <div className="mcp-empty">{t("set.mcp.onlineEmpty")}</div>
                        )}
                        {mcpOnline.map((r, i) => {
                          const key = r.fullName + ":" + r.version + ":" + i;
                          const open = mcpOnlineOpen === key;
                          const installed = names.includes(r.name);
                          return (
                            <div key={key} className={"mcp-cat col" + (open ? " open" : "")}>
                              <div className="mcp-cat-row">
                                <div
                                  className="mcp-cat-info clk"
                                  onClick={() => setMcpOnlineOpen(open ? null : key)}
                                  title={t("set.mcp.clickDetail")}
                                >
                                  <span className="mcp-cat-label">
                                    <code>{r.name}</code>
                                    {r.version && <span className="mcp-ver">v{r.version}</span>}
                                    <span className="mcp-more">{open ? "▴" : "▾"}</span>
                                  </span>
                                  <span className="mcp-cat-desc">{r.description}</span>
                                </div>
                                <button
                                  type="button"
                                  className="mcp-btn"
                                  disabled={installed}
                                  onClick={() => mcpInstall(r)}
                                >
                                  {installed ? t("set.mcp.installed") : t("set.mcp.install")}
                                </button>
                              </div>
                              {open && (
                                <div className="mcp-detail">
                                  <div className="mcp-d-row">
                                    <b>{t("set.mcp.dFullName")}</b>
                                    <span>{r.fullName}</span>
                                  </div>
                                  <div className="mcp-d-row">
                                    <b>{t("set.mcp.dDesc")}</b>
                                    <span>{r.description || t("set.mcp.dNone")}</span>
                                  </div>
                                  <div className="mcp-d-row">
                                    <b>{t("set.mcp.dInstall")}</b>
                                    <code>
                                      {r.command} {r.args.join(" ")}
                                    </code>
                                  </div>
                                  {r.repo && (
                                    <div className="mcp-d-row">
                                      <b>{t("set.mcp.dRepo")}</b>
                                      <a
                                        className="link-inline"
                                        onClick={() => window.wuwei.openExternal(r.repo)}
                                        style={{ marginLeft: 0 }}
                                      >
                                        {r.repo}
                                      </a>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {mcpLoadingMore && <div className="mcp-empty">{t("set.mcp.loadingMore")}</div>}
                        {!mcpLoadingMore && mcpCursor && mcpOnline.length > 0 && (
                          <div className="mcp-empty mcp-loadmore" onClick={loadMoreMcp}>
                            {t("set.mcp.loadMore")}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="mcp-foot">
                    <button type="button" className="link-inline" onClick={() => setMcpRawEdit((v) => !v)}>
                      {mcpRawEdit ? t("set.mcp.collapseJson") : t("set.mcp.advJson")}
                    </button>
                    <span className="mcp-path">~/.wuwei/mcp.json</span>
                  </div>
                  {mcpRawEdit && (
                    <>
                      <textarea
                        className="sysprompt-area mcp-raw"
                        value={mcpConfig}
                        onChange={(e) => {
                          setMcpConfig(e.target.value);
                          mcpTouchedRef.current = true;
                        }}
                        placeholder={tr("ui.app.mcpservers.name.command.npx.args.4b22ed1")}
                      />
                      <button
                        type="button"
                        className="link-inline"
                        onClick={() => {
                          window.wuwei.setMcp(mcpConfig);
                          mcpTouchedRef.current = false;
                          setTimeout(reloadMcpStatus, 2800);
                        }}
                      >
                        {t("set.mcp.saveReconnect")}
                      </button>
                    </>
                  )}
                </div>
              );
            })()}

          {/* ── 板块六：工具（当前生效的全部工具，列表/JSON 视图 + 详情）── */}
          {tab === "tools" &&
            (() => {
              const q = toolFilter.trim().toLowerCase();
              const filtered = toolGroups
                .map((g) => ({
                  ...g,
                  tools: q
                    ? g.tools.filter(
                        (t) =>
                          t.name.toLowerCase().includes(q) ||
                          t.description.toLowerCase().includes(q),
                      )
                    : g.tools,
                }))
                .filter((g) => g.tools.length > 0);
              const shownTotal = filtered.reduce((n, g) => n + g.tools.length, 0);
              const badge = (kind: ToolGroup["kind"]) =>
                kind === "builtin" ? t("set.tools.badgeBuiltin") : kind === "browser" ? t("set.tools.badgeBrowser") : t("set.tools.badgeMcp");
              return (
                <div className="tools-pane">
                  <div className="tools-bar">
                    <input
                      className="mcp-search"
                      value={toolFilter}
                      onChange={(e) => setToolFilter(e.target.value)}
                      placeholder={`${t("set.tools.search")}（${toolTotal}）`}
                    />
                    <div className="tools-viewsw">
                      <button
                        type="button"
                        className={"tv-btn" + (toolView === "list" ? " on" : "")}
                        onClick={() => setToolView("list")}
                      >
                        {t("set.tools.list")}
                      </button>
                      <button
                        type="button"
                        className={"tv-btn" + (toolView === "json" ? " on" : "")}
                        onClick={() => setToolView("json")}
                      >
                        {tr("set.tools.json")}</button>
                    </div>
                  </div>

                  {toolView === "json" ? (
                    <pre className="tools-json">
                      {JSON.stringify(
                        filtered.map((g) => ({
                          source: g.source,
                          kind: g.kind,
                          tools: g.tools.map((t) => ({
                            name: t.name,
                            description: t.description,
                            readOnly: t.readOnly,
                            inputSchema: t.inputSchema,
                          })),
                        })),
                        null,
                        2,
                      )}
                    </pre>
                  ) : filtered.length === 0 ? (
                    <div className="mcp-empty">{t("set.tools.noMatch")}</div>
                  ) : (
                    filtered.map((g) => (
                      <div key={g.source} className="tools-group">
                        <div className="tools-group-h">
                          <span className={"tools-badge k-" + g.kind}>{badge(g.kind)}</span>
                          <span className="tools-group-name">{g.source}</span>
                          <span className="tools-group-n">{g.tools.length}</span>
                        </div>
                        {g.tools.map((tool) => (
                          <button
                            key={tool.name}
                            type="button"
                            className="tool-row"
                            onClick={() => setToolSel(tool)}
                          >
                            <span className="tool-name">
                              {tool.name}
                              {tool.readOnly && <span className="tool-ro">{t("set.tools.readOnly")}</span>}
                            </span>
                            <span className="tool-desc">{toolDesc(tool.name, tool.description, lang)}</span>
                          </button>
                        ))}
                      </div>
                    ))
                  )}
                  {toolView === "list" && (
                    <div className="tools-count">
                      {t("set.tools.showing")} {shownTotal} / {toolTotal} {t("set.tools.toolsUnit")}
                    </div>
                  )}
                </div>
              );
            })()}

          {/* ── 板块七：密钥（本地加密保险箱，统一管理敏感密钥）── */}
          {tab === "secrets" && (
            <div className="secrets-pane">
              <p className="s-note">
                {t("set.sec.note")}
                {!secretsAvail && <b style={{ color: "var(--danger, #c0392b)" }}>{t("set.sec.unavailable")}</b>}
              </p>

              <div className="app-set-row" style={{ cursor: "default" }}>
                <div className="app-set-text">
                  <div className="app-set-label">{t("set.sec.detectTitle")}</div>
                  <div className="app-set-hint">
                    {t("set.sec.detectHint")}
                  </div>
                </div>
                <input
                  type="checkbox"
                  className="app-set-toggle"
                  checked={secretsDetect}
                  onChange={(e) => {
                    setSecretsDetect(e.target.checked);
                    setAppToggle({ secretsDetect: e.target.checked });
                  }}
                />
              </div>

              <div className="sec-add">
                <div className="sec-add-row">
                  <input
                    className="sec-in"
                    placeholder={t("set.sec.namePlaceholder")}
                    value={secNew.name}
                    onChange={(e) => setSecNew({ ...secNew, name: e.target.value })}
                  />
                  <input
                    className="sec-in"
                    type="password"
                    placeholder={t("set.sec.valuePlaceholder")}
                    value={secNew.value}
                    onChange={(e) => setSecNew({ ...secNew, value: e.target.value })}
                  />
                </div>
                <button type="button" className="sec-more-toggle" onClick={() => setSecMore((v) => !v)}>
                  {secMore ? t("set.sec.collapse") : t("set.sec.expand")}
                </button>
                {secMore && (
                  <div className="sec-add-row">
                    <input
                      className="sec-in"
                      placeholder={t("set.sec.envPlaceholder")}
                      value={secNew.envVar}
                      onChange={(e) => setSecNew({ ...secNew, envVar: e.target.value })}
                    />
                    <input
                      className="sec-in"
                      placeholder={t("set.sec.notePlaceholder")}
                      value={secNew.note}
                      onChange={(e) => setSecNew({ ...secNew, note: e.target.value })}
                    />
                  </div>
                )}
                <div className="sec-add-actions">
                  <button type="button" className="allow" onClick={addSecret} disabled={!secretsAvail}>
                    {t("set.sec.add")}
                  </button>
                  <button type="button" onClick={() => setSecImportOpen((v) => !v)} disabled={!secretsAvail}>
                    {t("set.sec.importEnv")}
                  </button>
                  {secErr && <span className="sec-err">{secErr}</span>}
                </div>
                {secImportOpen && (
                  <div className="sec-import">
                    <textarea
                      className="sec-import-ta"
                      placeholder={t("set.sec.importPlaceholder")}
                      value={secImportText}
                      onChange={(e) => setSecImportText(e.target.value)}
                    />
                    <button type="button" className="allow" onClick={doImportEnv}>
                      {t("set.sec.import")}
                    </button>
                  </div>
                )}
              </div>

              {secrets.length > 0 && (
                <div className="sec-reveal-bar">
                  {revealed ? (
                    <button type="button" className="sec-reveal-btn on" onClick={() => setRevealed(null)}>
                      <svg className="sec-ic" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                      {t("set.sec.hidePlain")}
                    </button>
                  ) : unlockOpen ? (
                    <div className="sec-unlock">
                      <input
                        type="password"
                        className="sec-in"
                        autoFocus
                        placeholder={t("set.sec.unlockPlaceholder")}
                        value={unlockPw}
                        onChange={(e) => setUnlockPw(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && doUnlock()}
                      />
                      <button type="button" className="allow" onClick={doUnlock}>
                        {t("set.sec.unlock")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setUnlockOpen(false);
                          setUnlockPw("");
                          setUnlockErr("");
                        }}
                      >
                        {t("set.cancel")}
                      </button>
                      {unlockErr && <span className="sec-err">{unlockErr}</span>}
                    </div>
                  ) : (
                    <button type="button" className="sec-reveal-btn" onClick={() => setUnlockOpen(true)}>
                      <svg className="sec-ic" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      {t("set.sec.revealPlain")}
                    </button>
                  )}
                </div>
              )}

              <div className="sec-list">
                {secrets.length === 0 ? (
                  <div className="mcp-empty">{t("set.sec.empty")}</div>
                ) : (
                  secrets.map((s) =>
                    secEdit === s.id ? (
                      // 编辑态：改名称/环境变量名/备注(值不动)
                      <div key={s.id} className="sec-row sec-row-edit">
                        <div className="sec-edit-fields">
                          <input
                            className="sec-in"
                            placeholder={t("set.sec.editName")}
                            value={secEditDraft.name}
                            onChange={(e) => setSecEditDraft((d) => ({ ...d, name: e.target.value }))}
                          />
                          <input
                            className="sec-in"
                            placeholder={t("set.sec.editEnvPlaceholder")}
                            value={secEditDraft.envVar}
                            onChange={(e) => setSecEditDraft((d) => ({ ...d, envVar: e.target.value }))}
                          />
                          <input
                            className="sec-in"
                            placeholder={t("set.sec.editNote")}
                            value={secEditDraft.note}
                            onChange={(e) => setSecEditDraft((d) => ({ ...d, note: e.target.value }))}
                          />
                          <div className="sec-edit-actions">
                            <button
                              type="button"
                              className="allow"
                              disabled={!secEditDraft.name.trim()}
                              onClick={async () => {
                                await window.wuwei.secretsUpdate(s.id, {
                                  name: secEditDraft.name.trim(),
                                  envVar: secEditDraft.envVar.trim() || undefined,
                                  note: secEditDraft.note.trim(),
                                });
                                setSecEdit(null);
                                reloadSecrets();
                              }}
                            >
                              {tr("set.st.save")}
                            </button>
                            <button type="button" onClick={() => setSecEdit(null)}>
                              {tr("set.st.cancel")}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div key={s.id} className="sec-row">
                        <div className="sec-row-left">
                          <div className="sec-row-top">
                            <span className="sec-name">{s.name}</span>
                            {s.envVar && <span className="sec-env">${s.envVar}</span>}
                          </div>
                          <div className="sec-row-sub">
                            <span className={"sec-mask" + (revealed ? " revealed" : "")}>
                              {revealed && revealed[s.id] != null ? revealed[s.id] : s.masked}
                            </span>
                            {s.note && <span className="sec-row-note">· {s.note}</span>}
                          </div>
                        </div>
                        <div className="sec-row-actions">
                          <button
                            type="button"
                            className="sec-edit-btn"
                            title={t("set.sec.editTitle")}
                            onClick={() => {
                              setSecEditDraft({ name: s.name, envVar: s.envVar || "", note: s.note || "" });
                              setSecEdit(s.id);
                            }}
                          >
                            {tr("set.st.editShort")}
                          </button>
                          <button
                            type="button"
                            className="sec-del"
                            title={t("set.sec.delete")}
                            onClick={async () => {
                              await window.wuwei.secretsDelete(s.id);
                              reloadSecrets();
                            }}
                          >
                            {t("set.sec.delete")}
                          </button>
                        </div>
                      </div>
                    ),
                  )
                )}
              </div>

              {/* 密钥说明提示词：拼进系统提示词的那段，查看/修改 */}
              <details className="sec-prompt" style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--text)" }}>
                  {t("set.sec.promptLabel")} {secretsPromptTouched ? t("set.pr.customized") : t("set.pr.default")}{t("set.sec.promptViewEdit")}
                </summary>
                <label className="field" style={{ marginTop: 8, display: "block" }}>
                  <textarea
                    className="sysprompt-area"
                    style={{ minHeight: 140, width: "100%" }}
                    value={secretsPrompt}
                    onChange={(e) => {
                      setSecretsPrompt(e.target.value);
                      setSecretsPromptTouched(true);
                    }}
                    onBlur={() => window.wuwei.setSecretsPrompt(secretsPromptTouched ? secretsPrompt : null)}
                    placeholder={t("set.sec.promptPlaceholder")}
                  />
                </label>
                <p className="s-note">
                  {t("set.sec.promptNote")}
                  {secretsPromptTouched && (
                    <button
                      type="button"
                      className="link-inline"
                      onClick={() => {
                        setSecretsPrompt(tr("agent.secretsNote", systemData.secretDelimiters, lang));
                        setSecretsPromptTouched(false);
                        window.wuwei.setSecretsPrompt(null);
                      }}
                    >
                      {t("set.pr.restore")}
                    </button>
                  )}
                </p>
              </details>
            </div>
          )}
        </div>

        <div className="btns">
          <button onClick={onClose}>{t("set.cancel")}</button>
          <button data-testid="settings-save" className="allow" onClick={() => save()}>
            {tab === "model" ? t("set.save") : t("set.saveOnly")}
          </button>
        </div>
        </div>
      </div>
    </div>

    {/* 添加/编辑 供应商/中转站：独立小弹窗，不撑爆主设置页 */}
    {showAddStation && (
      <div className="perm-overlay add-st-overlay" onClick={() => { setShowAddStation(false); setEditStationId(null); setEditIsBuiltin(false); }}>
        <div className="add-st-dialog" onClick={(e) => e.stopPropagation()}>
          <h3>{editIsBuiltin ? t("set.st.renameTitle") : editStationId ? t("set.st.editTitle") : t("set.st.addTitle")}</h3>

          {!editIsBuiltin && (
            <div className="st-field">
              <span className="st-label">{t("set.st.type")}</span>
              <div className="theme-pick">
                <button
                  type="button"
                  className={"theme-opt" + (!newStRelay ? " on" : "")}
                  onClick={() => setNewStRelay(false)}
                >
                  {t("set.st.selfhost")}
                </button>
                <button
                  type="button"
                  className={"theme-opt" + (newStRelay ? " on" : "")}
                  onClick={() => setNewStRelay(true)}
                >
                  {t("set.st.relayType")}
                </button>
              </div>
              <p className="st-hint">
                {newStRelay
                  ? t("set.st.relayHint")
                  : t("set.st.selfhostHint")}
              </p>
            </div>
          )}

          <div className="st-field">
            <span className="st-label">{t("set.st.name")}</span>
            <input
              className="st-input"
              autoFocus
              value={newStName}
              onChange={(e) => setNewStName(e.target.value)}
              placeholder={editIsBuiltin ? t("set.st.namePhBuiltin") : newStRelay ? t("set.st.namePhRelay") : t("set.st.namePhSelf")}
            />
          </div>

          {!editIsBuiltin && (
            <div className="st-field">
              <span className="st-label">{t("set.st.baseUrlLabel")}</span>
              <input
                className="st-input"
                value={newStUrl}
                onChange={(e) => setNewStUrl(e.target.value)}
                placeholder={t("set.st.baseUrlPh")}
              />
            </div>
          )}

          <p className="st-note">
            {editIsBuiltin
              ? t("set.st.noteBuiltin")
              : editStationId
                ? t("set.st.noteEdit")
                : t("set.st.noteAdd")}
          </p>
          <div className="btns">
            <button onClick={() => { setShowAddStation(false); setEditStationId(null); setEditIsBuiltin(false); }}>{t("set.st.cancel")}</button>
            <button className="allow" onClick={editStationId ? saveStationEdit : addStation}>
              {editStationId ? t("set.st.save") : t("set.st.add")}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* 工具详情：点某个工具弹出，看完整描述 + 入参 Schema */}
    {toolSel && (
      <div className="perm-overlay add-st-overlay" onClick={() => setToolSel(null)}>
        <div className="add-st-dialog tool-detail" onClick={(e) => e.stopPropagation()}>
          <h3>
            {toolSel.name}
            {toolSel.readOnly && <span className="tool-ro">{t("set.tools.readOnly")}</span>}
          </h3>
          <p className="s-note tool-detail-desc">{toolDesc(toolSel.name, toolSel.description, lang)}</p>
          <div className="tool-detail-label">{t("set.tools.detailSchema")}</div>
          <pre className="tools-json tool-detail-schema">
            {JSON.stringify(toolSel.inputSchema, null, 2)}
          </pre>
          <div className="btns" style={{ marginTop: 16 }}>
            <button className="allow" onClick={() => setToolSel(null)}>
              {t("set.tools.close")}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// 应用级设置弹窗(与具体平台无关的开关放这里)
function AppSettingsModal({
  onClose,
  groupMode,
  onGroupMode,
  streamMode,
  streamSpeed,
  onStream,
  keepRecent,
  onKeepRecent,
}: {
  onClose: () => void;
  groupMode: "manual" | "date" | "project";
  onGroupMode: (m: "manual" | "date" | "project") => void;
  streamMode: "typewriter" | "stream" | "instant";
  streamSpeed: number;
  onStream: (mode: "typewriter" | "stream" | "instant", speed: number) => void;
  keepRecent: number;
  onKeepRecent: (n: number) => void;
}) {
  const [theme, setTheme] = useState("light");
  const [compThr, setCompThr] = useState(""); // 压缩·token阈值(空=自动，按模型上下文80%)
  const [compMsgThr, setCompMsgThr] = useState(""); // 压缩·消息条数阈值(空/0=关，只按token)
  useEffect(() => {
    window.wuwei.getSettings().then((r: any) => {
      setTheme(resolveTheme(r?.settings?.theme));
      const ct = Number(r?.settings?.compactThreshold); if (Number.isFinite(ct) && ct > 0) setCompThr(String(ct));
      const cm = Number(r?.settings?.compactMsgThreshold); if (Number.isFinite(cm) && cm > 0) setCompMsgThr(String(cm));
    });
  }, []);
  // 选主题：实时预览 + 立即持久化(spread 现有 settings 只改 theme)
  async function pickTheme(t: string) {
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    const r: any = await window.wuwei.getSettings();
    window.wuwei.setSettings({ ...(r?.settings || {}), theme: t });
  }
  return (
    <div className="perm-overlay" onClick={onClose}>
      <div className="settings" onClick={(e) => e.stopPropagation()}>
        <h3>{tr("set.title")}</h3>
        <div className="app-set-group">{tr("ui.app.message.ef2a4f98e5")}</div>
        <div className="theme-pick" style={{ marginBottom: "6px" }}>
          {[
            { id: "manual", label: tr("set.g.manual") },
            { id: "date", label: tr("set.g.byDate") },
            { id: "project", label: tr("set.g.byProject") },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              className={"theme-opt" + (groupMode === m.id ? " on" : "")}
              onClick={() => onGroupMode(m.id as any)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="app-set-hint" style={{ marginBottom: "14px" }}>
          {tr("ui.app.message.46d09b8c4a")}</div>
        <div className="app-set-group">{tr("ui.app.message.ad545f242a")}</div>
        <div className="theme-pick" style={{ marginBottom: "6px" }}>
          {[
            { id: "stream", label: tr("ui.app.message.25c4a07b0c") },
            { id: "typewriter", label: tr("set.d.typewriter") },
            { id: "instant", label: tr("ui.app.message.3c597b4cc0") },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              className={"theme-opt" + (streamMode === m.id ? " on" : "")}
              onClick={() => onStream(m.id as any, streamSpeed)}
            >
              {m.label}
            </button>
          ))}
        </div>
        {streamMode === "typewriter" && (
          <div className="app-set-row" style={{ cursor: "default", gap: "10px" }}>
            <div className="app-set-label" style={{ whiteSpace: "nowrap" }}>
              {tr("set.d.typeSpeed")}</div>
            <input
              type="range"
              min={80}
              max={2000}
              step={20}
              value={streamSpeed}
              onChange={(e) => onStream("typewriter", Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <div className="app-set-hint" style={{ minWidth: 66, textAlign: "right" }}>
              {streamSpeed} {tr("ui.app.message.5b2905ffe0")}</div>
          </div>
        )}
        <div className="app-set-hint" style={{ marginBottom: "14px" }}>
          {tr("ui.app.message.20b4cefbd5")}</div>
        <div className="app-set-group">{tr("set.g.compaction")}</div>
        <div className="app-set-row" style={{ cursor: "default", gap: "10px" }}>
          <div className="app-set-label" style={{ whiteSpace: "nowrap" }}>
            {tr("ui.app.message.cbdefe144c")}</div>
          <input
            type="number"
            min={2}
            max={2000}
            value={keepRecent}
            onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ""); const n = Math.min(2000, Math.max(2, Number(v) || 2)); onKeepRecent(n); }}
            style={{ flex: 1, minWidth: 0 }}
          />
          <div className="app-set-hint" style={{ minWidth: 40, textAlign: "right" }}>{tr("ui.companyhistorysettings.messages.e958b0a")}</div>
        </div>
        <div className="app-set-hint" style={{ marginBottom: "14px" }}>
          {tr("ui.app.message.27446ce964")}</div>
        <div className="app-set-row" style={{ cursor: "default", gap: "10px" }}>
          <div className="app-set-label" style={{ whiteSpace: "nowrap" }}>{tr("ui.app.token.threshold.326b19a")}</div>
          <input type="number" min={0} placeholder={tr("ui.app.message.688aa8cd7e")} value={compThr}
            onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ""); setCompThr(v); window.wuwei.setCompact?.({ threshold: Number(v) || 0 }); }}
            style={{ flex: 1, minWidth: 0 }} />
        </div>
        <div className="app-set-hint" style={{ marginBottom: "10px" }}>
          {tr("ui.app.message.a4a1eac05e")}</div>
        <div className="app-set-row" style={{ cursor: "default", gap: "10px" }}>
          <div className="app-set-label" style={{ whiteSpace: "nowrap" }}>{tr("ui.app.message.f0a5394512")}</div>
          <input type="number" min={0} placeholder={tr("ui.app.message.6dcb699819")} value={compMsgThr}
            onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ""); setCompMsgThr(v); window.wuwei.setCompact?.({ msgThreshold: Number(v) || 0 }); }}
            style={{ flex: 1, minWidth: 0 }} />
        </div>
        <div className="app-set-hint" style={{ marginBottom: "14px" }}>
          {tr("ui.app.message.b7adbe729b")}</div>
        <div className="app-set-group">{tr("set.d.theme")}</div>
        <div className="theme-pick" style={{ marginBottom: "14px" }}>
          {[
            { id: "light", label: tr("ui.app.message.e57d7f1172") },
            { id: "gold", label: tr("ui.app.message.842eadeb2b") },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              className={"theme-opt theme-" + t.id + (theme === t.id ? " on" : "")}
              onClick={() => pickTheme(t.id)}
            >
              <span className="theme-sw" />
              {t.label}
            </button>
          ))}
        </div>
        <div className="app-set-group">{tr("set.g.claudeSub")}</div>
        <div className="app-set-row" style={{ cursor: "default" }}>
          <div className="app-set-text">
            <div className="app-set-label">{tr("ui.app.message.08f5ca95af")}</div>
            <div className="app-set-hint">
              {tr("ui.app.message.eb573c45df")}</div>
          </div>
        </div>
        <div className="btns">
          <button className="allow" onClick={onClose}>
            {tr("ui.app.message.008f981397")}</button>
        </div>
      </div>
    </div>
  );
}
