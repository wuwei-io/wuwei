export interface BackgroundTaskEntry {
 taskId:string;sid?:string;sourceSid?:string;roomId?:string;label?:string;queued:boolean;
 limit?:number;tier?:string;accountId?:string|null;
}
export type BackgroundTaskEvent=BackgroundTaskEntry & {finished?:boolean};
export type BackgroundTasks=Record<string,BackgroundTaskEntry>;

/** Poll updates do not create duplicate notices or reset other workers' state. */
export function applyBackgroundTaskEvent(previous:BackgroundTasks,event:BackgroundTaskEvent):BackgroundTasks {
 const id=event?.taskId || event?.sid || event?.roomId;
 if(typeof id!=='string' || !id || typeof event.queued!=='boolean')return previous;
 if(event.finished){if(!previous[id])return previous;const next={...previous};delete next[id];return next;}
 const value:BackgroundTaskEntry={...event,taskId:id};
 const old=previous[id];
 if(old && Object.keys(value).every(key=>old[key as keyof BackgroundTaskEntry]===value[key as keyof BackgroundTaskEntry]) && Object.keys(old).length===Object.keys(value).length)return previous;
 return {...previous,[id]:value};
}
export function accountBackgroundTasks(tasks:BackgroundTasks,accountId?:string|null):BackgroundTaskEntry[]{
 return Object.values(tasks).filter(task=>(task.accountId??null)===(accountId??null));
}
export function canUpgradeBackgroundTier(tier?:string):boolean{return ['free','mini','pro','plus'].includes(tier??'');}
