import React from 'react';
import { checkoutCurrency } from '../../../../../src/billing/mini.js';
import type { BillingChannel, BillingProduct } from '../../../../../src/billing/contracts.js';
import { formatCredits } from '../../../../../src/billing/presentation.js';
import { tr } from '../../../../../src/localization/index.js';
import type { BillingPlansProps } from './BillingPlans.js';

export function BillingPurchaseActions({ plans, product }: { plans: BillingPlansProps; product?: BillingProduct }) {
  const methods: BillingChannel[] = plans.currency === 'CNY' ? ['alipay', 'paddle', 'crypto'] : ['paddle', 'crypto', 'alipay'];
  const enabled = methods.filter(method => plans.pricingPolicy?.channels[method]);
  const preferred = enabled.find(method => method !== 'crypto');
  const alternatives = enabled.filter(method => method !== preferred);
  const disabled = !product || plans.busy || plans.loading;

  function button(method: BillingChannel, primary = false) {
    const currency = checkoutCurrency(method);
    const amount = (currency === 'USD' ? product?.usdMinor : product?.cnyMinor) ?? 0;
    const total = new Intl.NumberFormat(plans.lang, { style: 'currency', currency, currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount / 100);
    const name = tr('billing.pricing.method.' + method);
    let label = tr('billing.pricing.payWith', { method: name, total });
    if (primary && plans.busy) {
      label = tr('set.brain.warming');
    } else if (primary && product?.kind === 'plan' && product.period !== 'trial') {
      label = tr('billing.pricing.upgradeTo', { plan: product.name });
    }
    return <button type="button" className={primary ? 'billing-selector-pay billing-plan-buy' : 'billing-alternate-method'}
      disabled={disabled} onClick={() => product && plans.onChoose(product, method)}>
      {label}
      <span aria-hidden="true">→</span>
    </button>;
  }

  if (!product || !enabled.length) return <button className="billing-selector-pay billing-plan-buy" disabled>
    {plans.loading ? tr('ui.billingpanel.loading.64db553') : tr('billing.pricing.unavailable')}
  </button>;

  return <div className="billing-purchase-actions">
    {!!alternatives.length && <details><summary>{tr('billing.pricing.otherMethods')}</summary>
      {alternatives.map(method => <div key={method}>{button(method)}</div>)}
    </details>}
    {preferred && button(preferred, true)}
  </div>;
}

export function BillingMiniOffer({ plans }: { plans: BillingPlansProps }) {
  const offer = plans.pricingPolicy?.miniOffer;
  if (!offer) return null;
  return <div className="billing-mini-offer">
    <strong>{tr('billing.mini.offerTitle', { limit: offer.limit })}</strong>
    <p>{tr('billing.mini.offerDetails', {
      bonus: formatCredits(offer.credits - offer.baseCredits, plans.lang),
      coins: formatCredits(offer.credits, plans.lang),
    })}</p>
  </div>;
}
