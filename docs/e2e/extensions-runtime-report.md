# Extensions runtime delivery report

## Scope

Worker H audited and wired the extension manifest, registry, install, enable, disable, uninstall, permissions, lifecycle, execution boundary, persistence, IPC, and desktop client seams.

## Delivered evidence

- `crates/sori-ipc/src/lib.rs`: canonical request/response variants for extension lifecycle and invocation.
- `crates/sori-persistence/src/migrations/001_initial.sql`: SQLite `extensions` table and state index.
- `crates/sori-persistence/src/lib.rs`: extension CRUD and restart-safe reads/writes.
- `crates/sorid/src/main.rs`: manifest validation, permission allowlist, relative entrypoint/traversal checks, required license evidence, lifecycle handlers, and explicit invocation failure.
- `apps/desktop/src/ipc-contract.ts`: TypeScript mirror of the Rust contract.
- `apps/desktop/src/runtime-client.ts`: FE IPC methods for listing and lifecycle mutations.
- `docs/backend/extensions.md`: security/isolation and license policy.

## Truth boundary

`ExtensionInvoke` returns `execution_unavailable`; no extension process is launched and no success is fabricated. A future executor must be isolated from `sorid`, broker permissions explicitly, enforce timeout/resource limits, support cancellation, and contain crashes.

Native and hardware capabilities were **not tested or claimed** by this worker. In particular, this work does not verify Windows microphone access, global hotkeys, Whisper inference, focused-window text injection, native extension process execution, OS permissions, code signing, or sandbox enforcement. Those remain `UNVERIFIED/SKIP` pending a real Windows/native acceptance run.

## Validation

Executed on the task branch:

```text
cargo fmt --all
cargo test -p sori-ipc -p sori-persistence -p sorid --lib --tests
npm run desktop:check
git diff --check
```

All commands passed. This report is source/IPC/SQLite evidence only; it is not native or hardware acceptance evidence.

## Delivery

Direct PR: https://github.com/kyoo-147/Sori/pull/110
Commit: `f8a5dd5`
