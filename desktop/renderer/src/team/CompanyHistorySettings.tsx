import { tr, getCurrentLanguage, localizeStoredText } from "../../../../src/localization/index.js";
import React, { useEffect, useState } from 'react';

export function CompanyHistorySettings({ lang }: { lang: string }) {
  const en = lang !== "zh";
  const api = (window as any).wuwei?.team;
  const [count, setCount] = useState('10');
  const [savedCount, setSavedCount] = useState(10);
  const [summary, setSummary] = useState(true);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    api?.configGet?.().then((c: any) => {
      if (!alive) return;
      setCount(String(Math.min(100, Math.max(2, Number(c?.historyRecentMessages) || 10))));
      setSavedCount(Math.min(100, Math.max(2, Number(c?.historyRecentMessages) || 10)));
      setSummary(c?.historyAutoSummary !== false);
      setReady(true);
    }).catch(() => { if (alive) setError(tr("ui.companyhistorysettings.could.not.load.settings.bccaf40")); });
    return () => { alive = false; };
  }, [api, en]);
  const save = async (patch: { historyRecentMessages?: number; historyAutoSummary?: boolean }) => {
    setSaving(true); setError('');
    try {
      if (!api?.configSet) throw new Error('unavailable');
      const result = await api.configSet(patch);
      setCount(String(result.historyRecentMessages));
      setSavedCount(result.historyRecentMessages);
      setSummary(result.historyAutoSummary);
    } catch { setError(tr("ui.companyhistorysettings.save.failed.please.try.again.204130d")); }
    finally { setSaving(false); }
  };
  return <>
    <div className="app-set-group">{tr("ui.companyhistorysettings.conversation.context.3c25f1f")}</div>
    <div className="app-set-row" style={{ cursor: 'default', gap: 10 }}>
      <label className="app-set-label" htmlFor="company-history-count">{tr("ui.companyhistorysettings.recent.messages.to.retain.d50593b")}</label>
      <span style={{ flex: 1 }} />
      <div className="set-field">
        <input id="company-history-count" type="number" min={2} max={100} step={1} value={count}
          disabled={!ready || saving} className="set-field-input"
          onChange={e => setCount(e.target.value)}
          onBlur={() => {
            const value = Math.min(100, Math.max(2, Math.round(Number(count)) || 10));
            setCount(String(value));
            if (ready && !saving && value !== savedCount) void save({ historyRecentMessages: value });
          }}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        <span className="set-field-unit">{tr("ui.companyhistorysettings.messages.e958b0a")}</span>
      </div>
    </div>
    <div className="app-set-row" style={{ cursor: 'default' }}>
      <div className="app-set-text">
        <label className="app-set-label" htmlFor="company-history-summary">{tr("ui.companyhistorysettings.summarize.older.messages.3122c5c")}</label>
        <div className="app-set-hint">{tr("ui.companyhistorysettings.keep.short.local.digest.of.earlier.4bc06ce")}</div>
      </div>
      <input id="company-history-summary" type="checkbox" className="app-set-toggle" checked={summary}
        disabled={!ready || saving} onChange={e => void save({ historyAutoSummary: e.target.checked })} />
    </div>
    <div className="app-set-hint" style={{ marginBottom: 16 }}>{tr("ui.companyhistorysettings.default.messages.applies.to.company.private.9634358")}</div>
    {error && <div role="alert" style={{ color: 'var(--danger, #b33)', marginBottom: 12 }}>{localizeStoredText(error, getCurrentLanguage())}</div>}
  </>;
}
