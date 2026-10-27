import test from 'node:test';
import assert from 'node:assert/strict';
import {availableBillingProducts,billingPeriods,billingProductsForPeriod,miniFailureKey,MINI_SKU} from '../src/billing/mini.js';
import {usageEstimates} from '../src/billing/estimates.js';
import type {BillingCatalog} from '../src/billing/contracts.js';
import type {ModelChoice} from '../src/model-selection.js';
import {canUpgradeBackgroundTier} from '../src/billing/background-tasks.js';
import products from './fixtures/billing-products.json';

test('Mini is a repeatable monthly plan, independent of old trial eligibility',()=>{
 for(const trial of [undefined,{enabled:false,eligible:false},{enabled:true,eligible:true}]){
  const c={products:[...products,{...products[0],sku:'v2_plan_mini_day',period:'trial'}],trial} as BillingCatalog;
  const available=availableBillingProducts(c);
  assert.ok(available.some(p=>p.sku===MINI_SKU));
  assert.ok(available.every(p=>p.period!=='trial'));
  const monthly=billingProductsForPeriod(available,'monthly');
  assert.equal(monthly[0].sku,MINI_SKU);assert.equal(monthly[0].usdMinor,300);assert.equal(monthly.length,4);
  assert.equal(monthly.find(p=>p.recommended)?.name,'Mini');
  assert.equal(billingProductsForPeriod(available,'annual').length,3);
  assert.ok(billingProductsForPeriod(available,'pack').every(p=>p.kind==='pack'));
  assert.deepEqual(billingPeriods(available),['free','monthly','annual','pack']);
 }
 assert.deepEqual(availableBillingProducts(null),[]);
});

test('300 shared Mini coins estimate small amounts without rounding away half the allowance',()=>{
 const chat={modelId:'mimo-v2.6-flash',category:'economy',free:false,price:{input:87.23,output:187.88}} as ModelChoice;
 const image={category:'images',imageCoins:8} as ModelChoice;
 const e=usageEstimates(300,[chat,image]);
 assert.equal(e.tasks,270);assert.equal(e.tokens,2700000);assert.equal(e.images,37);
 assert.ok(e.tasks!*e.taskCost!<=300);
 assert.equal(usageEstimates(10000,[chat,image]).tasks,9300);
 assert.equal(canUpgradeBackgroundTier('mini'),true);
});

test('trial rejection distinguishes pending orders from used or disabled offers',()=>{
 assert.equal(miniFailureKey(new Error('TRIAL_PENDING'),'fallback'),'billing.mini.pending');
 for(const code of ['TRIAL_USED','TRIAL_DISABLED'])assert.equal(miniFailureKey(new Error(code),'fallback'),'billing.mini.unavailable');
 assert.equal(miniFailureKey(new Error('network'),'fallback'),'fallback');
});
