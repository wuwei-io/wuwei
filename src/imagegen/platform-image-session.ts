import { tr, getCurrentLanguage, getLanguages, type MessageReference } from "../localization/index.js";
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {BillingError,PlatformBillingClient,type Sku} from './platform-billing-client.js';
import type {ToolContext,ToolResult,Decision} from '../types.js';
import {recordMediaTransfer} from '../media/activity-telemetry.js';
import {beginImageTransfer} from './image-transfer-progress.js';
import {imageModelLabel} from './image-catalog.js';
import {hostedCredentialProvider} from '../hosted-session-credentials.js';
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const billingDetails=(error:unknown)=>error instanceof BillingError ? {billing_code:error.code,billing_status:error.status} : {};
function imageDecision(titleKey:string, question:MessageReference, options:{value:string;label:MessageReference}[]):Decision {
 const text=(language:string)=>({title:tr(titleKey,{},language),question:tr(question.key,question.values,language),
  optionLabels:Object.fromEntries(options.map(o=>[o.value,tr(o.label.key,o.label.values,language)]))});
 const i18n=Object.fromEntries(getLanguages().map(locale=>[locale.code,text(locale.code)]));
 const current=text(getCurrentLanguage());
 return {permId:randomUUID(),risk:'high',title:current.title,question:current.question,
  options:options.map(o=>({value:o.value,label:current.optionLabels[o.value],tone:o.value==='cancel_image'?'neutral':'safe'})),
  i18n,allowCustom:false,timeoutSec:null};
}

function emptyImageCatalog(): ToolResult {
 return {content:JSON.stringify({code:'IMAGE_CATALOG_EMPTY',message:tr("ui.platform.image.session.image.generation.is.currently.unavailable.the.dbb38ca")}),isError:true};
}


