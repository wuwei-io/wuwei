import test from 'node:test';
import assert from 'node:assert/strict';
import {textModelMembership,canUseTextModel} from '../src/text-model-membership.ts';
import {catalogModelChoices} from '../src/model-selection.ts';
const now=Date.parse('2026-11-02T00:00:00Z');
const choice=(key,extra={})=>({key,providerId:key.split('/')[0],modelId:key.split('/')[1],category:'premium',free:false,...extra});
const account=(plan,expiry=now+10000)=>({membership:{tier:'pro_month',plan,expireAt:expiry}});
test('only the seven requested hosted models get the default member boundary',()=>{
 for(const key of ['wuwei-claude/claude-fable-5-1','wuwei-claude/claude-fable-5','wuwei-claude/claude-opus-5-5','wuwei-claude/claude-opus-5','wuwei-gpt/gpt-6-1-sol','wuwei-gpt/gpt-6-sol','wuwei-gpt/gpt-6-astra'])assert.equal(textModelMembership(choice(key)),'member');
 for(const key of ['wuwei-claude/claude-opus-4-8','wuwei-gpt/gpt-6-luna','wuwei-gpt/gpt-5.6','wuwei-kimi/kimi-k3.1-pro','own/claude-opus-5'])assert.equal(textModelMembership(choice(key)),null);
 for(const extra of [{category:'connections'},{category:'images'},{category:'videos'},{free:true}])assert.equal(textModelMembership(choice('wuwei-claude/claude-opus-5',extra)),null);
});
test('Mini and all valid paid plans qualify, balance never substitutes for membership',()=>{
 const c=choice('wuwei-claude/claude-opus-5');
 for(const plan of ['Mini','Pro','Plus','Ultra','Max'])assert(canUseTextModel(c,account(plan),now));
 for(const a of [null,{}, {coin:{balance:100000}}, {membership:{tier:'free',expireAt:now+10000}},account('Mini',now),account('Mini',now-1),account('Mini','bad'),{membership:{tier:'pro_month'}}])assert.equal(canUseTextModel(c,a,now),false);
 assert(canUseTextModel(c,account('Mini',(now+10000)/1000),now));
 assert(canUseTextModel(c,account('Mini',new Date(now+10000).toISOString()),now));
});
test('catalog overrides can change or remove the per-model requirement without gating own keys',()=>{
 const p={id:'wuwei-claude',hosted:true,sort:0,label:'Claude',models:[{id:'claude-opus-5',label:'Opus',free:false,selection:{membershipRequired:null}},{id:'new-model',label:'New',free:false,selection:{membershipRequired:'pro'}}]};
 const [open,restricted]=catalogModelChoices([p],'');
 assert.equal(textModelMembership(open),null);
 assert.equal(canUseTextModel(restricted,account('Mini'),now),false);
 assert(canUseTextModel(restricted,account('Pro'),now));
 const own=catalogModelChoices([{...p,hosted:false}],'')[1];assert(canUseTextModel(own,null,now));
});
