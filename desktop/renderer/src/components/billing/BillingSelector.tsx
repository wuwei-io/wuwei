import React from 'react';
import {tr} from '../../../../../src/localization/index.js';
import {formatCredits} from '../../../../../src/billing/presentation.js';
import {BillingBrand} from './BillingBrand.js';
import type {BillingPlansProps} from './BillingPlans.js';

export function BillingSelector(p:BillingPlansProps&{selected:string;onSelect:(sku:string)=>void;onValue?:()=>void}){
  const product=p.products.find(x=>x.sku===p.selected)??p.products.find(x=>x.recommended)??p.products[0];
  const credits=product?(product.kind==='pack'&&p.member?product.memberCredits:product.credits):0;
  const money=(minor:number)=>new Intl.NumberFormat(p.lang,{style:'currency',currency:p.currency,maximumFractionDigits:minor%100===0?0:2}).format(minor/100);
  return <main className="billing-selector">
    <aside><div className="billing-selector-head"><h2>{tr('billing.selector.modelHeadline')}</h2><button onClick={p.onRules}>{tr('ui.billingpanel.details.977f6c9')}</button></div>
      <div className="billing-selector-models">{p.models.slice(0,8).map(m=><div key={m.key}><BillingBrand model={m.modelId} provider={m.providerId}/><span><b title={p.lang==='zh'?m.label:m.labelEn}>{p.lang==='zh'?m.label:m.labelEn}</b><small>{tr(m.category==='economy'?'ui.billingpanel.value.c45828d':m.category==='images'?'ui.billingpanel.image.generation.4b0de81':'ui.billingpanel.premium.00aaef5')}</small></span><i aria-hidden="true">✓</i></div>)}</div>
      {product&&<div className="billing-selector-benefits"><h3>{product.kind==='plan'?`Wuwei ${product.name}`:tr('ui.billingpanel.credit.pack.d7ec0e9')} · {tr('ui.billingpanel.selected.benefits.12377e2')}</h3><div className="billing-selector-credits"><strong>{formatCredits(credits)}</strong><span>{tr(product.kind==='plan'?'ui.billingpanel.credits.month.3093877':'ui.billingpanel.credits.455609c')}</span></div><p>{tr(product.kind==='pack'?'ui.billingpanel.valid.for.six.months.does.not.ba3d962':'ui.billingpanel.usage.based.deductions.expires.each.monthly.15965aa')}</p><ul>{product.kind==='plan'&&product.name!=='Pro'&&<li>{tr('ui.billingpanel.lower.price.per.credit.than.pro.bef793a')}</li>}{['ui.billingpanel.choose.value.premium.and.image.models.27d84fc','ui.billingpanel.code.organize.files.and.analyze.information.1f17bcd','ui.billingpanel.review.your.credit.and.usage.records.271dfb5','ui.billingpanel.long.term.memory.and.brain.included.6f640ec'].map(key=><li key={key}>{tr(key)}</li>)}</ul></div>}
    </aside>
    <section><span className="billing-selector-overline">✧ {tr('ui.billingpanel.let.ai.do.the.work.ab5347f')}</span><h1>{tr(p.insufficient?'ui.billingpanel.more.credits.for.what.comes.next.1ef1628':'billing.selector.title')}</h1><p className="billing-selector-subtitle">{tr('billing.selector.subtitle')}</p>
      {p.insufficient&&<div className="billing-selector-shortage"><span>{tr('ui.billingorderview.current.credits.18a748e')}: {formatCredits(p.balance)}</span>{p.onFree&&<button onClick={p.onFree}>{tr('ui.billingpanel.use.free.model.ab0be71')}</button>}{p.onValue&&<button onClick={p.onValue}>{tr('ui.billingpanel.choose.value.model.fc2e440')}</button>}</div>}
      <div className="billing-selector-periods" role="tablist" aria-label={tr('ui.billingpanel.billing.period.af01053')}>{(['monthly','annual','pack'] as const).map(period=><button key={period} role="tab" aria-selected={period===p.period} onClick={()=>p.onPeriod(period)}>{tr('billing.plans.period.'+period)}{period==='annual'&&<span>−50%</span>}</button>)}</div>
      {p.loading&&<p role="status">{tr('ui.billingpanel.loading.64db553')}</p>}
      <div className={'billing-selector-options '+(p.period==='pack'?'packs':'')}>{p.products.map(x=>{
        const amount=p.currency==='USD'?x.usdMinor:x.cnyMinor,active=x.sku===product?.sku;
        return <button key={x.sku} className={'billing-selector-option '+(active?'selected':'')} aria-pressed={active} onClick={()=>p.onSelect(x.sku)}>{x.recommended&&<span className="billing-selector-ribbon">{tr('ui.billingpanel.recommended.99a8fb6')}</span>}<i aria-hidden="true">{active?'✓':''}</i><span className="billing-selector-name"><b>{x.kind==='plan'?x.name:`${formatCredits(x.credits)} ${tr('ui.billingpanel.credits.455609c')}`}</b><small>{formatCredits(x.kind==='pack'&&p.member?x.memberCredits:x.credits)} {tr(x.kind==='pack'?'ui.billingpanel.credits.delivered.493dda6':'ui.billingpanel.credits.month.3093877')}</small></span><span className="billing-selector-price"><strong>{money(x.period==='annual'?amount/12:amount)}</strong>{x.kind==='plan'&&<span>{tr('ui.billingpanel.mo.00fb449')}</span>}<small>{x.period==='annual'?tr('ui.billingpanel.billed.yearly.ca680b1',{p0:money(amount)}):tr('ui.billingpanel.one.time.payment.8890b8e')}</small></span></button>;
      })}</div>
      <button className="billing-selector-pay billing-plan-buy" disabled={!product||p.busy||p.loading} onClick={()=>product&&p.onChoose(product)}>{p.busy?tr('set.brain.warming'):tr('ui.billingpanel.continue.to.payment.6194b01')} <span aria-hidden="true">→</span></button><p className="billing-selector-note">{tr('ui.billingpanel.one.time.purchase.no.auto.renewal.9ee6e44')}</p>
      <div className="billing-selector-free"><span>{tr('billing.selector.explore')}</span>{p.onFree&&<button onClick={p.onFree}>{tr('ui.billingpanel.try.free.first.84f4717')}</button>}</div>
    </section>
  </main>;
}
