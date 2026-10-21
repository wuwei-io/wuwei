import test from 'node:test';
import assert from 'node:assert/strict';
import {formatCredits,formatLedgerTime,ledgerDescription,pageNumbers,showcaseModels,billingModelCatalog,billingCheckoutUrl} from '../src/billing/presentation.js';
import type {CreditRecord} from '../src/billing/contracts.js';
import type {ModelChoice} from '../src/model-selection.js';
import {billingRequest} from '../desktop/renderer/src/components/billing/request.js';

test('credit display rounds to three decimals without modifying financial values',()=>{
  const amount=1578.362704;assert.equal(formatCredits(amount,'en'),'1,578.363');assert.equal(amount,1578.362704);
  assert.equal(formatCredits(-0.03039,'en'),'-0.03');assert.equal(formatCredits(2000,'en'),'2,000');
  assert.equal(formatCredits(-0.0001,'en'),'0');
});
test('web checkout destinations keep their HTTPS origin and cannot contain credentials or alternate ports',()=>{
  assert.equal(billingCheckoutUrl('https://wuweiai.io/en/billing-checkout?order=fixture'),'https://wuweiai.io/en/billing-checkout?order=fixture');
  for(const value of ['http://wuweiai.io/en/checkout','https://wuweiai.io.evil/','https://evil@wuweiai.io/','https://wuweiai.io:444/','javascript:alert(1)'])assert.equal(billingCheckoutUrl(value),null);
});
test('historical system ledger descriptions translate and custom descriptions remain data',()=>{
  const record={description:'免费模型 glm-4.7-flash',model:'glm-4.7-flash'} as CreditRecord;
  assert.equal(ledgerDescription(record,'en'),'Free model glm-4.7-flash');
  assert.equal(ledgerDescription({...record,description:'无为托管模型调用'},'en'),'Wuwei hosted model usage');
  assert.equal(ledgerDescription({...record,description:'客户自己填写的备注'},'en'),'客户自己填写的备注');
  assert.doesNotMatch(formatLedgerTime('2026-10-20T15:14:12Z','en'),/\b(?:AM|PM)\b/);
});
test('pagination retains the first, last and nearby pages for large ledgers',()=>{
  assert.deepEqual(pageNumbers(1,2086),[1,2,3,4,5,'…',2086]);
  assert.deepEqual(pageNumbers(100,2086),[1,'…',98,99,100,101,102,'…',2086]);
  assert.deepEqual(pageNumbers(3,3),[1,2,3]);
});
test('model showcase chooses one available flagship per vendor',()=>{
  const choice=(id:string,rank:number)=>({key:id,providerId:'wuwei',modelId:id,rank,recommended:false,category:'premium',free:false}) as ModelChoice;
  const choices=[choice('claude-sonnet-5',0),choice('claude-opus-5',1),choice('gpt-6.1',2),choice('gemini-3-pro',3),choice('deepseek-v4',4),choice('kimi-k3',5),choice('glm-5',6),choice('qwen3-8-flash',7),choice('qwen3-8-max',8)];
  const shown=showcaseModels(choices);assert.equal(shown.filter(m=>m.modelId.includes('claude')).length,1);assert.ok(shown.some(m=>m.modelId==='claude-opus-5'));assert.ok(shown.some(m=>m.modelId==='qwen3-8-max'));assert.equal(shown.length,7);assert.ok(shown.every(m=>choices.includes(m)));
});
test('stalled or rejected billing IPC resolves to a retryable error, including late replies',async()=>{
  const previous=(globalThis as any).window;
  try {
    let finish!:(v:unknown)=>void;
    (globalThis as any).window={wuwei:{billingRequest:()=>new Promise(r=>{finish=r;})}};
    assert.deepEqual(await billingRequest({action:'catalog'},10),{error:'network_timeout'});
    finish({products:[]});
    (globalThis as any).window.wuwei.billingRequest=()=>Promise.reject(Error('offline'));
    assert.deepEqual(await billingRequest({action:'catalog'},10),{error:'network'});
  } finally{(globalThis as any).window=previous;}
});


test('Persian ledger uses the same Gregorian dates as filtering and always uses 24-hour time',()=>{
  const date=new Date('2026-10-20T15:14:12Z');
  const expected=new Intl.DateTimeFormat('fa',{calendar:'gregory',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'short'}).format(date);
  assert.equal(formatLedgerTime(date.toISOString(),'fa'),expected);
});


test('full billing catalog excludes connections, hidden aliases and automatic routes, while retaining all vendor variants',()=>{
 const c=(id:string,category='premium')=>({key:id,modelId:id,providerId:'hosted',category,free:category==='free',rank:1,recommended:false}) as ModelChoice;
 const models=[c('claude-opus'),c('claude-sonnet'),c('gpt-6'),c('openrouter-auto-free','free'),c('glm-flash','free'),c('byok','connections'),{...c('legacy'),hiddenInPicker:true},c('gpt-6')];
 const all=billingModelCatalog(models);assert.equal(all.length,4);assert.equal(all.filter(m=>m.modelId.startsWith('claude')).length,2);assert.ok(all.some(m=>m.free));
});
