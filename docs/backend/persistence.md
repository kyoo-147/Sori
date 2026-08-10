# SQLite persistence

`crates/sori-persistence` provides the first durable local storage adapter. It
uses `rusqlite` with the `bundled` feature so CI and end users do not need a
system SQLite installation.

```rust
let store = sori_persistence::SqliteStore::open("sori.sqlite3")?;
store.try_push_history(&entry)?;
store.try_publish_event(&event)?;
```

The database is migrated on open. Migration `001_initial.sql` creates tables
for settings, history, events, model manifests, and named model routes. The
history and event adapters implement `sori_core::HistoryRepository` and
`sori_core::EventBus`; their `try_*` methods should be used by durable callers
so SQLite errors are not discarded by the infallible core traits.

History and event payloads are stored as JSON, while timestamps use separate
Unix seconds and nanoseconds columns. This keeps the schema queryable without
coupling it to individual domain fields. `SqliteStore::open_in_memory()` is
available for fast repository tests.
