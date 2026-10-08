# Default team bilingual localization — isolated delivery

Base: 6747980a701b96d1919e801a419185b28c0ba7cc.
Worktree: E:/git/wuwei-team-i18n; branch: feature/default-team-i18n.

| Template ID | Canonical | English display/alias | Title |
|---|---|---|---|
| wj-ceo | 小笨 | Ben | CEO |
| wj-copy | 小文 | Wendy | Copywriter |
| wj-code | 小码 | Cody | Software Engineer |
| wj-data | 小数 | Dana | Data Analyst |
| wj-design | 小美 | Mia | Designer |
| wj-mobile | 小移 | Ivy | Mobile Designer |

Only matching stable template IDs with fromApp=wuwei-team-basic qualify. Each field must still equal its catalog baseline. Custom edits, generated IDs, missing provenance and custom packs are preserved. Catalog previews explicitly use pack provenance. No migration or uninstall is required for qualifying existing records. Canonical stored names, IDs, membership references, memories and historical messages remain unchanged.

English presentation covers pack content, employee cards, sidebar, selectors, avatars/tooltips and current roster. Search accepts displayed names and canonical names. Editing deliberately opens canonical records so Save does not accidentally persist localized text. User departments are not translated and no default departments are created.

DM/assignment/update/delete/member/group/schedule references accept canonical names, stable IDs and unchanged-default aliases through one resolver. Multiple matching identities fail closed; mention candidates use the same uniqueness checks and deduplicate IDs. CEO detection preserves title/configured-ID behavior and canonical-name fallback. English tool descriptions are shared with UI; English schemas remove untranslated descriptions while retaining validation fields.

Prompt assembly localizes only unchanged default identity content after reading persona files. Custom persona files and memories are preserved. English response instruction and stable-ID roster are appended. English group/DM/CEO scene instructions are provided. Existing agent language refresh uses the existing settings:set-app system/tool refresh path. No actual model requests were sent; reply behavior and Electron interaction still need acceptance testing.

Tests: node_modules/.bin/tsx --test tests/default-team-localization.test.ts (7 pass). Root tsc passes. Desktop tsc has 16 baseline diagnostics, unchanged apart from locations. electron-vite build passes. Logs under docs/verification/default-team-i18n.

Integration is NOT performed: shared dirty index.ts/App.tsx/agent files and updater changes require CEO-coordinated merge review. Shared node_modules is used as a read-only dependency link; no dependency installation or manifest modification. No default-enable setting changes, real team writes, package installation, restart or release.

Known boundaries: English personas are reviewed-content candidates, not byte-for-byte translations; review their scope alongside the original templates. Generated/rebuilt employees such as a manually recreated 小码 are deliberately not auto-translated. Editors show canonical/custom fields by design. Historical speaker names/text remain original. There is no localization of arbitrary custom department, room, task or imported pack content.
