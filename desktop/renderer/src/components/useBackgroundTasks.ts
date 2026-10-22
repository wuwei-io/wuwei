import {useEffect,useState} from 'react';
import {applyBackgroundTaskEvent,type BackgroundTaskEvent,type BackgroundTasks} from '../../../../src/billing/background-tasks.js';

export function useBackgroundTasks(){
 const [tasks,setTasks]=useState<BackgroundTasks>({});
 useEffect(()=>{
  let live=true;let booting=true;const updates:BackgroundTaskEvent[]=[];
  const off=window.wuwei.onEvent((channel,payload)=>{
   if(channel!=='evt:background-queue')return;
   const event=payload as BackgroundTaskEvent;
   if(booting)updates.push(event);
   setTasks(previous=>applyBackgroundTaskEvent(previous,event));
  });
  // Rehydrate if the renderer reloads or opens while work is already queued.
  void window.wuwei.backgroundTasks?.().then(snapshot=>{
   if(!live)return;
   let initial:BackgroundTasks={};
   for(const task of Array.isArray(snapshot)?snapshot:[])initial=applyBackgroundTaskEvent(initial,task);
   for(const event of updates)initial=applyBackgroundTaskEvent(initial,event);
   booting=false;updates.length=0;setTasks(initial);
  }).catch(()=>{booting=false;updates.length=0;});
  return()=>{live=false;off();};
 },[]);
 return tasks;
}
