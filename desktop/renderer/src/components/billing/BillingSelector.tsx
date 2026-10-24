import { BillingBackground } from './BillingBackground.js';
import React from 'react';
import {billingPeriods} from '../../../../../src/billing/mini.js';
import {tr} from '../../../../../src/localization/index.js';
import {formatCredits,annualPriceComparison} from '../../../../../src/billing/presentation.js';
import {BillingModelCatalog} from './BillingModelCatalog.js';
import {BillingAnnualTerm} from './BillingAnnualTerm.js';
import {BillingUsageLines} from './BillingUsage.js';
import type {BillingPlansProps} from './BillingPlans.js';

export function BillingSelector(p:BillingPlansProps&{selected:string;onSelect:(sku:string)=>void;onValue?:()=>void}){
  const product=p.products.find(x=>x.sku===p.selected)??p.products.find(x=>x.recommended)??p.products[0];
  const credits=product?(product.kind==='pack'&&p.member?product.memberCredits:product.credits):0;
  const money=(minor:number)=>new Intl.NumberFormat(p.lang,{style:'currency',currency:p.currency,maximumFractionDigits:minor%100===0?0:2}).format(minor/100);
  return <main className="billing-selector">
    <aside><BillingModelCatalog models={p.models} lang={p.lang} onRules={p.onRules}/>
      {product&&<div className="billing-selector-benefits"><h3>{product.kind==='plan'?`Wuwei ${product.name}`:tr('ui.billingpanel.credit.pack.d7ec0e9')} · {tr('ui.billingpanel.selected.benefits.12377e2')}</h3><div className="billing-selector-credits"><strong>{formatCredits(credits)}</strong><span>{tr(product.kind==='plan'&&product.period!=='trial'?'ui.billingpanel.credits.month.3093877':'ui.billingpanel.credits.455609c')}</span></div><p>{tr(product.period==='trial'?'billing.mini.validity':product.kind==='pack'?'ui.billingpanel.valid.for.six.months.does.not.ba3d962':'ui.billingpanel.usage.based.deductions.expires.each.monthly.15965aa',{credits})}</p><ul><BillingUsageLines credits={credits} models={p.models} lang={p.lang}/>{product.kind==='plan'&&product.period!=='trial'&&product.name!=='Pro'&&<li className="billing-core-feature billing-value-feature"><strong>{tr('ui.billingpanel.lower.price.per.credit.than.pro.bef793a')}</strong></li>}{product.period==='trial'&&<li className="billing-core-feature"><strong>{tr('billing.mini.once')}</strong></li>}<BillingBackground product={product} policy={p.backgroundPolicy}/>{['ui.billingpanel.choose.value.premium.and.image.models.27d84fc','ui.billingpanel.code.organize.files.and.analyze.information.1f17bcd','ui.billingpanel.review.your.credit.and.usage.records.271dfb5','ui.billingpanel.long.term.memory.and.brain.included.6f640ec'].map(key=><li key={key}>{tr(key)}</li>)}</ul><p className="billing-usage-note">{tr('billing.usage.shared')}</p></div>}
    </aside>
    <section><span className="billing-selector-overline">✧ {tr('ui.billingpanel.let.ai.do.the.work.ab5347f')}</span><h1>{tr(p.insufficient?'ui.billingpanel.more.credits.for.what.comes.next.1ef1628':'billing.selector.title')}</h1><p className="billing-selector-subtitle">{tr('billing.selector.subtitle')}</p>
      {p.insufficient&&<div className="billing-selector-shortage"><span>{tr('ui.billingorderview.current.credits.18a748e')}: {formatCredits(p.balance)}</span>{p.onFree&&<button onClick={p.onFree}>{tr('ui.billingpanel.use.free.model.ab0be71')}</button>}{p.onValue&&<button onClick={p.onValue}>{tr('ui.billingpanel.choose.value.model.fc2e440')}</button>}</div>}
      <div className="billing-selector-periods" role="tablist" aria-label={tr('ui.billingpanel.billing.period.af01053')}>{billingPeriods(p.catalogProducts).map(period=><button key={period} data-period={period} role="tab" aria-selected={period===p.period} onClick={()=>p.onPeriod(period)}>{tr('billing.plans.period.'+period)}{period==='annual'&&<span>−50%</span>}</button>)}</div>
      {p.loading&&<p role="status">{tr('ui.billingpanel.loading.64db553')}</p>}
      <div className={'billing-selector-options '+(p.period==='pack'?'packs':'')}>{p.products.map(x=>{
        const amount=p.currency==='USD'?x.usdMinor:x.cnyMinor,active=x.sku===product?.sku,comparison=annualPriceComparison(x,p.currency,p.catalogProducts);
        return <button key={x.sku} data-sku={x.sku} className={'billing-selector-option '+(active?'selected':'')} aria-pressed={active} onClick={()=>p.onSelect(x.sku)}>{x.recommended&&<span className="billing-selector-ribbon">{tr('ui.billingpanel.recommended.99a8fb6')}</span>}<i aria-hidden="true">{active?'✓':''}</i><span className="billing-selector-name"><b>{x.kind==='plan'?x.name:`${formatCredits(x.credits)} ${tr('ui.billingpanel.credits.455609c')}`}</b><small>{formatCredits(x.kind==='pack'&&p.member?x.memberCredits:x.credits)} {x.period==='trial'?`${tr('ui.billingpanel.credits.455609c')} · ${tr('billing.mini.duration')}`:tr(x.kind==='pack'?'ui.billingpanel.credits.delivered.493dda6':'ui.billingpanel.credits.month.3093877')}</small></span><span className="billing-selector-price">{comparison&&<del className="billing-original-monthly">{money(comparison.monthly)}</del>}<strong>{money(x.period==='annual'?amount/12:amount)}</strong>{x.kind==='plan'&&x.period!=='trial'&&<span>{tr('ui.billingpanel.mo.00fb449')}</span>}<small className={x.period==='annual'?'billing-selector-annual':undefined}>{x.period==='annual'?<BillingAnnualTerm amount={amount} before={comparison?.annual} money={money}/>:tr('ui.billingpanel.one.time.payment.8890b8e')}</small></span></button>;
      })}</div>
      <button className="billing-selector-pay billing-plan-buy" disabled={!product||p.busy||p.loading} onClick={()=>product&&p.onChoose(product)}>{p.busy?tr('set.brain.warming'):tr('ui.billingpanel.continue.to.payment.6194b01')} <span aria-hidden="true">→</span></button><p className="billing-selector-note">{tr('ui.billingpanel.one.time.purchase.no.auto.renewal.9ee6e44')}</p>
      <div className="billing-selector-free"><span>{tr('billing.selector.explore')}</span>{p.onFree&&<button onClick={p.onFree}>{tr('ui.billingpanel.try.free.first.84f4717')}</button>}</div>
    </section>
  </main>;
}
