# Sori desktop frontend integration

The canonical desktop UI now lives in `apps/desktop`.

## Source inputs

- Imported design reference: `apps/desktop/design-reference/src`
- Reusable design tokens: `apps/desktop/design-system/tokens.ts` and `tokens.css`
- Production React/Vite app: `apps/desktop/src`
- Tauri-compatible native scaffold: `apps/desktop/src-tauri`

The previous local design app from `D:/work/sori-design` was copied into the repository as reference material and normalized into the production desktop shell. Do not use a separate top-level `frontend/` app; `apps/desktop` is the product UI target.

## Product IA

Top-level navigation must remain:

- Home
- Transcripts
- Vocabulary
- Voice Edit
- Models & Routing
- Benchmarks
- Extensions
- Privacy
- Diagnostics
- Settings

Prototype-only flows, such as First-Run Setup, must be clearly marked as prototype or setup flow and should not become a permanent product tab after onboarding is complete.

## Cross-platform plan

Sori is Windows-first, but the frontend architecture should stay portable:

- React/Vite renders the app shell.
- Tauri hosts the native desktop shell later for Windows, macOS, and Linux.
- The UI talks to the daemon through a runtime client abstraction, using mock transport in preview and Tauri/IPC transport in the real app.
- OS-specific hotkey, audio, overlay, and text injection stay in Rust/backend crates, not in React components.

## Validation

From repo root:

```sh
npm run check
npm run desktop:build
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```
