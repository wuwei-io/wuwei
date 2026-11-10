export type BillingPeriod = 'monthly' | 'annual' | 'pack' | 'trial';
export type BillingCurrency = 'CNY' | 'USD';
export type BillingChannel = 'alipay' | 'paddle' | 'crypto';
export interface MiniOffer { baseCredits: number; credits: number; limit: number; remaining: number }
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
  durationMonths?: number;
  creditsNeverExpire?: boolean;
  miniOffer?: MiniOffer;
  expiryDays?: number;
  startsAt?: string;
}
export interface BillingCatalog {
  version: string;
  products: BillingProduct[];
  member: boolean;
  checkoutReady: boolean;
  channels: Record<BillingChannel, boolean>;
  usdOnly?: boolean;
  showFreePlan?: boolean;
  showAnnualPlan?: boolean;
  miniOffer?: MiniOffer | null;
  trial?: {enabled:boolean;eligible:boolean;repeatAllowed?:boolean;cryptoChains?:string[]};
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
export interface AccountWallet {
  userId: string;
  balance: number;
  permanent: number;
  expiring: number;
  asOf: string;
  plan: { name: string | null; period: string | null; endsAt: string | null; member: boolean };
  daily?: { amount: number; bonus: number; claimed: boolean; resetsAt: string; expiryHours: number | null };
  batches: { source: 'gift' | 'purchase' | 'other'; receiptSource?: string | null; remaining: number; expiresAt: string }[];
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
  action: 'wallet' | 'catalog' | 'quote' | 'ledger' | 'create-order' | 'order';
  sku?: string;
  currency?: BillingCurrency;
  offset?: number;
  limit?: number;
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
export type BillingResponse = AccountWallet | BillingCatalog | BillingQuote | CreditLedger | BillingOrder | BillingFailure;
