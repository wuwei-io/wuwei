import React from 'react';
import {BRAND_ICON_FILES,modelBrandKey} from '../../brand-icons.js';
import { billingBrands } from './brand-assets.js';
import {BRANDS} from '../../modelLogos.js';
export function BillingBrand({model,provider,fallback}:{model:string;provider:string;fallback?:React.ReactNode}) {
  const brand=modelBrandKey(model,provider);
  const asset=brand?billingBrands[brand]:null;
  const shared=brand?BRANDS[brand]:null;
  const svgBody=asset?.body??shared?.body,viewBox=asset?.viewBox??shared?.vb;
  const src=(brand?BRAND_ICON_FILES[brand]:null)??asset?.image??shared?.img??(svgBody?'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${svgBody}</svg>`):null);
  const initials:Record<string,string>={stepfun:'S',mistral:'M',meta:'∞',cohere:'C',kimi:'K'};
  return <span className="billing-brand">{src?<img src={src} alt="" width={26} height={26}/>:fallback??<span aria-hidden="true">{brand?initials[brand]??brand[0].toUpperCase():model.slice(0,1).toUpperCase()}</span>}</span>;
}
