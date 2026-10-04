import assert from 'node:assert/strict';
import { test } from 'node:test';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateSubscriptionImage, imageEndpoint, validateSubscriptionPng } from '../src/imagegen/subscription.mjs';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXXsAAAAASUVORK5CYII=', 'base64');
async function fixture(t) {
  const dir = await fs.mkdtemp(join(tmpdir(), 'wuwei-sub-img-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return { dir, options: { prompt: 'blue robot', accessToken: 'subscription-test-token', accountId: 'account-a', out: join(dir, 'out.png') } };
}
const response = () => Response.json({ data: [{ b64_json: png.toString('base64') }] }, { headers: { 'x-codex-imagegen-request-id': 'req-test' } });

test('standalone HTTP generation reproduces Codex protocol and writes a validated PNG', async t => {
  const { options } = await fixture(t); let calls = 0;
  const result = await generateSubscriptionImage(options, async (url, req) => {
    calls++;
    assert.equal(url, 'https://chatgpt.com/backend-api/codex/images/generations');
    assert.equal(req.method, 'POST'); assert.equal(req.redirect, 'error');
    assert.equal(req.headers.Authorization, 'Bearer subscription-test-token');
    assert.equal(req.headers['ChatGPT-Account-ID'], 'account-a');
    assert.equal(req.headers.originator, 'codex_cli_rs');
    assert.match(req.headers['x-codex-image-turn-id'], /^[\w-]+$/);
    assert.deepEqual(JSON.parse(req.body), { model: 'gpt-image-2', prompt: options.prompt, background: 'opaque', quality: 'auto', size: 'auto' });
    return response();
  });
  assert.equal(calls, 1); assert.equal(result.backend, 'codex-subscription-http');
  assert.equal(result.width, 1); assert.equal(result.requestId, 'req-test');
  assert.deepEqual(await fs.readFile(options.out), png);
  assert.ok(!JSON.stringify(result).includes(options.accessToken));
});

test('reference edits use JSON image_url data, transparent background, and the edits endpoint', async t => {
  const { options, dir } = await fixture(t); const ref = join(dir, 'ref.png'); await fs.writeFile(ref, png);
  await generateSubscriptionImage({ ...options, references: [ref], transparentBackground: true }, async (url, req) => {
    assert.ok(url.endsWith('/images/edits'));
    const body = JSON.parse(req.body);
    assert.equal(body.background, 'transparent');
    assert.deepEqual(body.images, [{ image_url: `data:image/png;base64,${png.toString('base64')}` }]);
    return response();
  });
});

test('subscription credentials never go to API-key endpoints, proxies or embedded URL credentials', () => {
  for (const endpoint of ['https://api.openai.com/v1/responses', 'http://chatgpt.com/backend-api/codex/responses', 'https://evil.test/backend-api/codex/responses', 'https://chatgpt.com/backend-api/codex/responses?key=abc', 'https://x:y@chatgpt.com/backend-api/codex/responses']) {
    assert.throws(() => imageEndpoint(endpoint), { code: 'INVALID_ENDPOINT' });
  }
});

test('invalid inputs and API-key credentials fail before a billable request', async t => {
  const { options } = await fixture(t); let calls = 0;
  const transport = async () => { calls++; return response(); };
  for (const overrides of [{ prompt: '' }, { accessToken: 'sk-test' }, { accountId: '' }, { timeoutMs: 0 }, { references: Array(6).fill('x') }, { transparentBackground: 'yes' }, { out: 'x.jpg' }]) {
    await assert.rejects(generateSubscriptionImage({ ...options, ...overrides }, transport));
  }
  assert.equal(calls, 0);
});

test('existing output and invalid reference fail before billing', async t => {
  const { options, dir } = await fixture(t); let calls = 0;
  const transport = async () => { calls++; return response(); };
  await fs.writeFile(options.out, 'existing');
  await assert.rejects(generateSubscriptionImage(options, transport), { code: 'OUTPUT_EXISTS' });
  await fs.unlink(options.out);
  const ref = join(dir, 'bad.png'); await fs.writeFile(ref, 'not png');
  await assert.rejects(generateSubscriptionImage({ ...options, references: [ref] }, transport), { code: 'INVALID_REFERENCE' });
  assert.equal(calls, 0);
});

for (const [status, code] of [[401, 'AUTH_EXPIRED'], [403, 'ACCESS_DENIED'], [429, 'RATE_LIMITED'], [500, 'IMAGE_SERVICE_ERROR']]) {
  test(`HTTP ${status} gives a safe error without retry or API fallback`, async t => {
    const { options } = await fixture(t); let calls = 0;
    await assert.rejects(generateSubscriptionImage(options, async () => {
      calls++; return new Response('Bearer secret-echoed-body', { status });
    }), error => { assert.equal(error.code, code); assert.ok(!JSON.stringify(error).includes('secret-echoed-body')); return true; });
    assert.equal(calls, 1); await assert.rejects(fs.access(options.out));
  });
}

test('malformed, truncated and missing image responses never become success', async t => {
  const { options } = await fixture(t);
  for (const resp of [new Response('not json'), Response.json({ data: [] }), Response.json({ data: [{ b64_json: png.subarray(0, 40).toString('base64') }] })]) {
    await assert.rejects(generateSubscriptionImage(options, async () => resp));
    await assert.rejects(fs.access(options.out));
  }
  assert.throws(() => validateSubscriptionPng(png.subarray(0, 40)), { code: 'INVALID_IMAGE' });
});

test('cancellation and timeout abort the HTTP request without retry', async t => {
  const { options } = await fixture(t); let calls = 0;
  const transport = async (_url, req) => {
    calls++; return await new Promise((_resolve, reject) => req.signal.addEventListener('abort', () => reject(req.signal.reason), { once: true }));
  };
  const controller = new AbortController();
  const task = generateSubscriptionImage({ ...options, signal: controller.signal }, transport);
  setTimeout(() => controller.abort(), 25);
  await assert.rejects(task, { code: 'ABORTED' });
  // Keep the test event loop alive: AbortSignal.timeout timers are unref'd.
  const keepAlive = setTimeout(() => {}, 2000);
  try { await assert.rejects(generateSubscriptionImage({ ...options, timeoutMs: 1000 }, transport), { code: 'TIMEOUT' }); }
  finally { clearTimeout(keepAlive); }
  assert.equal(calls, 2);
});

test('parallel sessions use their own account and token', async t => {
  const { options, dir } = await fixture(t); const seen = [];
  await Promise.all(['a', 'b'].map(account => generateSubscriptionImage({ ...options, accessToken: `token-${account}`, accountId: account, out: join(dir, `${account}.png`) }, async (_url, req) => {
    seen.push([req.headers.Authorization, req.headers['ChatGPT-Account-ID']]); return response();
  })));
  assert.deepEqual(seen.sort(), [['Bearer token-a', 'a'], ['Bearer token-b', 'b']]);
});
