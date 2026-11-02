import type { AccountWallet } from './billing/contracts.js';
/** Reject partial snapshots and cross-account results instead of inventing zero/expiry. */
export function isAccountWallet(value: unknown, userId: string): value is AccountWallet {
  if (!value || typeof value !== 'object') return false;
  const v = value as AccountWallet;
  const amount = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  return v.userId === userId && amount(v.balance) && amount(v.permanent) && amount(v.expiring)
    && Number.isFinite(Date.parse(v.asOf)) && Array.isArray(v.batches)
    && v.batches.every(b => b && ['gift', 'purchase', 'other'].includes(b.source) && (b.receiptSource == null || typeof b.receiptSource === 'string') && amount(b.remaining) && Number.isFinite(Date.parse(b.expiresAt)))
    && Math.abs(v.permanent + v.expiring - v.balance) < 0.000002
    && Math.abs(v.batches.reduce((sum, b) => sum + b.remaining, 0) - v.expiring) < 0.000002
    && !!v.plan && typeof v.plan.member === 'boolean'
    && (v.plan.name === null || typeof v.plan.name === 'string')
    && (v.plan.period === null || typeof v.plan.period === 'string')
    && (v.plan.endsAt === null || Number.isFinite(Date.parse(v.plan.endsAt)));
}

/** Optional metadata remains separate so old servers can still return usable balances. */
export function accountWalletDaily(wallet: AccountWallet | null): AccountWallet['daily'] | null {
  const d = wallet?.daily;
  return d && Number.isFinite(d.amount) && d.amount >= 0 && Number.isFinite(d.bonus) && d.bonus >= 0
    && typeof d.claimed === 'boolean' && Number.isFinite(Date.parse(d.resetsAt))
    && (d.expiryHours === null || (Number.isFinite(d.expiryHours) && d.expiryHours > 0)) ? d : null;
}
export function walletCountdown(milliseconds: number): {days: number; time: string} | null {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return null;
  const total = Math.ceil(milliseconds / 1000);
  return {days: Math.floor(total / 86400), time: [Math.floor(total / 3600) % 24, Math.floor(total / 60) % 60, total % 60].map(n => String(n).padStart(2, '0')).join(':')};
}

/** Label the actual receipt; missing historical sources are never inferred from amount or date. */
export function walletBatchSourceKey(batch: AccountWallet['batches'][number]): string {
  switch (batch.receiptSource) {
    case 'signin': return 'account.wallet.signinGift';
    case 'register': case 'registration_gift': return 'account.wallet.registrationGift';
    case 'activity': case 'activity_reward': return 'account.wallet.activityGift';
    case 'review_reward': return 'account.wallet.reviewReward';
    case 'billing_plan': return 'account.wallet.planCredits';
    case 'billing_pack': return 'account.wallet.packCredits';
    default: return 'account.wallet.' + batch.source;
  }
}
