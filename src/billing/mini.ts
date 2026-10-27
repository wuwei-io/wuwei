import type { BillingCatalog, BillingPeriod, BillingProduct } from './contracts.js';

export type BillingPlanPeriod=BillingPeriod|'free';

export const MINI_SKU = 'v2_plan_mini_monthly';
export const LEGACY_MINI_SKU = 'v2_plan_mini_day';
/** Mini is a regular monthly plan. Old introductory offers are not sold. */
export function availableBillingProducts(catalog:BillingCatalog|null):BillingProduct[] {
  return (catalog?.products??[]).filter(p=>p.period!=='trial');
}
export function billingPeriods(_products:readonly BillingProduct[]):BillingPlanPeriod[] {
  return ['free','monthly','annual','pack'];
}
export function billingProductsForPeriod(products:readonly BillingProduct[],period:BillingPlanPeriod):BillingProduct[] {
  return products.filter(p=>p.period===period);
}
export function miniFailureKey(error:unknown,fallback:string):string {
  const code=error instanceof Error?error.message:String(error);
  return /CRYPTO_BELOW_MINIMUM/.test(code)?'billing.mini.cryptoMinimum':/TRIAL_PENDING/.test(code)?'billing.mini.pending':/TRIAL_(USED|DISABLED)/.test(code)?'billing.mini.unavailable':fallback;
}
