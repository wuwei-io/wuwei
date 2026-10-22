import { withBackgroundTask } from '../../src/agent/background.js';
import { tr } from '../../src/localization/index.js';

export function runBackgroundTask<T>(id:string,send:(channel:string,payload?:unknown)=>void,run:()=>Promise<T>,roomId?:string):Promise<T>{
 return withBackgroundTask({id,onQueue:(queued,limit)=>{
  send('evt:background-queue',{sid:roomId?undefined:id,roomId,queued,limit});
  if(!roomId && queued)send('evt:heartbeat',{sid:id});
  if(roomId)send('evt:team-room-hint',{roomId,hint:queued?tr('background.queued'):''});
 }},run);
}
