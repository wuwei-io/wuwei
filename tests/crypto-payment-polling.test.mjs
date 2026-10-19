import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../desktop/renderer/src/App.tsx', import.meta.url), 'utf8');
const start = source.indexOf('  // 按当前订单查单');
const end = source.indexOf('  }, [orderId, loading, checkVersion]);', start);
assert.ok(start > 0 && end > start);
const snippet = source.slice(start, end + '  }, [orderId, loading, checkVersion]);'.length);
const js = ts.transpileModule(snippet, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(query) {
  let cleanup; const states = [], paid = [], timers = new Map(); let next = 0;
  vm.runInNewContext(js, {
    orderId: 'order-current', loading: false, checkVersion: 0,
    useEffect: fn => { cleanup = fn(); },
    window: { wuwei: { payStatus: query } },
    paidCallback: { current: (...args) => paid.push(args) },
    setCheckState: state => states.push(state), Date,
    setTimeout: fn => { timers.set(++next, fn); return next; },
    clearTimeout: id => timers.delete(id),
  });
  return { states, paid, timers, cleanup, async tick() { const [id, fn] = timers.entries().next().value; timers.delete(id); await fn(); await flush(); } };
}
test('pending -> paid checks the exact order and notifies once', async () => {
  const seen = []; let calls = 0;
  const h = setup(async id => { seen.push(id); return ++calls === 1 ? { status: 'pending' } : { status: 'paid', balance: 1613.839206 }; });
  await flush(); assert.equal(h.states[0], 'waiting'); await h.tick();
  assert.deepEqual(seen, ['order-current', 'order-current']);
  assert.deepEqual(h.paid, [[1613.839206, 'order-current']]); assert.equal(h.timers.size, 0);
});
test('network failure retries and does not report payment failure', async () => {
  let calls = 0; const h = setup(async () => { if (++calls === 1) throw Error('offline'); return { status: 'pending' }; });
  await flush(); assert.equal(h.states[0], 'network'); await h.tick();
  assert.equal(h.states[1], 'waiting'); assert.equal(h.paid.length, 0); h.cleanup();
});
test('closed modal ignores an in-flight response', async () => {
  let resolve; const h = setup(() => new Promise(r => { resolve = r; }));
  h.cleanup(); resolve({ status: 'paid', balance: 10 }); await flush();
  assert.equal(h.paid.length, 0); assert.equal(h.timers.size, 0);
});
test('expired order stops automatic polling without marking paid', async () => {
  const h = setup(async () => ({ status: 'expired' })); await flush();
  assert.equal(h.states[0], 'expired'); assert.equal(h.paid.length, 0); assert.equal(h.timers.size, 0);
});
