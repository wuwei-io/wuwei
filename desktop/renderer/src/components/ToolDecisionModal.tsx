import { tr, getCurrentLanguage } from "../../../../src/localization/index.js";
import React, { useEffect, useState } from 'react';
import type { Decision, DecisionResponse } from '../../../../src/types.js';

/** Human-only approval; custom answers are shown only when the decision allows them. */
export function ToolDecisionModal({ decision, lang, onRespond }: {
  decision: Decision; lang: string; onRespond: (response: DecisionResponse) => void;
}) {
  const text = decision.i18n?.[lang] ?? decision.i18n?.en;
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
        <textarea aria-label={tr("ui.tooldecisionmodal.custom.reply.38882df")} value={custom}
          disabled={submitted} onChange={event => setCustom(event.target.value)} />
        <button type="button" disabled={submitted || !custom.trim()}
          onClick={() => respond({ action: 'reply', text: custom.trim() })}>
          {tr("ui.tooldecisionmodal.send.reply.44c9f62")}
        </button>
      </div>}
    </div>
  </div>;
}
