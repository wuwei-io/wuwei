import type { BillingCatalog, BillingPeriod, BillingProduct, BillingChannel, MiniOffer } from './contracts.js';

export type BillingPlanPeriod=BillingPeriod|'free';

export const MINI_SKU = 'v2_plan_mini_monthly';
export const LEGACY_MINI_SKU = 'v2_plan_mini_day';
/** Mini is a regular monthly plan. Old introductory offers are not sold. */
export function availableBillingProducts(catalog:BillingCatalog|null):BillingProduct[] {
  return (catalog?.products??[]).filter(p=>p.period!=='trial');
}
export function billingPeriods(policy?: Pick<BillingCatalog, 'showFreePlan' | 'showAnnualPlan'>): BillingPlanPeriod[] {
  const periods: BillingPlanPeriod[] = ['monthly', 'pack'];
  if (policy?.showFreePlan) periods.unshift('free');
  if (policy?.showAnnualPlan) periods.splice(periods.indexOf('monthly') + 1, 0, 'annual');
  return periods;
}

export function billingProductsForPeriod(products: readonly BillingProduct[], period: BillingPlanPeriod): BillingProduct[] {
  const rows = products.filter(p => p.period === period);
  if (period !== 'annual' || rows.some(p => p.name === 'Mini')) return rows;
  const mini = products.find(p => p.sku === MINI_SKU);
  return mini ? [mini, ...rows] : rows;
}

export function checkoutCurrency(channel: BillingChannel) {
  return channel === 'alipay' ? 'CNY' : 'USD';
}

export function displayedCredits(product: BillingProduct, member: boolean, offer?: MiniOffer | null) {
  if (product.sku === MINI_SKU && offer) return offer.credits;
  return product.kind === 'pack' && member ? product.memberCredits : product.credits;
}
export function miniFailureKey(error:unknown,fallback:string):string {
  const code=error instanceof Error?error.message:String(error);
  if (/QUOTE_CHANGED/.test(code)) return 'billing.pricing.changed';
  return /CRYPTO_BELOW_MINIMUM/.test(code)?'billing.mini.cryptoMinimum':/TRIAL_PENDING/.test(code)?'billing.mini.pending':/TRIAL_(USED|DISABLED)/.test(code)?'billing.mini.unavailable':fallback;
}
