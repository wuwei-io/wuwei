import type { BillingCatalog, BillingProduct } from './contracts.js';

type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };
const PREFIX = 'wuwei-billing-catalog-v1:';
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256;
const amount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Validate server/disk data before it can become a cached price list. */
export function isBillingCatalog(value: unknown): value is BillingCatalog {
  if (!record(value) || !text(value.version) || !Array.isArray(value.products) || value.products.length > 250
    || typeof value.member !== 'boolean' || typeof value.checkoutReady !== 'boolean' || !record(value.channels)) return false;
  const channels = value.channels;
  if (!['alipay', 'paddle', 'crypto'].every(key => typeof channels[key] === 'boolean')) return false;
  return value.products.every((product: unknown) => record(product) && text(product.sku) && text(product.name)
    && ['plan', 'pack'].includes(String(product.kind)) && ['monthly', 'annual', 'pack', 'trial'].includes(String(product.period))
    && amount(product.usdMinor) && Number.isSafeInteger(product.usdMinor) && amount(product.cnyMinor) && Number.isSafeInteger(product.cnyMinor)
    && amount(product.credits) && amount(product.memberCredits) && typeof product.recommended === 'boolean');
}

function snapshot(catalog: BillingCatalog): BillingCatalog {
  // Cache display metadata only. Quotes, orders, balances and credentials never
  // belong in this cache; checkout continues to fetch a live server quote.
  const products = catalog.products.map((p): BillingProduct => ({ sku: p.sku, kind: p.kind, name: p.name, period: p.period,
    usdMinor: p.usdMinor, cnyMinor: p.cnyMinor, credits: p.credits, memberCredits: p.memberCredits, recommended: p.recommended }));
  return { version: catalog.version, products, member: catalog.member, checkoutReady: catalog.checkoutReady,
    channels: { alipay: catalog.channels.alipay, paddle: catalog.channels.paddle, crypto: catalog.channels.crypto },
    ...(catalog.trial && typeof catalog.trial.enabled === 'boolean' && typeof catalog.trial.eligible === 'boolean'
      ? { trial: { enabled: catalog.trial.enabled, eligible: catalog.trial.eligible,
        ...(typeof catalog.trial.repeatAllowed === 'boolean' ? { repeatAllowed: catalog.trial.repeatAllowed } : {}),
        ...(Array.isArray(catalog.trial.cryptoChains) ? { cryptoChains: catalog.trial.cryptoChains.filter(text) } : {}) } } : {}),
    ...(catalog.backgroundPolicy && typeof catalog.backgroundPolicy.enabled === 'boolean' && text(catalog.backgroundPolicy.version)
      && amount(catalog.backgroundPolicy.free) && record(catalog.backgroundPolicy.plans)
      ? { backgroundPolicy: { enabled: catalog.backgroundPolicy.enabled, version: catalog.backgroundPolicy.version,
        free: catalog.backgroundPolicy.free, plans: Object.fromEntries(Object.entries(catalog.backgroundPolicy.plans).filter(([, n]) => amount(n))) } } : {}),
  };
}

export function readBillingCatalogCache(storage: Storage | null, accountId: string, now = Date.now()): BillingCatalog | null {
  if (!storage || !accountId) return null;
  try {
    const saved: unknown = JSON.parse(storage.getItem(PREFIX + encodeURIComponent(accountId)) || 'null');
    if (!record(saved) || saved.schema !== 1 || saved.accountId !== accountId || typeof saved.savedAt !== 'number'
      || !Number.isFinite(saved.savedAt) || now - saved.savedAt > MAX_AGE || saved.savedAt - now > 300000 || !isBillingCatalog(saved.catalog)) return null;
    return snapshot(saved.catalog);
  } catch { return null; }
}

export function writeBillingCatalogCache(storage: Storage | null, accountId: string, catalog: BillingCatalog, now = Date.now()): void {
  if (!storage || !accountId || !isBillingCatalog(catalog)) return;
  try { storage.setItem(PREFIX + encodeURIComponent(accountId), JSON.stringify({ schema: 1, accountId, savedAt: now, catalog: snapshot(catalog) })); } catch { /* In-memory rendering still works if disk storage is unavailable. */ }
}

export function clearBillingCatalogCache(storage: Storage | null, accountId: string): void {
  try { storage?.removeItem(PREFIX + encodeURIComponent(accountId)); } catch { /* ignore */ }
}
