import {useEffect,useRef} from 'react';
import {BillingVisit,type BillingVisitStage,type BillingSelection} from '../../../../../src/billing/visit.js';
import {billingTrack} from './telemetry.js';
import {currentBillingContext} from './tracking-context.js';

export function useBillingVisit(session:string,page:BillingVisitStage,sku:string,period:string,context:string){
 const tracker=useRef<BillingVisit|null>(null);
 if(!tracker.current){const scope=currentBillingContext();tracker.current=new BillingVisit((event,props)=>billingTrack(event,{...scope,...props,billing_session_id:session,context}));}
 const stage=useRef(page);stage.current=page;
 useEffect(()=>{
  const visit=tracker.current!;
  const update=()=>visit.view(stage.current,!document.hidden&&document.hasFocus());
  const hide=()=>{visit.view(stage.current,false);visit.report('close')};
  update();
  const timer=setInterval(()=>{update();visit.report('heartbeat')},10000);
  window.addEventListener('focus',update);window.addEventListener('blur',update);
  document.addEventListener('visibilitychange',update);window.addEventListener('pagehide',hide);
  return()=>{clearInterval(timer);window.removeEventListener('focus',update);window.removeEventListener('blur',update);document.removeEventListener('visibilitychange',update);window.removeEventListener('pagehide',hide);hide()};
 },[session]);
 useEffect(()=>tracker.current!.view(page,!document.hidden&&document.hasFocus()),[page]);
 useEffect(()=>{if(page==='plans')tracker.current!.select(sku,period,'period')},[page,sku,period]);
 return (next:string,nextPeriod:string,reason:BillingSelection['reason']='manual')=>tracker.current!.select(next,nextPeriod,reason);
}
