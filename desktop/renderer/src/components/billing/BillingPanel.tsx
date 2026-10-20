import React,{useEffect,useRef,useState} from 'react';
import type {BillingCatalog,BillingPeriod,BillingProduct,BillingQuote,BillingOrder,CreditLedger,CreditRecord} from '../../../../../src/billing/contracts.js';
import type {ModelChoice} from '../../../../../src/model-selection.js';
import {BillingBrand} from './BillingBrand.js';
import {BillingOrderView} from './BillingOrderView.js';
import './billing.css';

type Props={lang:'zh'|'en';accountId:string;balance:number;models:ModelChoice[];initialPage?:'plans'|'ledger';initialPeriod?:BillingPeriod;insufficient?:boolean;imageMode?:boolean;onClose:()=>void;onNeedLogin:()=>void;onPaid?:()=>void;onSwitch:(choice:ModelChoice)=>Promise<void>};
const fmt=(n:number)=>n.toLocaleString(undefined,{maximumFractionDigits:6});
const price=(minor:number,currency:'CNY'|'USD')=>new Intl.NumberFormat(currency==='CNY'?'zh-CN':'en-US',{style:'currency',currency,maximumFractionDigits:minor%100===0?0:2}).format(minor/100);
const time=(value:string,lang:'zh'|'en')=>new Intl.DateTimeFormat(lang==='zh'?'zh-CN':'en-US',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(new Date(value));
function csvCell(v:unknown){const text=String(v??'');return '"'+(/^[\s]*[=+@\-]/.test(text)?"'"+text:text).replace(/"/g,'""')+'"';}

export function BillingPanel(p:Props){
  const en=p.lang==='en',L=(zh:string,enText:string)=>en?enText:zh,currency=en?'USD':'CNY';
  const [page,setPage]=useState<'plans'|'checkout'|'ledger'>(p.initialPage??'plans');
  const [period,setPeriod]=useState<BillingPeriod>(p.initialPeriod??'monthly');
  const [catalog,setCatalog]=useState<BillingCatalog|null>(null),[selected,setSelected]=useState('v2_plan_plus_monthly');
  const [quote,setQuote]=useState<BillingQuote|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [rules,setRules]=useState(false),[compare,setCompare]=useState(false),[layout,setLayout]=useState<'split'|'cards'>('split');
  const [channel,setChannel]=useState<'alipay'|'paddle'|'crypto'>(en?'paddle':'alipay');
  const [chain,setChain]=useState<'solana'|'bsc'|'tron'>('solana');
  const [order,setOrder]=useState<BillingOrder|null>(null);
  const requestIds=useRef(new Map<string,string>());
  const [fallback,setFallback]=useState<ModelChoice|null>(null),[retry,setRetry]=useState(0);
  const [ledger,setLedger]=useState<CreditLedger|null>(null),[filter,setFilter]=useState(''),[search,setSearch]=useState(''),[offset,setOffset]=useState(0);
  const [fromDate,setFromDate]=useState(''),[toDate,setToDate]=useState('');
  const [expanded,setExpanded]=useState<string|null>(null);
  const generation=useRef(0);
  const panel=useRef<HTMLElement>(null);
  const dialogState=useRef({rules,fallback,onClose:p.onClose});
  dialogState.current={rules,fallback,onClose:p.onClose};
  useEffect(()=>{
    const before=document.activeElement as HTMLElement|null;
    panel.current?.querySelector<HTMLButtonElement>('.billing-close')?.focus();
    const handle=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){
        event.preventDefault();event.stopPropagation();
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
    const generationNow=++generation.current;let live=true;setBusy(true);setError('');setCatalog(null);
    window.wuwei.billingRequest({action:'catalog'}).then(r=>{
      if(!live||generation.current!==generationNow)return;
      if('error' in r){if(r.error==='not_logged_in')p.onNeedLogin();throw Error(r.error);}
      if(!('products' in r)||!Array.isArray(r.products))throw Error('invalid_catalog');
      setCatalog(r);
      if(en&&!r.channels.paddle&&r.channels.crypto)setChannel('crypto');
    }).catch(()=>{if(live)setError(L('暂时无法加载，请重试。','Unable to load. Please retry.'));}).finally(()=>{if(live)setBusy(false);});
    return()=>{live=false;++generation.current;};
  },[p.accountId,retry]);
  useEffect(()=>{const key=(period==='pack'?'v2_pack_3000':`v2_plan_plus_${period}`);setSelected(key);setQuote(null);setOrder(null);},[period]);
  useEffect(()=>{
    if(page!=='ledger')return;let live=true;setBusy(true);setError('');setLedger(null);
    const timer=setTimeout(()=>{
      window.wuwei.billingRequest({action:'ledger',offset,type:filter,search,
        ...(fromDate?{from:new Date(fromDate+'T00:00:00').toISOString()}:{}),
        ...(toDate?{to:new Date(toDate+'T23:59:59.999').toISOString()}:{}),
      }).then(r=>{
        if(!live)return;
        if('error' in r){if(r.error==='not_logged_in')p.onNeedLogin();throw Error(r.error);}
        if(!('records' in r))throw Error('invalid_ledger');setLedger(r);
      }).catch(()=>{if(live)setError(L('无法加载积分明细，请重试。','Unable to load credit details. Please retry.'));}).finally(()=>{if(live)setBusy(false);});
    },250);
    return()=>{live=false;clearTimeout(timer);};
  },[page,offset,filter,search,fromDate,toDate,retry,p.accountId]);
  const products=catalog?.products.filter(x=>x.period===period)??[];
  const product=catalog?.products.find(x=>x.sku===selected);
  const models=p.models.filter(m=>m.category!=='connections'&&m.category!=='free').sort((a,b)=>Number(b.recommended)-Number(a.recommended)||a.rank-b.rank).slice(0,10);
  const free=p.models.find(m=>m.free&&m.modelId==='openrouter-auto-free')??p.models.find(m=>m.free);
  const value=p.models.find(m=>m.category==='economy'&&m.recommended);
  const credits=(x:BillingProduct)=>x.kind==='pack'&&catalog?.member?x.memberCredits:x.credits;
  const requestQuote=async()=>{
    if(!product||busy)return;const current=++generation.current;setBusy(true);setError('');
    try{const r=await window.wuwei.billingRequest({action:'quote',sku:product.sku,currency});if(generation.current!==current)return;
      if('error' in r){if(r.error==='not_logged_in')p.onNeedLogin();throw Error(r.error);}
      if(!('catalogVersion' in r)||r.sku!==product.sku||r.currency!==currency)throw Error('invalid_quote');
      setQuote(r);setOrder(null);setPage('checkout');
    }catch{if(generation.current===current)setError(L('报价暂不可用，请重试。','Quote unavailable. Please retry.'));}
    finally{if(generation.current===current)setBusy(false);}
  };
  const createOrder=async()=>{
    if(!quote||busy||!catalog?.checkoutReady||!catalog.channels[channel]||order)return;
    const current=++generation.current;
    const key=[quote.catalogVersion,quote.sku,quote.currency,quote.amountMinor,quote.creditsPerGrant,channel,channel==='crypto'?chain:''].join(':');
    const requestId=requestIds.current.get(key)??crypto.randomUUID();requestIds.current.set(key,requestId);
    setBusy(true);setError('');
    try{
      const r=await window.wuwei.billingRequest({action:'create-order',sku:quote.sku,currency:quote.currency,channel,chain:channel==='crypto'?chain:undefined,requestId,expected:{catalogVersion:quote.catalogVersion,amountMinor:quote.amountMinor,creditsPerGrant:quote.creditsPerGrant,startsAt:quote.startsAt}});
      if(generation.current!==current)return;
      if('error' in r){if(r.error==='not_logged_in')p.onNeedLogin();if(r.error==='QUOTE_CHANGED'){setQuote(null);setPage('plans');setCatalog(null);setRetry(x=>x+1);throw Error('quote_changed');}throw Error(r.error);}
      if(!('id' in r)||r.sku!==quote.sku||r.currency!==quote.currency||r.amountMinor!==quote.amountMinor||r.channel!==channel)throw Error('invalid_order');
      setOrder(r);
    }catch{if(generation.current===current)setError(L('暂时无法创建订单，请重试。','Unable to create an order. Please retry.'));}
    finally{if(generation.current===current)setBusy(false);}
  };
  const switchModel=async()=>{if(!fallback)return;setBusy(true);setError('');try{await p.onSwitch(fallback);p.onClose();}catch{setError(L('切换失败，请重试。','Unable to switch. Please retry.'));}finally{setBusy(false);}};
  const exportCSV=()=>{
    if(!ledger)return;
    const header=en?['Time','Type','Tool','Model','Parameters','Change','Balance after','Expires','Related record']:['时间','类型','工具','模型','参数','积分变动','变动后余额','到期时间','关联记录'];
    const lines=[header,...ledger.records.map(r=>[time(r.createdAt,p.lang),r.type,r.tool,r.model,JSON.stringify(r.parameters??{}),r.amount,r.balanceAfter,r.expiresAt?time(r.expiresAt,p.lang):'',r.relatedId])];
    const url=URL.createObjectURL(new Blob(['\ufeff'+lines.map(row=>row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='wuwei-credit-records.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const benefit=(x:BillingProduct)=><ul className="billing-benefits">
    <li><strong>{fmt(credits(x))} {L('积分','credits')}{x.kind==='plan'?L(' / 月',' / month'):''}</strong><small>{x.kind==='pack'?L('六个月有效，不延长会员期限','Valid for six months; does not extend membership'):L('按实际用量扣积分，当月有效','Usage-based deductions; expires each monthly period')}</small></li>
    {x.period==='annual'&&<li>{L('年付一次，每月发放，连续十二个月','One annual payment; twelve monthly grants')}<small>{L('首次发放一个月额度，其余按月到账','The first monthly grant arrives on activation')}</small></li>}
    {x.name==='Plus'&&<li>{L('每积分价格比 Pro 便宜 20%','20% lower price per credit than Pro')}</li>}
    {x.name==='Max'&&<li>{L('每积分价格比 Pro 便宜 20%','20% lower price per credit than Pro')}<small>{L('积分是 Plus 的两倍','Twice the credits of Plus')}</small></li>}
    <li>{L('按任务选择高性价比、顶级与生图模型','Choose value, premium and image models')}<small>{L('各模型用量价格不同，按页面报价扣除','Usage prices vary by model')}</small></li>
    <li>{L('写代码、整理文件、分析资料','Code, organize files and analyze information')}</li>
    <li>{L('积分变动与消费明细随时可查','Review your credit and usage records anytime')}</li>
    <li>{L('长期记忆与脑网络免费包含','Long-term memory and Brain included for free')}</li>
  </ul>;
  const modelList=<><div className="billing-catalog-head"><h2>{L('一份额度，按任务选择多家模型','One balance. The right model for each task.')}</h2><button onClick={()=>setRules(true)}>{L('查看说明 →','Details →')}</button></div><div className="billing-models">{models.map(m=><div key={m.key}><BillingBrand model={m.modelId} provider={m.providerId}/><span><b>{en?m.labelEn:m.label}</b><small className={m.recommended?'recommended':''}>{m.category==='economy'?L('高性价比','Value'):m.category==='images'?L('生成图片','Image generation'):L('顶级模型','Premium')}{m.recommended?L(' · 推荐',' · Recommended'):''}</small></span><i>✓</i></div>)}</div></>;
  const periodTabs=<div className="billing-tabs" role="tablist" aria-label={L('购买周期','Billing period')}>{(['monthly','annual','pack'] as const).map(x=><button role="tab" aria-selected={period===x} key={x} onClick={()=>setPeriod(x)}>{x==='monthly'?L('月付','Monthly'):x==='annual'?<>{L('年付','Yearly')} <em>−50%</em></>:L('积分包','Credit packs')}</button>)}</div>;
  const plans=<>
    <div className="billing-heading"><span>✧ {L('让 AI 替你干活','Let AI do the work')}</span><h1>{p.insufficient?L('补充积分，继续手头的任务','More credits for what comes next'):L('让 AI 干活，选一份刚好的套餐','Choose the right plan for your work')}</h1><p>{L('从日常问答到代码、资料和图片，按使用需要选择。','From everyday questions to code, research and images.')}</p></div>
    {p.insufficient&&<div className="billing-fallback"><div><b>{L('当前积分','Current credits')}: {fmt(p.balance)}</b><p>{p.imageMode?L('可补充积分继续生图，或确认切换到免费文字模型。','Add credits for images, or switch to a free text model.'):L('可以补充积分，也可以换个模型继续。','Add credits, or choose another model to continue.')}</p></div>{free&&<button onClick={()=>setFallback(free)}>{L('使用免费模型','Use a free model')}</button>}{!p.imageMode&&value&&<button onClick={()=>setFallback(value)}>{L('换高性价比模型','Choose a value model')}</button>}</div>}
    {periodTabs}
    {period==='pack'&&<p className="billing-pack-note">{catalog?.member?L('有效会员同价多得 50% 积分','Active members get 50% more credits at the same price'):L('有效会员购买积分包，可获 50% 加赠','Active members receive 50% bonus credits')}</p>}
    <div className={'billing-options '+(period==='pack'?'packs':'')}>{products.map(x=><button className={'billing-option '+(selected===x.sku?'selected':'')} key={x.sku} onClick={()=>{setSelected(x.sku);setQuote(null);}} aria-pressed={selected===x.sku}>
      {x.recommended&&<span className="billing-recommend">{L('推荐','Recommended')}</span>}<i>{selected===x.sku?'✓':''}</i>
      <div><b>{x.kind==='pack'?`${fmt(x.credits)} ${L('积分','credits')}`:x.name}</b><small>{fmt(credits(x))} {x.kind==='pack'?L('积分到账','credits delivered'):L('积分 / 月','credits / month')}</small></div>
      <div className="billing-option-price"><strong>{price(x.period==='annual'?(currency==='USD'?x.usdMinor:x.cnyMinor)/12:currency==='USD'?x.usdMinor:x.cnyMinor,currency)}</strong>{x.kind==='plan'&&<span>{L('/月','/mo')}</span>}<small>{x.period==='annual'?L(`年付合计 ${price(currency==='USD'?x.usdMinor:x.cnyMinor,currency)}`,`${price(currency==='USD'?x.usdMinor:x.cnyMinor,currency)} billed yearly`):L('本次购买，不自动续费','One-time payment')}</small></div>
    </button>)}</div>
    <button className="billing-primary" onClick={()=>void requestQuote()} disabled={!product||busy}>{busy?L('加载中…','Loading…'):L('选择','Choose')+' '+(product?.kind==='pack'?L('积分包','credit pack'):product?.name??'')+' →'}</button>
    <p className="billing-note">{L('按次购买 · 不自动续费','One-time purchase · No auto-renewal')}</p>
    <div className="billing-free"><b>{L('免费版 · ¥0','Free · $0')}</b><p>{L('免费模型自动挑选；注册赠送 10 积分，每日签到再领 10 积分。注册赠币领取后 24 小时到期。','Auto-pick free models. 10 sign-up credits and 10 per daily check-in. Sign-up credits expire 24h after receipt.')}</p>{free&&<button onClick={()=>setFallback(free)}>{L('先免费体验 →','Try free first →')}</button>}</div>
  </>;
  const typeName=(r:CreditRecord)=>({gift:L('发放','Grant'),earn:L('发放','Grant'),spend:L('消费','Usage'),expire:L('过期','Expired'),refund:L('退回','Refund'),adjust:L('调整','Adjustment')}[r.type]??r.type);
  return <div className="billing-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)p.onClose();}}><section ref={panel} onKeyDown={e=>e.stopPropagation()} className={'billing-panel '+(layout==='cards'?'billing-cards':'')} role="dialog" aria-modal="true" aria-labelledby="billing-title">
    <button className="billing-close" aria-label={L('关闭','Close')} onClick={p.onClose}>×</button>
    <div className="billing-top"><b id="billing-title">{page==='ledger'?L('积分明细','Credit details'):L('无为 · 套餐与支付','Wuwei · Plans and payment')}</b><div>{page!=='plans'&&<button onClick={()=>{setPage('plans');setError('');}}>{L('← 返回套餐','← Back to plans')}</button>}{page==='plans'&&<button onClick={()=>setLayout(layout==='split'?'cards':'split')}>{layout==='split'?L('卡片对比','Compare cards'):L('简洁布局','Compact layout')}</button>}<button onClick={()=>{setPage('ledger');setOffset(0);setError('');}}>{L('积分明细','Credit details')}</button></div></div>
    {error&&<div className="billing-error" role="alert">{error} <button onClick={()=>setRetry(x=>x+1)}>{L('重试','Retry')}</button></div>}
    {page==='plans'&&(layout==='split'?<div className="billing-split"><aside>{modelList}<hr/>{product&&<><h3>Wuwei {product.kind==='plan'?product.name:L('积分包','Credit pack')} · {L('所选权益','Selected benefits')}</h3>{benefit(product)}</>}</aside><main>{plans}</main></div>:<main className="billing-wide">{plans}<div className="billing-card-benefits">{products.map(x=><article key={x.sku}><h3>{x.kind==='pack'?`${fmt(x.credits)} ${L('积分','credits')}`:x.name}</h3>{benefit(x)}</article>)}</div></main>)}
    {page==='plans'&&<footer><span>{L('套餐积分当月有效；积分包六个月有效。','Plan credits expire each monthly period; packs last six months.')}</span><button onClick={()=>setCompare(!compare)}>{compare?L('收起对比','Hide comparison'):L('对比套餐','Compare plans')}</button></footer>}
    {page==='plans'&&compare&&<div className="billing-comparison"><table><thead><tr><th>{L('服务','Benefits')}</th><th>{L('免费','Free')}</th><th>Pro</th><th>Plus</th><th>Max</th></tr></thead><tbody><tr><td>{L('每月积分','Monthly credits')}</td><td>{L('签到领取','Daily check-in')}</td><td>2,000</td><td>5,000</td><td>10,000</td></tr><tr><td>{L('长期记忆 / 脑网络','Memory / Brain')}</td>{[0,1,2,3].map(x=><td key={x}>✓</td>)}</tr><tr><td>{L('积分包会员加赠','Member pack bonus')}</td><td>—</td><td>50%</td><td>50%</td><td>50%</td></tr></tbody></table></div>}
    {page==='checkout'&&quote&&<div className="billing-checkout"><aside><span>{L('订单摘要','Order summary')}</span><h1>{quote.kind==='plan'?`Wuwei ${quote.name}`:L('积分包','Credit pack')}</h1><strong className="billing-total">{price(quote.amountMinor,quote.currency)}</strong><dl><dt>{L('购买周期','Period')}</dt><dd>{quote.period==='annual'?L('一年','One year'):quote.period==='monthly'?L('一个月','One month'):L('一次性购买','One-time purchase')}</dd>{quote.startsAt&&Date.parse(quote.startsAt)>Date.now()+60000&&<><dt>{L('套餐生效时间','Plan activation')}</dt><dd>{time(quote.startsAt,p.lang)}</dd></>}<dt>{L('首次到账积分','Credits on activation')}</dt><dd>{fmt(quote.creditsPerGrant)}</dd><dt>{L('发放次数','Credit grants')}</dt><dd>{quote.grantCount===12?L('每月一次，共十二次','Once monthly, twelve grants'):L('一次','Once')}</dd><dt>{L('积分有效期','Credit validity')}</dt><dd>{quote.expiryMonths===6?L('六个月','Six months'):L('每月到期','Expires monthly')}</dd></dl>{quote.memberBonus&&<p>{L('已包含会员 50% 加赠','Includes your 50% member bonus')}</p>}<p className="billing-note">{L('本次购买，不自动续费','One-time purchase. No auto-renewal.')}</p>{quote.startsAt&&Date.parse(quote.startsAt)>Date.now()+60000&&<p className="billing-note">{L('现有套餐结束后生效，积分于生效时到账。现在需要补充积分可选择积分包。','Starts when your current plan ends; credits arrive on activation. For credits now, choose a credit pack.')}</p>}{product&&benefit(product)}</aside><main><h2>{L('确认订单，完成支付','Review your order and pay')}</h2><p>{L('请选择支付方式','Choose a payment method')}</p><div className="billing-pay-methods" hidden={!!order}>{(en?['paddle','crypto'] as const:['alipay'] as const).map(x=><button className={channel===x?'selected':''} key={x} onClick={()=>setChannel(x)}>{x==='paddle'?'PayPal · Paddle':x==='crypto'?L('加密货币','Cryptocurrency'):'支付宝 Alipay'}</button>)}</div>
      {!order&&channel==='crypto'&&<div className="billing-chain"><label>{L('转账网络','Network')} <select value={chain} onChange={e=>setChain(e.target.value as typeof chain)}><option value="solana">Solana</option><option value="bsc">BNB Smart Chain</option><option value="tron">TRON</option></select></label></div>}
      {order?<BillingOrderView key={order.id} order={order} lang={p.lang} onNeedLogin={p.onNeedLogin} onPaid={()=>p.onPaid?.()}/>:<>
      <div className="billing-payment-state"><b>{channel==='alipay'?L('支付宝扫码支付','Scan with Alipay'):channel==='paddle'?'PayPal via Paddle':L('加密货币支付','Cryptocurrency payment')}</b><p>{catalog?.checkoutReady?L('核对订单后，点击下方继续付款。','Review your order, then continue below.'):L('当前暂不可购买，请稍后重试。','This purchase is currently unavailable. Please try again later.')}</p><p className="billing-note">{channel==='crypto'?L('收款网络、地址和应付数量以创建订单后的报价为准。','The network, address and amount will be provided with your payment order.'):channel==='paddle'?L('通过 Paddle 安全收银台完成 PayPal 付款。','Complete your PayPal payment through Paddle’s secure checkout.'):L('付款二维码仅由真实订单生成。','Payment QR codes are generated from actual orders.')}</p></div>
      <button className="billing-primary" onClick={()=>void createOrder()} disabled={busy||!catalog?.checkoutReady||!catalog.channels[channel]}>{channel==='alipay'?L('生成付款二维码','Create payment QR'):L('继续付款','Continue to payment')}</button><button className="billing-link" onClick={()=>setPage('plans')}>{L('返回修改套餐','Change your selection')}</button></>}
    </main></div>}
    {page==='ledger'&&<main className="billing-ledger"><h1>{L('积分明细','Credit details')}</h1><p>{L('查看发放、消费、过期、退回及调整记录。时间按你的设备时区显示。','Review grants, usage, expirations, refunds and adjustments. Times use your device timezone.')}</p><div className="billing-ledger-balance"><span>{L('当前积分','Current credits')}</span><strong>{fmt(ledger?.balance??p.balance)}</strong></div><div className="billing-filters"><input aria-label={L('搜索记录','Search records')} placeholder={L('搜索工具、模型、说明','Search tool, model or description')} value={search} onChange={e=>{setOffset(0);setSearch(e.target.value);}}/><select aria-label={L('记录类型','Record type')} value={filter} onChange={e=>{setOffset(0);setFilter(e.target.value);}}>{[['',L('全部类型','All types')],['gift',L('赠送','Gifts')],['earn',L('入账','Earnings')],['spend',L('消费','Usage')],['expire',L('过期','Expirations')],['refund',L('退回','Refunds')],['adjust',L('调整','Adjustments')]].map(([v,n])=><option key={v} value={v}>{n}</option>)}</select><label className="billing-date">{L('从','From')}<input type="date" aria-label={L('开始日期','Start date')} value={fromDate} max={toDate||undefined} onChange={e=>{setOffset(0);setFromDate(e.target.value);}}/></label><label className="billing-date">{L('到','To')}<input type="date" aria-label={L('结束日期','End date')} value={toDate} min={fromDate||undefined} onChange={e=>{setOffset(0);setToDate(e.target.value);}}/></label><button onClick={exportCSV} disabled={!ledger?.records.length}>{L('导出本页 CSV','Export this page as CSV')}</button></div>
      {busy&&<p role="status">{L('正在加载…','Loading…')}</p>}{ledger&&!ledger.records.length&&<p className="billing-empty">{L('没有符合条件的记录','No matching records')}</p>}
      {ledger?.records.map(r=><article key={r.id} className="billing-credit-record"><button onClick={()=>setExpanded(expanded===r.id?null:r.id)}><div><span className="billing-type">{typeName(r)}</span><b>{r.description||r.source||typeName(r)}</b><small>{time(r.createdAt,p.lang)}</small>{(r.tool||r.model)&&<p>{[r.tool,r.model].filter(Boolean).join(' · ')}</p>}</div><div><strong className={r.amount>0?'credit':'debit'}>{r.amount>0?'+':''}{fmt(r.amount)}</strong><small>{L('余额','Balance')}: {r.balanceAfter==null?'—':fmt(r.balanceAfter)}</small></div></button>{expanded===r.id&&<dl className="billing-record-detail"><dt>{L('记录编号','Record ID')}</dt><dd>{r.id}</dd>{r.expiresAt&&<><dt>{L('到期时间','Expires')}</dt><dd>{time(r.expiresAt,p.lang)}</dd></>}{r.relatedId&&<><dt>{L('关联记录','Related record')}</dt><dd>{r.relatedId}</dd></>}{Object.entries(r.parameters??{}).map(([k,v])=><React.Fragment key={k}><dt>{k}</dt><dd>{String(v)}</dd></React.Fragment>)}</dl>}</article>)}
      <div className="billing-pagination"><button disabled={!offset||busy} onClick={()=>setOffset(Math.max(0,offset-50))}>{L('上一页','Previous')}</button><span>{Math.floor(offset/50)+1}</span><button disabled={!ledger?.hasMore||busy} onClick={()=>setOffset(offset+50)}>{L('下一页','Next')}</button></div>
    </main>}
    {rules&&<div className="billing-subdialog"><section role="dialog" aria-modal="true" aria-label={L('模型与积分使用说明','Model and credit usage guidelines')}><button className="billing-close" onClick={()=>setRules(false)} aria-label={L('关闭说明','Close guidelines')}>×</button><h2>{L('模型与积分使用说明','Model and credit usage guidelines')}</h2><h3>{L('按实际用量计费','Usage-based billing')}</h3><p>{L('套餐提供的是积分额度。不同模型、工具和参数消耗不同；一次任务可能多次调用模型，请以模型价格和消费明细为准。','Plans include credits. Usage varies by model, tool and settings. A task may make multiple model calls; refer to model prices and usage records.')}</p><h3>{L('发放与有效期','Grants and expiry')}</h3><p>{L('年付积分按月发放，当月有效；积分包六个月有效，单独记账。注册赠币领取后 24 小时有效。','Annual credits are granted monthly and expire each monthly period. Credit packs are tracked separately and last six months. Sign-up credits expire 24h after receipt.')}</p><h3>{L('免费模型','Free models')}</h3><p>{L('免费模型受每日额度和服务可用性限制。免费文字模型无法代替图片生成；切换前请确认任务类型。','Free models have daily allowances and availability limits. Free text models cannot replace image generation; confirm before switching.')}</p></section></div>}
    {fallback&&<div className="billing-subdialog"><section role="alertdialog" aria-label={L('确认切换模型','Confirm model switch')}><h2>{p.imageMode?L('切换为文字对话？','Switch to text chat?'):L('切换模型继续？','Switch models?')}</h2><p>{p.imageMode?L('免费文字模型不能生成图片。切换后会保留你的输入，不会自动发送。','Free text models cannot generate images. Your input is kept and will not be sent automatically.'):L('当前输入会保留，切换后由你重新发送。','Your input is kept. Send it again when you are ready.')}</p><b>{en?fallback.labelEn:fallback.label}</b><button className="billing-primary" disabled={busy} onClick={()=>void switchModel()}>{L('确认切换','Confirm switch')}</button><button className="billing-link" onClick={()=>setFallback(null)}>{L('取消','Cancel')}</button></section></div>}
  </section></div>;
}
