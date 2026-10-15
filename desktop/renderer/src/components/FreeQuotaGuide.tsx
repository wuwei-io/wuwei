import React from 'react';

export function FreeQuotaGuide({ balance, hasMemberQuota, recommendations, lang, onChoose, onClose }: {
  balance: number;
  hasMemberQuota: boolean;
  recommendations: string[];
  lang: 'zh' | 'en';
  onChoose: () => void;
  onClose: () => void;
}) {
  const en = lang === 'en';
  const coins = balance.toLocaleString(en ? 'en-US' : 'zh-CN', { maximumFractionDigits: 6 });
  return <>
    <div className="mq-overlay" style={{ zIndex: 200 }} onClick={onClose} />
    <div className="freecap-modal" role="dialog" aria-modal="true" aria-label={en ? "Today's free quota is used up" : '今日免费额度已用完'}>
      <button type="button" className="freecap-x" title={en ? 'Close' : '关闭'} onClick={onClose}>×</button>
      <div className="freecap-title">{en ? "Today's free quota is used up" : '今日免费额度已用完'}</div>
      <div className="freecap-sub">
        {balance > 0
          ? en ? `You still have ${coins} Wuwei coins. Choose a recommended value model to continue; ${hasMemberQuota ? 'your membership allowance is used first, then ' : ''}usage is charged by token from your coins.` : `你还有 ${coins} 无为币，建议选择高性价比推荐模型继续使用，${hasMemberQuota ? '优先使用会员额度，用尽后再' : ''}按实际 token 用量扣除无为币。`
          : hasMemberQuota
            ? en ? 'You still have membership allowance available. Choose a recommended value model to keep going.' : '你的会员额度仍可使用，建议选择高性价比推荐模型继续。'
            : en ? 'Choose a recommended value model to continue.' : '建议选择高性价比推荐模型继续。'}
        {recommendations.length > 0 && <p>{en ? 'Recommended: ' : '推荐：'}{recommendations.join(en ? ', ' : '、')}{en ? '.' : '。'}</p>}
        <p>{en ? 'Review model prices before choosing. Your daily free quota resets tomorrow.' : '选择前可查看模型价格，明天也可继续使用恢复的每日免费额度。'}</p>
      </div>
      <div className="freecap-actions">
        <button type="button" className="freecap-primary" onClick={onChoose}>{en ? 'Choose a recommended value model' : '选择高性价比推荐模型'}</button>
        <button type="button" className="freecap-ghost" onClick={onClose}>{en ? 'Maybe tomorrow' : '明天再用免费额度'}</button>
      </div>
    </div>
  </>;
}
