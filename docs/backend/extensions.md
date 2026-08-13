# Extensions runtime boundary

Extensions are persisted by `sorid` in SQLite and are never represented as frontend-only state. The IPC operations are `ExtensionsList`, `ExtensionInstall`, `ExtensionEnable`, `ExtensionDisable`, `ExtensionUninstall`, and `ExtensionInvoke`.

## Manifest and security

A manifest requires an id, name, version, relative non-traversing entrypoint, permissions, and license evidence (`license` plus optional URL/hash). IDs are lowercase ASCII. The daemon allowlists permissions (`network`, `filesystem.read`, `filesystem.write`, `shell`, `dictation`, `events`) and rejects unknown permissions before persistence.

Install always starts `disabled`. Enable/disable/uninstall are persisted and survive daemon restart. SQLite is authoritative; the desktop client uses IPC and does not write extension state to localStorage.

`ExtensionInvoke` deliberately returns `execution_unavailable` until an isolated extension host is installed. It must not claim success. The future host must be a separate process with an explicit capability broker, per-extension permission grants, bounded input/output, cancellation, timeout, resource limits, and failure containment. Extension crashes must not take down `sorid` or the dictation path.

## License and reference policy

Manifest license metadata is required at install time. Sori does not copy reference implementation code or assume marketplace trust. Any future bundled adapter must record its SPDX/license evidence and source URL in its manifest and be reviewed for dependency and process-isolation risk.
