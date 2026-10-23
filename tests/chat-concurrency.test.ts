import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {Agent} from '../src/agent/loop.js';
import {BackgroundExecutionClient,wrapBackgroundProvider} from '../src/agent/background.js';
import {runBackgroundTask,getBackgroundTasks} from '../desktop/main/background-tasks.js';
import type {Provider,Tool} from '../src/types.js';

const token=`header.${Buffer.from(JSON.stringify({sub:'isolated-account'})).toString('base64url')}.signature`;
const done={content:[{type:'text' as const,text:'done'}],stopReason:'end_turn' as const};
function deferred(){let resolve!:()=>void;return {promise:new Promise<void>(r=>{resolve=r;}),resolve:()=>resolve()};}
async function until(check:()=>boolean){for(let n=0;n<200;n++){if(check())return;await delay(2);}assert.fail('condition not reached');}
function fixture(limit:number,unlimited=false){
 const active=new Set<string>();let peak=0,acquires=0,renews=0,failRenew=false;
 const execution=new BackgroundExecutionClient('https://isolated.invalid',{retryMs:1,renewMs:15,fetch:async(_url,init)=>{
  const {action,leaseId}=JSON.parse(String(init?.body));
  if(action==='release'){active.delete(leaseId);return Response.json({allowed:true,released:true});}
  if(action==='renew'){renews++;return Response.json({allowed:!failRenew && active.has(leaseId),leaseExpiresAt:new Date(Date.now()+120000).toISOString()});}
  acquires++;
  if(unlimited)return Response.json({allowed:true,unlimited:true,tier:'pro'});
  if(active.size>=limit)return Response.json({allowed:false,backgroundParallel:limit,tier:limit===1?'free':'plus'});
  active.add(leaseId);peak=Math.max(peak,active.size);
  return Response.json({allowed:true,backgroundParallel:limit,tier:limit===1?'free':'plus',leaseExpiresAt:new Date(Date.now()+120000).toISOString()});
 }});
 return {active,execution,get peak(){return peak;},get acquires(){return acquires;},get renews(){return renews;},failRenew(){failRenew=true;},
  provider(complete:Provider['complete']){return wrapBackgroundProvider({name:'hosted',complete},token,execution);}};
}
function agent(provider:Provider,id:string,tools:Tool[]=[]){return new Agent(provider,'test',tools,{cwd:process.cwd(),sessionId:id},new Map(tools.map(t=>[t.name,t])));}
function chat(id:string,a:Agent,signal?:AbortSignal,events:unknown[]=[]){return runBackgroundTask(id,(_c,p)=>events.push(p),()=>a.send('isolated test input',{},signal));}

for(const limit of [1,2,4,8])test(`ordinary chats enforce ${limit} whole-turn slots and auto-start queued chats`,async()=>{
 const f=fixture(limit),hold=deferred();let entered=0;
 const events:any[]=[];
 const pending=Array.from({length:limit+2},(_,i)=>chat(`chat-${i}`,agent(f.provider(async()=>{entered++;await hold.promise;return done;}),String(i)),undefined,events));
 await until(()=>events.some(e=>e.queued));
 assert.equal(entered,limit);assert.equal(f.active.size,limit);
 assert.equal(getBackgroundTasks().filter(t=>t.queued).length,2);
 assert.ok(events.filter(e=>e.queued).every(e=>e.limit===limit && e.accountId==='isolated-account'));
 hold.resolve();await Promise.all(pending);
 assert.equal(entered,limit+2);assert.equal(f.peak,limit);assert.equal(f.active.size,0);assert.equal(getBackgroundTasks().length,0);
});

