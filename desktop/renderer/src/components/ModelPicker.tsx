import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MODEL_CATEGORIES, type ModelCategory, type ModelChoice } from '../../../../src/model-selection.js';
import { localizeModelBadge } from '../../../../src/model-badge.js';
import { recommendedValueModel, premiumUsageExample, premiumSelectionNeedsConfirmation } from '../../../../src/premium-model.js';
import './ModelPicker.css';

export function ModelPicker({choices,selectedKey,loggedIn,lang,loading,onChoose,onClose,onConnections,onRequireLogin,initialCategory}: {
  choices:ModelChoice[];selectedKey:string;loggedIn:boolean;lang:'zh'|'en';loading:boolean;
  onChoose:(choice:ModelChoice)=>Promise<void>;onClose:()=>void;onConnections:()=>void;onRequireLogin:()=>void;
  initialCategory?:ModelCategory;
}) {
  const en=lang==='en';
  const [category,setCategory]=useState<ModelCategory>(initialCategory ?? choices.find(c=>c.key===selectedKey)?.category ?? (loggedIn?'economy':'free'));
  const [query,setQuery]=useState('');
  const [confirm,setConfirm]=useState<ModelChoice|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const valueButton=useRef<HTMLButtonElement>(null);
  const valueChoice=recommendedValueModel(choices);
  const example=confirm?premiumUsageExample(confirm):undefined;
  useEffect(()=>{if(!loggedIn)setConfirm(null);},[loggedIn]);
  useEffect(()=>{
    if(!confirm)return;
    const current=choices.find(c=>c.key===confirm.key);
    if(!current || current.category!=='premium'){
      setConfirm(null);setError(en?'Model availability changed. Please choose again.':'模型可用状态已更新，请重新选择。');
    }else if(premiumSelectionNeedsConfirmation(current,confirm)){
      setConfirm(current);setError(en?'Model pricing changed. Review the updated price before confirming.':'模型价格已更新，请查看新价格后再确认。');
    }
  },[choices,confirm,en]);
  useEffect(()=>{if(confirm)valueButton.current?.focus();},[confirm?.key]);
  const root=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const fit=()=>{if(!root.current)return;root.current.style.transform='';const rect=root.current.getBoundingClientRect();const shift=rect.right>window.innerWidth-12?window.innerWidth-12-rect.right:rect.left<12?12-rect.left:0;root.current.style.transform=`translateX(${shift}px)`;};
    fit();window.addEventListener('resize',fit);return()=>window.removeEventListener('resize',fit);
  },[]);
  useEffect(()=>{const h=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}};window.addEventListener('keydown',h,true);return()=>window.removeEventListener('keydown',h,true);},[onClose]);
  const rows=useMemo(()=>choices.filter(c=>query.trim()?`${c.label} ${c.labelEn} ${c.modelId}`.toLowerCase().includes(query.trim().toLowerCase()):c.category===category),[choices,category,query]);
  const name=(c:ModelChoice)=>en?c.labelEn:c.label;
  const capability=(c:ModelChoice)=>c.category==='images'?(en?'Image generation':'生成图片'):c.imageInput===true?(en?'Image input':'支持图片'):c.imageInput===false?(en?'Text only':'仅文本'):c.category!=='connections'?(en?'Image support unconfirmed':'图片能力待确认'):'';
  const capabilityHint=(c:ModelChoice)=>c.category==='images'?(en?'Generates images from your description.':'根据描述生成图片。'):c.imageInput===true?(en?'Can read and understand uploaded images.':'支持上传图片并进行识别和理解。'):c.imageInput===false?(en?'Accepts text only; cannot read uploaded images.':'仅支持文本输入，不能识别上传的图片。'):(en?'Image input has not been confirmed for this connection.':'当前接入的图片输入能力尚未确认。');
  const badge=(c:ModelChoice)=>c.badge?localizeModelBadge(c.badge,lang).split(' · ').filter(tag=>!['图片','识图','支持图片','Image','Vision','Image input','文本','仅文本','Text','Text only'].includes(tag)&&!/(?:视频待接|Video pending|音频待接|Audio pending)/.test(tag)).join(' · '):'';
  const number=(n:number)=>n.toLocaleString(en?'en-US':'zh-CN',{maximumFractionDigits:2});
  const price=(c:ModelChoice)=>c.free?(en?'Free · daily limits apply':'免费 · 有每日额度'):c.imageCoins!=null?(en?`From ${number(c.imageCoins)} coins / image`:`${number(c.imageCoins)} 币 / 张起`):c.category==='connections'?`${c.connectionLabel || ''} · ${en?'Your subscription / API key':'自己的订阅 / API Key'}`:c.price?.input!=null&&c.price.output!=null?(en?`In ${number(c.price.input)} · Out ${number(c.price.output)} coins / 1M tokens`:`输入 ${number(c.price.input)} · 输出 ${number(c.price.output)} 币 / 百万 token`):(en?'Check pricing before use':'使用前查看价格');
  const choose=async(c:ModelChoice,closeAfter=true)=>{if(busy)return;if(!loggedIn&&c.needsLogin){onRequireLogin();return;}setBusy(true);setError('');try{await onChoose(c);if(closeAfter)onClose();}catch{setError(en?'Could not switch models. Try again.':'切换模型失败，请重试。');}finally{setBusy(false);}};
  const browseCategory=(next:ModelCategory)=>{
    if(busy)return;
    setCategory(next);setQuery('');setConfirm(null);setError('');
    // Entering the free tier explicitly selects Auto, while leaving the list
    // open for users who want to choose a particular free model instead.
    const auto=next==='free'?choices.find(c=>c.category==='free'&&c.free&&c.modelId==='openrouter-auto-free'&&(loggedIn||!c.needsLogin)):undefined;
    if(auto&&auto.key!==selectedKey)void choose(auto,false);
  };
  const chooseValue=()=>{if(valueChoice)void choose(valueChoice);else{setConfirm(null);setQuery('');setCategory('economy');}};
  return <div className={'model-picker'+(confirm?' has-premium-confirmation':'')} ref={root} role="dialog" aria-label={en?'Choose a model':'选择模型'}>
    <div className="model-picker-header"><strong>{en?'Choose a model':'选择模型'}</strong><button type="button" aria-label={en?'Close':'关闭'} onClick={onClose}>×</button></div>
    <input className="model-picker-search" autoFocus value={query} onChange={e=>{setQuery(e.target.value);setConfirm(null);}} placeholder={en?'Search models…':'搜索模型…'} aria-label={en?'Search models':'搜索模型'} />
    <div className="model-picker-columns">
      <nav aria-label={en?'Model categories':'模型分类'}>{MODEL_CATEGORIES.map(g=><button key={g.id} type="button" disabled={busy} aria-label={g.id==='economy'?(en?'Popular value models — recommended':'高性价比，推荐'):undefined} className={(category===g.id&&!query?'on ':'')+(g.id==='economy'?'model-picker-category-value':g.id==='connections'?'model-picker-connections':'')} onClick={()=>browseCategory(g.id)}>
        <span className={g.id==='economy'?'model-picker-popular':undefined}>{g.id==='economy'?(en?'Value models':'高性价比'):en?g.en:g.zh}</span>{g.id==='economy'&&<small className="model-picker-recommend model-picker-category-badge" aria-hidden="true">{en?'Rec':'推荐'}</small>}
      </button>)}</nav>
      <div className={'model-picker-list'+(confirm?' is-confirming':'')}>
        {confirm?<div className="model-picker-confirm">
          <div className="model-picker-confirm-content" tabIndex={0}>
          <div className="model-picker-premium-notice" role="note"><strong>{en?'Premium model · high cost, fast spending':'顶级模型 · 价格高，消耗快'}</strong><p>{en?'Use cautiously for complex tasks. Recommended value models suit most everyday work.':'复杂任务可选，请谨慎使用。大部分日常任务建议使用高性价比推荐模型。'}</p></div>
          <strong className="model-picker-confirm-name">{name(confirm)}</strong>
          <p className="model-picker-confirm-price">{price(confirm)}</p>
          {confirm.price?.cache!=null&&<p className="model-picker-price">{en?'Cached input':'缓存输入'} {number(confirm.price.cache)} {en?'coins / 1M tokens':'币 / 百万 token'}</p>}
          <ul className="model-picker-cost-drivers">
            <li>{en?'Long conversations, files and images increase input usage.':'长对话、文件和图片会增加输入消耗。'}</li>
            <li>{en?'Long replies and billable reasoning increase output usage.':'长回复及计费的深度思考会增加输出消耗。'}</li>
            <li>{en?'Agent tasks can call the model repeatedly and resend context after tools or retries.':'Agent 执行工具、续答或重试时可能多次调用模型，并重复携带上下文。'}</li>
          </ul>
          {example&&<div className="model-picker-cost-example">{en?`Example: 10k input + 2k output tokens costs about ${number(example.perCall)} coins per call; five similar calls cost about ${number(example.fiveCalls)} coins.`:`示例：每次输入 1 万、输出 2 千 token，单次约 ${number(example.perCall)} 币；连续 5 次约 ${number(example.fiveCalls)} 币。`}<small>{en?'Comparison only, before cache discounts or membership allowance. Actual costs follow usage.':'仅供比较，未计缓存优惠及会员额度抵扣，实际按用量结算。'}</small></div>}
          </div>
          <div className="model-picker-confirm-actions">
            <button ref={valueButton} type="button" className="model-picker-value-action" data-action="choose-value" disabled={busy} onClick={chooseValue}>{en?(valueChoice?'Switch to a recommended value model':'Browse value models'):(valueChoice?'改用高性价比推荐模型':'查看高性价比模型')}{valueChoice&&<small>{name(valueChoice)} · {price(valueChoice)}</small>}</button>
            <button type="button" data-action="confirm-premium" disabled={busy} onClick={()=>void choose(confirm)}>{en?'Confirm switch to this premium model':'确认切换顶级模型'}</button>
            <button type="button" className="model-picker-back-action" disabled={busy} onClick={()=>setConfirm(null)}>{en?'Back to models':'返回模型列表'}</button>
          </div>
        </div>:<>
          {!query&&category==='economy'&&<p className="model-picker-intro">{en?'Recommended for everyday agent tasks.':'日常 Agent 干活，优先用这些模型。'}</p>}
          {!query&&category==='premium'&&<div className="model-picker-premium-notice" role="note"><strong>{en?'Premium models · high cost, fast spending':'顶级模型价格高、消耗快，请谨慎选择'}</strong><p>{en?'Choose for complex tasks. For everyday work, use recommended value models.':'复杂任务可选；日常任务建议用高性价比推荐模型，让无为币更耐用。'}</p></div>}
          {loading&&!rows.length?<p className="model-picker-intro">{en?'Loading models…':'正在加载模型…'}</p>:!rows.length?<p className="model-picker-intro">{en?'No available models':'暂无可用模型'}</p>:rows.map(c=>{const locked=!loggedIn&&c.needsLogin;return <button key={c.key} type="button" disabled={busy} title={locked?(en?'Sign in to use — click to sign in':'登录后可用，点击登录'):undefined} className={'model-picker-model'+(locked?' model-picker-locked':c.key===selectedKey?' on':'')} data-model-key={c.key} onClick={()=>{if(locked){onRequireLogin();return;}if(c.category==='premium')setConfirm(c);else void choose(c);}}>
            <span className="model-picker-model-heading"><span>{name(c)}</span>{capability(c)&&<small className="model-picker-capability" title={capabilityHint(c)}>{capability(c)}</small>}{c.recommended&&<small className="model-picker-recommend">{en?'Recommended':'推荐'}</small>}{!locked&&c.key===selectedKey&&<span className="model-picker-check">✓</span>}</span>
            <span className="model-picker-price">{price(c)}</span>
            <span className="model-picker-tags">{locked?(en?'Sign in to use':'登录后可用'):c.free&&!c.needsLogin?(en?'No login needed':'无需登录'):badge(c)&&badge(c).split(' · ').map((tag,index)=><React.Fragment key={index}>{index>0&&' · '}<span className={/^(热门|推荐|Popular|Recommended)$/i.test(tag)?'model-picker-highlight-tag':undefined}>{tag}</span></React.Fragment>)}</span>
          </button>;})}
        </>}{error&&<p role="alert" className="model-picker-error">{error}</p>}
      </div>
    </div>
    <footer><span>{en?'Prices compare token usage; task costs vary.':'价格用于比较 token 单价，任务实际费用随用量变化。'}</span><button type="button" onClick={onConnections}>{en?'Manage connections':'管理接入'}</button></footer>
  </div>;
}
