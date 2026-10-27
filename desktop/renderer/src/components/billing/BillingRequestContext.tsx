import React from 'react';
import {tr} from '../../../../../src/localization/index.js';
import {gatewayAffordability, type GatewayAffordability} from '../../../../../src/gateway-affordability.js';

export function BillingRequestContext({diagnostic,lang,credits,balance}:{diagnostic:GatewayAffordability;lang:string;credits?:number;balance?:number}) {
  const facts=gatewayAffordability(diagnostic);
  if(!facts)return null;
  return <>
    {facts.estimatedCost!=null&&credits!=null&&balance!=null&&facts.estimatedCost>credits+balance&&<p className="billing-request-warning">{tr("billing.request.underfunded")}</p>}
    <details className="billing-request-context"><summary>{tr('billing.request.explain')}</summary>
    <p>{tr('billing.request.scope')}</p>
    {facts.phase!=='unknown'&&<p>{tr('billing.request.'+facts.phase)}</p>}
    {facts.estimatedInputTokens!=null&&<p>{tr('billing.request.input',{tokens:facts.estimatedInputTokens.toLocaleString(lang)})}</p>}
    <small>{facts.model} · {tr('billing.request.reference')}: {facts.clientRequestId}</small>
  </details></>;
}
