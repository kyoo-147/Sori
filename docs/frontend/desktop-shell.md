# Desktop shell architecture

The desktop frontend lives in `apps/desktop`. It is a React/Vite application
with a small, platform-neutral shell: title bar, navigation, workspace cards,
and a dictation control. The visual language follows the Sori design workspace
at `D:/work/sori-design` (warm pearl surfaces, restrained slate accent, and a
quiet Studio/sidebar layout) without coupling the runtime to that prototype.

## Platform strategy

- **Windows first:** ship the Vite UI inside a Tauri wrapper once native
  permissions, global hotkeys, tray behavior, and signing are ready. The
  daemon is a per-user process and Windows named-pipe IPC is the production
  transport.
- **macOS:** reuse the same React bundle and Tauri commands. Add microphone,
  accessibility, login-item, and global-hotkey permission flows; use a Unix
  domain socket for the daemon.
- **Linux:** reuse the shell and keep capabilities explicit. Package AppImage
  and/or distro formats after validating X11 and Wayland limitations for global
  hotkeys, active-window context, and text insertion.

`apps/desktop/src-tauri/tauri.conf.json` is a deliberately inactive, compatible
configuration scaffold. It has no Rust project or native dependency yet, so
root CI remains Node/Rust-only. Native bundling will be enabled separately
when signing and platform CI exist.

## Daemon boundary

The UI must not access audio, model files, or providers directly. It talks to a
`DaemonTransport` (`apps/desktop/src/transport.ts`) that exposes typed requests
and events. The initial `MockTransport` makes the shell usable in a browser and
in UI tests when `sorid` is absent. A production adapter can map the same
interface to Tauri `invoke` commands, while the daemon continues to own
microphone capture, transcription, routing, persistence, and permissions.

The transport should use the contracts in `crates/sori-ipc` and follow the
existing local IPC security model in `docs/local-ipc.md`: per-user endpoint,
bounded framed messages, OS peer authentication, no network listener, and no
microphone bytes or credentials in UI requests. Windows uses a named pipe;
macOS/Linux use a Unix socket. Connection loss is a normal state and should
produce an offline UI rather than block startup.

## Packaging plan

1. Develop and test the shell with `npm run desktop:dev` and
   `npm run desktop:check` using mock transport.
2. Add the generated Tauri Rust wrapper and platform-specific capability files;
   keep the wrapper thin and launch/supervise `sorid` as a sibling bundled
   executable.
3. Build signed Windows MSI/NSIS artifacts first, including daemon migration
   and uninstall cleanup. Then add macOS app/DMG signing and notarization.
4. Add Linux AppImage/deb artifacts after hotkey and text-injection behavior is
   documented per compositor.

The frontend build is independently deployable (`npm --prefix apps/desktop
run build`), while `npm run check` at the repository root remains the required
server and test validation.
