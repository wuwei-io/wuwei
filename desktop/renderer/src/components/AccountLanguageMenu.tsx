import React, {useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import {getLanguagePreference, getLanguages, makeT, type Lang} from '../i18n.js';
import './account-language-menu.css';

/** Kept inside the account footer DOM so its hover, focus and outside-click rules also cover the submenu. */
export function AccountLanguageMenu({language, onChange}: {language: Lang; onChange: (language: Lang) => void}) {
  const t = makeT(language), id = useId(), preference = getLanguagePreference();
  const entries = [{code: 'system', nativeName: t('language.system')}, ...getLanguages()];
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({top: 12, left: 12, width: 196, maxHeight: 360});
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), focusOnOpen = useRef(false);
  const cancelClose = () => clearTimeout(closeTimer.current);
  const close = (focus = false) => { cancelClose(); setOpen(false); if (focus) trigger.current?.focus(); };
  const start = (focus = false) => { cancelClose(); focusOnOpen.current = focus; setOpen(true); };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current!.getBoundingClientRect(), menu = trigger.current!.closest('.acct-menu')!.getBoundingClientRect();
      const edge = 12, gap = 6, width = Math.min(196, innerWidth - edge * 2), maxHeight = Math.min(360, innerHeight - edge * 2);
      const right = menu.right + gap, left = menu.left - gap - width;
      setPosition({width, maxHeight, left: right + width <= innerWidth - edge ? right : left >= edge ? left : Math.max(edge, innerWidth - width - edge),
        top: Math.max(edge, Math.min(rect.bottom - maxHeight, innerHeight - maxHeight - edge))});
    };
    place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    if (focusOnOpen.current) { popup.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus(); focusOnOpen.current = false; }
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  const select = (code: string) => { onChange(code); close(true); };
  const current = entries.find(entry => entry.code === preference)?.nativeName;
  return <div className="account-language-menu" ref={root} onMouseEnter={cancelClose}
    onMouseLeave={() => { closeTimer.current = setTimeout(() => setOpen(false), 160); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) close(); }}>
    <button type="button" className="acct-it account-language-trigger" ref={trigger} aria-haspopup="menu" aria-expanded={open} aria-controls={id}
      onMouseEnter={() => start()} onClick={() => { start(true); if (open) popup.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus(); }} onKeyDown={event => {
        if (['ArrowRight', 'ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); start(true); if (open) popup.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus(); }
      }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/></svg>
      <span>{t('acct.language')}</span><small>{current}</small><svg className="account-language-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg>
    </button>
    {open && <div className="account-language-popup" ref={popup} style={position} role="menu" id={id} aria-label={t('language.choose')}
      onMouseEnter={cancelClose} onKeyDown={event => {
        if (event.key === 'Escape' || event.key === 'ArrowLeft') { event.preventDefault(); event.stopPropagation(); close(true); return; }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); const buttons = [...popup.current!.querySelectorAll<HTMLButtonElement>('button')];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }}>
      {entries.map(entry => <button type="button" key={entry.code} role="menuitemradio" aria-checked={preference === entry.code}
        data-account-language={entry.code} tabIndex={-1} onClick={() => select(entry.code)}>
        <span className="account-language-check" aria-hidden="true">{preference === entry.code ? '✓' : ''}</span>
        <span lang={entry.code === 'system' ? language : entry.code} dir="auto">{entry.nativeName}</span>
      </button>)}
    </div>}
  </div>;
}
