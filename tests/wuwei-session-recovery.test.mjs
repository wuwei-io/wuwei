import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshHostedSession, SessionRefreshUnavailable } from '../src/wuwei-refresh.ts';
import { createHostedSessionState } from '../src/wuwei-session-state.ts';

const saved = () => ({ accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: 1 });
const fresh = () => ({ accessToken: 'new-access', refreshToken: 'new-refresh', expiresAt: Date.now() + 3600000 });
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
function fixture(refresh) {
  const state = { session: saved(), clears: 0, prompts: 0, writes: 0, calls: 0 };
  const manager = createHostedSessionState({ load: () => state.session,
    save: s => { state.session = s; state.writes++; }, clear: () => { state.session=null; state.clears++; },
    refresh: token => { state.calls++; return refresh(token); }, onExpired: () => state.prompts++ });
  return {state,manager};
}
test('offline, timeout, rate limiting, 5xx, invalid JSON and ambiguous legacy 401 preserve credentials', async () => {
  const responses = [() => {throw new TypeError('offline');}, () => {throw new DOMException('timeout','TimeoutError');},
    ...[429,500,502,503].map(status => () => Response.json({error:'auth_unavailable'}, {status})),
    () => new Response('broken json', {status:200}), () => Response.json({error:'refresh_failed'},{status:401}),
    () => Response.json({access_token:'missing-refresh-and-expiry'})];
  for (const response of responses) {
    const f=fixture(token=>refreshHostedSession('https://site.invalid',token,async()=>response()));
    await assert.rejects(f.manager.get(), SessionRefreshUnavailable);
    assert.deepEqual(f.state.session,saved()); assert.equal(f.state.clears,0); assert.equal(f.state.prompts,0);
  }
});
test('explicit expired tokens clear storage and notify exactly once across concurrent requests', async () => {
  const f=fixture(token=>refreshHostedSession('https://site.invalid',token,async()=>Response.json(
    {error:'refresh_token_not_found',reauth_required:true},{status:401})));
  assert.deepEqual(await Promise.all([f.manager.get(),f.manager.get(),f.manager.get('old-access')]),[null,null,null]);
  await f.manager.get(); assert.equal(f.state.calls,1); assert.equal(f.state.clears,1); assert.equal(f.state.prompts,1);
});
test('proactive refresh and forced payment/account retries share one rotation, late 401 reuses new token', async()=>{
  const pending=deferred(),f=fixture(()=>pending.promise),next=fresh();
  const requests=[f.manager.get(),f.manager.get('old-access'),f.manager.get('old-access')];
  await Promise.resolve(); assert.equal(f.state.calls,1); pending.resolve(next);
  for(const result of await Promise.all(requests)) assert.deepEqual(result,next);
  assert.deepEqual(await f.manager.get('old-access'),next); assert.equal(f.state.calls,1); assert.equal(f.state.writes,1);
});
test('transient failure permits the next request to renew without another login',async()=>{
  let online=false;const next=fresh(),f=fixture(async()=>{if(!online)throw new SessionRefreshUnavailable();return next;});
  await assert.rejects(f.manager.get());online=true;assert.deepEqual(await f.manager.get(),next);
  assert.equal(f.state.clears,0);assert.equal(f.state.prompts,0);
});
test('logout during refresh cannot resurrect a session or prompt again',async()=>{
  const pending=deferred(),f=fixture(()=>pending.promise),request=f.manager.get();await Promise.resolve();
  f.manager.logout();pending.resolve(fresh());assert.equal(await request,null);assert.equal(f.state.session,null);assert.equal(f.state.writes,0);assert.equal(f.state.prompts,0);
});
test('a late success or invalidation cannot overwrite or clear a newer login',async()=>{
  for(const result of [fresh(),null]){
    const pending=deferred(),f=fixture(()=>pending.promise),request=f.manager.get();await Promise.resolve();
    const signedIn={...fresh(),accessToken:'other-user',refreshToken:'other-refresh'};f.manager.accept(signedIn);
    pending.resolve(result);assert.deepEqual(await request,signedIn);assert.deepEqual(f.state.session,signedIn);
    assert.equal(f.state.clears,0);assert.equal(f.state.prompts,0);assert.equal(f.state.writes,1);
  }
});
test('missing refresh token needs login, while malformed success must keep the saved token',async()=>{
  assert.equal(await refreshHostedSession('https://site.invalid',''),null);
  await assert.rejects(refreshHostedSession('https://site.invalid','saved',async()=>Response.json(
    {access_token:'a',refresh_token:'b',expires_at:0})),SessionRefreshUnavailable);
});

test('non-object refresh payloads preserve saved credentials instead of authenticating or clearing them',async()=>{
  for(const payload of [false,0,'offline',[],null]){
    for(const status of [200,401]){
      const f=fixture(token=>refreshHostedSession('https://site.invalid',token,async()=>Response.json(payload,{status})));
      await assert.rejects(f.manager.get(),SessionRefreshUnavailable);
      assert.deepEqual(f.state.session,saved());assert.equal(f.state.clears,0);assert.equal(f.state.prompts,0);
    }
  }
});
