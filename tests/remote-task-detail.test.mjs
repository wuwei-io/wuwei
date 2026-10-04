import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remoteTaskDetail, remoteRoomTaskDetail } from '../desktop/main/remote-task-detail.ts';
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
