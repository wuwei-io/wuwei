import React from 'react';
import {tr} from '../../../../../src/localization/index.js';

/** Keep translated word order while showing the real monthly-billing comparison. */
export function BillingAnnualTerm({amount,before,money,details=false}:{amount:number;before?:number;money:(minor:number)=>string;details?:boolean}){
  const marker='__WUWEI_ANNUAL_AMOUNT__';
  const [prefix,suffix]=tr(details?'billing.plans.annualPayment':'ui.billingpanel.billed.yearly.ca680b1',{price:marker,p0:marker}).split(marker);
  return <>{prefix?.trim()&&<span>{prefix.trim()}</span>}{before!=null&&<del className="billing-original-annual">{money(before)}</del>}<b className="billing-current-annual">{money(amount)}</b>{suffix?.trim()&&<span>{suffix.trim()}</span>}</>;
}
