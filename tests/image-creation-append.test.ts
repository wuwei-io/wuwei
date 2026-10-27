import test from 'node:test';
import assert from 'node:assert/strict';
import {Agent} from '../src/agent/loop.js';
import {studioBatches} from '../desktop/renderer/src/components/image-gallery-data.js';
test('two image generations append to the same agent history and reopen as two batches',async()=>{
 let count=0;const provider={name:'qa',complete:async()=>{throw Error('No text model call')},platformImage:async()=>({content:JSON.stringify({order_id:'original-'+(++count),displayed:true,charged_coins:0}),displayImage:'data:image/png;base64,qa'})};
 const tool={name:'platform_imagegen',description:'',inputSchema:{},run:(input:any,ctx:any)=>ctx.platformImage(input,ctx)};
 const make=()=>new Agent(provider,'',[tool],{cwd:'.',sessionId:'same-image-conversation'},new Map([[tool.name,tool]]),{compactThreshold:0});
 const agent=make();await agent.sendImage('First prompt','qa-image',{});await agent.sendImage('Second prompt','qa-image',{});
 const messages=agent.getMessages();assert.equal(messages.filter(m=>m.role==='user'&&m.content.some((b:any)=>b.type==='text')).length,2);
 const results=messages.flatMap(m=>m.content).filter((b:any)=>b.type==='tool_result');assert.equal(results.length,2);
 const reopened=make();reopened.setMessages(JSON.parse(JSON.stringify(messages)));assert.equal(reopened.getMessages().flatMap(m=>m.content).filter((b:any)=>b.type==='tool_result').length,2);
 const items:any[]=[];for(const message of reopened.getMessages())for(const block of message.content as any[]){if(message.role==='user'&&block.type==='text')items.push({type:'user',text:block.text});if(block.type==='tool_use')items.push({type:'tool',id:block.id,name:block.name,input:block.input,status:'done'});if(block.type==='tool_result'){const target=items.find(i=>i.id===block.tool_use_id);target.result=block.content.find((b:any)=>b.type==='text').text;target.image=block.content.find((b:any)=>b.type==='image').dataUrl;}}
 const batches=studioBatches(items,[],false);assert.equal(batches.length,2);assert.deepEqual(batches.map(b=>b.prompt),['First prompt','Second prompt']);assert(batches.every(b=>b.artworks[0].state==='complete'));
});
