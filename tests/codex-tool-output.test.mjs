import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeProvider } from '../src/agent/provider.ts';
import { Agent } from '../src/agent/loop.ts';
import { codexImageTool } from '../src/tools/codex-imagegen.ts';

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=';
const config = {
  provider: 'codex', model: 'gpt-6.1-sol', codexToken: 'test-only', codexAccountId: 'test-account',
  codexEndpoint: 'https://chatgpt.com/backend-api/codex/responses', contextWindow: 1_050_000, compactThreshold: 0,
};
const done = [{ type: 'response.output_text.delta', delta: 'image saved' }, { type: 'response.completed', response: { usage: { input_tokens: 10, output_tokens: 2 } } }];
function intercept(t, replies = [done]) {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    // Reproduce the endpoint's strict schema check, including the reported 400.
    for (const item of body.input) {
      if (item.type !== 'function_call_output' || !Array.isArray(item.output)) continue;
      for (const part of item.output) {
        if (!['input_text', 'input_image'].includes(part.type)) {
          return new Response(JSON.stringify({ error: { message: `Invalid value: '${part.type}'` } }), { status: 400 });
        }
      }
      if (JSON.stringify(item.output).includes('displayOnly')) return new Response('Invalid displayOnly field', { status: 400 });
    }
    const events = replies[Math.min(requests.length - 1, replies.length - 1)];
    return new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } });
  });
  return requests;
}
function history(content) {
  return [
    { role: 'assistant', content: [{ type: 'tool_use', id: 'call-1', name: 'codex_imagegen', input: { prompt: 'robot' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-1', content }] },
  ];
}
const outputOf = body => body.input.find(item => item.type === 'function_call_output').output;

test('display-only generated image returns the success text without invalid image blocks', async t => {
  const requests = intercept(t);
  const messages = history([{ type: 'text', text: '{"ok":true,"path":"saved.png"}' }, { type: 'image', dataUrl: image, displayOnly: true }]);
  const original = structuredClone(messages);
  await makeProvider(config).complete('', messages, [], {});
  assert.equal(outputOf(requests[0]), '{"ok":true,"path":"saved.png"}');
  assert.deepEqual(messages, original); // Fix applies to persisted history without deleting the image.
});

test('screenshot tool results use Responses input_text/input_image fields', async t => {
  const requests = intercept(t);
  await makeProvider(config).complete('', history([{ type: 'text', text: 'captured' }, { type: 'image', dataUrl: image }]), [], {});
  assert.deepEqual(outputOf(requests[0]), [{ type: 'input_text', text: 'captured' }, { type: 'input_image', image_url: image }]);
});

test('plain text tool results, failed results and user attachments keep their formats', async t => {
  const requests = intercept(t);
  const messages = history('operation failed');
  messages[1].content[0].is_error = true;
  messages[1].content.push({ type: 'image', dataUrl: image });
  await makeProvider(config).complete('', messages, [], {});
  assert.equal(outputOf(requests[0]), 'operation failed');
  assert.deepEqual(requests[0].input.at(-1), { role: 'user', content: [{ type: 'input_image', image_url: image }] });
});

test('an image-only display result becomes an empty string rather than an invalid or empty array', async t => {
  const requests = intercept(t);
  await makeProvider(config).complete('', history([{ type: 'image', dataUrl: image, displayOnly: true }]), [], {});
  assert.equal(outputOf(requests[0]), '');
});

test('the real image tool displays its PNG, then the Agent completes without generating again', async t => {
  const call = [{ type: 'response.output_item.done', item: { type: 'function_call', call_id: 'call-1', name: 'codex_imagegen', arguments: '{"prompt":"robot"}' } }];
  const requests = intercept(t, [call, done]);
  const dir = await mkdtemp(join(tmpdir(), 'wuwei-codex-output-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'saved.png');
  const provider = makeProvider(config);
  let generated = 0;
  t.mock.method(provider, 'generateImage', async () => {
    generated++;
    await writeFile(path, Buffer.from(image.split(',')[1], 'base64'));
    return { ok: true, path };
  });
  const agent = new Agent(provider, '', [codexImageTool], { cwd: dir }, new Map([[codexImageTool.name, codexImageTool]]), { compactThreshold: 0 });
  const displayed = [];
  await agent.send('generate a robot image', { onToolEnd: (_id, _text, error, data) => { assert(!error); displayed.push(data); } });
  assert.equal(generated, 1);
  assert.equal(requests.length, 2);
  assert.deepEqual(displayed, [image]);
  assert.deepEqual(JSON.parse(outputOf(requests[1])), { ok: true, path });
  assert.equal(agent.messages.at(-1).content[0].text, 'image saved');
});
