import assert from 'node:assert/strict';
import {test} from 'node:test';
import {selectEnabledTools,normalizeInputControls,toolSchemaChars} from '../src/agent/input-controls.ts';
import {Agent} from '../src/agent/loop.ts';
import {isLocalQwenTrial} from '../src/local-qwen-trial.ts';

const specs=[{name:'read_file'},{name:'write_file'},{name:'remember'},{name:'mcp_search'}];
test('no-daily-quota display is restricted to the published free trial identity',()=>{
  const trial={providerId:'wuwei-free',modelId:'qwen3-4b-local-trial',free:true};
  assert.equal(isLocalQwenTrial(trial),true);
  for(const patch of [{providerId:'custom'},{modelId:'glm-4.7-flash'},{free:false}])assert.equal(isLocalQwenTrial({...trial,...patch}),false);
});
test('defaults preserve tools; master switch and exclusions apply to newly connected tools',()=>{
  assert.deepEqual(selectEnabledTools(specs),specs);
  assert.deepEqual(selectEnabledTools(specs,{toolsEnabled:false}),[]);
  assert.deepEqual(selectEnabledTools([...specs,{name:'mcp_new'}],{toolsEnabled:false}),[]);
  assert.deepEqual(selectEnabledTools(specs,{disabledTools:['write_file','mcp_search']}),[specs[0],specs[2]]);
  assert.deepEqual(selectEnabledTools(specs,{memoryEnabled:false}),[specs[0],specs[1],specs[3]]);
});
test('preferences accept only input controls and preserve explicit false',()=>{
  assert.deepEqual(normalizeInputControls({toolsEnabled:false,memoryEnabled:'false',disabledTools:['read_file','read_file',null,1,''],apiKey:'never persist'}),{toolsEnabled:false,disabledTools:['read_file']});
});
test('disabled tools are absent from actual Agent requests and cannot execute hallucinated calls',async()=>{
  let runs=0,steps=0;
  const all=specs.map(t=>({...t,description:'fixture',inputSchema:{type:'object'},readOnly:true,async run(){runs++;return {content:'done'};}}));
  const enabled=selectEnabledTools(all,{disabledTools:['write_file']});
  const p={name:'test',contextWindow:131072,async complete(sys,msgs,tools){
    assert.ok(!tools.some(tool=>tool.name==='write_file'));
    return steps++===0?{content:[{type:'tool_use',id:'blocked',name:'write_file',input:{}}],stopReason:'tool_use'}:{content:[{type:'text',text:'ok'}],stopReason:'end_turn'};
  }};
  const a=new Agent(p,'',enabled,{cwd:'.'},new Map(enabled.map(t=>[t.name,t])));
  await a.send('fixture',{});
  assert.equal(runs,0);
  assert.ok(a.getMessages().some(m=>m.content.some(b=>b.type==='tool_result'&&b.is_error)));
});
test('turning off tools while waiting for execution approval prevents the queued tool from running',async()=>{
  let runs=0,steps=0;
  const tool={name:'write_file',description:'fixture',inputSchema:{type:'object'},readOnly:false,async run(){runs++;return {content:'done'};}};
  const p={name:'test',contextWindow:131072,async complete(){return steps++===0?{content:[{type:'tool_use',id:'pending',name:tool.name,input:{}}],stopReason:'tool_use'}:{content:[{type:'text',text:'ok'}],stopReason:'end_turn'};}};
  const a=new Agent(p,'',[tool],{cwd:'.'},new Map([[tool.name,tool]]));
  await a.send('fixture',{requestPermission:async()=>{a.setTools([],new Map());return 'allow';}});
  assert.equal(runs,0);
});
test('turning off tools removes image-specific instructions on the next request',async()=>{
  let request='';
  const p={name:'test',contextWindow:131072,platformImage:async()=>({content:''}),async complete(sys,msgs,tools){request=sys;assert.deepEqual(tools,[]);return {content:[{type:'text',text:'ok'}],stopReason:'end_turn'};}};
  const a=new Agent(p,'base',[],{cwd:'.'},new Map());
  await a.send('hello',{});
  assert.ok(!request.includes('platform_imagegen'));
  assert.equal(toolSchemaChars([]),2);
});
test('background agents recheck global selection during approval and on their next model step',async()=>{
  let enabled=true,runs=0,steps=0;
  const tool={name:'write_file',description:'fixture',inputSchema:{type:'object'},readOnly:false,async run(){runs++;return {content:'done'};}};
  const p={name:'test',contextWindow:131072,async complete(sys,msgs,tools){
    assert.equal(tools.length,enabled?1:0);
    return steps++===0?{content:[{type:'tool_use',id:'background',name:tool.name,input:{}}],stopReason:'tool_use'}:{content:[{type:'text',text:'ok'}],stopReason:'end_turn'};
  }};
  const a=new Agent(p,'',[tool],{cwd:'.'},new Map([[tool.name,tool]]),{toolFilter:tools=>selectEnabledTools(tools,{toolsEnabled:enabled})});
  await a.send('fixture',{requestPermission:async()=>{enabled=false;return 'allow';}});
  assert.equal(runs,0);
});
