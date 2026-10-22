import { withBackgroundTask } from '../../src/agent/background.js';
import { randomUUID } from 'node:crypto';
import type { BackgroundTaskEntry } from '../../src/billing/background-tasks.js';
const tasks=new Map<string,BackgroundTaskEntry>();
export const getBackgroundTasks=()=>Array.from(tasks.values(),value=>({...value}));

export function runBackgroundTask<T>(id:string,send:(channel:string,payload?:unknown)=>void,run:()=>Promise<T>,roomId?:string,label?:string,sourceSid?:string):Promise<T>{
 const taskId=randomUUID();
 let heartbeat:ReturnType<typeof setInterval>|undefined;
 return withBackgroundTask({id,onQueue:(queued,limit,tier,accountId)=>{
  const previous=tasks.get(taskId);
  if(!previous && limit==null)return;
  const entry:BackgroundTaskEntry={...previous,taskId,sid:roomId?undefined:id,roomId,label,sourceSid,queued,
   ...(limit!=null?{limit}:{}),...(tier?{tier}:{}),...(accountId!==undefined?{accountId}:{})};
  tasks.set(taskId,entry);send('evt:background-queue',entry);
  if(!roomId && queued){
   send('evt:heartbeat',{sid:id});
   heartbeat??=setInterval(()=>send('evt:heartbeat',{sid:id}),25000);
  }else if(heartbeat){clearInterval(heartbeat);heartbeat=undefined;}
 }},async()=>{try{return await run();}finally{
  if(heartbeat)clearInterval(heartbeat);
  const entry=tasks.get(taskId);tasks.delete(taskId);
  if(entry)send('evt:background-queue',{...entry,queued:false,finished:true});
 }});
}