// Bound to the actual hosted provider credentials, never global settings or subscription/BYOK.
export function createPlatformImageSession(base: string,token: string,recoveryRoot=join(homedir(),process.env.WUWEI_DATA_DIR_NAME || '.wuwei','image-orders')) {
 const client=new PlatformBillingClient(base,hostedCredentialProvider(token),'platform',180000);
 return async(input:Record<string,unknown>,ctx:ToolContext):Promise<ToolResult>=>{
  try {
   ctx.signal?.throwIfAborted();
   let metadata:Record<string,unknown>={};
   let startedAt:number|undefined;
   const deliver=async(orderId:string,root:string,wait=false):Promise<ToolResult>=>{
    let detail=await client.order(orderId);
    const deadline=Date.now()+150000;
    while (wait && ['reserved','dispatching'].includes(detail.status) && Date.now()<deadline) {
     ctx.signal?.throwIfAborted();await delay(3000);ctx.signal?.throwIfAborted();
     detail=await client.order(orderId);
    }
    // Settlement only uses this order's already approved budget. The server
    // rejects any excess; a new authorization still requires the human dialog.
    if(detail.status==='unknown') {
     ctx.signal?.throwIfAborted();
     try {await client.settle(orderId);detail=await client.order(orderId);} catch(error) {
      return {content:JSON.stringify({...detail,...billingDetails(error),displayed:false,code:'IMAGE_NOT_DELIVERED',message:tr(detail.actual_coins==null && detail.error_code==='PROVIDER_OUTCOME_UNKNOWN'?'image.delivery.outcomeUnknown':"ui.platform.image.session.the.original.order.has.not.settled.33cd62d"),reason:error instanceof Error?error.message:'Settlement pending'}),isError:true};
     }
    }
    if(detail.status==='failed' && detail.error_code==='PROVIDER_REQUEST_REJECTED') return {content:JSON.stringify({...detail,displayed:false,code:'IMAGE_REQUEST_REJECTED',message:tr('image.delivery.requestRejected')}),isError:true};
    if(detail.status==='failed' && detail.error_code==='PROVIDER_MODEL_UNAVAILABLE') return {content:JSON.stringify({...detail,displayed:false,code:'IMAGE_MODEL_UNAVAILABLE',message:tr('image.delivery.modelUnavailable')}),isError:true};
    if(detail.status!=='settled') return {content:JSON.stringify({...detail,displayed:false,code:'IMAGE_NOT_DELIVERED',message:tr("ui.platform.image.session.no.image.has.been.delivered.do.001b454")}),isError:true};
    ctx.signal?.throwIfAborted();
    const transfer=beginImageTransfer(token,ctx.sessionId,ctx.toolCallId,orderId);let bytes:Uint8Array;
    const downloadStarted=Date.now();
    try{bytes=await client.image(orderId,transfer.update,ctx.signal);recordMediaTransfer(token,{kind:"image",order_id:orderId,duration_ms:Date.now()-downloadStarted,bytes:bytes.length,status:"success"})}catch(error){recordMediaTransfer(token,{kind:"image",order_id:orderId,duration_ms:Date.now()-downloadStarted,bytes:null,status:"failed",error_code:error instanceof BillingError?error.code:"IMAGE_DOWNLOAD_FAILED"});throw error}finally{transfer.finish()}
    await mkdir(root,{recursive:true});
    const path=join(root,`image-${orderId}-${randomUUID()}.png`);await writeFile(path,bytes,{flag:'wx'});
    return {content:JSON.stringify({...metadata,order_id:orderId,path,charged_coins:detail.charged_coins,displayed:true,...(Number.isFinite(Date.parse(detail.created_at||''))?{created_at_ms:Date.parse(detail.created_at!)}:startedAt?{created_at_ms:startedAt}:{}),...(typeof detail.duration_ms==='number'&&Number.isFinite(detail.duration_ms)&&detail.duration_ms>=0?{elapsed_ms:detail.duration_ms}:startedAt?{elapsed_ms:Date.now()-startedAt}:{})}),displayImage:`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`};
   };
   if(input.action==='catalog') {
    const catalog=await client.catalog();
    return Array.isArray(catalog) && catalog.length===0 ? emptyImageCatalog() : {content:JSON.stringify(catalog)};
   }
   const root=resolve(ctx.cwd,'.wuwei','output');
   if(typeof input.recovery_key==='string') {
    const recovered=await client.lookup(input.recovery_key);
    return await deliver(recovered.order_id,root);
   }
   if(typeof input.order_id==='string') {
    if(input.action==='reauthorize') {
     const original=await client.order(input.order_id),amount=original.actual_coins;
     if(!ctx.requestDecision || !Number.isSafeInteger(amount) || !amount || amount<1) throw new Error(tr("ui.platform.image.session.the.original.order.has.no.verified.4e8353d"));
     const decision=await ctx.requestDecision(imageDecision('image.authorization.originalTitle',
      {key:'image.authorization.originalQuestion',values:{amount}},
      [{label:{key:'image.authorization.authorize',values:{amount}},value:'reauthorize_image'},{label:{key:'image.authorization.cancel'},value:'cancel_image'}]));
     if(decision.value!=='reauthorize_image') return {content:tr("ui.platform.image.session.authorization.cancelled.the.original.image.is.679bb87")};
     await client.reauthorize(input.order_id,amount);
    }
    if(input.action==='settle') {
     ctx.signal?.throwIfAborted();
     await client.settle(input.order_id);
    }
    return await deliver(input.order_id,root);
   }
   const authorization=ctx.imageStudioAuthorization;
   const staleQuote=()=>new BillingError('PRICE_CHANGED',tr('studio.quoteChanged'));
   if(typeof input.prompt!=='string' || typeof input.sku_id!=='string' || (!ctx.requestDecision&&!authorization)) throw new Error(tr("ui.platform.image.session.image.generation.requires.fee.confirmation.this.c3cd881"));
   if(authorization&&(!authorization.isCurrent()||authorization.prompt!==input.prompt||authorization.quote.sku_id!==input.sku_id))throw staleQuote();
   const catalog=await client.catalog();if(!Array.isArray(catalog)) throw new Error(tr("ui.platform.image.session.invalid.image.catalog.e012816"));
   if(catalog.length===0) return emptyImageCatalog();
   const sku=catalog.find((s:Sku)=>s.sku_id===input.sku_id) as Sku|undefined;
   if(!sku) return {content:JSON.stringify({code:'SKU_UNAVAILABLE',catalog}),isError:true};
   const variants:Sku[]=!authorization&&sku.model==='gpt-image-1' ? catalog.filter((row:Sku)=>row.model===sku.model && ['low','medium'].includes(row.quality))
    .sort((a:Sku,b:Sku)=>(a.quality==='low'?0:1)-(b.quality==='low'?0:1)) : [sku];
   const choices=await Promise.all(variants.map(async variant=>{
    const query={sku_id:variant.sku_id,price_version:variant.price_version,prompt:input.prompt as string,count:1 as const};
    return {sku:variant,query,quote:await client.quote(query),value:variant.sku_id===sku.sku_id?'generate_image':`generate_image:${variant.sku_id}`};
   }));
   const first=choices.find(choice=>choice.sku.sku_id===sku.sku_id)!;
   let selected=first;
   if(authorization){
    if(!authorization.isCurrent()||first.quote.price_version!==authorization.quote.price_version||first.quote.estimated_coins!==authorization.quote.estimated_coins||first.quote.authorization_ceiling!==authorization.quote.authorization_ceiling)throw staleQuote();
   }else{
   const multiple=choices.length>1;
   const decision=await ctx.requestDecision!(imageDecision('image.authorization.title',
    multiple ? {key:'image.authorization.chooseQuality',values:{model:imageModelLabel(sku)}} : {key:'image.authorization.estimate',values:{hold:first.quote.estimated_coins,ceiling:first.quote.authorization_ceiling}},
    [...choices.map(choice=>({value:choice.value,label:multiple ? {key:choice.sku.quality==='low'?'image.authorization.low':'image.authorization.medium',values:{hold:choice.quote.estimated_coins,ceiling:choice.quote.authorization_ceiling}} : {key:'image.authorization.generate'}})),{label:{key:'image.authorization.cancel'},value:'cancel_image'}]));
   const picked=choices.find(choice=>decision.action==='reply' && choice.value===decision.value);
   if(!picked) return {content:tr("ui.platform.image.session.image.generation.cancelled.no.order.was.dbd18e6")};
   selected=picked;
   }
   ctx.signal?.throwIfAborted();
   if(authorization&&!authorization.isCurrent())throw staleQuote();
   metadata={sku_id:selected.sku.sku_id,price_version:selected.sku.price_version,model:selected.sku.model,size:selected.sku.size,quality:selected.sku.quality,aspect_ratio:selected.sku.aspect_ratio,resolution:selected.sku.resolution};
   const attempt=client.prepare({...selected.query,authorized_budget:selected.quote.authorization_ceiling},selected.sku,selected.quote);
   // Durable handle BEFORE POST. Never automatically recreate after timeout/process restart.
   await mkdir(recoveryRoot,{recursive:true,mode:0o700});
   const receipt=join(recoveryRoot,attempt.key+'.json');
   await writeFile(receipt,JSON.stringify({key:attempt.key,input:attempt.input,state:'sending'}),{flag:'wx',mode:0o600});
   try {
    startedAt=Date.now();
    const order=await client.create(attempt);
    await writeFile(receipt,JSON.stringify({key:attempt.key,input:attempt.input,state:attempt.state,order_id:order.order_id}),{mode:0o600});
    return await deliver(order.order_id,root,true);
   } catch(error) {
    // Recover an interrupted POST/asset download by its original handle only.
    // Never resend a paid POST, change SKU or approve a new budget here.
    if(attempt.orderId || attempt.state==='unknown' || attempt.state==='submitted') {
     try {
      ctx.signal?.throwIfAborted();
      const original=attempt.orderId ? {order_id:attempt.orderId} : await client.lookup(attempt.key);
      attempt.orderId=original.order_id;
      await writeFile(receipt,JSON.stringify({key:attempt.key,input:attempt.input,state:attempt.state,order_id:attempt.orderId}),{mode:0o600});
      return await deliver(original.order_id,root,true);
     } catch { /* Keep the durable receipt if recovery is still unavailable. */ }
    }
    await writeFile(receipt,JSON.stringify({key:attempt.key,input:attempt.input,state:attempt.state,order_id:attempt.orderId}),{mode:0o600});
    return {content:JSON.stringify({...billingDetails(error),code:'IMAGE_ORDER_ERROR',message:attempt.orderId || attempt.state==='unknown' ? tr("ui.platform.image.session.the.connection.was.interrupted.and.the.b7a82d9") : error instanceof Error ? error.message : tr("ui.platform.image.session.image.generation.failed.no.new.order.839c9e6"),recovery_key:attempt.key,recovery_file:receipt,order_id:attempt.orderId,reason:error instanceof Error?error.message:'Image unavailable'}),isError:true};
   }
  } catch(error) {return {content:JSON.stringify({...billingDetails(error),code:'IMAGE_ORDER_ERROR',message:error instanceof Error?error.message:tr("ui.platform.image.session.image.generation.failed.check.the.original.41152ff")}),isError:true};}
 };
}
