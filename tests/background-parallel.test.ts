import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {BackgroundExecutionClient,withBackgroundTask,wrapBackgroundProvider,setBackgroundTokenResolver} from '../src/agent/background.js';
import type {Provider} from '../src/types.js';

const token=`header.${Buffer.from(JSON.stringify({sub:'isolated-user'})).toString('base64url')}.signature`;
function deferred(){let resolve!:(value?:unknown)=>void;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
function server(limit:number){
 const active=new Set<string>(),seen:string[]=[];let peak=0;
 const request:typeof fetch=async (_url,init)=>{
  const {action,leaseId}=JSON.parse(String(init?.body));seen.push(action);
  if(action==='release'){active.delete(leaseId);return Response.json({allowed:true,released:true});}
  if(action==='renew')return Response.json({allowed:active.has(leaseId),leaseExpiresAt:new Date(Date.now()+120000).toISOString()});
  if(active.size>=limit && !active.has(leaseId))return Response.json({allowed:false,backgroundParallel:limit,retryAfterMs:1});
  active.add(leaseId);peak=Math.max(peak,active.size);
  return Response.json({allowed:true,backgroundParallel:limit,leaseExpiresAt:new Date(Date.now()+120000).toISOString()});
 };
 return {active,seen,fetch:request,get peak(){return peak;}};
}
for(const limit of [1,2,4,8])test(`background capacity ${limit}: excess work queues and then completes`,async()=>{
 const fixture=server(limit),client=new BackgroundExecutionClient('https://isolated.invalid',{fetch:fixture.fetch,retryMs:1});
 const hold=deferred();let running=0,peak=0,finished=0,queued=0;
 const calls=Array.from({length:limit+2},(_,i)=>withBackgroundTask({id:String(i),onQueue:q=>{if(q)queued++;}},()=>client.run(token,async()=>{
  running++;peak=Math.max(peak,running);await hold.promise;running--;finished++;return i;
 })));
 await delay(10);assert.equal(running,limit);assert.ok(queued>0);
 hold.resolve();await Promise.all(calls);
 assert.equal(peak,limit);assert.equal(fixture.peak,limit);assert.equal(finished,limit+2);assert.equal(fixture.active.size,0);
});
test('foreground and BYOK provider calls never enter the hosted admission queue',async()=>{
 let api=0;
 const client=new BackgroundExecutionClient('https://isolated.invalid',{fetch:async()=>{api++;throw Error('unexpected');}});
 assert.equal(await client.run(token,async()=>42),42);assert.equal(api,0);
 const provider:Provider={name:'BYOK',complete:async()=>({content:[],stopReason:'end_turn'})};
 await withBackgroundTask({id:'byok'},()=>provider.complete('',[],[],{}));assert.equal(api,0);
});
test('waiting tools and nested employee work cannot hold a parent slot hostage',async()=>{
 const fixture=server(1),client=new BackgroundExecutionClient('https://isolated.invalid',{fetch:fixture.fetch,retryMs:1});
 await withBackgroundTask({id:'parent'},async()=>{
  await client.run(token,async()=>{assert.equal(fixture.active.size,1);});
  assert.equal(fixture.active.size,0); // tool/user wait is outside a model call
  await withBackgroundTask({id:'child'},()=>client.run(token,async()=>{assert.equal(fixture.active.size,1);}));
  await client.run(token,async()=>{assert.equal(fixture.active.size,1);});
 });
 assert.equal(fixture.active.size,0);
});
test('queued cancellation never invokes the model and releases any ambiguous lease',async()=>{
 const fixture=server(1),client=new BackgroundExecutionClient('https://isolated.invalid',{fetch:fixture.fetch,retryMs:1});
 const hold=deferred();const first=withBackgroundTask({id:'first'},()=>client.run(token,async()=>hold.promise));
 await delay(5);const stop=new AbortController();let called=false;
 const second=withBackgroundTask({id:'second'},()=>client.run(token,async()=>{called=true;},stop.signal));
 const rejected=assert.rejects(second,{name:'AbortError'});await delay(5);stop.abort();await rejected;
 assert.equal(called,false);hold.resolve();await first;assert.equal(fixture.active.size,0);
});
test('an upstream failure releases capacity',async()=>{
 const fixture=server(1),client=new BackgroundExecutionClient('https://isolated.invalid',{fetch:fixture.fetch});
 await assert.rejects(withBackgroundTask({id:'error'},()=>client.run(token,async()=>{throw Error('upstream');})),/upstream/);
 assert.equal(fixture.active.size,0);
});
test('lease renewal failure aborts the active model call without silently exceeding capacity',async()=>{
 const fixture=server(1),client=new BackgroundExecutionClient('https://isolated.invalid',{renewMs:5,fetch:async(url,init)=>
  JSON.parse(String(init?.body)).action==='renew'?Response.json({allowed:false,error:'lease_expired'}):fixture.fetch(url,init)});
 await assert.rejects(withBackgroundTask({id:'long'},()=>client.run(token,async signal=>{
  await delay(100,undefined,{signal});
 })));
 assert.equal(fixture.active.size,0);
});
test('long model calls renew the same lease and leave no timers or capacity behind',async()=>{
 const fixture=server(1),client=new BackgroundExecutionClient('https://isolated.invalid',{fetch:fixture.fetch,renewMs:5});
 await withBackgroundTask({id:'long'},()=>client.run(token,async()=>delay(22)));
 assert.ok(fixture.seen.includes('renew'));assert.equal(fixture.active.size,0);
 const requests=fixture.seen.length;await delay(12);assert.equal(fixture.seen.length,requests);
});
test('disabled policy and pre-migration servers preserve existing execution',async()=>{
 for(const reply of [()=>Response.json({allowed:true,unlimited:true}),()=>new Response(null,{status:404})]){
  const client=new BackgroundExecutionClient('https://isolated.invalid',{fetch:async()=>reply()});
  assert.equal(await withBackgroundTask({id:'staged'},()=>client.run(token,async()=>7)),7);
 }
});
test('unverifiable capacity never starts a background hosted model call',async()=>{
 const client=new BackgroundExecutionClient('https://isolated.invalid',{fetch:async()=>Response.json({error:'background_unavailable'},{status:503})});
 let called=false;await assert.rejects(withBackgroundTask({id:'offline'},()=>client.run(token,async()=>{called=true;})));
 assert.equal(called,false);
});
test('anonymous visitors share one local slot without sending guest credentials to billing',async()=>{
 const client=new BackgroundExecutionClient('https://isolated.invalid',{fetch:async()=>{throw Error('guest billing request');}});
 const hold=deferred();let running=0,peak=0;
 const calls=Array.from({length:3},(_,i)=>withBackgroundTask({id:String(i)},()=>client.run('not-needed',async()=>{
  running++;peak=Math.max(peak,running);await hold.promise;running--;
 })));
 await delay(5);assert.equal(running,1);hold.resolve();await Promise.all(calls);assert.equal(peak,1);
});
test('a hosted provider preserves methods and foreground request handlers',async()=>{
 const seen:unknown[]=[];
 const provider:Provider={name:'hosted',contextWindow:1000,complete:async(_s,_m,_t,h)=>{seen.push(h);return {content:[],stopReason:'end_turn'};}};
 const wrapped=wrapBackgroundProvider(provider,token);const stop=new AbortController();
 await wrapped.complete('',[],[],{signal:stop.signal});assert.equal(wrapped.contextWindow,1000);assert.equal((seen[0] as {signal:AbortSignal}).signal,stop.signal);
});

test('actual hosted provider wrappers share the background pool while chat stays available',async()=>{
 const fixture=server(1),client=new BackgroundExecutionClient('https://isolated.invalid',{fetch:fixture.fetch,retryMs:1});
 const hold=deferred();let calls=0;
 const make=()=>wrapBackgroundProvider({name:'hosted',complete:async()=>{calls++;await hold.promise;return {content:[],stopReason:'end_turn'};}},token,client);
 const first=withBackgroundTask({id:'employee'},()=>make().complete('',[],[],{}));
 await delay(5);
 const second=withBackgroundTask({id:'schedule'},()=>make().complete('',[],[],{}));
 const chat=make().complete('',[],[],{});
 await delay(5);assert.equal(calls,2); // one background plus unrestricted foreground
 hold.resolve();await Promise.all([first,second,chat]);assert.equal(calls,3);assert.equal(fixture.peak,1);
});
test('an account change cannot move queued work to a different wallet',async()=>{
 const fixture=server(1),client=new BackgroundExecutionClient('https://isolated.invalid',{fetch:fixture.fetch});
 const other=`header.${Buffer.from(JSON.stringify({sub:'other-user'})).toString('base64url')}.signature`;
 setBackgroundTokenResolver(async()=>other);
 try{
  let called=false;await assert.rejects(withBackgroundTask({id:'switched'},()=>client.run(token,async()=>{called=true;})));
  assert.equal(called,false);assert.equal(fixture.active.size,0);assert.equal(fixture.seen.length,0);
 }finally{setBackgroundTokenResolver(async value=>value);}
});
