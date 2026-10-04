import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Agent } from '../src/agent/loop.ts';
import { codexImageTool } from '../src/tools/codex-imagegen.ts';
const tool = { ...codexImageTool, run: async (_input, ctx) => ({ content: String(await ctx.generateImage({ prompt: 'robot' })) }) };
const map = new Map([[tool.name, tool]]);
const done = { content: [{ type: 'text', text: 'done' }], stopReason: 'end_turn' };
const call = { content: [{ type: 'tool_use', id: 'call-1', name: tool.name, input: { prompt: 'robot' } }], stopReason: 'tool_use' };

test('switching providers exposes the subscription tool only on a capable provider', async () => {
  const seen = [];
  const plain = { name: 'openai', complete: async (_s, _m, tools) => { seen.push(tools.map(t => t.name)); return done; } };
  const subscription = { ...plain, name: 'codex', generateImage: async () => 'account-a' };
  const agent = new Agent(plain, '', [tool], { cwd: '.' }, map, { compactThreshold: 0 });
  await agent.send('hi', {});
  agent.setProvider(subscription); await agent.send('hi', {});
  agent.setProvider(plain); await agent.send('hi', {});
  assert.deepEqual(seen, [[], ['codex_imagegen'], []]);
});

test('an in-flight subscription call keeps its requesting provider when UI selection changes', async () => {
  let steps = 0, generated = 0, text; let agent;
  const plain = { name: 'openai', complete: async () => done };
  const subscription = { name: 'codex', generateImage: async () => { generated++; return 'account-a'; }, complete: async () => {
    steps++; agent.setProvider(plain); return call;
  } };
  agent = new Agent(subscription, '', [tool], { cwd: '.' }, map, { compactThreshold: 0 });
  await agent.send('draw', { onToolEnd: (_id, content) => { text = content; } });
  assert.equal(steps, 1); assert.equal(generated, 1); assert.equal(text, 'account-a');
});

test('a non-subscription provider cannot invoke a hidden image tool', async () => {
  let steps = 0, generated = 0;
  const plain = { name: 'openai', complete: async () => ++steps === 1 ? call : done };
  const agent = new Agent(plain, '', [tool], { cwd: '.', generateImage: async () => { generated++; } }, map, { compactThreshold: 0 });
  await agent.send('draw', {});
  assert.equal(generated, 0);
  assert.ok(agent.messages.flatMap(m => m.content).some(b => b.type === 'tool_result' && b.is_error));
});

test('existing tool permission rejection prevents a billable subscription call', async () => {
  let steps = 0, generated = 0;
  const subscription = { name: 'codex', generateImage: async () => { generated++; }, complete: async () => ++steps === 1 ? call : done };
  const agent = new Agent(subscription, '', [tool], { cwd: '.' }, map, { compactThreshold: 0 });
  await agent.send('draw', { requestPermission: async () => 'deny' });
  assert.equal(generated, 0);
});
