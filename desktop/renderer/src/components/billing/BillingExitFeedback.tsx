import React, { useEffect, useRef, useState } from 'react';
import { tr } from '../../../../../src/localization/index.js';
import {
  BILLING_EXIT_FEEDBACK_NOTE_LIMIT, billingExitReasons, type BillingExit, type BillingExitReason,
} from '../../../../../src/billing/exit-feedback.js';
import { billingTrack } from './telemetry.js';
import './exit-feedback.css';

type Props = {
  visit: BillingExit;
  onSubmit: (reason: BillingExitReason, note?: string) => void;
  onDismiss: () => void;
};

export function BillingExitFeedback({ visit, onSubmit, onDismiss }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<BillingExitReason>();
  const [note, setNote] = useState('');
  const trimmedNote = note.trim();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    billingTrack('billing_exit_feedback_shown', { billing_session_id: visit.session, sku: visit.sku, context: visit.context });
    return () => element.close();
  }, [visit.session]);

  const labels = tr('billing.exit.reasons').split('|');
  return <dialog ref={dialog} className="billing-feedback-dialog" aria-labelledby="billing-feedback-title"
    aria-describedby="billing-feedback-description" onCancel={event => {
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
    }}>
    <button type="button" className="billing-feedback-close" onClick={onDismiss} aria-label={tr('msg.close')}>
      <span aria-hidden="true">×</span>
    </button>
    <header>
      <div className="billing-feedback-kicker">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 5v11a2 2 0 0 1-2 2H7l-4 3V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>
        </svg>
        {tr('billing.exit.heading')}
      </div>
      <h2 id="billing-feedback-title">{tr('billing.exit.prompt')}</h2>
      <p id="billing-feedback-description">{tr('billing.exit.instructions')}</p>
    </header>
    <form onSubmit={event => {
      event.preventDefault();
      if (reason || trimmedNote) onSubmit(reason ?? 'other', trimmedNote || undefined);
    }}>
      <fieldset className="billing-feedback-options" aria-label={tr('billing.exit.prompt')}>
        {billingExitReasons.map((code, index) => code === 'other' ? null : (
          <label key={code}>
            <input type="radio" name="billing-exit-reason" value={code} checked={reason === code} onChange={() => setReason(code)} />
            {labels[index]}
          </label>
        ))}
      </fieldset>
      <label className="billing-feedback-note" htmlFor="billing-feedback-note">
        {tr('billing.exit.note')} <span>{tr('ui.app.optional.a52b3ba')}</span>
      </label>
      <textarea id="billing-feedback-note" rows={2} value={note} maxLength={BILLING_EXIT_FEEDBACK_NOTE_LIMIT}
        placeholder={tr('billing.exit.placeholder')} onChange={event => setNote(event.target.value)} />
      <footer>
        <button type="button" className="billing-feedback-skip" onClick={onDismiss}>{tr('billing.exit.skip')}</button>
        <button type="submit" className="billing-feedback-submit" disabled={!reason && !trimmedNote}>{tr('billing.exit.submit')}</button>
      </footer>
    </form>
  </dialog>;
}