test('web tools retain the chat slot across model rounds; another conversation cannot slip through',async()=>{
 const f=fixture(1),toolHold=deferred();let toolStarted=false,secondStarted=false,round=0;
 const tool:Tool={name:'web_search',description:'test',inputSchema:{},readOnly:true,run:async()=>{toolStarted=true;await toolHold.promise;return {content:'result'};}};
 const first=chat('search-chat',agent(f.provider(async()=>++round===1?{content:[{type:'tool_use',id:'web',name:'web_search',input:{}}],stopReason:'tool_use'}:done),'search-chat',[tool]));
 await until(()=>toolStarted);const events:any[]=[];
 const second=chat('second-chat',agent(f.provider(async()=>{secondStarted=true;return done;}),'second-chat'),undefined,events);
 await until(()=>events.some(e=>e.queued));await until(()=>f.renews>0);
 assert.equal(secondStarted,false);assert.equal(f.active.size,1);
 toolHold.resolve();await Promise.all([first,second]);assert.equal(round,2);assert.equal(secondStarted,true);assert.equal(f.peak,1);
});

test('cancelling a queued chat keeps its user message, never calls the model and removes its notice',async()=>{
 const f=fixture(1),hold=deferred(),stop=new AbortController();let entered=false;
 const first=chat('first',agent(f.provider(async()=>{entered=true;await hold.promise;return done;}),'first'));
 await until(()=>entered);let called=false;const events:any[]=[];
 const a=agent(f.provider(async()=>{called=true;return done;}),'cancelled');
 const second=chat('cancelled',a,stop.signal,events),rejection=assert.rejects(second,{name:'AbortError'});
 await until(()=>events.some(e=>e.queued));stop.abort();await rejection;
 assert.equal(called,false);assert.equal(a.getMessages()[0].role,'user');assert.equal(events.at(-1).finished,true);
 hold.resolve();await first;assert.equal(f.active.size,0);
});

test('synchronous employee handoff releases parent capacity and resumes without a free-tier deadlock',async()=>{
 const f=fixture(1);let round=0,childCalls=0;
 const child=agent(f.provider(async()=>{childCalls++;return done;}),'child');
 const tool:Tool={name:'dm_teammate',description:'test',inputSchema:{},readOnly:false,run:async()=>{await chat('child',child);return {content:'child result'};}};
 const parent=agent(f.provider(async()=>++round===1?{content:[{type:'tool_use',id:'dm',name:'dm_teammate',input:{}}],stopReason:'tool_use'}:done),'parent',[tool]);
 await Promise.race([chat('parent',parent),delay(1000).then(()=>{throw Error('deadlocked');})]);
 assert.equal(round,2);assert.equal(childCalls,1);assert.equal(f.peak,1);assert.equal(f.active.size,0);
});

test('lease loss during a long tool aborts that tool and prevents the next model round',async()=>{
 const f=fixture(1);let calls=0,toolAborted=false;
 const tool:Tool={name:'web_fetch',description:'test',inputSchema:{},readOnly:true,run:async(_i,ctx)=>{
  f.failRenew();try{await delay(1000,undefined,{signal:ctx.signal});}catch(error){toolAborted=!!ctx.signal?.aborted;throw error;}return {content:'unexpected'};
 }};
 const a=agent(f.provider(async()=>{calls++;return {content:[{type:'tool_use',id:'fetch',name:tool.name,input:{}}],stopReason:'tool_use'};}),'lease-loss',[tool]);
 await assert.rejects(chat('lease-loss',a));assert.equal(toolAborted,true);assert.equal(calls,1);assert.equal(f.active.size,0);
});

test('grandfathered purchased periods stay unlimited for ordinary chats',async()=>{
 const f=fixture(1,true),hold=deferred();let entered=0;
 const pending=Array.from({length:3},(_,i)=>chat('protected-'+i,agent(f.provider(async()=>{entered++;await hold.promise;return done;}),'protected-'+i)));
 await until(()=>entered===3);assert.equal(f.active.size,0);hold.resolve();await Promise.all(pending);
});

