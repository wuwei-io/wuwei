import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogRefresher } from '../src/catalog-refresh.ts';
test('an older directory response cannot overwrite a newer one',async()=>{
  const pending=[],published=[];let settled=0;
  const refresh=createCatalogRefresher(()=>new Promise(resolve=>pending.push(resolve)),value=>published.push(value),()=>settled++);
  const first=refresh(),second=refresh();pending[1](['new']);await second;pending[0](['old']);await first;
  assert.deepEqual(published,[['new']]);assert.equal(settled,1);
});
test('empty or failed refresh retains the successful catalog',async()=>{
  let attempt=0;const published=[];let settled=0;
  const refresh=createCatalogRefresher(async()=>{if(attempt++===0)return ['backend'];if(attempt===2)return null;throw Error('offline');},value=>published.push(value),()=>settled++);
  await refresh();await refresh();await refresh();assert.deepEqual(published,[['backend']]);assert.equal(settled,3);
});
