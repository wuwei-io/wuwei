import { randomUUID } from 'node:crypto';

// c8ab600 draft adapter only. No registration, provider fallback or automatic retries.
export type BillingSource = 'platform' | 'subscription' | 'byok';
export interface OrderInput { sku_id: string; prompt: string; count: number }
export interface Sku {
  sku_id: string; model: string; size: string; quality: string;
  coins_per_image: number; max_prompt_bytes: number; max_count: number;
}
export interface CreatedOrder {
  order_id: string; status: string; reserved_coins: number; unit_price_coins: number;
}
export interface OrderDetail {
  order_id: string; status: string; delivered_count: number; charged_coins: number;
  released_coins: number; images: { asset_id: string; url: string; expires_at: string }[];
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
  state: 'ready' | 'sending' | 'submitted' | 'unknown';
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
      throw new BillingError('INVALID_BASE_URL', '平台地址必须使用 HTTPS（本机 mock 除外）');
    }
    this.base = baseUrl.replace(/\/$/, '');
  }
  private guard() {
    if (this.source !== 'platform') throw new BillingError('SOURCE_ISOLATED', '订阅/BYOK 不调用平台计费，也不自动降级');
  }
  private async request(path: string, method = 'GET', body?: OrderInput, key?: string): Promise<unknown> {
    this.guard();
    const token = await this.token();
    if (!token.trim()) throw new BillingError('AUTH_REQUIRED', '请先登录');
    let response: Response;
    try {
      response = await fetch(this.base + path, {
        method, redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs),
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(key ? { 'Idempotency-Key': key } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw new BillingError('UNKNOWN', '请求结果不明；请查询原订单，禁止自动重新下单'); }
    let data: any;
    try { data = await response.json(); }
    catch { throw new BillingError('UNKNOWN', '响应无法解析；禁止自动重新下单', response.status); }
    if (!response.ok) {
      if (response.status === 402) throw new BillingError('INSUFFICIENT_BALANCE', '额度与无为币不足，请充值', 402);
      if (response.status === 409) throw new BillingError(data?.code === 'PRICE_UNAVAILABLE' ? 'PRICE_UNAVAILABLE' : 'IDEMPOTENCY_CONFLICT', '价格不可用或幂等请求冲突，请核对后处理', 409);
      if (response.status === 422) throw new BillingError('INVALID_INPUT', '输入超限或参数无效，请修改后重新确认', 422);
      throw new BillingError(response.status >= 500 ? 'UNKNOWN' : 'HTTP_ERROR', '平台请求失败，不自动重试', response.status);
    }
    return data;
  }
  // Draft does not define a catalog envelope; return raw JSON rather than inventing one.
  catalog(): Promise<unknown> { return this.request('/api/images/catalog'); }

  prepare(input: OrderInput, sku: Sku): OrderAttempt {
    this.guard();
    if (Object.keys(input).some(k => !['sku_id', 'prompt', 'count'].includes(k)) ||
      input.sku_id !== sku.sku_id || typeof input.prompt !== 'string' || !input.prompt.trim() ||
      !Number.isFinite(sku.coins_per_image) || sku.coins_per_image <= 0 ||
      (sku as Sku & { enabled?: boolean }).enabled === false ||
      !Number.isInteger(sku.max_count) || sku.max_count < 1 ||
      !Number.isInteger(sku.max_prompt_bytes) || sku.max_prompt_bytes < 1 ||
      input.count !== 1 || Buffer.byteLength(input.prompt, 'utf8') > Math.min(1000, sku.max_prompt_bytes)) {
      throw new BillingError('INVALID_INPUT', 'SKU 不可用或参数超限（首期仅文字、单张）');
    }
    const attempt: OrderAttempt = { key: randomUUID(), input: Object.freeze({ ...input }), state: 'ready' };
    Object.defineProperty(attempt, 'key', { writable: false });
    Object.defineProperty(attempt, 'input', { writable: false });
    this.attempts.add(attempt);
    return attempt;
  }
  async create(attempt: OrderAttempt): Promise<CreatedOrder> {
    this.guard();
    if (!this.attempts.has(attempt) || attempt.state !== 'ready') {
      throw new BillingError('QUERY_ONLY', '已提交或结果不明，只能查询原订单；不得重新下单');
    }
    attempt.state = 'sending';
    try {
      const data = await this.request('/api/images/orders', 'POST', attempt.input, attempt.key) as CreatedOrder;
      if (!data || typeof data.order_id !== 'string' || !data.order_id || typeof data.status !== 'string' ||
        !Number.isFinite(data.reserved_coins) || !Number.isFinite(data.unit_price_coins)) {
        throw new BillingError('UNKNOWN', '订单响应不完整；禁止自动重新下单');
      }
      attempt.orderId = data.order_id;
      attempt.state = data.status === 'unknown' ? 'unknown' : 'submitted';
      return data;
    } catch (error) {
      // Only explicit pre-dispatch rejection can be manually retried with the SAME key.
      attempt.state = error instanceof BillingError && ['AUTH_REQUIRED', 'INSUFFICIENT_BALANCE', 'PRICE_UNAVAILABLE', 'IDEMPOTENCY_CONFLICT', 'INVALID_INPUT'].includes(error.code) ? 'ready' : 'unknown';
      throw error;
    }
  }
  async order(id: string): Promise<OrderDetail> {
    if (!id.trim()) throw new BillingError('INVALID_INPUT', '缺少原订单编号；需人工核查，不能重新下单');
    return await this.request(`/api/images/orders/${encodeURIComponent(id)}`) as OrderDetail;
  }
}
