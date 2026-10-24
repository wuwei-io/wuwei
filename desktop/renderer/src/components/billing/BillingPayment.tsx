import React from 'react';
import {tr} from '../../../../../src/localization/index.js';
import {formatCredits,formatLedgerTime} from '../../../../../src/billing/presentation.js';
import type {BillingQuote,BillingOrder,BillingChannel} from '../../../../../src/billing/contracts.js';
import {BillingOrderView} from './BillingOrderView.js';
interface Props {
  lang:string;quote:BillingQuote;order:BillingOrder|null;channel:BillingChannel;chain:'solana'|'bsc'|'tron';
  selected:boolean;busy:boolean;channels:Record<BillingChannel,boolean>;ready:boolean;
  onMethod:(channel:BillingChannel)=>void;onChain:(chain:Props['chain'])=>void;onRetry:()=>void;onPaid:(order:BillingOrder)=>void;onNeedLogin:()=>void;
}
function PaymentIcon({crypto=false}:{crypto?:boolean}){return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{crypto?<><path d="m12 2 9 10-9 10L3 12 9-10Z"/><path d="m12 7 4.5 5-4.5 5-4.5-5L12 7Z"/></>:<><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M7 15h4"/></>}</svg>;}
export function BillingPayment(p:Props){
  const q=p.quote,usd=q.currency==='USD';
  const amount=new Intl.NumberFormat(p.lang,{style:'currency',currency:q.currency,maximumFractionDigits:q.amountMinor%100===0?0:2}).format(q.amountMinor/100);
  const activation=q.startsAt&&Date.parse(q.startsAt)>Date.now()+60000;
  const methods=(usd?['paddle','crypto']:['alipay']) as BillingChannel[];
  const name=(channel:BillingChannel)=>tr(channel==='paddle'?'billing.payment.webMethod':channel==='crypto'?'ui.billingpanel.cryptocurrency.f838241':'ui.billingpanel.message.39270e4d9e');
  return <div className="billing-checkout billing-payment-layout">
    <aside><span className="billing-payment-overline">{tr('ui.billingpanel.order.summary.1368e0b')}</span><div className="billing-payment-name"><h2>{q.kind==='plan'?`Wuwei ${q.name}`:tr('ui.billingpanel.credit.pack.d7ec0e9')}</h2><span>{tr('billing.plans.period.'+q.period)}</span></div><strong className="billing-payment-amount">{amount}</strong><p className="billing-payment-once">{tr('ui.billingpanel.one.time.purchase.no.auto.renewal.d39d18e')}</p>
      <dl className="billing-payment-lines"><dt>{tr('ui.billingpanel.period.1268adc')}</dt><dd>{tr(q.period==='trial'?'billing.mini.duration':q.period==='annual'?'ui.billingpanel.one.year.ef6451f':q.period==='monthly'?'ui.billingpanel.one.month.c16410c':'ui.billingpanel.one.time.purchase.e8670db')}</dd><dt>{tr('ui.billingpanel.credits.on.activation.6fb6729')}</dt><dd>{formatCredits(q.creditsPerGrant)}</dd><dt>{tr('ui.billingpanel.credit.grants.163651f')}</dt><dd>{tr(q.grantCount===12?'ui.billingpanel.once.monthly.twelve.grants.324a1d1':'ui.billingpanel.once.09bcad4')}</dd><dt>{tr('ui.billingpanel.credit.validity.8c07d17')}</dt><dd>{tr(q.expiryDays===1?'billing.mini.duration':q.expiryMonths===6?'ui.billingpanel.six.months.f6c4136':'ui.billingpanel.expires.monthly.eab601b')}</dd>{activation&&<><dt>{tr('ui.billingpanel.plan.activation.7cf13be')}</dt><dd>{formatLedgerTime(q.startsAt!,p.lang)}</dd></>}{q.memberBonus&&<><dt>{tr('billing.plans.bonusIncluded')}</dt><dd>✓</dd></>}</dl>
      <div className="billing-payment-total"><span>{tr('billing.payment.totalDue')}</span><strong>{amount}</strong></div>
      <ul className="billing-payment-perks">{['billing.plans.saving.base','billing.plans.packModels','billing.payment.records'].map(key=><li key={key}>{tr(key)}</li>)}</ul><p className="billing-payment-foot">{tr(q.period==='trial'?'billing.mini.validity':q.kind==='pack'?'ui.billingpanel.valid.for.six.months.does.not.ba3d962':'billing.payment.expiryNote',{credits:q.creditsPerGrant})}</p>
    </aside>
    <main><div className="billing-payment-heading"><h1>{tr(!p.selected?'billing.payment.chooseTitle':p.channel==='alipay'?'billing.payment.scanTitle':p.channel==='crypto'?'billing.payment.cryptoTitle':'billing.payment.title')}</h1><p>{tr(!p.selected?'billing.payment.chooseMethod':p.channel==='alipay'?'billing.payment.scanSubtitle':'billing.payment.chooseSubtitle')}</p></div>
      {!p.selected&&usd?<div className="billing-pay-methods billing-payment-choices">{methods.map(channel=><button key={channel} disabled={!p.channels[channel]} onClick={()=>p.onMethod(channel)}><span className="billing-payment-method-icon"><PaymentIcon crypto={channel==='crypto'}/></span><span><b>{name(channel)}</b><small>{tr(channel==='crypto'?'billing.payment.cryptoChoice':'billing.payment.webChoice')}</small></span><span className="billing-payment-choice-arrow" aria-hidden="true">→</span></button>)}</div>:<>
        <div className="billing-pay-methods billing-payment-tabs">{methods.map(channel=><button key={channel} className={p.channel===channel?'selected':''} disabled={p.busy||p.order?.status==='paid'||!p.channels[channel]} onClick={()=>p.onMethod(channel)}><PaymentIcon crypto={channel==='crypto'}/>{name(channel)}</button>)}</div>
        {p.channel==='crypto'&&<div className="billing-chain"><label>{tr('ui.billingpanel.network.879cac4')} <select disabled={p.busy||p.order?.status==='paid'} value={p.chain} onChange={e=>p.onChain(e.target.value as Props['chain'])}><option value="solana">Solana</option><option value="bsc">BNB Smart Chain</option><option value="tron">TRON</option></select></label></div>}
        {p.order?<BillingOrderView key={p.order.id} order={p.order} lang={p.lang} onNeedLogin={p.onNeedLogin} onPaid={p.onPaid}/>:<div className="billing-payment-preparing"><p role="status">{tr(p.ready?'billing.payment.preparing':'ui.billingpanel.this.purchase.is.currently.unavailable.please.3ef2387')}</p>{!p.busy&&p.ready&&<button className="billing-primary" onClick={p.onRetry}>{tr('ui.billingpanel.retry.2cd6945')}</button>}</div>}
      </>}
      <p className="billing-payment-safe"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>{tr('billing.payment.syncNote')}</p>
    </main>
  </div>;
}
