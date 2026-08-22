# Wave 6 installed real-Whisper vertical

`scripts/windows-wave6-installed-real-e2e.ps1` is a fail-closed installed
Windows acceptance path. It uses an installed desktop and bundled daemon, plus
existing user-owned `whisper-cli.exe`, `ggml-base.en.bin`, and a verified SAPI
WAV corpus.

Packaging does not install `sori.exe`; restart persistence is read through
canonical loopback IPC. The separately labeled latest built CLI is used only to
run the canonical benchmark against the manifest reference. The report keeps
the manifest reference, actual provider transcript, WER/CER, latency, and raw
benchmark line. No quality pass threshold is invented.

The harness requires an absolute daemon executable, sets a unique absolute
`SORI_DAEMON_OWNER_PATH` under `DataRoot`, and verifies endpoint, exact daemon
payload hash, length, file version, PID, process creation time, and lease
generation.
The default freshness payload is the repository `target\debug\sorid.exe`, which
`scripts/prepare-desktop-bundle.mjs` stages from freshly built
`target\release\sorid.exe` and which Tauri packages as its resource.
The harness-generated source, binary, and target file are unique children of
the absolute `DataRoot`, preventing stale or concurrent target reuse. The
foreground gate joins the current thread temporarily to both the target and
actual foreground input threads, restores every attachment in `finally`, and
refuses injection unless the target PID and EDIT child are confirmed
foreground/focused. Cleanup is PID/start-time/executable/generation safe and
aggregated before the artifact can be VERIFIED. It requires a nonblank
real transcript, then requires owned EDIT readback, SQLite history, and restart
history to preserve that actual transcript exactly. The manifest reference is
not used as an exact ASR-equality gate.

```powershell
npm run e2e:windows-wave6-real -- `
  -InstalledDesktopExecutable "$env:LOCALAPPDATA\Programs\Sori-Acceptance\sori-desktop.exe" `
  -DaemonExecutable "$env:LOCALAPPDATA\Programs\Sori-Acceptance\sorid.exe" `
  -FreshPackagedDaemon .\target\debug\sorid.exe `
  -CorpusDirectory .\.tmp\audio-corpus `
  -BenchmarkCli .\target\release\sori.exe
```

A successful run writes the configured report. If the latest build/install or
assets are unavailable, the run remains BLOCKED and makes no VERIFIED claim.
SAPI playback is synthetic/local fixture input, not physical microphone or
physical hotkey proof; frontend visual refresh is not claimed.

## Evidence boundary for the installed run

`CREATE_NO_WINDOW` hardens the whisper.cpp console sidecar against console-side
activation; it does not explain or prevent every foreground change. In the
latest full run, PID `14704` was confirmed to be Chrome, not whisper.cpp. The
remaining Chrome foreground change is an external OS/session prerequisite, so
the installed vertical remains **BLOCKED** and is not claimed **VERIFIED**.
