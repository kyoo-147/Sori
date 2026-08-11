# `sorid` persistence runtime

`sorid` opens the SQLite database at `DaemonConfig::persistence_path` before
starting its loopback IPC listener. The schema migration is applied on open;
startup fails rather than silently running without persistence.

Lifecycle events (`daemon-ready`, pause, resume, error, and shutdown) are
written to the `events` table. IPC `RecentEvents` reads the SQLite journal, so
results survive daemon restarts and are not limited to the process lifetime.
The `Doctor` response reports whether the SQLite migration tables are present.

Tests use in-memory or temporary databases. Event retention can be managed by
calling `SqliteStore::try_purge_events_older_than`; no automatic purge is
enabled yet to avoid deleting user data unexpectedly.
