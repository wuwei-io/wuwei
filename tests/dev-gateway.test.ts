import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devGatewayUrl } from '../src/dev-gateway.js';
import { resolveContextWindow } from '../src/context-window.js';
test('dev redirects hosted traffic to loopback; production and BYOK retain their destinations', t => {
  const saved={node:process.env.NODE_ENV,origin:process.env.WUWEI_DEV_GATEWAY_ORIGIN};
  t.after(()=>{for(const [key,value] of [['NODE_ENV',saved.node],['WUWEI_DEV_GATEWAY_ORIGIN',saved.origin]])value===undefined?delete process.env[key]:process.env[key]=value;});
  const hosted='https://gw.wuweiai.io/api/gateway/v1/chat/completions';
  process.env.WUWEI_DEV_GATEWAY_ORIGIN='http://127.0.0.1:3300';process.env.NODE_ENV='development';
  assert.equal(devGatewayUrl(hosted),'http://127.0.0.1:3300/api/gateway/v1/chat/completions');
  const custom='https://other.example/api/gateway/v1/chat/completions';assert.equal(devGatewayUrl(custom),custom);
  process.env.NODE_ENV='production';assert.equal(devGatewayUrl(hosted),hosted);
  process.env.NODE_ENV='development';process.env.WUWEI_DEV_GATEWAY_ORIGIN='https://example.com';assert.throws(()=>devGatewayUrl(hosted));
});
test('the economy models configure their declared windows and bound explicit overrides',()=>{
  assert.equal(resolveContextWindow('openai','deepseek-flash',128000),1048576);
  assert.equal(resolveContextWindow('openai','xiaomi/mimo-v2.6-flash',128000),1048576);
  assert.equal(resolveContextWindow('openai','nemotron-3.5-lightning',128000,1000000),262144);
  assert.equal(resolveContextWindow('openai','step-5-preview',128000),1000000);
});
