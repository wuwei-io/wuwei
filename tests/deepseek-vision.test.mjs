import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeProvider } from '../src/agent/provider.ts';
import { Agent } from '../src/agent/loop.ts';

// Intercept the real provider's HTTP payload; no credentials or billable calls.
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=';
const done = { choices: [{ delta: { content: 'read the image' }, finish_reason: 'stop' }] };
const config = (model, patch = {}) => ({
  provider: 'openai', authMode: 'api-key', model, apiKey: 'test-only',
  baseUrl: 'https://api.deepseek.com/v1', maxTokens: 1024,
  contextWindow: 1_000_000, compactThreshold: 0, ...patch,
});
function intercept(t, responses = [done]) {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    const reply = responses[Math.min(requests.length - 1, responses.length - 1)];
    return new Response(`data: ${JSON.stringify(reply)}\n\ndata: [DONE]\n\n`, {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  });
  return requests;
}
const partsOf = (body) => body.messages.flatMap(m => Array.isArray(m.content) ? m.content : []);
const imagesOf = (body) => partsOf(body).filter(p => p.type === 'image_url');
const userMessage = [{ role: 'user', content: [{ type: 'text', text: 'read this screenshot' }, { type: 'image', dataUrl: image }] }];

for (const model of ['deepseek-flash', 'deepseek-v4.1-flash', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp', 'deepseek/deepseek-v4.1-flash']) {
  test(`${model} sends the actual image by default`, async t => {
    const requests = intercept(t);
    await makeProvider(config(model)).complete('system', userMessage, [], {});
    assert.deepEqual(imagesOf(requests[0].body), [{ type: 'image_url', image_url: { url: image } }]);
    assert.equal(requests[0].body.model, model); // Preserve hosted routing/billing identifiers.
  });
}

test('hosted DeepSeek keeps the image when the request goes through the Wuwei gateway', async t => {
  const requests = intercept(t);
  await makeProvider(config('deepseek-v4.1-flash', { baseUrl: 'https://wuweiai.io/api/gateway/v1' })).complete('', userMessage, [], {});
  assert.equal(requests[0].url, 'https://gw.wuweiai.io/api/gateway/v1/chat/completions');
  assert.equal(imagesOf(requests[0].body)[0].image_url.url, image);
});

for (const model of ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v3', 'deepseek-v3.2', 'deepseek-r1', 'deepseek-r1-distill-qwen-32b', 'deepseek-v4-pro']) {
  test(`${model} retains text-only compatibility`, async t => {
    const requests = intercept(t);
    await makeProvider(config(model)).complete('', userMessage, [], {});
    assert.equal(imagesOf(requests[0].body).length, 0);
    assert.equal(typeof requests[0].body.messages[0].content, 'string');
  });
}

test('explicit vision overrides are still respected', async t => {
  const requests = intercept(t);
  await makeProvider(config('deepseek-flash', { vision: false })).complete('', userMessage, [], {});
  await makeProvider(config('deepseek-chat', { vision: true })).complete('', userMessage, [], {});
  assert.equal(imagesOf(requests[0].body).length, 0);
  assert.equal(imagesOf(requests[1].body).length, 1);
});

const toolHistory = () => [
  { role: 'assistant', content: [
    { type: 'tool_use', id: 'shot', name: 'chrome_screenshot', input: {} },
    { type: 'tool_use', id: 'info', name: 'read_file', input: {} },
  ] },
  { role: 'user', content: [
    { type: 'tool_result', tool_use_id: 'shot', content: [{ type: 'text', text: 'captured the page' }, { type: 'image', dataUrl: image }] },
    { type: 'tool_result', tool_use_id: 'info', content: 'file contents' },
  ] },
];

test('tool screenshots follow all tool responses as user image parts without mutating history', async t => {
  const requests = intercept(t);
  const history = toolHistory();
  const original = structuredClone(history);
  await makeProvider(config('deepseek-flash')).complete('', history, [], {});
  const body = requests[0].body;
  assert.deepEqual(body.messages.map(m => m.role), ['assistant', 'tool', 'tool', 'user']);
  assert.equal(body.messages[1].content, 'captured the page');
  assert.equal(body.messages[2].content, 'file contents');
  assert.deepEqual(imagesOf(body), [{ type: 'image_url', image_url: { url: image } }]);
  assert.ok(partsOf(body).some(p => p.type === 'text' && p.text.includes('shot')));
  assert.deepEqual(history, original);
});

test('display-only generated images are excluded while attached images alongside tool responses are kept', async t => {
  const requests = intercept(t);
  const history = toolHistory();
  history[1].content[0].content[1].displayOnly = true;
  history[1].content.push({ type: 'text', text: 'also inspect my attachment' }, { type: 'image', dataUrl: image });
  await makeProvider(config('deepseek-flash')).complete('', history, [], {});
  assert.equal(imagesOf(requests[0].body).length, 1);
  assert.ok(partsOf(requests[0].body).some(p => p.type === 'text' && p.text.includes('also inspect my attachment')));
});

test('text-only models do not receive tool screenshot image parts', async t => {
  const requests = intercept(t);
  await makeProvider(config('deepseek-v4-pro')).complete('', toolHistory(), [], {});
  assert.equal(imagesOf(requests[0].body).length, 0);
  assert.deepEqual(requests[0].body.messages.map(m => m.role), ['assistant', 'tool', 'tool']);
});

test('Agent sends user attachments and screenshot tool results through the same DeepSeek provider', async t => {
  const call = { choices: [{ delta: { tool_calls: [{ index: 0, id: 'shot', type: 'function', function: { name: 'chrome_screenshot', arguments: '{}' } }] } }] };
  const requests = intercept(t, [call, done]);
  const tool = { name: 'chrome_screenshot', description: 'Screenshot', inputSchema: { type: 'object', properties: {} }, readOnly: true,
    run: async () => ({ content: 'captured the page', image }) };
  const agent = new Agent(makeProvider(config('deepseek-flash')), '', [tool], { cwd: '.' }, new Map([[tool.name, tool]]), { compactThreshold: 0 });
  await agent.send('look at the image and take a screenshot', {}, undefined, [image]);
  assert.equal(requests.length, 2);
  assert.equal(imagesOf(requests[0].body).length, 1);
  assert.equal(imagesOf(requests[1].body).length, 2);
  assert.equal(requests[1].body.messages.at(-1).role, 'user');
});
