# Sori UI Taste Sheet

## Direction
Quiet desktop utility: warm near-white canvas, slate primary, restrained terracotta accent, and a single connected application frame. Density stays functional without dashboard clutter.

## Geometry
- 4px spacing grid; shared surface radius `--sori-radius-md` / `--sori-card-radius` (10px).
- One persistent content seam; sidebar and titlebar read as one material.
- Selected navigation and settings tabs use fill-only states with no painted border.

## Type and hierarchy
Instrument Sans / Geist Mono. Page titles lead, short supporting copy follows, and metadata stays quiet. Screens share the `sori-page-layout` frame and semantic spacing tokens.

## Theme checks
Each theme must preserve contrast, one primary action color, one accent, tokenized surfaces, visible keyboard focus, and readable selected states across Home, Transcripts, Vocabulary, Models, Benchmarks, Extensions, Diagnostics, and Settings.

## Review checklist
- 1440x900 desktop capture shows the titlebar, navigation, and first content row without clipping.
- Empty states explain what happens next rather than presenting decorative placeholders.
- Reduced motion and reduced transparency remain supported.
- Screenshots are evidence only; no claim of backend/native behavior is made by visual review.
