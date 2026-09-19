// 翻译显示层（tx）：一键把中文「动态内容」(会话/员工/群标题与名字、消息正文)临时译成英文，
// 专供发 X 英文版截图。铁律：纯覆盖显示，绝不写回任何底层数据/消息/员工档案。
//
// 工作方式：
//  - translateMode 关 → tx(原文) 直接返回原文。
//  - translateMode 开 → 命中缓存返回英文译文；未命中先返回原文并异步批量翻译，
//    翻好写入缓存并 notify 触发订阅组件 re-render 显示英文。
//  - 缓存以「原文」为 key 常驻内存：来回切语言直接命中，不重复请求。
import { useEffect, useReducer } from "react";

const cache = new Map<string, string>(); // 原文 → 英文译文（含兜底：翻不动时存原文本身，避免反复重试）
const pending = new Set<string>(); // 本批待翻译（去重）
let mode = false; // 翻译显示态开关
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((f) => {
    try {
      f();
    } catch {
      /* ignore */
    }
  });
}

export function isTxMode(): boolean {
  return mode;
}

// 由快捷键统一驱动：开=翻译显示，关=还原中文原文。
export function setTxMode(on: boolean): void {
  if (mode === on) return;
  mode = on;
  notify();
}

function flush() {
  flushTimer = null;
  const batch = Array.from(pending);
  pending.clear();
  if (batch.length === 0) return;
  const w = (window as unknown as { wuwei?: { translateBatch?: (t: string[]) => Promise<string[]> } }).wuwei;
  if (!w?.translateBatch) {
    batch.forEach((s) => cache.set(s, s)); // 无接口 → 兜底存原文，避免每帧重排
    return;
  }
  w.translateBatch(batch)
    .then((out) => {
      let changed = false;
      batch.forEach((src, i) => {
        const v = out?.[i];
        const val = typeof v === "string" && v.trim() ? v : src;
        if (cache.get(src) !== val) {
          cache.set(src, val);
          changed = true;
        }
      });
      if (changed) notify();
    })
    .catch(() => {
      batch.forEach((s) => {
        if (!cache.has(s)) cache.set(s, s);
      });
    });
}

// 含中日韩表意文字才翻；纯英文/数字/符号无需送翻，省请求也避免误改。
const CJK = /[㐀-鿿豈-﫿]/;

export function tx(s: string | null | undefined): string {
  const str = s == null ? "" : String(s);
  if (!mode || !str.trim() || !CJK.test(str)) return str;
  const hit = cache.get(str);
  if (hit !== undefined) return hit;
  if (!pending.has(str)) {
    pending.add(str);
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 150); // 合批：150ms 内的所有请求一次发出
  }
  return str; // 翻译中先显原文，翻好后由 notify 触发替换
}

// 订阅钩子：mode 切换或译文到货时强制本组件 re-render。凡渲染动态文本的组件调用一次即可。
// 用组件内部 state 更新，故即使外层 React.memo 拦住 props 变化也能刷新。
export function useTx(): typeof tx {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);
  return tx;
}
