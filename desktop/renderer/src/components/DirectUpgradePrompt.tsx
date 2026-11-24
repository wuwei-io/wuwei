import {useEffect, useRef} from 'react';
import {getCurrentLanguage} from '../../../../src/localization/index.js';
import {beginNotice, noticeAction} from './billing/tracking-context.js';

/** Open the existing checkout selector without an intermediate notice dialog. */
export function DirectUpgradePrompt({kind, balance, onOpen}: {
  kind: 'balance' | 'free';
  balance?: number;
  onOpen: () => void;
}) {
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    const context = beginNotice(kind === 'free' ? 'free_daily' : 'balance', {
      balance, context: 'shortage', payPage: getCurrentLanguage() === 'zh' ? 'alipay' : 'paddle',
    });
    // Automatic exposure is not an upgrade-button click.
    noticeAction('open_plans', {automatic: true}, context);
    onOpen();
  }, [kind, balance, onOpen]);
  return null;
}
