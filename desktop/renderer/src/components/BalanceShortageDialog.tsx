import React from 'react';
import { tr, getCurrentLanguage } from '../../../../src/localization/index.js';
import { UsageNoticeDialog } from './UsageNoticeDialog.js';

export function BalanceShortageDialog({ onClose, onUpgrade,balance }: { onClose: () => void; onUpgrade: () => void;balance?:number }) {
  return <UsageNoticeDialog variant="balance" trackingMeta={{balance,context:'shortage',payPage:getCurrentLanguage()==='zh'?'alipay':'paddle'}} title={tr('billing.balance.title')} onClose={onClose} onUpgrade={onUpgrade}>
    <p className="usage-notice-description">{tr('billing.balance.upgradeNote')}</p>
  </UsageNoticeDialog>;
}
