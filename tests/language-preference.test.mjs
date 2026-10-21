import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildSync} from 'esbuild';
import {Agent} from '../src/agent/loop.ts';
import {systemPrompt} from '../src/agent/prompt.ts';
import {getLanguages,setCurrentLanguage,tr,normalizeLanguage} from '../src/localization/index.ts';

test('system mode follows OS changes; explicit preferences persist and RTL initializes before rendering',()=>{
  const code=buildSync({entryPoints:['src/localization/index.ts'],bundle:true,format:'cjs',platform:'browser',write:false}).outputFiles[0].text;
  const data=new Map(),events={},context={exports:{},module:{exports:{}},window:{},navigator:{language:'ja-JP'},localStorage:{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)},document:{documentElement:{lang:'',dir:''}},addEventListener:(event,fn)=>events[event]=fn};
  vm.runInNewContext(code,context);const api=context.module.exports;
  assert.equal(api.getLanguagePreference(),'system');assert.equal(api.getCurrentLanguage(),'ja');assert.equal(context.document.documentElement.lang,'ja');assert.equal(data.size,0);
  context.navigator.language='fa-IR';events.languagechange();assert.equal(api.getCurrentLanguage(),'fa');assert.equal(context.document.documentElement.dir,'rtl');
  api.setCurrentLanguage('ru');context.navigator.language='ko-KR';events.languagechange();assert.equal(api.getCurrentLanguage(),'ru');assert.equal(data.get('wuwei_lang'),'ru');
  api.setCurrentLanguage('system');assert.equal(api.getCurrentLanguage(),'ko');assert.equal(data.get('wuwei_lang'),'system');
  api.setSystemLanguage('vi-VN');assert.equal(api.getCurrentLanguage(),'vi');
  assert.equal(api.normalizeLanguage('pt-PT'),'pt-BR');assert.equal(api.normalizeLanguage('zh-Hant-TW'),'zh');assert.equal(api.normalizeLanguage('unknown'),'en');
  const fresh={exports:{},module:{exports:{}},window:{wuwei:{systemLanguage:'ja-JP',languagePreference:'ru'}},navigator:{language:'ja-JP'},localStorage:{getItem:()=>null},document:{documentElement:{lang:'',dir:''}}};
  vm.runInNewContext(code,fresh);assert.equal(fresh.document.documentElement.lang,'ru');
});

test('all 18 packs resolve system prompts, interpolation and native metadata locally',()=>{
  const languages=getLanguages();assert.equal(languages.length,18);
  for(const locale of languages){
    assert.equal(normalizeLanguage(locale.code),locale.code);assert.equal(locale.complete,true);
    const prompt=systemPrompt('/tmp/qa','qa-model',locale.code);
    assert.ok(prompt.includes('/tmp/qa')&&prompt.includes('qa-model'),locale.code);
    assert.ok(!/ZXQPH|\{cwd\}|\{model\}|\uFFFD/.test(prompt),locale.code);
    const policy=tr('language.replyPolicy',{language:locale.nativeName},locale.code);
    assert.ok(policy.includes(locale.nativeName),locale.code);assert.ok(!policy.includes('{language}'),locale.code);
  }
});

test('an existing conversation uses the selected response language on its next request, including custom prompts',async()=>{
  const old=process.env.WUWEI_LANG,requests=[];
  const provider={name:'openai',complete:async(system,messages)=>{requests.push({system,messages:structuredClone(messages)});return {content:[{type:'text',text:'QA reply'}],stopReason:'end_turn'};}};
  try{
    const agent=new Agent(provider,'User-owned custom prompt',[],{cwd:'.'},new Map(),{compactThreshold:0});
    for(const language of ['ru','ja','fa','en','zh']){setCurrentLanguage(language);await agent.send('Original user content',{});}
    for(const [index,language] of ['ru','ja','fa','en','zh'].entries()){
      const locale=getLanguages().find(locale=>locale.code===language),request=requests[index];
      assert.ok(request.system.startsWith('User-owned custom prompt\n\n'));
      const policy=tr('language.replyPolicy',{language:locale.nativeName},language);
      assert.ok(request.system.endsWith(policy),language);
      assert.equal(request.system.split(policy).length,2);
      assert.equal(request.messages.filter(message=>message.role==='user').length,index+1);
      assert.ok(request.messages.filter(message=>message.role==='user').every(message=>message.content[0].text==='Original user content'));
    }
  }finally{if(old==null)delete process.env.WUWEI_LANG;else process.env.WUWEI_LANG=old;}
});
