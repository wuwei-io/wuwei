import React, { useEffect, useId, useMemo, useRef } from "react";
import { parseAnnouncementBody, splitAnnouncementHeading, type AnnouncementCard } from "./announcementContent.js";

type Props = {
  version: string;
  title: string;
  body: string;
  lang: string;
  onClose: () => void;
  onOpenManual?: () => void;
};

function FeatureIcon({ kind }: { kind: AnnouncementCard["icon"] }) {
  if (kind === "image") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="3"/><path d="m6.5 16 3.7-4 3 3 2.1-2.2 2.2 3.2"/><circle cx="16.5" cy="8.5" r="1.4"/></svg>;
  }
  if (kind === "company") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M8 20V9h8v11M8 12h8M11 15h2"/></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5c.6 4.4 3.1 6.9 7.5 7.5-4.4.6-6.9 3.1-7.5 7.5-.6-4.4-3.1-6.9-7.5-7.5 4.4-.6 6.9-3.1 7.5-7.5Z"/><path d="M18.5 3v3M20 4.5h-3"/></svg>;
}

export function AnnouncementModal({ version, title, body, lang, onClose, onOpenManual }: Props) {
  const en = lang === "en";
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const heading = useMemo(() => splitAnnouncementHeading(title, version), [title, version]);
  const content = useMemo(() => parseAnnouncementBody(body), [body]);

  useEffect(() => {
    previouslyFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    primaryRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus();
    };
  }, []);

  return (
    <div className="announce-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        ref={dialogRef}
        className="announce-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <button className="announce-close" type="button" aria-label={en ? "Close announcement" : "关闭公告"} title={en ? "Close" : "关闭"} onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>
        </button>

        <header className="announce-header">
          <div className="announce-eyebrow">{en ? "WHAT’S NEW" : "产品更新"}</div>
          <div className="announce-heading-row">
            <h2 id={titleId}>{heading.title}</h2>
            {heading.version && <span className="announce-version">{heading.version}</span>}
          </div>
          <p id={descriptionId}>{en ? "A quick look at what’s new in this release." : "这次更新，重点带来以下体验提升。"}</p>
        </header>

        <div className="announce-content" tabIndex={0} aria-label={en ? "Announcement details" : "公告详情"}>
          {content.kind === "cards" ? (
            <div className="announce-cards">
              {content.cards.map((card, index) => (
                <article className="announce-card" key={`${card.title}-${index}`}>
                  <span className="announce-card-icon"><FeatureIcon kind={card.icon} /></span>
                  <div className="announce-card-copy">
                    <div className="announce-card-title">
                      <h3>{card.title}</h3>
                      <span className="announce-new">NEW</span>
                    </div>
                    <p>{card.summary}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="announce-prose">
              {content.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </div>
          )}
        </div>

        <footer className="announce-footer">
          {onOpenManual && <button className="announce-secondary" type="button" onClick={onOpenManual}>{en ? "View guide" : "查看使用手册"}</button>}
          <button ref={primaryRef} className="announce-primary" type="button" onClick={onClose}>{en ? "Got it" : "知道了"}</button>
        </footer>
      </section>
    </div>
  );
}
