# Image generation and company UI acceptance

The release exposes `platform_imagegen` for both hosted gateway paths, including `/api/gateway/v1`. Image instructions are assembled from the tools actually available in each request, including restored/custom conversation prompts. Catalog access is followed by `generate`, whose own fee dialog precedes any order. The description and instructions explicitly distinguish opening this dialog from placing a paid order. An empty catalog reports server unavailability instead of returning an unexplained empty array.

New installations of the complete default company initialize CEO办公室, 技术部, 设计部 and 综合部. Department heads/members use stable employee IDs. Existing organizations and explicitly cleared department lists are preserved. English names are presentation only; an unchanged English edit never overwrites canonical Chinese fields. Group-list and SOP titles follow their page instead of inheriting the last conversation title. Sidebar creation hints are short in both languages.

## Client verification

- `npm run typecheck`: passed.
- `node scripts/test-release.mjs`: 145 tests passed, zero failures/skips.
- `npm run desktop:build`: passed.
- `node scripts/run-full-team-ui-harness.mjs`: passed with actual application main, preload, renderer, team IPC and persisted fixture files, in a separate temporary profile. See `ui/full-app-interaction.txt` and the DOM snapshots. Covers six English teammates, four departments, team pack, edit dialog, unchanged save, custom save, department blur, CEO-chat to Groups navigation, Chinese switch and preserved member references. These are full-application DOM interaction checks, not native pointer/screenshot acceptance.
- `node scripts/run-full-team-ui-harness.mjs --fresh-profile`: passed. With no settings file at all, the actual persisted backend becomes `wuwei-free`, OpenAI-compatible, GLM-4.7-Flash and the hosted gateway URL. This covers the null-config edge case rather than merely checking the selected UI label. See `ui/fresh-profile.txt`.
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

The initial v1.7.41 hosted Windows CI could not start the full Electron desktop harness. The portable suite and the full application tests on the local desktop passed. The release workflow keeps portable checks on all hosted runners and supports finishing a selected platform independently. v1.7.42 also fixes missing-config initialization and is the final version for this rollout.

The initial backend acceptance cleanup closed its two synthetic accounts, removed their credentials and reset unused fixture balances to zero with an audited administrative operation. The generated orders and settlement evidence are retained.

## Final desktop image and picker verification

The real desktop fee hook now goes through main/preload/React/IPC. It is independent of ask_user and CEO decisions, has no auto-approve timeout, and responds to Generate, Cancel and Stop. The earlier Node-injected hook test was insufficient to verify this desktop path.

The platform list keeps Free trial first and provides Wuwei hosted · Image models. Its SKU menu comes from the authenticated enabled image catalog. In explicit image mode the selected SKU goes straight to the built-in image tool, preserving normal conversation history and bypassing an unnecessary text-model request. Chat model IDs and image SKU IDs remain separate. Normal AI-directed image requests still use tool availability instructions. New generation is bound to the user's selected SKU; recovery preserves the original order.

Actual desktop paid acceptance (separate synthetic profile, actual React control and IPC):

| Model | Original order | Measured charge | Verified image |
| --- | --- | ---: | --- |
| GPT Image 2 medium | be3c19f9-cf95-41e3-9268-d871bcad7eff | 36 | 1024×1024 PNG |
| Nano Banana 2 | 11118156-7668-4d64-983f-796a21878f7c | 46 | 1024×1024 PNG |

Both cancelled once without creating an order, then approved one generation, settled the original order and loaded an inline image. Neither executed send_image afterward. Independent server verification replayed the original key and settlement without generation: one image-spend row, original credential bound, unauthorized and other-user access denied. Pending/unknown results cannot produce a success reply; recovery attempts settlement of the original order only. Previously displayed file paths are skipped before send_image execution within the same turn, while an explicit resend in a later user turn remains permitted.

The full company UI harness also verifies assigned-member-only department cards, Add, movement from another department, Remove, and restoration of original IDs/heads/members. The desktop TypeScript check still reports the same 16 pre-existing errors; the root type check, portable suite, production build and full application interaction checks pass. Google login's reuse of the original Chrome profile has been implemented, but completion of the user's personal Google authorization remains unconfirmed.

Final Cancel/Stop acceptance passed on the latest renderer and main: Stop cleared the fee dialog and returned evt:stopped without creating an order. The separate desktop synthetic accounts were then closed, unused balances reset with an audited operation and local/server credential copies removed while retaining paid orders and ledger evidence.

## Published release

v1.7.42 was published as Latest on 2026-10-06 at 17:27:52 UTC (2026-10-07 at 01:27:52 China time). Its immutable tag is `932d7b0f82d9f533d90f9edc42754847b2b35b5a`. All three platform builds passed in Actions run `37500011652`; the Windows installer signature was Valid. The final release contains 15 assets. Temporary signed-upload relay metadata was removed before publication.

`release-1.7.42.json` records complete SHA512 verification of all seven binaries, matching GitHub SHA256 digests for all five installers, four production website redirects to the correct regional OSS files, and three legacy R2 feeds pointing to OSS with matching sizes and hashes. Complete hash reads used the same bucket's temporary overseas acceleration endpoint; regional download URLs were independently checked and stayed unchanged. `release-1.7.42-transfer.json` records verified transfer of all 15 files without credentials or signed URLs.

Compatibility feed run `37503014094` passed. Restoration run `37503749770` confirmed transfer acceleration disabled again; client and website downloads remain on regional OSS. Publication and restoration metadata are saved in `release-1.7.42-publication.json`. No production image acceptance accounts remain active, and the user-facing dev profile and generated files have been retained.
