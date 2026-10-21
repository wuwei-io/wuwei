import test from 'node:test';
import assert from 'node:assert/strict';
import {usageEstimates} from '../src/billing/estimates.js';
import type {ModelChoice} from '../src/model-selection.js';
const chat={key:'mimo',modelId:'mimo-v2.6-flash',category:'economy',recommended:true,free:false,price:{input:87.23,output:187.88}} as ModelChoice;
const image={key:'image',modelId:'gpt-image-1',category:'images',free:false,imageCoins:8} as ModelChoice;
test('usage scenarios track plan credits and independently use the shared balance',()=>{
 for(const [coins,images,tasks,tokens] of [[2000,250,1800,18000000],[5000,625,4600,46000000],[10000,1250,9300,93000000]]){
  const e=usageEstimates(coins,[chat,image]);assert.equal(e.images,images);assert.equal(e.tasks,tasks);assert.equal(e.tokens,tokens);assert.equal(e.taskCost,1.0736);
  assert.ok(e.tasks!*e.taskCost!<=coins);assert.ok(e.images!*image.imageCoins!<=coins);
 }
});
test('estimates use current rates and exclude free, hidden or external models',()=>{
 const expensive={...chat,price:{input:174.46,output:375.76}};
 assert.ok(usageEstimates(5000,[expensive,image]).tasks!<usageEstimates(5000,[chat,image]).tasks!);
 for(const model of [{...chat,free:true},{...chat,hiddenInPicker:true},{...chat,category:'connections'} as ModelChoice])assert.equal(usageEstimates(5000,[model]).tasks,null);
 for(const bad of [null,NaN,-1,0])assert.equal(usageEstimates(5000,[{...chat,price:{input:bad,output:1}}]).tokens,null);
 assert.equal(usageEstimates(5000,[]).images,null);assert.equal(usageEstimates(-1,[chat,image]).images,0);
});
