import type {ModelChoice} from './model-selection.js';

export type TextModelMembership = 'member' | 'pro';
// Explicit rollout for the seven models requested in the model-picker screenshots.
// Per-model catalog metadata can override these defaults, including null (open access).
const memberModels = new Set([
  'wuwei-claude/claude-fable-5-1', 'wuwei-claude/claude-fable-5',
  'wuwei-claude/claude-opus-5-5', 'wuwei-claude/claude-opus-5',
  'wuwei-gpt/gpt-6-1-sol', 'wuwei-gpt/gpt-6-sol', 'wuwei-gpt/gpt-6-astra',
]);
type Choice = Pick<ModelChoice, 'key' | 'free' | 'category' | 'membershipRequired'>;
export function textModelMembership(choice: Choice): TextModelMembership | null {
  if (choice.free || !['premium', 'economy'].includes(choice.category)) return null;
  if (choice.membershipRequired === null || choice.membershipRequired === 'member' || choice.membershipRequired === 'pro') return choice.membershipRequired;
  return memberModels.has(choice.key) ? 'member' : null;
}
type Account = {membership?: {tier?: string; plan?: string | null; expireAt?: string | number}} | null | undefined;
export function canUseTextModel(choice: Choice, account: Account, now = Date.now()): boolean {
  const required = textModelMembership(choice);
  if (!required) return true;
  const m = account?.membership;
  if (!m?.tier || m.tier === 'free') return false;
  const expiry = typeof m.expireAt === 'number' ? m.expireAt * (m.expireAt < 1e12 ? 1000 : 1) : Date.parse(m.expireAt ?? '');
  if (!Number.isFinite(expiry) || expiry <= now) return false;
  return required === 'member' || ['pro', 'plus', 'ultra', 'max'].includes((m.plan || m.tier.replace(/_(month|year)$/, '')).toLowerCase());
}
