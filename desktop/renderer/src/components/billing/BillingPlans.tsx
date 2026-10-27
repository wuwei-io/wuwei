import { BillingBackground } from './BillingBackground.js';
import React from 'react';
import {billingPeriods,MINI_SKU,type BillingPlanPeriod} from '../../../../../src/billing/mini.js';
import {tr} from '../../../../../src/localization/index.js';
import {formatCredits,modelVendorName,annualPriceComparison} from '../../../../../src/billing/presentation.js';
import type {BillingCatalog,BillingCurrency,BillingProduct} from '../../../../../src/billing/contracts.js';
import type {ModelChoice} from '../../../../../src/model-selection.js';
import {BillingAnnualTerm} from './BillingAnnualTerm.js';
import {BillingFreePlan} from './BillingFreePlan.js';
import {BillingBrand} from './BillingBrand.js';

export interface BillingPlansProps {
  onReview?:()=>void;
  backgroundPolicy?:BillingCatalog['backgroundPolicy'];lang:string;period:BillingPlanPeriod;currency:BillingCurrency;products:BillingProduct[];catalogProducts:BillingProduct[];member:boolean;
  models:ModelChoice[];onVideo?:(id:string)=>void;busy:boolean;loading:boolean;insufficient?:boolean;balance:number;
  onPeriod:(period:BillingPlanPeriod)=>void;onChoose:(product:BillingProduct)=>void;onFree?:()=>void;onRules:()=>void;
}
const money=(minor:number,currency:BillingCurrency,lang:string)=>new Intl.NumberFormat(lang,{style:'currency',currency,maximumFractionDigits:minor%100===0?0:2}).format(minor/100);
export function BillingPlans(p:BillingPlansProps){
  const tabs=<div className="billing-plans-periods" role="tablist" aria-label={tr('ui.billingpanel.billing.period.af01053')}>{billingPeriods(p.catalogProducts).map(period=><button type="button" role="tab" data-period={period} aria-selected={p.period===period} key={period} onClick={()=>p.onPeriod(period)}>{tr('billing.plans.period.'+period)}{period==='annual'&&<span>−50%</span>}</button>)}</div>;
  if(p.period==='free')return <main className="billing-plans billing-free-comparison"><div className="billing-plans-heading"><h1>{tr('billing.free.title')}</h1><p>{tr('billing.free.noCard')}</p></div>{tabs}<BillingFreePlan lang={p.lang} onFree={p.onFree} onReview={p.onReview}/><p className="billing-free-scope">{tr('billing.free.scope')}</p></main>;
  const pack=p.period==='pack',mini=p.products.find(x=>x.period==='trial'),regular=p.products.filter(x=>x.period!=='trial');
  return <main className={'billing-plans '+(pack?'is-pack':p.period==='trial'?'is-trial':'')}>
    <div className="billing-plans-heading"><h1>{tr(p.insufficient?'ui.billingpanel.more.credits.for.what.comes.next.1ef1628':'billing.plans.title')}</h1><p>{tr('billing.plans.subtitle')}</p></div>
    {p.insufficient&&<p className="billing-plans-shortage">{tr('ui.billingorderview.current.credits.18a748e')}: {formatCredits(p.balance)}</p>}
    {tabs}
    {p.loading&&<p role="status" className="billing-plans-loading">{tr('ui.billingpanel.loading.64db553')}</p>}
    {mini&&<div className="billing-plans-trial" data-sku={mini.sku}><div><b>{mini.name} <span>{tr('billing.plans.trialCategory')}</span></b><small>{formatCredits(mini.credits)} {tr('ui.billingpanel.credits.455609c')} · {tr('billing.mini.duration')}</small></div><strong>{money(p.currency==='USD'?mini.usdMinor:mini.cnyMinor,p.currency,p.lang)}</strong><button onClick={()=>p.onChoose(mini)} disabled={p.busy||p.loading}>{tr('billing.plans.choose',{plan:mini.name})}<span aria-hidden="true">→</span></button></div>}
    <div className={'billing-plan-grid'+(!pack&&regular.length===4?' four-plans':'')}>{regular.map((product,index)=>{
      const annual=product.period==='annual',amount=p.currency==='USD'?product.usdMinor:product.cnyMinor;
      const comparison=annualPriceComparison(product,p.currency,p.catalogProducts);
      const credits=pack&&p.member?product.memberCredits:product.credits;
      const formatted=money(annual?amount/12:amount,p.currency,p.lang);
      const name=pack?`${formatCredits(product.credits)} ${tr('ui.billingpanel.credits.455609c')}`:product.name;
      const saving=product.name==='Mini'||product.name==='Pro'?'base':product.name==='Max'?'max':'plus';
      const audience=Math.max(0,['Pro','Plus','Max'].indexOf(product.name));
      return <article className={'billing-plan-card '+(product.recommended?'recommended':'')} key={product.sku} data-sku={product.sku}>
        {product.sku===MINI_SKU?<span className="billing-plan-ribbon billing-mini-hot">HOT</span>:product.recommended&&<span className="billing-plan-ribbon">{tr('ui.billingpanel.recommended.99a8fb6')}</span>}
        <h2>{name}</h2><p className="billing-plan-audience">{tr(product.period==='trial'?'billing.mini.once':pack?'billing.plans.packAudience':`billing.plans.audience.${audience}`)}</p>
        <div className="billing-plan-price">{comparison&&<del className="billing-original-monthly">{money(comparison.monthly,p.currency,p.lang)}</del>}<strong>{formatted}</strong>{!pack&&product.period!=='trial'&&<span>{tr('ui.billingpanel.mo.00fb449')}</span>}</div>
        <p className={"billing-plan-term"+(annual?" annual":"")}>{annual?<BillingAnnualTerm amount={amount} before={comparison?.annual} money={minor=>money(minor,p.currency,p.lang)} details/>:tr('ui.billingpanel.one.time.payment.8890b8e')}</p>
        <button className="billing-plan-buy" onClick={()=>p.onChoose(product)} disabled={p.busy||p.loading}>{p.busy?tr('set.brain.warming'):tr('billing.plans.choose',{plan:name})}<span aria-hidden="true">→</span></button>
        <div className="billing-plan-allowance"><span>{tr(product.period==='trial'?'billing.mini.duration':pack?'billing.plans.packAllowance':'billing.plans.allowance')}</span><div><b>{formatCredits(credits)}</b><small>{tr(pack||product.period==='trial'?'ui.billingpanel.credits.455609c':'ui.billingpanel.credits.month.3093877')}</small></div><p>{tr(product.sku===MINI_SKU?'billing.mini.validity':pack?(p.member?'billing.plans.bonusIncluded':'billing.plans.bonusEligible'):'billing.plans.saving.'+saving,{credits})}</p></div>
        {!pack&&<div className="billing-plan-models" aria-label={tr('billing.plans.models')}>{p.models.slice(0,6).map(model=><span className="billing-plan-model" key={model.key} title={p.lang==='zh'?model.label:model.labelEn}><BillingBrand model={model.modelId} provider={model.providerId}/><small>{modelVendorName(model)}</small></span>)}</div>}
        <ul className="billing-plan-features">{!pack&&<BillingBackground marker product={product} policy={p.backgroundPolicy}/>}{(pack?['billing.plans.packUsage','billing.plans.packModels','billing.plans.packExpiry','ui.billingpanel.review.your.credit.and.usage.records.271dfb5']:['ui.billingpanel.choose.value.premium.and.image.models.27d84fc','ui.billingpanel.code.organize.files.and.analyze.information.1f17bcd','billing.plans.tools','ui.billingpanel.review.your.credit.and.usage.records.271dfb5','ui.billingpanel.long.term.memory.and.brain.included.6f640ec']).map(key=><li key={key}><span aria-hidden="true">✓</span><span>{tr(key)}</span></li>)}</ul>
      </article>;
    })}</div>
    <div className="billing-plans-free"><b>{tr('ui.billingpanel.free.e99c08e')}</b><p>{tr('billing.plans.freeCopy')}{p.backgroundPolicy?.enabled&&<> · {tr('billing.background.free',{count:p.backgroundPolicy.free})}</>}</p>{p.onFree&&<button onClick={p.onFree}>{tr('ui.billingpanel.try.free.first.84f4717')}</button>}</div>
    <div className="billing-plans-foot"><p>{tr(p.products.some(x=>x.sku===MINI_SKU)?'billing.mini.monthlyNote':'ui.billingpanel.plan.credits.expire.each.monthly.period.15e5dd7',{credits:p.products[0]?.credits??100})}</p><button onClick={p.onRules}>{tr('billing.plans.usageDetails')} <span aria-hidden="true">↗</span></button></div>
  </main>;
}
