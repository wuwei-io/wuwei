import { randomUUID } from 'node:crypto';
const tt=(zh:string,en:string)=>process.env.WUWEI_LANG==='en'?en:zh;
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

// c8ab600 draft adapter only. No registration, provider fallback or automatic retries.
export type BillingSource = 'platform' | 'subscription' | 'byok';
export interface OrderInput { sku_id: string; price_version: string; prompt: string; count: 1; authorized_budget: number }
export interface Sku {
  sku_id: string; price_version: string; authorization_ceiling: number; model: string; size: string; quality: string;
  coins_per_image: number; max_prompt_bytes: number; max_count: number;
}
export interface ImageQuote { sku_id: string; price_version: string; estimated_coins: number; authorization_ceiling: number }
export interface CreatedOrder {
  order_id: string; status: string; reserved_coins: number; unit_price_coins: number;
}
export interface OrderDetail {
  order_id: string; status: string; delivered_count: number; charged_coins: number; actual_coins?: number | null;
  released_coins: number; images: { asset_id: string; url: string; expires_at: string | null }[];
  error_code: string | null;
}
export class BillingError extends Error {
  constructor(public code: string, message: string, public status?: number) { super(message); }
}
// Keep this handle for a logical request; repeated submit never generates a new key.
// Persistence/restart recovery is the future caller's responsibility (not wired here).
export interface OrderAttempt {
  readonly key: string;
  readonly input: Readonly<OrderInput>;
  state: 'ready' | 'sending' | 'submitted' | 'unknown' | 'confirmation_required';
  orderId?: string;
}

