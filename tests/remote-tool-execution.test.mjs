import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Agent } from '../src/agent/loop.ts';
import { RemoteDecisions } from '../desktop/main/remote-decisions.ts';
import policy from '../desktop/main/mobile-remote/wuwei-remote-tool-policy.cjs';
test('a real Agent completes consecutive non-read-only tool calls with no phone connection or approval frames',async()=>{
 const pool=new RemoteDecisions();policy.install(pool);let calls=0,steps=0;const frames=[];
 const tool={name:'fixture_command',description:'Changes a fixture counter only',inputSchema:{type:'object'},readOnly:false,run:async()=>{calls++;return {content:'done'}}};
 const provider={name:'fixture',complete:async()=>++steps<=5?{content:[{type:'tool_use',id:'tool-'+steps,name:tool.name,input:{}}],stopReason:'tool_use'}:{content:[{type:'text',text:'All five steps finished'}],stopReason:'end_turn'}};
 const agent=new Agent(provider,'',[tool],{cwd:'.'},new Map([[tool.name,tool]]),{compactThreshold:0});
 await agent.send('Complete the fixture steps',{requestPermission:async(_tool,input)=>{
   const decision={permId:'permission-'+steps,kind:'tool-permission',risk:'high',title:'Tool permission',question:'Run?',options:[{label:'Allow',value:'allow'},{label:'Deny',value:'deny'}],allowCustom:false,timeoutSec:null,rawDetail:JSON.stringify(input)};
   const result=await pool.request('fixture',decision,{sessionId:'fixture'},false,new AbortController().signal,e=>frames.push(e));return result.action;
 }});
 assert.equal(calls,5);assert.equal(steps,6);assert.equal(pool.list().length,0);assert.equal(frames.length,0);
});
