import test from 'node:test';
import assert from 'node:assert/strict';
import {availableBillingProducts,billingPeriods,miniFailureKey,MINI_SKU} from '../src/billing/mini.js';
import {usageEstimates} from '../src/billing/estimates.js';
import type {BillingCatalog} from '../src/billing/contracts.js';
import type {ModelChoice} from '../src/model-selection.js';
import {canUpgradeBackgroundTier} from '../src/billing/background-tasks.js';
import products from './fixtures/billing-products.json';

test('Mini requires both server switch and owner eligibility; legacy servers hide it',()=>{
 for(const trial of [undefined,{enabled:false,eligible:true},{enabled:true,eligible:false}]){
  const c={products,trial} as BillingCatalog;
  assert.ok(!availableBillingProducts(c).some(p=>p.sku===MINI_SKU));
  assert.deepEqual(billingPeriods(availableBillingProducts(c)),['monthly','annual','pack']);
 }
 const c={products,trial:{enabled:true,eligible:true}} as BillingCatalog;
 assert.equal(availableBillingProducts(c).filter(p=>p.sku===MINI_SKU).length,1);
 assert.deepEqual(billingPeriods(availableBillingProducts(c)),['trial','monthly','annual','pack']);
 assert.deepEqual(availableBillingProducts(null),[]);
});

test('200 shared Mini coins estimate small amounts without rounding away half the allowance',()=>{
 const chat={modelId:'mimo-v2.6-flash',category:'economy',free:false,price:{input:87.23,output:187.88}} as ModelChoice;
 const image={category:'images',imageCoins:8} as ModelChoice;
 const e=usageEstimates(200,[chat,image]);
 assert.equal(e.tasks,180);assert.equal(e.tokens,1800000);assert.equal(e.images,25);
 assert.ok(e.tasks!*e.taskCost!<=200);
 assert.equal(usageEstimates(10000,[chat,image]).tasks,9300);
 assert.equal(canUpgradeBackgroundTier('mini'),true);
});

test('trial rejection distinguishes pending orders from used or disabled offers',()=>{
 assert.equal(miniFailureKey(new Error('TRIAL_PENDING'),'fallback'),'billing.mini.pending');
 for(const code of ['TRIAL_USED','TRIAL_DISABLED'])assert.equal(miniFailureKey(new Error(code),'fallback'),'billing.mini.unavailable');
 assert.equal(miniFailureKey(new Error('network'),'fallback'),'fallback');
});
