# Wave 3 installed synthetic vertical

Status: implementation complete; Windows installed acceptance remains machine-run evidence.

- Added an explicit `SORI_TEST_PROVIDER=deterministic-sapi` plus `SORI_TEST_PROVIDER_TEXT` seam in `sorid`.
- The seam exposes a test-only `sapi-wav-test` model, rejects empty decoded audio, and returns committed text without downloading or claiming Whisper inference.
- Reused `DictationAudio` and the existing canonical DSP/provider/injection/SQLite pipeline.
- Extended `scripts/windows-native-voice-acceptance.ps1` with `-DeterministicProviderText`; target focus, owned daemon checks, injection/readback, and SQLite history assertions remain unchanged.

Verification:

- `cargo check -p sorid` PASS.
- `git diff --check` PASS.
- `cargo test -p sorid --lib` BLOCKED by Windows paging-file error 1455 while loading Rust metadata.
- Vitest BLOCKED in this checkout because `vitest` is not installed.
- Physical Windows installed acceptance, target readback, and real Whisper remain UNVERIFIED until run on the release machine.

Example machine command (after building the release installer):

```powershell
pwsh -File scripts/windows-native-voice-acceptance.ps1 `
  -SoriExecutable .\path\to\Sori.exe `
  -TargetExecutable $env:WINDIR\System32\notepad.exe `
  -WavPath .\data\sapi\en-greeting--default.wav `
  -Model sapi-wav-test `
  -DataRoot .\.tmp\wave3-installed `
  -DeterministicProviderText 'Hello Sori, this is a local speech fixture.'
```

This validates product wiring only; it is not ASR quality or physical microphone evidence.
