import test from 'node:test';
import assert from 'node:assert/strict';
import {billingFeedbackEligible,billingExitReasons,type BillingExit} from '../src/billing/exit-feedback.js';
import {tr} from '../src/localization/index.js';
test('optional exit question is limited to genuine unpaid shortage visits, at most weekly',()=>{
 const exit:BillingExit={session:'visit',sku:'mini',context:'shortage',dwellMs:6000,paid:false},now=10*86400000;
 assert.equal(billingFeedbackEligible(exit,0,now),true);
 assert.equal(billingFeedbackEligible({...exit,paid:true},0,now),false);
 assert.equal(billingFeedbackEligible({...exit,pendingPayment:true},0,now),false);
 assert.equal(billingFeedbackEligible({...exit,context:'account'},0,now),false);
 assert.equal(billingFeedbackEligible({...exit,dwellMs:4999},0,now),false);
 assert.equal(billingFeedbackEligible(exit,now-6*86400000,now),false);
 assert.equal(billingFeedbackEligible(exit,now-7*86400000,now),true);
});
test('all shipped languages present the same seven anonymous reason codes',()=>{
 for(const lang of ['en','zh','ar','de','es','fa','fr','hi','id','it','ja','ko','ms','pl','pt-BR','ru','tr','vi']){
  assert.equal(tr('billing.exit.reasons',{},lang).split('|').filter(Boolean).length,billingExitReasons.length,lang);
 }
});
