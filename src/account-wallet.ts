import type { AccountWallet } from './billing/contracts.js';
/** Reject partial snapshots and cross-account results instead of inventing zero/expiry. */
export function isAccountWallet(value: unknown, userId: string): value is AccountWallet {
  if (!value || typeof value !== 'object') return false;
  const v = value as AccountWallet;
  const amount = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  return v.userId === userId && amount(v.balance) && amount(v.permanent) && amount(v.expiring)
    && Number.isFinite(Date.parse(v.asOf)) && Array.isArray(v.batches)
    && v.batches.every(b => b && ['gift', 'purchase', 'other'].includes(b.source) && amount(b.remaining) && Number.isFinite(Date.parse(b.expiresAt)))
    && Math.abs(v.permanent + v.expiring - v.balance) < 0.000002
    && Math.abs(v.batches.reduce((sum, b) => sum + b.remaining, 0) - v.expiring) < 0.000002
    && !!v.plan && typeof v.plan.member === 'boolean'
    && (v.plan.name === null || typeof v.plan.name === 'string')
    && (v.plan.period === null || typeof v.plan.period === 'string')
    && (v.plan.endsAt === null || Number.isFinite(Date.parse(v.plan.endsAt)));
}
