import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Individually verified against developers.openai.com/api/docs/models/<slug>.md.
// API total window includes output; maximum input is separately documented as 922000.
export const GPT_API_WINDOWS: Readonly<Record<string, number>> = {
  "gpt-6.1-sol": 1_050_000,
  "gpt-6-astra": 1_050_000,
  "gpt-6-sol": 1_050_000,
  "gpt-6-luna": 1_050_000,
};
// Observed in Codex 0.160.0 models_cache.json. Never use experimental max_context_window.
const CODEX_DEFAULTS: Readonly<Record<string, number>> = {
  "gpt-5.6-sol": 272_000,
  "gpt-5.6-terra": 272_000,
  "gpt-5.6-luna": 272_000,
  "gpt-5.5": 272_000,
  "gpt-6.1-sol": 272_000,
  "gpt-6-astra": 272_000,
  "gpt-6-sol": 272_000,
  "gpt-6-luna": 272_000,
};
export function positiveWindow(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}
export function codexWindow(model: string, readCache: () => string = () =>
  readFileSync(join(homedir(), ".codex", "models_cache.json"), "utf8")): number {
  try {
    const cache = JSON.parse(readCache());
    const rows = Array.isArray(cache?.models) ? cache.models : [];
    const row = rows.find((r: { slug?: string }) => r?.slug === model);
    const window = positiveWindow(row?.context_window);
    const max = positiveWindow(row?.max_context_window);
    if (window && (!max || window <= max)) return window;
  } catch { /* Missing, partial write or invalid JSON: exact-model fallback. */ }
  return CODEX_DEFAULTS[model] ?? 128_000;
}
export function resolveContextWindow(provider: string, model: string, fallback: number,
  explicit?: unknown, readCache?: () => string): number {
  const id = model.toLowerCase();
  const supported = provider === "codex" ? codexWindow(id, readCache) : GPT_API_WINDOWS[id];
  const requested = positiveWindow(explicit);
  // Codex explicit overrides may reduce the default, never implicitly enable experimental context.
  // Known API models cannot claim more than their documented total window.
  return requested ? supported ? Math.min(requested, supported) : requested : supported ?? fallback;
}
export function compactThresholdFor(window: number, explicit?: unknown): number {
  // Preserve explicit zero (disabled); positive custom thresholds are bounded to the window.
  if (explicit === 0 || explicit === "0") return 0;
  const n = positiveWindow(explicit);
  return n ? Math.min(n, window) : Math.floor(window * 0.8);
}
export function parseServerContextLimit(raw: string): number {
  const m = raw.match(/(?:prompt is too long|too many tokens)[:\s]*[\d,]+\s*tokens\s*>\s*([\d,]+)/i)
    ?? raw.match(/maximum context length is\s*([\d,]+)/i);
  return m ? positiveWindow(m[1].replace(/,/g, "")) ?? 0 : 0;
}
