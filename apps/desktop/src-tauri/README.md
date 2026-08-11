# Native desktop wrapper

This directory contains the Tauri v2 wrapper and the `sori_ipc` command. The
command forwards canonical `sori-ipc` JSON requests to the loopback daemon and
returns canonical JSON responses; it does not expose daemon capabilities to
React directly. The frontend uses this command first, then HTTP, then mock
preview data when running outside Tauri.

Native builds are intentionally not part of the default CI path. Packaging,
signing, and platform-specific daemon endpoints remain separate work.
