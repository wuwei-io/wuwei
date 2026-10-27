import test from 'node:test';
import assert from 'node:assert/strict';
import {studioBatches} from '../desktop/renderer/src/components/image-gallery-data.js';
const user={type:'user',text:'A cup'};
const tool={type:'tool',id:'image-tool',name:'platform_imagegen',status:'done',input:{prompt:'A cup'}};
test('switching back to a running image conversation preserves the spinner without a tool result',()=>{
 const art=studioBatches([user,tool],[],true)[0].artworks[0];
 assert.equal(art.state,'running');assert.equal(art.charged,undefined);
});
test('an existing unknown order remains pending and keeps only its original recovery handle',()=>{
 const original={...tool,result:JSON.stringify({order_id:'original-order',recovery_key:'original-key',status:'unknown',charged_coins:0})};
 const art=studioBatches([user,original],[],true)[0].artworks[0];
 assert.equal(art.state,'pending');assert.equal(art.orderId,'original-order');assert.equal(art.recoveryKey,'original-key');
});
test('confirmed failures and delivered images retain their terminal state after switching conversations',()=>{
 const failed={...tool,result:JSON.stringify({order_id:'original',status:'failed'})};
 assert.equal(studioBatches([user,failed],[],true)[0].artworks[0].state,'failed');
 const complete={...failed,image:'data:image/png;base64,AA=='};
 assert.equal(studioBatches([user,complete],[],false)[0].artworks[0].state,'complete');
});
