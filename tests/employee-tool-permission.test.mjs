import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldAutoApproveToolPermission } from '../desktop/renderer/src/tool-permission-policy.ts';

const permission = sid => ({ toolPermission: { name: 'powershell', sid } });
test('employee PowerShell permissions advance in automatic and smart-continue modes', () => {
  for (const mode of ['auto', 'cont']) {
    assert.equal(shouldAutoApproveToolPermission(permission('employee-origin'), { 'employee-origin': mode }, new Set()), true);
  }
  assert.equal(shouldAutoApproveToolPermission(permission('room-origin'), {}, new Set()), true);
});
test('manual origin remains manual even while another automatic conversation is selected', () => {
  const modes = { 'employee-origin': 'manual', 'selected-tab': 'auto' };
  assert.equal(shouldAutoApproveToolPermission(permission('employee-origin'), modes, new Set()), false);
  assert.equal(shouldAutoApproveToolPermission(permission('employee-origin'), modes, new Set(['powershell'])), true);
});
test('paid, business and remote decisions without native local permission metadata still wait', () => {
  const modes = { 'selected-tab': 'auto' };
  for (const event of [{}, { title: '是否允许电脑执行 powershell？', risk: 'high' }, { toolPermission: { name: 'powershell', sid: '' } }]) {
    assert.equal(shouldAutoApproveToolPermission(event, modes, new Set(['powershell'])), false);
  }
});
