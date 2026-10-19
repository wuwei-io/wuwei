import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountRefresher } from '../src/account-refresh.ts';
const account=(id,balance)=>({user:{id},coin:{balance}});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};

test('missing credentials request sign-in, but temporary failures retain account without a prompt',async()=>{
 for(const missing of [true,false]){
  let value=account('a',10),prompts=0;
  const refresh=createAccountRefresher(async()=>{if(missing)return null;throw Error('temporary network failure');},()=>value,v=>{value=v},()=>{},15000,()=>{prompts++;value=null;});
  await refresh.refresh();assert.equal(prompts,missing?1:0);assert.equal(value?.coin.balance,missing?undefined:10);
 }
});
test('closing/reopening while loading reuses the request and still publishes its result',async()=>{
 const pending=deferred();let value=account('a',555),calls=0;const states=[];
 const refresh=createAccountRefresher(()=>{calls++;return pending.promise},()=>value,v=>{value=v},s=>states.push(s));
 const first=refresh.refresh();assert.equal(refresh.refresh(),first);await Promise.resolve();assert.equal(calls,1);
 pending.resolve(account('a',554));await first;assert.equal(value.coin.balance,554);assert.equal(states.at(-1).busy,false);assert.equal(states.at(-1).error,false);assert.ok(states.at(-1).updatedAt);
});
test('failures retain the balance, display failure and permit retry',async()=>{
 let value=account('a',555),fail=true;const states=[];
 const refresh=createAccountRefresher(async()=>{if(fail)throw Error('offline');return account('a',554)},()=>value,v=>{value=v},s=>states.push(s));
 await refresh.refresh();assert.equal(value.coin.balance,555);assert.equal(states.at(-1).error,true);assert.equal(states.at(-1).updatedAt,null);
 fail=false;await refresh.refresh();assert.equal(value.coin.balance,554);assert.equal(states.at(-1).error,false);
});
test('logout/relogin or switching accounts rejects a late result and leaves the newer request busy',async()=>{
 const old=deferred(),next=deferred();let value=account('a',555),calls=0;const states=[];
 const refresh=createAccountRefresher(()=>++calls===1?old.promise:next.promise,()=>value,v=>{value=v},s=>states.push(s));
 const first=refresh.refresh();await Promise.resolve();refresh.reset();value=account('b',100);const second=refresh.refresh();await Promise.resolve();
 old.resolve(account('a',554));await first;assert.equal(value.user.id,'b');assert.equal(states.at(-1).busy,true);
 next.resolve(account('b',99));await second;assert.equal(value.coin.balance,99);assert.equal(states.at(-1).busy,false);
});
test('missing or mismatched responses do not count as a successful refresh',async()=>{
 for(const response of [null,account('b',0)]){let value=account('a',555),state;const refresh=createAccountRefresher(async()=>response,()=>value,v=>{value=v},s=>{state=s});await refresh.refresh();assert.equal(value.coin.balance,555);assert.equal(state.error,true);assert.equal(state.updatedAt,null);}
});
test('a stalled request stops spinning and a late response cannot overwrite the balance',async()=>{
 const pending=deferred();let value=account('a',555),state;
 const refresh=createAccountRefresher(()=>pending.promise,()=>value,v=>{value=v},s=>{state=s},5);
 await refresh.refresh();assert.equal(state.busy,false);assert.equal(state.error,true);
 pending.resolve(account('a',554));await new Promise(r=>setTimeout(r,0));assert.equal(value.coin.balance,555);
});
