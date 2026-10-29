import test from 'node:test';
import assert from 'node:assert/strict';
import {isAccountWallet} from '../src/account-wallet.ts';
import {setAccountFooterLayout,getAccountFooterLayout,subscribeAccountFooterLayout} from '../src/account-footer-config.ts';
const snapshot=()=>({userId:'a',balance:638.5,permanent:600,expiring:38.5,asOf:'2026-10-30T00:00:00Z',plan:{name:'Mini',period:'monthly',endsAt:'2026-11-30T00:00:00Z',member:true},batches:[{source:'gift',remaining:30,expiresAt:'2026-10-31T00:00:00Z'},{source:'purchase',remaining:8.5,expiresAt:'2026-11-10T00:00:00Z'}]});
test('both layouts can switch and immediately roll back, invalid values safely restore classic',()=>{
 let calls=0;const off=subscribeAccountFooterLayout(()=>calls++);
 setAccountFooterLayout('classic');setAccountFooterLayout('wallet');assert.equal(getAccountFooterLayout(),'wallet');
 setAccountFooterLayout('wallet');assert.equal(calls,1);
 setAccountFooterLayout('classic');assert.equal(getAccountFooterLayout(),'classic');
 setAccountFooterLayout('wallet');setAccountFooterLayout('unknown');assert.equal(getAccountFooterLayout(),'classic');off();
});
test('expiry buckets reconcile with balance, independent of membership expiry',()=>{
 const v=snapshot();assert(isAccountWallet(v,'a'));v.plan.endsAt='2026-10-31T00:00:00Z';assert(isAccountWallet(v,'a'));assert.equal(v.permanent,600);
 const empty={...snapshot(),balance:0,permanent:0,expiring:0,batches:[]};assert(isAccountWallet(empty,'a'));
});
test('another account, a partial read or inconsistent expiry never becomes usable balance data',()=>{
 for(const v of [null,{}, {error:'network'}, {...snapshot(),userId:'b'}, {...snapshot(),balance:639}, {...snapshot(),expiring:40}, {...snapshot(),batches:[]}, {...snapshot(),permanent:NaN}, {...snapshot(),plan:null}, {...snapshot(),batches:[{source:'gift',remaining:38.5,expiresAt:'infinity'}]}])assert.equal(isAccountWallet(v,'a'),false);
});
