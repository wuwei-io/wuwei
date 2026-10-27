import React from 'react';
import { tr } from '../../../../src/localization/index.js';
import { UsageNoticeDialog } from './UsageNoticeDialog.js';

export function BalanceShortageDialog({ onClose, onUpgrade }: { onClose: () => void; onUpgrade: () => void }) {
  return <UsageNoticeDialog variant="balance" title={tr('billing.balance.title')} onClose={onClose} onUpgrade={onUpgrade}>
    <p className="usage-notice-description">{tr('billing.balance.upgradeNote')}</p>
  </UsageNoticeDialog>;
}
