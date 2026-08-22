# Installed synthetic vertical acceptance

This acceptance path proves installed Sori product wiring when whisper.cpp or a model is unavailable. It is explicitly test-only and does not prove ASR quality, physical microphone capture, or SAPI provenance for arbitrary WAV input.

## Provider contract

Set both environment variables before launching the installed desktop/daemon:

```powershell
$env:SORI_TEST_PROVIDER = 'deterministic-sapi'
$env:SORI_TEST_PROVIDER_TEXT = 'Installed deterministic transcript'
```

`SORI_TEST_PROVIDER_TEXT` must contain non-whitespace text, and both test variables must be present together. The provider accepts only model `sapi-wav-test`, rejects empty decoded audio, and returns the exact configured text. The canonical `DictationAudio` path still performs audio canonicalization and SQLite history persistence.

The automated daemon test also sets `SORI_TEST_NO_OS_INJECTION=1`. This mode is accepted only with the deterministic provider, performs no OS input, and labels its synthetic `inserted_text` history result with `TEST-ONLY no-OS-injection seam`. It must never be used as native injection evidence.

## Windows installed acceptance

Use `scripts/windows-native-voice-acceptance.ps1` with `-DeterministicProviderText` and `-Model sapi-wav-test`. The script asserts exact transcript equality, target readback, and a matching SQLite history row. It labels the input generically: an arbitrary `-WavPath` is not called SAPI-derived unless separately verified against the SAPI corpus manifest and hash.

```powershell
pwsh -File scripts/windows-native-voice-acceptance.ps1 `
  -SoriExecutable .\path\to\Sori.exe `
  -TargetExecutable $env:WINDIR\System32\notepad.exe `
  -WavPath .\path\to\fixture.wav `
  -Model sapi-wav-test `
  -DataRoot .\.tmp\installed-synthetic `
  -DeterministicProviderText 'Installed deterministic transcript'
```

## Automated daemon IPC acceptance

`cargo test -p sorid --test backend_ipc_e2e -- deterministic_audio_persists_exact_transcript_across_restart` launches the real `sorid` binary with the explicit provider and no-OS-injection seam, sends non-empty canonical audio over loopback IPC, asserts exact transcript and labeled synthetic history, opens SQLite directly, restarts the daemon, and asserts the transcript remains present. Native injection is proved only by the separate interactive harness.
