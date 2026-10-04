import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { RemoteDecisions } from '../desktop/main/remote-decisions.ts';
import { runRemoteSessionTurn } from '../desktop/main/remote-sessions.ts';
import { Agent } from '../src/agent/loop.ts';
import { TOOL_MAP } from '../src/tools/index.ts';
const decision = (overrides = {}) => ({ permId: 'p1', risk: 'high', title: '需要你决定', question: '要先备份再修改吗？',
  options: [{ label: '先备份', value: 'backup', recommended: true }, { label: '暂缓', value: 'wait' }], allowCustom: true, timeoutSec: .025, ...overrides });
const tick = () => new Promise(r => setImmediate(r));
test('high-risk decisions outlive deadlines, invalid replies do not consume them, custom reply resumes once', async () => {
  const pool = new RemoteDecisions(), frames = [], ac = new AbortController();
  const pending = pool.request('r1', decision(), { sessionId: 'original' }, true, ac.signal, e => frames.push(e));
  await sleep(70); assert.equal(pool.list().length, 1); assert.equal(frames[0].timeoutSec, null);
  assert.equal(pool.decide('p1', { action: 'reply', value: 'invented' }), false);
  assert.equal(pool.decide('p1', { action: 'reply', text: '先导出用户表' }, 'wrong'), false);
  assert.equal(pool.decide('p1', { action: 'reply', text: '先导出用户表' }, 'r1'), true);
  assert.deepEqual(await pending, { action: 'reply', text: '先导出用户表' });
  assert.equal(pool.decide('p1', { action: 'deny' }), false); assert.equal(pool.list().length, 0);
  assert.equal(frames.filter(f => f.type === 'decision-resolved').length, 1);
});
test('only low-risk opted-in decisions expire; disabling policy cancels current and later timers', async () => {
  const pool = new RemoteDecisions(), ac = new AbortController();
  const auto = pool.request('auto', decision({ risk: 'low' }), {}, true, ac.signal, () => {});
  assert.deepEqual(await auto, { action: 'reply', value: 'backup', reason: 'timeout' });
  const held = pool.request('held', decision({ risk: 'low' }), {}, true, ac.signal, () => {});
  pool.setSmartTimer(false); await sleep(60); assert.equal(pool.list()[0].decision.timeoutSec, null);
  const later = pool.request('later', decision({ permId: 'p2', risk: 'low' }), {}, true, ac.signal, () => {});
  await sleep(60); assert.equal(pool.list().length, 2);
  ac.abort(); assert.equal((await held).reason, 'abort'); assert.equal((await later).reason, 'abort');
});
test('real Agent resumes original history after a structured custom reply, persists input and shares its running lock', async () => {
  const pool = new RemoteDecisions(), ac = new AbortController(), running = new Map();
  const tool = TOOL_MAP.get('ask_decision'); let count = 0, receivedHistory, persisted = [], changed = [];
  const provider = { name: 'test', complete: async (_sys, messages, tools, hooks) => {
    receivedHistory = structuredClone(messages); assert.ok(tools.some(t => t.name === 'ask_decision'));
    if (++count === 1) return { content: [{ type: 'tool_use', id: 'decision-call', name: 'ask_decision', input: { ...decision(), risk: 'high' } }], stopReason: 'tool_use' };
    const result = messages.flatMap(m => m.content).find(b => b.type === 'tool_result'); assert.match(result.content, /先导出用户表/);
    hooks.onText('已按你的回复完成'); return { content: [{ type: 'text', text: '已按你的回复完成' }], stopReason: 'end_turn' };
  }};
  const agent = new Agent(provider, '', [tool], { cwd: '.' }, new Map([[tool.name, tool]]), { compactThreshold: 0 });
  agent.setMessages([{ role: 'user', content: [{ type: 'text', text: '之前讨论的表结构' }] }, { role: 'assistant', content: [{ type: 'text', text: '已记住背景' }] }]);
  const deps = { running, exists: id => id === 'original', prepare: () => agent,
    persist: () => persisted.push(structuredClone(agent.getMessages())), changed: id => changed.push(id) };
  const deltas = []; let actualId;
  const turn = { sessionId: 'original', text: '接着处理', signal: ac.signal, onSession: id => { actualId = id; },
    hooks: { onText: delta => deltas.push(delta), requestDecision: d => pool.request('r', d, { sessionId: 'original' }, false, ac.signal, () => {}) } };
  const result = runRemoteSessionTurn(turn, deps); await tick();
  await assert.rejects(runRemoteSessionTurn(turn, deps), /正在执行/);
  assert.equal(pool.list().length, 1); assert.equal(actualId, 'original');
  assert.equal(persisted[0].at(-1).content[0].text, '接着处理');
  pool.decide(pool.list()[0].permId, { action: 'reply', text: '先导出用户表' });
  assert.equal((await result).sessionId, 'original'); assert.equal(running.size, 0);
  assert.equal(receivedHistory[0].content[0].text, '之前讨论的表结构');
  assert.equal(agent.getMessages().filter(m => m.content.some(b => b.type === 'text' && b.text === '接着处理')).length, 1);
  assert.deepEqual(deltas, ['已按你的回复完成']); assert.equal(changed.length, 2);
  await assert.rejects(runRemoteSessionTurn({ ...turn, sessionId: 'unknown' }, deps), /不存在该会话/);
});
test('ask_decision is hidden without a real responder and rejects a one-option fake decision', async () => {
  const tool = TOOL_MAP.get('ask_decision');
  assert.equal((await tool.run({ ...decision(), options: [decision().options[0]] }, { cwd: '.', requestDecision: async () => ({ action: 'deny' }) })).isError, true);
  const provider = { name: 'test', complete: async (_sys, _messages, tools) => {
    assert.ok(!tools.some(t => t.name === 'ask_decision')); return { content: [{ type: 'text', text: 'done' }], stopReason: 'end_turn' };
  }};
  const agent = new Agent(provider, '', [tool], { cwd: '.' }, new Map([[tool.name, tool]]), { compactThreshold: 0 });
  await agent.send('test', {});
});

test('stopping via the shared task controller releases a pending decision and cancels inherited work', { timeout: 1000 }, async () => {
  const running = new Map();
  const transport = new AbortController();
  let inheritedSignal, asked = false;
  const tool = { name: 'hold_child', description: 'fixture', inputSchema: { type: 'object' }, readOnly: true,
    run: async (_input, ctx) => { inheritedSignal = ctx.remoteExecution.signal; return { content: JSON.stringify(await ctx.requestDecision(decision())) }; } };
  const provider = { name: 'fixture', complete: async () => ({ content: [{ type: 'tool_use', id: 'hold', name: 'hold_child', input: {} }], stopReason: 'tool_use' }) };
  const agent = new Agent(provider, '', [tool], { cwd: '.' }, new Map([[tool.name, tool]]), { compactThreshold: 0 });
  const result = runRemoteSessionTurn({ sessionId: 'original', text: '先等待决定', signal: transport.signal, onSession: () => {},
    hooks: { remoteExecution: { shareSubscription: false }, requestDecision: () => { asked = true; return new Promise(() => {}); } } },
    { running, exists: () => true, prepare: () => agent, persist: () => {}, changed: () => {} });
  const rejected = assert.rejects(result, /已停止/);
  await tick(); assert.equal(asked, true);
  running.get('original').abort();
  await rejected;
  assert.equal(inheritedSignal.aborted, true); assert.equal(transport.signal.aborted, false); assert.equal(running.size, 0);
});
