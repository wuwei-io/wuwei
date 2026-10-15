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
    <span><strong>{en ? 'Premium model: high cost, fast spending' : '顶级模型：价格高、消耗快'}</strong><span>{busy ? (en ? 'Switching stops this task. Resend to continue with the value model.' : '切换会停止当前任务，重新发送后使用推荐模型。') : (en ? 'For everyday tasks, recommended value models make coins last longer.' : '日常任务建议使用高性价比推荐模型，让无为币更耐用。')}</span></span>
    <button type="button" disabled={switching} onClick={onSwitch}>{en ? (busy ? 'Stop & switch to value' : 'Switch to value model') : (busy ? '停止并改用推荐模型' : '改用高性价比模型')}</button>
    <button type="button" className="premium-model-dismiss" aria-label={en ? 'Dismiss reminder' : '关闭提示'} title={en ? 'Dismiss reminder' : '关闭提示'} onClick={() => setVisible(false)}>×</button>
  </div>;
}
