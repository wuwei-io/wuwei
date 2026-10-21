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
