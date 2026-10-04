import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Agent } from '../src/agent/loop.ts';
import { dedupeDisplayedToolImages } from '../desktop/renderer/src/imageResults.ts';

test('saved and streaming tool lists show a generated image once per user turn', () => {
  const items = [
    { type: 'user', images: ['a'] },
    { type: 'tool', name: 'codex_imagegen', image: 'a' },
    { type: 'assistant', text: 'saved' },
    { type: 'tool', name: 'send_image', image: 'a' },
    { type: 'tool', name: 'send_image', image: 'b' },
    { type: 'tool', name: 'screenshot', image: 'a' },
    { type: 'user', text: 'send it again' },
    { type: 'tool', name: 'send_image', image: 'a' },
  ];
  const before = structuredClone(items);
  const result = dedupeDisplayedToolImages(items);
  assert.equal(result[3].image, undefined);
  assert.equal(result[4].image, 'b');
  assert.equal(result[5].image, 'a');
  assert.equal(result[7].image, 'a');
  assert.deepEqual(items, before);
});

test('Agent keeps successful tool results but suppresses a duplicate display image, and permits an explicit later resend', async () => {
  const call = (id, name) => ({ type: 'tool_use', id, name, input: {} });
  const replies = [
    { content: [call('gen', 'codex_imagegen'), call('send', 'send_image')], stopReason: 'tool_use' },
    { content: [{ type: 'text', text: 'done' }], stopReason: 'end_turn' },
    { content: [call('resend', 'send_image')], stopReason: 'tool_use' },
    { content: [{ type: 'text', text: 'sent' }], stopReason: 'end_turn' },
  ];
  const provider = { name: 'codex', generateImage: async () => {}, complete: async () => replies.shift() };
  const tools = ['codex_imagegen', 'send_image'].map(name => ({ name, description: '', inputSchema: {},
    run: async () => ({ content: 'ok', displayImage: 'data:image/png;base64,a' }) }));
  const agent = new Agent(provider, '', tools, { cwd: '.' }, new Map(tools.map(t => [t.name, t])), { compactThreshold: 0 });
  const displays = [];
  const hooks = { onToolEnd: (_id, text, error, image) => { assert.equal(text, 'ok'); assert(!error); if (image) displays.push(image); } };
  await agent.send('draw a picture', hooks);
  assert.equal(displays.length, 1);
  const toolResults = agent.messages.flatMap(m => m.content).filter(b => b.type === 'tool_result');
  assert.equal(toolResults.length, 2);
  assert.equal(toolResults.filter(b => Array.isArray(b.content)).length, 1);
  await agent.send('show the picture again', hooks);
  assert.equal(displays.length, 2);
});

test('Agent preserves distinct generated pictures and repeated screenshots supplied to the model', async () => {
  let step = 0;
  const tools = [
    { name: 'first', run: async () => ({ content: 'ok', displayImage: 'a' }) },
    { name: 'second', run: async () => ({ content: 'ok', displayImage: 'b' }) },
    { name: 'shot1', run: async () => ({ content: 'ok', image: 'a' }) },
    { name: 'shot2', run: async () => ({ content: 'ok', image: 'a' }) },
  ].map(t => ({ ...t, description: '', inputSchema: {} }));
  const provider = { name: 'openai', complete: async () => ++step === 1
    ? { content: tools.map(t => ({ type: 'tool_use', id: t.name, name: t.name, input: {} })), stopReason: 'tool_use' }
    : { content: [{ type: 'text', text: 'done' }], stopReason: 'end_turn' } };
  const agent = new Agent(provider, '', tools, { cwd: '.' }, new Map(tools.map(t => [t.name, t])), { compactThreshold: 0 });
  const displayed = [];
  await agent.send('work', { onToolEnd: (_id, _text, _error, image) => displayed.push(image) });
  assert.deepEqual(displayed, ['a', 'b', 'a', 'a']);
});
