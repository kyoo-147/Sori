# Desktop frontend data boundary

The desktop UI-facing data contract lives in `apps/desktop/src/data/repositories.ts` and the view-model types in `apps/desktop/src/types.ts`.

Adapters:

- `mock-adapter.ts` provides deterministic fixtures and explicit `normal`, `loading`, `empty`, `error`, and `ugly-data` modes.
- `api-adapter.ts` mirrors the PRD `/api/*` shape and returns typed errors for non-2xx responses or unavailable mutations.
- `ipc-adapter.ts` is the Rust/sorid seam. It only maps responses exposed by the authoritative IPC contract; unsupported operations return `unsupported` rather than fake success.

Use `DataState<T>` in view models so loading, empty, error, and ready states remain explicit. Hardware capabilities (microphone, hotkey, Whisper, injection, permissions) must remain `unknown` or `unavailable` until Rust/native evidence reports them; fixtures must not be presented as hardware proof.
