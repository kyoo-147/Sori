# Backend IPC end-to-end seam

`cargo test -p sorid --test backend_ipc_e2e -- --nocapture` (or
`npm run e2e:backend-ipc`) runs a deterministic backend-only acceptance seam.

The test starts `sori-ipc::LocalIpcServer` on an ephemeral loopback port and
uses `LocalIpcClient` for every command. It supplies fakes only at the
`AudioCaptureEngine`, `ModelProvider`, and `TextInjector` boundaries; it does
not import the desktop app, `MockIpcServer`, or UI fixtures.

The success path verifies:

`DictationStart -> captured audio -> Whisper provider boundary -> text
injection -> SQLite history and event journal`

The same IPC handler also verifies cancellation (captured audio is discarded
and no history entry is written) and injection failure fallback (the transcript
is returned and persisted with `inserted_text = null`, plus `ModelFallback`).
The provider records the exact captured chunk count, and the fake injector
records injected text, making accidental bypasses observable.

This is deterministic contract proof, not microphone, Whisper inference, OS
focused-window, or native `SendInput` proof. Those require the separate manual
and native checks documented in `docs/e2e/desktop-backend.md` and
`docs/backend/daemon-runtime.md`.
