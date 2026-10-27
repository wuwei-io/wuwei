import systemData from "../../../../src/localization/content/system-data.json";
import { tr, getCurrentLanguage, localizeStoredText } from "../../../../src/localization/index.js";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MODEL_CATEGORIES, type ModelCategory, type ModelChoice } from '../../../../src/model-selection.js';
import { localizeModelBadge } from '../../../../src/model-badge.js';
import { recommendedValueModel, premiumUsageExample, premiumSelectionNeedsConfirmation } from '../../../../src/premium-model.js';
import {BillingBrand} from './billing/BillingBrand.js';
import './ModelPicker.css';

export function ModelPicker({choices,selectedKey,loggedIn,lang,loading,onChoose,onClose,onConnections,onRequireLogin,initialCategory,mediaLoading,mediaError,onRetryMedia}: {
  choices:ModelChoice[];selectedKey:string;loggedIn:boolean;lang:string;loading:boolean;
  onChoose:(choice:ModelChoice)=>Promise<void>;onClose:()=>void;onConnections:()=>void;onRequireLogin:()=>void;
  initialCategory?:ModelCategory;mediaLoading?:{images:boolean;videos:boolean};mediaError?:{images:boolean;videos:boolean};onRetryMedia?:()=>void;
}) {
  const en=lang !== "zh";
  const [category,setCategory]=useState<ModelCategory>(initialCategory ?? choices.find(c=>c.key===selectedKey)?.category ?? (loggedIn?'economy':'free'));
  const [query,setQuery]=useState('');
  const [confirm,setConfirm]=useState<ModelChoice|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const valueButton=useRef<HTMLButtonElement>(null);
  const valueChoice=recommendedValueModel(choices);
  const example=confirm?premiumUsageExample(confirm):undefined;
  useEffect(()=>{if(!loggedIn)setConfirm(null);},[loggedIn]);
  useEffect(()=>{
    if(!confirm)return;
    const current=choices.find(c=>c.key===confirm.key);
    if(!current || current.category!=='premium'){
      setConfirm(null);setError(tr("ui.modelpicker.model.availability.changed.please.choose.again.c2752ec"));
    }else if(premiumSelectionNeedsConfirmation(current,confirm)){
      setConfirm(current);setError(tr("ui.modelpicker.model.pricing.changed.review.the.updated.887de4e"));
    }
  },[choices,confirm,en]);
  useEffect(()=>{if(confirm)valueButton.current?.focus();},[confirm?.key]);
  const root=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const fit=()=>{if(!root.current)return;root.current.style.transform='';const rect=root.current.getBoundingClientRect();const shift=rect.right>window.innerWidth-12?window.innerWidth-12-rect.right:rect.left<12?12-rect.left:0;root.current.style.transform=`translateX(${shift}px)`;};
    fit();window.addEventListener('resize',fit);return()=>window.removeEventListener('resize',fit);
  },[]);
  useEffect(()=>{const h=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}};window.addEventListener('keydown',h,true);return()=>window.removeEventListener('keydown',h,true);},[onClose]);
  const rows=useMemo(()=>choices.filter(c=>query.trim()?`${c.label} ${c.labelEn} ${c.modelId}`.toLowerCase().includes(query.trim().toLowerCase()):c.category===category),[choices,category,query]);
  const name=(c:ModelChoice)=>en?c.labelEn:c.label;
  const mediaCategory=category==='images'||category==='videos'?category:undefined;
  const currentLoading=loading||(!!mediaCategory&&!!mediaLoading?.[mediaCategory]);
  const currentError=!!mediaCategory&&!!mediaError?.[mediaCategory];
  const capability=(c:ModelChoice)=>c.category==='videos'?tr('model.category.videos'):c.category==='images'?(tr("ui.billingpanel.image.generation.4b0de81")):c.imageInput===true?(tr("ui.modelpicker.image.input.9523396")):c.imageInput===false?(tr("ui.modelpicker.text.only.9be0f99")):c.category!=='connections'?(tr("ui.modelpicker.image.support.unconfirmed.fef2287")):'';
  const capabilityHint=(c:ModelChoice)=>c.category==='videos'?tr('video.title'):c.category==='images'?(tr("ui.modelpicker.generates.images.from.your.description.e9e9413")):c.imageInput===true?(tr("ui.modelpicker.can.read.and.understand.uploaded.images.642ef36")):c.imageInput===false?(tr("ui.modelpicker.accepts.text.only.cannot.read.uploaded.49e6cc2")):(tr("ui.modelpicker.image.input.has.not.been.confirmed.84a45be"));
  const badge=(c:ModelChoice)=>c.badge?localizeModelBadge(c.badge,lang).split(' · ').filter(tag=>!systemData.modelCapabilityAliases.includes(tag)&&!/(?:视频待接|Video pending|音频待接|Audio pending)/.test(tag)).join(' · '):'';
  const number=(n:number)=>n.toLocaleString(getCurrentLanguage(),{maximumFractionDigits:2});
  const price=(c:ModelChoice)=>c.category==='videos'?(c.videoCoins!=null?tr('video.fromCoins',{n:number(c.videoCoins)}):tr('video.actualBilling')):c.free?(tr("ui.modelpicker.free.daily.limits.apply.711e60a")):c.imageCoins!=null?(tr("ui.modelpicker.from.coins.image.9e5a621", { p0: number(c.imageCoins) })):c.category==='connections'?`${c.connectionLabel || ''} · ${tr("ui.modelpicker.your.subscription.api.key.d03d851")}`:c.price?.input!=null&&c.price.output!=null?(tr("ui.modelpicker.in.out.coins.tokens.695a162", { p0: number(c.price.input), p1: number(c.price.output) })):(tr("ui.modelpicker.check.pricing.before.use.df179db"));
  const choose=async(c:ModelChoice,closeAfter=true)=>{if(busy)return;if(!loggedIn&&c.needsLogin&&c.category!=='images'&&c.category!=='videos'){onRequireLogin();return;}setBusy(true);setError('');try{await onChoose(c);if(closeAfter)onClose();}catch{setError(tr("ui.modelpicker.could.not.switch.models.try.again.bd16750"));}finally{setBusy(false);}};
  const browseCategory=(next:ModelCategory)=>{
    if(busy)return;
    setCategory(next);setQuery('');setConfirm(null);setError('');
    // Entering the free tier explicitly selects Auto, while leaving the list
    // open for users who want to choose a particular free model instead.
    const auto=next==='free'?choices.find(c=>c.category==='free'&&c.free&&c.modelId==='openrouter-auto-free'&&(loggedIn||!c.needsLogin)):undefined;
    if(auto&&auto.key!==selectedKey)void choose(auto,false);
  };
  const chooseValue=()=>{if(valueChoice)void choose(valueChoice);else{setConfirm(null);setQuery('');setCategory('economy');}};
  return <div className={'model-picker'+(confirm?' has-premium-confirmation':'')} ref={root} role="dialog" aria-label={tr("ui.modelpicker.choose.model.6bcb6b3")}>
    <div className="model-picker-header"><strong>{tr("ui.modelpicker.choose.model.6bcb6b3")}</strong><button type="button" aria-label={tr("msg.close")} onClick={onClose}>×</button></div>
    <input className="model-picker-search" autoFocus value={query} onChange={e=>{setQuery(e.target.value);setConfirm(null);}} placeholder={tr("ui.modelpicker.search.models.f17b542")} aria-label={tr("ui.modelpicker.search.models.78b10c2")} />
    <div className="model-picker-columns">
      <nav aria-label={tr("ui.modelpicker.model.categories.1f2005e")}>{MODEL_CATEGORIES.map(g=><button key={g.id} type="button" disabled={busy} aria-label={g.id==='economy'?(tr("ui.modelpicker.popular.value.models.recommended.769db5a")):undefined} className={(category===g.id&&!query?'on ':'')+(g.id==='economy'?'model-picker-category-value':g.id==='connections'?'model-picker-connections':'')} onClick={()=>browseCategory(g.id)}>
        <span className={g.id==='economy'?'model-picker-popular':undefined}>{g.id==='economy'?(tr("ui.modelpicker.value.models.78aa1ce")):en?g.en:g.zh}</span>{g.id==='economy'&&<small className="model-picker-recommend model-picker-category-badge" aria-hidden="true">{tr("ui.modelpicker.rec.770a636")}</small>}
      </button>)}</nav>
      <div className={'model-picker-list'+(confirm?' is-confirming':'')}>
        {confirm?<div className="model-picker-confirm">
          <div className="model-picker-confirm-content" tabIndex={0}>
          <div className="model-picker-premium-notice" role="note"><strong>{tr("ui.modelpicker.premium.model.high.cost.fast.spending.082f766")}</strong><p>{tr("ui.modelpicker.use.cautiously.for.complex.tasks.recommended.cd24226")}</p></div>
          <strong className="model-picker-confirm-name">{name(confirm)}</strong>
          <p className="model-picker-confirm-price">{price(confirm)}</p>
          {confirm.price?.cache!=null&&<p className="model-picker-price">{tr("ui.modelpicker.cached.input.8f00daa")} {number(confirm.price.cache)} {tr("ui.modelpicker.coins.tokens.7fbacb2")}</p>}
          <ul className="model-picker-cost-drivers">
            <li>{tr("ui.modelpicker.long.conversations.files.and.images.increase.ad4f1e1")}</li>
            <li>{tr("ui.modelpicker.long.replies.and.billable.reasoning.increase.0fe1d30")}</li>
            <li>{tr("ui.modelpicker.agent.tasks.can.call.the.model.c7b2553")}</li>
          </ul>
          {example&&<div className="model-picker-cost-example">{tr("ui.modelpicker.example.input.output.tokens.costs.about.36e4873", { p0: number(example.perCall), p1: number(example.fiveCalls) })}<small>{tr("ui.modelpicker.comparison.only.before.cache.discounts.or.912f912")}</small></div>}
          </div>
          <div className="model-picker-confirm-actions">
            <button ref={valueButton} type="button" className="model-picker-value-action" data-action="choose-value" disabled={busy} onClick={chooseValue}>{en?(valueChoice?tr("ui.modelpicker.message.071096003d"):tr("ui.modelpicker.message.3ded9c426b")):(valueChoice?tr("ui.modelpicker.message.071096003d"):tr("ui.modelpicker.message.3ded9c426b"))}{valueChoice&&<small>{name(valueChoice)} · {price(valueChoice)}</small>}</button>
            <button type="button" data-action="confirm-premium" disabled={busy} onClick={()=>void choose(confirm)}>{tr("ui.modelpicker.confirm.switch.to.this.premium.model.6224515")}</button>
            <button type="button" className="model-picker-back-action" disabled={busy} onClick={()=>setConfirm(null)}>{tr("ui.modelpicker.back.to.models.2b29f6e")}</button>
          </div>
        </div>:<>
          {!query&&category==='economy'&&<p className="model-picker-intro">{tr("ui.modelpicker.recommended.for.everyday.agent.tasks.16ad717")}</p>}
          {!query&&category==='premium'&&<div className="model-picker-premium-notice" role="note"><strong>{tr("ui.modelpicker.premium.models.high.cost.fast.spending.210c8d6")}</strong><p>{tr("ui.modelpicker.choose.for.complex.tasks.for.everyday.ae24ce6")}</p></div>}
          {currentError?<p className="model-picker-intro" role="alert">{tr('model.catalog.loadError')} <button type="button" onClick={onRetryMedia}>{tr('video.retry')}</button></p>:currentLoading&&!rows.length?<p className="model-picker-intro">{tr("ui.modelpicker.loading.models.27303a1")}</p>:!rows.length?<p className="model-picker-intro">{tr("ui.modelpicker.no.available.models.078060d")}</p>:rows.map(c=>{const locked=!loggedIn&&c.needsLogin;return <button key={c.key} type="button" disabled={busy} title={locked?(tr("ui.modelpicker.sign.in.to.use.click.to.313a678")):undefined} className={'model-picker-model'+(locked?' model-picker-locked':c.key===selectedKey?' on':'')} data-model-key={c.key} onClick={()=>{if(locked&&c.category!=='images'&&c.category!=='videos'){onRequireLogin();return;}if(c.category==='premium')setConfirm(c);else void choose(c);}}>
            <span className="model-picker-brand" aria-hidden="true"><BillingBrand model={c.imageModel || `${c.modelId} ${c.labelEn}`} provider={c.category==='connections'?c.connectionLabel || '':c.providerId} fallback={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{c.modelId==='openrouter-auto-free'?<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>:<path d="m3 7 9-4 9 4-9 4Zm0 5 9 4 9-4M3 17l9 4 9-4"/>}</svg>}/></span>
            <span className="model-picker-copy"><span className="model-picker-model-heading"><span>{name(c)}</span>{capability(c)&&<small className="model-picker-capability" title={capabilityHint(c)}>{capability(c)}</small>}{c.recommended&&<small className="model-picker-recommend">{tr("ui.billingpanel.recommended.99a8fb6")}</small>}{!locked&&c.key===selectedKey&&<span className="model-picker-check">✓</span>}</span>
            <span className="model-picker-price">{price(c)}</span>
            <span className="model-picker-tags">{locked?(tr("ui.modelpicker.sign.in.to.use.75db3a3")):c.free&&!c.needsLogin?(tr("ui.modelpicker.no.login.needed.aae1d04")):badge(c)&&badge(c).split(' · ').map((tag,index)=><React.Fragment key={index}>{index>0&&' · '}<span className={/^(热门|推荐|Popular|Recommended)$/i.test(tag)?'model-picker-highlight-tag':undefined}>{tag}</span></React.Fragment>)}</span>
            </span>
          </button>;})}
        </>}{error&&<p role="alert" className="model-picker-error">{localizeStoredText(error, getCurrentLanguage())}</p>}
      </div>
    </div>
    <footer><span>{mediaCategory?tr('ui.billingpanel.usage.prices.vary.by.model.e504ec2'):tr("ui.modelpicker.prices.compare.token.usage.task.costs.c126462")}</span><button type="button" onClick={onConnections}>{tr("ui.modelpicker.manage.connections.743c91b")}</button></footer>
  </div>;
}
