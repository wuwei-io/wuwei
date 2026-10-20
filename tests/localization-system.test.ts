import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { getLanguages, localizeStoredText, normalizeLanguage, registerLanguagePack, setCurrentLanguage, subscribeLanguage, tr } from '../src/localization/index.js';
import { makeT } from '../desktop/renderer/src/i18n.js';
import { LanguageSwitcher } from '../desktop/renderer/src/components/LanguageSwitcher.js';
import { catalogModelChoices } from '../src/model-selection.js';
import { researchToolLabel } from '../desktop/renderer/src/toolLabel.js';
import { localizeToolMetadata } from '../src/localization/tools.js';
import toolMessages from './fixtures/builtin-tool-messages.json';
import { localizeModelBadge } from '../src/model-badge.js';

test('system message snapshots follow the chosen language while unknown/user data stays data', () => {
  const key = 'ui.app.guest.free.quota.used.up.today.6a44a62';
  const zh = tr(key, {}, 'zh');
  assert.match(zh, /今日/);
  assert.equal(localizeStoredText(zh, 'en'), tr(key, {}, 'en'));
  const countKey = 'ui.app.context.compacted.messages.3f22c22';
  const values = { p0: 40, p1: 12 };
  assert.equal(localizeStoredText(tr(countKey, values, 'zh'), 'en'), tr(countKey, values, 'en'));
  assert.equal(localizeStoredText('用户自定义的聊天内容和项目名称', 'en'), '用户自定义的聊天内容和项目名称');
});

test('a third locale is registered, selectable, interpolated and falls back to English', () => {
  const old = process.env.WUWEI_LANG;
  let notifications = 0;
  const stop = subscribeLanguage(() => notifications++);
  try {
    registerLanguagePack({ meta: {code:'ar',name:'Arabic',nativeName:'العربية',direction:'rtl',fallback:'en'}, messages: { 'language.choose':'اللغة', 'image.authorization.authorize':'السماح بـ {amount} عملة', 'model.badge.10':'رؤية' } });
    assert.equal(normalizeLanguage('ar-SA'), 'ar');
    setCurrentLanguage('ar');
    assert.equal(tr('language.choose'), 'اللغة');
    assert.equal(tr('image.authorization.authorize', {amount:18}), 'السماح بـ 18 عملة');
    assert.equal(tr('err.dailyCap'), tr('err.dailyCap', {}, 'en'));
    assert.equal(makeT('ar')('missing.optional.key', ''), '');
    assert.equal(getLanguages().find(language => language.code === 'ar')?.direction, 'rtl');
    assert.equal(localizeModelBadge('识图/Vision', 'ar'), 'رؤية');
    const markup = renderToStaticMarkup(React.createElement(LanguageSwitcher,{language:'ar',onChange:()=>{}}));
    assert.match(markup, /value="ar"/);
    assert.match(markup, /العربية/);
    assert.ok(notifications >= 2);
  } finally { stop(); if (old == null) delete process.env.WUWEI_LANG; else process.env.WUWEI_LANG = old; }
});

test('explicit tool-label locale works independently of the process default', () => {
  assert.match(researchToolLabel('web_search', {query:'example'}, 'en'), /Searching/);
  assert.match(researchToolLabel('web_search', {query:'example'}, 'zh'), /搜索/);
});

test('hosted catalogs without English labels use identifiers and preserve custom connection names', () => {
  const provider = {id:'hosted',hosted:true,sort:1,label:'未翻译平台名称',models:[{id:'example-model',label:'未翻译模型名称',free:false}]};
  const [hosted] = catalogModelChoices([provider], '');
  assert.equal(hosted.labelEn, 'example-model');
  assert.equal(hosted.connectionLabel, 'hosted');
  const [custom] = catalogModelChoices([{...provider,hosted:false}], '');
  assert.equal(custom.connectionLabel, provider.label);
});

test('every built-in tool description and parameter is localized without changing schema data', () => {
  assert.ok(toolMessages.length >= 50);
  for (const entry of toolMessages) {
    const tool = { name: entry.name, description: tr(entry.descriptionKey, {}, 'zh'), inputSchema: {type:'object',properties:Object.fromEntries(Object.entries(entry.parameters).map(([name,key])=>[name,{type:'string',description:tr(key,{},'zh'),enum:['stable_machine_key']}]))} };
    const english = localizeToolMetadata(tool,'en');
    assert.doesNotMatch(english.description, /[\u3400-\u9fff]/, entry.name);
    const schema = english.inputSchema as {type:string;properties:Record<string,{description:string;enum:string[]}>};
    assert.equal(schema.type,'object');
    for (const field of Object.values(schema.properties)) {
      assert.doesNotMatch(field.description,/[\u3400-\u9fff]/,entry.name);
      assert.deepEqual(field.enum,['stable_machine_key']);
    }
    assert.equal(localizeToolMetadata(english,'zh').description,tool.description);
  }
});