test('explicit image mode shares chat admission and cancellation never starts image generation',async()=>{
 const f=fixture(1),hold=deferred();let running=false,images=0;
 const first=chat('text',agent(f.provider(async()=>{running=true;await hold.promise;return done;}),'text'));
 await until(()=>running);
 const p=f.provider(async()=>done);p.platformImage=async()=>({content:'image'});
 const tool:Tool={name:'platform_imagegen',description:'test',inputSchema:{},readOnly:false,run:async()=>{images++;return {content:'image'};}};
 const a=agent(p,'image',[tool]),stop=new AbortController(),events:any[]=[];
 const second=runBackgroundTask('image',(_c,p)=>events.push(p),()=>a.sendImage('test','test-sku',{},stop.signal));
 const rejected=assert.rejects(second,{name:'AbortError'});await until(()=>events.some(e=>e.queued));stop.abort();await rejected;
 assert.equal(images,0);assert.equal(a.getMessages().length,1);hold.resolve();await first;
});

test('BYOK calls do not contact hosted billing',async()=>{
 let calls=0;const p:Provider={name:'BYOK',complete:async()=>{calls++;return done;}};
 await Promise.all([agent(p,'a').send('test',{}),agent(p,'b').send('test',{})]);assert.equal(calls,2);
});

test('waiting for a user decision frees capacity, then reacquires before resuming the parent',async()=>{
 const f=fixture(1),answer=deferred();let waiting=false,round=0,otherRan=false;
 const tool:Tool={name:'ask_user',description:'test',inputSchema:{},readOnly:false,run:async()=>{waiting=true;await answer.promise;return {content:'answer'};}};
 const parent=chat('asking',agent(f.provider(async()=>++round===1?{content:[{type:'tool_use',id:'ask',name:tool.name,input:{}}],stopReason:'tool_use'}:done),'asking',[tool]));
 await until(()=>waiting);
 await chat('other',agent(f.provider(async()=>{otherRan=true;return done;}),'other'));
 assert.equal(otherRan,true);answer.resolve();await parent;assert.equal(round,2);assert.equal(f.peak,1);
});

test('an asynchronous child waits for the parent turn to finish, then runs automatically',async()=>{
 const f=fixture(1),hold=deferred();let parentRound=0,childRan=false,child:Promise<void>|undefined;
 const tool:Tool={name:'assign_task',description:'test',inputSchema:{},readOnly:false,run:async()=>{
  child=chat('async-child',agent(f.provider(async()=>{childRan=true;return done;}),'async-child'));
  return {content:'assigned'};
 }};
 const parent=chat('assigning',agent(f.provider(async()=>{
  if(++parentRound===1)return {content:[{type:'tool_use',id:'assign',name:tool.name,input:{}}],stopReason:'tool_use'};
  await hold.promise;return done;
 }),'assigning',[tool]));
 await until(()=>parentRound===2);assert.equal(childRan,false);assert.ok(getBackgroundTasks().some(t=>t.sid==='async-child' && t.queued));
 hold.resolve();await parent;await child;assert.equal(childRan,true);assert.equal(f.peak,1);
});

test('one failed read tool cannot free a slot while another parallel tool is still running',async()=>{
 const f=fixture(1),hold=deferred();let working=false,otherRan=false;
 const tools:Tool[]=[
  {name:'fail',description:'test',inputSchema:{},readOnly:true,run:async()=>{throw Error('isolated tool failure');}},
  {name:'hold',description:'test',inputSchema:{},readOnly:true,run:async()=>{working=true;await hold.promise;return {content:'done'};}},
 ];
 const first=chat('tool-error',agent(f.provider(async()=>({content:tools.map(t=>({type:'tool_use' as const,id:t.name,name:t.name,input:{}})),stopReason:'tool_use'})),'tool-error',tools));
 const rejected=assert.rejects(first,/isolated tool failure/);await until(()=>working);
 const events:any[]=[];
 const second=chat('after-error',agent(f.provider(async()=>{otherRan=true;return done;}),'after-error'),undefined,events);
 await until(()=>events.some(e=>e.queued));assert.equal(otherRan,false);
 hold.resolve();await rejected;await second;assert.equal(otherRan,true);assert.equal(f.active.size,0);
});
