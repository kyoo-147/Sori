# Native Windows desktop-shell E2E

Sori's native shell is verified with the built Tauri executable, not browser
preview, mocked Tauri calls, screenshots alone, or historical PASS output. Run
from an interactive Windows desktop session:

```powershell
npm install
npm run e2e:desktop-native
```

The harness builds and launches the real `sori-desktop.exe`, refuses a stale
owner of `127.0.0.1:17373`, records the executable PID, and targets its real
HWND. Before every mouse action it focuses the HWND and verifies that the
foreground-window PID is still the desktop PID immediately before the first
mouse event. A focus-policy or shared-overlay conflict is an explicit `SKIP`,
not a browser success.

The executable flow verifies:

- native maximize click, `IsZoomed` state, and larger native dimensions;
- native restore click and minimize click/state, followed by restore;
- a maximize click at the nested SVG/path center so titlebar dragging cannot
  steal the button action;
- sidebar collapse and main-workspace expansion, with before/after native PNGs;
- sidebar pointerdown, repeated pointermove, and pointerup resizing, with
  before/after native PNGs;
- native close click and Tauri process exit;
- no default `WS_CAPTION`, launch geometry, native move/resize, and `720x480`
  minimum sizing.

Inspectible artifacts are written to the ignored `.tmp/e2e-native-shell/`:
`05-sidebar-expanded.png`, `06-sidebar-collapsed.png`,
`07-sidebar-before-resize.png`, and `08-sidebar-after-resize.png` supplement
the launch/geometry captures. `native-e2e.log` records environment skips and
`visual-review-manifest.json` contains the real
window dimensions, SHA-256 hashes, ordered assertions, and
`visualReview: "pending"`; screenshots are evidence for human inspection, not
human approval by hash.

This shell E2E does not prove microphone capture, Whisper inference, global
hotkeys, overlay delivery, or OS text injection. On non-Windows hosts it emits
an explicit Windows/environment `SKIP`.
