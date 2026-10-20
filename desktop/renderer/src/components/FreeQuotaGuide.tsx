import { tr, getCurrentLanguage } from "../../../../src/localization/index.js";
import React from 'react';

export function FreeQuotaGuide({ balance, hasMemberQuota, recommendations, lang, onChoose, onClose }: {
  balance: number;
  hasMemberQuota: boolean;
  recommendations: string[];
  lang: string;
  onChoose: () => void;
  onClose: () => void;
}) {
  const en = lang !== "zh";
  const coins = balance.toLocaleString(getCurrentLanguage(), { maximumFractionDigits:3 });
  return <>
    <div className="mq-overlay" style={{ zIndex: 200 }} onClick={onClose} />
    <div className="freecap-modal" role="dialog" aria-modal="true" aria-label={tr("ui.freequotaguide.today.free.quota.is.used.up.627d194")}>
      <button type="button" className="freecap-x" title={tr("msg.close")} onClick={onClose}>×</button>
      <div className="freecap-title">{tr("ui.freequotaguide.today.free.quota.is.used.up.627d194")}</div>
      <div className="freecap-sub">
        {balance > 0
          ? tr("ui.freequotaguide.you.still.have.wuwei.coins.choose.940142f", { p0: coins, p1: (en ? hasMemberQuota ? tr("ui.freequotaguide.message.ef4d1c5071") : '' : hasMemberQuota ? tr("ui.freequotaguide.message.ef4d1c5071") : '') })
          : hasMemberQuota
            ? tr("ui.freequotaguide.you.still.have.membership.allowance.available.ee00fcd")
            : tr("ui.freequotaguide.choose.recommended.value.model.to.continue.00b69ea")}
        {recommendations.length > 0 && <p>{tr("ui.freequotaguide.recommended.9a50dc1")}{recommendations.join(tr("ui.index.text.6486d4e"))}{tr("ui.app.text.76b3731")}</p>}
        <p>{tr("ui.freequotaguide.review.model.prices.before.choosing.your.1e44da8")}</p>
      </div>
      <div className="freecap-actions">
        <button type="button" className="freecap-primary" onClick={onChoose}>{tr("ui.freequotaguide.choose.recommended.value.model.0eb2158")}</button>
        <button type="button" className="freecap-ghost" onClick={onClose}>{tr("ui.freequotaguide.maybe.tomorrow.a4ce641")}</button>
      </div>
    </div>
  </>;
}
