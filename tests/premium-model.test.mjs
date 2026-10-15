import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendedValueModel, premiumUsageExample, premiumSelectionNeedsConfirmation } from '../src/premium-model.ts';
const model = (id, extra = {}) => ({ key: `p/${id}`, providerId: 'p', modelId: id, label: id, labelEn: id, category: 'economy', rank: 1, free: false, needsLogin: true, recommended: true, defaultForNewUsers: false, price: { input: 1000, output: 2000, cache: 100 }, ...extra });

test('rescue uses the configured default among priced recommended value models', () => {
  const first = model('first');
  const preferred = model('preferred', { defaultForNewUsers: true });
  assert.equal(recommendedValueModel([first, preferred]), preferred);
  assert.equal(recommendedValueModel([first]), first);
});

test('rescue cannot choose premium, free, personal, unpriced or unmarked models', () => {
  const rows = [model('premium', { category: 'premium', defaultForNewUsers: true }), model('free', { free: true }), model('own', { category: 'connections' }), model('unknown', { price: undefined }), model('unmarked', { recommended: false }), model('invalid', { price: { input: NaN, output: 10 } })];
  assert.equal(recommendedValueModel(rows), undefined);
});

test('comparison uses prices per million tokens and does not assume cache or membership savings', () => {
  assert.deepEqual(premiumUsageExample(model('premium')), { perCall: 14, fiveCalls: 70 });
  for (const price of [undefined, { input: null, output: 2000 }, { input: -1, output: 2000 }, { input: Infinity, output: 2000 }]) {
    assert.equal(premiumUsageExample(model('unknown', { price })), undefined);
  }
});
test('all new premium selections require approval for that model and current prices', () => {
  const premium = model('premium', { category: 'premium' });
  assert.equal(premiumSelectionNeedsConfirmation(premium), true);
  assert.equal(premiumSelectionNeedsConfirmation(premium, premium), false);
  assert.equal(premiumSelectionNeedsConfirmation(premium, model('other', { category: 'premium' })), true);
  assert.equal(premiumSelectionNeedsConfirmation(premium, model('premium')), true);
  assert.equal(premiumSelectionNeedsConfirmation({ ...premium, price: { ...premium.price, output: 3000 } }, premium), true);
  assert.equal(premiumSelectionNeedsConfirmation(model('value')), false);
});
