import { tr as translate, getCurrentLanguage } from "../localization/index.js";
import { BillingError, type PlatformBillingClient, type Sku } from './platform-billing-client.js';
import { imageModelLabel } from './image-catalog.js';

export async function checkImageAvailability(client: Pick<PlatformBillingClient, 'catalog' | 'quote'>, skuId: string, lang: string) {
  const tr = (key: string, values = {}) => translate(key, values, lang);
  try {
    const catalog = await client.catalog();
    const sku = Array.isArray(catalog) ? catalog.find((row: Sku) => row.sku_id === skuId) as Sku | undefined : undefined;
    if (!sku) return { status: 'yellow' as const, reason: tr("ui.image.availability.this.image.model.is.unavailable.refresh.5c6eb83") };
    // A quote checks the selected SKU and image-service gates without creating an
    // order, spending coins, invoking a text model or consuming free chat calls.
    await client.quote({sku_id: sku.sku_id, price_version: sku.price_version, prompt: 'Connection check', count: 1});
    return { status: 'green' as const, reason: tr("ui.image.availability.is.ready.the.fee.is.confirmed.393fee4", { p0: imageModelLabel(sku) }) };
  } catch (error) {
    if (error instanceof BillingError && (error.code === 'AUTH_REQUIRED' || error.status === 401))
      return { status: 'red' as const, reason: tr("ui.image.availability.your.session.expired.sign.in.again.4d1b160") };
    return { status: 'yellow' as const, reason: tr("ui.image.availability.image.generation.is.temporarily.unavailable.check.07e6a2d") };
  }
}
