# Native Windows desktop-shell E2E

Sori's native shell must be verified with the actual Tauri executable, not only
through browser automation. Run this from an interactive Windows desktop
session:

```powershell
npm install
npm run e2e:desktop-native
```

The executable check builds the real `sorid` daemon and Tauri debug app, refuses
a stale daemon on `127.0.0.1:17373`, launches `sori-desktop.exe`, and verifies:

- the runtime Win32 style has no `WS_CAPTION` default frame or duplicate caption;
- the custom minimize, maximize/restore, and close controls work through native
  mouse input;
- dragging the custom titlebar moves the real window;
- a bottom-right native resize drag grows the real window;
- shrinking the real window cannot pass the configured `720x480` minimum;
- screenshots are captured at launch, dragged, resized, and minimum-size window
  geometry.

Screenshots and `visual-review-manifest.json` are written to the ignored
`.tmp/e2e-native-shell/` directory. The manifest records each artifact's real
window dimensions, SHA-256, assertions, and `visualReview: "pending"`; a human
must review the PNGs for clipping, duplicate chrome, and visual quality.

The command prints `SKIP` on non-Windows hosts because Win32, WebView2, and
interactive screenshot capture are unavailable. A stale daemon is a hard
failure. This test does not prove microphone capture, Whisper inference, global
hotkeys, overlay delivery, or OS text injection.
