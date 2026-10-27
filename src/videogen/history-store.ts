import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {VideoOrder,VideoHistoryEntry} from './contracts.js';
type State={entries:VideoHistoryEntry[];deleted:string[];orders?:VideoOrder[];links?:Record<string,string>};
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
/** Per-account local history. Removing a record never cancels or changes billing. */
export class VideoHistoryStore {
 private queues=new Map<string,Promise<unknown>>();
 constructor(private root:string){}
 private async transaction<T>(owner:string,change:(state:State)=>{state?:State;result:T}):Promise<T>{
  if(!/^[a-f0-9]{32}$/.test(owner))throw Error('AUTH_REQUIRED');
  const task=(this.queues.get(owner)??Promise.resolve()).catch(()=>{}).then(async()=>{
   const folder=join(this.root,owner),file=join(folder,'history.json');let state:State;
   try{state=JSON.parse(await readFile(file,'utf8'));if(!state||typeof state!=='object'||!Array.isArray(state.entries)||!Array.isArray(state.deleted))throw Error('VIDEO_HISTORY_UNAVAILABLE')}
   catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw Error('VIDEO_HISTORY_UNAVAILABLE');state={entries:[],deleted:[]}}
   const next=change(state);
   if(next.state){await mkdir(folder,{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';try{await writeFile(temp,JSON.stringify(next.state),{flag:'wx'});await rename(temp,file)}catch(e){await unlink(temp).catch(()=>{});throw e}}
   return next.result;
  });this.queues.set(owner,task);try{return await task}finally{if(this.queues.get(owner)===task)this.queues.delete(owner)}
 }
 list(owner:string){return this.transaction(owner,state=>({result:state.entries.filter(e=>!state.deleted.includes(e.requestId)).sort((a,b)=>b.updatedAt-a.updatedAt)}))}
 cachedOrders(owner:string){return this.transaction(owner,state=>({result:(state.orders??[]).filter(o=>!state.deleted.includes(o.request_id))}))}
 attach(owner:string,requestId:string,creationId?:string){return this.transaction(owner,state=>{
  if(!uuid.test(requestId)||creationId!==undefined&&!uuid.test(creationId))throw Error('INVALID_ORDER');
  const links=state.links??{},root=creationId?(links[creationId]??creationId):(links[requestId]??requestId);
  if(state.deleted.includes(root)||links[requestId]&&links[requestId]!==root)throw Error('INVALID_ORDER');
  if(root!==requestId&&!state.entries.some(e=>e.requestId===root))throw Error('INVALID_ORDER');
  return {state:{...state,links:{...links,[requestId]:root}},result:root};
 })}
 sync(owner:string,orders:VideoOrder[]){return this.transaction(owner,state=>{
  const root=(requestId:string)=>state.links?.[requestId]??requestId;
  const entries=new Map(state.entries.map(e=>[e.requestId,e]));
  // Store display metadata only; reference images are not needed to reopen a work.
  const visible=orders.filter(o=>!state.deleted.includes(root(o.request_id))).map(o=>({...o,creation_id:root(o.request_id)}));
  const snapshots=new Map((state.orders??[]).filter(o=>!state.deleted.includes(root(o.request_id))).map(o=>[o.id,{...o,creation_id:root(o.request_id)}]));
  for(const o of visible)snapshots.set(o.id,{...o,input:{...o.input,has_references:!!o.input.has_references||!!o.input.frames?.length,frames:[]}});
  for(const requestId of new Set(visible.map(o=>o.creation_id))){
   if(!uuid.test(requestId))continue;
   const group=[...snapshots.values()].filter(o=>o.creation_id===requestId).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at));
   const first=group[0],previous=entries.get(requestId),createdAt=previous?.createdAt??Date.parse(first.created_at);if(!Number.isFinite(createdAt))continue;
   entries.set(requestId,{requestId,title:previous?.title??first.input.prompt.trim().slice(0,120),createdAt,updatedAt:Math.max(previous?.updatedAt??createdAt,...group.map(o=>Date.parse(o.completed_at??o.created_at)).filter(Number.isFinite)),count:group.length});
   for(const o of group)if(o.request_id!==requestId)entries.delete(o.request_id);
  }
  const cached=[...snapshots.values()].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,200);
  return{state:{...state,entries:[...entries.values()],orders:cached},result:visible};
 })}
 remove(owner:string,requestId:string){if(!uuid.test(requestId))return Promise.reject(Error('INVALID_ORDER'));return this.transaction(owner,state=>{
  const root=state.links?.[requestId]??requestId,belongs=(id:string)=>(state.links?.[id]??id)===root;
  return {state:{...state,entries:state.entries.filter(e=>!belongs(e.requestId)),orders:(state.orders??[]).filter(o=>!belongs(o.request_id)),deleted:[...new Set([...state.deleted,root])]},result:true};
 })}
}
