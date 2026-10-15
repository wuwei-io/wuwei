import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEnvFromSettings } from '../desktop/main/settings.ts';
import { loadConfig } from '../src/config.ts';

const keys = ['MINICC_PROVIDER','MINICC_MODEL','MINICC_OAUTH_TOKEN','MINICC_BASE_URL','MINICC_API_KEY','ANTHROPIC_API_KEY','MINICC_VISION','MINICC_NO_TOOLS','MINICC_EFFORT','WUWEI_LANG'];
function isolatedEnv(fn) {
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try { fn(); } finally { for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } }
}
test('missing or incomplete desktop configuration never infers Claude from local credentials', () => isolatedEnv(() => {
  for (const settings of [null, {}, {kind:'anthropic-oauth', providerId:'claude-oauth'}, {model:'old-model'}]) {
    process.env.ANTHROPIC_API_KEY = 'fake-only'; process.env.MINICC_OAUTH_TOKEN = 'fake-only';
    applyEnvFromSettings(settings);
    const cfg = loadConfig(); assert.equal(cfg.provider, 'openai'); assert.equal(cfg.model, 'openrouter-auto-free');
    assert.equal(cfg.baseUrl, 'https://gw.wuweiai.io/api/gateway/v1'); assert.equal(cfg.oauthToken, '');
  }
}));
test('explicit Claude integration retains a selected model but has no implicit premium fallback', () => isolatedEnv(() => {
  applyEnvFromSettings({kind:'anthropic-apikey',providerId:'anthropic',model:'manually-selected-model',apiKey:'fake-only'});
  assert.equal(loadConfig().model, 'manually-selected-model');
  delete process.env.MINICC_MODEL;
  assert.throws(() => loadConfig(), /Select a model explicitly/);
}));
test('Codex credentials do not imply a default model', () => isolatedEnv(() => {
  applyEnvFromSettings({kind:'codex',providerId:'codex',model:'explicit-codex-model'});
  assert.equal(loadConfig().model, 'explicit-codex-model');
  delete process.env.MINICC_MODEL;
  assert.throws(() => loadConfig(), /Select a model explicitly for the Codex/);
}));
