import {useEffect,useState} from 'react';
import {applyBackgroundTaskEvent,type BackgroundTaskEvent,type BackgroundTasks} from '../../../../src/billing/background-tasks.js';

export function useBackgroundTasks(){
 const [tasks,setTasks]=useState<BackgroundTasks>({});
 useEffect(()=>{
  let live=true;let syncing=false;let timer:ReturnType<typeof setTimeout>|undefined;
  const updates:BackgroundTaskEvent[]=[];
  const refresh=async()=>{
   if(!live||syncing||!window.wuwei.backgroundTasks)return;
   if(timer)clearTimeout(timer);
   syncing=true;updates.length=0;
   try{
    const snapshot=await window.wuwei.backgroundTasks();
    if(!live||!Array.isArray(snapshot))return;
    let initial:BackgroundTasks={};
    for(const task of snapshot)initial=applyBackgroundTaskEvent(initial,task);
    // Replay events received while IPC was pending, so an older snapshot cannot
    // restore a finished task or turn an admitted task back into a queued task.
    for(const event of updates)initial=applyBackgroundTaskEvent(initial,event);
    setTasks(initial);
   }catch{/* Keep real-time events if a snapshot is temporarily unavailable. */}
   finally{syncing=false;updates.length=0;if(live)timer=setTimeout(()=>void refresh(),3000);}
  };
  const off=window.wuwei.onEvent((channel,payload)=>{
   if(channel!=='evt:background-queue')return;
   const event=payload as BackgroundTaskEvent;
   if(syncing)updates.push(event);
   setTasks(previous=>applyBackgroundTaskEvent(previous,event));
  });
  const focus=()=>void refresh();
  window.addEventListener('focus',focus);
  void refresh();
  return()=>{live=false;if(timer)clearTimeout(timer);window.removeEventListener('focus',focus);off();};
 },[]);
 return tasks;
}
