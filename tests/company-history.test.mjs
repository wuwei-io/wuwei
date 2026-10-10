import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { Agent } from '../src/agent/loop.ts';
import { historyPolicy, windowHistory, HISTORY_TEXT_BUDGET, SUMMARY_CHAR_LIMIT } from '../src/team/history-window.ts';

const testDir = `.wuwei-history-test-${randomUUID()}`;
process.env.WUWEI_DATA_DIR_NAME = testDir;
const root = resolve(homedir(), testDir);
const { teamRequestHistory } = await import('../desktop/main/team/history.ts');
const { saveTeamConfig, loadTeamConfig, saveEmployees } = await import('../desktop/main/team/store.ts');
const room = await import('../desktop/main/team/room.ts');
const { runDmTurn } = await import('../desktop/main/team/orchestrator.ts');
after(() => {
  assert.equal(dirname(root), resolve(homedir()));
  assert.ok(testDir.startsWith('.wuwei-history-test-'));
  rmSync(root, { recursive: true, force: true });
});
const msg = (i, text = `message-${i}`) => ({ role: i % 2 ? 'assistant' : 'user', content: [{ type: 'text', text }], ts: i });
const text = messages => messages.flatMap(m => m.content).filter(b => b.type === 'text').map(b => b.text).join('\n');
const history = n => Array.from({ length: n }, (_, i) => msg(i));
const normal = historyPolicy();

test('settings defaults, bounds and persistence are validated server-side', () => {
  assert.deepEqual(normal, { historyRecentMessages: 10, historyAutoSummary: true });
  for (const invalid of [undefined, null, NaN, Infinity, -1, 'bad']) assert.equal(historyPolicy({ historyRecentMessages: invalid }).historyRecentMessages, 10);
  assert.equal(historyPolicy({ historyRecentMessages: 1000 }).historyRecentMessages, 100);
  assert.equal(historyPolicy({ historyRecentMessages: 1 }).historyRecentMessages, 2);
  saveTeamConfig({ maxDmLevels: 4, historyRecentMessages: 7, historyAutoSummary: false });
  assert.equal(loadTeamConfig().historyRecentMessages, 7);
  assert.equal(loadTeamConfig().historyAutoSummary, false);
  saveTeamConfig({ historyRecentMessages: NaN, historyAutoSummary: 'bad' });
  assert.equal(loadTeamConfig().maxDmLevels, 4);
  assert.equal(loadTeamConfig().historyRecentMessages, 10);
  assert.equal(loadTeamConfig().historyAutoSummary, true);
});

test('1000-message old chat is bounded before the first request, without destroying history', () => {
  const original = history(1000), snapshot = structuredClone(original);
  const out = windowHistory(original, normal);
  assert.equal(out.messages.length, 11);
  assert.deepEqual(out.messages.slice(1).map(m => m.ts), history(1000).slice(-10).map(m => m.ts));
  assert.ok(out.digest.text.length <= SUMMARY_CHAR_LIMIT);
  assert.match(out.digest.text, /message-0/);
  assert.doesNotMatch(text(out.messages), /message-500\b/);
  assert.deepEqual(original, snapshot);
});

test('older giant text/images/tool results are bounded; latest explicit user request is intact', () => {
  const original = history(20).map((m, i) => msg(i, `${i}:` + 'x'.repeat(50000)));
  original[18].content.push({ type: 'image', dataUrl: 'data:image/png;base64,original-image' });
  const latest = msg(20, 'USER-LATEST-' + 'z'.repeat(20000)); original.push(latest);
  const before = JSON.stringify(original);
  const out = windowHistory(original, normal);
  assert.deepEqual(out.messages.at(-1), latest);
  assert.ok(text(out.messages.slice(1, -1)).length <= HISTORY_TEXT_BUDGET + 100);
  assert.ok(!JSON.stringify(out.messages).includes('original-image'));
  assert.equal(JSON.stringify(original), before);
});

test('retained parallel tool results still have their actual tool call IDs and original history remains intact', () => {
  const original = [msg(0, 'run both'),
    { role: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 'read_file', input: { path: 'a' } }, { type: 'tool_use', id: 'b', name: 'read_file', input: { path: 'b' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: 'x'.repeat(30000) }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'b', content: 'result b' }] }];
  const out = windowHistory(original, historyPolicy({ historyRecentMessages: 2 }));
  const calls = new Set(out.messages.flatMap(m => m.content).filter(b => b.type === 'tool_use').map(b => b.id));
  for (const b of out.messages.flatMap(m => m.content).filter(b => b.type === 'tool_result')) assert.ok(calls.has(b.tool_use_id));
  assert.equal(original[2].content[0].content.length, 30000);
  assert.ok(JSON.stringify(out.messages).length < 5000);
});

test('summary cache survives a new projector, follows settings changes and never resurrects old history', () => {
  saveTeamConfig(normal);
  const project = teamRequestHistory('session:cache-test');
  const out = project(history(40));
  const dir = join(root, 'team', 'context-summaries');
  const cacheFile = join(dir, readdirSync(dir)[0]);
  const before = readFileSync(cacheFile, 'utf8'), mtime = statSync(cacheFile).mtimeMs;
  assert.deepEqual(teamRequestHistory('session:cache-test')(history(40)), out);
  assert.equal(readFileSync(cacheFile, 'utf8'), before);
  assert.equal(statSync(cacheFile).mtimeMs, mtime);
  writeFileSync(cacheFile, '{bad json');
  assert.equal(project(history(40)).length, 11);
  saveTeamConfig({ historyRecentMessages: 4, historyAutoSummary: false });
  assert.equal(project(history(40)).filter(m => m.ts !== undefined).length, 4);
  assert.doesNotMatch(text(project(history(40))), /历史摘要/);
  saveTeamConfig(normal);
  const edited = history(40); edited[0] = msg(0, 'corrected goal');
  assert.match(text(project(edited)), /corrected goal/);
  assert.doesNotMatch(text(project(edited)), /message-0\b/);
  assert.deepEqual(project([msg(0, 'new chat')]), [msg(0, 'new chat')]);
  assert.doesNotMatch(text(teamRequestHistory('room:another')(history(4))), /corrected goal/);
});

