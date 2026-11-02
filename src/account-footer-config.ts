export type AccountFooterLayout = 'classic' | 'wallet';
export function accountFooterLayout(value: unknown): AccountFooterLayout {
  return value === 'wallet' ? 'wallet' : 'classic';
}
let layout: AccountFooterLayout = 'classic';
const listeners = new Set<() => void>();
export function setAccountFooterLayout(value: unknown) {
  const next = accountFooterLayout(value);
  if (next === layout) return;
  layout = next;
  listeners.forEach(listener => listener());
}
export const getAccountFooterLayout = () => layout;
export const subscribeAccountFooterLayout = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
