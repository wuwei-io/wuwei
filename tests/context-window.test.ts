import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codexWindow, resolveContextWindow, compactThresholdFor, GPT_API_WINDOWS } from "../src/context-window.js";
import { Agent } from "../src/agent/loop.js";
import { loadConfig } from "../src/config.js";
import { makeProvider } from "../src/agent/provider.js";
import type { Provider } from "../src/types.js";

const missing = () => { throw new Error("ENOENT"); };
for (const model of Object.keys(GPT_API_WINDOWS)) {
  test(`${model}: API/Codex/cache missing/bad JSON/explicit bounds`, () => {
    const cache = () => JSON.stringify({ models: [{ slug: model, context_window: 272000, max_context_window: 872000, effective_context_window_percent: 95 }] });
    assert.equal(resolveContextWindow("openai", model, 128000), 1050000);
    assert.equal(resolveContextWindow("codex", model, 128000, undefined, cache), 272000);
    assert.equal(resolveContextWindow("codex", model, 128000, undefined, missing), 272000);
    assert.equal(resolveContextWindow("codex", model, 128000, undefined, () => "{"), 272000);
    assert.equal(resolveContextWindow("codex", model, 128000, 872000, cache), 272000);
    assert.equal(resolveContextWindow("codex", model, 128000, 200000, cache), 200000);
    assert.equal(resolveContextWindow("openai", model, 128000, 2000000), 1050000);
    assert.equal(resolveContextWindow("openai", model, 128000, 500000), 500000);
    assert.equal(compactThresholdFor(272000), 217600);
    assert.equal(compactThresholdFor(1050000), 840000);
  });
}
test("cache file IO, unknown slug, malformed rows and invalid bounds", () => {
  const dir = mkdtempSync(join(tmpdir(), "wuwei-context-"));
  try {
    const path = join(dir, "models_cache.json");
    const read = () => readFileSync(path, "utf8");
    assert.equal(codexWindow("unknown", read), 128000);
    writeFileSync(path, "{");
    assert.equal(codexWindow("unknown", read), 128000);
    for (const data of [{ models: null }, { models: [null] }, { models: [{ slug: "unknown", context_window: -1 }] }]) {
      writeFileSync(path, JSON.stringify(data));
      assert.equal(codexWindow("unknown", read), 128000);
    }
    writeFileSync(path, JSON.stringify({ models: [{ slug: "unknown", context_window: 512000, max_context_window: 872000 }] }));
    assert.equal(codexWindow("unknown", read), 512000); // No stale global 400k cap.
    assert.equal(codexWindow("other", read), 128000); // Exact slug only.
    assert.equal(resolveContextWindow("codex", "other", 1000000, 1000000, read), 128000);
    assert.equal(resolveContextWindow("openai", "gpt-6-future", 128000), 128000);
    assert.equal(resolveContextWindow("openai", "custom-local", 128000, 64000), 64000);
    for (const value of [-1, Infinity, "broken", 1.5]) assert.equal(resolveContextWindow("openai", "custom", 128000, value), 128000);
  } finally { rmSync(dir, { recursive: true }); }
});
function provider(window: number): Provider {
  return { name: "test", contextWindow: window, compactThreshold: compactThresholdFor(window),
    async complete() { return { content: [{ type: "text", text: "ok" }], stopReason: "end_turn" }; } };
}
test("Agent model switching, isolated budgets and explicit compact thresholds", () => {
  const a = new Agent(provider(272000), "", [], { cwd: "." }, new Map());
  const b = new Agent(provider(128000), "", [], { cwd: "." }, new Map());
  assert.deepEqual(a.getContextBudget(), { contextWindow: 272000, compactThreshold: 217600 });
  a.setProvider(provider(1050000));
  assert.deepEqual(a.getContextBudget(), { contextWindow: 1050000, compactThreshold: 840000 });
  assert.deepEqual(b.getContextBudget(), { contextWindow: 128000, compactThreshold: 102400 });
  a.setCompactOpts({ compactThreshold: 150000 });
  a.setProvider(provider(272000));
  assert.equal(a.getContextBudget().compactThreshold, 150000);
  a.setCompactOpts({ compactThreshold: undefined });
  assert.equal(a.getContextBudget().compactThreshold, 217600);
  assert.equal(a.learnContextLimit("maximum context length is 200,000"), true);
  assert.deepEqual(a.getContextBudget(), { contextWindow: 200000, compactThreshold: 160000 });
  assert.equal(a.learnContextLimit("maximum context length is 872000"), false);
  a.setProvider(provider(1050000));
  assert.equal(a.getContextBudget().contextWindow, 1050000); // Learned bound reset for new model.
  assert.equal(compactThresholdFor(272000, 900000), 272000);
  assert.equal(compactThresholdFor(272000, 0), 0);
});
test("actual Agent error hook synchronizes budget before overflow retry/failure", async () => {
  const p = provider(272000);
  p.complete = async () => { throw new Error("prompt is too long: 303245 tokens > 200000 maximum"); };
  const a = new Agent(p, "", [], { cwd: "." }, new Map());
  const learned: number[] = [];
  await assert.rejects(a.send("hello", { onContextWindow: w => learned.push(w) }));
  assert.deepEqual(learned, [200000]);
  assert.equal(a.getContextBudget().compactThreshold, 160000);
});
test("loadConfig -> makeProvider -> Agent uses same budget as desktop config", () => {
  const keys = ["MINICC_PROVIDER", "MINICC_MODEL", "MINICC_CONTEXT_WINDOW", "MINICC_COMPACT_THRESHOLD"];
  const old = keys.map(k => process.env[k]);
  try {
    process.env.MINICC_PROVIDER = "openai";
    process.env.MINICC_MODEL = "gpt-6.1-sol";
    delete process.env.MINICC_CONTEXT_WINDOW;
    delete process.env.MINICC_COMPACT_THRESHOLD;
    const cfg = loadConfig();
    const a = new Agent(makeProvider(cfg), "", [], { cwd: "." }, new Map());
    assert.deepEqual(a.getContextBudget(), { contextWindow: cfg.contextWindow, compactThreshold: cfg.compactThreshold });
    assert.equal(cfg.contextWindow, 1050000);
  } finally { keys.forEach((k, i) => { if (old[i] === undefined) delete process.env[k]; else process.env[k] = old[i]; }); }
});
