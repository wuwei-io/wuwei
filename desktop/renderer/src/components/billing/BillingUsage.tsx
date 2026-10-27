import React from 'react';
import {tr} from '../../../../../src/localization/index.js';
import {usageEstimates} from '../../../../../src/billing/estimates.js';
import type {ModelChoice} from '../../../../../src/model-selection.js';

type Props={credits:number;models:ModelChoice[];lang:string};
export function BillingUsageLines(p:Props){
  const e=usageEstimates(p.credits,p.models);
  const fmt=(n:number)=>new Intl.NumberFormat(p.lang,{maximumFractionDigits:0}).format(n);
  const scenarios=[['tasks',e.tasks],['tokens',e.tokens],['images',e.images]] as const;
  const available=scenarios.filter((entry):entry is readonly ['tasks'|'tokens'|'images',number]=>entry[1]!==null);
  return available.length?<>{available.map(([key,count])=><li key={key} data-usage-kind={key} className="billing-usage-metric">{tr('billing.usage.'+key,{count:fmt(count)},p.lang)}</li>)}</>:<li>{tr('billing.usage.outcomes',{},p.lang)}</li>;
}
