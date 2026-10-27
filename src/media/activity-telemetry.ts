export type MediaTransfer={kind:'image'|'video';order_id:string;duration_ms:number;bytes:number|null;status:'success'|'failed';error_code?:string};
let observer:((token:string,event:MediaTransfer)=>void|Promise<void>)|undefined;
export function setMediaTransferObserver(next:typeof observer){observer=next}
/** Telemetry must never block delivery or change an order's financial state. */
export function recordMediaTransfer(token:string,event:MediaTransfer){try{void Promise.resolve(observer?.(token,event)).catch(()=>{})}catch{}}
