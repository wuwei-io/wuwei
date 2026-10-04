import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TaskReports, ConversationReports, taskReportPrompt } from '../desktop/main/team/task-reports.ts';
import { Agent } from '../src/agent/loop.ts';
function deferred() { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; }
const tick = () => new Promise(resolve => setImmediate(resolve));
const scope = id => ({ turnId: id, origin: { kind: 'session', id: 'original-ceo-chat' }, ownerId: 'ceo', ownerName: '小笨', depth: 0 });
const task = (employeeName, run) => ({ employeeName, task: `修复${employeeName}负责的模块`, roomId: `dm-${employeeName}`, run });

test('two asynchronous assignments are collected and sent once to the original CEO conversation', async () => {
  const delivered = []; const slow = deferred(); const reports = new TaskReports({ deliver: async b => { delivered.push(b); }, onDeliveryError: assert.fail });
  const root = scope('turn-a');
  reports.assign(root, task('小码', async () => ({ status: 'completed', text: '修复完成，检查通过' })));
  reports.assign(root, task('小数', () => slow.promise));
  reports.closeTurn(root.turnId); await tick();
  assert.equal(delivered.length, 0);
  slow.resolve({ status: 'completed', text: '成本核对完成' }); await tick();
  assert.equal(delivered.length, 1); assert.deepEqual(delivered[0].scope.origin, root.origin);
  assert.deepEqual(delivered[0].results.map(r => r.text), ['修复完成，检查通过', '成本核对完成']);
  reports.closeTurn(root.turnId); await tick(); assert.equal(delivered.length, 1);
  assert.match(taskReportPrompt(delivered[0]), /统一验收/);
});

test('a quick employee does not report before the CEO has finished dispatching', async () => {
  const delivered = []; const reports = new TaskReports({ deliver: async b => { delivered.push(b); }, onDeliveryError: assert.fail });
  const root = scope('quick');
  reports.assign(root, task('小码', async () => ({ status: 'completed', text: 'first' })));
  await tick(); assert.equal(delivered.length, 0);
  reports.assign(root, task('小数', async () => ({ status: 'completed', text: 'second' })));
  reports.closeTurn(root.turnId); await tick();
  assert.equal(delivered.length, 1); assert.equal(delivered[0].results.length, 2);
});

test('descendant assignments join the root batch and their results reach the CEO too', async () => {
  const delivered = []; const child = deferred(); const reports = new TaskReports({ deliver: async b => { delivered.push(b); }, onDeliveryError: assert.fail });
  const root = scope('nested');
  reports.assign(root, task('小码', async () => {
    reports.assign(root, task('小美', () => child.promise));
    return { status: 'completed', text: '已派设计部分给小美' };
  }));
  reports.closeTurn(root.turnId); await tick(); assert.equal(delivered.length, 0);
  child.resolve({ status: 'completed', text: '设计已交付，产物路径见报告' }); await tick();
  assert.equal(delivered.length, 1); assert.deepEqual(delivered[0].results.map(r => r.employeeName), ['小码', '小美']);
});

test('failed/cancelled workers are reported instead of silently swallowed or labeled complete', async () => {
  const delivered = []; const reports = new TaskReports({ deliver: async b => { delivered.push(b); }, onDeliveryError: assert.fail });
  const root = scope('errors');
  reports.assign(root, task('小码', async () => { throw new Error('worker crashed'); }));
  reports.assign(root, task('小数', async () => ({ status: 'cancelled', text: '用户停止了任务' })));
  reports.closeTurn(root.turnId); await tick();
  assert.deepEqual(delivered[0].results.map(r => r.status), ['failed', 'cancelled']);
  assert.match(taskReportPrompt(delivered[0]), /执行失败/); assert.match(taskReportPrompt(delivered[0]), /已取消/);
});

test('separate user turns keep separate batches and destinations', async () => {
  const delivered = []; const reports = new TaskReports({ deliver: async b => { delivered.push(b); }, onDeliveryError: assert.fail });
  for (const id of ['a', 'b']) {
    const root = { ...scope(id), origin: { kind: 'session', id: `chat-${id}` } };
    reports.assign(root, task('小码', async () => ({ status: 'completed', text: id })));
    reports.closeTurn(id);
  }
  await tick(); assert.deepEqual(delivered.map(b => [b.scope.origin.id, b.results[0].text]).sort(), [['chat-a', 'a'], ['chat-b', 'b']]);
});

test('delivery failure produces a visible recovery callback with all original results', async () => {
  const errors = []; const reports = new TaskReports({ deliver: async () => { throw new Error('no provider'); }, onDeliveryError: (b, e) => errors.push([b, e]) });
  reports.assign(scope('delivery-error'), task('小码', async () => ({ status: 'completed', text: 'artifact retained' })));
  reports.closeTurn('delivery-error'); await tick();
  assert.equal(errors.length, 1); assert.equal(errors[0][0].results[0].text, 'artifact retained');
});

test('reports arriving while the CEO is handling user input wait and resume without smart-continue', async () => {
  let busy = true; const delivered = []; const queue = new ConversationReports({ isBusy: () => busy, deliver: async (id, text) => delivered.push([id, text]) });
  const first = queue.enqueue('ceo-chat', 'all worker results'); await tick(); assert.equal(delivered.length, 0);
  busy = false; queue.drain('ceo-chat'); await first;
  assert.deepEqual(delivered, [['ceo-chat', 'all worker results']]);
});

test('conversation reports are serialized per session while other sessions can proceed', async () => {
  const slow = deferred(); const seen = []; const queue = new ConversationReports({ isBusy: () => false, deliver: async (id, text) => { seen.push([id, text]); if (text === 'first') await slow.promise; } });
  const first = queue.enqueue('a', 'first'), second = queue.enqueue('a', 'second'), other = queue.enqueue('b', 'other');
  await other; assert.deepEqual(seen, [['a', 'first'], ['b', 'other']]);
  slow.resolve(); await Promise.all([first, second]); assert.deepEqual(seen.at(-1), ['a', 'second']);
});

test('Agent supplies one stable turn ID to all assignments and closes that turn once', async () => {
  const turnIds = [], closed = []; let step = 0;
  const tool = { name: 'assign_task', description: '', inputSchema: {}, readOnly: false, run: async (_input, ctx) => { turnIds.push(ctx.turnId); return { content: 'queued' }; } };
  const provider = { name: 'fake', complete: async () => ++step <= 2 ? { stopReason: 'tool_use', content: [{ type: 'tool_use', id: `call-${step}`, name: 'assign_task', input: {} }] } : { stopReason: 'end_turn', content: [{ type: 'text', text: 'waiting' }] } };
  const agent = new Agent(provider, '', [tool], { cwd: '.' }, new Map([[tool.name, tool]]), { compactThreshold: 0 });
  await agent.send('delegate', { onTurnEnd: id => closed.push(id) });
  assert.equal(turnIds.length, 2); assert.ok(turnIds[0]); assert.equal(turnIds[0], turnIds[1]); assert.deepEqual(closed, [turnIds[0]]);
});
