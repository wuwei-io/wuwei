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
