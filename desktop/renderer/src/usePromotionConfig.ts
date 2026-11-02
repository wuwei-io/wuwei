import {setAccountFooterLayout} from '../../../src/account-footer-config.js';
import {setFreeAllowance} from '../../../src/billing/free-allowance.js';
import {useEffect,useSyncExternalStore} from 'react';
import {setRegistrationGiftAmount,subscribePromotion,promotionVersion} from '../../../src/promotion-config.js';
// Local dev may preview either footer without changing the shared admin setting.
const devFooterLayout = import.meta.env.DEV && ['classic','wallet'].includes(import.meta.env.RENDERER_VITE_ACCOUNT_FOOTER)
  ? import.meta.env.RENDERER_VITE_ACCOUNT_FOOTER : undefined;
if (devFooterLayout) setAccountFooterLayout(devFooterLayout);
export function usePromotionConfig(){useSyncExternalStore(subscribePromotion,promotionVersion,promotionVersion);useEffect(()=>{let alive=true,busy=false;const load=async()=>{if(busy)return;busy=true;try{const r=await fetch('https://wuweiai.io/api/billing/client-config',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)return;const data=await r.json();if(alive){setRegistrationGiftAmount(data?.registrationGift?.amount);setFreeAllowance(data?.freeAllowance??null);setAccountFooterLayout(devFooterLayout ?? data?.accountFooter?.layout);}}catch{}finally{busy=false}};void load();const timer=setInterval(load,60000);const focus=()=>{void load()};window.addEventListener('focus',focus);return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',focus)}},[]);}
