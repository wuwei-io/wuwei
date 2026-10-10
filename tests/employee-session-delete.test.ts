import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sessionAfterDelete } from '../src/team/session-after-delete.js';
import { employeeLabel } from '../src/team/default-localization.js';

// Execute the actual IPC handler and shared chat creator with in-memory stores.
// Never delete the user's chats or call a model during this regression test.
const source = readFileSync(new URL('../desktop/main/index.ts', import.meta.url), 'utf8');
const creator = source.slice(source.indexOf('function startEmployeeChat('), source.indexOf('function syncTeamModule('));
const deletion = source.slice(source.indexOf('ipcMain.on("session:delete",'), source.indexOf('// 回收站:列出'));
const mia = { id: 'wj-design', name: '小美', fromApp: 'wuwei-team-basic', model: { providerId: 'design-provider', model: 'design-model' } };
function harness(rows: any[], currentId = 'deleted') {
  let sessions = structuredClone(rows);
  const events: Array<[string, any]> = [];
  const identities: any[] = [];
  const trash: any[] = [];
  let handler: (event: unknown, id: string) => void;
  const ctx = vm.createContext({
    currentId, sessionAfterDelete, randomUUID: () => 'new-chat',
    ipcMain: { on: (_channel: string, fn: typeof handler) => { handler = fn; } },
    listSessions: () => sessions,
    deleteSession: (id: string) => { trash.push(sessions.find(s => s.id === id)); sessions = sessions.filter(s => s.id !== id); },
    runs: new Map(), agents: new Map(), backendBySid: new Map(),
    clearTeamHistoryDigest() {}, lockSessionModel() {}, sendUsageFor() {}, emitAccount() {},
    loadSettings: () => ({}), teamEnabled: () => true, loadEmployees: () => [mia],
    listGroups: () => [], listTrash: () => trash,
    setSessionEmployee: (id: string, employeeId: string, title: string) => sessions.unshift({ id, employeeId, title, updatedAt: 100 }),
    setSessionBinding: (id: string, binding: any) => Object.assign(sessions.find(s => s.id === id), binding),
    getAgent: (id: string) => { identities.push(sessions.find(s => s.id === id)?.employeeId); return { getMessages: () => [], getDisplayMessages: () => [], getContextBudget: () => ({ contextWindow: 1000 }) }; },
    send: (name: string, payload: any) => events.push([name, payload]),
  });
  vm.runInContext(ts.transpileModule(creator + deletion, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, ctx);
  handler!(null, 'deleted');
  return { sessions, events, identities, trash, currentId: ctx.currentId };
}
const deleted = { id: 'deleted', employeeId: mia.id, title: '设计', updatedAt: 30 };
const other = { id: 'other', title: '小助', updatedAt: 90 };

test('deleting last Mia chat stays Mia in English, binding identity/model before agent creation', () => {
  const h = harness([other, deleted]);
  assert.equal(h.currentId, 'new-chat');
  const replacement = h.sessions.find(s => s.id === h.currentId);
  assert.equal(replacement.employeeId, mia.id);
  assert.equal(replacement.model, mia.model.model);
  assert.deepEqual(h.identities, [mia.id]);
  assert.equal(employeeLabel(mia as any, 'en'), 'Mia');
  assert.equal(employeeLabel(mia as any, 'zh'), '小美');
  assert.equal(h.trash[0].id, 'deleted');
  assert.equal(h.events.find(([ch]) => ch === 'evt:session-loaded')?.[1].boundModel, mia.model.model);
  assert.ok(h.events.findIndex(([ch]) => ch === 'evt:sessions') < h.events.findIndex(([ch]) => ch === 'evt:session-loaded'));
});

test('deleting active employee chat selects newest same-employee chat, never unrelated list head', () => {
  const sibling = { id: 'mia-next', employeeId: mia.id, updatedAt: 20, model: 'saved-model', providerId: 'saved-provider' };
  const h = harness([other, deleted, { ...sibling, id: 'older', updatedAt: 10 }, sibling]);
  assert.equal(h.currentId, sibling.id);
  assert.deepEqual(h.identities, [mia.id]);
  assert.equal(h.events.find(([ch]) => ch === 'evt:session-loaded')?.[1].boundProviderId, 'saved-provider');
});

test('deleting inactive employee chat leaves current conversation untouched', () => {
  const h = harness([other, deleted], 'other');
  assert.equal(h.currentId, 'other');
  assert.equal(h.events.some(([ch]) => ch === 'evt:session-loaded'), false);
  assert.equal(h.sessions.some(s => s.id === 'new-chat'), false);
});

test('normal chat deletion cannot jump into an employee chat', () => {
  const h = harness([{ ...deleted, employeeId: undefined }, { id: 'employee', employeeId: mia.id, updatedAt: 99 }, other]);
  assert.equal(h.currentId, 'other');
  assert.equal(sessionAfterDelete({ ...deleted, employeeId: undefined }, [{ id: 'employee', employeeId: mia.id, updatedAt: 99 }]), undefined);
});
