import test from 'node:test';
import assert from 'node:assert/strict';
import {StudioImageApprovals,imageAccountScope} from '../src/imagegen/studio-approval.ts';
const quote={sku_id:'image-test',price_version:'abcdef12-3456-7890-abcd-1234567890ab',estimated_coins:36,authorization_ceiling:120};
test('direct click quote is immutable and can be consumed only once',()=>{
 const grants=new StudioImageApprovals();const result=grants.issue(quote,'cup','session','owner');
 result.estimated_coins=1;
 assert.equal(grants.consume(result.approval_id,'cup','session','owner').quote.estimated_coins,36);
 assert.equal(grants.consume(result.approval_id,'cup','session','owner'),undefined);
 assert.equal(grants.consume('invented','cup','session','owner'),undefined);
});
for(const field of ['prompt','session','owner'])test(`direct click rejects changed ${field} and invalidates the grant`,()=>{
 const grants=new StudioImageApprovals();const result=grants.issue(quote,'cup','session','owner');
 const args=['cup','session','owner'];args[['prompt','session','owner'].indexOf(field)]='other';
 assert.equal(grants.consume(result.approval_id,...args),undefined);
 assert.equal(grants.consume(result.approval_id,'cup','session','owner'),undefined);
});
test('expired quotes and logout grants cannot be used',()=>{
 let now=0;const grants=new StudioImageApprovals(()=>now);
 const first=grants.issue(quote,'cup','session','owner');now=first.expires_at;
 assert.equal(grants.consume(first.approval_id,'cup','session','owner'),undefined);
 const next=grants.issue(quote,'cup','session','owner');grants.clear();
 assert.equal(grants.consume(next.approval_id,'cup','session','owner'),undefined);
});
test('quote owner survives token refresh but changes with account',()=>{
 const jwt=(sub,extra)=>'header.'+Buffer.from(JSON.stringify({sub,extra})).toString('base64url')+'.signature';
 assert.equal(imageAccountScope(jwt('A',1)),imageAccountScope(jwt('A',2)));
 assert.notEqual(imageAccountScope(jwt('A',1)),imageAccountScope(jwt('B',1)));
 assert.equal(imageAccountScope('opaque-token'),'opaque-token');
});


test('batch count and total maximum are bound to a one-use click approval',()=>{
 const grants=new StudioImageApprovals();const visible=grants.issue(quote,'cup','s','u',4);
 assert.equal(visible.estimated_coins,144);assert.equal(visible.authorization_ceiling,480);assert.equal(visible.count,4);
 visible.count=1;visible.authorization_ceiling=1;
 const consumed=grants.consume(visible.approval_id,'cup','s','u');assert.equal(consumed.count,4);assert.equal(consumed.quote.authorization_ceiling,120);
 assert.equal(grants.consume(visible.approval_id,'cup','s','u'),undefined);
 for(const count of [0,5,1.5,NaN,'4'])assert.throws(()=>grants.issue(quote,'cup','s','u',count),/INVALID_IMAGE_COUNT/);
});
