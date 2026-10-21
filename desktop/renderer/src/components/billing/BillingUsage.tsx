import React from 'react';
import {tr} from '../../../../../src/localization/index.js';
import {usageEstimates} from '../../../../../src/billing/estimates.js';
import type {ModelChoice} from '../../../../../src/model-selection.js';

type Props={credits:number;models:ModelChoice[];lang:string};
export function BillingUsageLines(p:Props){
  const e=usageEstimates(p.credits,p.models),fmt=(n:number)=>new Intl.NumberFormat(p.lang,{maximumFractionDigits:0}).format(n);
  return <>{(['images','tasks','tokens'] as const).map(kind=>{
    const value=e[kind];return <li className="billing-usage-metric" key={kind}>{value==null?tr('billing.usage.unavailable'):tr('billing.usage.'+kind,{count:kind==='tokens'?new Intl.NumberFormat(p.lang,{notation:'compact',maximumFractionDigits:1}).format(value):fmt(value)})}</li>;
  })}</>;
}
export function BillingUsageDetails(p:Props){
  const e=usageEstimates(p.credits,p.models),fmt=(n:number)=>new Intl.NumberFormat(p.lang,{maximumFractionDigits:4}).format(n);
  return <div className="billing-usage-details"><h3>{tr('billing.usage.basis')}</h3><p>{tr('billing.usage.shared')}</p>
    <h4>{tr('billing.usage.imageTitle')}</h4><p>{e.image?tr('billing.usage.imageBasis',{model:e.image.labelEn,quality:tr('billing.usage.quality.'+(['low','medium','high'].includes(e.image.imageQuality??'')?e.image.imageQuality:'default')),cost:fmt(e.image.imageCoins!)}):tr('billing.usage.unavailable')}</p>
    <h4>{tr('billing.usage.taskTitle')}</h4><p>{e.chat?tr('billing.usage.taskBasis',{model:e.chat.labelEn,input:fmt(e.inputTokens),output:fmt(e.outputTokens),inputRate:fmt(e.chat.price!.input!),outputRate:fmt(e.chat.price!.output!),cost:fmt(e.taskCost!)}):tr('billing.usage.unavailable')}</p>
    <h4>{tr('billing.usage.tokenTitle')}</h4><p>{tr('billing.usage.tokenBasis')}</p>
  </div>;
}
