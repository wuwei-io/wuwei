import { tr, getCurrentLanguage, localizeStoredText } from "../../../../../src/localization/index.js";
import React,{useEffect,useRef,useState} from 'react';
import {QRCodeSVG} from 'qrcode.react';
import type {BillingOrder} from '../../../../../src/billing/contracts.js';
import {billingRequest} from './request.js';
import {formatCredits,formatLedgerTime,billingCheckoutUrl} from '../../../../../src/billing/presentation.js';
import {billingTrack} from './telemetry.js';

export function BillingOrderView({order:initial,lang,onPaid,onNeedLogin}:{order:BillingOrder;lang:string;onPaid:(order:BillingOrder)=>void;onNeedLogin:()=>void}){
  const en=lang !== "zh";
  const [order,setOrder]=useState(initial),[querying,setQuerying]=useState(false),[error,setError]=useState(''),[ticks,setTicks]=useState(Date.now()),[copied,setCopied]=useState(false);
  const inFlight=useRef(false),live=useRef(true),paidOnce=useRef(false),queryRef=useRef<()=>Promise<void>>(async()=>{}),callbacks=useRef({onPaid,onNeedLogin});
  callbacks.current={onPaid,onNeedLogin};
  queryRef.current=async()=>{
    if(inFlight.current||!live.current||order.status==='paid'||order.status==='refunded')return;
    inFlight.current=true;setQuerying(true);setError('');
    try{
      const r=await billingRequest({action:'order',orderId:initial.id});
      if(!live.current)return;
      if('error' in r){if(r.error==='not_logged_in')callbacks.current.onNeedLogin();throw Error(r.error);}
      if(!('id' in r)||r.id!==initial.id||r.sku!==initial.sku||r.currency!==initial.currency||r.amountMinor!==initial.amountMinor||r.channel!==initial.channel)throw Error('invalid_order_status');
      if(!['pending','paid','failed','expired','refunded'].includes(r.status))throw Error('invalid_order_status');
      setOrder({...initial,...r});
      if(r.status==='paid'&&!r.refundRequired&&!paidOnce.current){paidOnce.current=true;callbacks.current.onPaid(r);}
    }catch{if(live.current)setError(tr("ui.billingorderview.unable.to.check.right.now.retrying.260959b"));}
    finally{inFlight.current=false;if(live.current)setQuerying(false);}
  };
  useEffect(()=>{
    live.current=true;
    if(order.status!=='pending'){
      if(order.status==='paid'&&!order.refundRequired&&!paidOnce.current){paidOnce.current=true;callbacks.current.onPaid(order);}
      return()=>{live.current=false;};
    }
    void queryRef.current();
    const timer=setInterval(()=>{setTicks(Date.now());void queryRef.current();},4000);
    return()=>{live.current=false;clearInterval(timer);};
  },[initial.id,order.status]);
  const deadline=order.expiresAt?Date.parse(order.expiresAt):null;
  const remaining=deadline!=null&&Number.isFinite(deadline)?Math.max(0,Math.ceil((deadline-ticks)/1000)):null;
  const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);if(live.current){setCopied(true);setTimeout(()=>{if(live.current)setCopied(false);},1600);}}catch{if(live.current)setError(tr("ui.billingorderview.copy.failed.please.select.and.copy.5191893"));}};
  const checkout=()=>{
    if(remaining===0)return;
    try{const url=billingCheckoutUrl(order.checkoutUrl);if(!url)throw Error();billingTrack('billing_checkout_open',{channel:order.channel,sku:order.sku,order_id:order.id,lang});window.wuwei.openExternal(url);}
    catch{setError(tr("ui.billingorderview.payment.link.unavailable.please.contact.support.763c18f"));}
  };
  const lastStatus=useRef('');
  useEffect(()=>{if(order.status==='pending'||lastStatus.current===order.status)return;lastStatus.current=order.status;billingTrack('billing_order_status',{status:order.status,channel:order.channel,sku:order.sku,order_id:order.id,lang,refund_required:!!order.refundRequired,credits_granted:order.creditsGranted??0});if(order.status==='paid'&&!order.refundRequired&&(order.creditsGranted??0)>0)billingTrack('billing_credits_delivered',{channel:order.channel,sku:order.sku,order_id:order.id,credits_granted:order.creditsGranted,lang});},[order.status,order.id]);
  if(order.refundRequired)return <div className="billing-order-state" role="alert"><p>{tr('billing.mini.refund')}</p><small>{order.id}</small></div>;
  if(order.status==='paid')return <div className="billing-order-state"><span className="billing-paid-symbol">✓</span><h2>{tr("ui.billingorderview.payment.confirmed.5e8bdaf")}</h2>{order.creditsGranted!=null&&<p>{tr("ui.billingorderview.credits.delivered.4279dc3")}: <strong>{formatCredits(order.creditsGranted)}</strong></p>}{order.balance!=null&&<p>{tr("ui.billingorderview.current.credits.18a748e")}: {formatCredits(order.balance)}</p>}{order.creditsGranted===0&&order.startsAt&&<p>{tr("ui.billingorderview.credits.arrive.on.activation.f3aae38")}: {formatLedgerTime(order.startsAt,lang)}</p>}<small>{tr("ui.billingorderview.order.id.5959d9f")}: {order.id}</small><p>{tr("ui.billingorderview.close.this.window.to.continue.your.028cc1b")}</p></div>;
  if(order.status!=='pending')return <div className="billing-order-state"><h2>{order.status==='expired'?tr("ui.billingorderview.order.expired.aaf6b58"):order.status==='refunded'?tr("ui.billingorderview.order.refunded.30fa693"):tr("ui.billingorderview.payment.incomplete.041f155")}</h2><p>{tr("ui.billingorderview.do.not.pay.this.order.if.7aebe55")}</p>{order.status!=='refunded'&&<button onClick={()=>void queryRef.current()} disabled={querying}>{tr("ui.billingorderview.ve.paid.check.again.88e3864")}</button>}{error&&<p role="alert">{localizeStoredText(error, getCurrentLanguage())}</p>}<small>{order.id}</small></div>;
  return <div className={"billing-live-order "+(order.crypto?"billing-crypto-order":"")}>
    {order.qr&&order.channel==='alipay'&&remaining!==0&&<><div className="billing-real-qr"><QRCodeSVG value={order.qr} size={188} level="M"/></div><p>{tr("ui.billingorderview.scan.with.alipay.to.pay.20703c5")}</p></>}
    {order.channel==='paddle'&&<><div className="billing-payment-brands"><span className="paypal">PayPal</span><span className="visa">{tr('billing.payment.cards')}</span></div><h3>{tr('billing.payment.webMethod')}</h3><p>{tr("ui.billingorderview.complete.your.payment.in.paddle.secure.6077b99")}</p><button className="billing-primary" onClick={checkout}>{tr("ui.billingorderview.open.paypal.checkout.4394d44")}</button></>}
    {order.crypto&&remaining!==0&&<><h3>{order.crypto.currency} · {order.crypto.network}</h3><p>{tr("ui.billingorderview.amount.to.send.e01b94f")}</p><strong className="billing-crypto-amount">{order.crypto.amount} {order.crypto.currency}</strong><div className="billing-real-qr"><QRCodeSVG value={order.crypto.address} size={176} level="M"/></div><div className="billing-crypto-address"><span>{tr("ui.billingorderview.receiving.address.25320f9")}</span><div><code>{order.crypto.address}</code><button onClick={()=>void copy(order.crypto!.address)}>{copied?tr("pay.support.copied"):tr("ui.app.copy.address.e5bff41")}</button></div></div>{order.crypto.memo&&<label>{tr("ui.billingorderview.required.memo.tag.0cc4536")}<code>{order.crypto.memo}</code><button onClick={()=>void copy(order.crypto!.memo!)}>{tr("ui.billingorderview.copy.memo.0e3e3d2")}</button></label>}<p className="billing-network-warning">{tr("ui.billingorderview.use.only.the.currency.and.network.a6e05bd")}</p></>}
    {remaining!=null&&<small>{remaining>0?tr("ui.billingorderview.payment.window.394d80e")+` ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`:tr("ui.billingorderview.payment.window.ended.checking.the.final.5d06b7e")}</small>}
    <p role="status">{querying?tr("ui.billingorderview.checking.payment.status.fd2b050"):tr("ui.billingorderview.waiting.for.confirmation.your.account.updates.99c3646")}</p>
    {error&&<p className="billing-order-error" role="alert">{localizeStoredText(error, getCurrentLanguage())}</p>}
    <button className="billing-secondary" onClick={()=>void queryRef.current()} disabled={querying}>{tr("ui.billingorderview.ve.paid.check.again.88e3864")}</button><small>{tr("ui.billingorderview.order.id.5959d9f")}: {order.id}</small>
  </div>;
}
