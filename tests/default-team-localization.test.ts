import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { editLocalizedEmployeeField, localizeEmployee, localizeTeamApp, resolveEmployee, employeeMentionTargets, employeeRoster, TEAM_TOOL_EN } from '../src/team/default-localization.js';
import { BUILTIN_APPS } from '../desktop/main/team/catalog.js';
import { parseMentions } from '../desktop/main/team/projection.js';
const app = BUILTIN_APPS[0];
const installed = app.employees.map(e => ({ ...e, fromApp: app.id }));
const names = ['Ben', 'Wendy', 'Cody', 'Dana', 'Mia', 'Ivy'];
test('six defaults and pack are English; switching back is lossless and immutable', () => {
  const before = JSON.stringify(installed);
  installed.forEach((e, i) => {
    const en = localizeEmployee(e, 'en');
    assert.equal(en.name, names[i]);
    for (const field of ['name','title','blurb','persona'] as const) assert.doesNotMatch(en[field] || '', /[\u4e00-\u9fff]/);
    assert.equal(localizeEmployee(e, 'zh').name, e.name);
  });
  const en = localizeTeamApp(app, 'en');
  assert.doesNotMatch(en.name + en.desc, /[\u4e00-\u9fff]/);
  assert.deepEqual(en.employees.map(e => e.name), names);
  assert.equal(JSON.stringify(installed), before);
});
test('custom fields, renamed defaults, generated IDs and custom provenance remain untouched', () => {
  const e = installed[1];
  const edited = { ...e, name: 'My writer', title: 'Custom title', persona: 'Custom identity', memory: '历史 memory' };
  assert.deepEqual(localizeEmployee(edited, 'en'), { ...edited, blurb: localizeEmployee(e, 'en').blurb });
  assert.equal(resolveEmployee([edited], 'Wendy'), undefined);
  assert.equal(resolveEmployee([edited], 'My writer')?.id, e.id);
  for (const x of [{ ...e, fromApp: undefined }, { ...e, fromApp: 'custom' }, { ...e, id: 'emp-custom' }]) assert.deepEqual(localizeEmployee(x, 'en'), x);
});
test('canonical, aliases and stable IDs resolve; name or ID collisions fail closed', () => {
  installed.forEach((e, i) => {
    for (const key of [e.id, e.name, names[i], names[i].toLowerCase()]) assert.equal(resolveEmployee(installed, key)?.id, e.id);
  });
  const collision = [...installed, { ...installed[1], id: 'custom', name: 'Wendy', fromApp: undefined }];
  assert.equal(resolveEmployee(collision, 'Wendy'), undefined);
  assert.equal(resolveEmployee(collision, installed[1].id)?.id, installed[1].id);
  assert.equal(resolveEmployee(installed, 'unknown'), undefined);
});
test('English and Chinese mentions route to the same IDs, deduplicate and reject ambiguous aliases', () => {
  const targets = employeeMentionTargets(installed);
  assert.deepEqual(parseMentions('@Wendy @'+installed[1].name, targets).ids, [installed[1].id]);
  assert.equal(parseMentions('@all', targets).ids.length, 6);
  const collision = [...installed, { ...installed[1], id: 'custom', name: 'Wendy', fromApp: undefined }];
  assert.deepEqual(parseMentions('@Wendy', employeeMentionTargets(collision)).ids, []);
});
test('English routing roster and team tool descriptions are English with stable references', () => {
  const roster = employeeRoster(installed, 'en');
  assert.match(roster, /Wendy \[id=wj-copy/);
  for (const name of ['dm_teammate','assign_task','manage_department','manage_group','create_schedule','list_schedules','update_employee','delete_employee']) assert.doesNotMatch(TEAM_TOOL_EN[name], /[\u4e00-\u9fff]/);
});
test('UI edit action keeps canonical record; all exact-name routing surfaces use resolver', () => {
  const ui = readFileSync('desktop/renderer/src/team/AppStore.tsx', 'utf8');
  assert.match(ui, /setEdit\(\{ \.\.\.state\.employees\.find/);
  const main = readFileSync('desktop/main/index.ts', 'utf8');
  for (const old of ['available.find((e) => e.name === name)', 'loadEmployees().find((e) => e.name === employeeName)', 'emps.find((e) => e.name === String(nm']) assert.ok(!main.includes(old));
});
test('existing installed persona files switch at assembly only; custom identity and memory preserved', async () => {
  const dirName = '.wuwei-i18n-test-' + process.pid + '-' + Date.now();
  process.env.WUWEI_DATA_DIR_NAME = dirName;
  const store = await import('../desktop/main/team/store.js');
  const { homedir } = await import('node:os');
  const root = join(homedir(), dirName);
  try {
    store.addEmployees(installed);
    const emp = installed[1];
    const identity = join(root, 'team', 'persona', emp.id, 'IDENTITY.md');
    const original = readFileSync(identity, 'utf8');
    const sys = store.buildEmployeeSystem(emp, 'Current working directory: test', 'existing memory');
    assert.match(sys, /You are Wendy/);
    assert.match(sys, /Reply in English/);
    assert.match(sys, /existing memory/);
    assert.equal(readFileSync(identity, 'utf8'), original);
    writeFileSync(identity, 'User customized identity');
    const custom = store.buildEmployeeSystem(emp, 'Current working directory: test', 'memory');
    assert.match(custom, /User customized identity/);
    assert.equal(readFileSync(identity, 'utf8'), 'User customized identity');
    assert.match(store.buildEmployeeSystem(emp, '当前工作目录: test', ''), new RegExp(emp.name));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('English settings drafts preserve canonical values on unchanged save and real edits stay custom', () => {
  for (const original of installed) {
    let draft = { ...original };
    for (const field of ['name', 'title', 'blurb', 'persona'] as const) {
      draft = editLocalizedEmployeeField(original, draft, field, localizeEmployee(original, 'en')[field] || '', 'en');
    }
    assert.deepEqual(draft, original);
    assert.deepEqual(localizeEmployee(draft, 'zh'), original);
    assert.equal(resolveEmployee([draft], localizeEmployee(original, 'en').name)?.id, original.id);
    const custom = editLocalizedEmployeeField(original, draft, 'name', 'My custom teammate', 'en');
    assert.equal(localizeEmployee(custom, 'zh').name, 'My custom teammate');
    assert.equal(localizeEmployee(custom, 'en').name, 'My custom teammate');
    assert.equal(custom.id, original.id);
    const department = { headId: original.id, memberIds: [original.id] };
    assert.equal(department.memberIds[0], custom.id);
    assert.equal(resolveEmployee([custom], custom.id)?.id, department.headId);
    const persona = editLocalizedEmployeeField(original, draft, 'persona', 'My custom duties', 'en');
    assert.equal(localizeEmployee(persona, 'zh').persona, 'My custom duties');
    assert.equal(localizeEmployee(persona, 'en').persona, 'My custom duties');
  }
});
test('settings render translated drafts and do not persist display objects', () => {
  const source = readFileSync(new URL('../desktop/renderer/src/team/AppStore.tsx', import.meta.url), 'utf8');
  for (const field of ['name', 'title', 'blurb', 'persona']) {
    assert.ok(source.includes('value={display.' + field));
    assert.ok(source.includes('editLocalizedEmployeeField(employee, edit, "' + field + '"'));
  }
  assert.ok(source.includes('name: saveText("name")'));
  assert.ok(source.includes('persona: saveText("persona")'));
});
