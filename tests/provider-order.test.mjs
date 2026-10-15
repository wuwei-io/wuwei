import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrangeProviderEntries } from '../src/provider-order.ts';
const oldOrder=['kimi-sub','claude-oauth','codex','zhipu','deepseek'];
const catalog=['wuwei-free','wuwei-mimo','wuwei-deepseek','wuwei-claude','claude-oauth','codex','kimi-sub','deepseek','zhipu'];
const providers=[...oldOrder,'wuwei-claude','wuwei-free','wuwei-deepseek','wuwei-mimo'].map(id=>({id}));
test('legacy local ordering cannot place subscriptions or BYOK ahead of the backend catalog',()=>{
  const result=arrangeProviderEntries(providers,oldOrder,[],false,[],catalog);
  assert.deepEqual(result.map(p=>p.id),catalog);assert.equal(providers[0].id,'kimi-sub');
});
test('backend order updates apply immediately; unknown custom entries retain their local relative order',()=>{
  const all=[...providers,{id:'custom-b'},{id:'custom-a'}];
  const revised=[...catalog];[revised[1],revised[2]]=[revised[2],revised[1]];
  assert.deepEqual(arrangeProviderEntries(all,['custom-a','custom-b',...oldOrder],[],false,[],revised).map(p=>p.id),[...revised,'custom-a','custom-b']);
});
test('hidden entries and selected identities remain unchanged; offline fallback uses local ordering',()=>{
  const result=arrangeProviderEntries(providers,oldOrder,['zhipu'],false,catalog);
  assert.deepEqual(result.slice(0,4).map(p=>p.id),oldOrder.filter(id=>id!=='zhipu'));
  assert.equal(arrangeProviderEntries(providers,oldOrder,['zhipu'],true,catalog,catalog).length,providers.length);
});
