import type { ImageCatalogEntry } from '../../../../src/imagegen/image-catalog.js';
import {studioModelProfile} from '../../../../src/imagegen/studio-models.js';
import type { ModelChoice } from '../../../../src/model-selection.js';

// The catalogue is the only source of selectable specifications and displayed prices.
// A batch uses individually accounted single-image orders under one click approval.
export function imageStudioRows(catalog: ImageCatalogEntry[]): ImageCatalogEntry[] {
  return catalog.filter(row => !!row && typeof row.sku_id === 'string' && !!row.sku_id
    && typeof row.model === 'string' && !!row.model
    && Number.isSafeInteger(row.coins_per_image) && row.coins_per_image > 0);
}
export function imageProvider(model: string): string {
  return studioModelProfile(model)?.brand || (/^(?:gpt-image-|openai\/)/.test(model) ? 'OpenAI'
    : /^(?:google\/|gemini-)/.test(model) ? 'Google' : model.split('/')[0]);
}
export function imageDimensions(size?: string): { ratio: string; resolution: string; width?: number; height?: number } {
  const found = /^(\d{2,5})x(\d{2,5})$/.exec(size || '');
  if (!found) return { ratio: 'auto', resolution: 'auto' };
  const width = Number(found[1]), height = Number(found[2]);
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  const divisor = gcd(width, height), edge = Math.max(width, height);
  return { ratio: `${width / divisor}:${height / divisor}`, resolution: `${edge / 1024}K`, width, height };
}
export function sameModelVariants(catalog: ImageCatalogEntry[], selected?: ImageCatalogEntry): ImageCatalogEntry[] {
  return selected ? imageStudioRows(catalog).filter(row => row.model === selected.model) : [];
}
// Keep the general picker grouped, while remembering the exact studio quality.
export function withImageSkuChoices(choices: ModelChoice[], catalog: ImageCatalogEntry[]): ModelChoice[] {
  return [...choices, ...imageStudioRows(catalog).flatMap(row => {
    const key = `wuwei-image/${row.sku_id}`;
    const model = choices.find(choice => choice.category === 'images' && choice.imageModel === row.model);
    return model && !choices.some(choice => choice.key === key) ? [{...model,key,modelId:row.sku_id}] : [];
  })];
}
export function imageVariantDimensions(row?: ImageCatalogEntry) {
  const size=imageDimensions(row?.size);
  return {...size,ratio:row?.aspect_ratio||size.ratio,resolution:row?.resolution||size.resolution};
}
export const STUDIO_RATIOS=['1:1','2:3','3:2','3:4','4:3','9:16','16:9','4:5','5:4','21:9','1:2','2:1','9:21','9:19.5','19.5:9','9:20','20:9','1:4','4:1','1:8','8:1','7:5','5:7'];
export function chooseImageVariant(variants: ImageCatalogEntry[], selected: ImageCatalogEntry, field: 'size' | 'quality' | 'aspect_ratio' | 'resolution', value: string): ImageCatalogEntry | undefined {
  const read=(row:ImageCatalogEntry,key:string)=>key==='aspect_ratio'?imageVariantDimensions(row).ratio:key==='resolution'?imageVariantDimensions(row).resolution:row[key as keyof ImageCatalogEntry];
  const others=['aspect_ratio','resolution','quality'].filter(key=>key!==field);
  const score=(row:ImageCatalogEntry)=>others.reduce((n,key)=>n+Number(read(row,key)===read(selected,key)),0);
  return variants.filter(row=>read(row,field)===value).sort((a,b)=>score(b)-score(a))[0];
}
export function imagePromptLimit(selected?: ImageCatalogEntry): number {
  return Math.min(1000, Number.isSafeInteger(selected?.max_prompt_bytes) && selected!.max_prompt_bytes! > 0 ? selected!.max_prompt_bytes! : 1000);
}
export function validImagePrompt(prompt: string, selected?: ImageCatalogEntry): boolean {
  return !!prompt.trim() && new TextEncoder().encode(prompt.trim()).length <= imagePromptLimit(selected);
}

export function imageResolutionPixels(resolution:string):number{const value=Number.parseFloat(resolution);return resolution==='auto'?0:Number.isFinite(value)?value*(resolution.toUpperCase().endsWith('K')?1024:1):0;}
