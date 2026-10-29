import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RemoteDecisions } from '../desktop/main/remote-decisions.ts';
import policy from '../desktop/main/mobile-remote/wuwei-remote-tool-policy.cjs';
const permission=(id='p')=>({permId:id,kind:'tool-permission',risk:'high',title:'Permission',question:'Run tool?',rawDetail:'shell\n{"command":"fixture"}',options:[{label:'No',value:'deny'},{label:'Yes',value:'allow'}],allowCustom:false,timeoutSec:null});
const business=(id='business')=>({...permission(id),kind:undefined,question:'Which project should receive this file?',rawDetail:undefined});
const ask=(pool,d,frames=[],signal=new AbortController().signal)=>pool.request('r',d,{sessionId:'chat'},false,signal,e=>frames.push(e));
test('every remote command/tool permission proceeds without emitting approval frames by default',async()=>{
 const pool=new RemoteDecisions(),frames=[];policy.install(pool);
 for(let i=0;i<20;i++)assert.deepEqual(await ask(pool,permission('p'+i),frames),{action:'allow'});
 assert.equal(frames.length,0);assert.equal(pool.list().length,0);
});
test('business questions with allow/deny choices remain actual questions',async()=>{
 const pool=new RemoteDecisions();policy.install(pool);const waiting=ask(pool,business());assert.equal(pool.list().length,1);
 pool.decide('business',{action:'deny'});assert.deepEqual(await waiting,{action:'deny'});
});
test('fallback offers all/once/deny; all persists and releases parallel tool waits while preserving business choices',async()=>{
 let saved=false;const pool=new RemoteDecisions(),frames=[];
 policy.install(pool,{getEnabled:()=>saved,saveEnabled:value=>{saved=value;}});
 const one=ask(pool,permission('one'),frames);assert.deepEqual(frames[0].options.map(o=>o.value),['allow_all','allow','deny']);
 pool.decide('one',{action:'allow'});await one;assert.equal(saved,false);
 const a=ask(pool,permission('a')),b=ask(pool,permission('b')),q=ask(pool,business());
 assert.equal(pool.decide('a',{action:'reply',value:'allow_all'},'wrong'),false);assert.equal(saved,false);
 assert.equal(pool.decide('a',{action:'reply',value:'allow_all'},'r'),true);assert.equal(saved,true);
 assert.deepEqual(await a,{action:'allow'});assert.deepEqual(await b,{action:'allow'});
 assert.equal(pool.list().length,1);assert.equal(pool.list()[0].permId,'business');
 assert.equal(pool.decide('a',{action:'reply',value:'allow_all'}),false);
 assert.deepEqual(await ask(pool,permission('next')),{action:'allow'});
 pool.decide('business',{action:'deny'});await q;
 const restarted=new RemoteDecisions();policy.install(restarted,{getEnabled:()=>saved});assert.deepEqual(await ask(restarted,permission()),{action:'allow'});
});
test('installing into a running pool resumes the exact legacy tool permission once without interrupting other questions',async()=>{
 const pool=new RemoteDecisions(),frames=[];const legacy={...permission(),kind:undefined,question:'电脑即将执行一项可能修改本机内容的操作。你要继续吗？'};
 const waiting=ask(pool,legacy,frames),other=ask(pool,business());assert.equal(pool.list().length,2);
 const installed=policy.install(pool);assert.equal(policy.install(pool),installed);
 assert.deepEqual(await waiting,{action:'allow'});assert.equal(frames.filter(e=>e.type==='decision-resolved').length,1);
 assert.equal(pool.list().length,1);pool.decide('business',{action:'deny'});await other;
});
test('stopped work remains stopped even with auto execution enabled',async()=>{
 const pool=new RemoteDecisions();policy.install(pool);const ac=new AbortController();ac.abort();
 assert.deepEqual(await ask(pool,permission(),[],ac.signal),{action:'deny',reason:'abort'});
});
test('policy change resolves waiting tools and leaves subsequent manual mode effective',async()=>{
 const pool=new RemoteDecisions();let enabled=false;
 const control=policy.install(pool,{getEnabled:()=>enabled,saveEnabled:value=>{enabled=value;}});
 const waiting=ask(pool,permission());assert.deepEqual(control.setEnabled(true).resolvedPermIds,['p']);await waiting;
 control.setEnabled(false);const next=ask(pool,permission('later'));assert.equal(pool.list().length,1);pool.decide('later',{action:'deny'});await next;
});
test('a failed persistent setting does not falsely authorize or discard a pending permission',async()=>{
 const pool=new RemoteDecisions();policy.install(pool,{getEnabled:()=>false,saveEnabled:()=>{throw Error('fixture disk failure')}});
 const waiting=ask(pool,permission());assert.throws(()=>pool.decide('p',{action:'reply',value:'allow_all'}),/disk failure/);
 assert.equal(pool.list().length,1);pool.decide('p',{action:'deny'});await waiting;
});
test('legacy recognition requires the exact permission envelope, never arbitrary allow/deny content',()=>{
 const legacy={...permission(),kind:undefined,question:'This operation may change content on your computer. Continue?'};
 assert.equal(policy.isToolPermission(legacy),true);
 for(const change of [{allowCustom:true},{rawDetail:'business detail'},{question:'Approve purchase?'},{options:[{value:'allow'},{value:'later'}]}])assert.equal(policy.isToolPermission({...legacy,...change}),false);
});
