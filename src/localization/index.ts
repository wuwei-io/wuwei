import { languagePacks } from './registry.generated.js';
import type { Language, LanguagePack, MessageReference, MessageValues } from './types.js';
export type { Language, LanguagePack, MessageReference, MessageValues } from './types.js';
type Environment = {
  window?: { wuwei?: { systemLanguage?: string; languagePreference?: string } };
  localStorage?: { getItem(key: string): string | null; setItem(key: string, value: string): void };
  navigator?: { language?: string };
  document?: { documentElement: { lang: string; dir: string } };
  process?: { env: Record<string, string | undefined> };
  addEventListener?: (type: string, listener: (event: { key?: string | null }) => void) => void;
};
const environment = globalThis as unknown as Environment;
const listeners = new Set<() => void>();
let override: string | undefined;
let systemLanguage: string | undefined;
export const LANGUAGE_STORAGE_KEY = 'wuwei_lang';
export function getLanguages() { return Object.values(languagePacks).map(pack => ({ ...pack.meta })).sort((a,b)=>(a.order ?? 100)-(b.order ?? 100)||a.code.localeCompare(b.code)); }
export function normalizeLanguage(value?: string | null): Language {
  const normalized = (value || '').replace(/_/g, '-').toLowerCase();
  const codes = Object.keys(languagePacks);
  return codes.find(code => code.toLowerCase() === normalized) || codes.find(code => code.toLowerCase() === normalized.split('-')[0]) || codes.find(code => code.toLowerCase().split('-')[0] === normalized.split('-')[0]) || 'en';
}
export function getLanguagePreference(): string {
  if (override) return override;
  const initial = environment.window?.wuwei?.languagePreference;
  const fallback = typeof initial === 'string' && initial ? initial : 'system';
  try { return environment.localStorage?.getItem(LANGUAGE_STORAGE_KEY) || fallback; } catch { return fallback; }
}
export function setSystemLanguage(value: string) {
  systemLanguage = value;
  if (getLanguagePreference() === 'system') {
    updateDocumentLanguage();
    for (const listener of listeners) listener();
  }
}
function updateDocumentLanguage() {
  if (!environment.document) return;
  const language = getCurrentLanguage();
  environment.document.documentElement.lang = language;
  // Keep UI positions stable; individual text containers own their reading direction.
  environment.document.documentElement.dir = 'ltr';
}
function systemLocale() {
  const initial = environment.window?.wuwei?.systemLanguage;
  return systemLanguage || (typeof initial === 'string' ? initial : undefined) || environment.navigator?.language;
}
export function getCurrentLanguage(): Language {
  if (environment.window || environment.localStorage) {
    const preference = getLanguagePreference();
    return normalizeLanguage(preference === 'system' ? systemLocale() : preference);
  }
  return normalizeLanguage(environment.process?.env.WUWEI_LANG || override || 'zh');
}
export function setCurrentLanguage(value: Language) {
  const preference = value === 'system' ? 'system' : normalizeLanguage(value);
  const language = preference === 'system' ? normalizeLanguage(systemLocale()) : preference; override = preference;
  if (environment.window || environment.localStorage) {
    try { environment.localStorage?.setItem(LANGUAGE_STORAGE_KEY, preference); } catch { /* keep the in-memory preference */ }
    updateDocumentLanguage();
  } else if (environment.process) environment.process.env.WUWEI_LANG = language;
  for (const listener of listeners) listener();
}
export function subscribeLanguage(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
if (environment.window) environment.addEventListener?.('storage', event => {
  if (event.key === LANGUAGE_STORAGE_KEY || event.key == null) {
    override = undefined;
    updateDocumentLanguage();
    for (const listener of listeners) listener();
  }
});
if (environment.window) environment.addEventListener?.('languagechange', () => {
  systemLanguage = environment.navigator?.language;
  if (getLanguagePreference() === 'system') setCurrentLanguage('system');
});
if (environment.window) updateDocumentLanguage();
function messageTemplate(key: string, language: string): string | undefined {
  const visited = new Set<string>(); let locale = normalizeLanguage(language);
  while (!visited.has(locale)) {
    visited.add(locale);
    const value = languagePacks[locale]?.messages[key];
    if (typeof value === 'string') return value;
    locale = languagePacks[locale]?.meta.fallback || 'en';
  }
  return languagePacks.en.messages[key];
}
export function tr(key: string, values: MessageValues = {}, language = getCurrentLanguage()): string {
  const template = messageTemplate(key, language);
  if (template == null) return key;
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (token, name: string) => Object.hasOwn(values, name) ? String(values[name]) : token);
}
export function hasMessage(key: string, language = getCurrentLanguage()) { return messageTemplate(key, language) != null; }
export function isChineseLanguage(language = getCurrentLanguage()) { return normalizeLanguage(language) === 'zh'; }
export function translateReference(message: MessageReference, language = getCurrentLanguage()) { return tr(message.key, message.values, language); }
// Only known system messages use this adapter. User/assistant content stays data.
let legacyIndex: Map<string, string> | undefined;
let legacyTemplates: { key: string; names: string[]; pattern: RegExp }[] = [];
const legacyCache = new Map<string, MessageReference | null>();
function indexMessages() {
  if (legacyIndex) return;
  legacyIndex = new Map(); legacyTemplates = [];
  for (const pack of Object.values(languagePacks)) for (const [key, text] of Object.entries(pack.messages)) {
    if (!text) continue;
    if (!/\{[A-Za-z][A-Za-z0-9_]*\}/.test(text)) { legacyIndex.set(text, key); continue; }
    const names: string[] = []; let previous = 0, pattern = '^';
    for (const match of text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)) {
      pattern += text.slice(previous, match.index).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([\\s\\S]*?)';
      names.push(match[1]); previous = match.index + match[0].length;
    }
    pattern += text.slice(previous).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
    if (text.replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g, '').trim().length >= 4) legacyTemplates.push({ key, names, pattern: new RegExp(pattern) });
  }
}
export function referenceForStoredText(text: string): MessageReference | null {
  indexMessages(); const exact = legacyIndex!.get(text);
  if (exact) return { key: exact };
  if (legacyCache.has(text)) return legacyCache.get(text)!;
  for (const template of legacyTemplates) {
    const match = template.pattern.exec(text);
    if (match) {
      const reference = { key: template.key, values: Object.fromEntries(template.names.map((name, i) => [name, match[i + 1]])) };
      if (legacyCache.size > 512) legacyCache.clear();
      legacyCache.set(text, reference); return reference;
    }
  }
  if (legacyCache.size > 512) legacyCache.clear();
  legacyCache.set(text, null); return null;
}
export function localizeStoredText(text: string, language = getCurrentLanguage()): string {
  const reference = referenceForStoredText(text);
  return reference ? translateReference(reference, language) : text;
}
export function registerLanguagePack(pack: LanguagePack) {
  languagePacks[pack.meta.code] = pack; legacyIndex = undefined; legacyCache.clear();
  for (const listener of listeners) listener();
}
