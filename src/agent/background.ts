import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { tr } from '../localization/index.js';
import type { Provider } from '../types.js';

type BackgroundContext={id:string;onQueue?:(queued:boolean,limit?:number,tier?:string,accountId?:string|null)=>void};
const context=new AsyncLocalStorage<BackgroundContext>();
/** Only autonomous employee/scheduled work enters here. User chat stays outside. */
export const withBackgroundTask=<T>(value:BackgroundContext,run:()=>Promise<T>)=>context.run(value,run);
export function backgroundTokenSubject(token:string):string|null {
 try {const value=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());return typeof value.sub==='string'?value.sub:null;}catch{return null;}
}
let resolveToken=async(token:string)=>token;
export function setBackgroundTokenResolver(resolver:typeof resolveToken){resolveToken=resolver;}

type LeaseReply={allowed:boolean;unlimited?:boolean;released?:boolean;backgroundParallel?:number|null;tier?:string;retryAfterMs?:number;leaseExpiresAt?:string;error?:string};
type Options={fetch?:typeof fetch;renewMs?:number;retryMs?:number};
export class BackgroundExecutionClient {
 private guestBusy=false;
 private guestWaiters=new Set<()=>void>();
 private readonly requestFetch:typeof fetch;
 constructor(private readonly site='https://wuweiai.io',private readonly options:Options={}){this.requestFetch=options.fetch??fetch;}
 private async guest<T>(run:(signal:AbortSignal)=>Promise<T>,signal:AbortSignal,queued:BackgroundContext['onQueue']){
  try {
   while(this.guestBusy){
    queued?.(true,1,'free',null);
    await new Promise<void>((resolve,reject)=>{
     const done=()=>{this.guestWaiters.delete(done);signal.removeEventListener('abort',abort);resolve();};
     const abort=()=>{this.guestWaiters.delete(done);reject(signal.reason);};
     signal.throwIfAborted();this.guestWaiters.add(done);signal.addEventListener('abort',abort,{once:true});
    });
    signal.throwIfAborted();
   }
   this.guestBusy=true;queued?.(false,1,'free',null);
   try{return await run(signal);}finally{this.guestBusy=false;for(const wake of this.guestWaiters)wake();}
  }finally{queued?.(false,1,'free',null);}
 }
 async run<T>(token:string,run:(signal:AbortSignal)=>Promise<T>,signal:AbortSignal=new AbortController().signal):Promise<T>{
  const task=context.getStore();
  if(!task)return run(signal);
  signal.throwIfAborted();
  // A guest has no account to aggregate across devices; its one slot is local.
  if(!backgroundTokenSubject(token))return this.guest(run,signal,task.onQueue);
  const leaseId=randomUUID();
  let timer:ReturnType<typeof setTimeout>|undefined;
  let active=true;let leaseFailure:Error|undefined;
  const leaseAbort=new AbortController();
  const combined=AbortSignal.any([signal,leaseAbort.signal]);
  const request=async(action:'acquire'|'renew'|'release'):Promise<LeaseReply>=>{
   const current=await resolveToken(token);
   if(backgroundTokenSubject(current)!==backgroundTokenSubject(token))throw Error(tr('background.accountChanged'));
   const response=await this.requestFetch(`${this.site}/api/billing/background`,{
    method:'POST',headers:{Authorization:`Bearer ${current}`,'Content-Type':'application/json'},body:JSON.stringify({action,leaseId}),
    signal:action==='release'?AbortSignal.timeout(5000):AbortSignal.any([combined,AbortSignal.timeout(10000)]),
   });
   // Compatibility with a server that has not received this staged feature.
   if(response.status===404 && action==='acquire')return {allowed:true,unlimited:true};
   if(!response.ok)throw Error(tr(response.status===401?'background.accountChanged':'background.unavailable'));
   const result=await response.json() as LeaseReply;
   if(typeof result?.allowed!=='boolean')throw Error(tr('background.unavailable'));
   return result;
  };
  try {
   let lease=await request('acquire');
   while(!lease.allowed){
    if(lease.error)throw Error(tr('background.unavailable'));
    if(!Number.isSafeInteger(lease.backgroundParallel) || !lease.backgroundParallel || lease.backgroundParallel<1)throw Error(tr('background.unavailable'));
    task.onQueue?.(true,lease.backgroundParallel,lease.tier,backgroundTokenSubject(token));
    await delay(this.options.retryMs??Math.min(5000,Math.max(500,lease.retryAfterMs??2000)),undefined,{signal:combined});
    lease=await request('acquire');
   }
   combined.throwIfAborted();task.onQueue?.(false,lease.backgroundParallel??undefined,lease.tier,backgroundTokenSubject(token));
   if(!lease.unlimited){
    if(!(Date.parse(lease.leaseExpiresAt??'')>Date.now()))throw Error(tr('background.unavailable'));
    const renew=async()=>{
     try {
      const reply=await request('renew');
      if(!reply.allowed || (!reply.unlimited && !(Date.parse(reply.leaseExpiresAt??'')>Date.now())))throw Error(tr('background.unavailable'));
      if(active && !reply.unlimited)timer=setTimeout(()=>void renew(),this.options.renewMs??30000);
     }catch{
      if(active){leaseFailure=Error(tr('background.unavailable'));leaseAbort.abort(leaseFailure);}
     }
    };
    timer=setTimeout(()=>void renew(),this.options.renewMs??30000);
   }
   const result=await run(combined);
   if(leaseFailure)throw leaseFailure;
   return result;
  }catch(error){throw leaseFailure??error;}
  finally{
   active=false;if(timer)clearTimeout(timer);task.onQueue?.(false);
   // Also release after an ambiguous acquisition timeout. TTL recovers a crash.
   await request('release').catch(()=>{});
  }
 }
}
const client=new BackgroundExecutionClient();
export function wrapBackgroundProvider(provider:Provider,token:string,execution=client):Provider {
 const complete=provider.complete.bind(provider);
 provider.complete=(system,messages,tools,handlers)=>execution.run(token,
  signal=>complete(system,messages,tools,{...handlers,signal}),handlers.signal);
 return provider;
}
