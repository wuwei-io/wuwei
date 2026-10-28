import test from 'node:test';
import assert from 'node:assert/strict';
import {beginNotice,noticeAction,setTrackingOwner,beginBillingSession} from '../desktop/renderer/src/components/billing/tracking-context.js';

test('overview and conversion share explicit notice IDs for both quota dialogs and retain checkout attribution',()=>{
 const events:{event:string;props:Record<string,unknown>}[]=[];
 const previous=Object.getOwnPropertyDescriptor(globalThis,'window');
 Object.defineProperty(globalThis,'window',{configurable:true,value:{wuwei:{track:(event:string,props:Record<string,unknown>)=>{events.push({event,props});return Promise.resolve();}}}});
 try{
  for(const kind of ['balance','free_daily'] as const){
   setTrackingOwner('user-a');events.length=0;
   const first=beginNotice(kind,{balance:0}),shown=events.filter(e=>e.event.endsWith('_shown'));
   assert.equal(shown.length,2);assert.ok(shown.every(e=>e.props.notice_id===first.notice_id));
   noticeAction('close',{},first);
   const second=beginNotice(kind,{balance:0});assert.notEqual(second.notice_id,first.notice_id);
   noticeAction('upgrade',{},second);
   const legacyActions=events.filter(e=>e.event==='credits_shortage_action');
   assert.deepEqual(legacyActions.map(e=>[e.props.notice_id,e.props.action]),[[first.notice_id,'close'],[second.notice_id,'upgrade']]);
   const visit=beginBillingSession('visit-'+kind,'user-a');assert.equal(visit.source_notice_id,second.notice_id);
   assert.equal(events.filter(e=>e.event===(kind==='balance'?'credits_shortage_shown':'free_cap_guide_shown')).length,2);
   setTrackingOwner('user-b');const before=events.length;noticeAction('close',{},second);assert.equal(events.length,before);
   assert.equal(beginBillingSession('other','user-b').source_notice_id,undefined);
  }
 }finally{setTrackingOwner(undefined);if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window');}
});
