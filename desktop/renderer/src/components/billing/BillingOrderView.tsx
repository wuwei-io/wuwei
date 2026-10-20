import React,{useEffect,useRef,useState} from 'react';
import {QRCodeSVG} from 'qrcode.react';
import type {BillingOrder} from '../../../../../src/billing/contracts.js';

export function BillingOrderView({order:initial,lang,onPaid,onNeedLogin}:{order:BillingOrder;lang:'zh'|'en';onPaid:(order:BillingOrder)=>void;onNeedLogin:()=>void}){
  const en=lang==='en',L=(zh:string,enText:string)=>en?enText:zh;
  const [order,setOrder]=useState(initial),[querying,setQuerying]=useState(false),[error,setError]=useState(''),[ticks,setTicks]=useState(Date.now()),[copied,setCopied]=useState(false);
  const inFlight=useRef(false),live=useRef(true),paidOnce=useRef(false),queryRef=useRef<()=>Promise<void>>(async()=>{}),callbacks=useRef({onPaid,onNeedLogin});
  callbacks.current={onPaid,onNeedLogin};
  queryRef.current=async()=>{
    if(inFlight.current||!live.current||order.status==='paid'||order.status==='refunded')return;
    inFlight.current=true;setQuerying(true);setError('');
    try{
      const r=await window.wuwei.billingRequest({action:'order',orderId:initial.id});
      if(!live.current)return;
      if('error' in r){if(r.error==='not_logged_in')callbacks.current.onNeedLogin();throw Error(r.error);}
      if(!('id' in r)||r.id!==initial.id||r.sku!==initial.sku||r.currency!==initial.currency||r.amountMinor!==initial.amountMinor||r.channel!==initial.channel)throw Error('invalid_order_status');
      if(!['pending','paid','failed','expired','refunded'].includes(r.status))throw Error('invalid_order_status');
      setOrder({...initial,...r});
      if(r.status==='paid'&&!paidOnce.current){paidOnce.current=true;callbacks.current.onPaid(r);}
    }catch{if(live.current)setError(L('查询暂时失败，将自动重试。','Unable to check right now. Retrying automatically.'));}
    finally{inFlight.current=false;if(live.current)setQuerying(false);}
  };
  useEffect(()=>{
    live.current=true;
    if(order.status!=='pending'){
      if(order.status==='paid'&&!paidOnce.current){paidOnce.current=true;callbacks.current.onPaid(order);}
      return()=>{live.current=false;};
    }
    void queryRef.current();
    const timer=setInterval(()=>{setTicks(Date.now());void queryRef.current();},4000);
    return()=>{live.current=false;clearInterval(timer);};
  },[initial.id,order.status]);
  const deadline=order.expiresAt?Date.parse(order.expiresAt):null;
  const remaining=deadline!=null&&Number.isFinite(deadline)?Math.max(0,Math.ceil((deadline-ticks)/1000)):null;
  const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);if(live.current){setCopied(true);setTimeout(()=>{if(live.current)setCopied(false);},1600);}}catch{if(live.current)setError(L('复制失败，请手动选中复制。','Copy failed. Please select and copy manually.'));}};
  const checkout=()=>{
    if(remaining===0)return;
    try{const url=new URL(order.checkoutUrl??'');if(url.protocol!=='https:'||!['wuweiai.io','checkout.paddle.com','sandbox-checkout.paddle.com','pay.paddle.io'].includes(url.hostname))throw Error();window.wuwei.openExternal(url.href);}
    catch{setError(L('支付链接不可用，请联系支持。','Payment link unavailable. Please contact support.'));}
  };
  if(order.status==='paid')return <div className="billing-order-state"><span className="billing-paid-symbol">✓</span><h2>{L('支付成功','Payment confirmed')}</h2>{order.creditsGranted!=null&&<p>{L('本次到账','Credits delivered')}: <strong>{order.creditsGranted.toLocaleString()}</strong></p>}{order.balance!=null&&<p>{L('当前积分','Current credits')}: {order.balance.toLocaleString(undefined,{maximumFractionDigits:6})}</p>}{order.creditsGranted===0&&order.startsAt&&<p>{L('套餐生效时到账','Credits arrive on activation')}: {new Date(order.startsAt).toLocaleString(en?'en-US':'zh-CN')}</p>}<small>{L('订单号','Order ID')}: {order.id}</small><p>{L('你可以关闭窗口后继续任务。','Close this window to continue your work.')}</p></div>;
  if(order.status!=='pending')return <div className="billing-order-state"><h2>{order.status==='expired'?L('订单已失效','Order expired'):order.status==='refunded'?L('订单已退款','Order refunded'):L('付款未完成','Payment incomplete')}</h2><p>{L('请勿继续向此订单付款。如果已经付款，可查询确认结果或带订单号联系客服。','Do not pay this order. If already paid, check the confirmed result or contact support with this order ID.')}</p>{order.status!=='refunded'&&<button onClick={()=>void queryRef.current()} disabled={querying}>{L('我已付款，重新查询','I’ve paid — check again')}</button>}{error&&<p role="alert">{error}</p>}<small>{order.id}</small></div>;
  return <div className="billing-live-order">
    {order.qr&&order.channel==='alipay'&&remaining!==0&&<><div className="billing-real-qr"><QRCodeSVG value={order.qr} size={188} level="M"/></div><p>{L('请使用支付宝扫码付款','Scan with Alipay to pay')}</p></>}
    {order.channel==='paddle'&&<><h3>PayPal · Paddle</h3><p>{L('请在浏览器中的 Paddle 收银台完成付款。','Complete your payment in Paddle’s secure checkout.')}</p><button className="billing-primary" onClick={checkout}>{L('打开 PayPal 收银台','Open PayPal checkout')}</button></>}
    {order.crypto&&remaining!==0&&<><h3>{order.crypto.currency} · {order.crypto.network}</h3><p>{L('应付数量','Amount to send')}</p><strong className="billing-crypto-amount">{order.crypto.amount} {order.crypto.currency}</strong><div className="billing-real-qr"><QRCodeSVG value={order.crypto.address} size={176} level="M"/></div><label>{L('收款地址','Receiving address')}<code>{order.crypto.address}</code></label><button onClick={()=>void copy(order.crypto!.address)}>{copied?L('已复制','Copied'):L('复制地址','Copy address')}</button>{order.crypto.memo&&<label>{L('必须填写的备注 / Memo','Required memo / tag')}<code>{order.crypto.memo}</code><button onClick={()=>void copy(order.crypto!.memo!)}>{L('复制备注','Copy memo')}</button></label>}<p className="billing-network-warning">{L('只使用此订单指定的币种和网络。转账前请核对地址、应付数量和备注。','Use only the currency and network shown for this order. Verify the address, amount and memo before sending.')}</p></>}
    {remaining!=null&&<small>{remaining>0?L('付款剩余时间','Payment window')+` ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`:L('付款时间已到，正在核对最终状态，请勿继续转账。','Payment window ended. Checking the final status; do not send another payment.')}</small>}
    <p role="status">{querying?L('正在查询付款状态…','Checking payment status…'):L('等待支付确认，到账后自动更新','Waiting for confirmation. Your account updates automatically.')}</p>
    {error&&<p className="billing-order-error" role="alert">{error}</p>}
    <button className="billing-secondary" onClick={()=>void queryRef.current()} disabled={querying}>{L('我已付款，重新查询','I’ve paid — check again')}</button><small>{L('订单号','Order ID')}: {order.id}</small>
  </div>;
}
