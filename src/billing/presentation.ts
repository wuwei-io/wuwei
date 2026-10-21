import { getCurrentLanguage, tr, localizeStoredText } from '../localization/index.js';
import aliases from '../localization/content/billing-records.json';
import type { CreditRecord } from './contracts.js';
import type { ModelChoice } from '../model-selection.js';

/** Display precision only. Never use this value to calculate charges or write a ledger. */
export function formatCredits(value:number, language=getCurrentLanguage()) {
  return new Intl.NumberFormat(language,{maximumFractionDigits:3}).format(Math.abs(value)<0.0005?0:value);
}
export function formatLedgerTime(value:string,language=getCurrentLanguage()) {
  const date=new Date(value);
  return Number.isFinite(date.getTime())?new Intl.DateTimeFormat(language,{calendar:'gregory',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'short'}).format(date):'—';
}
export function billingCheckoutUrl(value:string|undefined):string|null {
  try{const url=new URL(value??'');return url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&['wuweiai.io','checkout.paddle.com','sandbox-checkout.paddle.com','pay.paddle.io'].includes(url.hostname)?url.href:null;}catch{return null;}
}
export function ledgerDescription(record:CreditRecord,language=getCurrentLanguage()) {
  const text=record.description;
  for(const row of aliases) {
    if(row.prefix?text.startsWith(row.text):text===row.text) {
      return tr(row.key,{model:record.model||text.slice(row.text.length).trim()},language);
    }
  }
  return localizeStoredText(text||record.source,language);
}
export function pageNumbers(current:number,total:number):(number|'…')[] {
  const wanted=new Set([1,total,current-2,current-1,current,current+1,current+2]);
  if(current<=4)for(let i=1;i<=Math.min(5,total);i++)wanted.add(i);
  const sorted=[...wanted].filter(n=>n>=1&&n<=total).sort((a,b)=>a-b);
  const result:(number|'…')[]=[];
  for(const n of sorted){const previous=result.at(-1);if(typeof previous==='number'&&n-previous>1)result.push('…');result.push(n);}
  return result;
}
function vendor(model:ModelChoice) {
  const id=model.modelId.toLowerCase();
  for(const [pattern,name] of [[/claude/,'anthropic'],[/gpt|o[134](?:-|$)|chatgpt/,'openai'],[/gemini/,'google'],[/deepseek/,'deepseek'],[/kimi|moonshot/,'moonshot'],[/glm/,'zhipu'],[/mimo/,'xiaomi'],[/qwen/,'alibaba'],[/grok/,'xai'],[/minimax/,'minimax'],[/doubao/,'bytedance'],[/nemotron/,'nvidia'],[/step/,'stepfun'],[/mistral/,'mistral'],[/llama/,'meta'],[/cohere|north.*code/,'cohere']] as const)if(pattern.test(id))return name;
  return model.providerId;
}
export function modelVendorName(model:ModelChoice) {
  const names:Record<string,string>={anthropic:'Claude',openai:'GPT',google:'Gemini',deepseek:'DeepSeek',moonshot:'Kimi',zhipu:'GLM',xiaomi:'MiMo',alibaba:'Qwen',xai:'Grok',minimax:'MiniMax'};
  return names[vendor(model)]??model.labelEn??model.modelId;
}
/** One best available representative per vendor; never invent unavailable models. */
export function showcaseModels(choices:ModelChoice[],limit=10) {
  const ranked=choices.filter(m=>!m.free&&m.category!=='connections').sort((a,b)=>{
    const flagship=(m:ModelChoice)=>/opus|pro|max|ultra|flagship/i.test(m.modelId)?1:0;
    return flagship(b)-flagship(a)||Number(b.recommended)-Number(a.recommended)||a.rank-b.rank;
  });
  const seen=new Set<string>();
  return ranked.filter(m=>{const key=vendor(m);if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>Number(b.recommended)-Number(a.recommended)||a.rank-b.rank).slice(0,limit);
}

/** Full hosted catalog. Auto-routing is a strategy, not another model. */
export function billingModelCatalog(choices:ModelChoice[]) {
  const seen=new Set<string>();
  const available=choices.filter(m=>m.category!=='connections'&&!m.hiddenInPicker&&!/auto[-_]?free/i.test(m.modelId)).filter(m=>{
    const key=(m.category==='images'?'image:':'chat:')+(m.category==='images'?m.imageModel??m.modelId:m.modelId).toLowerCase();
    if(seen.has(key))return false;seen.add(key);return true;
  });
  const first=showcaseModels(available.filter(m=>m.category!=='images'),50);
  const priority=['xiaomi','zhipu','deepseek','moonshot','openai','anthropic','google','xai','alibaba','minimax','bytedance','nvidia','stepfun','mistral','meta'];
  const order=(m:ModelChoice)=>{const i=priority.indexOf(vendor(m));return i<0?99:i;};
  first.sort((a,b)=>order(a)-order(b));
  const images=available.filter(m=>m.category==='images'),featured=new Set([...first,...images].map(m=>m.key));
  return [...first,...images,...available.filter(m=>!featured.has(m.key)).sort((a,b)=>Number(a.free)-Number(b.free)||a.rank-b.rank)];
}
