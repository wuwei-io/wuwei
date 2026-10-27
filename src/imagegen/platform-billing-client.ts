import { tr, getCurrentLanguage } from "../localization/index.js";
import { randomUUID } from 'node:crypto';

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

// c8ab600 draft adapter only. No registration, provider fallback or automatic retries.
export type BillingSource = 'platform' | 'subscription' | 'byok';
export interface OrderInput { sku_id: string; price_version: string; prompt: string; count: 1; authorized_budget: number }
export interface Sku {
  sku_id: string; price_version: string; authorization_ceiling: number; model: string; size: string; quality: string;
  aspect_ratio?:string|null; resolution?:string|null;
  coins_per_image: number; max_prompt_bytes: number; max_count: number;
}
export interface ImageQuote { sku_id: string; price_version: string; estimated_coins: number; authorization_ceiling: number }
export interface CreatedOrder {
  order_id: string; status: string; reserved_coins: number; unit_price_coins: number;
}
export interface OrderDetail {
  order_id: string; status: string; delivered_count: number; charged_coins: number; actual_coins?: number | null;
  released_coins: number; images: { asset_id: string; url: string; expires_at: string | null }[];
  error_code: string | null; created_at?:string; duration_ms?:number;
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
      throw new BillingError('INVALID_BASE_URL', tr("ui.platform.billing.client.the.image.service.requires.https.except.97a8eb1"));
    }
    this.base = baseUrl.replace(/\/$/, '');
  }
  private guard() {
    if (this.source !== 'platform') throw new BillingError('SOURCE_ISOLATED', tr("ui.platform.billing.client.subscriptions.and.byok.do.not.use.596a0fb"));
  }
  private async request(path: string, method = 'GET', body?: OrderInput | Omit<OrderInput, 'authorized_budget'> | {authorized_budget:number}, key?: string): Promise<unknown> {
    this.guard();
    const token = await this.token();
    if (!token.trim()) throw new BillingError('AUTH_REQUIRED', tr("ui.platform.billing.client.sign.in.first.44e9920"));
    let response!: Response;
    let data: any;
    for(let attempt=0;;attempt++) {
     try {
      response = await fetch(this.base + path, {
        method, redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs),
        headers: { Authorization: `Bearer ${token}`, ...(path==='/api/images/catalog'?{'X-Wuwei-Image-Specifications':'20261025'}:{}), ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(key ? { 'Idempotency-Key': key } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      data=await response.json();break;
     } catch {
      if(method==='GET' && attempt<2) {await delay(400*(attempt+1));continue;}
      throw new BillingError('UNKNOWN', tr("ui.platform.billing.client.connection.interrupted.check.the.original.order.b7f26fc"));
     }
    }
    if (!response.ok) {
      if (response.status === 401) throw new BillingError('AUTH_REQUIRED', tr("ui.platform.billing.client.your.session.expired.sign.in.again.a03f416"), 401);
      if (response.status === 402) throw new BillingError('INSUFFICIENT_BALANCE', tr("ui.platform.billing.client.insufficient.quota.and.coins.add.funds.5cc667d"), 402);
      if (data?.code==='MEMBERSHIP_REQUIRED') throw new BillingError('MEMBERSHIP_REQUIRED',tr('studio.gallery.memberOnly'),403);
      if (data?.code === 'PRICE_CHANGED') throw new BillingError('PRICE_CHANGED', tr("ui.platform.billing.client.pricing.changed.refresh.the.catalog.and.9c8f30c"), response.status);
      if (response.status === 409) throw new BillingError(data?.code === 'PRICE_UNAVAILABLE' ? 'PRICE_UNAVAILABLE' : 'IDEMPOTENCY_CONFLICT', tr("ui.platform.billing.client.the.price.is.unavailable.or.the.31385e6"), 409);
      if (response.status === 422) throw new BillingError('INVALID_INPUT', tr("ui.platform.billing.client.the.input.is.too.large.or.68443fa"), 422);
      throw new BillingError(response.status >= 500 ? 'UNKNOWN' : 'HTTP_ERROR', tr("ui.platform.billing.client.the.image.service.request.failed.no.0a807dd"), response.status);
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
      throw new BillingError('INVALID_QUOTE',tr("ui.platform.billing.client.the.estimated.fee.is.invalid.confirm.0cf5c13"));
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
      throw new BillingError('INVALID_INPUT', tr("ui.platform.billing.client.the.image.specification.or.input.is.2517f94"));
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
      throw new BillingError('PRICE_CHANGED', tr("ui.platform.billing.client.refresh.the.catalog.and.confirm.the.b993f5a"));
    }
    if (!this.attempts.has(attempt) || attempt.state !== 'ready') {
      throw new BillingError('QUERY_ONLY', tr("ui.platform.billing.client.the.original.request.is.submitted.or.aba53b5"));
    }
    attempt.state = 'sending';
    try {
      const data = await this.request('/api/images/orders', 'POST', attempt.input, attempt.key) as CreatedOrder;
      if (!data || typeof data.order_id !== 'string' || !data.order_id || typeof data.status !== 'string' ||
        !Number.isFinite(data.reserved_coins) || !Number.isFinite(data.unit_price_coins)) {
        throw new BillingError('UNKNOWN', tr("ui.platform.billing.client.the.order.response.is.incomplete.check.33d8c11"));
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
      attempt.state = error instanceof BillingError && ['AUTH_REQUIRED', 'INSUFFICIENT_BALANCE', 'PRICE_UNAVAILABLE', 'IDEMPOTENCY_CONFLICT', 'INVALID_INPUT','MEMBERSHIP_REQUIRED'].includes(error.code) ? 'ready' : 'unknown';
      throw error;
    }
  }
  async lookup(key: string): Promise<CreatedOrder> {
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(key)) throw new BillingError('INVALID_INPUT',tr("ui.platform.billing.client.invalid.order.recovery.key.cd16662"));
    const result=await this.request('/api/images/orders','GET',undefined,key) as CreatedOrder;
    if (!result || !/^[0-9a-f-]{36}$/i.test(result.order_id) || typeof result.status!=='string') throw new BillingError('UNKNOWN',tr("ui.platform.billing.client.the.original.order.response.is.invalid.f3b9200"));
    return result;
  }
  async reauthorize(orderId: string,budget: number): Promise<unknown> {
    this.guard();
    if (!/^[0-9a-f-]{36}$/i.test(orderId) || !Number.isSafeInteger(budget) || budget<1) throw new BillingError('INVALID_INPUT',tr("ui.platform.billing.client.invalid.authorization.for.the.original.order.0b5ad0c"));
    return this.request(`/api/images/orders/${encodeURIComponent(orderId)}/reauthorize`,'POST',{authorized_budget:budget});
  }
  async settle(orderId: string): Promise<unknown> {
    this.guard();
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new BillingError('INVALID_INPUT',tr("ui.platform.billing.client.invalid.order.id.c87f920"));
    return this.request(`/api/images/orders/${encodeURIComponent(orderId)}/settle`,'POST');
  }
  async image(orderId: string): Promise<Uint8Array> {
    this.guard();
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new BillingError('INVALID_INPUT', tr("ui.platform.billing.client.invalid.order.id.c87f920"));
    const token = await this.token();
    if (!token.trim()) throw new BillingError('AUTH_REQUIRED', tr("ui.platform.billing.client.sign.in.first.44e9920"));
    for(let attempt=0;;attempt++) {
     try {
    const response = await fetch(`${this.base}/api/images/orders/${encodeURIComponent(orderId)}/asset`, {
      headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs),
    });
    if(response.status===401) throw new BillingError('AUTH_REQUIRED',tr("ui.platform.billing.client.your.session.expired.sign.in.again.a03f416"),401);
    if (!response.ok || response.headers.get('content-type') !== 'image/png') throw new BillingError('DELIVERY_UNAVAILABLE', tr("ui.platform.billing.client.the.image.is.not.available.to.3405ec4"), response.status);
    const reader = response.body?.getReader();
    if (!reader) throw new BillingError('DELIVERY_UNAVAILABLE', tr("ui.platform.billing.client.the.image.response.is.empty.1e7b3a9"));
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length;
        if (size > 64 * 1024 * 1024) throw new BillingError('DELIVERY_UNAVAILABLE', tr("ui.platform.billing.client.the.image.response.exceeds.the.size.ee40042")); chunks.push(part.value); }
    } finally { await reader.cancel().catch(()=>{}); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    if (!size) throw new BillingError('DELIVERY_UNAVAILABLE', tr("ui.platform.billing.client.the.image.response.is.empty.1e7b3a9"));
    return bytes;
     } catch(error) {
      if(error instanceof BillingError || attempt>=2) throw error;
      await delay(400*(attempt+1));
     }
    }
  }
  async order(id: string): Promise<OrderDetail> {
    if (!id.trim()) throw new BillingError('INVALID_INPUT', tr("ui.platform.billing.client.the.original.order.id.is.missing.d79aeaf"));
    return await this.request(`/api/images/orders/${encodeURIComponent(id)}`) as OrderDetail;
  }
}
