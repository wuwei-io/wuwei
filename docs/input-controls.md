# Input controls and local Qwen trial

The optional hosted `qwen3-4b-local-trial` model now runs with 131072 tokens of
context on its existing local backend alias. It remains an optional free model;
the anonymous default is unchanged. Its 1536-token output cap and one local
generation slot remain in place. Context capacity does not increase concurrency.

Settings now provides immediate, persistent controls:

- **System prompt:** enable/disable the global/provider base prompt without
  overwriting the saved template. Expand the input breakdown to inspect runtime
  guidance and its character counts.
- **Memory:** enable/disable global long-term memory injection and `remember`.
  Saved memory is retained. Existing conversation history and employee-specific
  memory are separate and remain visible in their own editors.
- **Tools:** master switch, enable all, disable all, source-group checkboxes and
  individual checkboxes for built-in, browser, team and connected MCP tools.
  Disabled tools are omitted from requests and rejected at execution. A change
  during pending approval is rechecked before execution. Background agents also
  recheck the global filter on later steps. An operation already running finishes.
  Enabling tools does not bypass existing permissions, module availability,
  provider capabilities or employee allowlists.

The preview counts characters, not model tokens. It covers the current global
prompt, selected tool definitions and automatic image/language guidance. History,
tool results, attachments and employee instructions add their own input. Vault
guidance and response-language guidance remain present; disabling the base
prompt does not turn off secret protection. New labels are in Chinese and English;
other locales currently use English for these additions.

The model picker labels this exact hosted free trial as text-only and without a
daily request quota. Other free models retain their existing quota labels. The
guest account panel uses the selected trial's policy rather than claiming that
every free model has daily limits.

## Validation on 2026-11-22

- Existing installed Wuwei 1.7.77, isolated profile with no account credentials:
  selected the free trial; normal greeting succeeded after the context increase;
  created `sum-even.mjs` through the real `write_file` tool. Independent checks
  passed for empty, ordinary and negative-number inputs. No blocking registration,
  recharge or quota modal occurred during either task.
- Measured default desktop request: 50 tools, 21000 tool-schema characters,
  approximately 1950 system characters and 9.7K actual input tokens. Team tools
  were among the largest definitions. The old 8K runtime could not accept this.
- Native settings UI: disabling `write_file` changed 50 tools to 49; disabling all
  changed tool definitions to the empty list. Turning off base prompt and global
  memory retained their stored contents and reduced the preview to 253 system
  characters. A real anonymous chat used 182 input tokens and returned normally.
- Preferences persisted across a full restart. The packaged test edition starts
  independently and displays `Free · No daily request quota` / the Chinese
  equivalent for the trial, with no login lock.
- 26 focused tests pass, including actual Agent requests, execution revocation,
  background-agent revocation, context limits and unchanged guest defaults.
  Core typecheck, renderer typecheck, localization check and desktop build pass.
  The separate main-process typecheck has a pre-existing `unknown` JSON access in
  `desktop/main/video-studio.ts:25`; this unchanged file is outside this change.

These controls are in the local test build on `fix/qwen-trial-context`; no public
client release or replacement of the user's installed client was performed.
