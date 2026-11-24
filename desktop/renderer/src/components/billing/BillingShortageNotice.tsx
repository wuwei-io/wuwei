import React from 'react';
import {tr} from '../../../../../src/localization/index.js';

export type BillingShortageReason = 'balance' | 'quota';

export function BillingShortageNotice({reason}: {reason?: BillingShortageReason}) {
  if (!reason) return null;
  return <p className="billing-shortage-notice" role="status">
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5"/><path d="M10 9v5m0-9v1.4"/>
    </svg>
    <span>{tr(reason === 'quota' ? 'billing.shortage.quota' : 'billing.shortage.balance')}</span>
  </p>;
}
