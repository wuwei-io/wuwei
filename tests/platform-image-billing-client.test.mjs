import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { PlatformBillingClient } from '../src/imagegen/platform-billing-client.ts';

const sku = { sku_id: 'approved-mock', model: 'gpt-image-1', size: '1024x1024', quality: 'low', coins_per_image: 10, max_prompt_bytes: 1000, max_count: 1 };
const input = { sku_id: sku.sku_id, prompt: '一只猫', count: 1 };
const accepted = { order_id: 'mock-order', status: 'reserved', reserved_coins: 10, unit_price_coins: 10 };
async function mock(t, handler) {
  const calls = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    calls.push({ path: req.url, method: req.method, headers: req.headers, body: body ? JSON.parse(body) : undefined });
    handler(req, res, calls.length);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { calls, client: (source = 'platform', token = 'mock-token') => new PlatformBillingClient(`http://127.0.0.1:${server.address().port}`, () => token, source) };
}
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); }

test('catalog/create/query: Bearer, exact body, stable key and no duplicate POST', async t => {
  const m = await mock(t, (req, res) => json(res, req.method === 'POST' ? 202 : 200,
    req.url.endsWith('catalog') ? [sku] : req.method === 'POST' ? accepted : { ...accepted, status: 'unknown', images: [] }));
  const c = m.client(); assert.deepEqual(await c.catalog(), [sku]);
  const a = c.prepare(input, sku); const key = a.key;
  assert.deepEqual(await c.create(a), accepted);
  assert.equal((await c.order(a.orderId)).status, 'unknown');
  await assert.rejects(c.create(a), { code: 'QUERY_ONLY' });
  assert.equal(a.key, key); assert.equal(m.calls.length, 3);
  for (const call of m.calls) assert.equal(call.headers.authorization, 'Bearer mock-token');
  assert.deepEqual(m.calls[1].body, input);
  assert.equal(m.calls[1].headers['idempotency-key'], key);
  assert.equal(m.calls[2].path, '/api/images/orders/mock-order');
});

for (const [status, code, expected] of [[402, 'INSUFFICIENT_BALANCE', 'INSUFFICIENT_BALANCE'], [409, 'PRICE_UNAVAILABLE', 'PRICE_UNAVAILABLE'], [409, 'CONFLICT', 'IDEMPOTENCY_CONFLICT'], [422, 'LIMIT', 'INVALID_INPUT']]) {
  test(`${status}/${code}: explicit error, manual retry retains key`, async t => {
    const m = await mock(t, (req, res, n) => json(res, n === 1 ? status : 202, n === 1 ? { code } : accepted));
    const c = m.client(), a = c.prepare(input, sku);
    await assert.rejects(c.create(a), e => e.code === expected && (status !== 402 || e.message.includes('请充值')));
    assert.equal(m.calls.length, 1); await c.create(a);
    assert.equal(m.calls[0].headers['idempotency-key'], m.calls[1].headers['idempotency-key']);
  });
}

for (const mode of ['disconnect', 'server-error', 'bad-json', 'unknown']) {
  test(`${mode}: never automatically retry/create again`, async t => {
    const m = await mock(t, (req, res) => {
      if (mode === 'disconnect') return req.socket.destroy();
      if (mode === 'bad-json') { res.end('invalid'); return; }
      json(res, mode === 'server-error' ? 503 : 202, { ...accepted, status: 'unknown' });
    });
    const c = m.client(), a = c.prepare(input, sku);
    if (mode === 'unknown') await c.create(a); else await assert.rejects(c.create(a), { code: 'UNKNOWN' });
    assert.equal(a.state, 'unknown');
    await assert.rejects(c.create(a), { code: 'QUERY_ONLY' });
    assert.equal(m.calls.length, 1);
  });
}

test('subscription/BYOK isolated: zero platform requests or fallback', async t => {
  const m = await mock(t, (req, res) => json(res, 500, {}));
  for (const source of ['subscription', 'byok']) {
    const c = m.client(source);
    await assert.rejects(c.catalog(), { code: 'SOURCE_ISOLATED' });
    await assert.rejects(c.order('x'), { code: 'SOURCE_ISOLATED' });
    assert.throws(() => c.prepare(input, sku), { code: 'SOURCE_ISOLATED' });
    await assert.rejects(c.create({}), { code: 'SOURCE_ISOLATED' });
  }
  assert.equal(m.calls.length, 0);
});

test('input guards: UTF8 byte budget, single image, route injection, disabled/null price', async t => {
  const m = await mock(t, (req, res) => json(res, 200, [])); const c = m.client();
  for (const bad of [{ ...input, prompt: '猫'.repeat(334) }, { ...input, count: 2 }, { ...input, prompt: '' },
    { ...input, model: 'other' }, { ...input, reference_images: [] }, { ...input, key: 'no' }, { ...input, base_url: 'no' }, { ...input, price: 1 }]) {
    assert.throws(() => c.prepare(bad, sku), { code: 'INVALID_INPUT' });
  }
  for (const bad of [{ ...sku, coins_per_image: null }, { ...sku, enabled: false }, { ...sku, max_count: 0 }]) {
    assert.throws(() => c.prepare(input, bad), { code: 'INVALID_INPUT' });
  }
  c.prepare({ ...input, prompt: '猫'.repeat(333) }, sku);
  await assert.rejects(m.client('platform', '').catalog(), { code: 'AUTH_REQUIRED' });
  assert.equal(m.calls.length, 0);
});

test('concurrent submit blocked; empty catalog kept raw (no invented SKUs)', async t => {
  const m = await mock(t, (req, res) => json(res, req.method === 'POST' ? 202 : 200, req.method === 'POST' ? accepted : []));
  const c = m.client(); assert.deepEqual(await c.catalog(), []);
  const a = c.prepare(input, sku); const first = c.create(a);
  await assert.rejects(c.create(a), { code: 'QUERY_ONLY' }); await first;
  assert.equal(m.calls.filter(x => x.method === 'POST').length, 1);
});
