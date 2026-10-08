import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Agent } from '../src/agent/loop.ts';
import { makeProvider } from '../src/agent/provider.ts';
import { platformImageTool } from '../src/tools/platform-imagegen.ts';
import { codexImageTool } from '../src/tools/codex-imagegen.ts';

const config = (baseUrl, provider = 'openai') => ({ provider, model: 'deepseek-v4-flash', apiKey: 'mock-token', baseUrl });
const done = { content: [{ type: 'text', text: 'done' }], stopReason: 'end_turn' };

test('hosted providers expose image generation for catalog URLs, including v1 and trailing slashes', () => {
  for (const host of ['wuweiai.io', 'gw.wuweiai.io']) {
    for (const suffix of ['', '/', '/v1', '/v1/']) {
      const url = `https://${host}/api/gateway${suffix}`;
      assert.equal(typeof makeProvider(config(url)).platformImage, 'function', url);
    }
  }
});

test('BYOK, subscription and invalid gateway URLs cannot forward credentials to platform image billing', () => {
  for (const url of [undefined, 'invalid', 'http://gw.wuweiai.io/api/gateway/v1',
    'https://api.openai.com/v1', 'https://gw.wuweiai.io.evil.test/api/gateway/v1',
    'https://evil.test/api/gateway/v1', 'https://gw.wuweiai.io:444/api/gateway/v1',
    'https://user:pass@gw.wuweiai.io/api/gateway/v1', 'https://gw.wuweiai.io/api/gateway/v2',
    'https://gw.wuweiai.io/api/gateway/v1?proxy=true', 'https://gw.wuweiai.io/api/gateway/v1#fragment']) {
    assert.equal(makeProvider(config(url)).platformImage, undefined, String(url));
  }
  assert.equal(makeProvider({ ...config('https://gw.wuweiai.io/api/gateway/v1'), apiKey: undefined }).platformImage, undefined);
  assert.equal(makeProvider({ ...config('https://gw.wuweiai.io/api/gateway/v1'), disableTools: true }).platformImage, undefined);
  assert.equal(makeProvider(config('https://gw.wuweiai.io/api/gateway/v1', 'codex')).platformImage, undefined);
});

test('real hosted provider sends image tool and guidance, executes catalog, and returns its result to the model', async t => {
  const requests = [];
  let completions = 0;
  const catalog = [{ sku_id: 'test-image', model: 'gpt-image-1' }];
  const priorFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer mock-token');
    if (url === 'https://wuweiai.io/api/images/catalog') {
      assert.equal(options.method, 'GET');
      return Response.json(catalog);
    }
    assert.equal(url, 'https://gw.wuweiai.io/api/gateway/v1/chat/completions');
    const body = JSON.parse(options.body);
    assert.deepEqual(body.tools.map(tool => tool.function.name), ['platform_imagegen']);
    const system = body.messages.find(message => message.role === 'system').content;
    assert.ok(system.startsWith('Custom restored conversation prompt'));
    assert.match(system, /platform_imagegen/);
    assert.match(system, /action="catalog"/);
    assert.match(system, /action="generate"/);
    assert.match(system, /费用确认|fee confirmation/);
    if (++completions === 2) {
      assert.deepEqual(JSON.parse(body.messages.find(message => message.role === 'tool').content), catalog);
    }
    const delta = completions === 1
      ? { tool_calls: [{ index: 0, id: 'image-catalog', type: 'function', function: { name: 'platform_imagegen', arguments: '{"action":"catalog"}' } }] }
      : { content: 'Available image service found.' };
    return new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: completions === 1 ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`);
  };
  t.after(() => { globalThis.fetch = priorFetch; });
  const provider = makeProvider(config('https://gw.wuweiai.io/api/gateway/v1'));
  const agent = new Agent(provider, 'Custom restored conversation prompt', [platformImageTool, codexImageTool], { cwd: '.' },
    new Map([[platformImageTool.name, platformImageTool], [codexImageTool.name, codexImageTool]]), { compactThreshold: 0 });
  await agent.send('Generate a photo using platform_imagegen', { requestPermission: async () => 'allow' }, AbortSignal.timeout(5000));
  assert.equal(completions, 2);
  assert.equal(requests.filter(request => request.url.endsWith('/api/images/catalog')).length, 1);
  assert.ok(requests.every(request => !request.url.includes('/orders')));
});

test('provider switching refreshes image instructions without advertising unavailable services or accumulating prompts', async () => {
  const seen = [];
  const complete = async (system, _messages, tools) => { seen.push({ system, tools: tools.map(tool => tool.name) }); return done; };
  const hosted = { name: 'openai', platformImage: async () => ({ content: 'catalog' }), complete };
  const subscription = { name: 'codex', generateImage: async () => ({}), complete };
  const plain = { name: 'openai', complete };
  const tools = [platformImageTool, codexImageTool];
  const agent = new Agent(hosted, 'User custom system', tools, { cwd: '.' }, new Map(tools.map(tool => [tool.name, tool])), { compactThreshold: 0 });
  await agent.send('hello', {});
  await agent.send('hello again', {});
  agent.setProvider(subscription); await agent.send('hello', {});
  agent.setProvider(plain); await agent.send('hello', {});
  assert.deepEqual(seen.map(entry => entry.tools), [['platform_imagegen'], ['platform_imagegen'], ['codex_imagegen'], []]);
  assert.equal(seen[0].system, seen[1].system);
  assert.ok(seen[0].system.includes('platform_imagegen') && !seen[0].system.includes('codex_imagegen'));
  assert.ok(seen[2].system.includes('codex_imagegen') && !seen[2].system.includes('platform_imagegen'));
  assert.equal(seen[3].system, 'User custom system');
});

test('disabled tools do not gain image instructions from provider capability alone', async () => {
  let prompt;
  const provider = { name: 'openai', platformImage: async () => ({ content: 'unused' }),
    complete: async system => { prompt = system; return done; } };
  const agent = new Agent(provider, 'Custom prompt', [], { cwd: '.' }, new Map(), { compactThreshold: 0 });
  await agent.send('hello', {});
  assert.equal(prompt, 'Custom prompt');
});
