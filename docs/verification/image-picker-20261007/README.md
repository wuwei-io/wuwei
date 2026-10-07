# Hosted image picker and delivery verification, 2026-10-07

Version 1.7.43 fixes the mismatch between GPT Image 1's 8-coin starting price and the previously selected 29-coin quality SKU. The model menu now has four entries: GPT Image 2, Nano Banana 2, Nano Banana, GPT Image 1. GPT Image 1's picker representative is its low-quality SKU. Its native confirmation offers low quality (estimated 8 coins) first and medium quality (estimated 29 coins) second. Each choice uses its own server quote, price version and SKU; no order is submitted before the choice. Actual billing and the explicit authorization ceiling remain visible.

Image connectivity uses the selected image SKU's authenticated catalog and quote endpoints. It does not ping a text model or create an image order. Missing/unavailable models show yellow and expired login shows red. Request sequencing prevents an older check from overwriting a newer result. Image turns also retain their prompt-derived title without requesting a text-model title.

Image generation and original-image reauthorization dialogs carry Chinese and English labels. The renderer selects the current UI language independently of the producer's language. Image billing errors are localized.

After an interrupted submission or download, the client looks up the original idempotency key/order and retrieves the original image. Read-only GET and image-stream reads have bounded retries; paid POSTs are never repeated automatically. An accepted order can be polled for completion. If recovery remains unavailable, the durable receipt is retained and success is not claimed.

## Local validation

- Root TypeScript check passed; Electron main/preload/renderer build passed.
- All 154 portable release tests passed, with no failures or skipped tests. See `portable-tests.txt`.
- `scripts/run-image-picker-ui-harness.mjs` exercised the actual Electron main, preload, React UI and IPC with an isolated profile and synthetic HTTP responses. See `desktop-ui.json` and `desktop-ui.txt`.
- UI checks cover the four-entry ordering, low-SKU default, selected-image green light, English popup even with a Chinese producer, Chinese quality choice and matching medium SKU, cancel with zero orders, inline output, original-order recovery after interrupted POST response and asset stream, and yellow when the selected model becomes unavailable.
- The GUI harness sent zero production requests and zero chat-model requests. Its two synthetic paid POSTs represent two separately approved logical requests; the recovery path did not add a POST.
- The existing full desktop TypeScript baseline has 16 unrelated errors; this report does not claim that baseline passes.

## Production diagnosis and backend deployment

Read-only inspection found earlier GPT Image 1 low, GPT Image 1 medium and GPT Image 2 attempts settled with one stored asset and one spend transaction per order. The missing client output was not evidence of provider generation failure. An interrupted GPT Image 2 response appeared as HTTP 499 while its original order subsequently settled. No paid reproduction or new wallet/database migration was performed for this diagnosis.

The server catalog ordering change was deployed and pushed to `KehuiPang/wuwei-site` as `d6174d3`. Both production services stayed active; authentication and regional OSS download redirects were verified. The backend rollback directory is `/opt/wuwei-site.before-image-sort-20261007`.

The user's existing isolated online dev profile was reused when restarting the owned dev process; login, conversations and original-order receipts were preserved. Production image service checks and synthetic transport failures validate different parts of the flow; they do not guarantee uninterrupted access from every client network.

## Publication

`v1.7.43` was published as Latest from immutable source tag `8eb129cd7af6af60079a98d78a052d9e7c4a23a6`. All three platform build jobs passed in Actions run `37624348547`, including the Windows installer's mandatory Authenticode `Valid` check. Compatibility publishing passed in run `37626010828`.

All 15 distribution files were relayed to regional OSS with matching sizes, MD5, SHA512 and GitHub SHA256 digests. An independent full download then verified all seven binaries against their original hashes. The four website download redirects resolve to regional OSS version 1.7.43. Legacy R2 manifests contain version 1.7.43 and point their binaries at OSS. The three private scoped-upload maps were removed from the draft before publication; the published release contains 15 normal distribution assets.

Temporary transfer acceleration was used only for uploading and integrity verification, then restored to disabled in run `37626527904`. Public download URLs were unchanged. See `release-build.json`, `release-compatibility.json`, `release-publication.json`, `release-transfer.json`, and `release-downloads.json`.
