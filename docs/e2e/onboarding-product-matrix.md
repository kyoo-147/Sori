# First Run Setup product acceptance matrix

This matrix covers the frontend acceptance surface for `First Run Setup` and all MVP routes. Browser/OCU runs prove rendered semantics, real controls, and loopback IPC responses only. They do **not** prove physical microphone capture, global hotkey input, Whisper inference, or focused-app text injection; those remain `UNVERIFIED` / `SKIP` until a machine-level Windows run.

## Onboarding flow

| Step | Normal | Checking | Granted/complete | Denied/retry | Acceptance evidence |
| --- | --- | --- | --- | --- | --- |
| Welcome | daemon reachable and Begin setup enabled | n/a | daemon source shown | unavailable daemon disables Begin setup | semantic snapshot and `Status` source |
| Microphone | Doctor `audio` check shown | Check microphone button | only `ok: true` becomes Granted | failed/missing check shows error and Retry needed | real `Doctor`; no simulated meter or device name |
| Permissions | Doctor `text-injection` check shown | Check permissions button | only `ok: true` becomes Granted | failed/missing check shows denied/retry | real `Doctor`; physical permission remains UNVERIFIED |
| Hotkey + first dictation | configured binding and Doctor detail shown | real `DictationStart` then `DictationStop` | returned transcript advances to Ready | IPC error stays retryable; no success copy | real IPC response; injection remains UNVERIFIED |
| Ready | completion copy and Home action | n/a | completion only follows a returned transcript | unreachable/failure cannot complete | semantic state plus explicit capability boundary |

## MVP route/state matrix

| Route | Normal | Loading | Empty | Error | Disabled | Destructive |
| --- | --- | --- | --- | --- | --- | --- |
| Home | readiness and recent dictations | daemon/model status | no recent dictations | runtime error | unavailable capture | n/a |
| Transcripts | list/detail | skeleton rows | no transcript guidance | retry database connection | storage disabled | n/a |
| Vocabulary | terms and add form | list loading | first-term guidance | validation/import error | unavailable save | delete confirmation |
| Voice Edit | intent/diff review | parsing | no selection | injection blocked | Accept disabled | reject/cancel |
| Models & Routing | selected route | model loading | no models | provider offline | unavailable model | n/a |
| Benchmarks | result matrix | running/progress | no results | failed run | unsupported model | clear/export confirmation |
| Extensions | connected/available | connection pending | no extensions | permission/auth error | disabled extension | disconnect confirmation |
| Privacy | retention settings | pending save/export | n/a | save/export error | storage disabled | type `DELETE` before purge |
| Diagnostics | Doctor checklist | checking | not checked | failed check + retry | repair unavailable | restart is explicitly not wired |
| Settings | persisted preferences | pending save | n/a | save error | unsupported option | reset confirmation |
| First Run Setup | flow above | each async check | initial idle steps | denied/retry | daemon unavailable | n/a |

## Required labels

- Hardware-dependent results use `UNVERIFIED` or `SKIP`.
- A mock fallback is never presented as a successful capability.
- A transcript returned by the daemon is labeled as an IPC result, not proof of insertion into a focused application.
