import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectAnnouncementLocale } from '../desktop/renderer/src/components/announcementLocale.js';
import { parseAnnouncementBody } from '../desktop/renderer/src/components/announcementContent.js';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/announcement-current.json', import.meta.url), 'utf8'));
test('raw bilingual announcement switches without mutation, including both feature icons and notice', () => {
 const original = JSON.stringify(fixture);
 for (const lang of ['zh','en','zh']) {
  const selected = selectAnnouncementLocale(fixture, lang);
  assert.equal(selected.lang, lang);
  assert.equal(selected.title, lang === 'en' ? fixture.titleEn : fixture.titleZh);
  assert.equal(selected.body, lang === 'en' ? fixture.bodyEn : fixture.bodyZh);
  const parsed = parseAnnouncementBody(selected.body);
  assert.equal(parsed.kind, 'cards');
  if (parsed.kind === 'cards') {
   assert.deepEqual(parsed.cards.map(c => c.icon), ['company','image']);
   assert.ok(parsed.notice.includes('1.7.44'));
  }
 }
 assert.equal(JSON.stringify(fixture), original);
});
test('incomplete translation falls back as a pair with matching shell language', () => {
 assert.deepEqual(selectAnnouncementLocale({titleZh:'标题',bodyZh:'正文',titleEn:'Title'},'en'), {lang:'zh',title:'标题',body:'正文'});
 assert.deepEqual(selectAnnouncementLocale({titleEn:'Title',bodyEn:'Body'},'zh'), {lang:'en',title:'Title',body:'Body'});
});
