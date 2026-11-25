import React, { useEffect, useState } from 'react';
import { modelReasoning, reasoningKey, resolveModelEffort, type ReasoningEffort } from '../../../../src/model-reasoning.js';
import { type ModelChoice } from '../../../../src/model-selection.js';
import { tr } from '../../../../src/localization/index.js';

export function ModelReasoningDefaults({ models, label }: { models: ModelChoice[]; label: (level: ReasoningEffort) => string }) {
  const [defaults, setDefaults] = useState<Record<string, ReasoningEffort>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { let alive = true; void window.wuwei.getSettings().then(r => { if (alive) setDefaults(r?.settings?.modelEffortDefaults ?? {}); }); return () => { alive = false; }; }, []);
  const rows = [...new Map(models.filter(row => !['images','videos'].includes(row.category) && modelReasoning(row.modelId)).map(row => [row.key, row])).values()];
  async function save(row: ModelChoice, level: ReasoningEffort) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await window.wuwei.setModelEffort({providerId:row.providerId,model:row.modelId,effort:level,asDefault:true});
      setDefaults(result.modelEffortDefaults ?? {}); window.dispatchEvent(new Event('wuwei-effort-change'));
    } catch { setError(tr('reasoning.saveError')); }
    finally { setBusy(false); }
  }
  return <div className="model-reasoning-defaults">
    <div className="app-set-label">{tr('reasoning.defaults')}</div>
    <p className="app-set-hint">{tr('reasoning.defaultsHint')}</p>
    {rows.map(row => <label className="app-set-row" key={row.key} style={{cursor:'default', gap:12}}>
      <span className="app-set-text"><span className="app-set-label" style={{display:'block'}}>{row.labelEn || row.label}</span><small className="app-set-hint" style={{display:'block',marginTop:3}}>{row.category === 'connections' ? row.connectionLabel : tr('reasoning.hosted')}</small></span>
      <select aria-label={`${row.labelEn || row.label} ${tr('reasoning.default')}`} disabled={busy}
        value={resolveModelEffort(row.providerId,row.modelId,{modelEffortDefaults:defaults},false)}
        onChange={e => void save(row,e.target.value as ReasoningEffort)}>
        {modelReasoning(row.modelId)!.levels.map(level => <option key={level} value={level}>{label(level)}</option>)}
      </select>
    </label>)}
    {error && <p role="alert">{error}</p>}
  </div>;
}
