import React,{useEffect,useRef,useState} from 'react';
import {tr} from '../../../../src/localization/index.js';
export function PaidContextDialog({model,onNew,onCurrent,onClose}:{model:string;onNew:()=>Promise<void>;onCurrent:()=>Promise<void>;onClose:()=>void}){
 const root=useRef<HTMLElement>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 useEffect(()=>{const before=document.activeElement as HTMLElement|null;root.current?.querySelector<HTMLButtonElement>('.freecap-primary')?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation()}if(e.key==='Tab'){const buttons=Array.from(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]),first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};document.addEventListener('keydown',key,true);return()=>{document.removeEventListener('keydown',key,true);if(before?.isConnected)before.focus()}},[busy,onClose]);
 const run=async(action:()=>Promise<void>)=>{setBusy(true);setError(false);try{await action()}catch{setError(true)}finally{setBusy(false)}};
 return <div className="perm-overlay" style={{zIndex:1300}}>
  <section ref={root} className="add-st-dialog" style={{maxWidth:440,padding:26,position:'relative'}} role="dialog" aria-modal="true" aria-labelledby="paid-context-title" onClick={e=>e.stopPropagation()}>
   <button type="button" className="freecap-x" disabled={busy} aria-label={tr('msg.close')} title={tr('msg.close')} onClick={onClose}>×</button>
   <h2 id="paid-context-title" style={{fontSize:18,margin:'0 0 12px',paddingRight:24}}>{tr('billing.context.title')}</h2>
   <p style={{fontSize:13,lineHeight:1.8}}>{tr('billing.context.note',{model})}</p>
   {error&&<p role="alert">{tr('ui.billingpanel.unable.to.switch.please.retry.8f406cd')}</p>}
   <div style={{display:'grid',gap:9,marginTop:22}}>
    <button disabled={busy} className="freecap-primary" onClick={()=>void run(onNew)}>{tr('billing.context.new')}</button>
    <button disabled={busy} className="freecap-secondary" onClick={()=>void run(onCurrent)}>{tr('billing.context.current')}</button>
   </div>
  </section>
 </div>
}
