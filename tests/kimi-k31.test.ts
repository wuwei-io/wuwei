import test from 'node:test';
import assert from 'node:assert/strict';
import {hostedModelImageInput} from '../src/model-image-input.js';
import {showcaseModels,billingModelCatalog} from '../src/billing/presentation.js';
import type {ModelChoice} from '../src/model-selection.js';

test('K3.1 Pro supports image attachments even when the catalog badge is NEW',()=>{
  assert.equal(hostedModelImageInput('kimi-k3-1-pro','new'),true);
  assert.equal(hostedModelImageInput('kimi-k3-1-pro','new',['text']),false);
});
test('payment showcase promotes the new Kimi flagship and the complete catalog retains both models',()=>{
  const choice=(modelId:string,rank:number)=>({key:`wuwei-kimi/${modelId}`,providerId:'wuwei-kimi',modelId,label:modelId,category:'premium',free:false,rank,recommended:true}) as ModelChoice;
  const models=[choice('kimi-k3',1),choice('kimi-k3-1-pro',2)];
  assert.equal(showcaseModels(models)[0].modelId,'kimi-k3-1-pro');
  assert.equal(billingModelCatalog(models).length,2);
});
