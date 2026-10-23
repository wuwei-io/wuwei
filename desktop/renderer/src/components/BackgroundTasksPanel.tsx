import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { tr } from '../../../../src/localization/index.js';
import './background-queue.css';

export interface TaskPanelRow {
  id: string;
  title: string;
  queued: boolean;
  backgroundId?: string;
  onOpen?: () => void;
  onStop?: () => void;
}

function TaskIcon({ queued = false }: { queued?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {queued ? <><circle cx="12" cy="12" r="8"/><path d="M12 7.5v5l3 1.8"/></> : <><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M9 5V3m6 2V3M8 10h8m-8 4h5"/></>}
  </svg>;
}

export function BackgroundTasksPanel({ rows, heading, onClose, onStopAll }: { rows: TaskPanelRow[]; heading?: string; onClose: () => void; onStopAll?: () => void }) {
  const closeLatest = useRef(onClose);
  closeLatest.current = onClose;
  const close = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ right: 18, bottom: 150 });
  useLayoutEffect(() => {
    // Keep the entire input (including a queue notice) clear, in both chat layouts.
    const anchor = [...document.querySelectorAll<HTMLElement>('.tc-room-queue,.tc-composer,.composer')].find(el => el.getBoundingClientRect().height > 0);
    const place = () => {
      const rect = anchor?.getBoundingClientRect();
      setPosition({ right: Math.max(16, rect ? window.innerWidth - rect.right : 18), bottom: Math.max(16, Math.min(window.innerHeight - 160, rect ? window.innerHeight - rect.top + 12 : 150)) });
    };
    place();
    const observer = new ResizeObserver(place);
    if (anchor) observer.observe(anchor);
    window.addEventListener('resize', place);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); };
  }, []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); closeLatest.current(); } };
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('keydown', escape); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <>
    <div className="mq-overlay" onClick={onClose}/>
    <div className="tasks-panel task-center" role="dialog" aria-label={heading || tr('background.tasks.heading')} style={{ ...position, maxHeight: `calc(100vh - ${position.bottom + 16}px)` }}>
      <header className="tp-head"><span className="tp-heading-icon"><TaskIcon/></span><strong>{heading || tr('background.tasks.heading')}</strong><span className="tp-total">{rows.length}</span><button ref={close} type="button" className="tp-close" onClick={onClose} aria-label={tr('msg.close')}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 8 8m0-8-8 8"/></svg></button></header>
      <div className="tp-groups">
        {[false, true].map(queued => {
          const group = rows.filter(row => row.queued === queued);
          if (!group.length) return null;
          const state = tr(queued ? 'background.tasks.queued' : 'foot.running');
          return <section className={'tp-group' + (queued ? ' is-queued' : '')} key={String(queued)}>
            <div className="tp-group-head"><span className="tp-state-dot"/>{state}<span className="tp-group-count">{group.length}</span></div>
            {group.map(row => <div className="tp-item" key={row.id} data-background-task={row.backgroundId}>
              <span className="tp-task-icon"><TaskIcon queued={queued}/></span>
              <div className="tp-copy">
                <button type="button" className="tp-title" disabled={!row.onOpen} title={row.title} onClick={row.onOpen}>{row.title}</button>
                <div className="tp-description">{tr(queued ? 'background.tasks.autoStart' : row.onOpen ? 'background.notice.view' : 'foot.bgRunning')}{!queued && row.onOpen && <span aria-hidden="true"> →</span>}</div>
              </div>
              <span className={'tp-state' + (queued ? ' queued' : '')}>{state}</span>
              {row.onStop && <button type="button" className="tp-stop" title={tr('tasks.stopThis')} onClick={row.onStop}>{tr('composer.stop')}</button>}
            </div>)}
          </section>;
        })}
      </div>
      <footer className="tp-foot"><span>{tr('background.tasks.keepRunning')}</span>{onStopAll && <button className="tp-stopall" onClick={onStopAll}>{tr('ui.app.stop.all.1b2f691')}</button>}</footer>
    </div>
  </>;
}
