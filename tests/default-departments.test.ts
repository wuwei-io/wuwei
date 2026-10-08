import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { defaultDepartments, departmentLabel, departmentNameFromInput } from '../src/team/default-departments.js';
import { BUILTIN_APPS } from '../desktop/main/team/catalog.js';

const app = BUILTIN_APPS[0];
const employees = app.employees.map(e => ({ ...e, fromApp: app.id }));

test('default organization assigns all six stable employee IDs once and shows both languages', () => {
  const departments = defaultDepartments(employees)!;
  assert.deepEqual(departments.map(d => d.name), ['CEO办公室', '技术部', '设计部', '综合部']);
  assert.deepEqual(departments.map(d => departmentLabel(d, 'en')), ['CEO Office', 'Engineering', 'Design', 'General Affairs']);
  assert.deepEqual(departments.map(d => d.memberIds).flat().sort(), employees.map(e => e.id).sort());
  assert.deepEqual(departments.map(d => d.headId), ['wj-ceo', 'wj-code', 'wj-design', undefined]);
  assert.equal(defaultDepartments(employees.slice(1)), undefined);
  assert.equal(defaultDepartments(employees.map(e => ({ ...e, fromApp: 'custom' }))), undefined);
});

test('department display and unchanged English save preserve canonical names; custom names survive switches', () => {
  const original = { name: '技术部' };
  assert.equal(departmentNameFromInput(original, departmentLabel(original, 'en'), 'en'), '技术部');
  assert.equal(departmentNameFromInput(original, 'Platform Engineering', 'en'), 'Platform Engineering');
  assert.equal(departmentLabel({ name: 'Platform Engineering' }, 'zh'), 'Platform Engineering');
  assert.equal(departmentLabel({ name: 'Test Department' }, 'en'), 'Test Department');
  assert.deepEqual(original, { name: '技术部' });
});

test('installation initializes once, keeps edits on reinstall and sync, and respects explicitly empty departments', async () => {
  const dirName = '.wuwei-departments-test-' + process.pid + '-' + Date.now();
  process.env.WUWEI_DATA_DIR_NAME = dirName;
  const store = await import('../desktop/main/team/store.js');
  const root = join(homedir(), dirName);
  try {
    store.installApp(app);
    const initial = store.loadDepartments();
    assert.equal(initial.length, 4);
    store.updateDepartment(initial[0].id, { name: 'My office', memberIds: ['wj-ceo', 'wj-copy'] });
    const customized = store.loadDepartments();
    store.installApp(app);
    store.syncBuiltinApp(app);
    assert.deepEqual(store.loadDepartments(), customized);
    store.saveTeamConfig({ departments: [] });
    store.installApp(app);
    store.syncBuiltinApp(app);
    assert.deepEqual(store.loadDepartments(), []);
    // Same-version installed packs without department settings migrate without modifying people.
    store.saveTeamConfig({ departments: undefined });
    const before = store.loadEmployees();
    assert.equal(store.syncBuiltinApp(app), 0);
    assert.deepEqual(store.loadDepartments(), initial);
    assert.deepEqual(store.loadEmployees(), before);
    // Existing user-created departments with generated people IDs are kept verbatim.
    const existing = [{ id: 'user-dept', name: 'CEO办公室', headId: 'user-ceo', memberIds: ['user-ceo'], order: 9 }];
    store.saveTeamConfig({ departments: existing });
    store.syncBuiltinApp(app);
    assert.deepEqual(store.loadDepartments(), existing);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
