import React, { useEffect, useState } from 'react';

export function CompanyHistorySettings({ lang }: { lang: string }) {
  const en = lang === 'en';
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
    }).catch(() => { if (alive) setError(en ? 'Could not load settings.' : '设置加载失败，请重新打开设置。'); });
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
    } catch { setError(en ? 'Save failed. Please try again.' : '保存失败，请重试。'); }
    finally { setSaving(false); }
  };
  return <>
    <div className="app-set-group">{en ? 'Conversation context' : '对话上下文'}</div>
    <div className="app-set-row" style={{ cursor: 'default', gap: 10 }}>
      <label className="app-set-label" htmlFor="company-history-count">{en ? 'Recent messages to retain' : '保留最近消息数'}</label>
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
        <span className="set-field-unit">{en ? 'messages' : '条'}</span>
      </div>
    </div>
    <div className="app-set-row" style={{ cursor: 'default' }}>
      <div className="app-set-text">
        <label className="app-set-label" htmlFor="company-history-summary">{en ? 'Summarize older messages' : '自动摘要旧消息'}</label>
        <div className="app-set-hint">{en
          ? 'Keep a short local digest of earlier messages without an extra model call. Turn off to send only recent context.'
          : '本地摘录旧消息生成简短摘要，不额外消耗模型 token；关闭后只发送近期上下文。'}</div>
      </div>
      <input id="company-history-summary" type="checkbox" className="app-set-toggle" checked={summary}
        disabled={!ready || saving} onChange={e => void save({ historyAutoSummary: e.target.checked })} />
    </div>
    <div className="app-set-hint" style={{ marginBottom: 16 }}>{en
      ? 'Default: 10 messages (2–100). Applies to company private/group chats on the next request. Original history stays available; long past text is shortened and tool calls stay paired.'
      : '默认 10 条，可设 2–100 条。适用于一人公司私聊和群聊，下次请求生效；原始记录保留，过长旧正文会截短，工具调用与结果保持配对。'}</div>
    {error && <div role="alert" style={{ color: 'var(--danger, #b33)', marginBottom: 12 }}>{error}</div>}
  </>;
}
