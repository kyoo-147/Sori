# Desktop E2E with Open Computer Use

This smoke test uses the open-source `open-computer-use` CLI to operate the real Sori Tauri desktop window through the logged-in Windows desktop session.

Run:

```sh
npm run e2e:desktop-ocu
```

The script:

1. Builds `sorid`.
2. Builds the Tauri debug desktop app.
3. Starts real `sorid` and waits for loopback IPC at `127.0.0.1:17373/ipc`.
4. Launches `sori-desktop.exe`.
5. Uses `npx -y open-computer-use@0.3.1` to run a Computer Use sequence:
   - `get_app_state` for `sori-desktop`.
   - Clicks once on the app surface to hydrate the WebView2 accessibility tree when needed.
   - Asserts the accessibility state includes `Sori is ready` and the Transcripts button.
   - Clicks the Transcripts button by `element_index`.
   - Asserts the accessibility state includes `Transcripts Timeline`.
   - Clicks the Diagnostics button by `element_index`.
   - Asserts the accessibility state includes `11-Point System Integrity Check`.
6. Verifies the daemon still reports `running`.
7. Terminates desktop and daemon processes.

Why this exists:

- `tauri-driver` was installed and explored, but in this environment WebDriver attached to `about:blank` instead of the rendered Tauri DOM.
- `open-computer-use` can see the WebView2 accessibility tree on Windows and exposes real text/buttons from the Sori desktop UI.
- This gives a stronger native E2E than screenshot hash checks alone: it performs desktop clicks and asserts semantic screen text.

Notes:

- The test is Windows-first and skips on other platforms for now.
- It uses the real logged-in desktop session. Do not run it on a machine where moving/clicking the active UI would be unsafe.
- It still does not validate microphone capture, global hotkey, overlay, tray menu clicks, or OS text injection into third-party apps.
