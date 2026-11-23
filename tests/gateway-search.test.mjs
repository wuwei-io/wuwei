import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import {ALL_TOOLS} from '../src/tools/index.ts';
const search=ALL_TOOLS.find(tool=>tool.name==='web_search');

for(const model of ['qwen3-4b-local-trial','openrouter-auto-free','glm-4.7-flash','paid-model']){
 for(const token of ['', 'anon-test-device', 'test-signed-in-token']){
  test(model+' uses gateway first with '+(token||'guest'),async t=>{
   const previous=globalThis.wuweiGwToken,oldModel=process.env.MINICC_MODEL;
   globalThis.wuweiGwToken=()=>token;process.env.MINICC_MODEL=model;const calls=[];
   t.mock.method(globalThis,'fetch',async(url,init)=>{calls.push({url,init});return Response.json({results:[{title:'杭州天气',url:'https://weather.example/hangzhou',content:'杭州天气预报'}]});});
   try{
    const result=await search.run({query:'杭州天气'},{cwd:process.cwd()});
    assert.equal(result.isError,undefined);assert.match(result.content,/weather.example/);assert.equal(calls.length,1);
    assert.equal(new URL(calls[0].url).hostname,'gw.wuweiai.io');
    assert.equal(calls[0].init.headers.Authorization,token&&!token.startsWith('anon-')?'Bearer '+token:undefined);
    assert.ok(calls[0].init.signal instanceof AbortSignal);
   }finally{if(previous===undefined)delete globalThis.wuweiGwToken;else globalThis.wuweiGwToken=previous;if(oldModel===undefined)delete process.env.MINICC_MODEL;else process.env.MINICC_MODEL=oldModel;}
  });
 }
}
test('an already cancelled search does not contact any source',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('unexpected');});
 const controller=new AbortController();controller.abort();
 const result=await search.run({query:'AI news'},{cwd:process.cwd(),signal:controller.signal});
 assert.equal(calls,0);assert.equal(result.isError,true);
});
test('public fallbacks reject global-business noise for AI news and require the weather location',()=>{
 const source=fs.readFileSync(new URL('../src/tools/index.ts',import.meta.url),'utf8');
 const ast=ts.createSourceFile('tools.ts',source,ts.ScriptTarget.Latest,true);
 const fn=ast.statements.find(node=>node.name?.text==='looksRelevant').getText(ast);
 const context={};vm.createContext(context);
 vm.runInContext(ts.transpileModule(fn+';globalThis.check=looksRelevant;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 const row=(title,url='https://example.invalid')=>[{title,url,snippet:title}];
 assert.equal(context.check('全球最新AI新闻',row('全球快遞 | 台北即時快遞','https://www.global-business.com.tw/')),false);
 assert.equal(context.check('全球最新AI新闻',row('全球人壽','https://www.transglobe.com.tw/')),false);
 assert.equal(context.check('全球最新AI新闻',row('AI 新模型发布')),true);
 assert.equal(context.check('杭州今天天气',row('杭州天气预报')),true);
 assert.equal(context.check('杭州今天天气',row('北京天气预报')),false);
});
