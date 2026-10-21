import React from 'react';
import { billingBrands } from './brand-assets.js';
import {BRANDS} from '../../modelLogos.js';
export function BillingBrand({model,provider}:{model:string;provider:string}) {
  const text=(model+' '+provider).toLowerCase();
  const brand=/mimo|xiaomi/.test(text)?'mimo':/deepseek/.test(text)?'deepseek':/qwen/.test(text)?'qwen':/glm|zhipu/.test(text)?'glm':/nemotron|nvidia/.test(text)?'nvidia':/claude|anthropic/.test(text)?'claude':/gpt|openai/.test(text)?'openai':/gemini|nano.banana|google/.test(text)?'google':/kimi|moonshot/.test(text)?'kimi':/grok/.test(text)?'grok':/minimax/.test(text)?'minimax':/doubao/.test(text)?'doubao':/step/.test(text)?'stepfun':/mistral/.test(text)?'mistral':/llama/.test(text)?'meta':/cohere|north.*code/.test(text)?'cohere':null;
  const asset=brand?billingBrands[brand]:null;
  const shared=brand?BRANDS[brand]:null;
  const svgBody=asset?.body??shared?.body,viewBox=asset?.viewBox??shared?.vb;
  const src=asset?.image??shared?.img??(svgBody?'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${svgBody}</svg>`):null);
  const fallback:Record<string,string>={stepfun:'S',mistral:'M',meta:'∞',cohere:'C',kimi:'K'};
  return <span className="billing-brand">{src?<img src={src} alt="" width={26} height={26}/>:<span aria-hidden="true">{brand?fallback[brand]??brand[0].toUpperCase():model.slice(0,1).toUpperCase()}</span>}</span>;
}
