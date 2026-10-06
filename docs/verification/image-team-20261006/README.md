# Image generation and company UI acceptance

The release exposes `platform_imagegen` for both hosted gateway paths, including `/api/gateway/v1`. Image instructions are assembled from the tools actually available in each request, including restored/custom conversation prompts. Catalog access is followed by `generate`, whose own fee dialog precedes any order. The description and instructions explicitly distinguish opening this dialog from placing a paid order. An empty catalog reports server unavailability instead of returning an unexplained empty array.

New installations of the complete default company initialize CEO办公室, 技术部, 设计部 and 综合部. Department heads/members use stable employee IDs. Existing organizations and explicitly cleared department lists are preserved. English names are presentation only; an unchanged English edit never overwrites canonical Chinese fields. Group-list and SOP titles follow their page instead of inheriting the last conversation title. Sidebar creation hints are short in both languages.

## Client verification

- `npm run typecheck`: passed.
- `node scripts/test-release.mjs`: 140 tests passed, zero failures/skips.
- `npm run desktop:build`: passed.
- `node scripts/run-full-team-ui-harness.mjs`: passed with actual application main, preload, renderer, team IPC and persisted fixture files, in a separate temporary profile. See `ui/full-app-interaction.txt` and the DOM snapshots. Covers six English teammates, four departments, team pack, edit dialog, unchanged save, custom save, department blur, CEO-chat to Groups navigation, Chinese switch and preserved member references. These are full-application DOM interaction checks, not native pointer/screenshot acceptance.
- Real hosted GLM-4.7-Flash called catalog and generate, showed the English cost confirmation, and cancellation placed no order. The actual client downloaded and completely decoded a previously settled 1024×1024 PNG. See `live-client.json`. Synthetic credentials are excluded from evidence.

## Production backend verification

The image backend was deployed on 2026-10-06 with a database snapshot and an independent isolated restore rehearsal. The migration transaction verified that existing wallet balances, membership data and coin transactions remained unchanged. Dedicated synthetic accounts were used for acceptance; real users' balances were not used.

Real generation and settlement succeeded for:

| Specification | Order | Authorized | Charged | Output |
| --- | --- | ---: | ---: | --- |
| GPT Image 1 low | a056d4ac-ac1d-46b7-8b8d-02d8b5862b30 | 12 | 8 | 1024×1024 PNG |
| GPT Image 1 medium | db39bb51-02bf-4c43-ae39-da3b8c99e74e | 33 | 29 | 1024×1024 PNG |
| Gemini 2.5 Flash Image | f044e6cb-adeb-40ba-8211-aa21ba12c009 | 30 | 26 | 1024×1024 PNG |

The Gemini metadata response initially could not confirm final usage. The original stored image was subsequently settled by querying the original generation; no second generation was submitted. Tests also verified unauthorized/other-account denial, complete native image decoding, original credential binding and one spend transaction after idempotent replay. Private server reports and rollback snapshots are retained outside the repository.

## Downloads and debug environment

The production website uses OSS through `WUWEI_DOWNLOAD_BASE`. The released client also uses OSS directly. Old clients with R2 update feeds receive only a small compatibility manifest there; its absolute file URLs point to OSS, retaining SHA512 and file sizes. No large new artifacts are required on R2.

The user-facing debug build runs `electron-vite dev`, can access the live catalog and starts with the free provider. Its Wuwei profile/userData are isolated explicitly. Browser AppData paths are inherited normally so browser login can use the user's existing Chrome configuration. The earlier offline test window, its `offline-test` model and its `Test Department` fixture are not product defaults.
