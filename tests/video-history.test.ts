import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {VideoHistoryStore} from '../src/videogen/history-store.js';
import type {VideoOrder} from '../src/videogen/contracts.js';
const ownerA='a'.repeat(32),ownerB='b'.repeat(32),requestA='ba701263-0cb0-4fd9-a61d-08113893821d',requestB='ca701263-0cb0-4fd9-a61d-08113893821d';
const row=(request_id=requestA)=>({id:'ba701263-0cb0-4fd9-a61d-08113893821c',request_id,batch_index:0,input:{prompt:'A real creation title'},created_at:'2026-10-26T00:00:00Z',completed_at:null,status:'in_progress'})as VideoOrder;
async function fixture(run:(store:VideoHistoryStore,root:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'wuwei-video-history-'));try{await run(new VideoHistoryStore(root),root)}finally{assert(resolve(root).startsWith(resolve(tmpdir())+sep)&&basename(root).startsWith('wuwei-video-history-'));await rm(root,{recursive:true,force:true})}}
test('one sidebar entry represents a batch and survives restart without bumping timestamps on reads',()=>fixture(async(store,root)=>{
 await store.sync(ownerA,[row(),{...row(),id:'ca701263-0cb0-4fd9-a61d-08113893821c',batch_index:1}]);const before=await store.list(ownerA);assert.equal(before.length,1);assert.equal(before[0].count,2);
 const restarted=new VideoHistoryStore(root);assert.deepEqual(await restarted.list(ownerA),before);assert.deepEqual(await store.list(ownerB),[]);
}));
test('deletion persists across polling and restart and never affects another account',()=>fixture(async(store,root)=>{
 await store.sync(ownerA,[row()]);await store.sync(ownerB,[row()]);await store.remove(ownerA,requestA);
 assert.deepEqual(await store.sync(ownerA,[{...row(),status:'completed',completed_at:'2026-10-26T01:00:00Z'}]),[]);
 const restarted=new VideoHistoryStore(root);assert.deepEqual(await restarted.list(ownerA),[]);assert.deepEqual(await restarted.sync(ownerA,[row()]),[]);assert.equal((await restarted.list(ownerB)).length,1);
}));
test('concurrent refresh and delete cannot resurrect a removed creation',()=>fixture(async store=>{
 await store.sync(ownerA,[row()]);await Promise.all([store.sync(ownerA,[row(),row(requestB)]),store.remove(ownerA,requestA),store.sync(ownerA,[row(),row(requestB)])]);assert.deepEqual((await store.list(ownerA)).map(x=>x.requestId),[requestB]);
}));
test('invalid identifiers and damaged history fail closed rather than restoring deleted records',()=>fixture(async(store,root)=>{
 await assert.rejects(store.list('../escape'));await assert.rejects(store.remove(ownerA,'../escape'));
 await mkdir(join(root,ownerA),{recursive:true});for(const damaged of ['invalid json','null','{"entries":null,"deleted":[]}']){await writeFile(join(root,ownerA,'history.json'),damaged);await assert.rejects(store.sync(ownerA,[row()]),/VIDEO_HISTORY_UNAVAILABLE/);}
}));


test('cached works reopen from disk without a network read and exclude reference image bytes',()=>fixture(async(store,root)=>{
 const original={...row(),input:{...row().input,frames:[{type:'first_frame' as const,url:'data:image/png;base64,private-reference'}]}};
 await store.sync(ownerA,[original]);const restarted=new VideoHistoryStore(root),cached=await restarted.cachedOrders(ownerA);
 assert.equal(cached.length,1);assert.equal(cached[0].id,original.id);assert.equal(cached[0].input.has_references,true);assert.deepEqual(cached[0].input.frames,[]);
 assert.deepEqual(await restarted.cachedOrders(ownerB),[]);
}));
test('deleted cached works stay removed after refresh and restart',()=>fixture(async(store,root)=>{
 await store.sync(ownerA,[row()]);await store.remove(ownerA,requestA);await store.sync(ownerA,[row()]);
 assert.deepEqual(await new VideoHistoryStore(root).cachedOrders(ownerA),[]);
}));
test('pre-cache history schema remains readable and new cache records replace stale status',()=>fixture(async(store,root)=>{
 await mkdir(join(root,ownerA),{recursive:true});await writeFile(join(root,ownerA,'history.json'),JSON.stringify({entries:[],deleted:[]}));
 assert.deepEqual(await store.cachedOrders(ownerA),[]);await store.sync(ownerA,[row()]);assert.equal((await store.cachedOrders(ownerA))[0].status,'in_progress');
 await store.sync(ownerA,[{...row(),status:'completed'}]);assert.equal((await store.cachedOrders(ownerA))[0].status,'completed');
}));

test('syncing a new creation preserves other cached works',()=>fixture(async store=>{
 await store.sync(ownerA,[row()]);const next={...row(requestB),id:'ca701263-0cb0-4fd9-a61d-08113893821c'};await store.sync(ownerA,[next]);
 assert.equal((await store.cachedOrders(ownerA)).length,2);
}));

test('follow-up generation keeps one creation, first title and separate order identities after restart',()=>fixture(async(store,root)=>{
 await store.sync(ownerA,[row()]);await store.attach(ownerA,requestB,requestA);
 const second={...row(requestB),id:'ca701263-0cb0-4fd9-a61d-08113893821c',input:{prompt:'Follow-up prompt'},created_at:'2026-10-26T02:00:00Z'} as VideoOrder;
 const result=await store.sync(ownerA,[second]);assert.equal(result[0].creation_id,requestA);assert.equal(result[0].request_id,requestB);
 const entries=await store.list(ownerA);assert.equal(entries.length,1);assert.equal(entries[0].requestId,requestA);assert.equal(entries[0].title,'A real creation title');assert.equal(entries[0].count,2);
 const restarted=new VideoHistoryStore(root);const rows=await restarted.cachedOrders(ownerA);assert.equal(rows.length,2);assert(rows.every(o=>o.creation_id===requestA));
 await restarted.sync(ownerA,[row(),second]);assert.equal((await restarted.list(ownerA)).length,1);
}));
test('deleting a creation removes all its appended orders without resurrection or touching other accounts',()=>fixture(async store=>{
 await store.sync(ownerA,[row()]);await store.attach(ownerA,requestB,requestA);const second={...row(requestB),id:'ca701263-0cb0-4fd9-a61d-08113893821c'};
 await store.sync(ownerA,[second]);await store.sync(ownerB,[second]);await store.remove(ownerA,requestB);assert.deepEqual(await store.cachedOrders(ownerA),[]);
 assert.deepEqual(await store.sync(ownerA,[row(),second]),[]);assert.deepEqual(await store.list(ownerA),[]);assert.equal((await store.list(ownerB)).length,1);
}));
test('continuation rejects missing or foreign creations and cannot move an existing order to another creation',()=>fixture(async store=>{
 await store.sync(ownerA,[row()]);await assert.rejects(store.attach(ownerB,requestB,requestA),/INVALID_ORDER/);
 await store.attach(ownerA,requestB,requestA);const other='da701263-0cb0-4fd9-a61d-08113893821d';await store.sync(ownerA,[{...row(other),id:'ea701263-0cb0-4fd9-a61d-08113893821c'}]);await assert.rejects(store.attach(ownerA,requestB,other),/INVALID_ORDER/);
}));
