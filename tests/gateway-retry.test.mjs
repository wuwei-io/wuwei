import {currentMessageAudit} from '../src/media/message-audit-context.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { isTerminalGatewayError, isTerminalGatewayResponse } from '../src/gateway-retry.ts';
import { usageLimitKind, usageLimitDestination } from '../src/usage-limit.ts';

// Exercise the actual transport, error conversion and Agent retry decision,
// replacing only I/O, localization and delays. Never call a live model.
function declarations(file, names) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  return ast.statements.filter(s => names.includes(s.name?.text)).map(s => s.getText(ast)).join('\n');
}
const providerCode = declarations('../src/agent/provider.ts', ['fetchWithRetry', 'gwCode', 'humanizeGatewayError', 'OpenAIProvider']);
const loopCode = declarations('../src/agent/loop.ts', ['isTransientNetErr']);
const loopSource = fs.readFileSync(new URL('../src/agent/loop.ts', import.meta.url), 'utf8');
const loopAst = ts.createSourceFile('loop.ts', loopSource, ts.ScriptTarget.Latest, true);
const agentCode = loopAst.statements.filter(s => !ts.isImportDeclaration(s)).map(s => s.getText(loopAst)).join('\n');
function harness(responses, redirect = url => url) {
  const calls = [], sleeps = [];
  const context = vm.createContext({
    Response, Headers, AbortController, DOMException, Error, Math, Number, String, process, exports: {},
    currentMessageAudit, CLIENT_OS: 'test', devGatewayUrl: redirect, isTerminalGatewayResponse, isTerminalGatewayError,
    fetch: async url => { calls.push(url); const response = responses.shift(); if (!response) throw Error('Unexpected resend'); return response; },
    sleep: async (ms, signal) => { if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); sleeps.push(ms); }, backoffMs: () => 1,
    tr: key => key, randomUUID: () => 'isolated-request', toOpenAIMessages: () => [],
    isWuweiHostedGateway: url => url.includes('wuweiai.io/api/gateway'), readGatewayAffordability: () => undefined,
    runHostedTurn: async (_provider, run, signal = new AbortController().signal) => run(signal),
    withResponseLanguage: s => s, withImageToolInstructions: s => s,
    parseServerContextLimit: () => 0,
  });
  const js = ts.transpileModule(providerCode + '\n' + loopCode + '\nglobalThis.api = {fetchWithRetry,isTransientNetErr,OpenAIProvider};', {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInContext(js, context);
  vm.runInContext(ts.transpileModule(agentCode, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
  return { ...context.api, Agent: context.exports.Agent, calls, sleeps };
}
const url = 'https://gw.wuweiai.io/api/gateway/v1/chat/completions';
const reply = (code, status = 429, extra = {}) => new Response(JSON.stringify({ error: { type: 'gateway_error', code, ...extra } }), { status });
const limits = ['daily_cap_reached', 'free_daily_cap_reached', 'free_quota_exhausted', 'free_trial_disabled', 'anon_login_required', 'insufficient_balance', 'invalid_token', 'model_not_priced'];

for (const code of limits) test(`${code}: one request, original body preserved, no Agent retry`, async () => {
  const original = reply(code);
  const h = harness([original]);
  const res = await h.fetchWithRetry(url, { method: 'POST' });
  assert.equal(res, original);
  assert.equal((await res.json()).error.code, code);
  assert.equal(h.calls.length, 1);
  assert.equal(h.sleeps.length, 0);
  assert.equal(h.isTransientNetErr(Object.assign(new Error(`[[gw:${code}]] localized network message`), { status: 429 })), false);
});

test('actual OpenAI error conversion reaches quota UI immediately for guests and signed-in users', async () => {
  const h = harness([reply('daily_cap_reached', 429, { cap: 3, scope: 'device', free: true })]);
  const provider = new h.OpenAIProvider({ model: 'openrouter-auto-free', baseUrl: 'https://gw.wuweiai.io/api/gateway/v1', maxTokens: 100, apiKey: 'isolated' });
  await assert.rejects(provider.complete('', [], [], {}), error => {
    assert.equal(error.gatewayCode, 'daily_cap_reached');
    assert.equal(h.isTransientNetErr(error), false);
    const kind = usageLimitKind(error.message, true);
    assert.equal(kind, 'free');
    assert.equal(usageLimitDestination(kind, null), 'login');
    assert.equal(usageLimitDestination(kind, { coin: { balance: 0 } }), 'pay');
    return true;
  });
  assert.equal(h.calls.length, 1);
  assert.equal(h.sleeps.length, 0);
});

test('full Agent turn stops on a gateway cap without entering its outer retry loop', async () => {
  const h = harness([reply('daily_cap_reached', 429, { cap: 3, scope: 'device', free: true })]);
  const provider = new h.OpenAIProvider({ model: 'openrouter-auto-free', baseUrl: 'https://gw.wuweiai.io/api/gateway/v1', maxTokens: 100, apiKey: 'isolated' });
  const agent = new h.Agent(provider, '', [], {}, new Map());
  let retries = 0, ended = 0;
  await assert.rejects(agent.send('isolated test', { onRetry: () => retries++, onTurnEnd: () => ended++ }), /\[\[gw:daily_cap_reached\]\]/);
  assert.equal(h.calls.length, 1);
  assert.equal(retries, 0);
  assert.equal(ended, 1);
  assert.equal(agent.getMessages()[0].content[0].text, 'isolated test');
});

for (const code of ['upstream_error', 'upstream_rate_limited', 'upstream_unavailable', 'auth_unavailable']) test(`${code} still retries and recovers`, async () => {
  const recovered = new Response('recovered');
  const h = harness([reply(code, 503), recovered]);
  assert.equal(await h.fetchWithRetry(url, {}), recovered);
  assert.equal(h.calls.length, 2);
  assert.equal(h.sleeps.length, 1);
  assert.equal(h.isTransientNetErr(Object.assign(new Error(`[[gw:${code}]] localized`), { status: 503 })), true);
});

test('third-party 429 and non-JSON temporary gateway failures keep recovery', async () => {
  for (const [target, response] of [['https://example.invalid/v1/chat/completions', reply('daily_cap_reached')], [url, new Response('temporary', { status: 502 })]]) {
    const recovered = new Response('recovered');
    const h = harness([response, recovered]);
    assert.equal(await h.fetchWithRetry(target, {}), recovered);
    assert.equal(h.calls.length, 2);
  }
});

test('hosted retry budget is retained and abort does not resend', async () => {
  const h = harness([reply('upstream_error', 503), reply('upstream_error', 503), reply('upstream_error', 503)]);
  assert.equal((await h.fetchWithRetry(url, {})).status, 503);
  assert.equal(h.calls.length, 3);
  const controller = new AbortController(); controller.abort();
  const a = harness([reply('upstream_error', 503)]);
  await assert.rejects(a.fetchWithRetry(url, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(a.calls.length, 1);
});

test('loopback development redirect still recognizes hosted terminal errors', async () => {
  const h = harness([reply('daily_cap_reached')], () => 'http://127.0.0.1:9999/api/gateway/v1/chat/completions');
  assert.equal((await h.fetchWithRetry(url, {})).status, 429);
  assert.equal(h.calls.length, 1);
  assert.equal(h.sleeps.length, 0);
});

test('only structured gateway errors or stable markers override network recovery', () => {
  assert.equal(isTerminalGatewayResponse({ error: { code: 'daily_cap_reached' } }), false);
  assert.equal(isTerminalGatewayResponse(null), false);
  assert.equal(isTerminalGatewayError(Object.assign(new Error('localized'), { gatewayCode: 'daily_cap_reached' })), true);
  assert.equal(isTerminalGatewayError(new Error('daily_cap_reached')), false);
  assert.equal(isTerminalGatewayError(new Error('[[gw:upstream_error]] daily_cap_reached')), false);
  assert.equal(isTerminalGatewayResponse({ error: { type: 'gateway_error', code: 'new_product_restriction' } }), true);
});
