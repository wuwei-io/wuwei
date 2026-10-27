import { tr } from "../../../../src/localization/index.js";
import React, { useState } from 'react';
import { UsageNoticeDialog } from './UsageNoticeDialog.js';

export function FreeQuotaGuide({ onClose, onUpgrade, balance, onSwitchPaid }: {
  onUpgrade: () => void;
  onClose: () => void;
  balance: number;
  onSwitchPaid: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const hasCoins = Number.isFinite(balance) && balance > 0;
  const switchPaid = async () => {
    if (busy) return;
    setBusy(true); setError(false);
    try { await onSwitchPaid(); } catch { setError(true); } finally { setBusy(false); }
  };
  return <UsageNoticeDialog variant="free" title={tr('ui.freequotaguide.today.free.quota.is.used.up.627d194')} onClose={onClose} onUpgrade={onUpgrade}
    busy={busy} secondaryAction={hasCoins ? { label: tr('billing.freecap.switchPaid'), onClick: () => void switchPaid() } : undefined}>
    <p className="usage-notice-description">
      <span>{tr('billing.freecap.resetNote')}</span>
      <span>{tr('billing.freecap.upgradeNote')}</span>
      {hasCoins && <span>{tr('billing.freecap.coinsNote')}</span>}
    </p>
    {error && <p className="usage-notice-description" role="alert">{tr('ui.billingpanel.unable.to.switch.please.retry.8f406cd')}</p>}
  </UsageNoticeDialog>;
}
