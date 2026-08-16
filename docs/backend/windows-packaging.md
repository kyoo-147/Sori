# Windows packaging and daemon lifecycle

The Windows bundle is intentionally split into two proofs:

- **Packaging proof:** `npm --prefix apps/desktop run tauri build` produces the
  configured NSIS/MSI bundle, and the release build includes `sorid.exe` as a
  resource.
- **Voice proof:** a bundle and a healthy daemon do not prove microphone capture,
  physical hotkey delivery, Whisper inference from a microphone, focused-app
  targeting, or text injection. Those remain `UNVERIFIED` until the native voice
  matrix passes.

## Build contract

From the repository root, install frontend dependencies and run:

```powershell
npm --prefix apps/desktop install
npm --prefix apps/desktop run tauri build
```

Tauri runs `build:bundle`, which builds the frontend and `sorid` in release mode.
`apps/desktop/src-tauri/tauri.conf.json` packages the release-built `sorid.exe`
as a flat `sorid.exe` resource (staged into the ignored Tauri resource path by
`prepare-desktop-bundle.mjs`). Keeping the destination flat is required: the
installed desktop resolves the daemon from its Tauri resource directory and
emits NSIS and MSI targets. Do not package Whisper executables or model files:
they are user-managed prerequisites and must be installed with their own license
and checksum evidence. **Automatic desktop updates are not shipped in the MVP.**
The Tauri updater plugin, update endpoint, and release-signing public key are
intentionally absent. Installers are manually distributed for this release
scope; do not describe an NSIS/MSI build as update-capable. Configure Whisper
with `SORI_WHISPER_CPP_BIN`,
`SORI_WHISPER_MODEL_DIR`, and `SORI_WHISPER_MODEL` (or the restart-persistent
user-owned `whisper.json`).

## Launch and cleanup

At startup the wrapper looks for `SORI_DAEMON_PATH`; otherwise it looks for a
`sorid.exe` beside the desktop executable and then under its Tauri `resources`
directory. If loopback endpoint `127.0.0.1:17373` is already occupied, the
wrapper refuses to launch an unknown daemon. This avoids killing or attaching to
a stale/unrelated owner. Inspect the owner before cleanup:

```powershell
Get-NetTCPConnection -LocalPort 17373
Get-Process -Id <OwningProcess>
```

A daemon launched by the wrapper is tracked as its child and terminated on a
normal desktop exit. An unavailable or missing executable leaves the shell
running offline and reports the path in native logs; it is not represented as
voice readiness. Crash restart is intentionally not automatic yet. A later IPC request does not
relaunch a missing child; recovery is a user-requested desktop restart after correcting the
executable/configuration. The acceptance `restart` phase performs that explicit relaunch twice
and correlates cleanup only to its own ownership lease; it does not kill an unknown endpoint owner.

The daemon continues to own SQLite and its restart-persistent Whisper JSON
configuration. On Windows the default database is `%LOCALAPPDATA%\Sori\sori.db`,
outside the replaceable install directory. Uninstall cleanup must not delete
user history, model files, or explicit configuration without a separate
user-confirmed migration policy.

## License references

- Sori workspace metadata declares MIT: <https://github.com/kyoo-147/Sori>
- Tauri bundle configuration: <https://v2.tauri.app/distribute/windows-installer/>
- Tauri sidecar/resource guidance: <https://v2.tauri.app/develop/sidecar/>
- whisper.cpp upstream license and release artifacts:
  <https://github.com/ggerganov/whisper.cpp>

A release checklist must carry the exact Whisper executable/model source,
checksum, and applicable upstream license notice. A successful Tauri build is
not evidence that those optional runtime prerequisites are installed.

## Contract checks and Windows acceptance

Run the deterministic source/configuration check from any host:

```sh
npm run test:windows-packaging
```

On a real Windows machine, run the safe artifact check against the **bundle
root** (the directory containing the generated NSIS/MSI artifacts). It never
installs or uninstalls anything, and it refuses to launch if another process
owns the loopback endpoint:

```powershell
.\scripts\windows-packaging-acceptance.ps1 -BundleRoot .\apps\desktop\src-tauri\target\release\bundle
```

After separately installing the MSI or NSIS artifact, pass the **installed
root** (the directory containing the installed `Sori.exe` and `sorid.exe`
resource) to verify the product. The bundle root is still required because the
script always checks the artifact boundary. Use the valid `-Phase launch`
parameter for a manual Windows run:

```powershell
.\scripts\windows-packaging-acceptance.ps1 -BundleRoot .\apps\desktop\src-tauri\target\release\bundle -InstalledRoot "$env:LOCALAPPDATA\Sori" -Phase launch
```

After uninstalling and reinstalling manually, run the acceptance script with
`-Phase reinstall -InstalledRoot <path> -DataRoot <user-data-path>` to verify
the user-owned SQLite file remains. The script does not claim installer
execution, signing, elevation, automatic crash recovery, microphone capture, Whisper
inference, or focused application injection. Those require real Windows
evidence and remain `UNVERIFIED`/`SKIP`; it never kills an unknown endpoint
owner or deletes user data.
