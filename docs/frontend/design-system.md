# Sori frontend design system

This document defines the visual baseline for the desktop client. The imported React reference is kept in `apps/desktop/design-reference/src`; it is a source reference, not part of the backend TypeScript build. The canonical tokens are available as both `apps/desktop/design-system/tokens.ts` and `tokens.css`.

## Typography

Use Geist first, then the platform equivalents (`SF Pro Text`, `SF Pro Display`, `Avenir Next`, `Inter`, and system UI). Use Geist Mono for code and diagnostic values.

- Page heading: 26/32, semibold, -2% tracking.
- Section heading: 18/26, semibold, -1% tracking.
- Body: 14.5/22, regular, secondary text.
- Sidebar: 13.5/20, medium.
- Button: 13/18, medium.
- Meta: 12/18, regular, tertiary text.

## Palette

The neutral palette is intentionally quiet. Canvas and app surfaces are `#F6F6F4` and `#FBFBFA`; panels are white. Primary text is `#161616`, secondary text is `#5F6368`, and borders range from `#ECEDEE` to `#CDD1D5`. The restrained slate accent is `#5C728A`, with `#E8EEF4` as its soft fill. Semantic green, amber, red, and blue are reserved for status and feedback.

Prefer semantic variables from `tokens.css` (`--sori-*`) over hard-coded colors. The TypeScript object contains the same source values for non-CSS consumers.

## Glass and surfaces

Use glass only for transient or elevated surfaces: tray controls, overlay previews, floating panels, and utility capsules. The light recipe uses white at 68% opacity, 18px blur, and a subtle inset highlight. Strong surfaces use 76% opacity and 24px blur. Overlays use an 18px radius and the stronger shadow. Avoid glass for the primary reading surface or dense settings forms; those should remain legible flat panels.

## Icons

Use Lucide icons with a consistent 16px default size and 1.75–2px stroke. Icons communicate state or action and should be paired with a label when the action is not universally recognizable. Do not introduce product logos or decorative icon packs for ordinary navigation.

## Spacing and shape

Use a 4px base grid: 4, 8, 12, 16, 24, and 32px are the approved common steps. Page content generally uses 16–24px padding; compact controls use 8–12px gaps. Use 8–10px radii for controls and 18px for floating overlays. Shadows should be soft and low contrast, never dashboard-like.

## Approved information architecture

The desktop client is a local utility, not a SaaS workspace. The approved navigation is:

```text
Sori
├── General
├── Voice
│   ├── Microphone
│   ├── Voice Identity
│   └── Assistant Voice
├── Overlay
├── History
├── Dictionary
├── Snippets
├── Models
│   ├── Installed
│   ├── Available
│   ├── Providers
│   └── Benchmark
├── Profiles
├── Extensions
├── Permissions
└── Advanced
    ├── Runtime
    ├── Diagnostics
    ├── Logs
    └── Developer
```

Keep the hot path focused on listening, transcription, insertion, and recovery. Progressive disclosure belongs in Studio, tray controls, and Advanced settings.

## Import boundaries

The reference import intentionally excludes generated dependencies, build output, environment files, server code, and the design app's hosting metadata. It contains reusable shell, overlay, tray, settings, and screen composition under `apps/desktop/design-reference/src`. A future desktop application can adopt these files after its React/Tauri package is introduced; no frontend dependencies or package scripts are added to the current backend scaffold.
