export type BillingPeriod = 'monthly' | 'annual' | 'pack' | 'trial';
export type BillingCurrency = 'CNY' | 'USD';
export type BillingChannel = 'alipay' | 'paddle' | 'crypto';
export interface BillingProduct {
  sku: string;
  kind: 'plan' | 'pack';
  name: string;
  period: BillingPeriod;
  usdMinor: number;
  cnyMinor: number;
  credits: number;
  memberCredits: number;
  recommended: boolean;
}
export interface BillingQuote {
  catalogVersion: string;
  sku: string;
  name: string;
  kind: 'plan' | 'pack';
  period: BillingPeriod;
  currency: BillingCurrency;
  amountMinor: number;
  creditsPerGrant: number;
  grantCount: number;
  expiryMonths: number;
  memberBonus: boolean;
  autoRenew: false;
  durationDays?: number;
  expiryDays?: number;
  startsAt?: string;
}
export interface BillingCatalog {
  version: string;
  products: BillingProduct[];
  member: boolean;
  checkoutReady: boolean;
  channels: Record<BillingChannel, boolean>;
  trial?: {enabled:boolean;eligible:boolean};
  backgroundPolicy?: {enabled:boolean;version:string;free:number;plans:Record<string,number>};
}
export interface CreditRecord {
  id: string;
  type: string;
  source: string;
  description: string;
  createdAt: string;
  amount: number;
  balanceAfter: number | null;
  tool?: string;
  model?: string;
  parameters?: Record<string, string | number | boolean>;
  expiresAt?: string;
  relatedId?: string;
}
export interface CreditLedger {
  balance: number;
  records: CreditRecord[];
  hasMore: boolean;
  offset: number;
  total?: number;
  limit?: number;
}
export interface BillingFailure { error: string; message?: string }
export interface BillingOrder {
  id:string;
  sku:string;
  channel:BillingChannel;
  currency:BillingCurrency;
  amountMinor:number;
  status:'pending'|'paid'|'expired'|'failed'|'refunded';
  expiresAt:string|null;
  qr?:string;
  checkoutUrl?:string;
  crypto?:{network:string;currency:string;address:string;amount:string;memo?:string};
  balance?:number;
  creditsGranted?:number;
  refundRequired?:boolean;
  startsAt?:string;
}
export interface BillingRequest {
  action: 'catalog' | 'quote' | 'ledger' | 'create-order' | 'order';
  sku?: string;
  currency?: BillingCurrency;
  offset?: number;
  type?: string;
  search?: string;
  from?: string;
  to?: string;
  orderId?:string;
  requestId?:string;
  channel?:BillingChannel;
  chain?:'solana'|'bsc'|'tron';
  expected?:Pick<BillingQuote,'catalogVersion'|'amountMinor'|'creditsPerGrant'|'startsAt'>;
}
export type BillingResponse = BillingCatalog | BillingQuote | CreditLedger | BillingOrder | BillingFailure;
