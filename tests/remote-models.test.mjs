import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configuredRemoteChannels, resolveRemoteSelection, providerKindForId } from '../desktop/main/remote-models.ts';
test('remote selection separates a configured concrete model from the channel identity and never silently falls back', () => {
  const channels = configuredRemoteChannels({ providerId: 'vendor', kind: 'openai', model: 'current', creds: { vendor: { model: 'stored', customModels: ['extra', 'stored'] }, codex: { model: 'sub-model' } } }, false);
  assert.deepEqual(channels.map(channel => channel.id), ['api-key']);
  assert.equal(resolveRemoteSelection(channels, 'api-key', 'extra').model, 'extra');
  assert.throws(() => resolveRemoteSelection(channels, 'other', 'extra'), /渠道/);
  assert.throws(() => resolveRemoteSelection(channels, 'api-key', 'invented'), /未在/);
  assert.throws(() => resolveRemoteSelection(channels, null, 'extra'), /所属/);
  assert.equal(resolveRemoteSelection(channels, null, null), null);
  assert.equal(resolveRemoteSelection(channels, null, 'api-key').model, 'current');
});

test('configured API channels and employee provider kinds remain distinct from the globally selected subscription', () => {
  const settings = { providerId: 'codex', kind: 'codex', model: 'subscription', creds: { anthropic: { apiKey: 'fixture', model: 'claude' }, vendor: { apiKey: 'fixture', model: 'other' } } };
  const channels = configuredRemoteChannels(settings, false);
  assert.deepEqual(channels.map(ch => [ch.id, ch.defaultModel, ch.providerKind]), [['api-key:anthropic', 'claude', 'anthropic-apikey'], ['api-key:vendor', 'other', 'openai']]);
  assert.equal(providerKindForId('anthropic', settings), 'anthropic-apikey');
  assert.equal(resolveRemoteSelection(channels, 'api-key:vendor', 'other').channel.providerId, 'vendor');
});
