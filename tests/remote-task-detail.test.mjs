import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remoteTaskDetail, remoteRoomTaskDetail, remoteBatchTaskDetail } from '../desktop/main/remote-task-detail.ts';

test('exported files appear only after an actual successful send_file result', () => {
  const file = { id: 'file-id', name: 'report.csv', kind: 'file', bytes: 3, md5: 'a'.repeat(32), origin: { kind: 'session', id: 'original' } };
  const input = [text('user', 'export'), { role: 'assistant', content: [{ type: 'tool_use', id: 'deliver', name: 'send_file', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'deliver', content: JSON.stringify({ delivered: true, file }) }] }, text('assistant', 'delivered')];
  assert.deepEqual(remoteTaskDetail({ id: 'original' }, input, false, 'worker').outputs, [file]);
  input[2].content[0].is_error = true;
  assert.equal(remoteTaskDetail({ id: 'original' }, input, false, 'worker').outputs.length, 0);
  assert.equal(remoteTaskDetail({ id: 'original' }, [text('user', 'export'), text('assistant', '/tmp/report.csv')], false, 'worker').outputs.length, 0);
});

test('batch details preserve original conversation and actual receipt/report phases', () => {
  const batch = { scope: { turnId: 'batch', ownerId: 'ceo', ownerName: '小笨', origin: { kind: 'room', id: 'original-room' } }, phase: 'working', updatedAt: 3, cancelled: false,
    results: [{ id: 'job', employeeName: '小码', task: 'fix', status: 'queued', text: '', roomId: 'worker-room' }] };
  const queued = remoteBatchTaskDetail(batch);
  assert.equal(queued.roomId, 'original-room'); assert.equal(queued.steps[0].status, 'todo'); assert.equal(queued.status, 'running'); assert.equal(queued.canStop, true);
  batch.phase = 'reporting'; batch.results[0].status = 'completed'; batch.results[0].text = 'checks passed';
  const reporting = remoteBatchTaskDetail(batch);
  assert.equal(reporting.status, 'running'); assert.equal(reporting.canStop, false); assert.equal(reporting.steps.at(-1).status, 'running');
  batch.phase = 'interrupted'; assert.equal(remoteBatchTaskDetail(batch).status, 'unknown');
  batch.phase = 'done'; batch.cancelled = true; assert.equal(remoteBatchTaskDetail(batch).status, 'stopped');
  batch.phase = 'error'; assert.equal(remoteBatchTaskDetail(batch).status, 'error');
});
const text = (role, text) => ({ role, content: [{ type: 'text', text }] });
const call = id => ({ role: 'assistant', content: [{ type: 'tool_use', id, name: 'screenshot', input: {} }] });
test('task details use only the last user turn, preserve actual errors and deduplicate returned images', () => {
  const image = { type: 'image', dataUrl: 'data:image/png;base64,dGVzdA==' };
  const result = remoteTaskDetail({ id: 'original', title: '截图', updatedAt: 3 }, [text('user', '旧任务'), call('old'), text('user', '新任务'), call('new'),
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'new', is_error: true, content: [{ type: 'text', text: '部分失败' }, image, image] }] }, text('assistant', '失败原因已报告')], false, '小码');
  assert.equal(result.sessionId, 'original'); assert.equal(result.status, 'error'); assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0].id, 'new'); assert.equal(result.steps[0].status, 'error'); assert.equal(result.outputs.length, 1);
  assert.ok(result.logs.every(row => !row.text.includes('旧任务')));
});

test('group task details retain actual speakers and steps and exclude earlier failures and input photos', () => {
  const human = { id: 'me', name: '董事长', kind: 'human' };
  const agent = { id: 'employee', name: '小码', kind: 'agent' };
  const result = remoteRoomTaskDetail({ id: 'room', name: '研发', updatedAt: 8 }, [
    { id: 'old', ts: 1, speaker: agent, text: '旧任务失败', error: true },
    { id: 'new', ts: 2, speaker: human, text: '请处理图片', images: ['input-photo'] },
    { id: 'ack', ts: 3, speaker: agent, text: '收到', ack: true },
    { id: 'done', ts: 4, speaker: agent, text: '处理完成', steps: [{ name: 'image', result: '成功' }], images: ['returned-image', 'returned-image'] },
  ], false);
  assert.equal(result.roomId, 'room'); assert.equal(result.status, 'done');
  assert.deepEqual(result.outputs.map(o => o.uri), ['returned-image']);
  assert.equal(result.steps[0].title, '小码 · image'); assert.equal(result.steps[0].status, 'done');
  assert.ok(result.logs.every(row => !row.text.includes('旧任务失败') && row.text !== '收到'));
  const pending = remoteRoomTaskDetail({ id: 'room', name: '研发' }, [
    { id: 'human', ts: 2, speaker: human, text: '继续' },
    { id: 'pending', ts: 3, speaker: agent, text: '开始处理', steps: [{ name: 'image' }] },
  ], false);
  assert.equal(pending.status, 'unknown');
});
test('unfinished and stopped tool calls cannot be displayed as completed', () => {
  const meta = { id: 's', title: '任务', updatedAt: 1 };
  assert.equal(remoteTaskDetail(meta, [text('user', '工作'), call('x')], false, 'AI').steps[0].status, 'unknown');
  const stopped = remoteTaskDetail(meta, [text('user', '工作'), call('x'), { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: '(已停止)', is_error: true }] }], false, 'AI');
  assert.equal(stopped.status, 'stopped'); assert.equal(stopped.steps[0].status, 'stopped');
  assert.equal(remoteTaskDetail(meta, [], true, 'AI').status, 'running');
});
