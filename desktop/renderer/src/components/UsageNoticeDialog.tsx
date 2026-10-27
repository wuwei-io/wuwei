import React, { useEffect, useRef } from 'react';
import { tr } from '../../../../src/localization/index.js';
import './usage-notice.css';
import {beginNotice,noticeAction} from './billing/tracking-context.js';

export function UsageNoticeDialog({ variant, title, children, onClose, onUpgrade, secondaryAction, busy = false,trackingMeta }: {
  variant: 'free' | 'balance';
  trackingMeta?:Record<string,unknown>;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onUpgrade: () => void;
  secondaryAction?: { label: string; onClick: () => void };
  busy?: boolean;
}) {
  const root = useRef<HTMLElement>(null);
  const tracking=useRef<ReturnType<typeof beginNotice>|undefined>(undefined);
  useEffect(()=>{if(!tracking.current)tracking.current=beginNotice(variant==='free'?'free_daily':'balance',trackingMeta);},[variant]);
  const act=(action:string,run:()=>void)=>{noticeAction(action,{},tracking.current);run();};
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    root.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
      if (event.key !== 'Tab') return;
      const buttons = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('keydown', key, true); if (before?.isConnected) before.focus(); };
  }, []);

  const titleId = `usage-notice-${variant}-title`;
  return <div className="perm-overlay usage-notice-overlay">
    <section ref={root} tabIndex={-1} className={`usage-notice ${variant === 'balance' ? 'balance-shortage-dialog' : 'free-quota-notice'}`} role="alertdialog" aria-modal="true" aria-labelledby={titleId} onClick={event => event.stopPropagation()}>
      <button type="button" className="usage-notice-close" disabled={busy} aria-label={tr('msg.close')} title={tr('msg.close')} onClick={()=>act('close',onClose)}>
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
      </button>
      <div className="usage-notice-heading">
        <div className="usage-notice-status" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="8" />
            <path d={variant === 'free' ? 'M12 7.5V12l3 2' : 'M10 8h3a2 2 0 0 1 0 4h-2a2 2 0 0 0 0 4h3M12 6v2m0 8v2'} />
          </svg>
        </div>
        <h2 id={titleId} className="usage-notice-title">{title}</h2>
      </div>
      {children}
      <div className="usage-notice-actions">
        {secondaryAction && <button type="button" className="usage-notice-secondary" disabled={busy} onClick={()=>act('switch_paid',secondaryAction.onClick)}>{secondaryAction.label}</button>}
        <button type="button" className="usage-notice-upgrade" disabled={busy} onClick={()=>act('upgrade',onUpgrade)}>{tr('billing.selector.upgrade')}</button>
      </div>
    </section>
  </div>;
}
