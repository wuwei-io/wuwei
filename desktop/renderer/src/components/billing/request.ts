import type {BillingRequest,BillingResponse} from '../../../../../src/billing/contracts.js';
/** A stalled IPC/auth request must not leave a purchase button disabled forever. */
export function billingRequest(request:BillingRequest,timeout=45000):Promise<BillingResponse> {
  return new Promise(resolve=>{
    const timer=setTimeout(()=>resolve({error:'network_timeout'}),timeout);
    Promise.resolve().then(()=>window.wuwei.billingRequest(request)).then(
      value=>{clearTimeout(timer);resolve(value&&typeof value==='object'?value:{error:'invalid_response'});},
      ()=>{clearTimeout(timer);resolve({error:'network'});},
    );
  });
}
