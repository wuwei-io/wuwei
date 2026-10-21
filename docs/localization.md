# Language packs

UI and application-owned messages live in `src/localization/locales/<code>.json`.
`en.json` is the fallback language and `zh.json` is the Chinese source pack.
Keys identify messages; named placeholders carry values. Do not build sentences with
language conditionals or put translated text in components.

```ts
tr('image.authorization.authorize', { amount: 20 });
```

To add a language, copy a pack to a new locale filename, set `meta.code`, `name`,
`nativeName`, `direction` and `fallback`, then translate `messages`. Keep message
keys and placeholder names. A partial new pack may fall back to English. Run
`npm run i18n:generate`, `npm run i18n:check` and the normal build. The generated
registry bundles the new pack and adds it to every language selector automatically.
Language selection persists locally and synchronizes to the desktop main process.

Ctrl/Command+Shift+T keeps the existing Chinese/English preview toggle. It chooses
the opposite target language, including inside dialogs, and temporarily translates
dynamic display text without changing stored titles, messages or input drafts.
Normal language selection continues to preserve user content as originally written.

React uses `useLanguage()` to subscribe to changes, including in memoized UI.
Resolve messages when rendering, or store message references and parameters.
Never resolve menu/catalog labels once at module initialization. Errors that arrive
as machine codes retain their code and are rendered in the current language.
`localizeStoredText` handles older application-owned notices only. It must never
be applied to user messages, assistant responses, custom names or credentials.

`src/localization/content` contains stable legacy aliases/default records. These
are data for matching and migration; do not translate their persisted identifiers.
Default employee presentation uses pack keys and preserves customized records.
The development baby preview contains sample knowledge, treated as content.
Native language names in the language selector intentionally retain their own script.
Protocol/product names and shortcuts shared by Chinese and English are explicitly
listed with their reason in `src/localization/invariant-messages.json`.

Run `node scripts/test-release.mjs` for unit/regression checks and
`node scripts/test-client-flows.mjs <output-directory>` for isolated Electron UI
flows. The latter blocks external services and uses simulated accounts/orders.
Build and release checks reject missing source keys, Chinese English-pack messages,
unknown message keys and hardcoded Chinese renderer messages.
They also reject untranslated English text in the Chinese source pack and
hardcoded built-in tool descriptions. The complete built-in tool metadata fixture
checks translated descriptions and parameters while preserving schema data.

The renderer bundles the official Inter 4.1 variable font for consistent Latin
text and numbers on machines without Inter installed. Chinese uses the native
Chinese font fallback. Code and terminal text retain the monospace stack.
Its SIL Open Font License is shipped from
`desktop/renderer/public/third-party/Inter-LICENSE.txt` with the renderer.


## Bundled locales and system preference

Shipped language packs declare `meta.complete: true`. They must contain every English key and preserve each interpolation token. Extension packs may still declare partial translations and a fallback. Locale metadata owns display order, native name, direction and fallback; the language picker has no hardcoded language list. New locales require a JSON pack, registry generation and localization checks.

The first launch follows the computer’s preferred system language, resolving regional variants (for example `pt-PT` → `pt-BR`) and falling back to English for unavailable languages. The stored preference `system` remains automatic across restarts. Selecting a language stores an explicit preference; selecting “Follow system” restores automatic mode. Renderer startup uses Electron’s preferred OS language, and preference changes synchronize the main process immediately. Existing preferences remain intact.

UI messages and built-in system prompts use the effective locale. Every agent model request also receives a localized response-language policy, including existing conversations, custom prompts and employee personas. An explicit request from the user for another language takes priority. User messages, files and custom prompts are not rewritten. The English preview shortcut restores the previous language preference when toggled back.

Arabic and Persian set the document direction to RTL. Language names use their native spelling, identifiers retain their spelling, and the ledger’s Gregorian dates retain 24-hour times so calendar filtering stays consistent across locales. Font fallback uses the installed system fonts for non-Latin scripts.

Language packs are bundled and switched locally; no network translation service runs when changing the interface language. Translation validation checks completeness, interpolation, damaged text and technical identifiers. The initial new packs use machine-assisted translation; the release checks validate critical navigation and payment flows and do not substitute for ongoing native-speaker editorial review.
