import test from 'node:test';
import assert from 'node:assert/strict';
import {gatewayAffordability,readGatewayAffordability} from '../src/gateway-affordability.ts';
import {makeProvider} from '../src/agent/provider.ts';

const config={provider:'openai',authMode:'api-key',model:'economy-test',apiKey:'test-only',baseUrl:'https://wuweiai.io/api/gateway/v1',maxTokens:64,contextWindow:256000,compactThreshold:0};
const context={clientRequestId:'ba430462-bab2-4dad-84bf-a2b9ac04d040',model:config.model,phase:'new_turn'};
const body={error:{type:'gateway_error',code:'insufficient_balance',balance:9.457191,estimated_cost:12.125,estimated_input_tokens:12000,detail:'PRIVATE_PROVIDER_BODY',prompt:'PRIVATE_PROMPT',apiKey:'PRIVATE_KEY'}};
const messages=[{role:'user',content:[{type:'text',text:'PRIVATE_USER_CONTENT'}]}];

test('only safe affordability facts survive parsing and IPC revalidation',()=>{
 const value=readGatewayAffordability(JSON.stringify(body),context);
 assert.deepEqual(value,{...context,code:'insufficient_balance',balance:9.457191,estimatedCost:12.125,estimatedInputTokens:12000});
 assert.deepEqual(gatewayAffordability({...value,prompt:'private',accessToken:'private'}),value);
 for(const value of [null,{},[],{...context,code:'upstream_error'},{...context,code:'insufficient_balance',clientRequestId:'unsafe\ntext'}]) assert.equal(gatewayAffordability(value),undefined);
 for(const [name,value] of [['balance',NaN],['estimatedCost',-1],['estimatedInputTokens',1.1],['estimatedCost',Infinity]]) {
  const safe=gatewayAffordability({...context,code:'insufficient_balance',[name]:value});assert.equal(safe[name],undefined);
 }
 assert.equal(readGatewayAffordability(JSON.stringify({error:{...body.error,type:'provider_error'}}),context),undefined);
 assert.equal(readGatewayAffordability('not json',context),undefined);
});

test('a real provider rejection retains the nonzero balance, estimate and local request reference without retrying',async t=>{
 let calls=0,headers;
 t.mock.method(globalThis,'fetch',async(url,options)=>{calls++;headers=options.headers;return Response.json(body,{status:402})});
 await assert.rejects(makeProvider(config).complete('',messages,[],{}),error=>{
  const facts=error.gatewayFailure;
  assert.equal(error.status,402);assert.equal(facts.balance,9.457191);assert.equal(facts.estimatedCost,12.125);assert.equal(facts.estimatedInputTokens,12000);assert.equal(facts.phase,'new_turn');
  assert.equal(facts.clientRequestId,new Headers(headers).get('X-Wuwei-Request-Id'));assert.equal(facts.model,config.model);
  assert.match(error.message,/\[\[gw:insufficient_balance\]\]/);assert.doesNotMatch(JSON.stringify(facts)+error.message,/PRIVATE_/);
  return true;
 });assert.equal(calls,1);
});

test('tool continuation is distinguished from a new user message, including screenshot tool results',async t=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json(body,{status:402}));
 for(const content of ['PRIVATE_TOOL_RESULT',[{type:'text',text:'PRIVATE_TOOL_RESULT'},{type:'image',dataUrl:'data:image/png;base64,aGVsbG8='}]]) {
  const history=[...messages,{role:'assistant',content:[{type:'tool_use',id:'call-1',name:'read_file',input:{}}]},{role:'user',content:[{type:'tool_result',tool_use_id:'call-1',content}]}];
  await assert.rejects(makeProvider({...config,vision:true}).complete('',history,[],{}),error=>error.gatewayFailure?.phase==='tool_continuation');
 }
});

test('a user-provided endpoint cannot promote a gateway-shaped body into trusted affordability UI',async t=>{
 let headers;t.mock.method(globalThis,'fetch',async(url,options)=>{headers=options.headers;return Response.json(body,{status:402})});
 await assert.rejects(makeProvider({...config,baseUrl:'https://api.example.invalid/api/gateway/v1'}).complete('',messages,[],{}),error=>!error.gatewayFailure&&!error.message.includes('[[gw:'));
 assert.equal(new Headers(headers).get('X-Wuwei-Request-Id'),null);
});
