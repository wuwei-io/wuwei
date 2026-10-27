export type ProductEnvelope={event:string;surface:'desktop';anon_id:string;session_id:string|null;platform:string;app_version:string;props:Record<string,unknown>;detail:string|null};
export type QueuedProduct={id:string;owner:string|null;body:ProductEnvelope};
export function cleanProductProps(input:Record<string,unknown>):Record<string,unknown>{const forbidden=new Set(['token','checkouttoken','providernonce','nonce','privatekey','accesstoken','refreshtoken','apikey','authorization','password','secret','checkouturl','walletaddress','address','memo','prompt','text','content','messages']);const seen=new WeakSet<object>();function clean(v:unknown,depth:number):unknown{if(depth>5)return undefined;if(typeof v==='string')return v.slice(0,500);if(v===null||typeof v==='number'||typeof v==='boolean')return v;if(!v||typeof v!=='object'||seen.has(v))return undefined;seen.add(v);if(Array.isArray(v))return v.slice(0,60).map(x=>clean(x,depth+1));return Object.fromEntries(Object.entries(v).filter(([k])=>!forbidden.has(k.toLowerCase().replace(/[^a-z]/g,''))).map(([k,value])=>[k,clean(value,depth+1)]));}return clean(input,0)as Record<string,unknown>;}
/** Owner-pinned, idempotent retry queue. Authentication is resolved at send time
 * and never persisted. An A event can never be delivered using B's account. */
export class ProductQueue{
 private items:QueuedProduct[];private running=false;
 constructor(private io:{load:()=>QueuedProduct[];save:(items:QueuedProduct[])=>void;canSend?:(item:QueuedProduct)=>boolean;send:(item:QueuedProduct)=>Promise<boolean>}){try{this.items=io.load().filter(x=>x&&typeof x.id==='string'&&x.body&&typeof x.body.event==='string').slice(-10000)}catch{this.items=[]}}
 enqueue(item:QueuedProduct){if(this.items.some(x=>x.id===item.id))return;if(this.items.length>=10000){this.items.shift();item.body.props.telemetry_gap=true;}this.items.push(item);this.persist();}
 private persist(){try{this.io.save(this.items)}catch{/* Disk failures must not block product actions. */}}
 async flush(){if(this.running)return;this.running=true;try{for(let n=0;n<20;n++){const batch=this.items.filter(x=>!this.io.canSend||this.io.canSend(x)).slice(0,3);if(!batch.length)break;const ack=await Promise.all(batch.map(async x=>{try{return await this.io.send(x)?x.id:null}catch{return null}}));const ids=new Set(ack.filter(Boolean));if(!ids.size)break;this.items=this.items.filter(x=>!ids.has(x.id));this.persist();}}finally{this.running=false}}
 snapshot(){return this.items.map(x=>({...x}));}
}
