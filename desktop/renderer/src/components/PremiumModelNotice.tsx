import { tr, getCurrentLanguage } from "../../../../src/localization/index.js";
import React, { useEffect, useState } from 'react';

export function PremiumModelNotice({ en, busy, switching, onSwitch }: {
  en: boolean;
  busy: boolean;
  switching: boolean;
  onSwitch: () => void;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 10_000);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return <div className="premium-model-current" role="note">
    <span><strong>{tr("ui.premiummodelnotice.premium.model.high.cost.fast.spending.09e9fbd")}</strong><span>{busy ? (tr("ui.premiummodelnotice.switching.stops.this.task.resend.to.3400539")) : (tr("ui.premiummodelnotice.for.everyday.tasks.recommended.value.models.65109ed"))}</span></span>
    <button type="button" disabled={switching} onClick={onSwitch}>{busy ? tr("ui.premiummodelnotice.message.84c79db2b6") : tr("ui.premiummodelnotice.message.1abe7bbd28")}</button>
    <button type="button" className="premium-model-dismiss" aria-label={tr("ui.premiummodelnotice.dismiss.reminder.91d91f5")} title={tr("ui.premiummodelnotice.dismiss.reminder.91d91f5")} onClick={() => setVisible(false)}>×</button>
  </div>;
}
