# Wave 6 installed real-Whisper vertical

`scripts/windows-wave6-installed-real-e2e.ps1` is the strongest fully automatable
installed Windows path. It consumes only an existing installed desktop, bundled
`sorid.exe`, installed `sori.exe`, user-owned `whisper-cli.exe`,
`ggml-base.en.bin`, and a corpus verified by
`scripts/windows-audio-fixture-corpus-verify.ps1`.

It uses a unique loopback port and SQLite root, verifies the SAPI manifest and
fixture SHA-256, sends the fixture through canonical `DictationAudio` and the
real whisper.cpp provider, targets only a harness-owned Win32 EDIT HWND/PID,
checks visible readback and persisted history, then relaunches the installed
product and reads history through the installed CLI. The report records model
and fixture hashes and is written to the configured Firstmate report path.

Example (PowerShell):

```powershell
npm run e2e:windows-wave6-real -- `
  -InstalledDesktopExecutable "$env:LOCALAPPDATA\Programs\Sori\Sori.exe" `
  -CliExecutable "$env:LOCALAPPDATA\Programs\Sori\sori.exe" `
  -DaemonExecutable "$env:LOCALAPPDATA\Programs\Sori\resources\sorid.exe" `
  -CorpusDirectory .\.tmp\audio-corpus
```

This is synthetic SAPI input, not physical microphone evidence. Physical
microphone, physical hotkey, and frontend visual refresh remain unverified or
not claimed by this automation.
