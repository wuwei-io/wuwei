import { BillingError, type PlatformBillingClient, type Sku } from './platform-billing-client.js';
import { imageModelLabel } from './image-catalog.js';

export async function checkImageAvailability(client: Pick<PlatformBillingClient, 'catalog' | 'quote'>, skuId: string, lang: 'zh' | 'en') {
  const tt = (zh: string, en: string) => lang === 'en' ? en : zh;
  try {
    const catalog = await client.catalog();
    const sku = Array.isArray(catalog) ? catalog.find((row: Sku) => row.sku_id === skuId) as Sku | undefined : undefined;
    if (!sku) return { status: 'yellow' as const, reason: tt('当前生图模型暂不可用，请刷新模型列表。', 'This image model is unavailable. Refresh the model list.') };
    // A quote checks the selected SKU and image-service gates without creating an
    // order, spending coins, invoking a text model or consuming free chat calls.
    await client.quote({sku_id: sku.sku_id, price_version: sku.price_version, prompt: 'Connection check', count: 1});
    return { status: 'green' as const, reason: tt(`${imageModelLabel(sku)} 生图服务已就绪，生成前会确认费用。`, `${imageModelLabel(sku)} is ready. The fee is confirmed before generation.`) };
  } catch (error) {
    if (error instanceof BillingError && (error.code === 'AUTH_REQUIRED' || error.status === 401))
      return { status: 'red' as const, reason: tt('登录已失效，请重新登录后使用生图。', 'Your session expired. Sign in again to generate images.') };
    return { status: 'yellow' as const, reason: tt('生图服务暂不可用，请稍后重新检测。', 'Image generation is temporarily unavailable. Check again later.') };
  }
}
