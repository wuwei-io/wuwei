import { tr, localizeStoredText } from "./localization/index.js";
import { hostedModelImageInput } from './model-image-input.js';

export type ModelCategory = 'free' | 'economy' | 'premium' | 'images' | 'videos' | 'connections';
export const MODEL_CATEGORIES: { id: ModelCategory; zh: string; en: string }[] = [{"id":"free","messageKey":"model.category.free"},{"id":"economy","messageKey":"model.category.economy"},{"id":"premium","messageKey":"model.category.premium"},{"id":"images","messageKey":"model.category.images"},{"id":"videos","messageKey":"model.category.videos"},{"id":"connections","messageKey":"model.category.connections"}].map(row => ({...row, id:row.id as ModelCategory, get zh(){return tr(row.messageKey);},get en(){return tr(row.messageKey);}}));
export type ModelChoice = {
  key: string; providerId: string; modelId: string; label: string; labelEn: string;
  category: ModelCategory; rank: number; recommended: boolean; defaultForNewUsers: boolean;
  free: boolean; needsLogin: boolean; badge?: string | null;
  imageInput?: boolean;
  price?: { input: number | null; output: number | null; cache: number | null };
  videoCoins?: number | null;
  videoModel?: string;
  imageCoins?: number;
  imageModel?: string;
  imageQuality?: string;
  hiddenInPicker?: boolean;
  connectionLabel?: string;
};
type Provider = { id:string; hosted:boolean; sort:number; label:string; labelEn?:string|null; models:{id:string;label:string;labelEn?:string|null;label_en?:string|null;free:boolean;anon?:boolean;badge?:string|null;inputModalities?:string[];selection?:{category?:string;rank?:number;recommended?:boolean;defaultForNewUsers?:boolean;hiddenInPicker?:boolean};price?:ModelChoice['price']}[] };
function englishCatalogLabel(label: string, fallback: string): string {
  const translated = localizeStoredText(label, 'en');
  return /[\u3400-\u9fff]/.test(translated) ? fallback : translated;
}
export function catalogModelChoices(providers: Provider[], selectedKey: string): ModelChoice[] {
  return providers.flatMap(p=>p.models.filter(m=>!m.selection?.hiddenInPicker || `${p.id}/${m.id}`===selectedKey).map((m,index)=>({
    key:`${p.id}/${m.id}`,providerId:p.id,modelId:m.id,
    label:(m.free && /自动/.test(m.label) ? m.label.replace(/^免费模型\s*[·・]?\s*/, '') : m.labelEn || m.label_en || m.label || m.id).replace(/^(?:Zhipu\s+|智谱\s*)/i,''),labelEn:(p.hosted ? englishCatalogLabel(m.labelEn || m.label_en || m.label || m.id, m.id) : m.labelEn || m.label_en || m.label || m.id).replace(/^(?:Zhipu\s+|智谱\s*)/i,''),
    connectionLabel:p.labelEn || (p.hosted ? englishCatalogLabel(p.label, p.id) : p.label),
    category:(m.free?'free':!p.hosted?'connections':m.selection?.category==='economy'?'economy':'premium') as ModelCategory,
    rank:m.selection?.rank ?? p.sort*100+index,recommended:m.selection?.recommended===true,defaultForNewUsers:m.selection?.defaultForNewUsers===true,
    free:m.free,needsLogin:p.hosted && (!m.free || m.anon===false),badge:m.badge,price:m.price,hiddenInPicker:m.selection?.hiddenInPicker===true,
    imageInput:p.hosted ? hostedModelImageInput(m.id,m.badge,m.inputModalities) : undefined,
  }))).sort((a,b)=>Number(b.recommended)-Number(a.recommended)||a.rank-b.rank);
}
export function recommendedNewUserModel(choices: ModelChoice[]): ModelChoice | undefined {
  return choices.find(c=>c.category==='economy' && c.defaultForNewUsers && c.recommended && c.price?.input!=null && c.price?.output!=null);
}
export type ModelPreference = { providerId: string; modelId: string };
export type ModelPreferenceSettings = {
  providerId?: string; model?: string; imageMode?: boolean; imageSku?: string; modelChoiceExplicit?: boolean;
  modelPreferences?: Record<string, ModelPreference>;
};
export function anonymousDefaultModel(choices: ModelChoice[]): ModelChoice | undefined {
  const eligible = choices.filter(c => c.free && !c.needsLogin);
  return eligible.find(c => c.modelId === 'openrouter-auto-free') ?? eligible[0];
}
export function rememberedModelChoice(choices: ModelChoice[], settings: ModelPreferenceSettings, userId: string): ModelChoice | undefined {
  const saved = settings.modelPreferences?.[userId];
  if (saved) return choices.find(c => c.providerId === saved.providerId && c.modelId === saved.modelId);
  // Carry forward a legacy explicit paid choice once. A free selection could
  // have been made as a guest, so it does not imply a signed-in preference.
  if (!settings.modelPreferences && settings.modelChoiceExplicit === true) {
    return choices.find(c => !c.free && c.providerId === (settings.imageMode ? 'wuwei-image' : settings.providerId) && c.modelId === (settings.imageMode ? settings.imageSku : settings.model));
  }
}
export function shouldApplyEconomyDefault(settings: {providerId?:string;model?:string;modelChoiceExplicit?:boolean;imageMode?:boolean}, loggedIn: boolean, emptyChat: boolean, hosted = true): boolean {
  // Persisted choices belong to the previous chat/login. The renderer tracks
  // explicit choices in the current chat separately, including image models.
  return loggedIn && emptyChat && (!settings.providerId || !settings.model || hosted);
}
