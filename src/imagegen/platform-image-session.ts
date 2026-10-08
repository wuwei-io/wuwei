import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {PlatformBillingClient,type Sku} from './platform-billing-client.js';
import type {ToolContext,ToolResult,Decision} from '../types.js';
import {imageModelLabel} from './image-catalog.js';
const tt=(zh:string,en:string)=>process.env.WUWEI_LANG==='en'?en:zh;
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
function imageDecision(zhTitle:string,enTitle:string,zhQuestion:string,enQuestion:string,options:{value:string;zh:string;en:string}[]):Decision {
 const i18n={zh:{title:zhTitle,question:zhQuestion,optionLabels:Object.fromEntries(options.map(o=>[o.value,o.zh]))},
  en:{title:enTitle,question:enQuestion,optionLabels:Object.fromEntries(options.map(o=>[o.value,o.en]))}};
 return {permId:randomUUID(),risk:'high',title:tt(zhTitle,enTitle),question:tt(zhQuestion,enQuestion),
  options:options.map(o=>({value:o.value,label:tt(o.zh,o.en),tone:o.value==='cancel_image'?'neutral':'safe'})),
  i18n,allowCustom:false,timeoutSec:null};
}

function emptyImageCatalog(): ToolResult {
 return {content:JSON.stringify({code:'IMAGE_CATALOG_EMPTY',message:tt('平台暂未提供可用的生图规格，当前无法生成图片。需要服务端启用生图服务及有效规格；更换图片描述无效，不要猜测 SKU 或反复查询目录。','Image generation is currently unavailable. The server must enable the service and image specifications. Do not guess SKUs or repeatedly query the catalog.')}),isError:true};
}


