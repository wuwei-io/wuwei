import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
// Compile with owned dependencies, preserving project's ESM config.
const out=mkdtempSync(path.join(process.cwd(),'.image-session-'));let create;
try{execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--target','ES2022','--module','commonjs','--moduleResolution','node','--strict','--skipLibCheck','--esModuleInterop','--outDir',out,'src/imagegen/platform-image-session.ts']);
 const fs=await import('node:fs');fs.writeFileSync(path.join(out,'package.json'),'{"type":"commonjs"}');
 ({createPlatformImageSession:create}=createRequire(import.meta.url)(path.join(out,'imagegen/platform-image-session.js')));
}finally{rmSync(out,{recursive:true,force:true});}
test('actual tool session quotes/confirms before POST, writes recovery and displays one delivered PNG',async t=>{
 const root=mkdtempSync(path.join(tmpdir(),'wuwei-image-session-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const id='abcdef12-3456-7890-abcd-1234567890ab';const calls=[];
 const sku={sku_id:'openai-low',price_version:id,authorization_ceiling:120,coins_per_image:8,model:'gpt-image-1',size:'1024x1024',quality:'low',max_count:1,max_prompt_bytes:1000};
 const server=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;calls.push({path:req.url,body:raw?JSON.parse(raw):null});
  if(req.url.endsWith('/asset')){res.writeHead(200,{'Content-Type':'image/png'});res.end(Buffer.from([137,80,78,71]));return;}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url.endsWith('/catalog')?[sku]:req.url.endsWith('/quote')?{sku_id:sku.sku_id,price_version:id,estimated_coins:8,authorization_ceiling:120}:req.method==='POST'?{order_id:id,status:'settled',reserved_coins:8,unit_price_coins:8}:{order_id:id,status:'settled',charged_coins:9,actual_coins:9}));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
 const run=create(`http://127.0.0.1:${server.address().port}`,'mock-token',path.join(root,'recovery'));
 let confirms=0;const ctx={cwd:root,requestDecision:async d=>{confirms++;assert.ok(d.question.includes('预占 8'));assert.equal(calls.filter(c=>c.path==='/api/images/orders'&&c.body).length,0);return {action:'reply',value:'generate_image'};}};
 const result=await run({sku_id:sku.sku_id,prompt:'cat'},ctx);assert.equal(result.isError,undefined);assert.ok(result.displayImage);assert.equal(confirms,1);
 assert.equal(calls.find(c=>c.path==='/api/images/orders').body.authorized_budget,120);
 const lookup=await run({recovery_key:'abcdef12-3456-7890-abcd-1234567890ab'},{cwd:root});assert.equal(JSON.parse(lookup.content).order_id,id);assert.equal(calls.filter(c=>c.path==='/api/images/orders'&&c.body).length,1);
 const recovered=await run({action:'settle',order_id:id},{cwd:root,requestDecision:async()=>({action:'reply',value:'settle_image'})});assert.ok(recovered.displayImage);assert.equal(calls.filter(c=>c.path.endsWith('/settle')).length,1);assert.equal(calls.filter(c=>c.path==='/api/images/orders'&&c.body).length,1);
 const reauthorized=await run({action:'reauthorize',order_id:id},{cwd:root,requestDecision:async d=>{assert.ok(d.question.includes('9 无为币'));assert.ok(d.i18n.en.question.includes('9 coins'));return {action:'reply',value:'reauthorize_image'};}});assert.ok(reauthorized.displayImage);assert.deepEqual(calls.find(c=>c.path.endsWith('/reauthorize')).body,{authorized_budget:9});
 const cancelled=await run({sku_id:sku.sku_id,prompt:'cat'},{cwd:root,requestDecision:async()=>({action:'deny'})});assert.ok(cancelled.content.includes('取消'));assert.equal(calls.filter(c=>c.path==='/api/images/orders'&&c.body).length,1);
});

