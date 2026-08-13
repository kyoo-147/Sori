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
