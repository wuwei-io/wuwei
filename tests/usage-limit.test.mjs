import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPaidAllowance, imageToolBalanceFailure, usageLimitKind, usageLimitDestination } from '../src/usage-limit.ts';
const account = (balance, remainingPct = 0, active = false) => ({ coin: { balance }, membership: { weeklyQuota: { active, remainingPct } } });

test('free allowance exhausted recommends value models when coins remain, including fractional coins', () => {
  for (const balance of [100, 0.5, 0.000001]) assert.equal(usageLimitDestination('free', account(balance)), 'recommend');
  for (const balance of [0, -1]) assert.equal(usageLimitDestination('free', account(balance)), 'pay');
});

test('paid balance failure opens payment even if daily free allowance was never used', () => {
  assert.equal(usageLimitDestination('balance', { ...account(0), unusedFreeQuota: 100 }), 'pay');
  // A positive balance can still be insufficient to cover the requested context.
  assert.equal(usageLimitDestination('balance', account(0.01)), 'pay');
});

test('existing paid membership allowance remains usable and guests sign in first', () => {
  assert.equal(usageLimitDestination('free', account(0, 50, true)), 'recommend');
  assert.equal(usageLimitDestination('free', account(0, 0, true)), 'pay');
  assert.equal(usageLimitDestination('free', account(0, 50, false)), 'pay');
  assert.equal(usageLimitDestination('free', null), 'login');
  assert.equal(usageLimitDestination('balance', null), 'login');
  for (const value of [NaN, Infinity, -Infinity]) assert.equal(hasPaidAllowance(account(value, value, true)), false);
});

test('only product quota errors trigger conversion, not upstream failures or a paid daily spend cap', () => {
  assert.equal(usageLimitKind('[[gw:free_daily_cap_reached]] quota', true), 'free');
  assert.equal(usageLimitKind('[[gw:free_quota_exhausted]] quota', true), 'free');
  assert.equal(usageLimitKind('[[gw:daily_cap_reached]] cap', true), 'free');
  assert.equal(usageLimitKind('[[gw:daily_cap_reached]] cap', false), null);
  assert.equal(usageLimitKind('[[gw:insufficient_balance]] balance', false), 'balance');
  assert.equal(usageLimitKind('insufficient_balance', false), 'balance');
  for (const raw of ['[[gw:upstream_error]] insufficient_balance', '[[gw:upstream_rate_limited]] free_quota_exhausted', '429 rate limited', 'Request timed out']) {
    assert.equal(usageLimitKind(raw, true), null);
  }
});

test('only failed hosted image billing results open payment, including older localized results', () => {
  const check = (data, name = 'platform_imagegen', failed = true) => imageToolBalanceFailure(name, typeof data === 'string' ? data : JSON.stringify(data), failed);
  for (const data of [
    {code:'IMAGE_ORDER_ERROR',billing_code:'INSUFFICIENT_BALANCE',message:'localized message'},
    {code:'IMAGE_NOT_DELIVERED',billing_code:'INSUFFICIENT_BALANCE',order_id:'original'},
    {code:'INSUFFICIENT_BALANCE'},
    {code:'IMAGE_ORDER_ERROR',message:'额度与无为币不足，请充值'},
    {code:'IMAGE_NOT_DELIVERED',reason:'Insufficient quota and coins. Add funds to continue.'},
    '额度与无为币不足，请充值',
  ]) {
    assert.equal(check(data),true);
    assert.equal(check(data,'read_file'),false);
    assert.equal(check(data,'platform_imagegen',false),false);
  }
  for (const data of [null,[],{code:'PRICE_CHANGED',message:'额度与无为币不足，请充值'},
    {code:'IMAGE_ORDER_ERROR',billing_code:'UNKNOWN',message:'额度与无为币不足，请充值'},
    {code:'IMAGE_ORDER_ERROR',message:'Request timed out'}, {code:'IMAGE_ORDER_ERROR',message:'429 rate limited'},
    {code:'IMAGE_NOT_DELIVERED',message:'Settlement pending'}, '已取消生图，未下单。', 'example: insufficient_balance',
  ]) assert.equal(check(data),false,JSON.stringify(data));
});
