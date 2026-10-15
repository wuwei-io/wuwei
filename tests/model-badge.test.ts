import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localizeModelBadge } from '../src/model-badge.js';
test('capability badges show one language while preserving pending support and context', () => {
  const badge = '图片/Image · 视频待接/Video pending · 音频待接/Audio pending · 1M';
  assert.equal(localizeModelBadge(badge,'en'),'Image · Video pending · Audio pending · 1M');
  assert.equal(localizeModelBadge(badge,'zh'),'图片 · 视频待接 · 音频待接 · 1M');
  assert.equal(localizeModelBadge('Preview · 262K','en'),'Preview · 262K');
  assert.equal(localizeModelBadge('省 · 识图 · new','en'),'Value · Vision · New');
  assert.equal(localizeModelBadge('new','zh'),'最新');
  assert.equal(localizeModelBadge('未翻译标记 · 1M','en'),'1M');
});
