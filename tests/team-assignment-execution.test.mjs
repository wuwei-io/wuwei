import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
// The room/store modules capture the data directory at import time. Isolate before importing.
const testDirName = `.wuwei-assignment-test-${randomUUID()}`;
process.env.WUWEI_DATA_DIR_NAME = testDirName;
const testRoot = resolve(join(homedir(), testDirName));
const room = await import('../desktop/main/team/room.ts');
const store = await import('../desktop/main/team/store.ts');
const { runDmTurn, abortRoom, enqueueEmpTask } = await import('../desktop/main/team/orchestrator.ts');
store.saveEmployees([{ id: 'ceo', name: '小笨' }, { id: 'worker', name: '小码' }]);
after(async () => {
  assert.equal(dirname(testRoot), resolve(homedir()));
  assert.ok(testDirName.startsWith('.wuwei-assignment-test-'));
  await fs.rm(testRoot, { recursive: true, force: true });
});
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
const tick = () => new Promise(resolve => setImmediate(resolve));
function dm(text = 'original task') {
  const value = room.createDm('ceo', 'worker', ['小笨', '小码']);
  room.appendMessage(value.id, { speaker: { id: 'ceo', name: '小笨', kind: 'agent' }, text });
  return value;
}
const deps = runEmployee => ({ send() {}, log() {}, baseSys: () => '', runEmployee });

test('queued assignments execute their own task instead of a later unrelated DM message', async () => {
  const value = dm();
  room.appendMessage(value.id, { speaker: { id: 'ceo', name: '小笨', kind: 'agent' }, text: 'another message added while waiting' });
  const scope = { turnId: 'root', origin: { kind: 'session', id: 'ceo-original-session' }, ownerId: 'ceo', ownerName: '小笨', depth: 0 };
  let received;
  const result = await runDmTurn(value.id, 'worker', 'original task', deps(async args => { received = args; return 'actual result'; }), 1,
    { strict: true, explicitInput: true, taskReportScope: scope });
  assert.equal(result, 'actual result'); assert.equal(received.input, 'original task');
  assert.deepEqual(received.taskReportScope, scope); assert.deepEqual(received.reportOrigin, { kind: 'room', id: value.id });
  assert.equal(room.loadRoomMessages(value.id).at(-1).text, 'actual result');
});

test('a busy room waits for assigned work instead of treating the busy message as completion', async () => {
  const value = dm(); const firstRun = deferred(), started = deferred(); const seen = [];
  const d = deps(async args => { seen.push(args.input); if (args.input === 'first') { started.resolve(); await firstRun.promise; } return `result-${args.input}`; });
  const first = runDmTurn(value.id, 'worker', 'first', d, 1, { strict: true, explicitInput: true });
  await started.promise;
  const second = runDmTurn(value.id, 'worker', 'second', d, 1, { strict: true, explicitInput: true });
  await tick(); assert.deepEqual(seen, ['first']);
  firstRun.resolve(); assert.deepEqual(await Promise.all([first, second]), ['result-first', 'result-second']);
  assert.deepEqual(seen, ['first', 'second']);
});

test('cancelled employee work is rejected as cancelled and never recorded as a successful reply', async () => {
  const value = dm(); const started = deferred();
  const task = runDmTurn(value.id, 'worker', 'task', deps(async args => {
    started.resolve(); await new Promise(resolve => args.signal.addEventListener('abort', resolve, { once: true })); return 'late result';
  }), 1, { strict: true, explicitInput: true });
  const rejection = assert.rejects(task, { name: 'AbortError' });
  await started.promise; abortRoom(value.id); await rejection;
  assert.ok(!room.loadRoomMessages(value.id).some(m => m.text === 'late result'));
});

test('worker errors stay in the DM and are rejected for the task report collector', async () => {
  const value = dm();
  await assert.rejects(runDmTurn(value.id, 'worker', 'task', deps(async () => { throw new Error('test failure'); }), 1,
    { strict: true, explicitInput: true }), /test failure/);
  assert.equal(room.loadRoomMessages(value.id).at(-1).error, true);
});

test('image-only employee output counts as a delivered artifact and remains attached in the DM', async () => {
  const value = dm();
  const result = await runDmTurn(value.id, 'worker', 'create image', deps(async args => {
    args.onProgress({ kind: 'image', dataUrl: 'data:image/png;base64,test-fixture' }); return '';
  }), 1, { strict: true, explicitInput: true });
  assert.match(result, /已交付1张图片/);
  assert.deepEqual(room.loadRoomMessages(value.id).at(-1).images, ['data:image/png;base64,test-fixture']);
});

test('a report originating in a group resumes the owner with the group context', async () => {
  const value = room.createRoom('董事长工作群', ['ceo', 'worker'], 'ceo'); let sys;
  await runDmTurn(value.id, 'ceo', '员工汇报已经收齐', deps(async args => { sys = args.sys; return '统一验收报告'; }), 0,
    { strict: true, explicitInput: true });
  assert.match(sys, /你在群聊「董事长工作群」里/);
  assert.equal(room.loadRoomMessages(value.id).at(-1).text, '统一验收报告');
});

test('urgent assignment keeps the active job and runs ahead of queued normal jobs', async () => {
  const hold = deferred(), started = deferred(), seen = [];
  const first = enqueueEmpTask('queue-test', async () => { seen.push('active'); started.resolve(); await hold.promise; });
  await started.promise;
  const normal = enqueueEmpTask('queue-test', async () => { seen.push('normal'); });
  const urgent = enqueueEmpTask('queue-test', async () => { seen.push('urgent'); }, { urgent: true });
  hold.resolve(); await Promise.all([first, normal, urgent]);
  assert.deepEqual(seen, ['active', 'urgent', 'normal']);
});
