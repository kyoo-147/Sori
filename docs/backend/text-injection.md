# Windows text injection

Sori treats text insertion as a capability-driven operation. A target advertises
whether it accepts direct input, paste, and undo; the injector chooses direct
input first and clipboard/paste as a fallback.

## Safety boundary

The core planner is pure. OS operations are only performed by an explicit
`TextInjectionAdapter`; dry-run requests never read, replace, or restore the
user's clipboard. Clipboard fallback should snapshot the complete clipboard
transaction, paste, and make a best-effort restore. The result and
`UndoRestoreAttempt` representation must report that restoration/undo was only
attempted, not guaranteed.

On Windows, `WindowsTextInjector::native()` provides UTF-16 `SendInput` first,
modifier-release protection, a Unicode clipboard/paste fallback, and conditional
restore only when the clipboard still contains the Sori payload. A failed paste
is reported as `CopiedFallback`; a changed foreground identity is rejected.
Focused-target insertion remains `UNVERIFIED` until observed in a real target. The Windows adapter reads the foreground HWND and owning PID immediately before input; a caller-provided `pid:...` identity mismatch is rejected. It does not claim that `SendInput` was accepted by the target.
Adapters should refuse or clearly report elevated integrity-level mismatches.

## Manual application matrix

| Target | Expected first strategy | Fallback | Checks |
| --- | --- | --- | --- |
| Notepad | `SendInput`/direct input | Clipboard + paste | Plain text, multiline and non-ASCII text; the CF_UNICODETEXT clipboard snapshot is restored |
| VS Code editor | Direct input | Clipboard + paste | Undo removes the complete insertion; selections and tabs are preserved |
| Browser text field | `SendInput`/direct input | Clipboard + paste | Focus survives insertion; multiline and non-ASCII text; clipboard is restored |
| Chat app | Direct input | Clipboard + paste | No accidental send until explicit Enter; emoji/non-ASCII; clipboard restored |
| Terminal | Direct input | Clipboard + paste | Shell does not execute inserted newline; prompt remains focused |
| Elevated app | Direct input only when permitted | Report unavailable or request explicit elevation | Verify integrity-level policy; never bypass UAC or inject unexpectedly |
| Unsupported/custom app | None | None | Report unsupported target; do not modify clipboard |

Run these checks with a disposable clipboard value and a short, reversible test
string. For terminals, verify that inserted newlines do not execute commands. For
elevated apps, test both a denied request and an explicitly permitted matching
integrity level; never bypass UAC. Do not use destructive clipboard tests in
automated CI.

## Safe Windows smoke procedure

This is a manual, opt-in check; CI and the daemon doctor do **not** prove that
text appeared in another application. Build the Windows daemon, start it with
the normal local configuration, and run the diagnostic command:

```powershell
cargo test -p sori-core
cargo run -p sorid
# In another PowerShell window:
cargo run -p sori-cli -- doctor
```

Open Notepad, click an empty document, and use the existing injection entry
point with the reversible marker `SORI-SMOKE-✓` (including a newline only if
testing multiline input). Observe the Notepad document before recording the
check as passed, then undo or close without saving. A successful `SendInput`
return value means only that Windows accepted the keyboard events; it is not
evidence of insertion. Record `SKIP`/`UNVERIFIED` for targets not actually
observed, including elevated applications, terminals, browsers, clipboard
restore, and undo. Never paste secrets or issue commands in a focused terminal.
