# Worker J — packaging/runtime UX standalone report

**Status:** COMPLETE — direct PR opened: https://github.com/kyoo-147/Sori/pull/109
**Branch:** `worker-j-packaging-runtime-ux`
**Commit:** `d12661f feat(desktop): supervise bundled daemon on Windows`

## Scope delivered

- Added Tauri daemon supervision in `apps/desktop/src-tauri/src/lib.rs`.
  The wrapper accepts `SORI_DAEMON_PATH`, otherwise checks the executable beside
  the desktop binary and its Tauri `resources` directory.
- Refuses to launch when `127.0.0.1:17373` is already occupied. It never kills
  or adopts an unknown process, preserving stale-daemon ownership safety.
- Tracks only the child launched by this desktop process and terminates that
  child during normal Tauri exit.
- Enabled Windows `nsis` and `msi` bundle targets in
  `apps/desktop/src-tauri/tauri.conf.json`.
- Added `scripts/prepare-desktop-bundle.mjs` and the `build:bundle` script to
  build release `sorid` and stage it for Tauri resources.
- Added `docs/backend/windows-packaging.md` covering installer prerequisites,
  cleanup/config ownership, model installation boundaries, license references,
  and packaging versus voice proof.

## Evidence and validation

PASS:

- `cargo fmt --all -- --check`
- Tauri/package JSON parsing
- `node --check scripts/prepare-desktop-bundle.mjs`
- `git diff --check`
- Clean branch after commit/push
- GitHub PR 109 is open

BLOCKED environment checks:

- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` could not
  complete because the Windows disk ran out of space (OS error 112).
- `npm run desktop:check` could not run because dependencies were not installed;
  `tsc` was not available.

## Native/hardware boundary

This work proves packaging configuration and source-level daemon supervision
only. It does **not** prove a production installer was built or installed on a
Windows machine, native tray/startup registration, crash-loop recovery, Windows
permissions, physical global hotkey delivery, microphone capture, Whisper
inference from microphone audio, focused-app targeting, text injection, or
transcript persistence from a real voice session. Those remain
`UNVERIFIED`/`SKIP` until the Windows native voice and installer acceptance
matrix is run with inspectable executable/process evidence.

A successful Tauri build must not be reported as voice success. Whisper
executables/models remain separately installed, licensed, checksum-verified
user prerequisites.
