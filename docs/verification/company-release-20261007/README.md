# Company defaults and sidebar release, 2026-10-07

Version 1.7.44 includes the accepted one-person company and all four hosted image models from 1.7.43. The user confirmed successful real generations with all four models before requesting this release and announcement.

Fresh profiles initialize the free chat provider and explicitly enable My Company, with its menu initially collapsed. No team is installed automatically. The company title opens an empty operation page; Add teammate → Wuwei One-Person Company → Install explicitly adds the six-member team with CEO Office, Engineering, Design and General Affairs. Initialization happens after legacy data migration and only if the configuration file does not exist. Existing on/off choices, legacy files and unreadable files are not overwritten. Existing teammates and departments continue to use their original IDs and stored customizations. Saved menu expansion preferences are respected.

The collapsed sidebar now shows only the expand button. The expanded sidebar retains search.

The bilingual User Guide adds company installation, private chats, AI teammate/department management, group creation, mentions/coordinator behavior and delegated collaboration. The image chapter explains model selection, prompts, fee confirmation, direct display and original-order recovery. Guests can also open the guide from their account menu.

Root TypeScript checking and desktop build passed. All 156 portable tests passed. Actual Electron main/preload/React/IPC acceptance passed for a completely empty profile, an existing profile with Company explicitly disabled, and the full English/Chinese company flow (group titles, unchanged saves, custom edits and department member Add/Move/Remove). Fresh-profile acceptance verifies no automatic team installation, then explicitly clicks Install and verifies six teammates and four departments. The real guide is opened and both new chapters are clicked in English and Chinese. First-run acceptance blocks outgoing network requests. See `ui/` and `portable-tests.txt`.

No image capability or price was changed in this release. GPT Image 1 remains low/medium only. Full desktop TypeScript retains its known unrelated baseline errors; this report does not claim that baseline passed.
