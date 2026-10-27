# Video studio fixes — 2026-10-25

The new creation action clears the current prompt and references and shows the initial video workspace. It retains prior works and active server jobs; the history action returns to them. Remounting the video workspace does not replay an old new-creation event.

The editor shares the results column, stays in normal document flow and expands on click or keyboard focus. Hover does not expand it. Frame labels have horizontal padding. Portrait cards fit their aspect ratio instead of leaving an empty right half.

Premium eligibility refreshes after membership changes, window focus and periodically. Clicking a previously locked model rechecks server eligibility before showing upgrade. Expiring catalog credentials use the existing session refresh path. Server authorization remains authoritative.

Existing private video decodes under the media CSP. Verified local cache manifests remove the metadata network dependency on repeat opens; account-scoped private URLs still reject cross-account access. Content downloads remain size and SHA256 checked. Failed initial history loads retry automatically; frequent parent renders no longer reset polling timers. Successful recovery clears the history error.

The billing catalog reads the enabled video catalog, includes its 19 models in All and Video, supports search and membership crowns, and routes explicit video choices to the video studio without creating a generation or payment order. Existing trial plan layout changes in the active app were preserved during scoped integration.

Validation: 18 isolated UI checks, 11 IPC/CSP checks, TypeScript, localization and desktop build. Live read-only verification decoded the user's existing completed video and preserved all 31 sessions, current model settings, video draft and favorites. Repeat cached asset resolution took under 2 ms locally; this is not a claim about first-download network speed. No paid generation, charge, checkout or real-account favorite mutation was performed.

Evidence: outputs/video-fixes-20261025/ in the shared workspace (test fixtures and logs are outside this repository). The currently running test app was updated and restarted once for the main-process cache and session changes.