test('empty image catalog reports service unavailability before confirmation or order creation',async t=>{
 const requests=[];let confirms=0;
 const previousFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{requests.push({url,method:options.method});return Response.json([]);};
 t.after(()=>{globalThis.fetch=previousFetch;});
 const run=create('https://wuweiai.io','mock-token');
 const ctx={cwd:tmpdir(),requestDecision:async()=>{confirms++;return {value:'generate_image'};}};
 for(const input of [{action:'catalog'},{action:'generate',sku_id:'invented',prompt:'cat'}]){
  const result=await run(input,ctx);
  assert.equal(result.isError,true);
  assert.equal(JSON.parse(result.content).code,'IMAGE_CATALOG_EMPTY');
 }
 assert.equal(confirms,0);
 assert.equal(requests.length,2);
 assert.ok(requests.every(request=>request.url.endsWith('/api/images/catalog') && request.method==='GET'));
});

test('generate recovers delayed settlement and automatically displays the original image without a second fee dialog or generation',async t=>{
 const root=mkdtempSync(path.join(tmpdir(),'wuwei-image-delivery-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const id='abcdef12-3456-7890-abcd-1234567890ab',calls=[];let settled=false,confirmed=0;
 const sku={sku_id:'nano-banana-2',price_version:id,authorization_ceiling:120,coins_per_image:46,model:'google/gemini-3.1-flash-image-preview',size:'native',quality:'default',max_count:1,max_prompt_bytes:1000};
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,options={})=>{
  const method=options.method||'GET';calls.push({url,method});
  if(url.endsWith('/catalog'))return Response.json([sku]);
  if(url.endsWith('/quote'))return Response.json({sku_id:sku.sku_id,price_version:id,estimated_coins:46,authorization_ceiling:120});
  if(url.endsWith('/orders')&&method==='POST')return Response.json({order_id:id,status:'unknown',reserved_coins:46,unit_price_coins:46});
  if(url.endsWith('/settle')){settled=true;return Response.json({status:'settled'});}
  if(url.endsWith('/asset'))return new Response(Buffer.from([137,80,78,71]),{headers:{'Content-Type':'image/png'}});
  return Response.json({order_id:id,status:settled?'settled':'unknown',charged_coins:settled?46:0});
 };
 t.after(()=>{globalThis.fetch=originalFetch;});
 const run=create('https://wuweiai.io','test-only-token',path.join(root,'recovery'));
 const result=await run({action:'generate',sku_id:sku.sku_id,prompt:'cube'},{cwd:root,requestDecision:async()=>{confirmed++;return {action:'reply',value:'generate_image'};}});
 assert.equal(result.isError,undefined,result.content);assert.ok(result.displayImage);assert.equal(JSON.parse(result.content).displayed,true);
 assert.equal(confirmed,1);
 assert.equal(calls.filter(c=>c.url.endsWith('/orders')&&c.method==='POST').length,1);
 assert.equal(calls.filter(c=>c.url.endsWith('/settle')&&c.method==='POST').length,1);
 const recovered=await run({action:'query',order_id:id},{cwd:root});assert.ok(recovered.displayImage);
 assert.equal(calls.filter(c=>c.url.endsWith('/orders')&&c.method==='POST').length,1);
});

test('a pending order is a delivery error, never a success or a new paid request',async t=>{
 const previousFetch=globalThis.fetch,requests=[];
 globalThis.fetch=async(url,options={})=>{requests.push({url,method:options.method||'GET'});return Response.json({order_id:'abcdef12-3456-7890-abcd-1234567890ab',status:'dispatching',charged_coins:0});};
 t.after(()=>{globalThis.fetch=previousFetch;});
 const result=await create('https://wuweiai.io','test-only-token')({action:'query',order_id:'abcdef12-3456-7890-abcd-1234567890ab'},{cwd:tmpdir()});
 assert.equal(result.isError,true);assert.equal(result.displayImage,undefined);
 assert.equal(JSON.parse(result.content).displayed,false);assert.equal(JSON.parse(result.content).code,'IMAGE_NOT_DELIVERED');
 assert.equal(requests.length,1);assert.equal(requests[0].method,'GET');
});
