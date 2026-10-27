import {billingTrack} from './telemetry.js';
import {currentBillingContext} from './tracking-context.js';
/** Only a resolved shell handoff is an opened checkout. The interval until
 * focus returns is explicitly not external-page foreground dwell. */
export async function openTrackedCheckout(url:string,props:Record<string,unknown>){
 const scope={...currentBillingContext(),...props};billingTrack('billing_checkout_click',scope);
 try{await window.wuwei.openExternal(url);billingTrack('billing_checkout_open',scope);const started=Date.now();const returned=()=>{clearTimeout(timer);billingTrack('billing_checkout_return',{...scope,outside_client_interval_ms:Date.now()-started})};const timer=setTimeout(()=>window.removeEventListener('focus',returned),3600000);window.addEventListener('focus',returned,{once:true});return true;}
 catch{billingTrack('billing_checkout_failed',{...scope,code:'external_open_failed'});return false;}
}
