import React,{useEffect,useMemo,useRef,useState} from 'react';
import {tr} from '../../../../../src/localization/index.js';
import {billingModelCatalog} from '../../../../../src/billing/presentation.js';
import type {ModelChoice} from '../../../../../src/model-selection.js';
import type {VideoCatalog,VideoModel} from '../../../../../src/videogen/contracts.js';
import {billingTrack} from './telemetry.js';
import {BillingBrand} from './BillingBrand.js';

const TOP_MODELS=new Set(['gpt-6-1-sol','kimi-k3-1-pro','claude-opus-5-5']);

export function BillingModelCatalog(p:{models:ModelChoice[];lang:string;onRules:()=>void;onVideo?:(id:string)=>void;showPrices?:boolean}){
  const [filter,setFilter]=useState('all'),[search,setSearch]=useState('');
  const scroll=useRef<HTMLDivElement>(null),models=useMemo(()=>billingModelCatalog(p.models),[p.models]);
  const priceText=(m:ModelChoice)=>{const input=m.price?.input,output=m.price?.output;if(m.free||typeof input!=='number'||typeof output!=='number'||!Number.isFinite(input)||!Number.isFinite(output))return '';const fmt=(n:number)=>new Intl.NumberFormat(p.lang,{maximumFractionDigits:6}).format(n);return tr('ui.modelpicker.in.out.coins.tokens.695a162',{p0:fmt(input),p1:fmt(output)})};
  const category=(m:ModelChoice)=>m.free?'free':m.category==='images'?'image':'chat';
  const [videos,setVideos]=useState<VideoModel[]>([]),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{let alive=true;setFailed(false);void window.wuwei.videoRequest({action:'catalog'}).then(result=>{if(!alive)return;if(!result||typeof result!=='object'||'error'in result)throw Error('catalog');const c=result as VideoCatalog;setVideos(c.enabled?c.models:[])}).catch(()=>{if(alive)setFailed(true)});return()=>{alive=false}},[retry]);
  const entries=[...models.map(m=>({id:m.imageModel??m.modelId,key:m.key,label:p.lang==='zh'?m.label:m.labelEn,category:category(m),provider:m.providerId,recommended:m.recommended,free:m.free,premium:false,priceNote:priceText(m),search:[m.label,m.labelEn,m.modelId,m.imageModel,m.providerId].join(' '),video:undefined as VideoModel|undefined})),...videos.map(m=>({id:m.id,key:'video:'+m.id,label:m.name,category:'video',provider:m.brand,recommended:false,free:false,premium:m.premium,priceNote:m.min_coins===null?'':tr('video.fromCoins',{n:new Intl.NumberFormat(p.lang,{maximumFractionDigits:2}).format(m.min_coins)}),search:m.name+' '+m.id+' '+m.brand+' '+tr('video.model.'+m.id),video:m}))];
  const query=search.trim().toLocaleLowerCase();
  const visible=entries.filter(m=>(filter==='all'||m.category===filter)&&m.search.toLocaleLowerCase().includes(query));
  const fmt=(n:number)=>new Intl.NumberFormat(p.lang).format(n);
  return <>
    <div className="billing-selector-head"><div><h2>{tr('billing.catalog.headline')}</h2><p>{tr('billing.catalog.subtitle')}</p></div><span className="billing-catalog-total"><b>{fmt(entries.length)}</b><small>{tr('billing.catalog.models')}</small></span></div>
    <div className="billing-catalog-controls"><div className="billing-catalog-filters" role="tablist" aria-label={tr('billing.catalog.models')}>{['all','chat','image','video','free'].map(kind=><button key={kind} type="button" role="tab" aria-selected={filter===kind} onClick={()=>{billingTrack('billing_catalog_action',{action:'category',category:kind});setFilter(kind);if(scroll.current)scroll.current.scrollTop=0;}}>{tr('billing.catalog.'+kind)}<small>{fmt(kind==='all'?entries.length:entries.filter(m=>m.category===kind).length)}</small></button>)}</div>
      <label className="billing-catalog-search"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input value={search} placeholder={tr('billing.catalog.search')} aria-label={tr('billing.catalog.search')} onBlur={()=>{if(search)billingTrack('billing_catalog_action',{action:'search',search_length:search.length})}} onChange={e=>{setSearch(e.target.value);if(scroll.current)scroll.current.scrollTop=0;}}/></label>
    </div>
    <div className="billing-catalog-scroll" ref={scroll}><div className="billing-selector-models">{visible.map(m=>{
      const content=<><BillingBrand model={m.id} provider={m.provider}/><span className="billing-model-price-summary"><b className="billing-model-name">{m.label}{TOP_MODELS.has(m.id)&&<small className="billing-model-top">TOP</small>}</b>{p.showPrices&&m.priceNote&&<small className="billing-model-price-note">{m.priceNote}</small>}</span>{m.premium&&<svg className="billing-video-crown" aria-label={tr('video.memberOnly')} viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m3 6 4 4 5-7 5 7 4-4-2 13H5Z"/></svg>}{(m.free||m.category==='image'||m.category==='video'||m.recommended)&&<small className={'billing-catalog-badge '+m.category}>{tr(m.free?'billing.catalog.free':m.category==='image'?'billing.catalog.image':m.category==='video'?'billing.catalog.video':'ui.billingpanel.recommended.99a8fb6')}</small>}<i aria-hidden="true">✓</i></>;
      const title=m.video?[m.label,tr('video.model.'+m.id),tr('video.fromCoins',{n:m.video.min_coins===null?'—':new Intl.NumberFormat(p.lang,{maximumFractionDigits:2}).format(m.video.min_coins)}),m.video.resolutions.join(' / '),`${Math.min(...m.video.durations)}–${Math.max(...m.video.durations)}s`,tr('video.pricingNote')].join(' · '):m.label+(m.priceNote?' · '+m.priceNote:'');
      return <div key={m.key} data-model-id={m.id} title={title} onClick={()=>billingTrack('billing_catalog_action',{action:'model_info',model:m.id,category:m.category})}>{m.video&&p.onVideo?<button type="button" className="billing-video-model" onClick={()=>p.onVideo?.(m.id)}>{content}</button>:content}</div>
    })}</div>{!visible.length&&<p className="billing-catalog-empty">{tr('billing.catalog.empty')}</p>}{failed&&<button onClick={()=>setRetry(v=>v+1)}>{tr('video.retry')}</button>}</div>
    <div className="billing-catalog-foot"><span>{tr('ui.billingpanel.usage.prices.vary.by.model.e504ec2')}</span><button onClick={()=>{billingTrack('billing_catalog_action',{action:'show_all'});scroll.current?.scrollTo({top:scroll.current.scrollHeight,behavior:'smooth'})}}>{tr('billing.catalog.details',{count:fmt(entries.length)})} ↗</button></div>
  </>;
}
