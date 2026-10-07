import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createPlatformImageSession} from '../src/imagegen/platform-image-session.ts';
import {checkImageAvailability} from '../src/imagegen/image-availability.ts';
import {PlatformBillingClient,BillingError} from '../src/imagegen/platform-billing-client.ts';
const id='abcdef12-3456-7890-abcd-1234567890ab';
const low={sku_id:'openai-gpt-image-1-low',price_version:id,model:'gpt-image-1',size:'1024x1024',quality:'low',coins_per_image:8,authorization_ceiling:120,max_prompt_bytes:1000,max_count:1};
const medium={...low,sku_id:'openai-gpt-image-1-medium',price_version:'abcdef12-3456-7890-abcd-1234567890ac',quality:'medium',coins_per_image:29};
function fixture(t,{interrupted=false}={}) {
 const root=mkdtempSync(path.join(os.tmpdir(),'wuwei-quality-recovery-'));
 const original=globalThis.fetch,language=process.env.WUWEI_LANG;
 const requests=[];let assetCalls=0;
 globalThis.fetch=async(url,options={})=>{
  const body=options.body?JSON.parse(options.body):undefined;
  requests.push({url,method:options.method||'GET',body,key:options.headers?.['Idempotency-Key']});
  if(url.endsWith('/catalog'))return Response.json([medium,low]);
  if(url.endsWith('/quote'))return Response.json({sku_id:body.sku_id,price_version:body.price_version,estimated_coins:body.sku_id===low.sku_id?8:29,authorization_ceiling:120});
  if(url.endsWith('/orders')&&options.method==='POST') {
   if(interrupted)throw new TypeError('Connection closed after server accepted order');
   return Response.json({order_id:id,status:'settled',reserved_coins:body.sku_id===low.sku_id?8:29,unit_price_coins:29});
  }
  if(url.endsWith('/orders'))return Response.json({order_id:id,status:'settled'});
  if(url.endsWith('/asset')) {
   if(interrupted && assetCalls++===0)return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([137,80]));c.error(new TypeError('terminated'));}}),{headers:{'Content-Type':'image/png'}});
   return new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}});
  }
  return Response.json({order_id:id,status:'settled',charged_coins:29});
 };
 t.after(()=>{globalThis.fetch=original;process.env.WUWEI_LANG=language;rmSync(root,{recursive:true,force:true});});
 return {root,requests,run:createPlatformImageSession('https://wuweiai.io','fixture-token',path.join(root,'recovery'))};
}
for(const quality of ['low','medium'])test(`quality choice binds the approved ${quality} SKU and its own quote before one paid POST`,async t=>{
 const f=fixture(t);process.env.WUWEI_LANG='zh';
 const chosen=quality==='low'?low:medium;
 const result=await f.run({sku_id:low.sku_id,prompt:'A blue cube'},{cwd:f.root,requestDecision:async d=>{
  assert.equal(f.requests.filter(r=>r.url.endsWith('/orders')&&r.method==='POST').length,0);
  assert.equal(d.i18n.zh.title,'生图费用确认');assert.equal(d.i18n.en.title,'Image cost confirmation');
  assert.equal(d.options[0].value,'generate_image');
  assert.match(d.i18n.en.optionLabels[d.options[0].value],/Low quality.*hold 8/);
  const value=quality==='low'?'generate_image':`generate_image:${medium.sku_id}`;
  assert.match(d.i18n.en.optionLabels[value],new RegExp(`hold ${chosen.coins_per_image}`));
  assert.match(d.i18n.zh.optionLabels[value],new RegExp(`预计 ${chosen.coins_per_image}`));
  return {action:'reply',value};
 }});
 assert.equal(result.isError,undefined);assert.equal(JSON.parse(result.content).displayed,true);
 const paid=f.requests.filter(r=>r.url.endsWith('/orders')&&r.method==='POST');assert.equal(paid.length,1);
 assert.equal(paid[0].body.sku_id,chosen.sku_id);assert.equal(paid[0].body.price_version,chosen.price_version);
 assert.equal(paid[0].body.authorized_budget,120);
});
test('cancelled quality/fee choice creates no order or paid retry',async t=>{
 const f=fixture(t);
 await f.run({sku_id:low.sku_id,prompt:'A blue cube'},{cwd:f.root,requestDecision:async()=>({action:'deny'})});
 assert.equal(f.requests.filter(r=>r.url.endsWith('/orders')).length,0);
});
test('interrupted create and image stream recover the original key, never a second paid POST',async t=>{
 const f=fixture(t,{interrupted:true});
 const result=await f.run({sku_id:low.sku_id,prompt:'A blue cube'},{cwd:f.root,requestDecision:async()=>({action:'reply',value:'generate_image'})});
 assert.equal(result.isError,undefined);assert.equal(JSON.parse(result.content).order_id,id);assert.ok(result.displayImage);
 const paid=f.requests.filter(r=>r.url.endsWith('/orders')&&r.method==='POST');assert.equal(paid.length,1);
 assert.equal(f.requests.find(r=>r.url.endsWith('/orders')&&r.method==='GET').key,paid[0].key);
 assert.equal(f.requests.filter(r=>r.url.endsWith('/asset')).length,2);
});
test('image availability checks selected SKU quote only; missing models, expired login and service failure do not show green',async()=>{
 const calls=[];
 const client={catalog:async()=>[low],quote:async q=>{calls.push(q);return {estimated_coins:8,authorization_ceiling:120};}};
 assert.equal((await checkImageAvailability(client,low.sku_id,'en')).status,'green');
 assert.equal(calls.length,1);assert.equal(calls[0].sku_id,low.sku_id);
 assert.equal((await checkImageAvailability(client,'not-enabled','zh')).status,'yellow');assert.equal(calls.length,1);
 assert.equal((await checkImageAvailability({...client,catalog:async()=>{throw new BillingError('AUTH_REQUIRED','expired',401);}},low.sku_id,'en')).status,'red');
 assert.equal((await checkImageAvailability({...client,quote:async()=>{throw Error('unavailable');}},low.sku_id,'en')).status,'yellow');
});
test('401 and invalid image payloads stop download attempts; no paid POST is used',async t=>{
 const original=globalThis.fetch;let count=0;
 globalThis.fetch=async()=>{count++;return Response.json({code:'UNAUTHORIZED'},{status:401});};t.after(()=>{globalThis.fetch=original;});
 const client=new PlatformBillingClient('https://wuweiai.io',()=> 'fixture-token','platform');
 await assert.rejects(client.image(id),{code:'AUTH_REQUIRED'});assert.equal(count,1);
});
