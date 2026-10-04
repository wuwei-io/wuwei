import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {PlatformBillingClient,type Sku} from './platform-billing-client.js';
import type {ToolContext,ToolResult} from '../types.js';

// Bound to the actual hosted provider credentials, never global settings or subscription/BYOK.
export function createPlatformImageSession(base: string,token: string,recoveryRoot=join(homedir(),'.wuwei','image-orders')) {
 const client=new PlatformBillingClient(base,()=>token,'platform',180000);
 return async(input:Record<string,unknown>,ctx:ToolContext):Promise<ToolResult>=>{
  try {
   if(input.action==='catalog') return {content:JSON.stringify(await client.catalog())};
   const root=resolve(ctx.cwd,'.wuwei','output');
   if(typeof input.recovery_key==='string') {
    const recovered=await client.lookup(input.recovery_key);
    return {content:JSON.stringify({...recovered,message:'已找回原订单；用 order_id 查询或确认结算，不重新生图'})};
   }
   if(typeof input.order_id==='string') {
    if(input.action==='reauthorize') {
     const original=await client.order(input.order_id),amount=original.actual_coins;
     if(!ctx.requestDecision || !Number.isSafeInteger(amount) || !amount || amount<1) throw new Error('原订单缺少已验证费用，不能重新授权');
     const decision=await ctx.requestDecision({permId:randomUUID(),risk:'high',title:'原图实费重新授权',question:`原图已生成，完整官方实费为 ${amount} 币。是否授权按此金额结算原订单？不重新生图，余额不足则保留原图。`,options:[{label:`授权结算 ${amount} 币`,value:'reauthorize_image',tone:'safe'},{label:'取消',value:'cancel_image',tone:'neutral'}],allowCustom:false,timeoutSec:null});
     if(decision.value!=='reauthorize_image') return {content:'已取消重新授权，原图保留。'};
     await client.reauthorize(input.order_id,amount);
    }
    if(input.action==='settle') {
     if(!ctx.requestDecision) throw new Error('恢复结算需要用户确认');
     const decision=await ctx.requestDecision({permId:randomUUID(),risk:'high',title:'原图结算确认',question:'只结算原订单，按已确认授权补扣所需额度或无为币，不重新生图。是否继续？',options:[{label:'确认原图结算',value:'settle_image',tone:'safe'},{label:'取消',value:'cancel_image',tone:'neutral'}],allowCustom:false,timeoutSec:null});
     if(decision.value!=='settle_image') return {content:'已取消结算，原图保留。'};
     await client.settle(input.order_id);
    }
    const detail=await client.order(input.order_id);
    if(detail.status!=='settled') return {content:JSON.stringify(detail)};
    const bytes=await client.image(input.order_id);await mkdir(root,{recursive:true});
    const path=join(root,`image-${input.order_id}-${randomUUID()}.png`);await writeFile(path,bytes,{flag:'wx'});
    return {content:JSON.stringify({order_id:input.order_id,path,charged_coins:detail.charged_coins,displayed:true}),displayImage:`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`};
   }
   if(typeof input.prompt!=='string' || typeof input.sku_id!=='string' || !ctx.requestDecision) throw new Error('生图需要用户确认预计费用；当前会话不支持确认');
   const catalog=await client.catalog();if(!Array.isArray(catalog)) throw new Error('图片目录无效');
   const sku=catalog.find((s:Sku)=>s.sku_id===input.sku_id) as Sku|undefined;
   if(!sku) return {content:JSON.stringify({code:'SKU_UNAVAILABLE',catalog}),isError:true};
   const query={sku_id:sku.sku_id,price_version:sku.price_version,prompt:input.prompt,count:1 as const};
   const quote=await client.quote(query);
   const decision=await ctx.requestDecision({permId:randomUUID(),risk:'high',title:'生图费用确认',question:`预计预占 ${quote.estimated_coins} 币。最终按官方实费结算，最多授权 ${quote.authorization_ceiling} 币；不足时暂停原图结算，不重新生图。是否继续？`,options:[{label:'确认生成',value:'generate_image',tone:'safe'},{label:'取消',value:'cancel_image',tone:'neutral'}],allowCustom:false,timeoutSec:null});
   if(decision.value!=='generate_image') return {content:'已取消生图，未下单。'};
   const attempt=client.prepare({...query,authorized_budget:quote.authorization_ceiling},sku,quote);
   // Durable handle BEFORE POST. Never automatically recreate after timeout/process restart.
   await mkdir(recoveryRoot,{recursive:true,mode:0o700});
   const receipt=join(recoveryRoot,attempt.key+'.json');
   await writeFile(receipt,JSON.stringify({key:attempt.key,input:attempt.input,state:'sending'}),{flag:'wx',mode:0o600});
   try {
    const order=await client.create(attempt);
    await writeFile(receipt,JSON.stringify({key:attempt.key,input:attempt.input,state:attempt.state,order_id:order.order_id}),{mode:0o600});
    if(order.status!=='settled') return {content:JSON.stringify({...order,recovery_file:receipt,message:'只查询或结算原订单；不重新生图'})};
    const detail=await client.order(order.order_id),bytes=await client.image(order.order_id);
    await mkdir(root,{recursive:true});const path=join(root,`image-${order.order_id}.png`);await writeFile(path,bytes,{flag:'wx'});
    return {content:JSON.stringify({order_id:order.order_id,path,charged_coins:detail.charged_coins,displayed:true}),displayImage:`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`};
   } catch(error) {await writeFile(receipt,JSON.stringify({key:attempt.key,input:attempt.input,state:attempt.state,order_id:attempt.orderId}),{mode:0o600});return {content:JSON.stringify({code:'IMAGE_ORDER_ERROR',message:error instanceof Error?error.message:'生图结果不明，不重新下单',recovery_key:attempt.key,recovery_file:receipt,order_id:attempt.orderId}),isError:true};}
  } catch(error) {return {content:JSON.stringify({code:'IMAGE_ORDER_ERROR',message:error instanceof Error?error.message:'生图失败，不自动重试'}),isError:true};}
 };
}
