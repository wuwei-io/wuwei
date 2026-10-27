import { tr, getCurrentLanguage } from "../../../../src/localization/index.js";
import React, { useEffect, useId, useMemo, useRef } from "react";
import { AnnouncementMarkdown } from "./AnnouncementMarkdown.js";
import { parseAnnouncementBody, splitAnnouncementHeading, type AnnouncementCard } from "./announcementContent.js";

type Props = {
  version: string;
  title: string;
  body: string;
  lang: string;
  onClose: () => void;
  onAcknowledge?: () => void;
  onOpenManual?: () => void;
};

function FeatureIcon({ kind }: { kind: AnnouncementCard["icon"] }) {
  if (kind === "video") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="12" height="14" rx="2.5"/><path d="m15 10 6-4v12l-6-4"/></svg>;
  }
  if (kind === "image") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/></svg>;
  }
  if (kind === "company") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="3"/><path d="M6 21v-2a6 6 0 0 1 12 0v2M5 5a3 3 0 0 0 0 6M19 5a3 3 0 0 1 0 6M2 19v-2a5 5 0 0 1 3-4M22 19v-2a5 5 0 0 0-3-4"/></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5c.6 4.4 3.1 6.9 7.5 7.5-4.4.6-6.9 3.1-7.5 7.5-.6-4.4-3.1-6.9-7.5-7.5 4.4-.6 6.9-3.1 7.5-7.5Z"/><path d="M18.5 3v3M20 4.5h-3"/></svg>;
}

export function AnnouncementModal({ version, title, body, lang, onClose, onAcknowledge, onOpenManual }: Props) {
  const en = lang !== "zh";
  const titleId = useId();

  const dialogRef = useRef<HTMLElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const heading = useMemo(() => splitAnnouncementHeading(title || (tr("ui.announcementmodal.product.updates.6ebbd9e")), version), [title, version, en]);
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
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])'));
        if (!focusable.length) return;
        const visible = focusable.filter(el => el.getClientRects().length > 0);
        if (!visible.length) return;
        const first = visible[0];
        const last = visible[visible.length - 1];
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

      >
        <button className="announce-close" type="button" aria-label={tr("ui.announcementmodal.close.announcement.fc11055")} title={tr("msg.close")} onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>
        </button>

        <header className="announce-header">
          <div className="announce-eyebrow">{tr("ui.announcementmodal.what.new.3d27833")}</div>
          <div className="announce-heading-row"><h2 id={titleId}>{heading.title}</h2></div>
        </header>

        <div className="announce-content" tabIndex={0} aria-label={tr("ui.announcementmodal.announcement.details.02ea311")}>
          {content.kind === "cards" ? (
            <div className="announce-cards">
              {content.intro && <AnnouncementMarkdown>{content.intro}</AnnouncementMarkdown>}
              {content.cards.map((card, index) => (
                <article className="announce-card" key={`${card.title}-${index}`}>
                  <span className="announce-card-icon"><FeatureIcon kind={card.icon} /></span>
                  <div className="announce-card-copy">
                    <div className="announce-card-title">
                      <h3>{card.title}</h3>
                      <span className="announce-new">{tr("ui.announcementmodal.new.7a90e30")}</span>
                    </div>
                    <AnnouncementMarkdown>{card.summary}</AnnouncementMarkdown>
                    {card.details && <details className="announce-details"><summary>{tr("ui.announcementmodal.details.f6a9d6d")}</summary><AnnouncementMarkdown>{card.details}</AnnouncementMarkdown></details>}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="announce-prose">
              <AnnouncementMarkdown>{content.paragraphs.join("\n\n")}</AnnouncementMarkdown>
            </div>
          )}
        </div>

        <footer className="announce-footer">
          {onOpenManual && <button className="announce-secondary" type="button" onClick={onOpenManual}>{tr("ui.announcementmodal.view.guide.6929c02")}</button>}
          <button ref={primaryRef} className="announce-primary" type="button" onClick={onAcknowledge ?? onClose}>{tr("ui.announcementmodal.mark.as.read.e3863de")}</button>
        </footer>
      </section>
    </div>
  );
}
