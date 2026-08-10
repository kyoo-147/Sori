//! Local IPC contracts and replaceable transports for Sori clients.
//!
//! The protocol is deliberately request/response based and contains no UI or
//! platform transport code. The mock transport is useful for clients and
//! daemon tests; named pipes (Windows) and Unix sockets can implement the same
//! [`Transport`] trait later.

use serde::{Deserialize, Serialize};
use sori_core::{Event, EventKind, PrivacyMode, ProfileMode, event::serde_json_like};
use std::sync::{Arc, Mutex};
use thiserror::Error;
use time::OffsetDateTime;
use uuid::Uuid;

pub const PROTOCOL_VERSION: u16 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Request {
    Status,
    Doctor,
    ConfigSummary,
    RecentEvents { limit: u16 },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum Response {
    Status(StatusResponse),
    Doctor(DoctorResponse),
    ConfigSummary(ConfigSummaryResponse),
    RecentEvents(RecentEventsResponse),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StatusResponse {
    pub protocol_version: u16,
    pub daemon_version: String,
    pub running: bool,
    pub profile: ProfileMode,
    pub privacy: PrivacyMode,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DoctorResponse {
    pub checks: Vec<DoctorCheck>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DoctorCheck {
    pub name: String,
    pub ok: bool,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConfigSummaryResponse {
    pub profile: ProfileMode,
    pub privacy: PrivacyMode,
    pub history_enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecentEventsResponse {
    pub events: Vec<IpcEvent>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct IpcEvent {
    pub id: Uuid,
    pub at: OffsetDateTime,
    pub kind: EventKind,
    pub payload: serde_json_like::Value,
}

impl From<Event> for IpcEvent {
    fn from(event: Event) -> Self {
        Self {
            id: event.id,
            at: event.at,
            kind: event.kind,
            payload: event.payload,
        }
    }
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum IpcError {
    #[error("daemon is unavailable")]
    Unavailable,
    #[error("transport error: {0}")]
    Transport(String),
    #[error("unexpected response for {request:?}")]
    UnexpectedResponse { request: Request },
}

/// A synchronous boundary keeps this scaffold cheap for CLI diagnostics and
/// easy to replace with a framed async/socket implementation later.
pub trait Transport: Send + Sync {
    fn send(&self, request: Request) -> Result<Response, IpcError>;
}

pub trait IpcClient {
    fn request(&self, request: Request) -> Result<Response, IpcError>;
}

#[derive(Debug)]
pub struct Client<T> {
    transport: T,
}

impl<T> Client<T> {
    pub fn new(transport: T) -> Self {
        Self { transport }
    }
}

impl<T: Transport> IpcClient for Client<T> {
    fn request(&self, request: Request) -> Result<Response, IpcError> {
        self.transport.send(request)
    }
}

/// Production connection placeholder. It intentionally does not pretend that
/// a daemon is running until a platform transport is installed.
pub struct LocalIpcClient;

impl LocalIpcClient {
    pub fn connect() -> Result<Client<Self>, IpcError> {
        Err(IpcError::Unavailable)
    }
}

impl Transport for LocalIpcClient {
    fn send(&self, _request: Request) -> Result<Response, IpcError> {
        Err(IpcError::Unavailable)
    }
}

#[derive(Debug, Clone)]
pub struct MockIpcServer {
    state: Arc<Mutex<MockState>>,
}

#[derive(Debug, Clone)]
struct MockState {
    status: StatusResponse,
    config: ConfigSummaryResponse,
    checks: Vec<DoctorCheck>,
    events: Vec<IpcEvent>,
}

impl Default for MockIpcServer {
    fn default() -> Self {
        Self {
            state: Arc::new(Mutex::new(MockState {
                status: StatusResponse {
                    protocol_version: PROTOCOL_VERSION,
                    daemon_version: "mock".into(),
                    running: true,
                    profile: ProfileMode::Basic,
                    privacy: PrivacyMode::LocalOnly,
                },
                config: ConfigSummaryResponse {
                    profile: ProfileMode::Basic,
                    privacy: PrivacyMode::LocalOnly,
                    history_enabled: false,
                },
                checks: vec![DoctorCheck {
                    name: "daemon".into(),
                    ok: true,
                    detail: "mock daemon is reachable".into(),
                }],
                events: Vec::new(),
            })),
        }
    }
}

impl MockIpcServer {
    pub fn client(&self) -> Client<MockTransport> {
        Client::new(MockTransport {
            state: Arc::clone(&self.state),
        })
    }
    pub fn publish(&self, event: Event) {
        self.state
            .lock()
            .expect("mock IPC lock poisoned")
            .events
            .push(event.into());
    }
}

#[derive(Debug, Clone)]
pub struct MockTransport {
    state: Arc<Mutex<MockState>>,
}

impl Transport for MockTransport {
    fn send(&self, request: Request) -> Result<Response, IpcError> {
        let state = self
            .state
            .lock()
            .map_err(|_| IpcError::Transport("state lock poisoned".into()))?;
        Ok(match request {
            Request::Status => Response::Status(state.status.clone()),
            Request::Doctor => Response::Doctor(DoctorResponse {
                checks: state.checks.clone(),
            }),
            Request::ConfigSummary => Response::ConfigSummary(state.config.clone()),
            Request::RecentEvents { limit } => Response::RecentEvents(RecentEventsResponse {
                events: state
                    .events
                    .iter()
                    .rev()
                    .take(usize::from(limit))
                    .cloned()
                    .collect(),
            }),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_and_response_are_json_contracts() {
        let request = Request::RecentEvents { limit: 3 };
        let encoded = serde_json::to_string(&request).unwrap();
        assert_eq!(serde_json::from_str::<Request>(&encoded).unwrap(), request);
        let response = Response::Status(StatusResponse {
            protocol_version: 1,
            daemon_version: "test".into(),
            running: true,
            profile: ProfileMode::Basic,
            privacy: PrivacyMode::LocalOnly,
        });
        let encoded = serde_json::to_string(&response).unwrap();
        assert_eq!(
            serde_json::from_str::<Response>(&encoded).unwrap(),
            response
        );
    }

    #[test]
    fn mock_client_serves_status_and_recent_events() {
        let server = MockIpcServer::default();
        server.publish(Event {
            id: Uuid::new_v4(),
            at: OffsetDateTime::now_utc(),
            kind: EventKind::AudioStarted,
            payload: serde_json_like::Value::Null,
        });
        let client = server.client();
        assert!(
            matches!(client.request(Request::Status).unwrap(), Response::Status(status) if status.running)
        );
        assert_eq!(
            client
                .request(Request::RecentEvents { limit: 10 })
                .unwrap()
                .events_len(),
            1
        );
    }

    trait ResponseExt {
        fn events_len(&self) -> usize;
    }
    impl ResponseExt for Response {
        fn events_len(&self) -> usize {
            match self {
                Response::RecentEvents(events) => events.events.len(),
                _ => 0,
            }
        }
    }
}
