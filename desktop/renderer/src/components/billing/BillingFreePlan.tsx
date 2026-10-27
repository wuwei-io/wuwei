import {BillingRewardSupport} from './BillingRewardSupport.js';
import {REVIEW_REWARD_COINS} from './BillingReviewReward.js';
import React,{useSyncExternalStore} from 'react';
import {tr} from '../../../../../src/localization/index.js';
import {freeAllowanceSnapshot,subscribeFreeAllowance} from '../../../../../src/billing/free-allowance.js';

function useAllowance(){return useSyncExternalStore(subscribeFreeAllowance,freeAllowanceSnapshot,freeAllowanceSnapshot);}
const compact=(n:number,lang:string)=>new Intl.NumberFormat(lang,{notation:'compact',maximumFractionDigits:2}).format(n);
export function BillingFreeBenefits({lang}:{lang:string}){
 const quota=useAllowance();
 return <div className="billing-selector-benefits billing-free-benefits"><h3>{tr('billing.plans.period.free')} · {tr('ui.billingpanel.selected.benefits.12377e2')}</h3><div className="billing-selector-credits"><strong>{quota?compact(quota.dailyTokens,lang):'—'}</strong><span>{tr('billing.free.unit')}</span></div><p>{tr('billing.free.caption')}</p><ul>{quota&&<li className="billing-usage-metric">{tr('billing.free.calls',{count:new Intl.NumberFormat(lang).format(quota.dailyCalls)})}</li>}<li>{REVIEW_REWARD_COINS} {tr('billing.share.coinUnit')}</li><li>{tr('billing.free.reset')}</li><li>{tr('billing.free.noCard')}</li><li>{tr('ui.billingpanel.code.organize.files.and.analyze.information.1f17bcd')}</li></ul><p className="billing-usage-note">{tr('billing.free.scope')}</p></div>;
}
export function BillingFreePlan({lang,onFree,onReview}:{lang:string;onFree?:()=>void;onReview?:()=>void}){
 const quota=useAllowance();
 return <div className="billing-free-activities" data-free-plan>
 <article className="billing-activity-card daily"><div className="billing-activity-heading"><span className="billing-activity-icon" aria-hidden="true">✧</span><h2>{tr('billing.activities.daily')}</h2><span className="billing-activity-pill">{tr('billing.share.dailyBadge')}</span></div><div className="billing-activity-metric"><strong data-free-token-limit={quota?.dailyTokens}>{quota?compact(quota.dailyTokens,lang):'—'}</strong><span>{tr('billing.free.unit')}</span></div><p>{tr(quota?'billing.share.dailyIntro':'billing.free.unavailable')}</p><div className="billing-activity-footer"><small className="billing-free-call-limit">{quota?tr('billing.free.calls',{count:new Intl.NumberFormat(lang).format(quota.dailyCalls)}):tr('billing.free.caption')}</small><button className="billing-free-start billing-plan-buy" disabled={!onFree||!quota} onClick={onFree}>{tr('billing.free.start')} <span aria-hidden="true">→</span></button></div></article>
 <article className="billing-activity-card share"><div className="billing-activity-heading"><span className="billing-activity-icon" aria-hidden="true">↗</span><h2>{tr('billing.share.title')}</h2><span className="billing-activity-pill">{tr('billing.reward.repeat')}</span></div><div className="billing-activity-metric"><strong>{REVIEW_REWARD_COINS}</strong><span>{tr('billing.share.coinUnit')}</span></div><p>{tr('billing.share.intro')}</p><div className="billing-activity-footer"><small>{tr('billing.share.flow')}</small><button className="billing-reward-rules" disabled={!onReview} onClick={onReview}>{tr('billing.reward.rules')} <span aria-hidden="true">→</span></button></div></article>
 <BillingRewardSupport/>
 </div>;
}
