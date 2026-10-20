import React from 'react';
import { billingBrands } from './brand-assets.js';
export function BillingBrand({model,provider}:{model:string;provider:string}) {
  const text=(model+' '+provider).toLowerCase();
  const brand=/mimo|xiaomi/.test(text)?'mimo':/deepseek/.test(text)?'deepseek':/qwen/.test(text)?'qwen':/glm|zhipu/.test(text)?'glm':/nemotron|nvidia/.test(text)?'nvidia':/claude|anthropic/.test(text)?'claude':/gpt|openai/.test(text)?'openai':/gemini|nano.banana|google/.test(text)?'google':null;
  const asset=brand?billingBrands[brand]:null;
  const src=asset?.image??(asset?.body?'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${asset.viewBox}">${asset.body}</svg>`):null);
  return <span className="billing-brand">{src?<img src={src} alt="" width={26} height={26}/>:<span aria-hidden="true">{model.slice(0,1).toUpperCase()}</span>}</span>;
}
