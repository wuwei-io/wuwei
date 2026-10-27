// Payment intent is separate from the provider's verified payment result.
// Never send checkout tokens, wallet addresses or payment links to analytics.
import {currentBillingContext,emit} from './tracking-context.js';
export function billingTrack(event:string,props:Record<string,unknown>={}){
  emit(event,{flow_version:'tracking-v1',...currentBillingContext(),...props});
}
