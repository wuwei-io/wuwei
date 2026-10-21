export interface LanguagePack {
  meta: { code: string; name: string; nativeName: string; direction: 'ltr' | 'rtl'; fallback: string; order?: number; complete?: boolean };
  messages: Record<string, string>;
}
export type Language = string;
export type MessageValues = Record<string, unknown>;
export interface MessageReference { key: string; values?: MessageValues }
