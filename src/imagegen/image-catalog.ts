import {studioModelProfile} from './studio-models.js';
export interface ImageCatalogEntry {
  sku_id: string;
  model: string;
  label?: string;
  quality?: string;
  aspect_ratio?: string | null;
  resolution?: string | null;
  coins_per_image: number;
  size?: string;
  price_version?: string;
  max_prompt_bytes?: number;
  max_count?: number;
  membership_required?: string;
  eligible?: boolean;
  duration_probe?: {seconds:number;samples:1;resolution:string;quality:string;source:"provider_probe";tested_at:string};
  duration_seconds?: {p50:number;p90:number;samples:number};
}
const modelOrder: Record<string, number> = {
  'gpt-image-2': 0,
  'google/gemini-3.1-flash-image-preview': 1,
  'google/gemini-2.5-flash-image': 2,
  'gpt-image-1': 3,
};
export function imageModelLabel(entry: Pick<ImageCatalogEntry, 'model' | 'label'>): string {
  if (entry.model === 'gpt-image-2') return 'GPT Image 2';
  if (entry.model === 'gpt-image-1') return 'GPT Image 1';
  if (entry.model === 'google/gemini-3.1-flash-image-preview') return 'Nano Banana 2';
  if (entry.model === 'google/gemini-2.5-flash-image') return 'Nano Banana';
  return studioModelProfile(entry.model)?.label || entry.label || entry.model;
}
// Quality remains a billing SKU, but the picker presents one entry per model.
export function imageModelChoices<T extends ImageCatalogEntry>(catalog: T[]): T[] {
  const grouped = new Map<string, T>();
  for (const entry of catalog) {
    const rank=(row:T)=>Number(!row.aspect_ratio||row.aspect_ratio==='1:1')*8+Number(!row.resolution||row.resolution==='1K')*4+Number(row.quality===(row.model==='gpt-image-1'?'low':row.model==='gpt-image-2'?'medium':'default'))*2;
    if (!grouped.has(entry.model) || rank(entry)>rank(grouped.get(entry.model)!)) grouped.set(entry.model, entry);
  }
  return [...grouped.values()].sort((a, b) => (modelOrder[a.model] ?? 99) - (modelOrder[b.model] ?? 99)
    || a.model.localeCompare(b.model));
}
