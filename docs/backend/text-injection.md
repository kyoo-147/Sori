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

On Windows, the scaffold in `sori_core::text_injection::windows` is the boundary
for a future `SendInput` and clipboard implementation. It intentionally does
not call the OS itself. Adapters should also refuse or clearly report elevated
integrity-level mismatches rather than silently injecting into another security
context.

## Manual application matrix

| Target | Expected first strategy | Fallback | Checks |
| --- | --- | --- | --- |
| Browser text field | `SendInput`/direct input | Clipboard + paste | Focus survives insertion; multiline and non-ASCII text; clipboard is restored |
| VS Code editor | Direct input | Clipboard + paste | Undo removes the complete insertion; selections and tabs are preserved |
| Chat app | Direct input | Clipboard + paste | No accidental send until explicit Enter; emoji/non-ASCII; clipboard restored |
| Terminal | Direct input | Clipboard + paste | Shell does not execute inserted newline; prompt remains focused |
| Elevated app | Direct input only when permitted | Report unavailable or request explicit elevation | Verify integrity-level policy; never bypass UAC or inject unexpectedly |

Run these checks with a disposable clipboard value and a short, reversible test
string. Do not use destructive clipboard tests in automated CI.
