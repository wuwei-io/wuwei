import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getLang} from '../desktop/renderer/src/i18n.ts';
test('first run respects system language and explicit choice, never timezone',()=>{
 const oldNav=Object.getOwnPropertyDescriptor(globalThis,'navigator');const oldStore=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 try {
  let saved=null;Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>saved}});
  for(const [language,expected] of [['en-US','en'],['zh-CN','zh'],['zh-TW','zh'],['de-DE','en'],['ru-RU','en'],['ja-JP','en'],['','en']]){
   Object.defineProperty(globalThis,'navigator',{configurable:true,value:{language}});assert.equal(getLang(),expected);
  }
  saved='zh';assert.equal(getLang(),'zh');saved='en';assert.equal(getLang(),'en');
  const source=readFileSync('desktop/renderer/src/i18n.ts','utf8');assert.doesNotMatch(source.slice(0,source.indexOf('export function setLang')),/timeZone/);
 } finally {for(const [key,d] of [['navigator',oldNav],['localStorage',oldStore]]){if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key];}}
});
test('language can be changed before signing in from both login surfaces',()=>{
 const source=readFileSync('desktop/renderer/src/App.tsx','utf8');
 const intro=source.slice(source.indexOf('function LoginIntroModal'),source.indexOf('function WuweiLoginModal'));
 const form=source.slice(source.indexOf('function WuweiLoginModal'),source.indexOf('function WuweiLoginModal')+23000);
 assert.match(intro,/aria-label="Language \/ 语言"/);assert.match(form,/aria-label="Language \/ 语言"/);
 assert.match(source,/<WuweiLoginModal[\s\S]*?onLang=\{changeLang\}/);
});
