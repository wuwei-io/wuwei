import type { ImageCatalogEntry } from '../../../../src/imagegen/image-catalog.js';

export interface GalleryItem {
  type:string; anchor?:string; text?:string; ts?:number; id?:string; name?:string;
  input?:Record<string,unknown>; result?:string; isError?:boolean;
  status?:string; image?:string;
}
export interface StudioArtwork {
  id:string; toolId?:string; orderId?:string; image?:string; prompt:string;
  state:'complete'|'running'|'failed'|'pending'|'unattempted';
  skuId?:string; model?:string; quality?:string; ratio?:string; resolution?:string;
  charged?:number; elapsedMs?:number; ts?:number; message?:string;
}
export interface StudioBatch {id:string;prompt:string;ts?:number;artworks:StudioArtwork[]}
const string=(v:unknown)=>typeof v==='string'?v:undefined;
const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:undefined;
function payload(value?:string):Record<string,unknown>{try{const p=JSON.parse(value||'{}');return p&&typeof p==='object'&&!Array.isArray(p)?p:{};}catch{return {};}}

// Only persisted tool results can supply paid amounts. Current quotes/prices
// must never replace a historical charge or turn an uncertain order into failure.
export function studioBatches(items:GalleryItem[],catalog:ImageCatalogEntry[],busy:boolean):StudioBatch[]{
  const batches:StudioBatch[]=[],orders=new Map<string,StudioArtwork>();
  let batch:StudioBatch|undefined;
  items.forEach((item,index)=>{
    if(item.type==='user'){batch={id:item.anchor as string||`turn-${index}`,prompt:item.text||'',ts:item.ts,artworks:[]};batches.push(batch);return;}
    if(item.type!=='tool'||item.name!=='platform_imagegen')return;
    const result=payload(item.result),input=item.input||{};
    if(!batch){batch={id:`turn-${index}`,prompt:string(input.prompt)||'',artworks:[]};batches.push(batch);}
    const skuId=string(result.sku_id)||string(input.sku_id),sku=catalog.find(row=>row.sku_id===skuId);
    const orderId=string(result.order_id),image=item.image?.startsWith('data:image/')?item.image:undefined;
    const definitive=result.status==='failed'||(!orderId&&!result.recovery_key&&item.isError===true);
    const artwork:StudioArtwork={id:orderId||item.id||`${batch.id}-${index}`,toolId:item.id,orderId,image,
      prompt:string(input.prompt)||string(result.prompt)||batch.prompt,skuId,
      model:string(result.model)||sku?.model,quality:string(result.quality)||sku?.quality,
      ratio:string(result.aspect_ratio)||sku?.aspect_ratio||undefined,resolution:string(result.resolution)||sku?.resolution||undefined,
      state:image?'complete':item.status==='running'&&busy?'running':definitive?'failed':'pending',
      charged:number(result.charged_coins),elapsedMs:number(result.elapsed_ms),ts:number(result.created_at_ms)||item.ts||batch.ts,
      message:string(result.message)};
    const existing=orderId?orders.get(orderId):undefined;
    if(existing){if(image||existing.state!=='complete')Object.assign(existing,artwork,{id:existing.id});return;}
    batch.artworks.push(artwork);if(orderId)orders.set(orderId,artwork);
  });
  const populated=batches.filter(batch=>batch.artworks.length);
  const last=populated.at(-1);
  if(last){
    const input=items.filter(item=>item.type==='tool'&&item.name==='platform_imagegen').at(-1)?.input;
    const requested=Math.min(4,Math.max(1,Number(input?.batch_count)||last.artworks.length));
    while(last.artworks.length<requested)last.artworks.push({id:`${last.id}-waiting-${last.artworks.length}`,prompt:last.prompt,state:busy?'running':'unattempted'});
  }
  return populated;
}
