import test from 'node:test';
import assert from 'node:assert/strict';
import {makeProvider} from '../src/agent/provider.ts';
const config={provider:'openai',authMode:'api-key',model:'glm-5.3-flash',apiKey:'test-only',baseUrl:'https://gw.wuweiai.io/api/gateway/v1',maxTokens:64,contextWindow:256000,compactThreshold:0};
const messages=[{role:'user',content:[{type:'text',text:'ping'}]}];
const success=()=>new Response('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
test('connection checks carry purpose only to the official gateway, with no shared state across concurrent chat',async t=>{
 const calls=[];t.mock.method(globalThis,'fetch',async(url,init)=>{calls.push({url,headers:new Headers(init.headers),body:JSON.parse(init.body)});return success();});
 const provider=makeProvider(config);
 await Promise.all([provider.complete('',messages,[],{requestPurpose:'model_check'}),provider.complete('',messages,[],{})]);
 assert.deepEqual(calls.map(c=>c.headers.get('x-wuwei-request-purpose')),['model_check',null]);
 assert.deepEqual(calls[0].body,calls[1].body);
 for(const baseUrl of ['https://api.example.invalid/v1','https://gw.wuweiai.io.evil.invalid/api/gateway/v1','https://gw.wuweiai.io:8443/api/gateway/v1']){
  await makeProvider({...config,baseUrl}).complete('',messages,[],{requestPurpose:'model_check'});
  assert.equal(calls.at(-1).headers.get('x-wuwei-request-purpose'),null);
 }
});
