# Native desktop E2E smoke

Sori uses a Tauri desktop shell. Browser automation alone is not enough to prove the desktop app starts, so the native smoke test launches the actual Tauri debug executable.

## Tooling

Installed locally on the dev machine:

```sh
cargo install tauri-driver --locked
```

For WebView2/WebDriver experiments on Windows, the repo also has desktop dev dependencies:

```sh
npm --prefix apps/desktop install -D @tauri-apps/cli webdriverio edgedriver
```

The current reliable native smoke test uses process/window checks instead of WebDriver clicks because it does not require captain interaction or a stable visible desktop session.

## Command

```sh
npm run e2e:desktop-native
```

It performs:

1. Builds `sorid`.
2. Builds the Tauri debug desktop app.
3. Starts real `sorid`.
4. Waits for `http://127.0.0.1:17373/ipc` to return `Status`.
5. Launches `apps/desktop/src-tauri/target/debug/sori-desktop.exe`.
6. Verifies the native window title `Sori` appears.
7. On Windows, brings the window to the foreground and performs real OS mouse clicks against the app window: Transcripts nav, Diagnostics/System area, and a top action region.
8. Verifies daemon status is still `running` while the desktop process is alive after those clicks.
9. Terminates both processes.

This proves the real desktop shell launches, accepts native mouse input, and stays connected to a real backend daemon. It does not yet test OS hotkey, microphone, overlay, or text injection.

## Manual stronger checks

When a richer GUI automation/use-computer tool is available, extend this test to assert rendered text after each click and capture screenshots for visual diffing. The current test already performs real OS-level clicks, but it verifies stability/backend connectivity rather than DOM content.
