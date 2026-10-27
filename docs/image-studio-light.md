# Light image studio

Implemented from the approved 2026-10-25 design. This change adds only the light interface; it has no new dark theme or preview controls.

Selecting a hosted image model or the sidebar image entry opens a dedicated creation composer. The conversation sidebar and per-session text/image drafts remain shared with chat. Model and parameter popovers sit above the composer; selecting a quality maps to a real catalogue SKU. The exact selected quality can be restored from the account's model preference while the general picker continues to group by model.

The studio debounces authenticated quotes through main/preload. The main process loads the current catalogue and supplies its price version, then requests a quote without reserving funds or creating an order. A quote belongs to one account/session, SKU, catalogue version and prompt. Late responses are discarded, failed quotes disable generation and offer retry, and UTF-8 prompt limits are checked before submission.

Generation shows the estimate and maximum charge inline. Clicking Generate directly consumes a main-issued, two-minute, single-use quote bound to the account, session, SKU and redacted prompt. The session validates the fresh server quote before the paid POST. Automatic turns and ordinary model tool inputs cannot supply this trusted context and retain their existing decisions. Generation reuses the existing chat IPC, durable order receipt, settlement and recovery flow. No client-computed price or new paid retry path is introduced. Existing image results are displayed in the conversation; the composer becomes compact during generation and when viewing history.

## Current capabilities

The live billing contract supports single-image text generation. The studio derives size and quality options from the server catalogue. A native/unknown dimension is shown as Auto. Reference uploads remain explicitly unavailable, and unsupported batch counts cannot be selected. Images already in a chat draft remain visible and removable, and can be used by returning to text chat. This change does not enable reference editing, arbitrary ratios, additional resolutions or batch billing on the server.

New messages have Chinese and English source copy. The other shipped locales currently use English fallbacks for the new studio namespace.

## Verification

- `npx tsc --noEmit` and `npx tsc --noEmit -p tsconfig.desktop.json`.
- `npm run desktop:build`, including localization checks.
- 52 focused tests across image studio capability mapping, exact-SKU preferences, billing client, image picker, session and recovery.
- `node scripts/run-image-studio-ui-harness.mjs`: 23 actual Electron main/preload/React/IPC checks against synthetic service responses. Tests cover live SKU selection, quoting errors and stale quotes, UTF-8 limits, draft retention, duplicate clicks, direct generation, changed-price rejection and legacy cancellation and responsive layouts at 1280×800 and 1080×760.

The harness uses an isolated local profile and blocks external service calls. Its one simulated order and tiny generated image are fixture data; it never writes to a production account or charges real coins. To choose an evidence location, set `STUDIO_EVIDENCE` before running the harness.
