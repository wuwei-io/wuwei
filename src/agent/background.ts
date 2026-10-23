import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { tr } from '../localization/index.js';
import type { Provider } from '../types.js';

type BackgroundContext={id:string;onQueue?:(queued:boolean,limit?:number,tier?:string,accountId?:string|null)=>void};
const context=new AsyncLocalStorage<BackgroundContext>();
/** One independently executing conversation/employee/scheduled turn. */
export const withBackgroundTask=<T>(value:BackgroundContext,run:()=>Promise<T>)=>context.run(value,run);
export function backgroundTokenSubject(token:string):string|null {
 try {const value=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());return typeof value.sub==='string'?value.sub:null;}catch{return null;}
}
let resolveToken=async(token:string)=>token;
export function setBackgroundTokenResolver(resolver:typeof resolveToken){resolveToken=resolver;}

type LeaseReply={allowed:boolean;unlimited?:boolean;released?:boolean;backgroundParallel?:number|null;tier?:string;retryAfterMs?:number;leaseExpiresAt?:string;error?:string};
type Options={fetch?:typeof fetch;renewMs?:number;retryMs?:number};
type Lease={signal:AbortSignal;release:()=>Promise<void>};
export class BackgroundExecutionClient {
 private guestBusy=false;
 private guestWaiters=new Set<()=>void>();
 private readonly requestFetch:typeof fetch;
 constructor(private readonly site='https://wuweiai.io',private readonly options:Options={}){this.requestFetch=options.fetch??fetch;}
 private async guest(signal:AbortSignal,queued:BackgroundContext['onQueue']):Promise<Lease>{
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
   let released=false;
   return {signal,release:async()=>{if(released)return;released=true;this.guestBusy=false;for(const wake of this.guestWaiters)wake();}};
  }catch(error){queued?.(false,1,'free',null);throw error;}
 }
 async run<T>(token:string,run:(signal:AbortSignal)=>Promise<T>,signal:AbortSignal=new AbortController().signal):Promise<T>{
  const task=context.getStore();
  if(!task)return run(signal);
  const lease=await this.acquire(token,signal,task.onQueue);
  try{const result=await run(lease.signal);lease.signal.throwIfAborted();return result;}finally{await lease.release();}
 }
 async acquire(token:string,signal:AbortSignal,queued:BackgroundContext['onQueue']):Promise<Lease>{
  signal.throwIfAborted();
  // A guest has no account to aggregate across devices; its one slot is local.
  if(!backgroundTokenSubject(token))return this.guest(signal,queued);
  const leaseId=randomUUID();
  let timer:ReturnType<typeof setTimeout>|undefined;
  let active=true;
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
  const release=async()=>{
   if(!active)return;active=false;if(timer)clearTimeout(timer);queued?.(false);
   // Also release after an ambiguous acquisition timeout. TTL recovers a crash.
   await request('release').catch(()=>{});
  };
  try {
   let lease=await request('acquire');
   while(!lease.allowed){
    if(lease.error)throw Error(tr('background.unavailable'));
    if(!Number.isSafeInteger(lease.backgroundParallel) || !lease.backgroundParallel || lease.backgroundParallel<1)throw Error(tr('background.unavailable'));
    queued?.(true,lease.backgroundParallel,lease.tier,backgroundTokenSubject(token));
    await delay(this.options.retryMs??Math.min(5000,Math.max(500,lease.retryAfterMs??2000)),undefined,{signal:combined});
    lease=await request('acquire');
   }
   combined.throwIfAborted();queued?.(false,lease.backgroundParallel??undefined,lease.tier,backgroundTokenSubject(token));
   if(!lease.unlimited){
    if(!(Date.parse(lease.leaseExpiresAt??'')>Date.now()))throw Error(tr('background.unavailable'));
    const renew=async()=>{
     try {
      const reply=await request('renew');
      if(!reply.allowed || (!reply.unlimited && !(Date.parse(reply.leaseExpiresAt??'')>Date.now())))throw Error(tr('background.unavailable'));
      if(active && !reply.unlimited)timer=setTimeout(()=>void renew(),this.options.renewMs??30000);
     }catch{
      if(active)leaseAbort.abort(Error(tr('background.unavailable')));
     }
    };
    timer=setTimeout(()=>void renew(),this.options.renewMs??30000);
   }
   return {signal:combined,release};
  }catch(error){await release();throw error;}
 }
}
const client=new BackgroundExecutionClient();
const hostedProviders=new WeakMap<Provider,{token:string;execution:BackgroundExecutionClient}>();
const activeTurn=new AsyncLocalStorage<TurnLease|undefined>();

