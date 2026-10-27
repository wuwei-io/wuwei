const keys=new Set(['login.incentive','login.signupGift','err.freeQuota','ui.billingpanel.auto.pick.free.models.sign.up.429f408']);
let amount=100,version=0;const listeners=new Set<()=>void>();
export function setRegistrationGiftAmount(value:unknown){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>2147483647)return false;if(amount!==value){amount=value;version++;listeners.forEach(fn=>fn());}return true;}
export function promotionMessageValues(key:string):Record<string,string|number>{return keys.has(key)?{signupCoins:amount}:{};}
export const subscribePromotion=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)};};
export const promotionVersion=()=>version;