// Bound to the actual hosted provider credentials, never global settings or subscription/BYOK.
export function createPlatformImageSession(base: string,token: string,recoveryRoot=join(homedir(),process.env.WUWEI_DATA_DIR_NAME || '.wuwei','image-orders')) {
 const client=new PlatformBillingClient(base,()=>token,'platform',180000);
 return async(input:Record<string,unknown>,ctx:ToolContext):Promise<ToolResult>=>{
  try {
   ctx.signal?.throwIfAborted();
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
      return {content:JSON.stringify({...detail,displayed:false,code:'IMAGE_NOT_DELIVERED',message:tt('原订单尚未完成结算，图片未展示。不能声称生成成功；保留原订单，不重新生图。','The original order has not settled and no image was displayed. Do not claim success or generate again.'),reason:error instanceof Error?error.message:'Settlement pending'}),isError:true};
     }
    }
    if(detail.status!=='settled') return {content:JSON.stringify({...detail,displayed:false,code:'IMAGE_NOT_DELIVERED',message:tt('图片尚未交付，不能声称生成成功。只处理此原订单，不重新生图。','No image has been delivered. Do not claim success. Recover this original order only; never generate again.')}),isError:true};
    ctx.signal?.throwIfAborted();
    const bytes=await client.image(orderId);await mkdir(root,{recursive:true});
    const path=join(root,`image-${orderId}-${randomUUID()}.png`);await writeFile(path,bytes,{flag:'wx'});
    return {content:JSON.stringify({order_id:orderId,path,charged_coins:detail.charged_coins,displayed:true}),displayImage:`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`};
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
     if(!ctx.requestDecision || !Number.isSafeInteger(amount) || !amount || amount<1) throw new Error(tt('原订单缺少已验证费用，不能重新授权', 'The original order has no verified cost and cannot be reauthorized'));
     const decision=await ctx.requestDecision(imageDecision('原图实费重新授权','Authorize original image cost',
      `原图已生成，实费为 ${amount} 无为币。是否按此金额结算原订单？余额不足时保留原图。`,
      `The image is ready. Its verified cost is ${amount} coins. Authorize settlement of this original order? The image is kept if funds are insufficient.`,
      [{zh:`授权结算 ${amount} 无为币`,en:`Authorize ${amount} coins`,value:'reauthorize_image'},{zh:'取消',en:'Cancel',value:'cancel_image'}]));
     if(decision.value!=='reauthorize_image') return {content:tt('已取消重新授权，原图保留。','Authorization cancelled. The original image is kept.')};
     await client.reauthorize(input.order_id,amount);
    }
    if(input.action==='settle') {
     ctx.signal?.throwIfAborted();
     await client.settle(input.order_id);
    }
    return await deliver(input.order_id,root);
   }
   if(typeof input.prompt!=='string' || typeof input.sku_id!=='string' || !ctx.requestDecision) throw new Error(tt('生图需要确认预计费用；当前会话不支持确认。','Image generation requires fee confirmation. This session cannot show it.'));
   const catalog=await client.catalog();if(!Array.isArray(catalog)) throw new Error(tt('生图目录无效。','Invalid image catalog.'));
   if(catalog.length===0) return emptyImageCatalog();
   const sku=catalog.find((s:Sku)=>s.sku_id===input.sku_id) as Sku|undefined;
   if(!sku) return {content:JSON.stringify({code:'SKU_UNAVAILABLE',catalog}),isError:true};
   const variants:Sku[]=sku.model==='gpt-image-1' ? catalog.filter((row:Sku)=>row.model===sku.model && ['low','medium'].includes(row.quality))
    .sort((a:Sku,b:Sku)=>(a.quality==='low'?0:1)-(b.quality==='low'?0:1)) : [sku];
   const choices=await Promise.all(variants.map(async variant=>{
    const query={sku_id:variant.sku_id,price_version:variant.price_version,prompt:input.prompt as string,count:1 as const};
    return {sku:variant,query,quote:await client.quote(query),value:variant.sku_id===sku.sku_id?'generate_image':`generate_image:${variant.sku_id}`};
   }));
   const first=choices.find(choice=>choice.sku.sku_id===sku.sku_id)!;
   const multiple=choices.length>1;
   const decision=await ctx.requestDecision(imageDecision('生图费用确认','Image cost confirmation',
    multiple ? `${imageModelLabel(sku)}：选择画质后生成。预计预占和最高授权金额见选项，最终按实费结算。` : `预计预占 ${first.quote.estimated_coins} 币，最多授权 ${first.quote.authorization_ceiling} 无为币。最终按实费结算，超出授权时暂停结算并保留原图。`,
    multiple ? `${imageModelLabel(sku)}: choose the quality to generate. Estimated hold and authorization limit are shown below. Final billing uses actual cost.` : `Estimated hold: ${first.quote.estimated_coins} coins. Authorize up to ${first.quote.authorization_ceiling} coins. Final billing uses actual cost; settlement pauses and the image is kept if authorization is exceeded.`,
    [...choices.map(choice=>({value:choice.value,zh:multiple ? `${choice.sku.quality==='low'?'低画质':'中画质'}生成 · 预计 ${choice.quote.estimated_coins} / 最多 ${choice.quote.authorization_ceiling} 无为币` : '确认生成',
     en:multiple ? `${choice.sku.quality==='low'?'Low':'Medium'} quality · hold ${choice.quote.estimated_coins} / authorize up to ${choice.quote.authorization_ceiling} coins` : 'Generate image'})),{zh:'取消',en:'Cancel',value:'cancel_image'}]));
   const selected=choices.find(choice=>decision.action==='reply' && choice.value===decision.value);
   if(!selected) return {content:tt('已取消生图，未下单。','Image generation cancelled. No order was placed.')};
   ctx.signal?.throwIfAborted();
   const attempt=client.prepare({...selected.query,authorized_budget:selected.quote.authorization_ceiling},selected.sku,selected.quote);
   // Durable handle BEFORE POST. Never automatically recreate after timeout/process restart.
   await mkdir(recoveryRoot,{recursive:true,mode:0o700});
   const receipt=join(recoveryRoot,attempt.key+'.json');
   await writeFile(receipt,JSON.stringify({key:attempt.key,input:attempt.input,state:'sending'}),{flag:'wx',mode:0o600});
   try {
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
    return {content:JSON.stringify({code:'IMAGE_ORDER_ERROR',message:attempt.orderId || attempt.state==='unknown' ? tt('连接中断，暂未取回原图片。原订单已保留，请恢复原订单查看，避免重复生成。','The connection was interrupted and the original image could not be retrieved. The original order is saved; recover it instead of generating again.') : error instanceof Error ? error.message : tt('生图失败，未重新下单。','Image generation failed. No new order was submitted.'),recovery_key:attempt.key,recovery_file:receipt,order_id:attempt.orderId,reason:error instanceof Error?error.message:'Image unavailable'}),isError:true};
   }
  } catch(error) {return {content:JSON.stringify({code:'IMAGE_ORDER_ERROR',message:error instanceof Error?error.message:tt('生图失败，请查询原订单。','Image generation failed. Check the original order.')}),isError:true};}
 };
}
