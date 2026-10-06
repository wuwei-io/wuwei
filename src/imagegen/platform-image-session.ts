import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {PlatformBillingClient,type Sku} from './platform-billing-client.js';
import type {ToolContext,ToolResult} from '../types.js';
const tt=(zh:string,en:string)=>process.env.WUWEI_LANG==='en'?en:zh;

function emptyImageCatalog(): ToolResult {
 return {content:JSON.stringify({code:'IMAGE_CATALOG_EMPTY',message:tt('平台暂未提供可用的生图规格，当前无法生成图片。需要服务端启用生图服务及有效规格；更换图片描述无效，不要猜测 SKU 或反复查询目录。','Image generation is currently unavailable. The server must enable the service and image specifications. Do not guess SKUs or repeatedly query the catalog.')}),isError:true};
}

// Bound to the actual hosted provider credentials, never global settings or subscription/BYOK.
export function createPlatformImageSession(base: string,token: string,recoveryRoot=join(homedir(),process.env.WUWEI_DATA_DIR_NAME || '.wuwei','image-orders')) {
 const client=new PlatformBillingClient(base,()=>token,'platform',180000);
 return async(input:Record<string,unknown>,ctx:ToolContext):Promise<ToolResult>=>{
  try {
   ctx.signal?.throwIfAborted();
   const deliver=async(orderId:string,root:string):Promise<ToolResult>=>{
    let detail=await client.order(orderId);
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
     if(!ctx.requestDecision || !Number.isSafeInteger(amount) || !amount || amount<1) throw new Error('原订单缺少已验证费用，不能重新授权');
     const decision=await ctx.requestDecision({permId:randomUUID(),risk:'high',title:tt('原图实费重新授权','Authorize original image cost'),question:tt(`原图已生成，完整官方实费为 ${amount} 币。是否授权按此金额结算原订单？不重新生图，余额不足则保留原图。`,`The image is ready. Its verified cost is ${amount} coins. Authorize settlement of this original order? The image is kept if your balance is insufficient.`),options:[{label:tt(`授权结算 ${amount} 币`,`Authorize ${amount} coins`),value:'reauthorize_image',tone:'safe'},{label:tt('取消','Cancel'),value:'cancel_image',tone:'neutral'}],allowCustom:false,timeoutSec:null});
     if(decision.value!=='reauthorize_image') return {content:'已取消重新授权，原图保留。'};
     await client.reauthorize(input.order_id,amount);
    }
    if(input.action==='settle') {
     ctx.signal?.throwIfAborted();
     await client.settle(input.order_id);
    }
    return await deliver(input.order_id,root);
   }
   if(typeof input.prompt!=='string' || typeof input.sku_id!=='string' || !ctx.requestDecision) throw new Error('生图需要用户确认预计费用；当前会话不支持确认');
   const catalog=await client.catalog();if(!Array.isArray(catalog)) throw new Error('图片目录无效');
   if(catalog.length===0) return emptyImageCatalog();
   const sku=catalog.find((s:Sku)=>s.sku_id===input.sku_id) as Sku|undefined;
   if(!sku) return {content:JSON.stringify({code:'SKU_UNAVAILABLE',catalog}),isError:true};
   const query={sku_id:sku.sku_id,price_version:sku.price_version,prompt:input.prompt,count:1 as const};
   const quote=await client.quote(query);
   const decision=await ctx.requestDecision({permId:randomUUID(),risk:'high',title:tt('生图费用确认','Image cost confirmation'),question:tt(`预计预占 ${quote.estimated_coins} 币。最终按官方实费结算，最多授权 ${quote.authorization_ceiling} 币；不足时暂停原图结算，不重新生图。是否继续？`,`Estimated hold: ${quote.estimated_coins} coins. Final billing uses the official cost, up to ${quote.authorization_ceiling} authorized coins. Settlement pauses if funds are insufficient; the image is kept. Continue?`),options:[{label:tt('确认生成','Generate image'),value:'generate_image',tone:'safe'},{label:tt('取消','Cancel'),value:'cancel_image',tone:'neutral'}],allowCustom:false,timeoutSec:null});
   if(decision.value!=='generate_image') return {content:tt('已取消生图，未下单。','Image generation cancelled. No order was placed.')};
   ctx.signal?.throwIfAborted();
   const attempt=client.prepare({...query,authorized_budget:quote.authorization_ceiling},sku,quote);
   // Durable handle BEFORE POST. Never automatically recreate after timeout/process restart.
   await mkdir(recoveryRoot,{recursive:true,mode:0o700});
   const receipt=join(recoveryRoot,attempt.key+'.json');
   await writeFile(receipt,JSON.stringify({key:attempt.key,input:attempt.input,state:'sending'}),{flag:'wx',mode:0o600});
   try {
    const order=await client.create(attempt);
    await writeFile(receipt,JSON.stringify({key:attempt.key,input:attempt.input,state:attempt.state,order_id:order.order_id}),{mode:0o600});
    return await deliver(order.order_id,root);
   } catch(error) {await writeFile(receipt,JSON.stringify({key:attempt.key,input:attempt.input,state:attempt.state,order_id:attempt.orderId}),{mode:0o600});return {content:JSON.stringify({code:'IMAGE_ORDER_ERROR',message:error instanceof Error?error.message:'生图结果不明，不重新下单',recovery_key:attempt.key,recovery_file:receipt,order_id:attempt.orderId}),isError:true};}
  } catch(error) {return {content:JSON.stringify({code:'IMAGE_ORDER_ERROR',message:error instanceof Error?error.message:'生图失败，不自动重试'}),isError:true};}
 };
}
