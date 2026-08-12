# `sorid` persistence runtime

`sorid` opens the SQLite database at `DaemonConfig::persistence_path` before
starting its loopback IPC listener. The schema migration is applied on open;
startup fails rather than silently running without persistence.

Lifecycle events (`daemon-ready`, pause, resume, error, and shutdown) are
written to the `events` table. IPC `RecentEvents` reads the SQLite journal, so
results survive daemon restarts and are not limited to the process lifetime.
The `Doctor` response reports whether the SQLite migration tables are present.

Tests use in-memory or temporary databases and explicitly reopen the same
SQLite file to verify restart persistence. Dictation stop writes a transcript
history row when `history.enabled` is true, then deterministically retains the
newest `history.retention_limit` entries (default 20). `PurgeHistory` deletes
all history. `SetConfig` validates and persists supported settings, including
the hotkey binding, before acknowledging success. Storage and lifecycle
failures are returned as explicit IPC error responses; they are never replaced
with frontend fixtures or local state.

Event retention remains explicit: callers may use
`SqliteStore::try_purge_events_older_than` when an event-age policy is selected.
