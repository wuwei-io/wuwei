import React from 'react';
import { tr } from '../../../../../src/localization/index.js';
import type { BillingCatalog, BillingProduct } from '../../../../../src/billing/contracts.js';

export function backgroundParallel(product:BillingProduct,policy?:BillingCatalog['backgroundPolicy']):number|null {
 const limit=policy?.enabled && product.kind==='plan'?policy.plans?.[product.name==='Mini'?'Pro':product.name]:null;
 return typeof limit==='number' && Number.isSafeInteger(limit) && limit>1 ? limit:null;
}
export function BillingBackground({product,policy,marker=false}:{product:BillingProduct;marker?:boolean;policy?:BillingCatalog['backgroundPolicy']}){
 const limit=backgroundParallel(product,policy);
 return limit==null?null:<li className="billing-background-feature billing-core-feature" title={tr('billing.background.explanation')}>{marker&&<span aria-hidden="true">✓</span>}<strong>{tr('billing.background.parallel',{count:limit})}</strong></li>;
}
