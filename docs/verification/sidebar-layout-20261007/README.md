# Sidebar divider fix, 2026-10-07

Version 1.7.45 fixes an expanded company panel height being applied when its menu is collapsed. Collapsed panels use their content height, so the divider snaps below the company menu and chat history reclaims the space. Expanding restores the saved preferred height. The separator supports dragging up and down; dragging down from the collapsed state expands the panel after an eight-pixel threshold. Double-click restores automatic sizing. Saved expanded heights remain bounded by 72vh after a window resize. A collapsed company also remains compact when chat history is hidden.

Desktop build and actual Electron main/preload/React/IPC acceptance passed. The isolated `--sidebar-layout` run exercises upward and downward mouse dragging, collapsed snap with a persisted height, restoration, dragging from collapsed, double-click reset, viewport shrink and chat-panel hiding. No real user profile or image order was modified. Evidence is in `ui/`.

## Publication

Version 1.7.45 was published at 23:21:42 Asia/Shanghai on 2026-10-07 from commit `02b6d58687a6328ab1a5f0a6a26bc761a014dd74`. Build run `37641101201` passed for Windows, macOS and Linux, including all 156 portable tests and Windows Authenticode validation. All 15 files were transferred to OSS and checked. Seven complete binaries matched manifest SHA512 values, five installers matched GitHub SHA256 digests, and the four website download routes point to regional OSS. Compatibility run `37642276197` updated the three legacy feeds to absolute OSS URLs.

Local-route GitHub release mutations returned HTTP 500; executing the guarded cleanup and publication from the existing release server succeeded. The original release record was cleaned and published with 15 normal assets and no temporary upload maps. No replacement release was created. Temporary OSS upload acceleration was restored to disabled by successful run `37643274014`; public download URLs are unchanged. The active local development server was also checked and served the updated renderer.

See `release-build.json`, `windows-validation.txt`, `release-transfer.json`, `release-downloads.json`, `release-compatibility.json`, `release-publication.json` and `oss-upload-path.txt`.
