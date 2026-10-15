import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_MODE_KEY, SESSION_MODES_KEY, executionModeFor, readDefaultExecutionMode, readSessionExecutionModes, sessionModesAfterSettingsChange } from '../desktop/renderer/src/execution-mode.ts';

const storage = entries => ({ getItem: key => entries[key] ?? null });

test('fresh installs and legacy mode records leave Auto and Smart-continue disabled', () => {
  for (const entries of [{}, { 'wuwei-mode-by-sid': '{"old-chat":"cont"}', 'wuwei-show-manual': '0' }]) {
    const store = storage(entries);
    assert.equal(readDefaultExecutionMode(store), 'manual');
    assert.deepEqual(readSessionExecutionModes(store), {});
    assert.equal(executionModeFor('old-chat', readSessionExecutionModes(store), readDefaultExecutionMode(store)), 'manual');
  }
});

test('explicit settings persist for new chats, while session pause remains respected', () => {
  const store = storage({ [DEFAULT_MODE_KEY]: 'cont', [SESSION_MODES_KEY]: '{"paused":"auto","approval-required":"manual"}' });
  const modes = readSessionExecutionModes(store);
  const defaultMode = readDefaultExecutionMode(store);
  assert.equal(executionModeFor('new-chat', modes, defaultMode), 'cont');
  assert.equal(executionModeFor('paused', modes, defaultMode), 'auto');
  assert.equal(executionModeFor('approval-required', modes, defaultMode), 'manual');
  modes['new-chat'] = 'manual';
  assert.equal(executionModeFor('new-chat', modes, defaultMode), 'manual');
});

test('corrupt settings fail closed instead of granting automatic permissions', () => {
  for (const raw of ['null', '[]', '{', '"auto"']) {
    assert.deepEqual(readSessionExecutionModes(storage({ [SESSION_MODES_KEY]: raw })), {});
  }
  assert.equal(readDefaultExecutionMode(storage({ [DEFAULT_MODE_KEY]: 'enabled' })), 'manual');
  assert.deepEqual(readSessionExecutionModes(storage({ [SESSION_MODES_KEY]: '{"a":"auto","b":"cont","c":true,"d":"bad"}' })), { a: 'auto', b: 'cont' });
  assert.equal(executionModeFor('constructor', {}), 'manual');
});

test('changing this chat and future defaults leaves other existing chats unchanged', () => {
  const modes = sessionModesAfterSettingsChange('current', 'cont', ['current', 'waiting', 'running'], { running:'auto' }, 'manual');
  assert.equal(executionModeFor('current', modes, 'cont'), 'cont');
  assert.equal(executionModeFor('new-chat', modes, 'cont'), 'cont');
  assert.equal(executionModeFor('waiting', modes, 'cont'), 'manual');
  assert.equal(executionModeFor('running', modes, 'cont'), 'auto');
  const disabled = sessionModesAfterSettingsChange('current', 'manual', ['current', 'another'], { ...modes, another:'cont' }, 'cont');
  assert.equal(executionModeFor('current', disabled, 'manual'), 'manual');
  assert.equal(executionModeFor('another', disabled, 'manual'), 'cont');
});
