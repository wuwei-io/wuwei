export interface ImageCatalogEntry {
  sku_id: string;
  model: string;
  label?: string;
  quality?: string;
  coins_per_image: number;
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
  return entry.label || entry.model;
}
// Quality remains a billing SKU, but the picker presents one entry per model.
export function imageModelChoices<T extends ImageCatalogEntry>(catalog: T[]): T[] {
  const grouped = new Map<string, T>();
  for (const entry of catalog) {
    if (!grouped.has(entry.model) || entry.quality === 'low') grouped.set(entry.model, entry);
  }
  return [...grouped.values()].sort((a, b) => (modelOrder[a.model] ?? 99) - (modelOrder[b.model] ?? 99)
    || a.model.localeCompare(b.model));
}
