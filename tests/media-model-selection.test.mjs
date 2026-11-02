import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaModelChoices} from '../src/media-model-selection.ts';
import {billingModelCatalog} from '../src/billing/presentation.ts';
import {canUseModel,modelMembership} from '../src/model-membership.ts';
const image={sku_id:'image-medium',model:'gpt-image-2',quality:'medium',coins_per_image:36,aspect_ratio:'1:1',resolution:'1K'};
const video={id:'video-one',name:'Video One',brand:'seedance',eligible:false,premium:true,min_coins:20};
test('image variants share one model choice and retain the preferred actual SKU',()=>{
 const rows=mediaModelChoices([image,{...image,sku_id:'image-low',quality:'low',coins_per_image:10}],null);
 assert.equal(rows.length,1);assert.equal(rows[0].modelId,'image-medium');assert.equal(rows[0].imageQuality,'medium');assert.equal(rows[0].imageCoins,10);assert.equal(rows[0].imageModel,'gpt-image-2');
});
test('all enabled video models are discoverable and use their own category and ID',()=>{
 const rows=mediaModelChoices([],{enabled:true,version:'fixture',models:[video,{...video,id:'video-two',min_coins:null}]});
 assert.equal(rows.length,2);assert.ok(rows.every(m=>m.category==='videos'&&m.needsLogin));assert.equal(rows[0].modelId,'video-one');assert.equal(rows[1].videoCoins,null);
});
test('disabled video catalog does not expose actionable choices',()=>{
 assert.equal(mediaModelChoices([],{enabled:false,version:'fixture',models:[video]}).length,0);
});
test('billing showcase keeps video entries out of chat models to avoid duplicate counts',()=>{
 const rows=mediaModelChoices([image],{enabled:true,version:'fixture',models:[video]});const visible=billingModelCatalog(rows);
 assert.equal(visible.length,1);assert.equal(visible[0].category,'images');
});

test('member-only image and video metadata reaches the general picker without changing eligibility',()=>{
 const rows=mediaModelChoices([image,{...image,sku_id:'pro',model:'dola-seedream-5-0-pro-260628',membership_required:'pro',eligible:false}],{enabled:true,version:'fixture',models:[video,{...video,id:'open-video',premium:false,eligible:true}]});
 const pro=rows.find(c=>c.modelId==='pro'),movie=rows.find(c=>c.modelId==='video-one');
 assert.equal(modelMembership(pro),'pro');assert.equal(pro.membershipEligible,false);
 assert.equal(modelMembership(movie),'pro');assert.equal(movie.membershipEligible,false);
 assert.equal(modelMembership(rows.find(c=>c.modelId==='image-medium')),null);
 assert.equal(modelMembership(rows.find(c=>c.modelId==='open-video')),null);
});

test('media permission comes from each service, never from the text Mini rule or balance',()=>{
 const mini={membership:{tier:'pro_month',plan:'Mini',expireAt:Date.now()+86400000}},pro={membership:{...mini.membership,plan:'Pro'}};
 const locked=mediaModelChoices([{...image,membership_required:'pro',eligible:false}],null)[0];
 for(const account of [null,{coin:{balance:100000}},mini,pro])assert.equal(canUseModel(locked,account),false);
 assert.equal(canUseModel({...locked,membershipEligible:undefined},pro),false);
 assert.equal(canUseModel({...locked,membershipEligible:true},pro),true);
 assert.equal(canUseModel({...locked,membershipEligible:true},null),false);
 assert.equal(canUseModel(mediaModelChoices([image],null)[0],mini),true);
});

test('known image profile still displays a crown when older catalog metadata omits the restriction',()=>{
 const row=mediaModelChoices([{...image,model:'dola-seedream-5-0-pro-260628'}],null)[0];
 assert.equal(modelMembership(row),'pro');assert.equal(canUseModel(row,{}),false);
});
