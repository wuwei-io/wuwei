import test from 'node:test';
import assert from 'node:assert/strict';
import {STUDIO_EXAMPLES,createStudioExamplePicker} from '../src/media/studio-examples.js';

test('image and video examples cover ten distinct practical audiences within prompt limits',()=>{
 assert.equal(STUDIO_EXAMPLES.length,10);assert.equal(new Set(STUDIO_EXAMPLES.map(row=>row.id)).size,10);
 for(const row of STUDIO_EXAMPLES)for(const kind of ['image','video']as const){
  assert.match(row[kind].zh,/[\u3400-\u9fff]/);assert.doesNotMatch(row[kind].en,/[\u3400-\u9fff]/);
  assert(Buffer.byteLength(row[kind].zh)<1000);assert(Buffer.byteLength(row[kind].en)<1000);assert.notEqual(row.image.en,row.video.en);
 }
});
test('each randomized round covers every scenario once with no repeat across round boundaries',()=>{
 for(const kind of ['image','video']as const)for(const random of [()=>0,()=>0.999,Math.random]){
  const next=createStudioExamplePicker(kind,random);let previous='';
  for(let round=0;round<3;round++){const ids=[];for(let i=0;i<10;i++){const example=next('zh');assert.notEqual(example.id,previous);previous=example.id;ids.push(example.id)}assert.equal(new Set(ids).size,10)}
 }
});
test('language changes apply on the next click without resetting the scenario rotation',()=>{
 const next=createStudioExamplePicker('video',()=>0);const a=next('zh'),b=next('en'),c=next('fr');
 assert.match(a.prompt,/[\u3400-\u9fff]/);assert.doesNotMatch(b.prompt,/[\u3400-\u9fff]/);assert.doesNotMatch(c.prompt,/[\u3400-\u9fff]/);assert.equal(new Set([a.id,b.id,c.id]).size,3);
});
