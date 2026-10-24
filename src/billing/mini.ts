import type { BillingCatalog, BillingPeriod, BillingProduct } from './contracts.js';

export const MINI_SKU = 'v2_plan_mini_day';
/** Both the server gate and account eligibility are required; old servers hide Mini. */
export function availableBillingProducts(catalog:BillingCatalog|null):BillingProduct[] {
  return (catalog?.products??[]).filter(p=>p.period!=='trial'||
    (p.sku===MINI_SKU&&catalog?.trial?.enabled===true&&catalog.trial.eligible===true));
}
export function billingPeriods(_products:readonly BillingProduct[]):BillingPeriod[] {
  return ['monthly','annual','pack'];
}
/** A one-day trial has the same price under both membership billing periods. */
export function billingProductsForPeriod(products:readonly BillingProduct[],period:BillingPeriod):BillingProduct[] {
  const regular=products.filter(p=>p.period===period);
  return period==='monthly'||period==='annual'
    ? [...products.filter(p=>p.sku===MINI_SKU&&p.period==='trial'),...regular]
    : regular;
}
export function miniFailureKey(error:unknown,fallback:string):string {
  const code=error instanceof Error?error.message:String(error);
  return /TRIAL_PENDING/.test(code)?'billing.mini.pending':/TRIAL_(USED|DISABLED)/.test(code)?'billing.mini.unavailable':fallback;
}
