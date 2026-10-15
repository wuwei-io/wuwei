import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anonymousDefaultModel, catalogModelChoices, recommendedNewUserModel, rememberedModelChoice, shouldApplyEconomyDefault, MODEL_CATEGORIES } from '../src/model-selection.ts';
const provider=(id,models,hosted=true)=>({id,label:id,labelEn:id,hosted,sort:0,models});
const model=(id,selection,extra={})=>({id,label:id,labelEn:id,free:false,selection,...extra});
test('backend metadata decides categories, ordering and recommendations without local model lists',()=>{
  const choices=catalogModelChoices([provider('server-added',[model('new-model',{category:'economy',recommended:true,defaultForNewUsers:true,rank:1},{price:{input:100,output:200,cache:10}}),model('costly',{category:'premium',rank:2})]),provider('free',[model('trial',{}, {free:true,anon:false})]),provider('own',[model('custom',{})],false)],'');
  assert.equal(choices[0].key,'server-added/new-model');
  assert.equal(recommendedNewUserModel(choices)?.modelId,'new-model');
  assert.equal(choices.find(c=>c.modelId==='trial').category,'free');
  assert.equal(choices.find(c=>c.modelId==='trial').needsLogin,true);
  assert.equal(choices.find(c=>c.modelId==='custom').category,'connections');
  assert.deepEqual(MODEL_CATEGORIES.slice(0,4).map(c=>c.id),['free','economy','premium','images']);
});
test('legacy aliases remain usable when selected but disappear from normal browsing',()=>{
  const providers=[provider('p',[model('old',{hiddenInPicker:true}),model('new',{category:'economy'})])];
  assert.deepEqual(catalogModelChoices(providers,'').map(c=>c.modelId),['new']);
  assert.equal(catalogModelChoices(providers,'p/old').length,2);
});
test('default eligibility is independent of legacy markers; preference resolution decides which model to restore',()=>{
  for (const providerId of ['wuwei-free','wuwei-claude','wuwei-gpt','wuwei-mimo']) {
    for (const modelChoiceExplicit of [undefined,false,true]) {
      assert.equal(shouldApplyEconomyDefault({providerId,model:'saved-model',modelChoiceExplicit},true,true,true),true);
    }
  }
  for(const providerId of ['claude-oauth','codex','custom'])assert.equal(shouldApplyEconomyDefault({providerId,model:'chosen-model'},true,true,false),false);
  assert.equal(shouldApplyEconomyDefault({modelChoiceExplicit:false},false,true),false);
  assert.equal(shouldApplyEconomyDefault({modelChoiceExplicit:false},true,false),false);
  assert.equal(shouldApplyEconomyDefault({imageMode:true,providerId:'wuwei-free',model:'glm-4.7-flash'},true,true,true),true);
  assert.equal(shouldApplyEconomyDefault({providerId:'incomplete'},true,true,false),true);
});
test('guests prefer anonymous auto selection and never a login-required free model',()=>{
  const choices=catalogModelChoices([provider('wuwei-free',[
    model('login-required',{}, {free:true,anon:false}), model('glm-4.7-flash',{}, {free:true,anon:true}), model('openrouter-auto-free',{}, {free:true,anon:true}),
  ])],'');
  assert.equal(anonymousDefaultModel(choices)?.modelId,'openrouter-auto-free');
  assert.equal(anonymousDefaultModel(choices.filter(c=>c.modelId!=='openrouter-auto-free'))?.modelId,'glm-4.7-flash');
});
test('explicit preferences restore per account, including free choices; unavailable choices have no premium fallback',()=>{
  const choices=catalogModelChoices([provider('wuwei-free',[model('free',{}, {free:true,anon:false})]),provider('wuwei-paid',[model('premium',{})])],'');
  const settings={providerId:'wuwei-paid',model:'premium',modelChoiceExplicit:true,modelPreferences:{alice:{providerId:'wuwei-free',modelId:'free'}}};
  assert.equal(rememberedModelChoice(choices,settings,'alice')?.modelId,'free');
  assert.equal(rememberedModelChoice(choices,settings,'bob'),undefined);
  assert.equal(rememberedModelChoice(choices,{modelPreferences:{alice:{providerId:'gone',modelId:'retired'}}},'alice'),undefined);
  assert.equal(rememberedModelChoice(choices,{providerId:'wuwei-paid',model:'premium',modelChoiceExplicit:true},'alice')?.modelId,'premium');
  assert.equal(rememberedModelChoice(choices,{providerId:'wuwei-paid',model:'premium',modelChoiceExplicit:false},'alice'),undefined);
  assert.equal(rememberedModelChoice(choices,{providerId:'wuwei-free',model:'free',modelChoiceExplicit:true},'alice'),undefined);
});
