import React,{useEffect,useRef,useState} from 'react';
import {tr} from '../../../../src/localization/index.js';
import {canUpgradeBackgroundTier,type BackgroundTaskEntry} from '../../../../src/billing/background-tasks.js';
import './background-queue.css';

export function BackgroundQueueNotice({tasks,sid,roomId,onUpgrade,onViewTasks}:{tasks:BackgroundTaskEntry[];sid?:string;roomId?:string;onUpgrade:()=>void;onViewTasks:()=>void}){
 const [dismissed,setDismissed]=useState<Set<string>>(()=>new Set());
 const matching=tasks.filter(t=>t.queued && (roomId?t.roomId===roomId:!!sid && (t.sid===sid || t.sourceSid===sid)));
 const task=matching.find(t=>!dismissed.has(t.taskId));
 const seen=useRef(new Set<string>());
 useEffect(()=>{
  if(!task || seen.current.has(task.taskId))return;
  seen.current.add(task.taskId);
  void window.wuwei.track?.('background_queue_notice_shown',{tier:task.tier??'unknown',limit:task.limit??0,source:roomId?'room':'session'});
 },[task,roomId]);
 if(!task || !Number.isSafeInteger(task.limit) || !task.limit || task.limit<1)return null;
 const plan=task.tier==='free'?tr('background.plan.free'):({pro:'Pro',plus:'Plus',max:'Max'} as Record<string,string>)[task.tier??''];
 const upgrade=canUpgradeBackgroundTier(task.tier);
 return <section className="background-queue-notice" role="status" aria-live="polite" data-tier={task.tier}>
  <span className="background-queue-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.2"/><path d="M12 7.5v5l3 1.8"/></svg></span>
  <div className="background-queue-copy"><strong>{tr(plan?'background.notice.title':'background.notice.generic',{plan:plan??'',count:task.limit})}</strong><p>{tr(upgrade?'background.notice.upsell':'background.notice.wait')}</p></div>
  <button type="button" className={'background-queue-action'+(upgrade?'':' secondary')} onClick={()=>{
   void window.wuwei.track?.(upgrade?'background_queue_upgrade_click':'background_queue_view_click',{tier:task.tier??'unknown',limit:task.limit??0,source:roomId?'room':'session'});
   if(upgrade)onUpgrade();else onViewTasks();
  }}>{tr(upgrade?'background.notice.upgrade':'background.notice.view')}<span aria-hidden="true">→</span></button>
  <button type="button" className="background-queue-dismiss" title={tr('msg.close')} aria-label={tr('msg.close')}
   onClick={()=>setDismissed(previous=>new Set([...previous,...matching.map(t=>t.taskId)]))}>
   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 7 10 10m0-10L7 17"/></svg>
  </button>
 </section>;
}
