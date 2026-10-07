# Company defaults and sidebar release, 2026-10-07

Version 1.7.44 includes the accepted one-person company and all four hosted image models from 1.7.43. The user confirmed successful real generations with all four models before requesting this release and announcement.

Fresh profiles initialize the free chat provider and explicitly enable My Company. First boot installs the standard six-member team with CEO Office, Engineering, Design and General Affairs. Initialization happens after legacy data migration and only if the configuration file does not exist. Existing on/off choices, legacy files and unreadable files are not overwritten. Existing teammates and departments continue to use their original IDs and stored customizations.

The collapsed sidebar now shows only the expand button. The expanded sidebar retains search.

Root TypeScript checking and desktop build passed. All 156 portable tests passed. Actual Electron main/preload/React/IPC acceptance passed for a completely empty profile, an existing profile with Company explicitly disabled, and the full English/Chinese company flow (group titles, unchanged saves, custom edits and department member Add/Move/Remove). Fresh-profile acceptance uses actual boot-time team installation, not fixture employees. First-run acceptance blocks outgoing network requests. See `ui/` and `portable-tests.txt`.

No image capability or price was changed in this release. GPT Image 1 remains low/medium only. Full desktop TypeScript retains its known unrelated baseline errors; this report does not claim that baseline passed.
