import React from 'react';
import {billingTrack} from './telemetry.js';
import {tr} from '../../../../../src/localization/index.js';
import {BillingRewardSupport} from './BillingRewardSupport.js';
export const REVIEW_REWARD_COINS=100;
export function BillingReviewReward({onClose}:{onClose:()=>void}){
 return <div className="billing-subdialog billing-review-dialog" onMouseDown={e=>{if(e.target===e.currentTarget){billingTrack('billing_reward_rules_close',{action:'backdrop'});onClose()}}}><section role="dialog" aria-modal="true" aria-labelledby="billing-review-title"><button className="billing-review-close" aria-label={tr('msg.close')} onClick={()=>{billingTrack('billing_reward_rules_close',{action:'close'});onClose()}}>×</button><span className="billing-share-overline">WUWEI · {tr('billing.share.title')}</span><h2 id="billing-review-title">{tr('billing.share.modalTitle',{coins:REVIEW_REWARD_COINS})}</h2><p>{tr('billing.share.intro')}</p><div className="billing-share-reward"><strong>{REVIEW_REWARD_COINS}</strong><span>{tr('billing.share.coinUnit')}</span><small>{tr('billing.reward.repeat')}</small></div><ol className="billing-share-steps">{['publish','submit','approve'].map((step,index)=><li key={step}><span aria-hidden="true">0{index+1}</span><div><h3>{tr('billing.share.'+step+'Title')}</h3><p>{tr('billing.share.'+step,{coins:REVIEW_REWARD_COINS})}</p></div></li>)}</ol><p className="billing-share-retention">{tr('billing.share.retention')}</p><BillingRewardSupport large/></section></div>;
}
