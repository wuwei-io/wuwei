import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelReasoning, resolveModelEffort } from '../src/model-reasoning.ts';
import { updateModelEffort } from '../src/reasoning-settings.ts';
import { catalogModelChoices } from '../src/model-selection.ts';
import { makeProvider } from '../src/agent/provider.ts';

test('new hosted aliases and subscription IDs expose the same supported levels', () => {
  for (const name of ['gpt-6.2-sol','gpt-6.2-astra']) {
    assert.deepEqual(modelReasoning(name),modelReasoning(name.replace('6.2','6-2')));
    assert.deepEqual(modelReasoning(name).levels,['low','medium','high','xhigh','max']);
    assert.equal(resolveModelEffort('codex',name), 'medium');
  }
  assert.deepEqual(modelReasoning('glm-5.4').levels,['low','high','max']);
  assert.equal(modelReasoning('qwen3-4b-local-trial'),undefined);
});
test('defaults remain specific to provider and model and reject unsupported stored settings', () => {
  const s={effort:'low',effortModel:'codex/gpt-6.2-sol',modelEffortDefaults:{'codex/gpt-6.2-sol':'high','codex/gpt-6.2-astra':'max','wuwei-gpt/gpt-6-2-sol':'xhigh'}};
  assert.equal(resolveModelEffort('codex','gpt-6.2-sol',s),'low');
  assert.equal(resolveModelEffort('codex','gpt-6.2-sol',s,false),'high');
  assert.equal(resolveModelEffort('codex','gpt-6.2-astra',s),'max');
  assert.equal(resolveModelEffort('wuwei-gpt','gpt-6-2-sol',s),'xhigh');
  assert.equal(resolveModelEffort('codex','gpt-6.2-sol',{effort:'none'}),'medium');
  assert.equal(resolveModelEffort('zhipu','glm-5.4',{effort:'medium'}),'max');
  assert.equal(resolveModelEffort('wuwei-free','qwen3-4b-local-trial',s),undefined);
});
test('a default edit preserves credentials and other model defaults; stale current-chat changes fail', () => {
  const source={providerId:'codex',model:'gpt-6.2-sol',creds:{other:{apiKey:'private-fixture'}},modelEffortDefaults:{'codex/gpt-6.2-astra':'max'}};
  const next=updateModelEffort(source,{providerId:'codex',model:'gpt-6.2-sol',effort:'high',asDefault:true});
  assert.equal(next.creds,source.creds);assert.equal(next.modelEffortDefaults['codex/gpt-6.2-astra'],'max');assert.equal(next.effort,'high');
  assert.equal(source.effort,undefined);
  assert.throws(()=>updateModelEffort(source,{providerId:'codex',model:'gpt-6.2-astra',effort:'max'}),/model_changed/);
  assert.throws(()=>updateModelEffort(source,{providerId:'codex',model:'gpt-6.2-sol',effort:'none',asDefault:true}),/invalid_reasoning/);
});
test('GPT models precede Claude in My Connections even when Claude ranks first', () => {
  const model=(id,rank)=>({id,label:id,free:false,selection:{rank}});
  const result=catalogModelChoices([{id:'claude-oauth',label:'Claude',hosted:false,sort:0,models:[model('claude-opus-5-5',-100)]},{id:'codex',label:'Codex',hosted:false,sort:100,models:[model('gpt-6.2-sol',10),model('gpt-6.2-astra',20)]}],'');
  assert.deepEqual(result.map(x=>x.modelId),['gpt-6.2-sol','gpt-6.2-astra','claude-opus-5-5']);
  const mixed=catalogModelChoices([{id:'claude-oauth',label:'Claude',hosted:false,sort:0,models:[model('claude-opus-5-5',-900)]},{id:'codex',label:'Codex',hosted:false,sort:100,models:[model('gpt-6.2-sol',100),model('gpt-6.2-astra',101)]},{id:'hosted',label:'Hosted',hosted:true,sort:0,models:[{...model('chat',-500),selection:{category:'economy',rank:-500,recommended:true}}]}],'');
  assert.deepEqual(mixed.filter(row=>row.category==='connections').map(row=>row.modelId),['gpt-6.2-sol','gpt-6.2-astra','claude-opus-5-5']);
});
const response = events => new Response(events.map(value=>`data: ${JSON.stringify(value)}\n\n`).join(''),{headers:{'content-type':'text/event-stream'}});
test('existing Codex providers pick up login and token rotation without changing their model or effort',async t=>{
  let credentials={token:'',accountId:''};
  const requests=[];
  t.mock.method(globalThis,'fetch',async(url,init)=>{
    requests.push({headers:init.headers,body:JSON.parse(init.body)});
    return response([{type:'response.output_text.delta',delta:'ready'},{type:'response.completed',response:{usage:{input_tokens:1,output_tokens:1}}}]);
  });
  const providers=['gpt-6.2-sol','gpt-6.2-astra'].map((model,i)=>makeProvider({provider:'codex',model,codexToken:'stale',codexAccountId:'stale',codexCredentials:()=>credentials,codexEndpoint:'https://qa.invalid/responses',effort:i?'max':'high'}));
  credentials={token:'fresh-login',accountId:'new-account'};
  await providers[0].complete('',[],[],{});
  credentials={token:'rotated-token',accountId:'new-account'};
  await providers[1].complete('',[],[],{});
  await providers[0].complete('',[],[],{});
  assert.deepEqual(requests.map(r=>r.headers.Authorization),['Bearer fresh-login','Bearer rotated-token','Bearer rotated-token']);
  assert(requests.every(r=>r.headers['chatgpt-account-id']==='new-account'));
  assert.deepEqual(requests.map(r=>[r.body.model,r.body.reasoning.effort]),[['gpt-6.2-sol','high'],['gpt-6.2-astra','max'],['gpt-6.2-sol','high']]);
});
for (const provider of ['codex','official','hosted']) test(`${provider}: selected reasoning reaches the real serializer with correct endpoint and tool protocol`,async t=>{
  const requests=[];
  t.mock.method(globalThis,'fetch',async(url,init)=>{
    requests.push({url,headers:init.headers,body:JSON.parse(init.body)});
    if(provider==='hosted')return response([{choices:[{delta:{content:'ready'},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:2}}]);
    return response([{type:'response.output_text.delta',delta:'ready'},{type:'response.completed',response:{usage:{input_tokens:10,output_tokens:2}}}]);
  });
  const cfg={provider:provider==='codex'?'codex':'openai',model:provider==='hosted'?'gpt-6-2-sol':'gpt-6.2-sol',apiKey:'fake-api-key',codexToken:'fake-sub-token',codexAccountId:'fake-account',codexEndpoint:'https://chatgpt.com/backend-api/codex/responses',baseUrl:provider==='official'?'https://api.openai.com/v1':'https://openrouter.ai/api/v1',maxTokens:8192,contextWindow:1050000,compactThreshold:0,effort:'xhigh'};
  const result=await makeProvider(cfg).complete('Keep the prompt', [{role:'user',content:[{type:'text',text:'ready'}]}],[{name:'verify',description:'verify',inputSchema:{type:'object',properties:{}}}],{});
  assert.equal(requests[0].body.reasoning.effort,'xhigh');
  if(provider==='official'){
    assert.equal(requests[0].url,'https://api.openai.com/v1/responses');
    assert.equal(requests[0].headers.Authorization,'Bearer fake-api-key');
    assert.equal(requests[0].headers['chatgpt-account-id'],undefined);
    assert.equal(requests[0].body.tools[0].name,'verify');
    assert.equal(requests[0].body.max_output_tokens,8192);
  } else if(provider==='codex'){
    assert.equal(requests[0].headers.Authorization,'Bearer fake-sub-token');
    assert.equal(requests[0].headers['chatgpt-account-id'],'fake-account');
  } else assert(requests[0].url.endsWith('/chat/completions'));
  assert(result.content.some(block=>block.type==='text'&&block.text==='ready'));
});
