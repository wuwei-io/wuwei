export const billingExitReasons=['not_now','unclear_value','price','expiry','payment_method','task_unsolved','other'] as const;
export type BillingExitReason=typeof billingExitReasons[number];
export type BillingExit={session:string;sku:string;context:string;dwellMs:number;paid:boolean;pendingPayment?:boolean};
export function billingFeedbackEligible(exit:BillingExit,lastShown:number,now=Date.now()){
 return exit.context==='shortage'&&!exit.paid&&!exit.pendingPayment&&exit.dwellMs>=5000&&(!Number.isFinite(lastShown)||lastShown<=0||now-lastShown>=7*86400000);
}
