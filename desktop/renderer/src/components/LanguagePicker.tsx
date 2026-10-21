import React, {useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {getLanguagePreference, getLanguages, makeT, type Lang} from '../i18n.js';
import './language-picker.css';

/** All available languages and their native names come from bundled language packs. */
export function LanguagePicker({language,onChange}:{language:Lang;onChange:(language:Lang)=>void}) {
  const t=makeT(language),id=useId();
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0);
  const [position,setPosition]=useState({top:0,left:0,width:320,maxHeight:400});
  const trigger=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null),search=useRef<HTMLInputElement>(null);
  const [preference,setPreference]=useState(getLanguagePreference);
  useEffect(()=>setPreference(getLanguagePreference()),[language]);
  const locale=getLanguages().find(locale=>locale.code===language)!;
  const labels=new Intl.DisplayNames([language],{type:'language'});
  const entries=[{code:'system',nativeName:t('language.system'),name:t('language.systemDetail')},...getLanguages()];
  const fold=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase(language);
  const visible=entries.filter(entry=>fold([entry.code,entry.nativeName,entry.name,entry.code==='system'?'':labels.of(entry.code)].join(' ')).includes(fold(query)));
  const close=(focus=false)=>{setOpen(false);if(focus)trigger.current?.focus();};
  const select=(code:string)=>{setPreference(code);onChange(code);close(true);};
  useLayoutEffect(()=>{
    if(!open)return;
    const place=()=>{
      const rect=trigger.current!.getBoundingClientRect(),gap=8,edge=12;
      const width=Math.min(Math.max(rect.width,320),innerWidth-2*edge);
      const below=innerHeight-rect.bottom-gap-edge,above=rect.top-gap-edge;
      const maxHeight=Math.min(400,Math.max(below,above));
      const height=Math.min(400,Math.max(200,maxHeight));
      const top=below>=Math.min(300,height)||below>=above?rect.bottom+gap:Math.max(edge,rect.top-gap-height);
      const left=Math.max(edge,Math.min(locale.direction==='rtl'?rect.left:rect.right-width,innerWidth-width-edge));
      setPosition({top,left,width,maxHeight:Math.max(150,maxHeight)});
    };
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[open,locale.direction]);
  useEffect(()=>{
    if(!open)return;
    search.current?.focus();
    const outside=(event:PointerEvent)=>{if(!popup.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))close();};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close(true);}};
    document.addEventListener('pointerdown',outside);window.addEventListener('keydown',escape,true);
    return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('keydown',escape,true);};
  },[open]);
  useEffect(()=>{popup.current?.querySelector(`[data-language-index="${active}"]`)?.scrollIntoView({block:'nearest'});},[active,open]);
  const start=()=>{setQuery('');setActive(Math.max(0,entries.findIndex(entry=>entry.code===preference)));setOpen(true);};
  return <div className="language-setting">
    <div className="language-setting-copy"><b>{t('language.interface')}</b><p>{t('language.description')}</p></div>
    <button className="language-picker-trigger" ref={trigger} type="button" aria-label={t('language.choose')} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} onClick={()=>open?close():start()} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();start();}}}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/></svg>
      <span data-language-name={preference}>{preference==='system'?t('language.system'):locale.nativeName}</span><span aria-hidden="true">⌄</span>
    </button>
    <p className="language-setting-note">{t('language.keepContent')}</p>
    {open&&createPortal(<div className="language-picker-popup" ref={popup} style={position} dir={locale.direction} onKeyDown={event=>{
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setActive(index=>(index+(event.key==='ArrowDown'?1:-1)+visible.length)%Math.max(1,visible.length));}
      else if(event.key==='Enter'&&visible[active]){event.preventDefault();select(visible[active].code);}
      else if(event.key==='Tab')close(true);
    }}>
      <div className="language-picker-search"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input ref={search} type="text" value={query} placeholder={t('language.search')} aria-label={t('language.search')} role="combobox" aria-controls={id} aria-expanded="true" aria-autocomplete="list" aria-activedescendant={visible[active]?`${id}-${visible[active].code}`:undefined} onChange={event=>{setQuery(event.target.value);setActive(0);}}/>{query&&<button type="button" aria-label={t('language.clearSearch')} onClick={()=>{setQuery('');setActive(0);search.current?.focus();}}>×</button>}</div>
      <div className="language-picker-caption">{t('language.all')}<span>{getLanguages().length}</span></div>
      <div className="language-picker-options" role="listbox" id={id} aria-label={t('language.choose')}>
        {visible.map((entry,index)=><button key={entry.code} id={`${id}-${entry.code}`} role="option" type="button" tabIndex={-1} aria-selected={preference===entry.code} className={index===active?'active':''} data-language-index={index} data-language-code={entry.code} onPointerMove={()=>setActive(index)} onClick={()=>select(entry.code)}>
          <span className="language-picker-names"><b data-language-name={entry.code} lang={entry.code==='system'?language:entry.code}>{entry.nativeName}</b><small>{entry.code==='system'?entry.name:labels.of(entry.code)}</small></span><span className="language-picker-code" dir="ltr">{entry.code==='system'?'':entry.code.toUpperCase()}</span><span className="language-picker-check" aria-hidden="true">{preference===entry.code?'✓':''}</span>
        </button>)}
        {!visible.length&&<p className="language-picker-empty">{t('language.empty')}</p>}
      </div><div className="language-picker-foot">{t('language.instant')}</div>
    </div>,document.body)}
  </div>;
}
