import {BillingFreePlan,BillingFreeBenefits} from './BillingFreePlan.js';
import { BillingBackground } from './BillingBackground.js';
import React, { useState } from 'react';
import {billingPeriods,displayedCredits,MINI_SKU} from '../../../../../src/billing/mini.js';
import {tr} from '../../../../../src/localization/index.js';
import {formatCredits,annualPriceComparison} from '../../../../../src/billing/presentation.js';
import {BillingModelCatalog} from './BillingModelCatalog.js';
import {BillingAnnualTerm} from './BillingAnnualTerm.js';
import {BillingUsageLines} from './BillingUsage.js';
import {BillingMiniOffer,BillingPurchaseActions} from './BillingPurchaseActions.js';
import type {BillingPlansProps} from './BillingPlans.js';

export function BillingSelector(p:BillingPlansProps&{selected:string;onSelect:(sku:string)=>void;onValue?:()=>void}){
  const [modelCount, setModelCount] = useState(0);
  const miniOffer = p.pricingPolicy?.miniOffer;
  const product=p.products.find(x=>x.sku===p.selected)??p.products.find(x=>x.recommended)??p.products[0];
  const miniSelected = product?.sku === MINI_SKU && miniOffer;
  const credits=product?displayedCredits(product,p.member,p.pricingPolicy?.miniOffer):0;
  const money=(minor:number)=>new Intl.NumberFormat(p.lang,{style:'currency',currency:p.currency,currencyDisplay:'narrowSymbol',minimumFractionDigits:0,maximumFractionDigits:2}).format(minor/100);
  return <main className={'billing-selector'+(p.products.some(x=>x.period==='trial')?' billing-selector-has-trial':'')}>
    <aside>{p.insufficient?<details className="billing-model-disclosure"><summary>{tr("billing.models.expand")}</summary><BillingModelCatalog showPrices models={p.models} lang={p.lang} onRules={p.onRules} onVideo={p.onVideo} onModelCount={setModelCount}/></details>:<BillingModelCatalog models={p.models} lang={p.lang} onRules={p.onRules} onVideo={p.onVideo} onModelCount={setModelCount}/>}
      {p.period==='free'?<BillingFreeBenefits lang={p.lang}/>:product&&<div className="billing-selector-benefits"><h3>{product.kind==='plan'?`Wuwei ${product.name}`:tr('ui.billingpanel.credit.pack.d7ec0e9')} · {tr('ui.billingpanel.selected.benefits.12377e2')}</h3><div className="billing-selector-credits"><strong>{formatCredits(credits)}</strong><span>{miniSelected ? tr('ui.billingpanel.credits.455609c') + ' · ' + tr('billing.mini.firstPurchaseBadge') : tr(product.kind==='plan'&&product.period!=='trial'?'ui.billingpanel.credits.month.3093877':'ui.billingpanel.credits.455609c')}</span></div><p>{tr(product.sku===MINI_SKU?'billing.mini.validity':product.kind==='pack'?'ui.billingpanel.valid.for.six.months.does.not.ba3d962':'ui.billingpanel.usage.based.deductions.expires.each.monthly.15965aa',{credits})}</p><ul>{product.kind==='plan'&&<li className="billing-core-feature"><strong>{tr(modelCount>=100?'billing.pricing.oneMembershipCount':'billing.pricing.oneMembership',{count:modelCount.toLocaleString(p.lang)})}</strong></li>}<BillingUsageLines credits={credits} models={p.models} lang={p.lang}/>{product.period==='trial'&&<li className="billing-core-feature"><strong>{tr('billing.mini.once')}</strong></li>}<BillingBackground product={product} policy={p.backgroundPolicy}/>{['ui.billingpanel.choose.value.premium.and.image.models.27d84fc','ui.billingpanel.code.organize.files.and.analyze.information.1f17bcd','ui.billingpanel.review.your.credit.and.usage.records.271dfb5','ui.billingpanel.long.term.memory.and.brain.included.6f640ec'].map(key=><li key={key}>{tr(key)}</li>)}</ul><p className="billing-usage-note">{tr('billing.usage.shared')}</p></div>}
    </aside>
    <section><div className="billing-selector-intro"><span className="billing-selector-overline">✧ {tr('ui.billingpanel.let.ai.do.the.work.ab5347f')}</span><h1>{tr(p.period==='free'?'billing.share.heading':p.insufficient?'billing.resume.title':'billing.selector.title')}</h1><p className="billing-selector-subtitle">{tr(p.period==='free'?'billing.share.subtitle':p.insufficient?'billing.resume.note':'billing.selector.subtitle')}</p>
      {p.insufficient&&p.period!=='free'&&<div className="billing-selector-shortage"><span>{tr('ui.billingorderview.current.credits.18a748e')}: {formatCredits(p.balance)}</span>{p.onFree&&<button onClick={p.onFree}>{tr('ui.billingpanel.use.free.model.ab0be71')}</button>}{p.onValue&&<button onClick={p.onValue}>{tr('ui.billingpanel.choose.value.model.fc2e440')}</button>}</div>}
      <div className="billing-selector-periods" role="tablist" aria-label={tr('ui.billingpanel.billing.period.af01053')}>
        {billingPeriods(p.pricingPolicy).map(period => <button key={period} data-period={period} role="tab"
          aria-selected={period === p.period} onClick={() => p.onPeriod(period)}>
          {tr('billing.plans.period.' + period)}
          {period === 'monthly' && miniOffer && <span className="billing-mini-tab-badge">{tr('billing.mini.firstPurchaseBadge')}</span>}
        </button>)}
      </div>
      {p.loading&&<p role="status">{tr('ui.billingpanel.loading.64db553')}</p>}
      </div>{p.period==='free'?<BillingFreePlan lang={p.lang} onFree={p.onFree} onReview={p.onReview}/>:<div className={'billing-selector-options'+(p.period==='pack'?' packs':'')}>{p.products.map(x=>{
        const amount=p.currency==='USD'?x.usdMinor:x.cnyMinor,active=x.sku===product?.sku,comparison=annualPriceComparison(x,p.currency,p.catalogProducts);
        const promotion = x.sku === MINI_SKU && p.period === 'monthly' ? miniOffer : null;
        return <button key={x.sku} data-sku={x.sku}
          className={'billing-selector-option ' + (active ? 'selected' : '') + (x.period === 'trial' ? ' is-trial' : '')}
          aria-pressed={active} onClick={() => p.onSelect(x.sku)}>
          {promotion ? <span className="billing-selector-ribbon billing-mini-hot">
            {tr('billing.mini.multiplierBadge', { ratio: formatCredits(promotion.credits / promotion.baseCredits, p.lang) })}
          </span> : x.recommended && <span className="billing-selector-ribbon">{tr('ui.billingpanel.recommended.99a8fb6')}</span>}
          <i aria-hidden="true">{active ? '✓' : ''}</i>
          <span className="billing-selector-name">
            <b>{x.kind === 'plan' ? x.name : formatCredits(x.credits) + ' ' + tr('ui.billingpanel.credits.455609c')}
              {x.period === 'trial' && <span className="billing-selector-trial-label">{tr('billing.plans.trialCategory')}</span>}
            </b>
            <small>{promotion ? <>
              {formatCredits(promotion.baseCredits, p.lang)} → <strong className="billing-mini-credits">
                {formatCredits(promotion.credits, p.lang)} {tr('ui.billingpanel.credits.455609c')}
              </strong>
            </> : <>
              {formatCredits(displayedCredits(x, p.member, miniOffer))}{' '}
              {x.period === 'trial' ? tr('ui.billingpanel.credits.455609c') + ' · ' + tr('billing.mini.duration')
                : tr(x.kind === 'pack' ? 'ui.billingpanel.credits.delivered.493dda6' : 'ui.billingpanel.credits.month.3093877')}
            </>}</small>
          </span>
          <span className="billing-selector-price">
            {comparison && <del className="billing-original-monthly">{money(comparison.monthly)}</del>}
            <strong>{money(x.period === 'annual' ? amount / 12 : amount)}</strong>
            {x.kind === 'plan' && x.period !== 'trial' && <span>{tr('ui.billingpanel.mo.00fb449')}</span>}
            <small className={x.period === 'annual' ? 'billing-selector-annual' : undefined}>
              {x.period === 'annual' ? <BillingAnnualTerm amount={amount} before={comparison?.annual} money={money}/>
                : tr(p.period === 'annual' ? 'billing.pricing.monthlyOnly' : 'ui.billingpanel.one.time.payment.8890b8e')}
            </small>
          </span>
        </button>;
      })}</div>}
      {p.period!=='free'&&<div className="billing-selector-actions">
      {product?.sku===MINI_SKU&&p.period==='monthly'&&<BillingMiniOffer plans={p}/>}
      <BillingPurchaseActions plans={p} product={product}/>
      </div>}
    </section>
  </main>;
}
