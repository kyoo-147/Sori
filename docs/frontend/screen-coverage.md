# Frontend screen coverage

Issue: [#37](https://github.com/kyoo-147/Sori/issues/37)

The interactive prototype at [`.lavish/html/screen-coverage.html`](../../.lavish/html/screen-coverage.html) is the current FE coverage surface. It is intentionally dependency-free so it can be opened directly while the desktop scaffold is being integrated.

## Inventory

| Surface | Primary job | Covered states / acceptance criteria |
| --- | --- | --- |
| First-run onboarding | Get a new user to first dictation quickly | Explains local-first behavior; does not force model selection; provides setup and preview actions; progress is visible. |
| Permission setup | Grant and repair microphone, input, and hotkey access | Each permission has a reason, current status, and system-settings action; missing input access has a clear retry path. |
| Overlay state machine | Communicate hot-path state without opening Studio | Ready, listening, transcript preview, approval-needed, and error states are represented; error includes a repair destination; widget remains compact. |
| Tray menu | Quick control for the background daemon | Shows daemon/model/profile status; profile switching works; links to routing, diagnostics, and privacy; pause is visible as a distinct action. |
| Route policy editor | Make model selection rules reviewable | Ordered policy rows expose condition and target; rules can be enabled/disabled; save/add/test actions are present. |
| Extension approval | Gate side effects behind explicit permission review | Requested capabilities are named; pending approval is distinct from active; review and disable actions are available; dry-run guidance is visible. |
| Privacy delete confirmation | Make destructive local-data removal deliberate | Retention settings are visible; delete action is separated in a danger zone; confirmation states permanence and offers cancel. |
| Diagnostics repair | Restore the path to successful dictation | Daemon, microphone, and injection checks report status; a failed injection permission has an actionable Repair button; doctor/export actions exist. |
| Resilient states | Keep the interface useful with imperfect data | Empty, loading/skeleton, error/retry, and long/unknown/degraded (“ugly”) data states are visible and legible. |

## Design-system contract

- Warm native desktop shell with translucent glass surfaces, restrained borders, soft shadows, and no saturated decorative gradients.
- Geist/SF/system typography; one page heading per screen; muted metadata and monospace route/runtime values.
- Green means ready/success, amber means attention/permission, red means failure/destructive action, and blue is informational selection only.
- Small controls use 8–10px radii; cards use 18–24px radii; all primary actions have visible text.
- The hot path remains short: focus app → hold hotkey → speak → release → inject. Setup, diagnostics, extensions, and policy editing never block ordinary dictation.

## Manual acceptance checklist

1. Open the HTML file in a current Chromium or Safari browser.
2. Navigate every item in the sidebar and verify the active navigation state follows the screen.
3. Onboarding reaches Permissions; permission status can be toggled; Overlay can be opened.
4. Overlay controls show all five state descriptions and expose the floating widget.
5. Tray opens from the top bar, switches profile, and navigates to other screens.
6. Route, extension, diagnostics, and privacy primary actions provide visible feedback or confirmation.
7. State gallery shows empty, loading, error, and long/unknown data without clipping on desktop or narrow viewport.
8. Keyboard focus is visible through native controls and all action labels remain understandable without icons.

## Design source reviewed

The coverage follows the glass/native direction and local-first UX rules in `D:/work/Sori/.lavish/sori-ui-navigation-and-wireframe-fix-plan.md`, with visual vocabulary aligned to `D:/work/sori-design/src/index.css` and the design app's onboarding, overlay, tray, and diagnostics components.
