import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {BASIC_TOOL_NAMES, TOOL_CATEGORIES, groupBuiltinTools} from '../src/tools/catalog.ts';
import {disabledToolNames, selectEnabledTools} from '../src/agent/input-controls.ts';
import {catalogModelChoices} from '../src/model-selection.ts';

const builtin = JSON.parse(fs.readFileSync(new URL('./fixtures/builtin-tool-messages.json', import.meta.url), 'utf8'));
const names = [...new Set([...builtin.map(tool=>tool.name), 'browser_open','browser_read','browser_click'])];
const tools = names.map(name=>({name}));

test('all built-in tools are classified exactly once and the eleven basics come first',()=>{
  const groups = groupBuiltinTools(tools);
  assert.deepEqual(groups.map(group=>group.id), TOOL_CATEGORIES);
  assert.equal(new Set(groups.flatMap(group=>group.tools.map(tool=>tool.name))).size,tools.length);
  assert.equal(groups.reduce((sum,group)=>sum+group.tools.length,0),tools.length);
  assert.deepEqual(groups[0].tools.slice(0,11).map(tool=>tool.name),BASIC_TOOL_NAMES);
  assert.deepEqual(groups.find(group=>group.id==='vision').tools.map(tool=>tool.name),['send_image']);
  assert.deepEqual(groups.find(group=>group.id==='schedule').tools.map(tool=>tool.name).sort(),['create_schedule','delete_schedule','list_schedules']);
  assert.ok(groups.find(group=>group.id==='chrome').tools.every(tool=>tool.name.startsWith('chrome_')));
});

test('fresh settings expose only the basic tools; global and memory toggles are respected',()=>{
  assert.deepEqual(selectEnabledTools(tools).map(tool=>tool.name).sort(), [...BASIC_TOOL_NAMES].sort());
  assert.equal(selectEnabledTools(tools,{memoryEnabled:false}).length,10);
  assert.equal(selectEnabledTools(tools,{toolsEnabled:false}).length,0);
  assert.equal(selectEnabledTools([...tools,{name:'mcp__sample_tool'}]).length,11);
});

test('saved choices and explicit enable-all survive the default change',()=>{
  assert.equal(selectEnabledTools(tools,{disabledTools:[]}).length,tools.length);
  const selected = new Set([...BASIC_TOOL_NAMES,'codex_imagegen','chrome_tabs']);
  const controls = {disabledTools:tools.filter(tool=>!selected.has(tool.name)).map(tool=>tool.name)};
  assert.deepEqual(new Set(selectEnabledTools(tools,controls).map(tool=>tool.name)),selected);
});

test('enabling one optional tool from defaults does not accidentally enable everything',()=>{
  const disabled = new Set(disabledToolNames(tools,{}));
  disabled.delete('codex_imagegen');
  const selected = selectEnabledTools(tools,{disabledTools:[...disabled]});
  assert.equal(selected.length,12);
  assert.ok(selected.some(tool=>tool.name==='codex_imagegen'));
  assert.ok(!selected.some(tool=>tool.name==='computer_click'));
});

test('system prompt composition omits vault guidance while keeping memory and interaction notes',()=>{
  const source = fs.readFileSync(new URL('../desktop/main/index.ts',import.meta.url),'utf8');
  const ast = ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
  const fn = ast.statements.find(node=>node.name?.text==='buildSysPromptParts').getText(ast);
  const context = {loadSettings:()=>({app:{lang:'zh'},systemPrompt:'custom',secretsPrompt:'must not be injected'}),
    detectSysLang:()=> 'zh',desktopTools:()=>[{name:'remember'},{name:'ask_user'}],
    renderPrompt:text=>text,systemPrompt:()=> 'default',loadMemory:()=> 'remembered preference',
    brainAvailable:()=>false,tr:key=>key,secrets:{secretsSystemNote:()=>{throw Error('Vault note must not be read');}}};
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(fn+';globalThis.parts=buildSysPromptParts("cwd","model");',{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None},
  }).outputText,context);
  assert.deepEqual(Array.from(context.parts,part=>part.id),['base','memoryTool','memory','interaction']);
});

test('Qwen display names lose the trial suffix without changing IDs or other models',()=>{
  const models=[{id:'qwen3-4b-local-trial',label:'Qwen3 4B · Free Trial',labelEn:'Qwen3 4B · Free trial',free:true},
    {id:'another-free',label:'Another Free Trial',free:true}];
  const choices=catalogModelChoices([{id:'wuwei-free',hosted:true,sort:0,label:'Free',models}],'');
  assert.equal(choices[0].label,'Qwen3 4B');
  assert.equal(choices[0].labelEn,'Qwen3 4B');
  assert.equal(choices[0].modelId,'qwen3-4b-local-trial');
  assert.equal(choices[1].label,'Another Free Trial');
});
