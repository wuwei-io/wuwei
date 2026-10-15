import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual IPC handler with isolated authentication/settings doubles.
const file = new URL('../desktop/main/index.ts', import.meta.url);
const source = ts.createSourceFile(file.pathname, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
let handler;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'ipcMain.handle' && node.arguments[0]?.text === 'account:codex-login') handler = node.arguments[1].getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(handler, 'Codex authorization handler must exist');
const code = ts.transpileModule(`(${handler})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
for (const [name,settings,result,refresh] of [
  ['value selection survives successful authorization',{providerId:'wuwei-mimo',kind:'openai',model:'mimo-v2.6-flash'},true,0],
  ['cancelled authorization keeps selection',{providerId:'wuwei-mimo',kind:'openai',model:'mimo-v2.6-flash'},false,0],
  ['an existing explicit Codex selection refreshes credentials',{providerId:'codex',kind:'codex',model:'chosen-codex-model'},true,1],
  ['missing settings cannot select a premium model',null,true,0],
]) test(name, async () => {
  let initialized=0,writes=0;
  const fn=vm.runInNewContext(code,{log(){},codexOAuthLogin:async()=>result,loadSettings:()=>settings,saveSettings:()=>{writes++},initProvider:()=>{initialized++},send(){},emitAccount:async()=>{},backendLabel:'QA',modelLabel:'QA',cwd:'QA',subFlag:true,ctxWindow:128000});
  assert.equal(await fn(),result);assert.equal(writes,0);assert.equal(initialized,refresh);
});
