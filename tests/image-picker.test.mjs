import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Agent} from '../src/agent/loop.ts';

test('image picker uses the selected SKU, native human decision and inline delivery without a text-model call',async()=>{
  const provider={name:'openai',complete:()=>{throw Error('Image picker must not call a text model');},platformImage:async(input,ctx)=>{
    assert.equal(input.sku_id,'nano-banana-2');assert.equal(input.prompt,'Blue cube');
    const response=await ctx.requestDecision({permId:'fee',question:'46 coins',options:[{label:'Generate',value:'generate_image'}]});
    assert.equal(response.value,'generate_image');
    return {content:JSON.stringify({displayed:true,path:'C:/cube.png',charged_coins:46}),displayImage:'data:image/png;base64,abc'};
  }};
  const tool={name:'platform_imagegen',description:'',inputSchema:{},run:(input,ctx)=>ctx.platformImage(input,ctx)};
  const agent=new Agent(provider,'',[tool],{cwd:'.'},new Map([[tool.name,tool]]),{compactThreshold:0});
  const events=[];
  await agent.sendImage('Blue cube','nano-banana-2',{requestDecision:async()=>({value:'generate_image'}),onToolStart:(_id,name)=>events.push(name),onToolEnd:(_id,_text,_err,image)=>events.push(image),onText:text=>events.push(text)});
  assert.deepEqual(events.slice(0,2),['platform_imagegen','data:image/png;base64,abc']);
  assert.equal(events.length,3);
  assert.ok(agent.getMessages().some(m=>m.content.some(b=>b.type==='tool_result')));
});

test('pending image outcome cannot become a generated-image success reply',async()=>{
  const provider={name:'openai',complete:()=>{throw Error('No text model');},platformImage:async()=>({content:JSON.stringify({displayed:false,message:'Original order pending'}),isError:true})};
  const tool={name:'platform_imagegen',description:'',inputSchema:{},run:(i,c)=>c.platformImage(i,c)};
  const agent=new Agent(provider,'',[tool],{cwd:'.'},new Map([[tool.name,tool]]));
  let reply;await agent.sendImage('Cube','openai-gpt-image-2-medium',{onText:t=>reply=t});
  assert.equal(reply,'Original order pending');
});

test('same-turn send_image of an already displayed path is skipped, explicit later resend remains allowed',async()=>{
  let step=0,sends=0;
  const tools=[{name:'platform_imagegen',run:async()=>({content:JSON.stringify({displayed:true,path:'C:/cube.png'}),displayImage:'image'})},{name:'send_image',run:async()=>{sends++;return {content:'sent',displayImage:'image'};}}].map(t=>({...t,description:'',inputSchema:{}}));
  const call=(name,id)=>({type:'tool_use',name,id,input:{path:'C:/cube.png'}});
  const provider={name:'openai',platformImage:async()=>{},complete:async()=>++step===1?{content:[call('platform_imagegen','gen'),call('send_image','send')],stopReason:'tool_use'}:step===3?{content:[call('send_image','resend')],stopReason:'tool_use'}:{content:[{type:'text',text:'Done'}],stopReason:'end_turn'}};
  const agent=new Agent(provider,'',tools,{cwd:'.'},new Map(tools.map(t=>[t.name,t])),{compactThreshold:0});
  await agent.send('Draw a cube',{});assert.equal(sends,0);
  await agent.send('Send that file again',{});assert.equal(sends,1);
});