/** Hold the slot across model rounds, retries and ordinary tools, rather than
 * admitting another chat while the first one is searching/browsing. */
class TurnLease {
 private lease?:Lease;
 private acquiring?:Promise<void>;
 private failure=new AbortController();
 readonly signal:AbortSignal;
 constructor(readonly token:string,readonly execution:BackgroundExecutionClient,signal:AbortSignal,private task:BackgroundContext){
  this.signal=AbortSignal.any([signal,this.failure.signal]);
 }
 async ensure(){
  this.signal.throwIfAborted();
  if(this.lease)return;
  this.acquiring??=this.execution.acquire(this.token,this.signal,this.task.onQueue).then(lease=>{
   this.lease=lease;
   const abort=()=>this.failure.abort(lease.signal.reason);
   lease.signal.addEventListener('abort',abort,{once:true});
   this.detach=()=>lease.signal.removeEventListener('abort',abort);
   if(lease.signal.aborted)abort();
  }).finally(()=>{this.acquiring=undefined;});
  await this.acquiring;this.signal.throwIfAborted();
 }
 private detach?:()=>void;
 async release(){
  this.detach?.();this.detach=undefined;
  const lease=this.lease;this.lease=undefined;await lease?.release();
 }
}

export async function runHostedTurn<T>(provider:Provider,run:(signal:AbortSignal)=>Promise<T>,signal:AbortSignal=new AbortController().signal):Promise<T>{
 const binding=hostedProviders.get(provider);
 if(!binding)return run(signal); // Direct subscriptions / BYOK never send keys to billing.
 const task=context.getStore()??{id:randomUUID()};
 const turn=new TurnLease(binding.token,binding.execution,signal,task);
 return activeTurn.run(turn,async()=>{
  try{await turn.ensure();const result=await run(turn.signal);turn.signal.throwIfAborted();return result;}
  finally{await turn.release();}
 });
}

/** A synchronous employee handoff or user decision is idle, not another running
 * task. Release before waiting, reacquire before the parent can do more work. */
export async function withoutTurnSlot<T>(run:()=>Promise<T>):Promise<T>{
 const turn=activeTurn.getStore();
 if(!turn)return run();
 await turn.release();
 const result=await activeTurn.run(undefined,run);
 await turn.ensure();return result;
}

export function wrapBackgroundProvider(provider:Provider,token:string,execution=client):Provider {
 hostedProviders.set(provider,{token,execution});
 const complete=provider.complete.bind(provider);
 provider.complete=async(system,messages,tools,handlers)=>{
  const turn=activeTurn.getStore();
  if(turn && turn.execution===execution && backgroundTokenSubject(turn.token)!==backgroundTokenSubject(token))throw Error(tr('background.accountChanged'));
  if(turn && turn.execution===execution && backgroundTokenSubject(turn.token)===backgroundTokenSubject(token)){
   await turn.ensure();
   return complete(system,messages,tools,{...handlers,signal:handlers.signal?AbortSignal.any([turn.signal,handlers.signal]):turn.signal});
  }
  return execution.run(token,signal=>complete(system,messages,tools,{...handlers,signal}),handlers.signal);
 };
 return provider;
}
