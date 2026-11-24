# Desktop update sources

GitHub Releases remains the authoritative signed release. Windows and macOS
clients probe GitHub and the separate `updates-cn/` feed with a six-second
deadline, choose the highest stable version (then fastest source), and leave
version comparison, SHA-512 validation and download caching to electron-updater.
A failed download may retry the other source only for the same version.
The existing two-hour polling, retry limits and explicit install action remain.
Linux retains its last release and GitHub feed. Test/minicc editions retain
their own update behavior.

The China installer mirror workflow also copies Mac update ZIPs and available
blockmaps to immutable `installers/<version>/` keys. It verifies GitHub SHA-256,
public full GET hashes, sizes and Range responses before publishing separate
`updates-cn/latest.yml` and `updates-cn/latest-mac.yml` pointers. SHA-512 fields
must match the actual mirrored bytes. The website's three-installer readiness
marker is preserved. Existing `updates/`, R2 compatibility feeds and GitHub
release assets are unchanged.

Run `china-download-mirror.yml` manually to backfill the latest published
release. Normal future releases trigger it automatically. If the mirror lags,
the new client selects the newer reachable GitHub release; it never renumbers
an old payload to the current version.

An already installed client that cannot reach GitHub cannot obtain this fix
through GitHub itself. Its external `resources/app-update.yml` can be backed up
and pointed to `https://wuwei-repo.oss-cn-hangzhou.aliyuncs.com/updates-cn/`.
That configuration is loaded on the next application start; do not modify the
signed ASAR or installer. Normal explicit update installation then obtains the
new client with both sources. Do not claim a running process has adopted a
configuration file change until its next start has been verified.
