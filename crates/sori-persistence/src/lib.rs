//! SQLite-backed persistence adapters for Sori's core repositories.

use rusqlite::{Connection, OptionalExtension, params};
use sori_core::{BenchmarkResult, Event, EventBus, HistoryEntry, HistoryRepository};
use std::path::Path;
use std::sync::Mutex;
use time::OffsetDateTime;

const MIGRATION: &str = include_str!("migrations/001_initial.sql");

pub type Result<T> = std::result::Result<T, PersistenceError>;

#[derive(Debug, thiserror::Error)]
pub enum PersistenceError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("serialization error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid timestamp: {0}")]
    Timestamp(#[from] time::error::ComponentRange),
    #[error("invalid UUID: {0}")]
    Uuid(#[from] uuid::Error),
    #[error("persistence lock poisoned")]
    LockPoisoned,
}

/// A SQLite database containing the local settings and runtime journals.
pub type ExtensionRow = (serde_json::Value, String, i64, i64, Option<String>);
pub type ExtensionListRow = (String, serde_json::Value, String, i64, i64, Option<String>);

pub struct SqliteStore {
    connection: Mutex<Connection>,
}

impl SqliteStore {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let connection = Connection::open(path)?;
        Self::from_connection(connection)
    }

    pub fn open_in_memory() -> Result<Self> {
        Self::from_connection(Connection::open_in_memory()?)
    }

    fn from_connection(connection: Connection) -> Result<Self> {
        connection.execute_batch(MIGRATION)?;
        let columns = connection
            .prepare("PRAGMA table_info(benchmark_runs)")?
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        if !columns.iter().any(|column| column == "manifest_json") {
            connection
                .execute_batch("ALTER TABLE benchmark_runs ADD COLUMN manifest_json TEXT;")?;
        }
        if !columns.iter().any(|column| column == "evidence_class") {
            connection
                .execute_batch("ALTER TABLE benchmark_runs ADD COLUMN evidence_class TEXT;")?;
        }
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    fn connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>> {
        self.connection
            .lock()
            .map_err(|_| PersistenceError::LockPoisoned)
    }

    pub fn try_push_history(&self, entry: &HistoryEntry) -> Result<()> {
        let at = entry.at;
        self.connection()?.execute(
            "INSERT OR REPLACE INTO history
             (id, at_seconds, at_nanos, active_app, transcript_json, intent_json, route_json, inserted_text)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                entry.id.to_string(),
                at.unix_timestamp(),
                at.nanosecond(),
                entry.active_app,
                serde_json::to_string(&entry.transcript)?,
                serde_json::to_string(&entry.intent)?,
                entry.route.as_ref().map(serde_json::to_string).transpose()?,
                entry.inserted_text,
            ],
        )?;
        Ok(())
    }

    pub fn try_purge_history(&self) -> Result<()> {
        self.connection()?.execute("DELETE FROM history", [])?;
        Ok(())
    }

    pub fn try_delete_history(&self, id: uuid::Uuid) -> Result<bool> {
        let deleted = self
            .connection()?
            .execute("DELETE FROM history WHERE id = ?1", [id.to_string()])?;
        Ok(deleted == 1)
    }

    /// Keep the newest `limit` entries. Ordering is deterministic for equal timestamps.
    pub fn try_retain_history(&self, limit: usize) -> Result<usize> {
        let deleted = self.connection()?.execute(
            "DELETE FROM history WHERE id NOT IN
             (SELECT id FROM history ORDER BY at_seconds DESC, at_nanos DESC, id DESC LIMIT ?1)",
            [limit as i64],
        )?;
        Ok(deleted)
    }

    /// Persist a user-owned resource atomically in SQLite. This is the authority
    /// for FE settings, vocabulary, and snippets; the browser must not mirror it.
    pub fn set_resource(&self, resource: &str, value: &serde_json::Value) -> Result<()> {
        self.connection()?.execute(
            "INSERT INTO user_data (resource, value_json, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(resource) DO UPDATE SET value_json = excluded.value_json,
                 updated_at = excluded.updated_at",
            params![resource, serde_json::to_string(value)?, unix_timestamp()],
        )?;
        Ok(())
    }

    pub fn delete_resource(&self, resource: &str) -> Result<bool> {
        Ok(self
            .connection()?
            .execute("DELETE FROM user_data WHERE resource = ?1", [resource])?
            == 1)
    }

    pub fn resource(&self, resource: &str) -> Result<Option<serde_json::Value>> {
        let connection = self.connection()?;
        let value = connection
            .query_row(
                "SELECT value_json FROM user_data WHERE resource = ?1",
                [resource],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        value
            .map(|json| serde_json::from_str(&json).map_err(PersistenceError::from))
            .transpose()
    }

    pub fn set_setting(&self, key: &str, value: &serde_json::Value) -> Result<()> {
        self.connection()?.execute(
            "INSERT INTO settings (key, value_json, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
                 updated_at = excluded.updated_at",
            params![key, serde_json::to_string(value)?, unix_timestamp()],
        )?;
        Ok(())
    }

    pub fn delete_setting(&self, key: &str) -> Result<bool> {
        let mut connection = self.connection()?;
        let transaction = connection.transaction()?;
        let deleted = transaction.execute("DELETE FROM settings WHERE key = ?1", [key])? == 1;
        if key == "hotkey.binding" {
            if let Some(json) = transaction
                .query_row(
                    "SELECT value_json FROM user_data WHERE resource = 'settings'",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .optional()?
            {
                let mut settings: serde_json::Value = serde_json::from_str(&json)?;
                if let Some(object) = settings.as_object_mut() {
                    object.remove("hotkey");
                    transaction.execute("UPDATE user_data SET value_json = ?1, updated_at = ?2 WHERE resource = 'settings'", params![serde_json::to_string(&settings)?, unix_timestamp()])?;
                }
            }
        }
        transaction.commit()?;
        Ok(deleted)
    }

    pub fn setting(&self, key: &str) -> Result<Option<serde_json::Value>> {
        let connection = self.connection()?;
        let value = connection
            .query_row(
                "SELECT value_json FROM settings WHERE key = ?1",
                [key],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        value
            .map(|json| serde_json::from_str(&json).map_err(PersistenceError::from))
            .transpose()
    }

    pub fn save_extension(
        &self,
        id: &str,
        manifest: &serde_json::Value,
        state: &str,
        last_error: Option<&str>,
    ) -> Result<()> {
        let now = unix_timestamp();
        self.connection()?.execute(
            "INSERT INTO extensions (id, manifest_json, state, installed_at, updated_at, last_error) VALUES (?1, ?2, ?3, ?4, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET manifest_json=excluded.manifest_json, state=excluded.state, updated_at=excluded.updated_at, last_error=excluded.last_error",
            params![id, serde_json::to_string(manifest)?, state, now, last_error],
        )?;
        Ok(())
    }

    pub fn extension(&self, id: &str) -> Result<Option<ExtensionRow>> {
        let connection = self.connection()?;
        connection.query_row("SELECT manifest_json, state, installed_at, updated_at, last_error FROM extensions WHERE id=?1", [id], |row| {
            let manifest: serde_json::Value = serde_json::from_str(&row.get::<_, String>(0)?).map_err(to_sqlite_error)?;
            Ok((manifest, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
        }).optional().map_err(Into::into)
    }

    pub fn extensions(&self) -> Result<Vec<ExtensionListRow>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare("SELECT id, manifest_json, state, installed_at, updated_at, last_error FROM extensions ORDER BY id")?;
        let rows = statement.query_map([], |row| {
            let manifest: serde_json::Value =
                serde_json::from_str(&row.get::<_, String>(1)?).map_err(to_sqlite_error)?;
            Ok((
                row.get(0)?,
                manifest,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn delete_extension(&self, id: &str) -> Result<bool> {
        Ok(self
            .connection()?
            .execute("DELETE FROM extensions WHERE id=?1", [id])?
            == 1)
    }

    pub fn save_model_manifest(&self, id: &str, manifest: &serde_json::Value) -> Result<()> {
        self.connection()?.execute(
            "INSERT INTO model_manifests (id, manifest_json, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET manifest_json = excluded.manifest_json,
                 updated_at = excluded.updated_at",
            params![id, serde_json::to_string(manifest)?, unix_timestamp()],
        )?;
        Ok(())
    }

    pub fn delete_model_manifest(&self, id: &str) -> Result<bool> {
        Ok(self
            .connection()?
            .execute("DELETE FROM model_manifests WHERE id = ?1", [id])?
            == 1)
    }

    /// Return all persisted manifests in stable id order for restart/reopen audits.
    pub fn model_manifests(&self) -> Result<Vec<(String, serde_json::Value)>> {
        let connection = self.connection()?;
        let mut statement =
            connection.prepare("SELECT id, manifest_json FROM model_manifests ORDER BY id")?;
        let rows = statement.query_map([], |row| {
            let value = serde_json::from_str(&row.get::<_, String>(1)?).map_err(to_sqlite_error)?;
            Ok((row.get(0)?, value))
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn model_manifest(&self, id: &str) -> Result<Option<serde_json::Value>> {
        let connection = self.connection()?;
        let value = connection
            .query_row(
                "SELECT manifest_json FROM model_manifests WHERE id = ?1",
                [id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        value
            .map(|json| serde_json::from_str(&json).map_err(PersistenceError::from))
            .transpose()
    }

    pub fn save_model_route(&self, name: &str, route: &serde_json::Value) -> Result<()> {
        self.connection()?.execute(
            "INSERT INTO model_routes (name, route_json, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(name) DO UPDATE SET route_json = excluded.route_json,
                 updated_at = excluded.updated_at",
            params![name, serde_json::to_string(route)?, unix_timestamp()],
        )?;
        Ok(())
    }

    pub fn delete_model_route(&self, name: &str) -> Result<bool> {
        Ok(self
            .connection()?
            .execute("DELETE FROM model_routes WHERE name = ?1", [name])?
            == 1)
    }

    pub fn model_route(&self, name: &str) -> Result<Option<serde_json::Value>> {
        let connection = self.connection()?;
        let value = connection
            .query_row(
                "SELECT route_json FROM model_routes WHERE name = ?1",
                [name],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        value
            .map(|json| serde_json::from_str(&json).map_err(PersistenceError::from))
            .transpose()
    }

    pub fn save_benchmark(&self, result: &BenchmarkResult) -> Result<()> {
        self.connection()?.execute(
            "INSERT INTO benchmark_runs (id, at, result_json, manifest_json, evidence_class) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                uuid::Uuid::new_v4().to_string(),
                unix_timestamp(),
                serde_json::to_string(result)?,
                serde_json::to_string(&result.provenance)?,
                result.provenance.evidence_class.to_string()
            ],
        )?;
        Ok(())
    }

    pub fn recent_benchmarks(&self, limit: usize) -> Result<Vec<BenchmarkResult>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT result_json, manifest_json, evidence_class FROM benchmark_runs ORDER BY at DESC, id DESC LIMIT ?1",
        )?;
        let rows = statement.query_map([limit as i64], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })?;
        rows.map(|row| {
            let (result_json, manifest_json, evidence_class) = row?;
            Self::decode_benchmark_result(
                &result_json,
                manifest_json.as_deref(),
                evidence_class.as_deref(),
            )
        })
        .collect()
    }

    fn decode_benchmark_result(
        result_json: &str,
        manifest_json: Option<&str>,
        evidence_class: Option<&str>,
    ) -> Result<BenchmarkResult> {
        if let Ok(result) = serde_json::from_str(result_json) {
            return Ok(result);
        }
        let mut value: serde_json::Value = serde_json::from_str(result_json)?;
        if value.get("provenance").is_none() {
            let manifest = manifest_json
            .and_then(|json| serde_json::from_str::<serde_json::Value>(json).ok())
            .unwrap_or_else(|| {
                serde_json::json!({
                    "manifest_version": 0,
                    "evidence_class": evidence_class.unwrap_or("deterministic-test"),
                    "audio_sha256": null,
                    "audio_bytes": null,
                    "audio_duration_seconds": null,
                    "sample_rate_hz": null,
                    "channels": null,
                    "reference_sha256": null,
                    "reference_absent_reason": "legacy benchmark row without provenance manifest",
                    "provider": value.get("provider").and_then(|v| v.as_str()).unwrap_or("legacy"),
                    "model": value.get("model").cloned().unwrap_or_else(|| serde_json::Value::String("legacy".into())),
                    "run_id": value.get("run_id").cloned().unwrap_or(serde_json::Value::Null),
                    "source_commit": null
                })
            });
            value["provenance"] = manifest;
        }
        Ok(serde_json::from_value(value)?)
    }

    pub fn try_publish_event(&self, event: &Event) -> Result<()> {
        self.connection()?.execute(
            "INSERT OR REPLACE INTO events
             (id, at_seconds, at_nanos, kind, payload_json)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                event.id.to_string(),
                event.at.unix_timestamp(),
                event.at.nanosecond(),
                serde_json::to_string(&event.kind)?,
                serde_json::to_string(&event.payload)?,
            ],
        )?;
        Ok(())
    }

    pub fn try_recent_events(&self) -> Result<Vec<Event>> {
        self.try_recent_events_limit(usize::MAX)
    }

    pub fn try_recent_events_limit(&self, limit: usize) -> Result<Vec<Event>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT id, at_seconds, at_nanos, kind, payload_json
             FROM (SELECT id, at_seconds, at_nanos, kind, payload_json
                   FROM events ORDER BY at_seconds DESC, at_nanos DESC LIMIT ?1)
             ORDER BY at_seconds ASC, at_nanos ASC",
        )?;
        let rows = statement.query_map([limit as i64], |row| {
            let at = timestamp(row.get(1)?, row.get(2)?).map_err(to_sqlite_error)?;
            Ok(Event {
                id: row.get::<_, String>(0)?.parse().map_err(to_sqlite_error)?,
                at,
                kind: serde_json::from_str(&row.get::<_, String>(3)?).map_err(to_sqlite_error)?,
                payload: serde_json::from_str(&row.get::<_, String>(4)?)
                    .map_err(to_sqlite_error)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    /// Verifies that the migration-created tables are available.
    pub fn migration_status(&self) -> Result<bool> {
        let connection = self.connection()?;
        let count: i64 = connection.query_row(
            "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name IN ('events', 'history', 'settings')",
            [],
            |row| row.get(0),
        )?;
        Ok(count == 3)
    }

    pub fn try_purge_events_older_than(&self, age: time::Duration) -> Result<usize> {
        let cutoff = OffsetDateTime::now_utc() - age;
        let deleted = self.connection()?.execute(
            "DELETE FROM events WHERE at_seconds < ?1 OR (at_seconds = ?1 AND at_nanos < ?2)",
            params![cutoff.unix_timestamp(), cutoff.nanosecond()],
        )?;
        Ok(deleted)
    }

    pub fn try_recent_history(&self, limit: usize) -> Result<Vec<HistoryEntry>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT id, at_seconds, at_nanos, active_app, transcript_json,
                    intent_json, route_json, inserted_text
             FROM history ORDER BY at_seconds DESC, at_nanos DESC LIMIT ?1",
        )?;
        let rows = statement.query_map([limit as i64], |row| {
            Ok(HistoryEntry {
                id: row.get::<_, String>(0)?.parse().map_err(to_sqlite_error)?,
                at: timestamp(row.get(1)?, row.get(2)?).map_err(to_sqlite_error)?,
                active_app: row.get(3)?,
                transcript: serde_json::from_str(&row.get::<_, String>(4)?)
                    .map_err(to_sqlite_error)?,
                intent: serde_json::from_str(&row.get::<_, String>(5)?).map_err(to_sqlite_error)?,
                route: row
                    .get::<_, Option<String>>(6)?
                    .map(|value| serde_json::from_str(&value).map_err(to_sqlite_error))
                    .transpose()?,
                inserted_text: row.get(7)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }
}

impl HistoryRepository for SqliteStore {
    fn push(&self, entry: HistoryEntry) {
        let _ = self.try_push_history(&entry);
    }

    fn try_push(&self, entry: HistoryEntry) -> std::result::Result<(), String> {
        self.try_push_history(&entry)
            .map_err(|error| error.to_string())
    }

    fn recent(&self, limit: usize) -> Vec<HistoryEntry> {
        self.try_recent_history(limit).unwrap_or_default()
    }

    fn purge(&self) {
        let _ = self.try_purge_history();
    }
}

impl EventBus for SqliteStore {
    fn publish(&self, event: Event) {
        let _ = self.try_publish_event(&event);
    }

    fn recent(&self) -> Vec<Event> {
        self.try_recent_events().unwrap_or_default()
    }
}

fn unix_timestamp() -> i64 {
    OffsetDateTime::now_utc().unix_timestamp()
}

fn timestamp(
    seconds: i64,
    nanos: u32,
) -> std::result::Result<OffsetDateTime, time::error::ComponentRange> {
    OffsetDateTime::from_unix_timestamp(seconds)?.replace_nanosecond(nanos)
}

fn to_sqlite_error(error: impl std::fmt::Display) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        0,
        rusqlite::types::Type::Text,
        Box::new(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            error.to_string(),
        )),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use sori_core::{
        AudioChunk, AudioFormat, EventKind, FastIntent, ModelId, ModelRoute, SampleFormat,
        Transcript,
    };
    use tempfile::NamedTempFile;
    use uuid::Uuid;

    fn history(id: Uuid, text: &str) -> HistoryEntry {
        HistoryEntry {
            id,
            at: OffsetDateTime::now_utc(),
            active_app: Some("editor".into()),
            transcript: Transcript::plain(text),
            intent: FastIntent::Dictation { text: text.into() },
            route: Some(ModelRoute {
                provider: "local".into(),
                model: ModelId::from("tiny"),
                reason: "test".into(),
                fallback: vec![],
            }),
            inserted_text: Some(text.into()),
        }
    }

    struct BenchmarkProvider;
    impl sori_core::ModelProvider for BenchmarkProvider {
        fn provider_name(&self) -> &'static str {
            "deterministic-test-provider"
        }
        fn can_transcribe(&self, _: &ModelId) -> bool {
            true
        }
        fn transcribe(
            &self,
            _: &ModelId,
            _: &[AudioChunk],
        ) -> std::result::Result<Transcript, sori_core::ModelError> {
            Ok(Transcript::plain("ok"))
        }
    }

    #[test]
    fn benchmark_provenance_migrates_and_survives_reopen() {
        let database = NamedTempFile::new().unwrap();
        let input = sori_core::BenchmarkInput {
            model: ModelId::from("test-model"),
            audio: vec![AudioChunk {
                captured_at: OffsetDateTime::UNIX_EPOCH,
                format: AudioFormat {
                    sample_rate_hz: 100,
                    channels: 1,
                    sample_format: SampleFormat::F32,
                },
                samples: vec![0.25; 100],
            }],
            reference: None,
            iterations: 2,
        };
        let result = sori_core::run_benchmark(&BenchmarkProvider, &input).unwrap();
        assert_eq!(
            result.provenance.evidence_class,
            sori_core::EvidenceClass::DeterministicTest
        );
        assert_eq!(result.provenance.audio_bytes, Some(400));
        {
            SqliteStore::open(database.path())
                .unwrap()
                .save_benchmark(&result)
                .unwrap();
        }
        let reopened = SqliteStore::open(database.path()).unwrap();
        let persisted = reopened.recent_benchmarks(1).unwrap().pop().unwrap();
        assert_eq!(persisted.provenance, result.provenance);
    }
    #[test]
    fn legacy_benchmark_rows_gain_explicit_unverified_provenance() {
        let database = NamedTempFile::new().unwrap();
        let store = SqliteStore::open(database.path()).unwrap();
        let input = sori_core::BenchmarkInput {
            model: ModelId::from("legacy-model"),
            audio: vec![AudioChunk {
                captured_at: OffsetDateTime::UNIX_EPOCH,
                format: AudioFormat {
                    sample_rate_hz: 100,
                    channels: 1,
                    sample_format: SampleFormat::F32,
                },
                samples: vec![0.25; 100],
            }],
            reference: None,
            iterations: 1,
        };
        let result = sori_core::run_benchmark(&BenchmarkProvider, &input).unwrap();
        let mut legacy = serde_json::to_value(&result).unwrap();
        legacy.as_object_mut().unwrap().remove("provenance");
        store
            .connection()
            .unwrap()
            .execute(
                "INSERT INTO benchmark_runs (id, at, result_json) VALUES (?1, ?2, ?3)",
                params![
                    Uuid::new_v4().to_string(),
                    unix_timestamp(),
                    legacy.to_string()
                ],
            )
            .unwrap();
        let persisted = store.recent_benchmarks(1).unwrap().pop().unwrap();
        assert_eq!(persisted.provenance.manifest_version, 0);
        assert_eq!(
            persisted.provenance.reference_absent_reason.as_deref(),
            Some("legacy benchmark row without provenance manifest")
        );
    }

    #[test]
    fn history_round_trips_in_a_temp_database() {
        let database = NamedTempFile::new().unwrap();
        let store = SqliteStore::open(database.path()).unwrap();
        let entry = history(Uuid::new_v4(), "hello");
        store.try_push_history(&entry).unwrap();
        assert_eq!(store.try_recent_history(20).unwrap(), vec![entry]);
        store.try_purge_history().unwrap();
        assert!(store.try_recent_history(20).unwrap().is_empty());
    }

    #[test]
    fn deleting_one_history_entry_preserves_other_entries() {
        let database = NamedTempFile::new().unwrap();
        let first = history(Uuid::new_v4(), "first");
        let second = history(Uuid::new_v4(), "second");
        let store = SqliteStore::open(database.path()).unwrap();
        store.try_push_history(&first).unwrap();
        store.try_push_history(&second).unwrap();
        assert!(store.try_delete_history(first.id).unwrap());
        assert!(!store.try_delete_history(first.id).unwrap());
        assert_eq!(store.try_recent_history(20).unwrap(), vec![second]);
    }

    #[test]
    fn history_survives_reopen_and_retention_is_deterministic() {
        let database = NamedTempFile::new().unwrap();
        let first = history(Uuid::new_v4(), "first");
        let second = history(Uuid::new_v4(), "second");
        {
            let store = SqliteStore::open(database.path()).unwrap();
            store.try_push_history(&first).unwrap();
            store.try_push_history(&second).unwrap();
            assert_eq!(store.try_retain_history(1).unwrap(), 1);
        }
        let reopened = SqliteStore::open(database.path()).unwrap();
        assert_eq!(reopened.try_recent_history(20).unwrap().len(), 1);
        assert_eq!(reopened.try_recent_history(20).unwrap()[0].id, second.id);
    }

    #[test]
    fn events_round_trip_in_order() {
        let database = NamedTempFile::new().unwrap();
        let store = SqliteStore::open(database.path()).unwrap();
        let event = Event {
            id: Uuid::new_v4(),
            at: OffsetDateTime::now_utc(),
            kind: EventKind::AudioStarted,
            payload: sori_core::event::serde_json_like::Value::String("ok".into()),
        };
        store.try_publish_event(&event).unwrap();
        assert_eq!(store.try_recent_events().unwrap(), vec![event]);
    }

    #[test]
    fn resources_survive_reopen_and_update_atomically() {
        let database = NamedTempFile::new().unwrap();
        {
            let store = SqliteStore::open(database.path()).unwrap();
            store
                .set_resource("settings", &serde_json::json!({"hotkey":"Alt+Space"}))
                .unwrap();
            store
                .set_resource(
                    "vocabulary",
                    &serde_json::json!([{"id":"vocab-sori","term":"Sori"}]),
                )
                .unwrap();
            store
                .set_resource(
                    "snippets",
                    &serde_json::json!([{"id":"snippet-1","text":"hello"}]),
                )
                .unwrap();
            store
                .set_resource(
                    "route",
                    &serde_json::json!({"activeModelId":"whisper.cpp/base"}),
                )
                .unwrap();
            store
                .set_resource("models", &serde_json::json!([{"id":"whisper.cpp/base"}]))
                .unwrap();
            store
                .set_resource(
                    "preferences",
                    &serde_json::json!({"version":1,"sidebarCollapsed":true,"sidebarWidth":312}),
                )
                .unwrap();
        }
        let reopened = SqliteStore::open(database.path()).unwrap();
        assert_eq!(
            reopened.resource("settings").unwrap().unwrap()["hotkey"],
            "Alt+Space"
        );
        assert_eq!(
            reopened.resource("vocabulary").unwrap().unwrap()[0]["term"],
            "Sori"
        );
        assert_eq!(
            reopened.resource("snippets").unwrap().unwrap()[0]["text"],
            "hello"
        );
        assert_eq!(
            reopened.resource("route").unwrap().unwrap()["activeModelId"],
            "whisper.cpp/base"
        );
        assert_eq!(
            reopened.resource("models").unwrap().unwrap()[0]["id"],
            "whisper.cpp/base"
        );
        assert_eq!(
            reopened.resource("preferences").unwrap().unwrap()["sidebarWidth"],
            312
        );
        store_resource_update(&reopened);
        assert_eq!(
            reopened.resource("settings").unwrap().unwrap()["hotkey"],
            "Ctrl+Space"
        );
        assert!(reopened.delete_resource("snippets").unwrap());
        assert!(reopened.resource("snippets").unwrap().is_none());
        assert!(!reopened.delete_resource("snippets").unwrap());
    }

    fn store_resource_update(store: &SqliteStore) {
        store
            .set_resource("settings", &serde_json::json!({"hotkey":"Ctrl+Space"}))
            .unwrap();
    }

    #[test]
    fn deleting_hotkey_setting_removes_restart_compatibility_mirror() {
        let database = NamedTempFile::new().unwrap();
        let store = SqliteStore::open(database.path()).unwrap();
        store
            .set_setting("hotkey.binding", &serde_json::json!("Ctrl+Space"))
            .unwrap();
        store
            .set_resource(
                "settings",
                &serde_json::json!({"hotkey":"Ctrl+Space","sidebarCollapsed":false}),
            )
            .unwrap();
        assert!(store.delete_setting("hotkey.binding").unwrap());
        assert_eq!(store.setting("hotkey.binding").unwrap(), None);
        assert_eq!(
            store.resource("settings").unwrap(),
            Some(serde_json::json!({"sidebarCollapsed":false}))
        );
        drop(store);
        let reopened = SqliteStore::open(database.path()).unwrap();
        assert_eq!(reopened.setting("hotkey.binding").unwrap(), None);
        assert_eq!(
            reopened.resource("settings").unwrap(),
            Some(serde_json::json!({"sidebarCollapsed":false}))
        );
    }

    #[test]
    fn events_and_settings_survive_reopen() {
        let database = NamedTempFile::new().unwrap();
        let event = Event {
            id: Uuid::new_v4(),
            at: OffsetDateTime::now_utc(),
            kind: EventKind::DaemonReady,
            payload: sori_core::event::serde_json_like::Value::Null,
        };
        {
            let store = SqliteStore::open(database.path()).unwrap();
            store.try_publish_event(&event).unwrap();
            store
                .set_setting("hotkey.binding", &serde_json::json!("Ctrl+Space"))
                .unwrap();
        }
        let reopened = SqliteStore::open(database.path()).unwrap();
        assert_eq!(reopened.try_recent_events().unwrap(), vec![event]);
        assert_eq!(
            reopened.setting("hotkey.binding").unwrap(),
            Some(serde_json::json!("Ctrl+Space"))
        );
    }

    #[test]
    fn settings_and_routes_round_trip() {
        let database = NamedTempFile::new().unwrap();
        let store = SqliteStore::open(database.path()).unwrap();
        store
            .set_setting("privacy.mode", &serde_json::json!("local-only"))
            .unwrap();
        store
            .save_model_manifest("whisper", &serde_json::json!({"version": 1, "source": "C:/Users/test/models/ggml-base.en.bin", "sha256": "a".repeat(64), "license": {"name": "Not declared (user-supplied artifact)"}}))
            .unwrap();
        assert_eq!(store.model_manifests().unwrap().len(), 1);
        store
            .save_model_route("default", &serde_json::json!({"model": "whisper"}))
            .unwrap();
        assert_eq!(
            store.setting("privacy.mode").unwrap(),
            Some(serde_json::json!("local-only"))
        );
        assert_eq!(
            store.model_manifest("whisper").unwrap(),
            Some(
                serde_json::json!({"version": 1, "source": "C:/Users/test/models/ggml-base.en.bin", "sha256": "a".repeat(64), "license": {"name": "Not declared (user-supplied artifact)"}})
            )
        );
        assert_eq!(
            store.model_route("default").unwrap(),
            Some(serde_json::json!({"model": "whisper"}))
        );
        drop(store);
        let reopened = SqliteStore::open(database.path()).unwrap();
        assert_eq!(
            reopened.model_manifest("whisper").unwrap(),
            Some(
                serde_json::json!({"version": 1, "source": "C:/Users/test/models/ggml-base.en.bin", "sha256": "a".repeat(64), "license": {"name": "Not declared (user-supplied artifact)"}})
            )
        );
        assert_eq!(
            reopened.model_route("default").unwrap(),
            Some(serde_json::json!({"model": "whisper"}))
        );
        assert_eq!(
            reopened.model_route("default").unwrap(),
            Some(serde_json::json!({"model": "whisper"}))
        );
        assert!(reopened.delete_model_route("default").unwrap());
        assert!(reopened.model_route("default").unwrap().is_none());
        assert!(reopened.delete_model_manifest("whisper").unwrap());
        assert!(!reopened.delete_model_manifest("whisper").unwrap());
        drop(reopened);
        let after_delete = SqliteStore::open(database.path()).unwrap();
        assert_eq!(after_delete.model_manifest("whisper").unwrap(), None);
    }
}
