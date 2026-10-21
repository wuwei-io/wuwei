// Payment intent is separate from the provider's verified payment result.
// Never send checkout tokens, wallet addresses or payment links to analytics.
export function billingTrack(event:string,props:Record<string,unknown>={}){
  try { void window.wuwei.track?.(event,props)?.catch(()=>{}); } catch { /* analytics must not block payment */ }
}
