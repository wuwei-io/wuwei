import { clearBillingCatalogCache, isBillingCatalog, readBillingCatalogCache, writeBillingCatalogCache } from '../../../../../src/billing/catalog-cache.js';
import { billingRequest } from './request.js';
import type { BillingResponse } from '../../../../../src/billing/contracts.js';

function storage() { try { return window.localStorage; } catch { return null; } }
export const cachedBillingCatalog = (accountId: string) => readBillingCatalogCache(storage(), accountId);
const generations = new Map<string, number>();
const pending = new Map<string, { generation: number; promise: Promise<BillingResponse> }>();
export function forgetBillingCatalog(accountId: string) {
  generations.set(accountId, (generations.get(accountId) ?? 0) + 1);
  pending.delete(accountId);
  clearBillingCatalogCache(storage(), accountId);
}
export { isBillingCatalog };

/** Refresh quietly; the caller owns the account/lifetime check for late replies. */
export async function refreshBillingCatalogCache(accountId: string, stillCurrent: () => boolean) {
  let read = pending.get(accountId);
  if (!read) {
    const generation = (generations.get(accountId) ?? 0) + 1;
    generations.set(accountId, generation);
    read = { generation, promise: billingRequest({ action: 'catalog' }) };
    pending.set(accountId, read);
    const active = read;
    void read.promise.finally(() => { if (pending.get(accountId) === active) pending.delete(accountId); });
  }
  const result = await read.promise;
  if (stillCurrent() && generations.get(accountId) === read.generation) {
    if (isBillingCatalog(result)) writeBillingCatalogCache(storage(), accountId, result);
    else if ('error' in result && result.error === 'not_logged_in') forgetBillingCatalog(accountId);
  }
  return result;
}
