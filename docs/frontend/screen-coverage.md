# Frontend screen coverage

The React/Tauri desktop shell in `apps/desktop` is the current FE surface. Screens and fixtures intentionally cover the intended UX before every runtime capability is available.

## Important status note

The shell and its native loopback IPC bridge exist. UI states for hotkey, microphone, Whisper, and injection are presently contract/scaffold states; they do not prove that the real end-to-end voice path works. The browser HTTP/mock fallback is for preview and diagnostics only.

## Inventory

| Surface | Primary job | Current status |
|---|---|---|
| First-run onboarding | Explain permissions and first dictation | UI coverage; native permission and dictation path pending. |
| Permission setup | Show microphone/input/hotkey repair | UI coverage; platform adapters pending. |
| Overlay state machine | Communicate ready/listening/preview/error | UI simulator and state coverage; real hotkey/audio events pending. |
| Tray menu | Quick daemon control | Native shell/IPC control exists; production tray packaging pending. |
| Route policy editor | Make model rules reviewable | UI scaffold; routing runtime deferred. |
| Extension approval | Gate side effects | UI scaffold; extensions deferred. |
| Privacy/delete and diagnostics | Make local state observable and recoverable | Diagnostics can report real daemon/IPC/SQLite state; full retention UX is future work. |
| Resilient states | Handle empty/loading/error/degraded data | Covered in the UI. |

## Manual acceptance checklist

Use the shell's native status/doctor views to distinguish connected daemon data from mock preview data. Do not report successful dictation until Windows hotkey → microphone → Whisper → injection has been manually validated.

See [MVP capability matrix](../mvp-capability-matrix.md) for implementation truth.
