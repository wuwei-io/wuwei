import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {tr} from '../../../../src/localization/index.js';
import './media-detail.css';

type DetailImage={id:string;url:string;alt:string};
type Props={
 kind:'image'|'video';id:string;title:string;description:string;brand?:React.ReactNode;model?:string;status:React.ReactNode;
 specs:{label:string;value:React.ReactNode}[];createdAt:string;fileType:string;note:string;
 images?:DetailImage[];imageIndex?:number;onSelectImage?:(index:number)=>void;onImageLoad?:(width:number,height:number)=>void;
 video?:React.ReactNode;previewCaption?:string;favorite:React.ReactNode;extra?:React.ReactNode;error?:string;
 downloadLabel:string;downloadDisabled?:boolean;reuseDisabled?:boolean;
 onDownload:()=>void;onReuse:()=>void;onClose:()=>void;
};
function DetailIcon({name}:{name:'close'|'copy'|'check'|'clock'|'download'|'arrow'|'left'|'right'|'expand'|'edit'}){
 const paths={close:<path d="m6 6 12 12M18 6 6 18"/>,copy:<><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v12h5"/></>,check:<path d="m5 12 4 4L19 6"/>,clock:<><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,download:<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>,arrow:<path d="M5 12h14m-5-5 5 5-5 5"/>,left:<path d="m14 7-5 5 5 5"/>,right:<path d="m10 7 5 5-5 5"/>,expand:<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>,edit:<><path d="m14 5 5 5M4 20l5-1L21 7l-5-5L4 14Z"/><path d="M4 4h6M3 8v13h13v-6"/></>};
 return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}
export function MediaDetail(p:Props){
 const [zoom,setZoom]=useState(false),[expanded,setExpanded]=useState(false),[copied,setCopied]=useState(false),[copyError,setCopyError]=useState(''),[imageError,setImageError]=useState(false);
 const restoreFocus=useRef(true);
 const panel=useRef<HTMLElement>(null),close=useRef<HTMLButtonElement>(null),description=useRef<HTMLParagraphElement>(null),copyTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),callbacks=useRef(p),imageStage=useRef<HTMLDivElement>(null),[hasLongPrompt,setHasLongPrompt]=useState(false);
 callbacks.current=p;const images=p.images??[],index=p.imageIndex??0,current=images[index];
 useEffect(()=>{setZoom(false);setExpanded(false);setCopied(false);setCopyError('');setImageError(false);clearTimeout(copyTimer.current);if(imageStage.current){imageStage.current.scrollTop=0;imageStage.current.scrollLeft=0}},[p.id]);
 useEffect(()=>{const node=description.current;if(!node)return;const fit=()=>setHasLongPrompt(node.scrollHeight>node.clientHeight+1);const observer=new ResizeObserver(fit);observer.observe(node);fit();return()=>observer.disconnect()},[p.description,expanded]);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;close.current?.focus();
  const keyboard=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();restoreFocus.current=true;callbacks.current.onClose();return}
   const props=callbacks.current,editable=e.target instanceof Element?e.target.closest('input,textarea,select,[contenteditable=true]'):null;
   if(props.kind==='image'&&!editable&&props.images&&props.images.length>1&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){
    if(imageStage.current?.classList.contains('is-original'))return;
    e.preventDefault();props.onSelectImage?.(((props.imageIndex??0)+(e.key==='ArrowRight'?1:-1)+props.images.length)%props.images.length);
   }
   if(e.key==='Tab'){
    const nodes=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],video[controls],[tabindex="0"]')??[]).filter(node=>node.getClientRects().length>0);
    if(!nodes.length)return;if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus()}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus()}
   }
  };
  document.addEventListener('keydown',keyboard,true);return()=>{document.removeEventListener('keydown',keyboard,true);clearTimeout(copyTimer.current);if(restoreFocus.current&&previous?.isConnected)previous.focus()};
 },[]);
 const copy=async()=>{const id=p.id;try{await navigator.clipboard.writeText(p.description);if(callbacks.current.id!==id)return;setCopyError('');setCopied(true);clearTimeout(copyTimer.current);copyTimer.current=setTimeout(()=>setCopied(false),1800)}catch{if(callbacks.current.id===id)setCopyError(tr('studio.gallery.copyError'))}};
 const dismiss=()=>{restoreFocus.current=true;p.onClose()};
 const flip=(delta:number)=>p.onSelectImage?.((index+delta+images.length)%images.length);
 return createPortal(<div className="media-detail-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)dismiss()}}><section className={'media-detail is-'+p.kind} ref={panel} data-work-id={p.id} role="dialog" aria-modal="true" aria-labelledby="media-detail-title">
  <header className="md-header"><div><span className="md-brand-mark" aria-hidden="true"/><b>{tr('media.detailTitle')}</b><i/><span>{p.kind==='image'?tr('studio.gallery.creation'):tr('video.title')}</span></div><button ref={close} className="md-icon-button" aria-label={tr('studio.gallery.close')} onClick={dismiss}><DetailIcon name="close"/></button></header>
  <div className="md-layout"><div className="md-preview">
   <div className="md-preview-toolbar"><span>{p.kind==='image'?<>{String(index+1).padStart(2,'0')} <i>/ {String(images.length).padStart(2,'0')}</i></>:p.fileType}</span><div><span>{tr('media.fullFrame')}</span>{p.kind==='image'&&<button aria-pressed={zoom} aria-label={tr(zoom?'media.fit':'media.originalSize')} onClick={()=>setZoom(v=>!v)}><DetailIcon name="expand"/>{zoom?tr('media.fit'):'100%'}</button>}</div></div>
   {p.kind==='image'?<><div ref={imageStage} className={'md-image-stage'+(zoom?' is-original':'')}>
    {current&&<img key={current.id} className="md-original" src={current.url} alt={current.alt} decoding="async" fetchPriority="high" onLoad={e=>{setImageError(false);p.onImageLoad?.(e.currentTarget.naturalWidth,e.currentTarget.naturalHeight)}} onError={()=>setImageError(true)}/>}
    {imageError&&<p className="md-image-error" role="alert">{tr('media.imageError')}</p>}
    {images.length>1&&!zoom&&<><button className="md-image-step previous" aria-label={tr('media.previous')} onClick={()=>flip(-1)}><DetailIcon name="left"/></button><button className="md-image-step next" aria-label={tr('media.next')} onClick={()=>flip(1)}><DetailIcon name="right"/></button></>}
   </div><nav className="md-image-strip" aria-label={tr('studio.gallery.otherImages')}>{images.map((image,i)=><button key={image.id} aria-label={tr('studio.gallery.open',{number:i+1})} aria-pressed={i===index} onClick={()=>p.onSelectImage?.(i)}><img src={image.url} alt="" loading={i===index?'eager':'lazy'} decoding="async" fetchPriority="low"/><span>{String(i+1).padStart(2,'0')}</span></button>)}{images.length>1&&<span className="md-strip-hint">{tr('media.imageKeys')}</span>}</nav></>:<><div className="md-video-stage">{p.video}</div><div className="md-video-caption"><span><i/>{tr('media.playback')}</span><span>{p.previewCaption??tr('media.fullFrame')}</span></div></>}
  </div><aside className="md-inspector"><div className="md-inspector-content">
   <div className="md-work-heading"><span>{tr(p.kind==='image'?'media.imageEyebrow':'media.videoEyebrow')}</span><div>{p.status}</div></div><h2 id="media-detail-title">{p.title}</h2>
   {(p.brand||p.model)&&<div className="md-model-line">{p.brand}<b>{p.model}</b></div>}
   <div className="md-prompt"><div className="md-section-label"><span>{tr('studio.description')}</span><button className="md-icon-button" aria-label={tr('studio.gallery.copy')} title={tr('studio.gallery.copy')} onClick={()=>void copy()}><DetailIcon name={copied?'check':'copy'}/></button></div><p ref={description} className={expanded?'is-expanded':''}>{p.description}</p>{(hasLongPrompt||expanded)&&<button className="md-prompt-toggle" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{tr(expanded?'media.collapsePrompt':'media.expandPrompt')}<DetailIcon name="right"/></button>}<span className="md-copy-status" role="status" aria-live="polite">{copied?tr('media.copied'):''}</span></div>
   <section className="md-specs" aria-label={tr('media.parameters')}><div className="md-section-label"><span>{tr('media.parameters')}</span><span className="md-file-type">{p.fileType}</span></div><dl>{p.specs.map(({label,value})=><React.Fragment key={label}><dt>{label}</dt><dd>{value}</dd></React.Fragment>)}</dl></section>
   <div className="md-created"><DetailIcon name="clock"/><time>{p.createdAt}</time></div>{p.extra}
  </div><footer className="md-actions"><p className="md-download-note"><i/>{p.note}</p><div className="md-primary-actions"><button className="md-download" disabled={p.downloadDisabled} onClick={p.onDownload}><DetailIcon name="download"/>{p.downloadLabel}</button><div className="md-favorite">{p.favorite}</div></div><button className="md-reuse" disabled={p.reuseDisabled} onClick={()=>{restoreFocus.current=false;p.onReuse()}}><DetailIcon name="edit"/>{tr('studio.gallery.reuseFull')}<DetailIcon name="arrow"/></button>{(p.error||copyError)&&<p className="md-error" role="alert">{p.error||copyError}</p>}</footer></aside></div>
 </section></div>,document.body);
}
