import {test} from 'node:test';
import assert from 'node:assert/strict';
import {studioBatches} from '../desktop/renderer/src/components/image-gallery-data.ts';
import {STUDIO_MODELS} from '../src/imagegen/studio-models.ts';
const png='data:image/png;base64,AA==',order='abcdef12-3456-7890-abcd-1234567890ab';
const user={type:'user',text:'Tea photography',ts:123};
const tool=(result,input={})=>({type:'tool',id:'tool-1',name:'platform_imagegen',input:{sku_id:'sku',prompt:'Tea photography',...input},status:'done',result:JSON.stringify(result)});
const catalog=[{sku_id:'sku',model:'gpt-image-2',coins_per_image:999,quality:'high',aspect_ratio:'3:2',resolution:'2K'}];
test('historical actual charges, original model and timing never become current catalogue quotes',()=>{
 const result={displayed:true,order_id:order,charged_coins:36,model:'original-model',quality:'low',aspect_ratio:'1:1',resolution:'1K',elapsed_ms:23000,created_at_ms:456};
 const art=studioBatches([user,{...tool(result),image:png}],catalog,false)[0].artworks[0];
 assert.equal(art.charged,36);assert.equal(art.model,'original-model');assert.equal(art.quality,'low');assert.equal(art.ratio,'1:1');assert.equal(art.elapsedMs,23000);assert.equal(art.ts,456);
});
test('legacy images have no invented duration or actual cost',()=>{
 const art=studioBatches([user,{...tool({order_id:order}),image:png}],catalog,false)[0].artworks[0];
 assert.equal(art.state,'complete');assert.equal(art.charged,undefined);assert.equal(art.elapsedMs,undefined);
});
test('an uncertain original order remains pending and the unsubmitted remainder costs nothing',()=>{
 const result=tool({order_id:order,status:'unknown',charged_coins:0,recovery_key:'original-key'},{batch_count:4});
 const batch=studioBatches([user,result],catalog,false)[0];
 assert.deepEqual(batch.artworks.map(art=>art.state),['pending','unattempted','unattempted','unattempted']);
 assert.ok(batch.artworks.slice(1).every(art=>art.charged===undefined));
});
test('a failed original order is retryable while an interrupted running order is pending',()=>{
 assert.equal(studioBatches([user,tool({order_id:order,status:'failed'})],catalog,false)[0].artworks[0].state,'failed');
 assert.equal(studioBatches([user,{...tool({order_id:order,status:'dispatching'}),status:'running'}],catalog,false)[0].artworks[0].state,'pending');
});
test('recovering one original order replaces its first card rather than duplicating a paid image',()=>{
 const batches=studioBatches([user,tool({order_id:order,status:'unknown'}),{...user,text:'Recover'}, {...tool({order_id:order,charged_coins:8,displayed:true}),image:png}],catalog,false);
 assert.equal(batches.length,1);assert.equal(batches[0].artworks.length,1);assert.equal(batches[0].artworks[0].image,png);assert.equal(batches[0].artworks[0].charged,8);
});
test('different paid orders preserve identical bytes as separate artworks',()=>{
 const batches=studioBatches([user,{...tool({order_id:order}),image:png},{...tool({order_id:'different-order'}),image:png}],catalog,false);
 assert.equal(batches[0].artworks.length,2);
});
test('studio ignores chat images and unsafe external image URLs',()=>{
 assert.deepEqual(studioBatches([user,{type:'tool',name:'send_image',image:png}],catalog,false),[]);
 assert.equal(studioBatches([user,{...tool({order_id:order}),image:'https://example.invalid/private.png'}],catalog,false)[0].artworks[0].image,undefined);
});
test('reviewed profiles retain their brand groups and expanded descriptions have unique model IDs',()=>{
 const reviewed=STUDIO_MODELS.slice(0,14);
 assert.equal(reviewed.length,14);assert.equal(STUDIO_MODELS.length,49);
 assert.equal(new Set(STUDIO_MODELS.map(row=>row.model)).size,49);
 assert.deepEqual([...new Set(reviewed.map(row=>row.brand))],['Seedream','OpenAI','Google','xAI']);
 assert.ok(!reviewed.some(row=>/gpt-image-1|seedream-3/.test(row.model)));
 assert.ok(STUDIO_MODELS.every(row=>row.label&&row.brand&&row.description&&row.maxResolution));
});
