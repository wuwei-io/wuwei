import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recoverAssistantStep} from '../desktop/renderer/src/assistant-recovery.ts';
const assistant=text=>({type:'assistant',text});
const history=[{type:'user',text:'哈喽'},assistant('哈喽！有什么我可以帮你的吗？'),{type:'user',text:'查询电脑日期'},
 {type:'tool',name:'powershell'},assistant('当前电脑日期是 2026年11月24日。')];

test('repeated retries before any new output preserve every completed answer',()=>{
 let items=[...history,{type:'user',text:'查下今天的杭州天气'}];const original=items;
 for(let attempt=0;attempt<8;attempt++)items=recoverAssistantStep(items,'',assistant);
 assert.strictEqual(items,original);assert.deepEqual(items.slice(0,history.length),history);
});
test('only the partial current reply is removed and later resets cannot reach history',()=>{
 const items=[...history,{type:'user',text:'新消息'},assistant('生成了一半')];
 let next=recoverAssistantStep(items,'',assistant);assert.deepEqual(next,items.slice(0,-1));
 next=recoverAssistantStep(next,'',assistant);assert.deepEqual(next,items.slice(0,-1));
 assert.equal(items.at(-1).text,'生成了一半');
});
test('tool boundaries protect text from an already completed model step',()=>{
 const items=[...history,{type:'user',text:'搜资料'},assistant('我先查一下。'),{type:'tool',name:'web_search',status:'done'}];
 assert.strictEqual(recoverAssistantStep(items,'',assistant),items);
 assert.deepEqual(recoverAssistantStep(items,'干净的新正文',assistant),[...items,assistant('干净的新正文')]);
});
test('replacement keeps the current reply metadata and earlier messages unchanged',()=>{
 const current={type:'assistant',text:'带有工具调用泄漏的文字',ts:123,usage:{input:20}};
 const items=[...history,{type:'user',text:'继续'},current];
 const next=recoverAssistantStep(items,'清理后的正文',assistant);
 assert.deepEqual(next.at(-1),{...current,text:'清理后的正文'});assert.deepEqual(next.slice(0,-1),items.slice(0,-1));
});
test('a recovered nonstreamed reply is created after the current user instead of overwriting history',()=>{
 const items=[...history,{type:'user',text:'日期是什么'}];
 const next=recoverAssistantStep(items,'日期已读取',assistant);
 assert.deepEqual(next,[...items,assistant('日期已读取')]);
});
