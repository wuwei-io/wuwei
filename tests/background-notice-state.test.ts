import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {applyBackgroundTaskEvent,accountBackgroundTasks,canUpgradeBackgroundTier,type BackgroundTaskEvent} from '../src/billing/background-tasks.js';
import {runBackgroundTask,getBackgroundTasks} from '../desktop/main/background-tasks.js';
import {BackgroundExecutionClient} from '../src/agent/background.js';

test('one worker completing cannot clear another worker queued in the same room',()=>{
 const a:BackgroundTaskEvent={taskId:'a',roomId:'room',queued:true,limit:2,tier:'pro',accountId:'owner'};
 const b={...a,taskId:'b'};
 let state=applyBackgroundTaskEvent({},a);state=applyBackgroundTaskEvent(state,b);
 state=applyBackgroundTaskEvent(state,{...a,queued:false,finished:true});
 assert.deepEqual(Object.keys(state),['b']);assert.equal(state.b.queued,true);
 assert.equal(applyBackgroundTaskEvent(state,b),state);
});
test('admission hides a notice without losing the active task, and completion removes that task',()=>{
 const task:BackgroundTaskEvent={taskId:'task',sid:'chat',queued:true,limit:4,tier:'plus',accountId:'owner'};
 let state=applyBackgroundTaskEvent({},task);state=applyBackgroundTaskEvent(state,{...task,queued:false});
 assert.equal(state.task.queued,false);assert.equal(Object.keys(state).length,1);
 assert.deepEqual(applyBackgroundTaskEvent(state,{...task,queued:false,finished:true}),{});
});
test('account changes never expose a previous account or guest queue',()=>{
 let state=applyBackgroundTaskEvent({},{taskId:'owned',sid:'s',queued:true,accountId:'first'});
 state=applyBackgroundTaskEvent(state,{taskId:'guest',sid:'s',queued:true,accountId:null});
 assert.deepEqual(accountBackgroundTasks(state,'first').map(t=>t.taskId),['owned']);
 assert.deepEqual(accountBackgroundTasks(state,'other'),[]);
 assert.deepEqual(accountBackgroundTasks(state,null).map(t=>t.taskId),['guest']);
});
test('only tiers with a higher plan receive upgrade calls to action',()=>{
 for(const tier of ['free','pro','plus'])assert.equal(canUpgradeBackgroundTier(tier),true);
 for(const tier of ['max','legacy','unknown',undefined])assert.equal(canUpgradeBackgroundTier(tier),false);
});
test('main-process task snapshots carry real server tier, capacity and source, and clean up on completion',async()=>{
 const token=`header.${Buffer.from(JSON.stringify({sub:'owner'})).toString('base64url')}.signature`;
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
 const events:Array<{channel:string;payload:any}>=[];
 const client=new BackgroundExecutionClient('https://isolated.invalid',{retryMs:1,fetch:async(_url,init)=>{
  const body=JSON.parse(String(init?.body));
  return Response.json(body.action==='release'?{allowed:true,released:true}:{allowed:true,backgroundParallel:4,tier:'plus',leaseExpiresAt:new Date(Date.now()+120000).toISOString()});
 }});
 const task=runBackgroundTask('__room_employee',(channel,payload)=>events.push({channel,payload}),()=>client.run(token,async()=>{await held;}),'real-room','Researcher','source-chat');
 await delay(5);const active=getBackgroundTasks();assert.equal(active.length,1);
 assert.equal(active[0].tier,'plus');assert.equal(active[0].limit,4);assert.equal(active[0].accountId,'owner');
 assert.equal(active[0].sourceSid,'source-chat');assert.equal(active[0].roomId,'real-room');assert.equal(active[0].label,'Researcher');assert.equal(active[0].sid,undefined);
 assert.ok(!JSON.stringify(events).includes(token));
 release();await task;assert.deepEqual(getBackgroundTasks(),[]);
 assert.equal(events.at(-1)?.payload.finished,true);
});
