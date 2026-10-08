# Company defaults and sidebar release, 2026-10-07

Version 1.7.44 includes the accepted one-person company and all four hosted image models from 1.7.43. The user confirmed successful real generations with all four models before requesting this release and announcement.

Fresh profiles initialize the free chat provider and explicitly enable My Company, with its menu initially collapsed. No team is installed automatically. The company title opens an empty operation page; Add teammate → Wuwei One-Person Company → Install explicitly adds the six-member team with CEO Office, Engineering, Design and General Affairs. Initialization happens after legacy data migration and only if the configuration file does not exist. Existing on/off choices, legacy files and unreadable files are not overwritten. Existing teammates and departments continue to use their original IDs and stored customizations. Saved menu expansion preferences are respected.

The collapsed sidebar now shows only the expand button. The expanded sidebar retains search.

The bilingual User Guide adds company installation, private chats, AI teammate/department management, group creation, mentions/coordinator behavior and delegated collaboration. The image chapter explains model selection, prompts, fee confirmation, direct display and original-order recovery. Guests can also open the guide from their account menu.

Root TypeScript checking and desktop build passed. All 156 portable tests passed. Actual Electron main/preload/React/IPC acceptance passed for a completely empty profile, an existing profile with Company explicitly disabled, and the full English/Chinese company flow (group titles, unchanged saves, custom edits and department member Add/Move/Remove). Fresh-profile acceptance verifies no automatic team installation, then explicitly clicks Install and verifies six teammates and four departments. The real guide is opened and both new chapters are clicked in English and Chinese. First-run acceptance blocks outgoing network requests. See `ui/` and `portable-tests.txt`.

No image capability or price was changed in this release. GPT Image 1 remains low/medium only. Full desktop TypeScript retains its known unrelated baseline errors; this report does not claim that baseline passed.

## Published release

Version 1.7.44 was published on 2026-10-07 at 22:28:45 Asia/Shanghai, from tag commit `f59163754167a4881bd54e36d79989863d115866`. Build run `37634755400` passed on Windows, macOS and Linux. The Windows installer passed Authenticode validation. All 15 release files were transferred and verified; seven complete binaries were downloaded and verified against manifest SHA512, and all five installers matched their GitHub SHA256 digests. Four website download redirects point to regional Aliyun OSS. Compatibility run `37635976441` updated the three legacy feeds to absolute OSS URLs. Temporary private upload maps were removed before publication, leaving 15 normal public assets.

Temporary OSS upload acceleration was restored to disabled by successful run `37637041095`; public download URLs remain unchanged. The bilingual announcement was published at 22:29:14 Asia/Shanghai after the release, with its history and audit entry in the same transaction. The live public announcement API matched all five intended fields and its saved version. See `announcement.json`, `announcement-publication.json`, `release-build.json`, `release-transfer.json`, `release-downloads.json`, `release-compatibility.json`, `release-publication.json`, `windows-signature.txt` and `oss-upload-path.txt`.
