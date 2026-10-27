import { imageModelChoices, imageModelLabel, type ImageCatalogEntry } from './imagegen/image-catalog.js';
import type { VideoCatalog } from './videogen/contracts.js';
import type { ModelChoice } from './model-selection.js';

export function mediaModelChoices(images: ImageCatalogEntry[], video: VideoCatalog | null): ModelChoice[] {
 return [...imageModelChoices(images).map((row,index)=>({key:`wuwei-image/${row.sku_id}`,providerId:'wuwei-image',modelId:row.sku_id,
  label:imageModelLabel(row),labelEn:imageModelLabel(row),category:'images' as const,rank:index,recommended:false,defaultForNewUsers:false,
  free:false,needsLogin:true,imageModel:row.model,imageQuality:row.quality,
  imageCoins:Math.min(...images.filter(entry=>entry.model===row.model).map(entry=>entry.coins_per_image))})),
 ...(video?.enabled?video.models:[]).map((row,index)=>({key:`wuwei-video/${row.id}`,providerId:'wuwei-video',modelId:row.id,
  label:row.name,labelEn:row.name,category:'videos' as const,rank:index,recommended:false,defaultForNewUsers:false,
  free:false,needsLogin:true,videoModel:row.id,videoCoins:row.min_coins}))];
}
