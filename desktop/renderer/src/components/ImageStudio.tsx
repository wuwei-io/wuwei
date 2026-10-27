import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { hasMessage, tr } from '../../../../src/localization/index.js';
import { imageModelChoices, imageModelLabel, type ImageCatalogEntry } from '../../../../src/imagegen/image-catalog.js';
import type { StudioImageQuote } from '../../../../src/imagegen/studio-approval.js';
import { BillingBrand } from './billing/BillingBrand.js';
import { chooseImageVariant, imageResolutionPixels, imageVariantDimensions, STUDIO_RATIOS, imageProvider, imageStudioRows, sameModelVariants, validImagePrompt } from './image-studio-catalog.js';
import {STUDIO_MODELS,studioModelProfile} from '../../../../src/imagegen/studio-models.js';
import {GalleryIcon} from './ImageGallery.js';
import './image-studio.css';

type IconName = 'image' | 'plus' | 'chevron' | 'arrow' | 'clock' | 'coin' | 'check' | 'close' | 'grid' | 'folder';
function Icon({ name }: {name:IconName}) {
  const paths: Record<IconName, React.ReactNode> = {
    image:<><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m3 16 5-5 5 5 3-3 5 5"/></>,
    plus:<path d="M12 5v14M5 12h14"/>, chevron:<path d="m8 10 4 4 4-4"/>, arrow:<path d="M5 12h14m-5-5 5 5-5 5"/>,
    clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, coin:<><circle cx="12" cy="12" r="8.5"/><path d="m12 7 3 5-3 5-3-5Z"/></>,
    check:<path d="m5 12 4 4L19 6"/>,close:<path d="m6 6 12 12M18 6 6 18"/>,
    grid:<><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    folder:<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z"/>
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}
const qualityLabel = (quality?: string) => tr(quality === 'low' ? 'studio.light' : quality === 'medium' ? 'studio.standard' : quality === 'high' ? 'studio.high' : quality==='xhigh'?'studio.qualityExtra':quality==='max'?'studio.qualityMax':'studio.auto');
const unique = <T,>(rows:T[]) => [...new Set(rows)];
function storedCount(scope:string){try{const count=Number(sessionStorage.getItem('image-studio-count/'+scope));return Number.isInteger(count)&&count>=1&&count<=4?count:1;}catch{return 1;}}

export function ImageStudioHeader({historyOpen,onHistory,onBack,historyAvailable=true}: {historyOpen:boolean;onHistory:()=>void;onBack:()=>void;historyAvailable?:boolean}) {
  return <header className="image-studio image-studio-header"><div><span>{tr('studio.workspace')}</span><i>/</i><b>{tr('studio.title')}</b></div><div>{historyAvailable&&<><button aria-pressed={historyOpen} onClick={onHistory}><Icon name="clock"/>{historyOpen ? tr('studio.backCreate') : tr('studio.history')}</button><i></i></>}<button onClick={onBack}>{tr('studio.backChat')}<span>↗</span></button></div></header>;
}
interface Props {
  catalog:ImageCatalogEntry[]; skuId:string; scope:string; reuseVersion?:number; value:string; onChange:(value:string)=>void;
  onSelect:(sku:string)=>Promise<void>; onGenerate:(approvalId:string)=>void; onStop:()=>void; onRefresh:()=>Promise<void>;
  busy:boolean; compact:boolean; loggedIn:boolean; onLogin:()=>void; onUpgrade:()=>void;
  references:string[]; onRemoveReference:(index:number)=>void; textareaRef:React.RefObject<HTMLTextAreaElement|null>;
}
export function ImageStudio(p:Props) {
  const rows = imageStudioRows(p.catalog), selected = rows.find(row=>row.sku_id===p.skuId);
  const choices = imageModelChoices(rows), variants = sameModelVariants(rows, selected);
  const profiles=[...STUDIO_MODELS.filter(profile=>choices.some(row=>row.model===profile.model)),...choices.filter(row=>!studioModelProfile(row.model)).map(row=>({model:row.model,label:imageModelLabel(row),brand:imageProvider(row.model),description:'creative',maxResolution:''}))];
  const providers = unique(profiles.map(row=>row.brand));
  const [modelSearch,setModelSearch]=useState('');
  const [provider,setProvider] = useState(selected ? imageProvider(selected.model) : providers[0]);
  const [open,setOpen] = useState<'models'|'parameters'|null>(null), [switching,setSwitching] = useState(false);
  const [error,setError] = useState(''), [retry,setRetry] = useState(0), [referenceHint,setReferenceHint] = useState(false);
  const [quote,setQuote] = useState<{key:string;data?:StudioImageQuote;error?:boolean}|null>(null);
  const root=useRef<HTMLDivElement>(null), panel=useRef<HTMLDivElement>(null), controls=useRef<HTMLDivElement>(null), submission=useRef(false);
  const unlock=useRef<ReturnType<typeof setTimeout>|undefined>(undefined), switchLock=useRef(false);
  const [count,setCount]=useState(()=>storedCount(p.scope));
  const chooseCount=(n:number)=>{if(p.busy)return;setCount(n);try{sessionStorage.setItem('image-studio-count/'+p.scope,String(n));}catch{}};
  useEffect(()=>{setCount(storedCount(p.scope));},[p.reuseVersion]);
  const generationPrompt = p.value.trim();
  const quoteKey = JSON.stringify([p.scope,p.skuId,selected?.price_version,generationPrompt,count]);
  const promptValid = validImagePrompt(p.value,selected);
  const activeQuote = quote?.key===quoteKey ? quote : null;
  const quoted = !!activeQuote?.data?.approval_id && activeQuote.data.expires_at>Date.now() && activeQuote.data.sku_id===p.skuId && activeQuote.data.count===count && (!selected?.price_version || activeQuote.data.price_version===selected.price_version.toLowerCase());
  const dimension=imageVariantDimensions(selected);
  const ratios=unique(variants.map(row=>imageVariantDimensions(row).ratio)).sort((a,b)=>STUDIO_RATIOS.indexOf(a)-STUDIO_RATIOS.indexOf(b));
  const resolutions=unique(variants.map(row=>imageVariantDimensions(row).resolution)).sort((a,b)=>imageResolutionPixels(a)-imageResolutionPixels(b));
  const qualities=unique(variants.map(row=>row.quality).filter((v):v is string=>!!v)).sort((a,b)=>['default','low','medium','high','xhigh','max'].indexOf(a)-['default','low','medium','high','xhigh','max'].indexOf(b));
  useEffect(()=>{setOpen(null);setError('');submission.current=false;setQuote(null);setCount(storedCount(p.scope));},[p.scope]);
  useEffect(()=>{if(selected)setProvider(imageProvider(selected.model));},[selected?.model]);
  useEffect(()=>{submission.current=false;},[p.value,p.busy]);
  useEffect(()=>()=>clearTimeout(unlock.current),[]);
  useEffect(()=>{
    if(!p.loggedIn || !selected || selected.eligible===false || !generationPrompt || !promptValid || p.busy)return;
    let cancelled=false;
    const timer=setTimeout(()=>{
      void window.wuwei.imageQuote({sku_id:selected.sku_id,prompt:generationPrompt,count}).then(data=>{
        if(!cancelled)setQuote({key:quoteKey,data});
      }).catch(()=>{if(!cancelled)setQuote({key:quoteKey,error:true});});
    },350);
    return ()=>{cancelled=true;clearTimeout(timer);};
  },[quoteKey,retry,p.loggedIn,p.busy,promptValid,selected?.eligible]);
  useEffect(()=>{
    if(!activeQuote?.data)return;
    const timer=setTimeout(()=>{setQuote(null);setRetry(v=>v+1);},Math.max(0,activeQuote.data.expires_at-Date.now()));
    return ()=>clearTimeout(timer);
  },[activeQuote?.data]);
  useEffect(()=>{
    if(!open)return;
    const outside=(e:PointerEvent)=>{if(!(e.target as Element).closest('.studio-popover,[data-studio-model],[data-studio-parameters]'))setOpen(null);};
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();setOpen(null);controls.current?.querySelector<HTMLButtonElement>(open==='models'?'[data-studio-model]':'[data-studio-parameters]')?.focus();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return ()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[open]);
  useLayoutEffect(()=>{
    if(!open || !panel.current || !controls.current)return;
    const fit=()=>{
      const box=panel.current!,trigger=controls.current!.getBoundingClientRect();
      const top=document.querySelector('.image-studio-header')?.getBoundingClientRect().bottom??48;
      if(open==='parameters') {
        box.classList.remove('is-below');box.style.maxHeight='none';
        const anchor=controls.current!.querySelector('[data-studio-parameters]')!.getBoundingClientRect();
        const main=document.querySelector('.main')!.getBoundingClientRect(),rect=box.getBoundingClientRect();
        const left=Math.max(main.left+12,Math.min(anchor.left,Math.min(main.right,innerWidth)-rect.width-12));
        const desired=trigger.top-rect.height-10;
        box.style.left=`${left}px`;
        const below=trigger.bottom+8;
        const preferred=desired>=top+8?desired:below+rect.height<=innerHeight-10?below:desired;
        box.style.top=`${Math.max(top+8,Math.min(preferred,innerHeight-rect.height-10))}px`;
      } else {
        const above=trigger.top-top-12,below=window.innerHeight-trigger.bottom-16;
        box.classList.toggle('is-below',above<280 && below>above);
        box.style.maxHeight=`${Math.max(160,above<280 && below>above?below:above)}px`;
      }
    };fit();window.addEventListener('resize',fit);return()=>window.removeEventListener('resize',fit);
  },[open,p.compact,provider,selected?.model,ratios.length,qualities.length]);
  async function choose(id:string,close=true) {
    if(switchLock.current || p.busy)return;
    if(id===p.skuId&&p.loggedIn){if(close)setOpen(null);return;}
    switchLock.current=true;setSwitching(true);setError('');
    try {await p.onSelect(id);if(close)setOpen(null);}
    catch {setError(tr('studio.switchError'));}
    finally {switchLock.current=false;setSwitching(false);}
  }
  const applyVariant=(field:'aspect_ratio'|'resolution'|'quality',value:string)=>{
    if(!selected)return;const next=chooseImageVariant(variants,selected,field,value);if(next)void choose(next.sku_id,false);
  };
  const toggle=(next:'models'|'parameters')=>{setOpen(open===next?null:next);setError('');};
  const canGenerate=!!selected && selected.eligible!==false && promptValid && !p.references.length && quoted && !switching && !p.busy;
  const generate=()=>{
    if(!p.loggedIn){p.onLogin();return;}
    if(!canGenerate || submission.current)return;
    submission.current=true;setOpen(null);p.onGenerate(activeQuote!.data!.approval_id);
    clearTimeout(unlock.current);unlock.current=setTimeout(()=>{submission.current=false;},1500);
  };
  const cost = activeQuote?.data?.estimated_coins ?? (selected?.coins_per_image!=null?selected.coins_per_image*count:undefined);
  const fillPreset=(kind:'product'|'poster'|'illustration')=>{p.onChange(tr(`studio.prompt.${kind}`));p.textareaRef.current?.focus();};
  return <div className={'image-studio image-studio-content'+(p.compact?' is-compact':'')} ref={root}>
    {!p.compact&&<section className="studio-hero"><div className="studio-eyebrow"><i/>IMAGE STUDIO</div><h1>{tr('studio.hero')}</h1><p>{tr('studio.lead')}</p></section>}
    <section className="studio-card">
      <div className="studio-card-heading"><span><Icon name="image"/>{tr('studio.description')}</span><button onClick={()=>fillPreset('product')}>{tr('studio.example')}<Icon name="arrow"/></button></div>
      <div className="studio-prompt-area">
        <div className="studio-references">{p.references.map((src,i)=><div className="studio-reference-thumb" key={src+i}><img src={src} alt={tr('studio.referenceNumber',{number:i+1})}/><button className="studio-remove" onClick={()=>p.onRemoveReference(i)} aria-label={tr('studio.removeReference',{number:i+1})}><Icon name="close"/></button><small>{i+1}</small></div>)}
          <button className="studio-reference-add" aria-disabled="true" aria-describedby={referenceHint?'studio-reference-note':undefined} onClick={()=>setReferenceHint(v=>!v)} title={tr('studio.referenceUnavailable')}><Icon name="plus"/><span>{tr('studio.reference')}</span><small>{tr('studio.unavailable')}</small></button></div>
        <textarea ref={p.textareaRef} dir="auto" rows={3} value={p.value} aria-label={tr('studio.description')} placeholder={tr('studio.placeholder')} onChange={e=>p.onChange(e.target.value)} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();generate();}}} onPaste={e=>{if([...e.clipboardData.files].some(f=>f.type.startsWith('image/'))){e.preventDefault();setReferenceHint(true);}}}/>
        {!!p.value&&<span className="studio-prompt-count">{p.value.length}</span>}
      </div>
      {(referenceHint||p.references.length>0)&&<p className="studio-inline-note" id="studio-reference-note">{tr('studio.referenceUnavailable')}{p.references.length>0&&' '+tr('studio.removeToGenerate')}</p>}
      {!!p.value.trim()&&!promptValid&&<p className="studio-inline-error" role="alert">{tr('studio.promptTooLong')}</p>}
      <div className="studio-toolbar" ref={controls}><div className="studio-options">
        <button className="studio-control" data-studio-model aria-haspopup="dialog" aria-expanded={open==='models'} disabled={switching||p.busy} onClick={()=>toggle('models')}>{selected&&<BillingBrand model={selected.model} provider=""/>}<span>{selected?imageModelLabel(selected):tr('studio.chooseModel')}</span><Icon name="chevron"/></button>
        <button className="studio-control studio-parameters-control" data-studio-parameters aria-haspopup="dialog" aria-expanded={open==='parameters'} disabled={!selected||switching||p.busy} onClick={()=>toggle('parameters')}><span className="studio-tiny-ratio"/><span>{dimension.ratio==='auto'?tr('studio.auto'):dimension.ratio}<i>·</i>{tr('studio.count',{count})}<i>·</i>{dimension.resolution==='auto'?tr('studio.auto'):dimension.resolution}<i>·</i>{qualityLabel(selected?.quality)}</span><Icon name="chevron"/></button>
      </div>{p.busy?<button className="studio-generate" onClick={p.onStop}><span className="studio-stop"/>{tr('composer.stop')}</button>:<button className="studio-generate" disabled={p.loggedIn&&!canGenerate} onClick={generate} title={tr('studio.feeNote')}>{tr('studio.generate')}<Icon name="arrow"/>{cost!=null&&<><i/><span className="studio-generate-cost"><Icon name="coin"/>{cost}</span></>}</button>}</div>
      {open==='models'&&<div ref={panel} className="studio-popover studio-model-popover studio-v2-models" role="dialog" aria-label={tr('studio.chooseModel')}>
        <div className="studio-popover-title"><b>{tr('studio.chooseModel')}</b><label className="studio-model-search"><GalleryIcon name="search"/><input value={modelSearch} onChange={event=>setModelSearch(event.target.value)} placeholder={tr('studio.gallery.modelSearch')} aria-label={tr('studio.gallery.modelSearch')}/></label><button onClick={()=>setOpen(null)} aria-label={tr('studio.gallery.close')}><Icon name="close"/></button></div>
        <div className="studio-model-menu"><nav aria-label={tr('studio.provider')}><small>{tr('studio.provider')}</small>{providers.map(name=><button key={name} className={name===provider&&!modelSearch?'active':''} onClick={()=>{setProvider(name);setModelSearch('');}}><BillingBrand model={name==='Google'?'gemini':name==='OpenAI'?'gpt':name} provider=""/><span>{name}<small>{tr(hasMessage('studio.gallery.brand.'+name)?'studio.gallery.brand.'+name:'studio.gallery.trait.creative')}</small></span></button>)}</nav>
          <div className="studio-model-list">{profiles.filter(profile=>modelSearch?`${profile.label} ${profile.brand} ${tr('studio.gallery.trait.'+profile.description)}`.toLowerCase().includes(modelSearch.toLowerCase()):profile.brand===provider).map(profile=>{
            const row=choices.find(choice=>choice.model===profile.model),specs=rows.filter(item=>item.model===profile.model);
            const max=specs.map(item=>imageVariantDimensions(item).resolution).filter(value=>value!=='auto').sort((a,b)=>imageResolutionPixels(b)-imageResolutionPixels(a))[0];
            const timing=row?.duration_seconds,measured=timing&&timing.samples>=5&&Number.isFinite(timing.p50)&&Number.isFinite(timing.p90)&&timing.p90>=timing.p50;
            const premium=row?.membership_required||('premium' in profile&&profile.premium?'pro':undefined);
            const memberLocked=!!row&&row.eligible===false;
            return <button key={profile.model} data-studio-sku={row?.sku_id} data-studio-membership-locked={memberLocked||undefined} className={'studio-image-model studio-v2-model'+(profile.model===selected?.model?' active':'')+(!row?' is-unavailable':'')+(memberLocked?' is-member-locked':'')} disabled={switching||!row} title={!row?tr(profile.model==='seedream-4-0-250828'?'studio.gallery.providerSetupRequired':'studio.gallery.awaitingRoute'):memberLocked?tr('studio.gallery.memberOnly'):undefined} onClick={()=>{if(!p.loggedIn){if(row)void choose(row.sku_id);return;}if(memberLocked){setOpen(null);p.onUpgrade();return;}if(row)void choose(row.sku_id);}}>
              <BillingBrand model={profile.model} provider={profile.brand}/><div className="studio-model-copy"><strong>{profile.label}{premium&&<span className="studio-model-crown" title={tr('studio.gallery.memberOnly')} aria-label={tr('studio.gallery.memberOnly')}><GalleryIcon name="crown"/></span>}{!row&&<small className="studio-model-soon">{tr('studio.gallery.comingSoon')}</small>}</strong><p>{tr('studio.gallery.trait.'+profile.description)}</p><div className="studio-model-facts"><span><Icon name="coin"/>{row?tr('studio.fromCoins',{coins:Math.min(...specs.map(item=>item.coins_per_image))}):tr('studio.gallery.awaitingPrice')}</span><span><GalleryIcon name="image"/>{max?tr('studio.gallery.upTo',{resolution:max}):tr('studio.gallery.nativeSize')}</span><span title={!measured&&row?.duration_probe?tr('studio.gallery.probeNote',{resolution:row.duration_probe.resolution,quality:qualityLabel(row.duration_probe.quality)}):undefined}><Icon name="clock"/>{measured?tr('studio.gallery.timeRange',{min:Math.ceil(timing.p50),max:Math.ceil(timing.p90)}):row?.duration_probe?.source==='provider_probe'&&row.duration_probe.samples===1&&row.duration_probe.seconds>0?tr('studio.gallery.probeTime',{seconds:row.duration_probe.seconds}):tr('studio.gallery.unmeasured')}</span></div></div>{memberLocked?<span className="studio-member-action">{tr('studio.gallery.memberOnlyShort')}<Icon name="arrow"/></span>:profile.model===selected?.model&&<Icon name="check"/>}
            </button>;
          })}{!profiles.some(profile=>modelSearch?`${profile.label} ${profile.brand} ${tr('studio.gallery.trait.'+profile.description)}`.toLowerCase().includes(modelSearch.toLowerCase()):profile.brand===provider)&&<p className="studio-inline-note">{tr('studio.gallery.noMatches')}</p>}</div></div>
        <div className="studio-popover-foot"><span><GalleryIcon name="crown"/>{tr('studio.gallery.memberOnlyShort')}</span><span>{tr('studio.gallery.modelFoot')}</span></div></div>}
      {open==='parameters'&&selected&&<div ref={panel} className="studio-popover studio-parameter-popover" role="dialog" aria-label={tr('studio.settings')}><div className="studio-popover-title"><b>{tr('studio.settings')}</b><button disabled={switching} onClick={()=>{const first=choices.find(row=>row.model===selected.model);chooseCount(1);if(first)void choose(first.sku_id,false);}}>{tr('studio.reset')}</button></div>
        <div className="studio-parameter-group"><label>{tr('studio.ratio')}</label><div className="studio-ratios">{ratios.map(ratio=>{const [w,h]=ratio==='auto'?[1,1]:ratio.split(':').map(Number);return <button className={ratio===dimension.ratio?'active':''} key={ratio} disabled={switching} data-studio-ratio={ratio} aria-pressed={ratio===dimension.ratio} onClick={()=>applyVariant('aspect_ratio',ratio)}><span><i style={{width:19*w/Math.max(w,h),height:19*h/Math.max(w,h)}}/></span>{ratio==='auto'?tr('studio.auto'):ratio}</button>;})}</div></div>
        <div className="studio-parameter-group"><label>{tr('studio.outputCount')}</label><div className="studio-segmented">{[1,2,3,4].map(n=><button key={n} className={n===count?'active':''} disabled={switching} data-studio-count={n} aria-pressed={n===count} onClick={()=>chooseCount(n)}>{n}</button>)}</div></div>
        <div className="studio-parameter-group"><label>{tr('studio.resolution')}</label><div className="studio-segmented">{resolutions.map(resolution=>{const supported=variants.some(row=>imageVariantDimensions(row).resolution===resolution&&imageVariantDimensions(row).ratio===dimension.ratio);return <button key={resolution} className={resolution===dimension.resolution?'active':''} disabled={switching||!supported} title={supported?undefined:tr('studio.resolutionRatio')} data-studio-resolution={resolution} aria-pressed={resolution===dimension.resolution} onClick={()=>applyVariant('resolution',resolution)}>{resolution==='auto'?tr('studio.auto'):resolution}</button>;})}</div></div>
        {qualities.length>1&&<div className="studio-parameter-group"><label>{tr('studio.quality')}</label><div className="studio-segmented">{qualities.map(quality=><button key={quality} disabled={switching} className={quality===selected.quality?'active':''} aria-pressed={quality===selected.quality} data-studio-quality={quality} onClick={()=>applyVariant('quality',quality)}>{qualityLabel(quality)}</button>)}</div></div>}
        <div className="studio-parameter-cost"><span>{tr('studio.totalEstimated')}{count>1&&<small>{tr('studio.count',{count})}</small>}</span><b><Icon name="coin"/>{cost??'—'}<small>{tr('studio.coins')}</small></b></div></div>}

    </section>
    {p.loggedIn&&rows.length>0&&!selected&&<div role="alert" className="studio-error">{tr('studio.modelUnavailable')}<button onClick={()=>{setProvider(providers[0]);setOpen('models');}}>{tr('studio.chooseModel')}</button></div>}
    {(error||activeQuote?.error)&&<div role="alert" className="studio-error">{error||tr('studio.quoteError')}<button onClick={()=>{setError('');setQuote(null);setRetry(v=>v+1);void p.onRefresh();}}>{tr('studio.retry')}</button></div>}
    <div className="studio-footnote"><span><Icon name="coin"/>{p.loggedIn&&selected&&selected.eligible!==false&&generationPrompt&&promptValid&&!quoted&&!activeQuote?.error?tr('studio.quoting'):quoted?tr('studio.directCost',{estimated:activeQuote!.data!.estimated_coins}):tr('studio.feeNote')}</span><span>Ctrl / ⌘ + Enter</span></div>
    {!p.compact&&<div className="studio-inspiration"><span>{tr('studio.inspiration')}</span><div>{(['product','poster','illustration'] as const).map((kind,i)=><button key={kind} onClick={()=>fillPreset(kind)}><Icon name={(['grid','image','folder'] as const)[i]}/>{tr(`studio.preset.${kind}`)}</button>)}</div></div>}
  </div>;
}
