import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProvider } from '../src/agent/provider.ts';
const config={provider:'openai',authMode:'api-key',model:'mistral-large',apiKey:'test-only',baseUrl:'https://wuweiai.io/api/gateway/v1',maxTokens:64,contextWindow:256000,compactThreshold:0};
const messages=[{role:'user',content:[{type:'text',text:'hello'}]}];
const limited=()=>Response.json({error:{type:'gateway_error',code:'upstream_error',status:429,detail:'temporarily rate-limited upstream'}},{status:502,headers:{'Retry-After':'120'}});
const success=()=>new Response('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
function timers(t){const delays=[];t.mock.method(globalThis,'setTimeout',(fn,ms)=>{delays.push(ms);queueMicrotask(fn);return 0;});return delays;}
test('a gateway-wrapped upstream 429 stops after two short retries with an actionable message',async t=>{
 const delays=timers(t);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return limited()});
 const previous=process.env.WUWEI_LANG;process.env.WUWEI_LANG='en';
 try{await assert.rejects(makeProvider(config).complete('',messages,[],{}),error=>/\[\[gw:upstream_rate_limited\]\]/.test(error.message)&&/provider.*rate limited/i.test(error.message));assert.equal(calls,3);assert.equal(delays.length,2);assert.ok(delays.every(ms=>ms<=3000));}finally{if(previous===undefined)delete process.env.WUWEI_LANG;else process.env.WUWEI_LANG=previous;}
});
test('a transient upstream rate limit can recover without losing the response body',async t=>{
 timers(t);let calls=0;t.mock.method(globalThis,'fetch',async()=>++calls===1?limited():success());
 const result=await makeProvider(config).complete('',messages,[],{});assert.equal(calls,2);assert.ok(result);
});
test('other retryable gateway failures are also bounded to two short retries',async t=>{
 const delays=timers(t);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({error:{type:'gateway_error',code:'upstream_error',status:503}},{status:502})});
 await assert.rejects(makeProvider(config).complete('',messages,[],{}));assert.equal(calls,3);assert.ok(delays.every(ms=>ms<=3000));
});
test('a hosted gateway network failure cannot stack ten long retries',async t=>{
 const delays=timers(t);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new TypeError('fetch failed')});
 await assert.rejects(makeProvider(config).complete('',messages,[],{}));assert.equal(calls,3);assert.ok(delays.every(ms=>ms<=3000));
});
test('user-provided connections retain their existing retry behavior',async t=>{
 timers(t);let calls=0;t.mock.method(globalThis,'fetch',async()=>++calls<=3?Response.json({error:{type:'gateway_error',code:'upstream_error',status:503}},{status:502}):success());
 await makeProvider({...config,baseUrl:'https://api.example.invalid/v1'}).complete('',messages,[],{});assert.equal(calls,4);
});
