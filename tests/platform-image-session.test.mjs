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
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url.endsWith('/catalog')?[sku]:req.url.endsWith('/quote')?{sku_id:sku.sku_id,price_version:id,estimated_coins:8,authorization_ceiling:120}:req.method==='POST'?{order_id:id,status:'settled',reserved_coins:8,unit_price_coins:8}:{order_id:id,status:'settled',charged_coins:9}));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
 const run=create(`http://127.0.0.1:${server.address().port}`,'mock-token',path.join(root,'recovery'));
 let confirms=0;const ctx={cwd:root,requestDecision:async d=>{confirms++;assert.ok(d.question.includes('预占 8'));assert.equal(calls.filter(c=>c.path==='/api/images/orders').length,0);return {action:'reply',value:'generate_image'};}};
 const result=await run({sku_id:sku.sku_id,prompt:'cat'},ctx);assert.equal(result.isError,undefined);assert.ok(result.displayImage);assert.equal(confirms,1);
 assert.equal(calls.find(c=>c.path==='/api/images/orders').body.authorized_budget,120);
 const recovered=await run({action:'settle',order_id:id},{cwd:root,requestDecision:async()=>({action:'reply',value:'settle_image'})});assert.ok(recovered.displayImage);assert.equal(calls.filter(c=>c.path.endsWith('/settle')).length,1);assert.equal(calls.filter(c=>c.path==='/api/images/orders').length,1);
 const cancelled=await run({sku_id:sku.sku_id,prompt:'cat'},{cwd:root,requestDecision:async()=>({action:'deny'})});assert.ok(cancelled.content.includes('取消'));assert.equal(calls.filter(c=>c.path==='/api/images/orders').length,1);
});
