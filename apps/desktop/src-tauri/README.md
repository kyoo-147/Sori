# Native desktop wrapper

This directory contains the Tauri v2 wrapper, the `sori_ipc` command, and the
Windows daemon supervisor. The command forwards canonical `sori-ipc` JSON
requests to the loopback daemon and returns canonical JSON responses; it does
not expose daemon capabilities to React directly. The frontend uses this
command first, then HTTP, then mock preview data when running outside Tauri.

On native startup the wrapper launches a sibling `sorid.exe`, or the path in
`SORI_DAEMON_PATH`, only when the loopback endpoint is not already occupied. It
tracks and terminates only the child it launched. An occupied endpoint is never
force-killed because it may belong to a stale or unrelated process.

Native builds are intentionally not part of the default CI path. Windows
packaging is configured for NSIS/MSI and builds `sorid.exe` as a resource; see
`docs/backend/windows-packaging.md`. Signing and physical voice verification
remain separate release gates.

## Custom Windows title bar

The native window decorations are disabled atomically in `tauri.conf.json`.
`DesktopTitleBar` owns drag, double-click maximize/restore, and accessible
minimize, maximize/restore, and close controls through registered Tauri
commands. Browser preview keeps these controls inert; native behavior is
covered by the titlebar source and configuration tests. Window dimensions in
`tauri.conf.json` are logical pixels, so the native minimum size remains stable
when Windows moves the window between DPI-scaled monitors.
