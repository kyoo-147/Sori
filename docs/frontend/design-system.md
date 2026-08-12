# Sori frontend design system

This document defines the visual baseline for the desktop client. The canonical
values are mirrored in `apps/desktop/design-system/tokens.css` and
`apps/desktop/design-system/tokens.ts`; the live shell primitives are in
`apps/desktop/src/index.css`. The imported React reference under
`apps/desktop/design-reference/src` consumes the same token layer.

## Typography

Use Geist first, then the platform equivalents (`SF Pro Text`, `SF Pro Display`,
`Avenir Next`, `Inter`, and system UI). Use Geist Mono for code and diagnostic
values.

| Role | Size / leading | Token class |
| --- | --- | --- |
| Page heading | 26 / 32, semibold, -2% tracking | `.sori-page-heading` |
| Section heading | 18 / 26, semibold, -1% tracking | `.sori-section-heading` |
| Body | 14.5 / 22, regular | `.sori-body-text` |
| Sidebar | 13.5 / 20, medium | `.sori-sidebar-text` |
| Button | 13 / 18, medium | `.sori-button-text` |
| Meta | 12 / 18, regular | `.sori-meta-text` |

## Palette and states

The neutral palette is intentionally quiet. Canvas and app surfaces are
`#F6F6F4` and `#FBFBFA`; panels are white. Primary text is `#161616`,
secondary text is `#5F6368`, and borders range from `#ECEDEE` to `#CDD1D5`.
The restrained slate accent is `#5C728A`, with `#E8EEF4` as its soft fill.
Semantic green, amber, red, and blue are reserved for status and feedback.

Prefer semantic `--sori-*` variables over hard-coded colors. Interactive
controls must expose all of these states:

- hover changes fill/border without relying on color alone;
- `:focus-visible` uses the shared two-pixel focus ring;
- pressed/expanded controls can use `aria-pressed` or `aria-expanded`;
- disabled controls use the native `disabled` attribute (or
  `aria-disabled="true"`) and are visibly muted;
- invalid controls use `aria-invalid="true"`, and error surfaces use
  `.sori-error-state` or `data-state="error"`.

## Spacing, shape, and elevation

Use the 4px grid: 4, 8, 12, 16, 20, 24, 32, 40, and 48px. Common controls
use 8–10px radii, panels use 14px, and floating overlays use 18px. The shared
shadow scale is `xs`, `sm`, `md`, and `lg`; shadows remain soft and low
contrast, never dashboard-like.

Glass is reserved for transient or elevated surfaces: tray controls, overlay
previews, floating panels, and utility capsules. The light recipe uses 18px
blur and the strong recipe uses 24px blur. Avoid glass for the primary reading
surface or dense settings forms.

## Shell and responsive windows

`App.tsx` owns the shell composition without owning layout values:

```text
.sori-shell
└── .sori-shell__titlebar
    └── .sori-shell__body
        ├── .sori-shell__sidebar
        └── .sori-shell__workspace
```

The CSS breakpoints describe a real application window, not the optional
`DeviceFrame` simulator:

- 1200px and below: compact sidebar (232px) and 20px workspace padding;
- 900px and below: narrow sidebar (216px), 16px padding, and single-column
  inspector panes;
- 767px and below: the sidebar becomes an off-canvas rail and workspace
  content becomes single-column.

Do not change titlebar/native window behavior to solve a layout problem. Use
the shell variables (`--sori-sidebar-width`, `--sori-workspace-padding`) or
component-local overrides instead.

## Customizable layout primitives

The CSS primitives support Codex/Obsidian-like compositions without coupling
screens to a fixed grid:

- `.sori-layout-grid`: configurable columns via `--sori-layout-columns`;
- `.sori-layout-stack` and `.sori-layout-cluster`: vertical and inline rhythm;
- `.sori-layout-rail`: configurable rail via `--sori-rail-width`;
- `.sori-layout-split`: main content plus an inspector using
  `--sori-inspector-width` and `--sori-inspector-min`;
- `.sori-layout-pane` and `.sori-layout-toolbar`: bordered surfaces and their
  headers;
- `data-sori-collapsed="true"`: hide a user-collapsible pane without changing
  screen business logic.

These primitives are intentionally presentational. Persistence, pane resizing,
and navigation remain outside the visual architecture task.

## Icons and boundaries

Use Lucide icons with a consistent 16px default size and 1.75–2px stroke.
Icons communicate state or action and should be paired with a label when the
action is not universally recognizable. The UI continues to talk to the
runtime through `apps/desktop/src/runtime-client.ts`; visual normalization
must not move audio, model, provider, or IPC behavior into React.
