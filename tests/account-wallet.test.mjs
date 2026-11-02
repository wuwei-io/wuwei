import test from 'node:test';
import assert from 'node:assert/strict';
import {isAccountWallet, accountWalletDaily, walletCountdown, walletBatchSourceKey} from '../src/account-wallet.ts';
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

test('countdowns cross days, seconds and expiry without negative values',()=>{
 assert.deepEqual(walletCountdown((86400+9*3600+13*60+28)*1000),{days:1,time:'09:13:28'});
 assert.deepEqual(walletCountdown(1001),{days:0,time:'00:00:02'});
 assert.deepEqual(walletCountdown(1),{days:0,time:'00:00:01'});
 for(const n of [0,-1,NaN,Infinity]) assert.equal(walletCountdown(n),null);
});
test('daily metadata never invents entitlement on old or malformed responses',()=>{
 assert.equal(accountWalletDaily(snapshot()),null);
 const d={amount:10,bonus:0,claimed:false,resetsAt:'2026-11-03T00:00:00Z',expiryHours:24};
 assert.deepEqual(accountWalletDaily({...snapshot(),daily:d}),d);
 assert.deepEqual(accountWalletDaily({...snapshot(),daily:{...d,amount:40,expiryHours:null,bonus:20}}),{...d,amount:40,expiryHours:null,bonus:20});
 for(const daily of [{...d,amount:-1},{...d,bonus:NaN},{...d,claimed:'false'},{...d,resetsAt:'bad'},{...d,expiryHours:0}]) assert.equal(accountWalletDaily({...snapshot(),daily}),null);
});

test('receipt sources distinguish sign-in, activities and registration without guessing',()=>{
 const b={source:'gift',remaining:10,expiresAt:'2026-11-03T00:00:00Z'};
 for(const [receiptSource,key] of [['signin','signinGift'],['activity','activityGift'],['activity_reward','activityGift'],['register','registrationGift'],['registration_gift','registrationGift'],['review_reward','reviewReward'],['billing_plan','planCredits'],['billing_pack','packCredits']]) assert.equal(walletBatchSourceKey({...b,receiptSource}),'account.wallet.'+key);
 for(const receiptSource of [undefined,null,'unrecorded'])assert.equal(walletBatchSourceKey({...b,receiptSource}),'account.wallet.gift');
 assert(isAccountWallet({...snapshot(),batches:snapshot().batches.map(b=>({...b,receiptSource:'signin'}))},'a'));
 assert.equal(isAccountWallet({...snapshot(),batches:snapshot().batches.map(b=>({...b,receiptSource:{invalid:true}}))},'a'),false);
});
