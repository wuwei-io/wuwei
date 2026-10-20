import React from 'react';
import { getLanguages, makeT, type Lang } from '../i18n.js';

/** The locale registry is the only source of selectable languages. */
export function LanguageSwitcher({ language, onChange }: { language: Lang; onChange: (language: Lang) => void }) {
  const languages = getLanguages();
  const label = makeT(language)('language.choose');
  return <select className="language-switcher" aria-label={label} title={label} value={language}
    style={{ position: 'absolute', top: 10, left: 12, background: 'var(--bg-raised)', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}
    onChange={event => onChange(event.target.value)}>
    {languages.map(locale => <option key={locale.code} value={locale.code} lang={locale.code}>{locale.nativeName}</option>)}
  </select>;
}
