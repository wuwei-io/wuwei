import test from 'node:test';
import assert from 'node:assert/strict';
import {beginImageTransfer,readImageTransfers} from '../src/imagegen/image-transfer-progress.js';
import {PlatformBillingClient} from '../src/imagegen/platform-billing-client.js';

const token=(sub:string)=>'qa.'+Buffer.from(JSON.stringify({sub})).toString('base64url')+'.qa';
test('image progress is scoped by account, session and individual tool and clears on completion',()=>{
 const a=beginImageTransfer(token('a'),'session','tool-a','order-a'),b=beginImageTransfer(token('a'),'session','tool-b','order-b');a.update(25,100);b.update(10,null);
 assert.equal(readImageTransfers(token('a'),'session').length,2);assert.deepEqual(readImageTransfers(token('b'),'session'),[]);assert.deepEqual(readImageTransfers(token('a'),'other-session'),[]);
 assert.equal(readImageTransfers(token('a'),'session')[0].received,25);a.finish();b.finish();assert.deepEqual(readImageTransfers(token('a'),'session'),[]);
});
test('image stream reports actual byte counts without an arbitrary download timeout',async()=>{
 const original=globalThis.fetch,progress:{received:number;total:number|null}[]=[];
 try{
  globalThis.fetch=async(_url,init)=>{assert.equal(init?.signal,undefined);return new Response(new ReadableStream({async start(controller){controller.enqueue(new Uint8Array(3));await new Promise(r=>setTimeout(r,15));controller.enqueue(new Uint8Array(5));controller.close()}}),{headers:{'content-type':'image/png','content-length':'8'}})};
  const client=new PlatformBillingClient('https://example.invalid',()=>token('a'),'platform',1);const bytes=await client.image('a1928c6b-cdd2-4971-b576-1aea7290d5f2',(received,total)=>progress.push({received,total}));
  assert.equal(bytes.length,8);assert.deepEqual(progress,[{received:0,total:8},{received:3,total:8},{received:8,total:8}]);
 }finally{globalThis.fetch=original}
});
