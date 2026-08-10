CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS history (
    id TEXT PRIMARY KEY NOT NULL,
    at_seconds INTEGER NOT NULL,
    at_nanos INTEGER NOT NULL,
    active_app TEXT,
    transcript_json TEXT NOT NULL,
    intent_json TEXT NOT NULL,
    route_json TEXT,
    inserted_text TEXT
);
CREATE INDEX IF NOT EXISTS history_at_idx ON history(at_seconds DESC, at_nanos DESC);

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY NOT NULL,
    at_seconds INTEGER NOT NULL,
    at_nanos INTEGER NOT NULL,
    kind TEXT NOT NULL,
    payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_at_idx ON events(at_seconds DESC, at_nanos DESC);

CREATE TABLE IF NOT EXISTS model_manifests (
    id TEXT PRIMARY KEY NOT NULL,
    manifest_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS model_routes (
    name TEXT PRIMARY KEY NOT NULL,
    route_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