export class PlatformBillingClient {
  private readonly attempts = new WeakSet<OrderAttempt>();
  private readonly base: string;
  constructor(baseUrl: string, private readonly token: () => string | Promise<string>,
    private readonly source: BillingSource, private readonly timeoutMs = 15000) {
    const url = new URL(baseUrl);
    if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) {
      throw new BillingError('INVALID_BASE_URL', tt("平台地址必须使用 HTTPS（本机 mock 除外）","The image service requires HTTPS (except localhost tests)."));
    }
    this.base = baseUrl.replace(/\/$/, '');
  }
  private guard() {
    if (this.source !== 'platform') throw new BillingError('SOURCE_ISOLATED', tt("订阅/BYOK 不调用平台计费，也不自动降级","Subscriptions and BYOK do not use hosted billing or fall back to it."));
  }
  private async request(path: string, method = 'GET', body?: OrderInput | Omit<OrderInput, 'authorized_budget'> | {authorized_budget:number}, key?: string): Promise<unknown> {
    this.guard();
    const token = await this.token();
    if (!token.trim()) throw new BillingError('AUTH_REQUIRED', tt("请先登录","Sign in first."));
    let response!: Response;
    let data: any;
    for(let attempt=0;;attempt++) {
     try {
      response = await fetch(this.base + path, {
        method, redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs),
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(key ? { 'Idempotency-Key': key } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      data=await response.json();break;
     } catch {
      if(method==='GET' && attempt<2) {await delay(400*(attempt+1));continue;}
      throw new BillingError('UNKNOWN', tt('连接中断，请查询原订单，避免重复生成。','Connection interrupted. Check the original order instead of generating again.'));
     }
    }
    if (!response.ok) {
      if (response.status === 401) throw new BillingError('AUTH_REQUIRED', tt('登录已失效，请重新登录。','Your session expired. Sign in again.'), 401);
      if (response.status === 402) throw new BillingError('INSUFFICIENT_BALANCE', tt("额度与无为币不足，请充值","Insufficient quota and coins. Add funds to continue."), 402);
      if (data?.code === 'PRICE_CHANGED') throw new BillingError('PRICE_CHANGED', tt("价格已变更，请刷新目录并重新确认；禁止自动重发或按新价格扣费","Pricing changed. Refresh the catalog and confirm again. The original request will not be resubmitted."), response.status);
      if (response.status === 409) throw new BillingError(data?.code === 'PRICE_UNAVAILABLE' ? 'PRICE_UNAVAILABLE' : 'IDEMPOTENCY_CONFLICT', tt("价格不可用或幂等请求冲突，请核对后处理","The price is unavailable or the request conflicts with the original order. Check it before continuing."), 409);
      if (response.status === 422) throw new BillingError('INVALID_INPUT', tt("输入超限或参数无效，请修改后重新确认","The input is too large or invalid. Edit it and confirm again."), 422);
      throw new BillingError(response.status >= 500 ? 'UNKNOWN' : 'HTTP_ERROR', tt("平台请求失败，不自动重试","The image service request failed. No paid request will be retried automatically."), response.status);
    }
    return data;
  }
  // Draft does not define a catalog envelope; return raw JSON rather than inventing one.
  catalog(): Promise<unknown> { return this.request('/api/images/catalog'); }

  async quote(input: Omit<OrderInput,'authorized_budget'>): Promise<ImageQuote> {
    const result = await this.request('/api/images/quote','POST',input) as ImageQuote;
    if (!result || result.sku_id !== input.sku_id || result.price_version !== input.price_version.toLowerCase() ||
      !Number.isSafeInteger(result.estimated_coins) || result.estimated_coins < 1 ||
      !Number.isSafeInteger(result.authorization_ceiling) || result.authorization_ceiling < result.estimated_coins) {
      throw new BillingError('INVALID_QUOTE',tt("预计费用响应无效，请重新确认","The estimated fee is invalid. Confirm again before generating."));
    }
    return Object.freeze(result);
  }
  prepare(input: OrderInput, sku: Sku, quote?: ImageQuote): OrderAttempt {
    this.guard();
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length !== 5 || Object.keys(input).some(k => !['sku_id', 'price_version', 'prompt', 'count', 'authorized_budget'].includes(k)) ||
      typeof input.sku_id !== 'string' || !/^[a-z0-9_-]{1,80}$/.test(input.sku_id) ||
      typeof input.price_version !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.price_version) ||
      input.sku_id !== sku.sku_id || input.price_version.toLowerCase() !== sku.price_version.toLowerCase() ||
      !Number.isSafeInteger(input.authorized_budget) || !Number.isSafeInteger(sku.authorization_ceiling) || sku.authorization_ceiling < 1 || input.authorized_budget > sku.authorization_ceiling || input.authorized_budget < (quote?.estimated_coins ?? sku.authorization_ceiling) ||
      (quote !== undefined && (quote.sku_id !== input.sku_id || quote.price_version !== input.price_version.toLowerCase() || quote.authorization_ceiling !== sku.authorization_ceiling || !Number.isSafeInteger(quote.estimated_coins) || quote.estimated_coins < 1)) || typeof input.prompt !== 'string' || !input.prompt.trim() ||
      !Number.isFinite(sku.coins_per_image) || sku.coins_per_image <= 0 ||
      (sku as Sku & { enabled?: boolean }).enabled === false ||
      !Number.isInteger(sku.max_count) || sku.max_count < 1 ||
      !Number.isInteger(sku.max_prompt_bytes) || sku.max_prompt_bytes < 1 ||
      input.count !== 1 || Buffer.byteLength(input.prompt, 'utf8') > Math.min(1000, sku.max_prompt_bytes)) {
      throw new BillingError('INVALID_INPUT', tt("SKU 不可用或参数超限（首期仅文字、单张）","The image specification or input is invalid. These presets generate one image from text."));
    }
    // Catalog envelope/version field is not yet specified: caller supplies the explicitly confirmed UUID.
    const attempt: OrderAttempt = { key: randomUUID(), input: Object.freeze({
      sku_id: input.sku_id, price_version: input.price_version.toLowerCase(), prompt: input.prompt, count: 1, authorized_budget: input.authorized_budget,
    }), state: 'ready' };
    Object.defineProperty(attempt, 'key', { writable: false });
    Object.defineProperty(attempt, 'input', { writable: false });
    this.attempts.add(attempt);
    return attempt;
  }
  async create(attempt: OrderAttempt): Promise<CreatedOrder> {
    this.guard();
    if (this.attempts.has(attempt) && attempt.state === 'confirmation_required') {
      throw new BillingError('PRICE_CHANGED', tt("请刷新目录并重新确认价格；原请求不得重发","Refresh the catalog and confirm the price again. Do not resubmit the original request."));
    }
    if (!this.attempts.has(attempt) || attempt.state !== 'ready') {
      throw new BillingError('QUERY_ONLY', tt("已提交或结果不明，只能查询原订单；不得重新下单","The original request is submitted or its result is unknown. Query the original order instead of placing another."));
    }
    attempt.state = 'sending';
    try {
      const data = await this.request('/api/images/orders', 'POST', attempt.input, attempt.key) as CreatedOrder;
      if (!data || typeof data.order_id !== 'string' || !data.order_id || typeof data.status !== 'string' ||
        !Number.isFinite(data.reserved_coins) || !Number.isFinite(data.unit_price_coins)) {
        throw new BillingError('UNKNOWN', tt("订单响应不完整；禁止自动重新下单","The order response is incomplete. Check the original order instead of placing another."));
      }
      attempt.orderId = data.order_id;
      attempt.state = data.status === 'unknown' ? 'unknown' : 'submitted';
      return data;
    } catch (error) {
      if (error instanceof BillingError && error.code === 'PRICE_CHANGED') {
        attempt.state = 'confirmation_required';
        throw error;
      }
      // Only explicit pre-dispatch rejection can be manually retried with the SAME key.
      attempt.state = error instanceof BillingError && ['AUTH_REQUIRED', 'INSUFFICIENT_BALANCE', 'PRICE_UNAVAILABLE', 'IDEMPOTENCY_CONFLICT', 'INVALID_INPUT'].includes(error.code) ? 'ready' : 'unknown';
      throw error;
    }
  }
  async lookup(key: string): Promise<CreatedOrder> {
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(key)) throw new BillingError('INVALID_INPUT',tt("无效恢复凭据","Invalid order recovery key."));
    const result=await this.request('/api/images/orders','GET',undefined,key) as CreatedOrder;
    if (!result || !/^[0-9a-f-]{36}$/i.test(result.order_id) || typeof result.status!=='string') throw new BillingError('UNKNOWN',tt("原订单查询结果无效，不得重新生成","The original order response is invalid. Do not generate again."));
    return result;
  }
  async reauthorize(orderId: string,budget: number): Promise<unknown> {
    this.guard();
    if (!/^[0-9a-f-]{36}$/i.test(orderId) || !Number.isSafeInteger(budget) || budget<1) throw new BillingError('INVALID_INPUT',tt("无效原订单授权","Invalid authorization for the original order."));
    return this.request(`/api/images/orders/${encodeURIComponent(orderId)}/reauthorize`,'POST',{authorized_budget:budget});
  }
  async settle(orderId: string): Promise<unknown> {
    this.guard();
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new BillingError('INVALID_INPUT',tt("无效订单编号","Invalid order ID."));
    return this.request(`/api/images/orders/${encodeURIComponent(orderId)}/settle`,'POST');
  }
  async image(orderId: string): Promise<Uint8Array> {
    this.guard();
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new BillingError('INVALID_INPUT', tt("无效订单编号","Invalid order ID."));
    const token = await this.token();
    if (!token.trim()) throw new BillingError('AUTH_REQUIRED', tt("请先登录","Sign in first."));
    for(let attempt=0;;attempt++) {
     try {
    const response = await fetch(`${this.base}/api/images/orders/${encodeURIComponent(orderId)}/asset`, {
      headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs),
    });
    if(response.status===401) throw new BillingError('AUTH_REQUIRED',tt('登录已失效，请重新登录。','Your session expired. Sign in again.'),401);
    if (!response.ok || response.headers.get('content-type') !== 'image/png') throw new BillingError('DELIVERY_UNAVAILABLE', tt("图片尚不可下载或无权访问","The image is not available to download, or access was denied."), response.status);
    const reader = response.body?.getReader();
    if (!reader) throw new BillingError('DELIVERY_UNAVAILABLE', tt("图片响应为空","The image response is empty."));
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length;
        if (size > 12 * 1024 * 1024) throw new BillingError('DELIVERY_UNAVAILABLE', tt("图片响应超限","The image response exceeds the size limit.")); chunks.push(part.value); }
    } finally { await reader.cancel().catch(()=>{}); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    if (!size) throw new BillingError('DELIVERY_UNAVAILABLE', tt("图片响应为空","The image response is empty."));
    return bytes;
     } catch(error) {
      if(error instanceof BillingError || attempt>=2) throw error;
      await delay(400*(attempt+1));
     }
    }
  }
  async order(id: string): Promise<OrderDetail> {
    if (!id.trim()) throw new BillingError('INVALID_INPUT', tt("缺少原订单编号；需人工核查，不能重新下单","The original order ID is missing. Check the request instead of placing another order."));
    return await this.request(`/api/images/orders/${encodeURIComponent(id)}`) as OrderDetail;
  }
}
