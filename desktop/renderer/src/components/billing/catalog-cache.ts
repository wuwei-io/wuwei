import { clearBillingCatalogCache, isBillingCatalog, readBillingCatalogCache, writeBillingCatalogCache } from '../../../../../src/billing/catalog-cache.js';
import { billingRequest } from './request.js';
import type { BillingResponse, MiniOffer } from '../../../../../src/billing/contracts.js';
import { MINI_SKU } from '../../../../../src/billing/mini.js';

function storage() { try { return window.localStorage; } catch { return null; } }
export const cachedBillingCatalog = (accountId: string) => readBillingCatalogCache(storage(), accountId);
const miniOffers = new Map<string, MiniOffer>();
const listeners = new Set<() => void>();
export const getLiveMiniOffer = (accountId?: string) => accountId ? miniOffers.get(accountId) : undefined;
export function subscribeMiniOffer(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function setLiveMiniOffer(accountId: string, offer?: MiniOffer) {
  if (offer) miniOffers.set(accountId, offer);
  else if (!miniOffers.delete(accountId)) return;
  for (const listener of listeners) listener();
}
const generations = new Map<string, number>();
const pending = new Map<string, { generation: number; promise: Promise<BillingResponse> }>();
export function forgetBillingCatalog(accountId: string) {
  generations.set(accountId, (generations.get(accountId) ?? 0) + 1);
  pending.delete(accountId);
  clearBillingCatalogCache(storage(), accountId);
  setLiveMiniOffer(accountId);
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
    if (isBillingCatalog(result)) {
      writeBillingCatalogCache(storage(), accountId, result);
      const offer = result.miniOffer;
      const hasMini = result.products.some(product => product.sku === MINI_SKU);
      setLiveMiniOffer(accountId, hasMini && offer && offer.credits > offer.baseCredits ? offer : undefined);
    } else if ('error' in result && result.error === 'not_logged_in') {
      forgetBillingCatalog(accountId);
    } else {
      setLiveMiniOffer(accountId);
    }
  }
  return result;
}
