import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
test('the actual desktop preload delivers queue events and exposes the read-only snapshot IPC',async()=>{
 const emitter=new EventEmitter();const calls=[];let api;
 globalThis.backgroundPreloadFixture={contextBridge:{exposeInMainWorld(_name,value){api=value;}},ipcRenderer:{
  on:(...args)=>emitter.on(...args),removeListener:(...args)=>emitter.removeListener(...args),
  invoke:async(...args)=>{calls.push(args);return [];},send(){},
 }};
 try{
  const result=await build({entryPoints:['desktop/preload/index.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'mock-electron',setup(b){
   b.onResolve({filter:/^electron$/},()=>({path:'electron',namespace:'fixture'}));
   b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const contextBridge=globalThis.backgroundPreloadFixture.contextBridge;export const ipcRenderer=globalThis.backgroundPreloadFixture.ipcRenderer;'}));
  }}]});
  const module={exports:{}};new Function('module','exports','require',result.outputFiles[0].text)(module,module.exports,require);
  const seen=[];const off=api.onEvent((channel,payload)=>seen.push({channel,payload}));
  emitter.emit('evt:background-queue',{}, {taskId:'one',queued:true,limit:2,tier:'pro'});
  assert.deepEqual(seen,[{channel:'evt:background-queue',payload:{taskId:'one',queued:true,limit:2,tier:'pro'}}]);
  await api.backgroundTasks();assert.deepEqual(calls,[['background:tasks']]);
  off();assert.equal(emitter.listenerCount('evt:background-queue'),0);
 }finally{delete globalThis.backgroundPreloadFixture;}
});
