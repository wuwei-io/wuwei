import test from 'node:test';
import assert from 'node:assert/strict';
import { clearBillingCatalogCache, isBillingCatalog, readBillingCatalogCache, writeBillingCatalogCache } from '../src/billing/catalog-cache.ts';
const catalog = (version = 'v1', price = 300) => ({ version, products: [{ sku: 'v2_plan_mini_monthly', kind: 'plan', name: 'Mini', period: 'monthly', usdMinor: price, cnyMinor: 2000, credits: 600, memberCredits: 600, recommended: true }], member: false, checkoutReady: true, channels: { alipay: true, paddle: true, crypto: false } });
const storage = () => { const rows = new Map(); return { rows, getItem: key => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value), removeItem: key => rows.delete(key) }; };

test('stored prices are synchronously available across instances and isolated by account', () => {
  const disk = storage(); writeBillingCatalogCache(disk, 'account-a', catalog(), 1000);
  assert.deepEqual(readBillingCatalogCache(disk, 'account-a', 2000), catalog());
  assert.equal(readBillingCatalogCache(disk, 'account-b', 2000), null);
  const [key, value] = [...disk.rows][0]; disk.rows.set(key.replace('account-a', 'account-b'), value);
  assert.equal(readBillingCatalogCache(disk, 'account-b', 2000), null);
});
test('background refresh replaces both version and prices on disk', () => {
  const disk = storage(); writeBillingCatalogCache(disk, 'a', catalog(), 1000); writeBillingCatalogCache(disk, 'a', catalog('v2', 400), 2000);
  assert.equal(readBillingCatalogCache(disk, 'a', 3000).products[0].usdMinor, 400);
  assert.equal(readBillingCatalogCache(disk, 'a', 3000).version, 'v2');
});
test('malformed, expired, future and incompatible snapshots are ignored', () => {
  const disk = storage(); writeBillingCatalogCache(disk, 'a', catalog(), 1000); const key = [...disk.rows.keys()][0], original = disk.getItem(key);
  assert.equal(readBillingCatalogCache(disk, 'a', 1000 + 31 * 86400000), null);
  for (const value of ['{', 'null', JSON.stringify({ ...JSON.parse(original), schema: 9 }), JSON.stringify({ ...JSON.parse(original), savedAt: 99999999 })]) {
    disk.setItem(key, value); assert.equal(readBillingCatalogCache(disk, 'a', 2000), null);
  }
});
test('invalid server prices and partial responses cannot poison an existing cache', () => {
  const disk = storage(); writeBillingCatalogCache(disk, 'a', catalog(), 1000);
  for (const value of [{ error: 'network' }, null, { ...catalog(), channels: {} }, { ...catalog(), products: [{ ...catalog().products[0], usdMinor: -1 }] }, { ...catalog(), products: [{ ...catalog().products[0], cnyMinor: 0.1 }] }]) {
    assert.equal(isBillingCatalog(value), false); writeBillingCatalogCache(disk, 'a', value, 2000);
  }
  assert.equal(readBillingCatalogCache(disk, 'a', 3000).version, 'v1');
});
test('only catalog metadata is cached, while supported eligibility metadata survives', () => {
  const disk = storage(), value = { ...catalog(), accessToken: 'secret-token', balance: 999, quote: { amount: 1 }, trial: { enabled: true, eligible: false, repeatAllowed: true }, backgroundPolicy: { enabled: true, version: 'p1', free: 1, plans: { mini: 2 } } };
  writeBillingCatalogCache(disk, 'a', value, 1000); const cached = readBillingCatalogCache(disk, 'a', 2000);
  for (const key of ['accessToken', 'balance', 'quote']) assert.equal(key in cached, false);
  assert.deepEqual(cached.trial, value.trial); assert.deepEqual(cached.backgroundPolicy, value.backgroundPolicy);
  assert(![...disk.rows.values()][0].includes('secret-token'));
});
test('storage failures never prevent the panel rendering or revalidation', () => {
  const disk = { getItem: () => { throw Error('storage blocked'); }, setItem: () => { throw Error('full'); }, removeItem: () => { throw Error('blocked'); } };
  assert.equal(readBillingCatalogCache(disk, 'a'), null); assert.doesNotThrow(() => writeBillingCatalogCache(disk, 'a', catalog())); assert.doesNotThrow(() => clearBillingCatalogCache(disk, 'a'));
  assert.equal(readBillingCatalogCache(null, 'a'), null);
});
test('payment and auth invalidation only remove the affected account cache', () => {
  const disk = storage(); writeBillingCatalogCache(disk, 'a', catalog()); writeBillingCatalogCache(disk, 'b', catalog()); clearBillingCatalogCache(disk, 'a');
  assert.equal(readBillingCatalogCache(disk, 'a'), null); assert(readBillingCatalogCache(disk, 'b'));
});
