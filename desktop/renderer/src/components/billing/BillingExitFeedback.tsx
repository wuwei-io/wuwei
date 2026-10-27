import React,{useEffect} from 'react';
import {tr} from '../../../../../src/localization/index.js';
import {billingExitReasons,type BillingExit,type BillingExitReason} from '../../../../../src/billing/exit-feedback.js';
import {billingTrack} from './telemetry.js';
export function BillingExitFeedback({visit,onReason,onDismiss}:{visit:BillingExit;onReason:(reason:BillingExitReason)=>void;onDismiss:()=>void}){
 useEffect(()=>{billingTrack('billing_exit_feedback_shown',{billing_session_id:visit.session,sku:visit.sku,context:visit.context})},[visit.session]);
 const labels=tr('billing.exit.reasons').split('|');
 return <div className="billing-exit-feedback" role="region" aria-label={tr('billing.exit.prompt')}><span>{tr('billing.exit.prompt')}</span><select aria-label={tr('billing.exit.prompt')} value="" onChange={e=>{if(billingExitReasons.includes(e.target.value as BillingExitReason))onReason(e.target.value as BillingExitReason)}}><option value="">—</option>{billingExitReasons.map((code,i)=><option key={code} value={code}>{labels[i]}</option>)}</select><button type="button" onClick={onDismiss} aria-label={tr('msg.close')}>×</button></div>;
}
