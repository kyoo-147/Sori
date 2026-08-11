//! Local IPC contracts and replaceable transports for Sori clients.
//!
//! The protocol is deliberately request/response based and contains no UI or
//! platform transport code. The mock transport is useful for clients and
//! daemon tests; named pipes (Windows) and Unix sockets can implement the same
//! [`Transport`] trait later.

use serde::{Deserialize, Serialize};
use sori_core::{Event, EventKind, PrivacyMode, ProfileMode, event::serde_json_like};
use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::sync::{Arc, Mutex};
use thiserror::Error;
use time::OffsetDateTime;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream as TokioTcpStream};
use uuid::Uuid;

pub const PROTOCOL_VERSION: u16 = 1;
pub const DEFAULT_ENDPOINT: &str = "127.0.0.1:17373";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Request {
    Status,
    Doctor,
    ConfigSummary,
    RecentEvents { limit: u16 },
    Pause,
    Resume,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum Response {
    Status(StatusResponse),
    Doctor(DoctorResponse),
    ConfigSummary(ConfigSummaryResponse),
    RecentEvents(RecentEventsResponse),
    Control(ControlResponse),
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ControlResponse {
    pub accepted: bool,
    pub detail: String,
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
    #[error("invalid IPC message: {0}")]
    Protocol(String),
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

/// HTTP/JSON client restricted to the loopback endpoint.
pub struct LocalIpcClient {
    endpoint: SocketAddr,
}

impl LocalIpcClient {
    pub fn connect() -> Result<Client<Self>, IpcError> {
        Self::connect_to(DEFAULT_ENDPOINT.parse().expect("valid default endpoint"))
    }

    pub fn connect_to(endpoint: SocketAddr) -> Result<Client<Self>, IpcError> {
        if endpoint.ip() != std::net::IpAddr::V4(Ipv4Addr::LOCALHOST) {
            return Err(IpcError::Transport("IPC endpoint must be 127.0.0.1".into()));
        }
        Ok(Client::new(Self { endpoint }))
    }
}

impl Transport for LocalIpcClient {
    fn send(&self, request: Request) -> Result<Response, IpcError> {
        let body = serde_json::to_vec(&request).map_err(|e| IpcError::Protocol(e.to_string()))?;
        let mut stream = TcpStream::connect(self.endpoint).map_err(|_| IpcError::Unavailable)?;
        let header = format!(
            "POST /ipc HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        );
        stream
            .write_all(header.as_bytes())
            .map_err(|e| IpcError::Transport(e.to_string()))?;
        stream
            .write_all(&body)
            .map_err(|e| IpcError::Transport(e.to_string()))?;
        let mut bytes = Vec::new();
        stream
            .read_to_end(&mut bytes)
            .map_err(|e| IpcError::Transport(e.to_string()))?;
        let separator = bytes
            .windows(4)
            .position(|window| window == b"\r\n\r\n")
            .ok_or_else(|| IpcError::Protocol("missing HTTP headers".into()))?;
        let status = String::from_utf8_lossy(&bytes[..separator]);
        if !status.contains(" 200 ") {
            return Err(IpcError::Transport(
                status.lines().next().unwrap_or("HTTP error").into(),
            ));
        }
        serde_json::from_slice(&bytes[separator + 4..])
            .map_err(|e| IpcError::Protocol(e.to_string()))
    }
}

pub struct LocalIpcServer {
    listener: TcpListener,
}

impl LocalIpcServer {
    pub async fn bind(endpoint: SocketAddr) -> Result<Self, IpcError> {
        if endpoint.ip() != std::net::IpAddr::V4(Ipv4Addr::LOCALHOST) {
            return Err(IpcError::Transport("IPC endpoint must be 127.0.0.1".into()));
        }
        Ok(Self {
            listener: TcpListener::bind(endpoint)
                .await
                .map_err(|e| IpcError::Transport(e.to_string()))?,
        })
    }

    pub fn local_addr(&self) -> Result<SocketAddr, IpcError> {
        self.listener
            .local_addr()
            .map_err(|e| IpcError::Transport(e.to_string()))
    }

    pub async fn serve<F>(self, handler: F) -> Result<(), IpcError>
    where
        F: Fn(Request) -> Result<Response, IpcError> + Send + Sync + 'static,
    {
        let handler = Arc::new(handler);
        loop {
            let (stream, _) = self
                .listener
                .accept()
                .await
                .map_err(|e| IpcError::Transport(e.to_string()))?;
            let handler = Arc::clone(&handler);
            tokio::spawn(async move {
                let _ = serve_connection(stream, handler).await;
            });
        }
    }
}

async fn serve_connection<F>(mut stream: TokioTcpStream, handler: Arc<F>) -> Result<(), IpcError>
where
    F: Fn(Request) -> Result<Response, IpcError> + Send + Sync + 'static,
{
    let mut bytes = Vec::new();
    let mut chunk = [0u8; 4096];
    let header_end;
    loop {
        let count = stream
            .read(&mut chunk)
            .await
            .map_err(|e| IpcError::Transport(e.to_string()))?;
        if count == 0 {
            return Err(IpcError::Protocol("empty request".into()));
        }
        bytes.extend_from_slice(&chunk[..count]);
        if let Some(pos) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
            header_end = pos;
            break;
        }
        if bytes.len() > 16 * 1024 {
            return Err(IpcError::Protocol("request headers too large".into()));
        }
    }
    let headers = String::from_utf8_lossy(&bytes[..header_end]);
    let length = headers
        .lines()
        .find_map(|line| {
            line.strip_prefix("Content-Length:")
                .or_else(|| line.strip_prefix("content-length:"))
                .and_then(|v| v.trim().parse::<usize>().ok())
        })
        .ok_or_else(|| IpcError::Protocol("missing content length".into()))?;
    if length > 1024 * 1024 {
        return Err(IpcError::Protocol("request body too large".into()));
    }
    let body_start = header_end + 4;
    while bytes.len() < body_start + length {
        let count = stream
            .read(&mut chunk)
            .await
            .map_err(|e| IpcError::Transport(e.to_string()))?;
        if count == 0 {
            return Err(IpcError::Protocol("truncated request".into()));
        }
        bytes.extend_from_slice(&chunk[..count]);
    }
    let request: Request = serde_json::from_slice(&bytes[body_start..body_start + length])
        .map_err(|e| IpcError::Protocol(e.to_string()))?;
    let response = handler(request)?;
    let body = serde_json::to_vec(&response).map_err(|e| IpcError::Protocol(e.to_string()))?;
    let header = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream
        .write_all(header.as_bytes())
        .await
        .map_err(|e| IpcError::Transport(e.to_string()))?;
    stream
        .write_all(&body)
        .await
        .map_err(|e| IpcError::Transport(e.to_string()))?;
    Ok(())
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
            Request::Pause | Request::Resume => Response::Control(ControlResponse {
                accepted: true,
                detail: "mock transition accepted".into(),
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

    #[tokio::test]
    async fn local_client_server_roundtrip_uses_ephemeral_loopback_port() {
        let server = LocalIpcServer::bind("127.0.0.1:0".parse().unwrap())
            .await
            .unwrap();
        let endpoint = server.local_addr().unwrap();
        let task = tokio::spawn(server.serve(|request| match request {
            Request::Status => Ok(Response::Status(StatusResponse {
                protocol_version: PROTOCOL_VERSION,
                daemon_version: "test".into(),
                running: true,
                profile: ProfileMode::Basic,
                privacy: PrivacyMode::LocalOnly,
            })),
            _ => Err(IpcError::UnexpectedResponse { request }),
        }));
        let client = LocalIpcClient::connect_to(endpoint).unwrap();
        let response =
            tokio::task::spawn_blocking(move || client.request(Request::Status).unwrap())
                .await
                .unwrap();
        assert!(matches!(response, Response::Status(status) if status.running));
        task.abort();
    }

    #[tokio::test]
    async fn server_rejects_non_loopback_addresses() {
        assert!(
            LocalIpcServer::bind("0.0.0.0:0".parse().unwrap())
                .await
                .is_err()
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
