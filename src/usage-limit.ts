export type UsageLimitKind = 'free' | 'balance';
export type UsageLimitDestination = 'login' | 'recommend' | 'pay';
export type PaidAllowance = {
  coin?: { balance?: number };
  membership?: { weeklyQuota?: { active?: boolean; remainingPct?: number } };
};

export function hasPaidAllowance(account: PaidAllowance | null | undefined): boolean {
  const balance = account?.coin?.balance;
  const quota = account?.membership?.weeklyQuota;
  return (typeof balance === 'number' && Number.isFinite(balance) && balance > 0)
    || (quota?.active === true && typeof quota.remainingPct === 'number' && Number.isFinite(quota.remainingPct) && quota.remainingPct > 0);
}

/** A gateway marker takes precedence over error text from an upstream provider. */
export function usageLimitKind(raw: string, freeModel: boolean): UsageLimitKind | null {
  const marker = raw.match(/\[\[gw:([a-z_]+)\]\]/i)?.[1]?.toLowerCase();
  const code = marker ?? raw.match(/\b(insufficient_balance|free_daily_cap_reached|free_quota_exhausted|daily_cap_reached)\b/i)?.[1]?.toLowerCase();
  if (code === 'insufficient_balance') return 'balance';
  if (code === 'free_daily_cap_reached' || code === 'free_quota_exhausted' || (code === 'daily_cap_reached' && freeModel)) return 'free';
  return null;
}

/** Image billing is a paid tool, even when its coordinating chat model is free. */
export function imageToolBalanceFailure(name: string, result: unknown, isError: boolean): boolean {
  if (name !== 'platform_imagegen' || !isError || typeof result !== 'string') return false;
  let error: { code?: string; billing_code?: string; message?: string; reason?: string };
  try { error = JSON.parse(result); } catch { error = { message: result }; }
  if (!error || typeof error !== 'object') return false;
  const code = error.billing_code ?? error.code;
  if (code === 'INSUFFICIENT_BALANCE') return true;
  if (code && code !== 'IMAGE_ORDER_ERROR' && code !== 'IMAGE_NOT_DELIVERED') return false;
  // Older main processes returned only this localized billing-client message.
  // Do not match arbitrary provider prose or other tools' output.
  const legacy = ['额度与无为币不足，请充值', 'Insufficient quota and coins. Add funds to continue.'];
  return legacy.includes(error.message ?? '') || legacy.includes(error.reason ?? '');
}

export function usageLimitDestination(kind: UsageLimitKind, account: PaidAllowance | null | undefined): UsageLimitDestination {
  if (!account) return 'login';
  if (kind === 'balance') return 'pay';
  return hasPaidAllowance(account) ? 'recommend' : 'pay';
}

/** Keep the gateway's localized estimate and balance instead of claiming zero funds. */
export function gatewayLimitMessage(raw:string,fallback:string):string {
 const match=raw.match(/\[\[gw:(insufficient_balance|free_daily_cap_reached)\]\]\s*([\s\S]+)$/i);
 return match&&match[2].trim()?match[2].trim():fallback;
}
