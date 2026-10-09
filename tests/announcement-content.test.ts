import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnnouncementMarkdown } from '../desktop/renderer/src/components/AnnouncementMarkdown.js';
import { parseAnnouncementBody, splitAnnouncementHeading, safeAnnouncementUrl } from '../desktop/renderer/src/components/announcementContent.js';
const current = JSON.parse(readFileSync(new URL('./fixtures/announcement-current.json', import.meta.url), 'utf8'));
test('real title version with colon; timestamp never used as product version', () => {
  assert.equal(splitAnnouncementHeading(current.titleZh, current.version).version, 'v1.7.44');
  assert.equal(splitAnnouncementHeading('普通公告', current.version).version, '');
  assert.equal(splitAnnouncementHeading('更新 (v2.3.4)').version, 'v2.3.4');
});
test('latest real bilingual announcement: two cards plus intact trailing notice', () => {
  for (const lang of ['Zh', 'En']) {
    const parsed = parseAnnouncementBody(current['body' + lang]);
    assert.equal(parsed.kind, 'cards');
    if (parsed.kind !== 'cards') return;
    assert.equal(parsed.cards.length, 2);
    assert.ok(parsed.notice.includes('1.7.44'));
    assert.equal(parsed.cards[0].summary, current['body' + lang].split('\n\n')[0].split('\n').slice(1).join('\n'));
  }
});
test('Markdown sections preserve list lines, details, intro and notice', () => {
  const parsed = parseAnnouncementBody('摘要\n\n## 团队\n**重点**\n- 第一项\n- 第二项\n\n更多说明\n\n## 生图\n[入口](https://wuweiai.io)\n\n---\n请重启');
  assert.equal(parsed.kind, 'cards');
  if (parsed.kind !== 'cards') return;
  assert.equal(parsed.intro, '摘要');
  assert.ok(parsed.cards[0].summary.includes('\n- 第一项\n- 第二项'));
  assert.equal(parsed.cards[0].details, '更多说明');
  assert.equal(parsed.notice, '请重启');
});
test('ordinary notices remain readable; lists are not legacy cards', () => {
  assert.equal(parseAnnouncementBody('今晚维护。\n请保存。\n\n谢谢。').kind, 'plain');
  assert.equal(parseAnnouncementBody('- a\n- b\n\n- c\n- d').kind, 'plain');
});
test('safe rendering supports formatting without raw HTML, dangerous links or images', () => {
  const html = renderToStaticMarkup(React.createElement(AnnouncementMarkdown, { children: '### 子标题\n**重点**\n\n- 列表\n\n[安全](https://example.com) [危险](javascript:alert) ![图片](https://example.com/a.png)\n<script>alert(1)</script><iframe src="https://example.com"></iframe>' }));
  assert.ok(html.includes('<strong>重点</strong>'));
  assert.ok(html.includes('<li>列表</li>'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
  assert.ok(!/<(?:script|iframe|img)\b/.test(html));
  assert.ok(!html.includes('javascript:'));
  for (const url of ['data:text/html,x','javascript:alert(1)','//evil.com','file:///tmp/a','https://a\n.com']) assert.equal(safeAnnouncementUrl(url), '');
});
