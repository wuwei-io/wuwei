# Isolated renderer interaction acceptance

Run from this worktree: `node scripts/run-team-ui-harness.mjs`.
Uses existing Vite/Electron dependencies; installs nothing. Builds actual AppStore and EmployeeEditModal into a disposable directory and runs them in Electron with mock IPC. This is NOT the complete application's Electron main/App integration acceptance.

Launcher overrides HOME, USERPROFILE, APPDATA and LOCALAPPDATA only for its child. Bootstrap imports only Electron and Node builtins, checks os.homedir, sets/checks Electron userData beneath the unique temporary root, prints the probe, then loads the renderer fixture. It never imports application main/preload, store, scheduler, relay or authentication modules. External renderer requests are cancelled; chat mock throws. Template JSON is bundled read-only; all employee saves stay in fixture memory. No real team data or credential files are used. Temporary built output/profile is retained for inspection; a subsequent run uses a new root.

Actual click coverage: six cards; team pack/description/roster; actual edit modal; unchanged save; custom name input/save; switch Chinese; switch with open editor. English/Chinese alias resolution uses the real resolver inside renderer, not live model tool dispatch. Sidebar/selector shown in screenshots are explicitly fixture components using real localization helper, NOT full App.tsx sidebar/settings. Full App sidebar, settings member pickers, group/schedule UI and real main-process tool routing remain unverified interactively.

Evidence: interaction.txt and four capturePage PNGs. Chromium ran offscreen, real React DOM click/input handlers and mock IPC were executed.

Typecheck evidence is in ../typecheck: base.txt is the prior independently archived 6747980 baseline from the last acceptance round; current.txt was freshly executed this round. Run `node scripts/compare-team-typecheck.mjs` to normalize checkout path and line/column positions and compare complete diagnostics. Both have 16 errors; normalized diff empty. Desktop typecheck does NOT pass. Root tsc passed this round.
