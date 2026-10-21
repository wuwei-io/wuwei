import React,{useMemo,useRef,useState} from 'react';
import {tr} from '../../../../../src/localization/index.js';
import {billingModelCatalog} from '../../../../../src/billing/presentation.js';
import type {ModelChoice} from '../../../../../src/model-selection.js';
import {BillingBrand} from './BillingBrand.js';

export function BillingModelCatalog(p:{models:ModelChoice[];lang:string;onRules:()=>void}){
  const [filter,setFilter]=useState('all'),[search,setSearch]=useState('');
  const scroll=useRef<HTMLDivElement>(null),models=useMemo(()=>billingModelCatalog(p.models),[p.models]);
  const category=(m:ModelChoice)=>m.free?'free':m.category==='images'?'image':'chat';
  const query=search.trim().toLocaleLowerCase();
  const visible=models.filter(m=>(filter==='all'||category(m)===filter)&&[m.label,m.labelEn,m.modelId,m.imageModel,m.providerId].join(' ').toLocaleLowerCase().includes(query));
  const fmt=(n:number)=>new Intl.NumberFormat(p.lang).format(n);
  return <>
    <div className="billing-selector-head"><div><h2>{tr('billing.catalog.headline')}</h2><p>{tr('billing.catalog.subtitle')}</p></div><span className="billing-catalog-total"><b>{fmt(models.length)}</b><small>{tr('billing.catalog.models')}</small></span></div>
    <div className="billing-catalog-controls"><div className="billing-catalog-filters" role="tablist" aria-label={tr('billing.catalog.models')}>{['all','chat','image','free'].map(kind=><button key={kind} type="button" role="tab" aria-selected={filter===kind} onClick={()=>{setFilter(kind);if(scroll.current)scroll.current.scrollTop=0;}}>{tr('billing.catalog.'+kind)}<small>{fmt(kind==='all'?models.length:models.filter(m=>category(m)===kind).length)}</small></button>)}</div>
      <label className="billing-catalog-search"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input value={search} placeholder={tr('billing.catalog.search')} aria-label={tr('billing.catalog.search')} onChange={e=>{setSearch(e.target.value);if(scroll.current)scroll.current.scrollTop=0;}}/></label>
    </div>
    <div className="billing-catalog-scroll" ref={scroll}><div className="billing-selector-models">{visible.map(m=><div key={m.key} data-model-id={m.imageModel??m.modelId} title={p.lang==='zh'?m.label:m.labelEn}><BillingBrand model={m.imageModel??m.modelId} provider={m.providerId}/><b>{p.lang==='zh'?m.label:m.labelEn}</b>{(m.free||m.category==='images'||m.recommended)&&<small className={'billing-catalog-badge '+category(m)}>{tr(m.free?'billing.catalog.free':m.category==='images'?'billing.catalog.image':'ui.billingpanel.recommended.99a8fb6')}</small>}<i aria-hidden="true">✓</i></div>)}</div>{!visible.length&&<p className="billing-catalog-empty">{tr('billing.catalog.empty')}</p>}</div>
    <div className="billing-catalog-foot"><span>{tr('ui.billingpanel.usage.prices.vary.by.model.e504ec2')}</span><button onClick={()=>scroll.current?.scrollTo({top:scroll.current.scrollHeight,behavior:'smooth'})}>{tr('billing.catalog.details',{count:fmt(models.length)})} ↗</button></div>
  </>;
}
