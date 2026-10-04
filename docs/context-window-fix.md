# Context window correction

## Evidence

Individually fetched official API Markdown pages:
- https://developers.openai.com/api/docs/models/gpt-6.1-sol.md
- https://developers.openai.com/api/docs/models/gpt-6-astra.md
- https://developers.openai.com/api/docs/models/gpt-6-sol.md
- https://developers.openai.com/api/docs/models/gpt-6-luna.md

Each page returned:
```
- 1,050,000 context window
- Maximum input tokens: 922,000
- 128,000 max output tokens
```

Local Codex cache (client_version 0.160.0, fetched_at 2026-10-04T04:03:16.232765100Z): each of these four exact slugs has context_window=272000, max_context_window=872000, effective_context_window_percent=95. Existing gpt-5.6-sol/terra/luna and gpt-5.5 also report context_window=272000.

## Policy

API uses exact-slug total windows. Codex reads only models_cache.json (never config.toml); valid context_window wins. Missing or malformed cache uses observed exact-slug defaults, unknown Codex slug uses 128000. No maximum/experimental field enables larger context. Explicit positive windows may reduce supported defaults, cannot exceed known limits; unknown API/local endpoints allow explicit overrides. No universal Codex 400k cap remains.

Default compact threshold uses 80% of the same window (API four slugs 840000; Codex 217600). Thus API default stays below documented maximum input 922000. User thresholds remain supported and are bounded to the window; this patch does not add API output-reservation budgeting. Codex 95% field is not applied twice: default window is the UI total, default 80% compaction already stays below 95% effective capacity.

Provider carries the resolved budget; each Agent uses its own provider budget. Model switch updates only the target session rather than copying the new default to all other Agents. Confirmed overflow limits only shrink Agent window and threshold, synchronizing to renderer through evt:context-window even if the error is internally retried. No inferred error can enlarge a window. Learned limits are runtime/session-local, not persisted; replacing provider resets them. Active-turn model switching still follows existing provider-switch semantics (no new cancellation/restart). UI sync is implemented, not exercised in a running Electron instance this round.

## Verification

Full raw stdout/stderr is stored in docs/verification/context-window/.

Commands and exits:
- npx tsx --test tests/context-window.test.ts: exit 0, 8/8 passed
- npx tsc --noEmit: exit 0, empty output
- npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --esModuleInterop --skipLibCheck tests/context-window.test.ts: exit 0, empty output
- npx tsc -p tsconfig.desktop.json --noEmit: exit 2, 27 pre-existing diagnostics; before/after diagnostic texts identical after normalizing line/column numbers
- npm run desktop:build: exit 0, dependency eval warning retained

No real API/Codex long-token request was made. Tests execute resolver, disk cache IO, loadConfig/makeProvider and actual Agent overflow hook; they do not assert account entitlement from the maximum cache field.

## Installed app and activation

Running process path: C:/Program Files/wuwei/wuwei.exe.
Installed resources/app.asar package.json version: 1.7.34.
Source package.json version: 1.7.34.
The installed ASAR was only read, not changed. The repository build produces out/ only; the currently running installed client does not consume it.

After review, use a clean checkout containing this commit, install the existing lockfile dependencies, rerun tests/typechecks and desktop:build. For isolated validation use the existing desktop:dev:test entrypoint (separate data directory); do not launch it while shared work is being modified. Resolve/approve remaining desktop diagnostics before release; bump release version through normal release flow, then run pack:wuwei to produce an installer. Install/restart only after explicit approval and a safe conversation stopping point. This round did not package an installer, publish, overwrite installed files, change Codex config or restart any client.

## Dirty tree preservation

App.tsx already had two inserted claude-opus-5-5 preset lines before this task. Only this task's context-window/session/overflow hunks are staged; the existing two lines remain unstaged. Existing untracked decision/mobile docs are excluded.