test('real Agent first request and 30 subsequent turns stay bounded, with no paid summarizer calls', async () => {
  saveTeamConfig(normal);
  const calls = [];
  const provider = { name: 'test', async complete(_system, messages) {
    calls.push(structuredClone(messages));
    return { content: [{ type: 'text', text: 'reply' }], stopReason: 'end_turn', usage: { inputTokens: 999999, outputTokens: 1 } };
  } };
  const agent = new Agent(provider, '', [], { cwd: '.' }, new Map(), { requestHistory: teamRequestHistory('session:long'), compactThreshold: 1 });
  const originals = history(1000); agent.setMessages(structuredClone(originals));
  for (let i = 0; i < 31; i++) await agent.send(`new-${i}`, {});
  assert.equal(calls.length, 31);
  assert.ok(calls.every(c => c.length === 11));
  assert.equal(agent.getMessages().length, 1062);
  assert.deepEqual(agent.getMessages().slice(0, 1000), originals);
  saveTeamConfig({ historyRecentMessages: 6, historyAutoSummary: false });
  await agent.send('apply settings without reopening', {});
  assert.equal(calls.at(-1).filter(m => m.ts !== undefined).length, 6);
  const restored = new Agent(provider, '', [], { cwd: '.' }, new Map(), { requestHistory: teamRequestHistory('session:long') });
  restored.setMessages(structuredClone(agent.getMessages()));
  await restored.send('after restart', {});
  assert.equal(calls.at(-1).filter(m => m.ts !== undefined).length, 6);
});

test('non-company Agent keeps its original history behavior', async () => {
  let sent;
  const agent = new Agent({ name: 'test', async complete(_s, messages) { sent = messages; return { content: [{ type: 'text', text: 'ok' }], stopReason: 'end_turn' }; } }, '', [], { cwd: '.' }, new Map(), { compactThreshold: 0 });
  agent.setMessages(history(30)); await agent.send('normal chat', {});
  assert.ok(sent.length >= 31);
});

test('current task and live screenshot survive a long tool chain; old screenshots are omitted', () => {
  const messages = [msg(0, 'CURRENT TASK must stay')];
  for (let i = 0; i < 20; i++) {
    messages.push({ role: 'assistant', content: [{ type: 'tool_use', id: String(i), name: 'screenshot', input: {} }] });
    messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: String(i), content: [{ type: 'image', dataUrl: 'data:image/png;base64,current' }] }] });
  }
  const out = windowHistory(messages, normal);
  assert.ok(out.messages.length <= 12);
  assert.ok(out.messages.some(m => text([m]) === 'CURRENT TASK must stay'));
  assert.ok(JSON.stringify(out.messages.at(-1)).includes('data:image/png;base64,current'));
  const disabled = windowHistory(messages, historyPolicy({ historyAutoSummary: false }));
  assert.equal(disabled.messages[0].role, 'user');
  assert.match(text(disabled.messages), /CURRENT TASK/);
});

test('real DM orchestration filters ack/error and bounds requests on every wake, preserving room messages', async () => {
  saveTeamConfig(normal);
  saveEmployees([{ id: 'owner', name: 'Owner' }, { id: 'worker', name: 'Worker' }]);
  const dm = room.createDm('owner', 'worker');
  for (let i = 0; i < 40; i++) room.appendMessage(dm.id, { speaker: { id: i % 2 ? 'worker' : 'owner', name: i % 2 ? 'Worker' : 'Owner', kind: 'agent' }, text: `room-message-${i}` });
  room.appendMessage(dm.id, { speaker: { id: 'worker', name: 'Worker', kind: 'agent' }, text: 'ACK-HIDDEN', ack: true });
  const snapshots = [];
  const deps = { send() {}, log() {}, baseSys: () => '', runEmployee: async args => {
    const agent = new Agent({ name: 'test', async complete(_s, messages) { snapshots.push(structuredClone(messages)); return { content: [{ type: 'text', text: 'done' }], stopReason: 'end_turn' }; } }, args.sys, [], { cwd: '.' }, new Map(), { requestHistory: teamRequestHistory(`room:${dm.id}`) });
    agent.setMessages(args.history); await agent.send(args.input, {}, args.signal); return 'done';
  } };
  await runDmTurn(dm.id, 'worker', 'explicit current job', deps, 0, { strict: true, explicitInput: true });
  assert.equal(snapshots[0].length, 11);
  assert.match(text(snapshots[0].slice(-1)), /explicit current job/);
  assert.doesNotMatch(text(snapshots[0]), /ACK-HIDDEN/);
  assert.ok(room.loadRoomMessages(dm.id).some(m => m.text === 'room-message-0'));
  room.clearRoomMessages(dm.id);
  await runDmTurn(dm.id, 'worker', 'fresh job', deps, 0, { strict: true, explicitInput: true });
  assert.doesNotMatch(text(snapshots.at(-1)), /room-message-|explicit current job/);
});
