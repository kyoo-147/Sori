# Desktop E2E matrix

Run the Windows-only matrix from an interactive desktop session:

```powershell
npm install
npm run e2e:desktop-matrix
```

The executable matrix builds the real `sorid` daemon and Tauri debug app, refuses
an already-owned loopback endpoint, starts both processes, and uses
`open-computer-use@0.3.1` semantic actions against the rendered WebView2 UI.
It covers:

- real daemon IPC remaining healthy while the desktop is exercised;
- semantic Home → Transcripts navigation;
- Desktop, Tablet, and Mobile preview controls;
- Empty, Loading, and Error transcript fixtures;
- recovery/error copy for a destructive or unavailable operation without
  pretending that it succeeded;
- PNG screenshots for each viewport and state;
- `.tmp/e2e-matrix/visual-review-manifest.json`, which records SHA-256 hashes,
  state/viewport labels, and a `review: pending` human visual-review gate.

A successful run proves only these shell, IPC, semantic UI, and rendered-state
boundaries. It does **not** prove microphone capture, Whisper inference, global
hotkey handling, overlay delivery, or OS text injection. Those remain explicit
manual/unsupported boundaries and must not be inferred from this matrix.

The command prints `SKIP` on non-Windows hosts because native Tauri/WebView2 and
interactive screenshot capture are unavailable there. A stale daemon is a hard
failure rather than a test target.
