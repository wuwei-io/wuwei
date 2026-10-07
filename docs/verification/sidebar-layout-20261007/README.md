# Sidebar divider fix, 2026-10-07

Version 1.7.45 fixes an expanded company panel height being applied when its menu is collapsed. Collapsed panels use their content height, so the divider snaps below the company menu and chat history reclaims the space. Expanding restores the saved preferred height. The separator supports dragging up and down; dragging down from the collapsed state expands the panel after an eight-pixel threshold. Double-click restores automatic sizing. Saved expanded heights remain bounded by 72vh after a window resize. A collapsed company also remains compact when chat history is hidden.

Desktop build and actual Electron main/preload/React/IPC acceptance passed. The isolated `--sidebar-layout` run exercises upward and downward mouse dragging, collapsed snap with a persisted height, restoration, dragging from collapsed, double-click reset, viewport shrink and chat-panel hiding. No real user profile or image order was modified. Evidence is in `ui/`.
