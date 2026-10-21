import { useSyncExternalStore } from 'react';
import { getCurrentLanguage, getLanguagePreference, getLanguages, normalizeLanguage, setCurrentLanguage, subscribeLanguage, tr, hasMessage, localizeStoredText } from '../../../src/localization/index.js';
import type { Language, MessageValues } from '../../../src/localization/types.js';
export type Lang = Language;
export const getLang = getCurrentLanguage;
export const setLang = setCurrentLanguage;
export { getLanguages, getLanguagePreference, normalizeLanguage, localizeStoredText };
export function useLanguage(): Lang { return useSyncExternalStore(subscribeLanguage, getCurrentLanguage, getCurrentLanguage); }
export function makeT(language: Lang) {
  return (key: string, values?: MessageValues | string): string => !hasMessage(key, language) && typeof values === 'string' ? values : tr(key, typeof values === 'object' ? values : {}, language);
}
export type T = ReturnType<typeof makeT>;
