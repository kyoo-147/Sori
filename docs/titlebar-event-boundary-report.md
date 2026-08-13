# P0.1 Titlebar event-boundary report

## Reproduction

Command:

```text
npx vitest run tests/desktop-window-controls.test.ts
```

The regression target is a nested Lucide SVG/path (`EventTarget`) inside a titlebar button. The old guard used `target instanceof HTMLElement`; SVG elements are `Element` instances but are not `HTMLElement` instances. Consequently the guard returned false, `onMouseDown` reached the titlebar, and `startDragging` could be called alongside the button action.

The regression test records both action calls and asserts the trace is `close` only, with no `drag`. The test uses a nested-SVG-like `Element` target and exercises the same interactive-target boundary.

## Fix

`isTitlebarInteractiveTarget` now uses the DOM `Element` boundary and checks the closest interactive/no-drag ancestor. `DesktopTitleBar` uses that shared predicate for mouse-down and double-click handling. This is the smallest fix at the event boundary; window action routing remains in `window-actions.ts`, and Tauri API ownership remains in `window-controls.ts`.

Native action failures now emit structured `console.error` evidence containing action, window label, runtime source, timestamp, and error details. They are not silently reduced to `console.warn` text.

## Audited controls

- Collapse/expand sidebar
- Preview capture
- Pause/resume daemon
- Route/model navigation
- Quick controls
- Minimize
- Maximize/restore
- Close
- Drag and double-click maximize boundary

## Validation

- `npx vitest run tests/desktop-window-controls.test.ts` — PASS (10 tests)
- `npm run desktop:check` — PASS
- `git diff --check` — PASS after edits

## Native evidence boundary

No Tauri/Windows native interaction was claimed or demonstrated in this worker run. Browser/source tests prove the event-boundary contract only. Native titlebar click, drag, maximize/restore, minimize, and close behavior still require a real Tauri run with foreground-window/PID evidence.

## Fallback integrator resize follow-up

The sidebar resize ownership fix is included in the follow-up PR update. `App.tsx` now binds the session to the initiating `pointerId`, ignores unrelated pointer moves, and finalizes on `pointerup`, `pointercancel`, or `lostpointercapture`. It cancels a pending animation frame before committing the final live width, preventing a stale frame from rewriting CSS after pointerup.

Additional validation:

- `npx vitest run tests/desktop-window-controls.test.ts tests/desktop-viewport-userflow.test.ts` — PASS (15 tests)
- `npm run desktop:check` — PASS
- `npm run e2e:desktop-native` — `SKIP`; the script built the real Tauri executable, then refused to attach because `127.0.0.1:17373` was already owned by an unknown daemon: `loopback IPC 127.0.0.1:17373 is already owned by a daemon; refusing to attach to an unknown process`.

No native controls or resize interaction are claimed verified. The native script's executable build succeeded, but its guarded runtime evidence is SKIP due to endpoint ownership.

## P0.2 correction

The initial fallback integrator patch incorrectly wrote the live CSS variable on `document.documentElement`, while the shell owns the inline variable. The corrected implementation uses `shellRef` on `.sori-shell` and writes through `shellRef.current.style` in both RAF and stop paths. Duplicate document-level writes were removed.

Regression coverage now invokes the exported live-width writer against a shell-like ref and records that the shell style mutation occurs before the simulated `pointerup` marker. The titlebar regression invokes the extracted production mouse-down boundary with a nested SVG-like target, asserting the drag callback is not called before the intended action.
