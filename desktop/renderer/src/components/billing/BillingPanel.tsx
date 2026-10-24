import { tr, getCurrentLanguage, localizeStoredText } from "../../../../../src/localization/index.js";
import React,{useEffect,useRef,useState} from 'react';
import type {BillingCatalog,BillingPeriod,BillingQuote,BillingOrder,CreditLedger,CreditRecord} from '../../../../../src/billing/contracts.js';
import type {ModelChoice} from '../../../../../src/model-selection.js';
import {BillingPlans} from './BillingPlans.js';
import {BillingPayment} from './BillingPayment.js';
import {BillingSelector} from './BillingSelector.js';
import './billing.css';
import './plans.css';
import './payment.css';
import {formatCredits,formatLedgerTime,ledgerDescription,pageNumbers,showcaseModels,billingCheckoutUrl} from '../../../../../src/billing/presentation.js';
import {BillingDatePicker} from './BillingDatePicker.js';
import {billingRequest} from './request.js';
import {billingTrack} from './telemetry.js';
import {MINI_SKU,availableBillingProducts,billingProductsForPeriod,miniFailureKey} from '../../../../../src/billing/mini.js';
import './catalog.css';

type Props={lang:string;accountId:string;balance:number;models:ModelChoice[];initialPage?:'plans'|'ledger';initialPeriod?:BillingPeriod;insufficient?:boolean;imageMode?:boolean;onClose:()=>void;onNeedLogin:()=>void;onPaid?:()=>void;onSwitch:(choice:ModelChoice)=>Promise<void>};
const fmt=formatCredits;
const time=formatLedgerTime;
function csvCell(v:unknown){const text=String(v??'');return '"'+(/^[\s]*[=+@\-]/.test(text)?"'"+text:text).replace(/"/g,'""')+'"';}

export function BillingPanel(p:Props){
  const en=p.lang !== "zh",currency=p.lang === "zh" ? "CNY" : "USD";
  const [page,setPage]=useState<'plans'|'checkout'|'ledger'>(p.initialPage??'plans');
  const [period,setPeriod]=useState<BillingPeriod>(p.initialPeriod??"monthly");
  const [catalog,setCatalog]=useState<BillingCatalog|null>(null),[selected,setSelected]=useState(p.initialPeriod==='trial'?MINI_SKU:p.initialPeriod==='pack'?'v2_pack_3000':`v2_plan_plus_${p.initialPeriod??'monthly'}`);
  const [quote,setQuote]=useState<BillingQuote|null>(null),[catalogBusy,setCatalogBusy]=useState(false),[quoteBusy,setQuoteBusy]=useState(false),[orderBusy,setOrderBusy]=useState(false),[ledgerBusy,setLedgerBusy]=useState(false),[switchBusy,setSwitchBusy]=useState(false),[error,setError]=useState('');
  const [rules,setRules]=useState(false),[layout,setLayout]=useState<'split'|'cards'>('split');
  const [channel,setChannel]=useState<'alipay'|'paddle'|'crypto'>((getCurrentLanguage() === "zh" ? "alipay" : "paddle"));
  const [chain,setChain]=useState<'solana'|'bsc'|'tron'>('solana');
  const [order,setOrder]=useState<BillingOrder|null>(null),[paymentSelected,setPaymentSelected]=useState(currency==='CNY');
  const openWebAfterPrepare=useRef(false);
  const openWeb=(value:BillingOrder)=>{
    if(!openWebAfterPrepare.current)return;openWebAfterPrepare.current=false;
    const url=billingCheckoutUrl(value.checkoutUrl);if(url){billingTrack('billing_checkout_open',{channel:value.channel,sku:value.sku,order_id:value.id,lang:p.lang});void window.wuwei.openExternal(url);}else setError(tr('ui.billingorderview.payment.link.unavailable.please.contact.support.763c18f'));
  };
  const requestIds=useRef(new Map<string,string>()),orderCache=useRef(new Map<string,BillingOrder>());
  const [fallback,setFallback]=useState<ModelChoice|null>(null),[retry,setRetry]=useState(0);
  const [ledger,setLedger]=useState<CreditLedger|null>(null),[filter,setFilter]=useState(''),[search,setSearch]=useState(''),[offset,setOffset]=useState(0),[requestedPageSize,setRequestedPageSize]=useState(50);
  const [fromDate,setFromDate]=useState(''),[toDate,setToDate]=useState('');
  const [expanded,setExpanded]=useState<string|null>(null);
  const generation=useRef(0),attemptedOrder=useRef(''),orderInFlight=useRef(new Set<string>());
  useEffect(()=>{billingTrack('billing_panel_shown',{page:p.initialPage??'plans',lang:p.lang});},[p.accountId]);
  useEffect(()=>()=>{++generation.current;},[]);
  useEffect(()=>{++generation.current;setQuoteBusy(false);setOrderBusy(false);},[selected,period,channel,chain]);
  useEffect(()=>{
    if(quote||order)return;
    ++generation.current;setQuoteBusy(false);
    setChannel(currency==='CNY'?'alipay':catalog?.channels.paddle?'paddle':catalog?.channels.crypto?'crypto':'paddle');
  },[currency]);
  const panel=useRef<HTMLElement>(null);
  const dialogState=useRef({rules,fallback,onClose:p.onClose});
  dialogState.current={rules,fallback,onClose:p.onClose};
  useEffect(()=>{
    const before=document.activeElement as HTMLElement|null;
    panel.current?.querySelector<HTMLButtonElement>('.billing-close')?.focus();
    const handle=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){
        event.preventDefault();event.stopPropagation();
        const dateTrigger=panel.current?.querySelector<HTMLButtonElement>('.billing-date-trigger[aria-expanded="true"]');
        if(dateTrigger){dateTrigger.click();dateTrigger.focus();return;}
        if(dialogState.current.rules)setRules(false);
        else if(dialogState.current.fallback)setFallback(null);
        else dialogState.current.onClose();
      }
      if(event.key==='Tab'){
        const root=panel.current?.querySelector<HTMLElement>('.billing-subdialog section')??panel.current;
        const nodes=Array.from(root?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,a[href],[tabindex="0"]')??[]).filter(e=>e.offsetParent!==null);
        const first=nodes[0],last=nodes[nodes.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',handle,true);
    return()=>{document.removeEventListener('keydown',handle,true);if(before&&document.contains(before))before.focus();};
  },[]);
  useEffect(()=>{
    if(!rules&&!fallback)return;
    const before=document.activeElement as HTMLElement|null;
    panel.current?.querySelector<HTMLButtonElement>('.billing-subdialog section button')?.focus();
    return()=>{if(before&&document.contains(before))before.focus();};
  },[rules,fallback]);
  // Each request belongs to the mounted account and current view. Closing,
  // switching accounts or changing selection invalidates late responses.
  useEffect(()=>{
    let live=true;setCatalogBusy(true);setError('');setCatalog(null);
    billingRequest({action:'catalog'}).then(r=>{
      if(!live)return;
      if('error' in r){if(r.error==='not_logged_in')p.onNeedLogin();throw Error(r.error);}
      if(!('products' in r)||!Array.isArray(r.products))throw Error('invalid_catalog');
      setCatalog(r);
      if(en)setChannel(r.channels.paddle?'paddle':r.channels.crypto?'crypto':'paddle');
    }).catch(()=>{if(live)setError(tr("ui.billingpanel.unable.to.load.please.retry.959c506"));}).finally(()=>{if(live)setCatalogBusy(false);});
    return()=>{live=false;};
  },[p.accountId,retry]);
  useEffect(()=>{const key=(period==='trial'?MINI_SKU:period==='pack'?'v2_pack_3000':`v2_plan_plus_${period}`);setSelected(key);setQuote(null);setOrder(null);},[period]);
  useEffect(()=>{
    if(page!=='ledger')return;let live=true;setLedgerBusy(true);setError('');setLedger(null);
    const timer=setTimeout(()=>{
      billingRequest({action:'ledger',offset,limit:requestedPageSize,type:filter,search,
        ...(fromDate?{from:new Date(fromDate+'T00:00:00').toISOString()}:{}),
        ...(toDate?{to:new Date(toDate+'T23:59:59.999').toISOString()}:{}),
      }).then(r=>{
        if(!live)return;
        if('error' in r){if(r.error==='not_logged_in')p.onNeedLogin();throw Error(r.error);}
        if(!('records' in r))throw Error('invalid_ledger');setLedger(r);
      }).catch(()=>{if(live)setError(tr("ui.billingpanel.unable.to.load.credit.details.please.e7e4922"));}).finally(()=>{if(live)setLedgerBusy(false);});
    },250);
    return()=>{live=false;clearTimeout(timer);};
  },[page,offset,requestedPageSize,filter,search,fromDate,toDate,retry,p.accountId]);
  const availableProducts=availableBillingProducts(catalog);
  const products=billingProductsForPeriod(availableProducts,period);
  useEffect(()=>{if(page==='plans'&&catalog&&selected===MINI_SKU&&!availableProducts.some(x=>x.sku===MINI_SKU))setSelected(`v2_plan_plus_${period}`);},[page,catalog,selected,period]);
  const product=products.find(x=>x.sku===selected)??products.find(x=>x.recommended)??products[0];
  const models=showcaseModels(p.models);
  const free=p.models.find(m=>m.free&&m.modelId==='openrouter-auto-free')??p.models.find(m=>m.free);
  const value=p.models.find(m=>m.category==='economy'&&m.recommended);

  const requestQuote=async(chosen=product)=>{
    if(!chosen||quoteBusy)return;const current=++generation.current;setQuoteBusy(true);setError('');
    billingTrack(chosen.kind==='pack'?'buy_credits_click':'upgrade_member_click',{sku:chosen.sku,period:chosen.period,currency,lang:p.lang,layout,source:'billing_v2'});
    try{const r=await billingRequest({action:'quote',sku:chosen.sku,currency});if(generation.current!==current)return;
      if('error' in r){if(r.error==='not_logged_in')p.onNeedLogin();throw Error(r.error);}
      if(!('catalogVersion' in r)||r.sku!==chosen.sku||r.currency!==currency)throw Error('invalid_quote');
      attemptedOrder.current='';openWebAfterPrepare.current=false;setChannel(r.currency==='CNY'?'alipay':catalog?.channels.paddle?'paddle':'crypto');setPaymentSelected(r.currency==='CNY');setSelected(chosen.sku);setQuote(r);setOrder(null);setPage('checkout');
      if(r.currency==='CNY')billingTrack('billing_payment_method_select',{channel:'alipay',selection:'automatic',sku:r.sku,currency:r.currency,lang:p.lang});
    }catch(e){if(generation.current===current){setError(tr(miniFailureKey(e,"ui.billingpanel.quote.unavailable.please.retry.49ba615")));if(e instanceof Error&&/TRIAL_(USED|DISABLED)/.test(e.message)){setSelected("v2_plan_plus_monthly");setPeriod("monthly");setRetry(x=>x+1);}}}
    finally{if(generation.current===current)setQuoteBusy(false);}
  };
  const createOrder=async()=>{
    if(!quote||!catalog?.checkoutReady||!catalog.channels[channel]||order)return;
    const key=[quote.catalogVersion,quote.sku,quote.currency,quote.amountMinor,quote.creditsPerGrant,quote.startsAt??'',channel,channel==='crypto'?chain:''].join(':');
    if(orderInFlight.current.has(key))return;
    const cached=orderCache.current.get(key);
    if(cached&&cached.status==='pending'&&(!cached.expiresAt||Date.parse(cached.expiresAt)>Date.now())){setOrder(cached);if(channel==='paddle')openWeb(cached);return;}
    orderInFlight.current.add(key);
    const current=++generation.current;
    const requestId=requestIds.current.get(key)??crypto.randomUUID();requestIds.current.set(key,requestId);
    setOrderBusy(true);setError('');
    try{
      const r=await billingRequest({action:'create-order',sku:quote.sku,currency:quote.currency,channel,chain:channel==='crypto'?chain:undefined,requestId,expected:{catalogVersion:quote.catalogVersion,amountMinor:quote.amountMinor,creditsPerGrant:quote.creditsPerGrant,startsAt:quote.startsAt}});
      if(generation.current!==current)return;
      if('error' in r){if(r.error==='not_logged_in')p.onNeedLogin();if(r.error==='QUOTE_CHANGED'){setQuote(null);setPage('plans');setCatalog(null);setRetry(x=>x+1);throw Error('quote_changed');}throw Error(r.error);}
      if(!('id' in r)||r.sku!==quote.sku||r.currency!==quote.currency||r.amountMinor!==quote.amountMinor||r.channel!==channel)throw Error('invalid_order');
      orderCache.current.set(key,r);setOrder(r);billingTrack('billing_order_created',{channel:r.channel,sku:r.sku,order_id:r.id,currency:r.currency,lang:p.lang,...(channel==='crypto'?{chain}:{})});if(channel==='paddle')openWeb(r);
    }catch(e){if(generation.current===current)setError(tr(miniFailureKey(e,"ui.billingpanel.unable.to.create.an.order.please.19dc49a")));}
    finally{orderInFlight.current.delete(key);if(generation.current===current)setOrderBusy(false);}
  };
  useEffect(()=>{
    if(page!=='checkout'||!paymentSelected||!quote||order||!catalog?.checkoutReady||!catalog.channels[channel])return;
    const key=[quote.sku,quote.currency,quote.catalogVersion,quote.amountMinor,quote.creditsPerGrant,quote.startsAt??'',channel,chain].join(':');
    if(attemptedOrder.current===key)return;
    const timer=setTimeout(()=>{attemptedOrder.current=key;void createOrder();},0);
    return()=>clearTimeout(timer);
  },[page,paymentSelected,quote,order,catalog,channel,chain]);
  const switchModel=async()=>{if(!fallback||switchBusy)return;setSwitchBusy(true);setError('');try{await p.onSwitch(fallback);p.onClose();}catch{setError(tr('ui.billingpanel.unable.to.switch.please.retry.8f406cd'));}finally{setSwitchBusy(false);}};
  const pageSize=ledger?.limit??requestedPageSize,currentPage=Math.floor(offset/pageSize)+1;
  const total=ledger?.total,pageCount=total==null?null:Math.max(1,Math.ceil(total/pageSize));
  const exportCSV=()=>{
    if(!ledger)return;
    const header=[tr("ui.billingpanel.time.772ed3a"), tr("set.st.type"), tr("ui.billingpanel.tool.c0b7366"), tr("set.m.model"), tr("ui.billingpanel.parameters.a678098"), tr("ui.billingpanel.change.59f4476"), tr("ui.billingpanel.balance.after.5acbed4"), tr("ui.billingpanel.expires.b8be4d9"), tr("ui.billingpanel.related.record.b27d427")];
    const lines=[header,...ledger.records.map(r=>[time(r.createdAt,p.lang),typeName(r),r.tool,r.model,JSON.stringify(r.parameters??{}),r.amount,r.balanceAfter,r.expiresAt?time(r.expiresAt,p.lang):'',r.relatedId])];
    const url=URL.createObjectURL(new Blob(['\ufeff'+lines.map(row=>row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='wuwei-credit-records.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const typeName=(r:CreditRecord)=>({gift:tr("ui.billingpanel.grant.d0f6ff5"),earn:tr("ui.billingpanel.grant.d0f6ff5"),model_check:tr('billing.usage.modelCheck'),spend:tr("ui.billingpanel.usage.b9fbe08"),expire:tr("ui.billingpanel.expired.72d325c"),refund:tr("ui.billingpanel.refund.21eb54f"),adjust:tr("ui.billingpanel.adjustment.37c1a32")}[r.type]??r.type);
  return <div className="billing-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)p.onClose();}}><section ref={panel} onKeyDown={e=>e.stopPropagation()} className={'billing-panel '+(page==='plans'?'billing-plan-view '+(layout==='split'?'billing-selector-view':'') :page==='checkout'?'billing-payment-view':'')} role="dialog" aria-modal="true" aria-labelledby="billing-title">
    <div className="billing-top"><b id="billing-title">{page==='ledger'?tr("ui.app.credit.details.a3a619a"):tr("ui.billingpanel.wuwei.plans.and.payment.4ce473d")}</b><div>{page!=='plans'&&<button onClick={()=>{setPage('plans');setError('');}}>{tr("ui.billingpanel.back.to.plans.f6afada")}</button>}{page==='plans'&&<button onClick={()=>setLayout(layout==='split'?'cards':'split')}>{tr(layout==='split'?'ui.billingpanel.compare.plans.9ce46b0':'ui.billingpanel.compact.layout.5bfae9b')}</button>}<button onClick={()=>{setPage('ledger');setOffset(0);setError('');}}>{tr("ui.app.credit.details.a3a619a")}</button><button className="billing-close" aria-label={tr("msg.close")} onClick={p.onClose}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div></div>
    {error&&<div className="billing-error" role="alert">{localizeStoredText(error, getCurrentLanguage())} <button onClick={()=>setRetry(x=>x+1)}>{tr("ui.billingpanel.retry.2cd6945")}</button></div>}
    {page==='plans'&&(layout==='cards'?<BillingPlans lang={p.lang} period={period} currency={currency} products={products} catalogProducts={availableProducts} backgroundPolicy={catalog?.backgroundPolicy} member={catalog?.member??false} models={models} busy={quoteBusy} loading={catalogBusy} balance={p.balance} insufficient={p.insufficient} onPeriod={next=>{billingTrack('billing_period_select',{period:next,lang:p.lang});setPeriod(next);}} onChoose={chosen=>void requestQuote(chosen)} onFree={free?()=>setFallback(free):undefined} onRules={()=>setRules(true)}/>:<BillingSelector lang={p.lang} period={period} currency={currency} products={products} catalogProducts={availableProducts} backgroundPolicy={catalog?.backgroundPolicy} member={catalog?.member??false} models={p.models} busy={quoteBusy} loading={catalogBusy} balance={p.balance} insufficient={p.insufficient} onPeriod={next=>{billingTrack('billing_period_select',{period:next,lang:p.lang});setPeriod(next);}} onChoose={chosen=>void requestQuote(chosen)} onFree={free?()=>setFallback(free):undefined} onValue={!p.imageMode&&value?()=>setFallback(value):undefined} onRules={()=>setRules(true)} selected={product?.sku??selected} onSelect={sku=>{billingTrack('billing_plan_select',{sku,period,lang:p.lang});setSelected(sku);setQuote(null);}}/>)}
    {page==='checkout'&&quote&&<BillingPayment lang={p.lang} quote={quote} order={order} channel={channel} chain={chain} busy={orderBusy} selected={paymentSelected} channels={{...(catalog?.channels??{alipay:false,paddle:false,crypto:false}),...(quote.period==='trial'?{crypto:false}:{})}} ready={!!catalog?.checkoutReady&&!!catalog.channels[channel]}
      onMethod={next=>{billingTrack('billing_payment_method_select',{channel:next,selection:'manual',sku:quote.sku,currency:quote.currency,lang:p.lang});openWebAfterPrepare.current=next==='paddle';setPaymentSelected(true);if(channel!==next){setOrder(null);setChannel(next);}else if(order&&next==='paddle')openWeb(order);}}
      onChain={next=>{billingTrack('billing_crypto_network_select',{channel:'crypto',chain:next,sku:quote.sku,lang:p.lang});setOrder(null);setChain(next);}} onRetry={()=>void createOrder()} onNeedLogin={p.onNeedLogin}
      onPaid={confirmed=>{const key=[quote.catalogVersion,quote.sku,quote.currency,quote.amountMinor,quote.creditsPerGrant,quote.startsAt??'',channel,channel==='crypto'?chain:''].join(':');setOrder(confirmed);requestIds.current.delete(key);orderCache.current.delete(key);attemptedOrder.current='';setRetry(x=>x+1);p.onPaid?.();}}/>}
    {page==='ledger'&&<main className="billing-ledger"><h1>{tr("ui.app.credit.details.a3a619a")}</h1><p>{tr("ui.billingpanel.review.grants.usage.expirations.refunds.and.f79df46")}</p><div className="billing-ledger-balance"><span>{tr("ui.billingorderview.current.credits.18a748e")}</span><strong>{fmt(ledger?.balance??p.balance)}</strong></div><div className="billing-filters"><input aria-label={tr("ui.billingpanel.search.records.a47f00e")} placeholder={tr("ui.billingpanel.search.tool.model.or.description.e11f1b1")} value={search} onChange={e=>{setOffset(0);setSearch(e.target.value);}}/><select aria-label={tr("ui.billingpanel.record.type.9b79abc")} value={filter} onChange={e=>{setOffset(0);setFilter(e.target.value);}}>{[['',tr("ui.billingpanel.all.types.2243fd1")],['gift',tr("ui.billingpanel.gifts.e80289f")],['earn',tr("ui.billingpanel.earnings.d100b4f")],['spend',tr('billing.usage.taskOnly')],['model_check',tr('billing.usage.modelCheck')],['expire',tr("ui.billingpanel.expirations.a0e9e1b")],['refund',tr("ui.billingpanel.refunds.c4d91e4")],['adjust',tr("ui.billingpanel.adjustments.7464596")]].map(([v,n])=><option key={v} value={v}>{n}</option>)}</select><label className="billing-date">{tr("ui.billingpanel.from.9ed312b")}<BillingDatePicker lang={p.lang} label={tr("ui.billingpanel.start.date.5abdf63")} value={fromDate} max={toDate||undefined} onChange={value=>{setOffset(0);setFromDate(value);}}/></label><label className="billing-date">{tr("ui.billingpanel.to.83650ab")}<BillingDatePicker lang={p.lang} label={tr("ui.billingpanel.end.date.2bca364")} value={toDate} min={fromDate||undefined} onChange={value=>{setOffset(0);setToDate(value);}}/></label><button onClick={exportCSV} disabled={!ledger?.records.length}>{tr("ui.billingpanel.export.this.page.as.csv.b0a5612")}</button></div>
      {ledgerBusy&&<p role="status">{tr("ui.billingpanel.loading.64db553")}</p>}{ledger&&!ledger.records.length&&<p className="billing-empty">{tr("ui.billingpanel.no.matching.records.7b0e370")}</p>}
      {ledger?.records.map(r=><article key={r.id} className="billing-credit-record"><button onClick={()=>setExpanded(expanded===r.id?null:r.id)}><div><span className="billing-type">{typeName(r)}</span><b>{ledgerDescription(r,p.lang)||typeName(r)}</b><small>{time(r.createdAt,p.lang)}</small>{r.parameters?.turn_kind&&<small>{tr("billing.turn."+r.parameters.turn_kind)}</small>}{(r.tool||r.model)&&<p>{[r.tool,r.model].filter(Boolean).join(' · ')}</p>}</div><div><strong className={r.amount>0?'credit':'debit'}>{r.amount>0?'+':''}{fmt(r.amount)}</strong><small>{tr("usage.coinBal")}: {r.balanceAfter==null?'—':fmt(r.balanceAfter)}</small></div></button>{expanded===r.id&&<dl className="billing-record-detail"><dt>{tr("ui.billingpanel.record.id.7cbd493")}</dt><dd>{r.id}</dd>{r.expiresAt&&<><dt>{tr("ui.billingpanel.expires.b8be4d9")}</dt><dd>{time(r.expiresAt,p.lang)}</dd></>}{r.relatedId&&<><dt>{tr("ui.billingpanel.related.record.b27d427")}</dt><dd>{r.relatedId}</dd></>}{Object.entries(r.parameters??{}).map(([k,v])=><React.Fragment key={k}><dt>{["turn_kind","input_tokens","output_tokens","cache_hit_tokens"].includes(k)?tr("billing.parameter."+k):k}</dt><dd>{k==="turn_kind"&&(v==="user_turn"||v==="tool_cont")?tr("billing.turn."+v):String(v)}</dd></React.Fragment>)}</dl>}</article>)}
      <div className="billing-pagination">
        <span className="billing-page-total">{total==null?tr('billing.pages.unknown'):tr('billing.pages.total',{total:fmt(total),pages:fmt(pageCount??1)})}</span>
        <label className="billing-page-size">{tr('billing.pages.size')}<select aria-label={tr('billing.pages.size')} value={requestedPageSize} onChange={e=>{setOffset(0);setRequestedPageSize(Number(e.target.value));}}>{[10,20,50,100,200,500].map(size=><option key={size} value={size}>{size}</option>)}</select></label>
        <nav aria-label={tr('billing.pages.label')}><button disabled={!offset||ledgerBusy} onClick={()=>setOffset(Math.max(0,offset-pageSize))}>{tr('ui.billingpanel.previous.2149c19')}</button>
        {pageCount!=null?pageNumbers(currentPage,pageCount).map((n,i)=>typeof n==='number'?<button aria-label={tr('billing.pages.go',{page:n})} aria-current={n===currentPage?'page':undefined} disabled={ledgerBusy} key={n} onClick={()=>setOffset((n-1)*pageSize)}>{n}</button>:<span key={'gap'+i}>…</span>):<span>{currentPage}</span>}
        <button disabled={!ledger?.hasMore||ledgerBusy} onClick={()=>setOffset(offset+pageSize)}>{tr('ui.billingpanel.next.bbe67f7')}</button></nav>
        {pageCount!=null&&pageCount>1&&<label>{tr('billing.pages.jump')}<input aria-label={tr('billing.pages.jump')} type="number" min="1" max={pageCount} key={currentPage} defaultValue={currentPage} onKeyDown={e=>{if(e.key==='Enter'){const n=Number(e.currentTarget.value);if(Number.isInteger(n)&&n>=1&&n<=pageCount)setOffset((n-1)*pageSize);}}}/></label>}
      </div>
    </main>}
    {rules&&<div className="billing-subdialog"><section role="dialog" aria-modal="true" aria-label={tr("ui.billingpanel.model.and.credit.usage.guidelines.4044e14")}><button className="billing-close" onClick={()=>setRules(false)} aria-label={tr("ui.billingpanel.close.guidelines.a2a214a")}>×</button><h2>{tr("ui.billingpanel.model.and.credit.usage.guidelines.4044e14")}</h2><h3>{tr("ui.billingpanel.usage.based.billing.6f7ff18")}</h3><p>{tr("ui.billingpanel.plans.include.credits.usage.varies.by.ee7838d")}</p><h3>{tr("ui.billingpanel.grants.and.expiry.dbbf3ba")}</h3><p>{tr("ui.billingpanel.annual.credits.are.granted.monthly.and.50ab906")}</p><h3>{tr("ui.billingpanel.free.models.3bef341")}</h3><p>{tr("ui.billingpanel.free.models.have.daily.allowances.and.884fff9")}</p></section></div>}
    {fallback&&<div className="billing-subdialog"><section role="alertdialog" aria-label={tr("ui.billingpanel.confirm.model.switch.16f0aa9")}><h2>{p.imageMode?tr("ui.billingpanel.switch.to.text.chat.89f3d49"):tr("ui.billingpanel.switch.models.47e08f6")}</h2><p>{p.imageMode?tr("ui.billingpanel.free.text.models.cannot.generate.images.908b030"):tr("ui.billingpanel.your.input.is.kept.send.it.5761248")}</p><b>{en?fallback.labelEn:fallback.label}</b><button className="billing-primary" disabled={switchBusy} onClick={()=>void switchModel()}>{tr("ui.billingpanel.confirm.switch.5ba3e7f")}</button><button className="billing-link" onClick={()=>setFallback(null)}>{tr("set.st.cancel")}</button></section></div>}
  </section></div>;
}
