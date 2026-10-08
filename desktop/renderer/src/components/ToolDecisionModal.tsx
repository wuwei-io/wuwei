import React, { useEffect, useState } from 'react';
import type { Decision, DecisionResponse } from '../../../../src/types.js';

/** Human-only approval; custom answers are shown only when the decision allows them. */
export function ToolDecisionModal({ decision, lang, onRespond }: {
  decision: Decision; lang: 'zh' | 'en'; onRespond: (response: DecisionResponse) => void;
}) {
  const text = decision.i18n?.[lang];
  const [submitted, setSubmitted] = useState(false);
  const [custom, setCustom] = useState('');
  const respond = (response: DecisionResponse) => {
    if (submitted) return;
    setSubmitted(true);
    onRespond(response);
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopImmediatePropagation(); respond({ action: 'deny' }); }
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [submitted]);
  return <div className="tc-modal-mask tool-decision-mask">
    <div className="tc-modal tool-decision" role="dialog" aria-modal="true" aria-labelledby="tool-decision-title">
      <h3 id="tool-decision-title">{text?.title ?? decision.title}</h3>
      <p>{text?.question ?? decision.question}</p>
      {decision.context && <p>{decision.context}</p>}
      <div className="ask-opts">{decision.options.map(option =>
        <button type="button" className="ask-opt" key={option.value} data-decision-value={option.value}
          disabled={submitted} onClick={() => respond({ action: 'reply', value: option.value })}>
          <span className="ask-opt-label">{text?.optionLabels[option.value] ?? option.label}</span>
          {option.desc && <span className="ask-opt-desc">{option.desc}</span>}
        </button>)}</div>
      {decision.allowCustom && <div className="ask-custom">
        <textarea aria-label={lang === 'en' ? 'Custom reply' : '自定义回复'} value={custom}
          disabled={submitted} onChange={event => setCustom(event.target.value)} />
        <button type="button" disabled={submitted || !custom.trim()}
          onClick={() => respond({ action: 'reply', text: custom.trim() })}>
          {lang === 'en' ? 'Send reply' : '发送回复'}
        </button>
      </div>}
    </div>
  </div>;
}
