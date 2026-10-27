import React,{useEffect,useMemo,useRef,useState} from 'react';
import {tr,localizeStoredText} from '../../../../src/localization/index.js';
import {imageModelLabel,type ImageCatalogEntry} from '../../../../src/imagegen/image-catalog.js';
import {BillingBrand} from './billing/BillingBrand.js';
import {studioBatches,type GalleryItem,type StudioArtwork} from './image-gallery-data.js';
import './image-gallery.css';
import {MediaLoadProgress} from './MediaLoadProgress.js';
import type {ImageTransferProgress} from '../../../../src/imagegen/image-transfer-progress.js';
import {MediaDetail} from './MediaDetail.js';

const galleryText=(key:string,values:Record<string,string|number>={})=>tr('studio.gallery.'+key,values);
export function GalleryIcon({name}:{name:string}){
  const paths:Record<string,React.ReactNode>={
    search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    grid:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    download:<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>,
    heart:<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>,
    close:<path d="m6 6 12 12M18 6 6 18"/>,
    copy:<><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v12h5"/></>,
    clock:<><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
    coin:<><circle cx="12" cy="12" r="9"/><path d="m12 7 3 5-3 5-3-5Z"/></>,
    crown:<path d="m3 6 4 4 5-6 5 6 4-4-2 13H5ZM5 16h14"/>,
    arrow:<path d="M5 12h14m-5-5 5 5-5 5"/>,
    check:<path d="m5 12 4 4L19 6"/>,
    image:<><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 5 5 3-3 4 4"/></>
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.image}</svg>;
}
function FavoriteButton({saved,onClick,compact=false}:{saved:boolean;onClick:()=>void;compact?:boolean}){
  const action=tr(saved?'studio.gallery.removeFavorite':'studio.gallery.favorite');
  return <button className={'studio-favorite-button'+(compact?' is-compact':'')} data-studio-favorite title={action} aria-label={action} aria-pressed={saved} onClick={onClick}><GalleryIcon name="heart"/>{!compact&&<span aria-live="polite">{tr(saved?'studio.gallery.favoriteSaved':'studio.gallery.favorite')}</span>}</button>;
}
function date(value?:number){if(!value)return '—';const d=new Date(value),pad=(n:number)=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
function duration(value?:number){return value===undefined?'—':tr('studio.gallery.seconds',{seconds:Math.max(1,Math.round(value/1000))});}
function quality(value?:string){return value?tr(value==='low'?'studio.light':value==='medium'?'studio.standard':value==='high'?'studio.high':value==='xhigh'?'studio.qualityExtra':value==='max'?'studio.qualityMax':'studio.auto'):'—';}
function download(art:StudioArtwork){
  if(!art.image)return;
  // The original tool data URL contains the downloaded PNG bytes, without a
  // canvas, thumbnail conversion or recompression.
  const a=document.createElement('a');a.href=art.image;a.download=`wuwei-${art.orderId||art.id.replace(/[^a-z0-9_-]/gi,'-')}.${/^data:image\/jpeg;/.test(art.image)?'jpg':/^data:image\/webp;/.test(art.image)?'webp':'png'}`;document.body.append(a);a.click();a.remove();
}
function readFavorites(scope:string):string[]{try{const ids=JSON.parse(localStorage.getItem('image-studio-favorites/'+scope)||'[]');return Array.isArray(ids)?ids.filter(id=>typeof id==='string'):[];}catch{return [];}}
interface Props{items:GalleryItem[];catalog:ImageCatalogEntry[];scope:string;busy:boolean;onReuse:(art:StudioArtwork)=>Promise<void>;onRecover:(art:StudioArtwork)=>Promise<void>}
export function ImageGallery(p:Props){
  const batches=useMemo(()=>studioBatches(p.items,p.catalog,p.busy),[p.items,p.catalog,p.busy]);
  const artworks=batches.flatMap(batch=>batch.artworks).filter(art=>!!art.image);
  const [search,setSearch]=useState(''),[period,setPeriod]=useState('all'),[large,setLarge]=useState(false),[favorites,setFavorites]=useState(()=>readFavorites(p.scope)),[onlyFavorites,setOnlyFavorites]=useState(false);
  const [selected,setSelected]=useState<string|null>(null),[error,setError]=useState(''),[working,setWorking]=useState<string|null>(null),[dimensions,setDimensions]=useState<Record<string,string>>({});
  const galleryRef=useRef<HTMLElement>(null);
  const [transfers,setTransfers]=useState<ImageTransferProgress[]>([]);
  useEffect(()=>{
    const stream=galleryRef.current?.closest<HTMLElement>('.stream');if(!stream)return;
    let frame=0;
    const fit=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const width=`${stream.offsetWidth-stream.clientWidth}px`;if(stream.style.getPropertyValue('--studio-gallery-scrollbar')!==width)stream.style.setProperty('--studio-gallery-scrollbar',width);});};
    const observer=new ResizeObserver(fit);observer.observe(stream);fit();return()=>{observer.disconnect();cancelAnimationFrame(frame);};
  },[]);
  // Query only existing, owned orders. Never regenerate or reauthorize here.
  const recoverRef=useRef(p.onRecover);recoverRef.current=p.onRecover;
  const pendingRows=batches.flatMap(batch=>batch.artworks).filter(art=>art.state==='pending'&&art.toolId&&(art.orderId||art.recoveryKey));
  const pendingRef=useRef(pendingRows);pendingRef.current=pendingRows;
  const pendingKey=pendingRows.map(art=>art.id).join('/');
  useEffect(()=>{
    if(p.busy||!pendingKey||p.scope.endsWith('/anonymous'))return;
    let alive=true,timer:ReturnType<typeof setTimeout>,offset=0;
    const check=async()=>{
      const rows=pendingRef.current;if(!alive||!rows.length)return;
      try{await recoverRef.current(rows[offset++%rows.length]);}catch{/* Retry this original order after transient reads fail. */}
      if(alive)timer=setTimeout(()=>void check(),5000);
    };
    timer=setTimeout(()=>void check(),0);
    return()=>{alive=false;clearTimeout(timer);};
  },[p.scope,p.busy,pendingKey]);
  useEffect(()=>{
    setTransfers([]);if((!p.busy&&!working&&!pendingKey)||!window.wuwei.imageProgress)return;let alive=true,polling=false;
    const update=async()=>{if(polling)return;polling=true;try{const rows=await window.wuwei.imageProgress({sid:p.scope.split('/')[0]});if(alive)setTransfers(Array.isArray(rows)?rows:[])}catch{}finally{polling=false}};
    void update();const timer=setInterval(()=>void update(),750);return()=>{alive=false;clearInterval(timer)};
  },[p.scope,p.busy,working,pendingKey]);
  const art=artworks.find(row=>row.id===selected),index=artworks.findIndex(row=>row.id===selected);
  useEffect(()=>{setSelected(null);setFavorites(readFavorites(p.scope));setSearch('');setError('');setWorking(null);},[p.scope]);
  const favorite=(item:StudioArtwork)=>{
    setFavorites(previous=>{const next=previous.includes(item.id)?previous.filter(id=>id!==item.id):[...previous,item.id];try{localStorage.setItem('image-studio-favorites/'+p.scope,JSON.stringify(next));}catch{setError(tr('studio.gallery.saveError'));}return next;});
  };
  const action=async(item:StudioArtwork,recover=false)=>{setWorking(item.id);setError('');try{if(recover)await p.onRecover(item);else{await p.onReuse(item);setSelected(null);}}catch{setError(galleryText(recover?'recoverError':'reuseError'));}finally{setWorking(null);}};
  const lower=search.trim().toLowerCase(),cutoff=period==='all'?0:Date.now()-(period==='day'?86400000:7*86400000);
  const shown=batches.filter(batch=>(!lower||[batch.prompt,...batch.artworks.map(art=>art.model||'')].join(' ').toLowerCase().includes(lower))&&(!cutoff||!!batch.ts&&batch.ts>=cutoff)&&(!onlyFavorites||batch.artworks.some(art=>favorites.includes(art.id))));
  const priorityBatch=shown.at(-1)?.id;
  return <section ref={galleryRef} className={'studio-gallery'+(large?' large':'')} aria-label={tr('studio.gallery.title')}>
    <div className="studio-gallery-top"><div><span className="studio-eyebrow">{tr('studio.gallery.eyebrow')}</span><h1>{tr('studio.gallery.headline')}</h1></div><div className="studio-gallery-tools"><label><GalleryIcon name="search"/><input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder={tr('studio.gallery.search')} aria-label={tr('studio.gallery.search')}/></label><select value={period} onChange={event=>setPeriod(event.target.value)} aria-label={tr('studio.gallery.period')}><option value="all">{tr('studio.gallery.allTime')}</option><option value="day">{tr('studio.gallery.day')}</option><option value="week">{tr('studio.gallery.week')}</option></select><button aria-label={tr('studio.gallery.favorites')} title={tr('studio.gallery.favorites')} aria-pressed={onlyFavorites} onClick={()=>setOnlyFavorites(v=>!v)}><GalleryIcon name="heart"/></button><button aria-label={tr('studio.gallery.layout')} title={tr('studio.gallery.layout')} aria-pressed={large} onClick={()=>setLarge(v=>!v)}><GalleryIcon name="grid"/></button></div></div>
    {error&&<p role="alert" className="studio-gallery-error">{error}</p>}
    {!shown.length&&<div className="studio-gallery-empty"><GalleryIcon name="image"/><h2>{galleryText(batches.length?'noMatches':'empty')}</h2><p>{galleryText(batches.length?'trySearch':'emptyHint')}</p></div>}
    {shown.map(batch=>{
      const first=batch.artworks[0],completed=batch.artworks.filter(art=>art.state==='complete').length,charged=batch.artworks.reduce((sum,art)=>sum+(art.charged||0),0),knownCharges=batch.artworks.some(art=>art.charged!==undefined);
      return <article className="studio-batch" key={batch.id} data-studio-batch={batch.id}>
        <div className="studio-batch-date"><time>{date(batch.ts)}</time><i/><span>{tr('studio.gallery.imageCount',{count:batch.artworks.length})}</span></div>
        <div className="studio-batch-heading"><h2>{batch.prompt||tr('studio.gallery.creation')}</h2><span className={'studio-batch-status'+(completed===batch.artworks.length?' complete':'')}>{galleryText(completed===batch.artworks.length?'completed':'batchProgress',{completed,count:batch.artworks.length})}</span><button disabled={p.busy||!!working} onClick={()=>void action(first)}><GalleryIcon name="copy"/>{tr('studio.gallery.reuse')}</button></div>
        {batch.prompt.length>60&&<details className="studio-batch-description"><summary>{tr('studio.gallery.fullPrompt')}</summary><p>{batch.prompt}</p></details>}
        <div className="studio-batch-meta">{first.model&&<span><BillingBrand model={first.model} provider=""/>{imageModelLabel({model:first.model})}</span>}{first.ratio&&<span>{first.ratio}</span>}{first.resolution&&<span>{first.resolution} · {quality(first.quality)}</span>}{knownCharges&&<span><GalleryIcon name="coin"/>{tr('studio.gallery.actual',{coins:charged})}</span>}</div>
        <div className="studio-art-grid">{batch.artworks.filter(item=>!onlyFavorites||favorites.includes(item.id)).map((item,i)=><div className="studio-art-card" key={item.id} data-studio-artwork={item.id}>
          {item.image?<button className="studio-art-open" aria-label={tr('studio.gallery.open',{number:i+1})} onClick={()=>setSelected(item.id)}><img src={item.image} alt={item.prompt} loading={batch.id===priorityBatch?'eager':'lazy'} decoding="async" fetchPriority={batch.id===priorityBatch&&i===0?'high':'auto'} onLoad={event=>{const image=event.currentTarget;setDimensions(previous=>previous[item.id]?previous:{...previous,[item.id]:`${image.naturalWidth.toLocaleString()} × ${image.naturalHeight.toLocaleString()} px`});}}/><span className="studio-art-index">{String(i+1).padStart(2,'0')}</span><span className="studio-art-zoom"><GalleryIcon name="search"/></span></button>:<div className={'studio-art-placeholder '+item.state}>{item.state==='running'?<span className="studio-gallery-orbit"/>:<GalleryIcon name="image"/>}<b>{transfers.some(row=>row.toolId===item.toolId&&!!row.toolId||row.orderId===item.orderId)?tr('ui.app.downloading.568fdf7'):galleryText(item.state)}</b>{transfers.filter(row=>row.toolId===item.toolId&&!!row.toolId||row.orderId===item.orderId).map(row=><MediaLoadProgress key={row.orderId} received={row.received} total={row.total}/>)}<small>{item.state==='unattempted'?tr('studio.gallery.notCharged'):(item.state==='pending'?galleryText('pendingHint'):item.message?localizeStoredText(item.message):galleryText('workingHint'))}</small>{item.state==='failed'&&<button disabled={p.busy||!!working} onClick={()=>void action(item)}>{tr('studio.gallery.retryOne')}</button>}{item.state==='pending'&&item.toolId&&(item.orderId||item.recoveryKey)&&<button disabled={p.busy||!!working} onClick={()=>void action(item,true)}>{working===item.id?tr('studio.gallery.checking'):tr('studio.gallery.checkOrder')}</button>}</div>}
          <div className="studio-art-bottom"><span>{item.charged!==undefined?<><GalleryIcon name="coin"/>{item.charged} {tr('studio.coins')}</>:galleryText(item.state==='unattempted'?'notCharged':item.state)}{item.elapsedMs!==undefined&&<> · {duration(item.elapsedMs)}</>}</span>{item.image&&<div><FavoriteButton compact saved={favorites.includes(item.id)} onClick={()=>favorite(item)}/><button title={tr('studio.gallery.download')} aria-label={tr('studio.gallery.download')} onClick={()=>download(item)}><GalleryIcon name="download"/></button></div>}</div>
        </div>)}</div><div className="studio-batch-foot"><span><GalleryIcon name="check"/>{tr('studio.gallery.saved')}</span>{completed>0&&<button onClick={()=>batch.artworks.filter(item=>!!item.image).forEach(download)}><GalleryIcon name="download"/>{tr('studio.gallery.downloadBatch')}</button>}</div>
      </article>;
    })}
    {art&&<MediaDetail kind="image" id={art.id} title={tr('studio.gallery.creation')} description={art.prompt}
      model={art.model?imageModelLabel({model:art.model}):undefined} brand={art.model?<BillingBrand model={art.model} provider=""/>:undefined} status={<span>{tr('studio.gallery.completed')}</span>}
      fileType={/^data:image\/jpeg;/.test(art.image||'')?'JPEG':/^data:image\/webp;/.test(art.image||'')?'WEBP':'PNG'} createdAt={date(art.ts)}
      specs={[{label:tr('studio.ratio'),value:art.ratio||'—'},{label:tr('studio.gallery.dimensions'),value:dimensions[art.id]||'—'},{label:tr('studio.resolution')+' / '+tr('studio.quality'),value:(art.resolution||'—')+' · '+quality(art.quality)},{label:tr('studio.gallery.elapsed'),value:duration(art.elapsedMs)},{label:tr('studio.gallery.actualCost'),value:art.charged!==undefined?`${art.charged} ${tr('studio.coins')}`:'—'}]}
      images={artworks.map(row=>({id:row.id,url:row.image!,alt:row.prompt}))} imageIndex={index} onSelectImage={i=>setSelected(artworks[i]?.id??null)} onImageLoad={(width,height)=>setDimensions(previous=>previous[art.id]?previous:{...previous,[art.id]:`${width.toLocaleString()} × ${height.toLocaleString()} px`})}
      note={tr('studio.gallery.originalNote')} downloadLabel={tr('studio.gallery.download')} onDownload={()=>download(art)}
      favorite={<FavoriteButton saved={favorites.includes(art.id)} onClick={()=>favorite(art)}/>} onReuse={()=>void action(art)} reuseDisabled={p.busy||!!working} onClose={()=>setSelected(null)} error={error}/>}
  </section>;
}
