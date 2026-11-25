Includes the GPT-6.2 model and per-model reasoning settings introduced in 1.7.83.

Fixes Codex reporting missing authorization immediately after a successful ChatGPT login. Existing conversations now read current credentials for each request, and login refreshes Codex conversation providers while preserving each conversation's model and reasoning setting. Successful authorization invalidates stale connection checks, refreshes connectivity, and clears the authorization banner. Canceling login keeps the recovery action available.

Validation covers credential rotation on already-created providers, independent models and reasoning settings, successful and canceled login in the built renderer, and the release test suite.
