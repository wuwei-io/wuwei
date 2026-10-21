import React,{useEffect,useRef,useState} from 'react';
import {tr} from '../../../../../src/localization/index.js';

const iso=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const parse=(value:string)=>new Date(value+'T12:00:00');
export function BillingDatePicker({value,onChange,label,lang,min,max}:{value:string;onChange:(value:string)=>void;label:string;lang:string;min?:string;max?:string}) {
  const [open,setOpen]=useState(false),[month,setMonth]=useState(()=>value?parse(value):new Date());
  const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(!open)return;const outside=(event:MouseEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};document.addEventListener('mousedown',outside);return()=>document.removeEventListener('mousedown',outside);},[open]);
  const first=new Date(month.getFullYear(),month.getMonth(),1,12),start=new Date(first);start.setDate(1-(first.getDay()+6)%7);
  const select=(v:string)=>{onChange(v);setOpen(false);trigger.current?.focus();};
  const allowed=(v:string)=>(!min||v>=min)&&(!max||v<=max);
  const dateFormat=new Intl.DateTimeFormat(lang,{calendar:'gregory',year:'numeric',month:'2-digit',day:'2-digit'});
  return <div className="billing-date-picker" ref={root} onKeyDown={e=>{if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();setOpen(false);trigger.current?.focus();}}}>
    <button ref={trigger} type="button" className="billing-date-trigger" aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={()=>{if(!open)setMonth(value?parse(value):new Date());setOpen(!open);}}>{value?dateFormat.format(parse(value)):tr('billing.date.placeholder')} <span aria-hidden="true">▦</span></button>
    {open&&<div className="billing-calendar" role="dialog" aria-label={label}>
      <div className="billing-calendar-heading"><button type="button" aria-label={tr('billing.date.previousMonth')} onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1,12))}>‹</button><b>{new Intl.DateTimeFormat(lang,{calendar:'gregory',year:'numeric',month:'long'}).format(first)}</b><button type="button" aria-label={tr('billing.date.nextMonth')} onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1,12))}>›</button></div>
      <div className="billing-calendar-grid" role="grid">{Array.from({length:7},(_,i)=><span role="columnheader" key={'w'+i}>{new Intl.DateTimeFormat(lang,{calendar:'gregory',weekday:'short'}).format(new Date(2026,9,19+i))}</span>)}{Array.from({length:42},(_,i)=>{const day=new Date(start);day.setDate(start.getDate()+i);const v=iso(day);return <button type="button" role="gridcell" aria-label={dateFormat.format(day)} aria-selected={v===value} className={day.getMonth()!==month.getMonth()?'outside':''} disabled={!allowed(v)} key={v} onClick={()=>select(v)}>{day.getDate()}</button>;})}</div>
      <div className="billing-calendar-actions"><button type="button" onClick={()=>select('')}>{tr('billing.date.clear')}</button><button type="button" disabled={!allowed(iso(new Date()))} onClick={()=>select(iso(new Date()))}>{tr('billing.date.today')}</button></div>
    </div>}
  </div>;
}
