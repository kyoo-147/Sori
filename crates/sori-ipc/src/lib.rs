//! Local IPC contracts and replaceable transports for Sori clients.
//!
//! The protocol is deliberately request/response based and contains no UI or
//! platform transport code. The mock transport is useful for clients and
//! daemon tests; named pipes (Windows) and Unix sockets can implement the same
//! [`Transport`] trait later.

use serde::{Deserialize, Serialize};
use sori_core::{
    AudioChunk, BenchmarkResult, Event, EventKind, ModelId, PrivacyMode, ProfileMode, Transcript,
    event::serde_json_like,
};
use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use thiserror::Error;
use time::OffsetDateTime;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream as TokioTcpStream};
use uuid::Uuid;

pub const PROTOCOL_VERSION: u16 = 1;
pub const DEFAULT_ENDPOINT: &str = "127.0.0.1:17373";
/// Socket bounds keep native UI calls from waiting on a stalled daemon.
pub const IPC_CONNECT_TIMEOUT: std::time::Duration = std::time::Duration::from_millis(500);
pub const IPC_IO_TIMEOUT: std::time::Duration = std::time::Duration::from_millis(750);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Request {
    Status,
    /// Submit one captured audio buffer to the daemon's configured provider.
    DictationStart,
    DictationStop,
    DictationCancel,
    Dictation {
        model: ModelId,
        audio: Vec<AudioChunk>,
    },
    VoiceEdit {
        selection: sori_core::VoiceEditSelection,
        instruction: String,
        approved: bool,
    },
    RunBenchmark {
        model: ModelId,
        audio: Vec<AudioChunk>,
        reference: Option<String>,
        iterations: u16,
        #[serde(default)]
        session_id: Option<Uuid>,
        #[serde(default)]
        timeout_ms: Option<u64>,
    },
    CancelBenchmark {
        session_id: Uuid,
    },
    RecentBenchmarks {
        limit: u16,
    },
    ApplyBenchmarkRecommendation {
        model: Option<ModelId>,
    },
    Doctor,
    ConfigSummary,
    /// Enumerate the daemon's provider-owned model catalog and readiness.
    Models,
    ModelStatus {
        model: ModelId,
    },
    ModelLoad {
        model: ModelId,
    },
    ModelUnload {
        model: ModelId,
    },
    ModelInstall {
        model: ModelId,
        source: String,
        expected_sha256: String,
    },
    ModelRemove {
        model: ModelId,
    },
    RecentHistory {
        limit: u16,
    },
    PurgeHistory,
    DeleteHistory {
        id: Uuid,
    },
    SetConfig {
        key: String,
        value: serde_json::Value,
    },
    ResourceGet {
        resource: String,
    },
    ResourceSet {
        resource: String,
        value: serde_json::Value,
    },
    RecentEvents {
        limit: u16,
    },
    Pause,
    Resume,
    ExtensionsList,
    ExtensionInstall {
        manifest: ExtensionManifest,
    },
    ExtensionEnable {
        id: String,
    },
    ExtensionDisable {
        id: String,
    },
    ExtensionUninstall {
        id: String,
    },
    ExtensionInvoke {
        id: String,
        command: String,
        input: serde_json::Value,
    },
}

impl Request {
    /// Provider work gets one admission slot so a second long operation is
    /// rejected promptly while status and cancellation stay responsive.
    fn is_long_running(&self) -> bool {
        matches!(
            self,
            Self::DictationStart
                | Self::Dictation { .. }
                | Self::DictationStop
                | Self::RunBenchmark { .. }
        )
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum Response {
    Status(StatusResponse),
    Doctor(DoctorResponse),
    ConfigSummary(ConfigSummaryResponse),
    Models(ModelsResponse),
    ModelStatus(ModelStatusResponse),
    RecentEvents(RecentEventsResponse),
    Resource(ResourceResponse),
    RecentHistory(RecentHistoryResponse),
    Error(IpcErrorResponse),
    Control(ControlResponse),
    Transcript(Transcript),
    VoiceEdit(sori_core::VoiceEditResponse),
    Extensions(ExtensionsResponse),
    Benchmark(BenchmarkResult),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StatusResponse {
    pub protocol_version: u16,
    pub daemon_version: String,
    pub running: bool,
    pub activity: RuntimeActivity,
    pub paused: bool,
    pub hotkey: String,
    pub route: RouteSummary,
    pub profile: ProfileMode,
    pub privacy: PrivacyMode,
}

/// Activity reports only lifecycle states implemented by the daemon. It does
/// not imply that audio capture, ASR, or injection is available.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RuntimeActivity {
    Idle,
    Paused,
    Error,
    Stopping,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct RouteSummary {
    pub prefer_local: bool,
    pub allow_cloud: bool,
    pub prefer_warm_runtime: bool,
    pub optimize_battery: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DoctorResponse {
    pub status: StatusResponse,
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
    pub history_retention_limit: u32,
    pub hotkey: String,
    pub route: RouteSummary,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelsResponse {
    pub provider: Option<String>,
    pub available: bool,
    pub models: Vec<ModelRecord>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelRecord {
    pub manifest: sori_core::ModelManifest,
    pub status: sori_core::RuntimeStatus,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelStatusResponse {
    pub provider: String,
    pub status: sori_core::RuntimeStatus,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecentEventsResponse {
    pub events: Vec<IpcEvent>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecentHistoryResponse {
    pub entries: Vec<sori_core::HistoryEntry>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResourceResponse {
    pub resource: String,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IpcErrorResponse {
    pub code: String,
    pub detail: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ControlResponse {
    pub accepted: bool,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExtensionManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub entrypoint: String,
    pub permissions: Vec<String>,
    pub license: String,
    pub license_url: Option<String>,
    pub package_sha256: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExtensionRecord {
    pub manifest: ExtensionManifest,
    pub state: String,
    pub installed_at: i64,
    pub updated_at: i64,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExtensionsResponse {
    pub extensions: Vec<ExtensionRecord>,
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

#[derive(Debug, Error, Clone)]
pub enum IpcError {
    #[error("daemon is unavailable")]
    Unavailable,
    #[error("transport error: {0}")]
    Transport(String),
    #[error("unexpected response for {request:?}")]
    UnexpectedResponse { request: Box<Request> },
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
        let mut stream =
            TcpStream::connect_timeout(&self.endpoint, IPC_CONNECT_TIMEOUT).map_err(|error| {
                if error.kind() == std::io::ErrorKind::TimedOut {
                    IpcError::Transport("IPC connect timed out".into())
                } else {
                    IpcError::Unavailable
                }
            })?;
        stream
            .set_read_timeout(Some(IPC_IO_TIMEOUT))
            .and_then(|_| stream.set_write_timeout(Some(IPC_IO_TIMEOUT)))
            .map_err(|error| IpcError::Transport(error.to_string()))?;
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
        let long_operation_gate = Arc::new(AtomicBool::new(false));
        loop {
            let (stream, _) = self
                .listener
                .accept()
                .await
                .map_err(|e| IpcError::Transport(e.to_string()))?;
            let handler = Arc::clone(&handler);
            let long_operation_gate = Arc::clone(&long_operation_gate);
            tokio::spawn(async move {
                let _ = serve_connection(stream, handler, long_operation_gate).await;
            });
        }
    }
}

async fn serve_connection<F>(
    mut stream: TokioTcpStream,
    handler: Arc<F>,
    long_operation_gate: Arc<AtomicBool>,
) -> Result<(), IpcError>
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
    // Runtime handlers may stop audio, run Whisper, inject text, or touch
    // SQLite. Keep that blocking work off Tokio's I/O workers so a stalled
    // operation cannot delay Status, Doctor, or RecentEvents connections.
    let permit = if request.is_long_running() {
        Some(
            long_operation_gate
                .compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed)
                .is_ok(),
        )
    } else {
        None
    };
    let response = match permit {
        Some(true) => execute_handler(handler, request, Some(long_operation_gate)).await?,
        Some(false) => Response::Error(IpcErrorResponse {
            code: "operation_busy".into(),
            detail: "another long-running dictation or benchmark operation is active".into(),
        }),
        None => execute_handler(handler, request, None).await?,
    };
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

async fn execute_handler<F>(
    handler: Arc<F>,
    request: Request,
    gate: Option<Arc<AtomicBool>>,
) -> Result<Response, IpcError>
where
    F: Fn(Request) -> Result<Response, IpcError> + Send + Sync + 'static,
{
    tokio::task::spawn_blocking(move || {
        // Keep the daemon alive when provider/adapter code panics. Releasing
        // the gate is essential: otherwise every later long operation is
        // permanently reported as operation_busy.
        let response = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| handler(request)))
            .map_err(|_| IpcError::Transport("handler panicked; operation was discarded".into()))
            .and_then(|result| result)
            .unwrap_or_else(|error| {
                Response::Error(IpcErrorResponse {
                    code: "operation_failed".into(),
                    detail: error.to_string(),
                })
            });
        if let Some(gate) = gate {
            gate.store(false, Ordering::Release);
        }
        response
    })
    .await
    .map_err(|error| IpcError::Transport(format!("IPC handler task failed: {error}")))
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
                    activity: RuntimeActivity::Idle,
                    paused: false,
                    hotkey: "Alt+Space".into(),
                    route: RouteSummary {
                        prefer_local: true,
                        allow_cloud: true,
                        prefer_warm_runtime: false,
                        optimize_battery: false,
                    },
                    profile: ProfileMode::Basic,
                    privacy: PrivacyMode::LocalOnly,
                },
                config: ConfigSummaryResponse {
                    profile: ProfileMode::Basic,
                    privacy: PrivacyMode::LocalOnly,
                    history_enabled: false,
                    history_retention_limit: 20,
                    hotkey: "Alt+Space".into(),
                    route: RouteSummary {
                        prefer_local: true,
                        allow_cloud: true,
                        prefer_warm_runtime: false,
                        optimize_battery: false,
                    },
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
        let mut state = self
            .state
            .lock()
            .map_err(|_| IpcError::Transport("state lock poisoned".into()))?;
        Ok(match request {
            Request::Status => Response::Status(state.status.clone()),
            Request::DictationStart
            | Request::DictationStop
            | Request::DictationCancel
            | Request::Dictation { .. }
            | Request::RunBenchmark { .. }
            | Request::CancelBenchmark { .. }
            | Request::RecentBenchmarks { .. }
            | Request::ApplyBenchmarkRecommendation { .. }
            | Request::Models
            | Request::ModelStatus { .. }
            | Request::ModelLoad { .. }
            | Request::ModelUnload { .. }
            | Request::ModelInstall { .. }
            | Request::ModelRemove { .. } => {
                return Err(IpcError::Transport(
                    "mock transport does not execute dictation".into(),
                ));
            }
            Request::VoiceEdit { .. }
            | Request::ExtensionsList
            | Request::ExtensionInstall { .. }
            | Request::ExtensionEnable { .. }
            | Request::ExtensionDisable { .. }
            | Request::ExtensionUninstall { .. }
            | Request::ExtensionInvoke { .. } => {
                return Err(IpcError::Transport(
                    "mock transport does not execute Voice Edit or manage extensions; connect sorid for canonical evidence".into(),
                ));
            }
            Request::Doctor => Response::Doctor(DoctorResponse {
                status: state.status.clone(),
                checks: state.checks.clone(),
            }),
            Request::ConfigSummary => Response::ConfigSummary(state.config.clone()),
            Request::ResourceGet { resource } => Response::Resource(ResourceResponse {
                resource,
                value: serde_json::json!([]),
            }),
            Request::ResourceSet { resource, value } => {
                Response::Resource(ResourceResponse { resource, value })
            }
            Request::RecentHistory { .. }
            | Request::PurgeHistory
            | Request::DeleteHistory { .. }
            | Request::SetConfig { .. } => {
                return Err(IpcError::Transport(
                    "mock transport does not persist history/config".into(),
                ));
            }
            Request::RecentEvents { limit } => Response::RecentEvents(RecentEventsResponse {
                events: state
                    .events
                    .iter()
                    .rev()
                    .take(usize::from(limit))
                    .cloned()
                    .collect(),
            }),
            request @ (Request::Pause | Request::Resume) => {
                let paused = matches!(request, Request::Pause);
                state.status.paused = paused;
                state.status.activity = if paused {
                    RuntimeActivity::Paused
                } else {
                    RuntimeActivity::Idle
                };
                Response::Control(ControlResponse {
                    accepted: true,
                    detail: if paused {
                        "mock daemon paused"
                    } else {
                        "mock daemon resumed"
                    }
                    .into(),
                })
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_install_and_remove_contract_round_trips() {
        let install = Request::ModelInstall {
            model: ModelId::from("user.bin"),
            source: "C:/Users/me/user.bin".into(),
            expected_sha256: "a".repeat(64),
        };
        assert!(
            matches!(serde_json::from_str::<Request>(&serde_json::to_string(&install).unwrap()).unwrap(), Request::ModelInstall { model, expected_sha256, .. } if model.0 == "user.bin" && expected_sha256.len() == 64)
        );
        let remove = Request::ModelRemove {
            model: ModelId::from("user.bin"),
        };
        assert!(
            matches!(serde_json::from_str::<Request>(&serde_json::to_string(&remove).unwrap()).unwrap(), Request::ModelRemove { model } if model.0 == "user.bin")
        );
    }

    #[test]
    fn model_registry_lifecycle_contract_round_trips_and_preserves_errors() {
        let request = Request::ModelLoad {
            model: ModelId::from("ggml-base.en.bin"),
        };
        let encoded = serde_json::to_string(&request).unwrap();
        assert!(
            matches!(serde_json::from_str::<Request>(&encoded).unwrap(), Request::ModelLoad { model } if model.0 == "ggml-base.en.bin")
        );
        let response = Response::Error(IpcErrorResponse {
            code: "model_unavailable".into(),
            detail: "whisper.cpp executable was not found".into(),
        });
        let decoded: Response =
            serde_json::from_str(&serde_json::to_string(&response).unwrap()).unwrap();
        assert_eq!(decoded, response);
    }

    #[test]
    fn benchmark_recommendation_request_and_route_response_are_json_contracts() {
        let request = Request::ApplyBenchmarkRecommendation {
            model: Some(ModelId::from("whisper.cpp/ready")),
        };
        let encoded = serde_json::to_string(&request).unwrap();
        assert!(
            matches!(serde_json::from_str::<Request>(&encoded).unwrap(), Request::ApplyBenchmarkRecommendation { model } if model.as_ref().is_some_and(|model| model.0 == "whisper.cpp/ready"))
        );
        let response = Response::Resource(ResourceResponse {
            resource: "route".into(),
            value: serde_json::json!({"activeModelId":"whisper.cpp/ready"}),
        });
        let encoded = serde_json::to_string(&response).unwrap();
        assert_eq!(
            serde_json::from_str::<Response>(&encoded).unwrap(),
            response
        );
    }

    #[test]
    fn request_and_response_are_json_contracts() {
        let request = Request::RecentEvents { limit: 3 };
        let encoded = serde_json::to_string(&request).unwrap();
        assert!(serde_json::from_str::<Request>(&encoded).is_ok());
        let response = Response::Status(StatusResponse {
            protocol_version: 1,
            daemon_version: "test".into(),
            running: true,
            activity: RuntimeActivity::Idle,
            paused: false,
            hotkey: "Alt+Space".into(),
            route: RouteSummary {
                prefer_local: true,
                allow_cloud: true,
                prefer_warm_runtime: false,
                optimize_battery: false,
            },
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
                activity: RuntimeActivity::Idle,
                paused: false,
                hotkey: "Alt+Space".into(),
                route: RouteSummary {
                    prefer_local: true,
                    allow_cloud: true,
                    prefer_warm_runtime: false,
                    optimize_battery: false,
                },
                profile: ProfileMode::Basic,
                privacy: PrivacyMode::LocalOnly,
            })),
            _ => Err(IpcError::UnexpectedResponse {
                request: Box::new(request),
            }),
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
    async fn stalled_daemon_is_bounded_by_the_socket_deadline() {
        let server = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = server.local_addr().unwrap();
        let task = tokio::spawn(async move {
            let (_stream, _) = server.accept().await.unwrap();
            std::thread::sleep(std::time::Duration::from_millis(100));
        });
        let client = LocalIpcClient::connect_to(endpoint).unwrap();
        let started = std::time::Instant::now();
        let response = tokio::task::spawn_blocking(move || client.request(Request::Status))
            .await
            .unwrap();
        assert!(response.is_err());
        assert!(started.elapsed() < IPC_IO_TIMEOUT + std::time::Duration::from_millis(500));
        task.await.unwrap();
    }

    #[tokio::test(flavor = "current_thread")]
    async fn stalled_handler_does_not_block_status() {
        let server = LocalIpcServer::bind("127.0.0.1:0".parse().unwrap())
            .await
            .unwrap();
        let endpoint = server.local_addr().unwrap();
        let gate = Arc::new(std::sync::Barrier::new(2));
        let handler_gate = Arc::clone(&gate);
        let task = tokio::spawn(server.serve(move |request| match request {
            Request::DictationStop => {
                handler_gate.wait();
                std::thread::sleep(std::time::Duration::from_millis(250));
                Ok(Response::Control(ControlResponse {
                    accepted: true,
                    detail: "stalled operation completed".into(),
                }))
            }
            Request::Status => Ok(Response::Status(StatusResponse {
                protocol_version: PROTOCOL_VERSION,
                daemon_version: "test".into(),
                running: true,
                activity: RuntimeActivity::Idle,
                paused: false,
                hotkey: "Alt+Space".into(),
                route: RouteSummary {
                    prefer_local: true,
                    allow_cloud: true,
                    prefer_warm_runtime: false,
                    optimize_battery: false,
                },
                profile: ProfileMode::Basic,
                privacy: PrivacyMode::LocalOnly,
            })),
            _ => Err(IpcError::UnexpectedResponse {
                request: Box::new(request),
            }),
        }));

        let stop = tokio::task::spawn_blocking(move || {
            LocalIpcClient::connect_to(endpoint)
                .unwrap()
                .request(Request::DictationStop)
                .unwrap()
        });
        tokio::task::spawn_blocking(move || gate.wait())
            .await
            .unwrap();
        let started = std::time::Instant::now();
        let status = tokio::task::spawn_blocking(move || {
            LocalIpcClient::connect_to(endpoint)
                .unwrap()
                .request(Request::Status)
                .unwrap()
        })
        .await
        .unwrap();

        assert!(matches!(status, Response::Status(status) if status.running));
        assert!(started.elapsed() < std::time::Duration::from_millis(150));
        assert!(matches!(stop.await.unwrap(), Response::Control(control) if control.accepted));
        task.abort();
    }

    #[tokio::test(flavor = "current_thread")]
    async fn concurrent_long_operation_is_rejected_without_blocking_status() {
        let server = LocalIpcServer::bind("127.0.0.1:0".parse().unwrap())
            .await
            .unwrap();
        let endpoint = server.local_addr().unwrap();
        let gate = Arc::new(std::sync::Barrier::new(2));
        let handler_gate = Arc::clone(&gate);
        let task = tokio::spawn(server.serve(move |request| match request {
            Request::DictationStop => {
                handler_gate.wait();
                std::thread::sleep(std::time::Duration::from_millis(200));
                Ok(Response::Control(ControlResponse {
                    accepted: true,
                    detail: "done".into(),
                }))
            }
            Request::Status => Ok(Response::Status(StatusResponse {
                protocol_version: PROTOCOL_VERSION,
                daemon_version: "test".into(),
                running: true,
                activity: RuntimeActivity::Idle,
                paused: false,
                hotkey: "Alt+Space".into(),
                route: RouteSummary {
                    prefer_local: true,
                    allow_cloud: true,
                    prefer_warm_runtime: false,
                    optimize_battery: false,
                },
                profile: ProfileMode::Basic,
                privacy: PrivacyMode::LocalOnly,
            })),
            _ => Err(IpcError::UnexpectedResponse {
                request: Box::new(request),
            }),
        }));
        let first = tokio::task::spawn_blocking(move || {
            LocalIpcClient::connect_to(endpoint)
                .unwrap()
                .request(Request::DictationStop)
        });
        tokio::task::spawn_blocking(move || gate.wait())
            .await
            .unwrap();
        let started = std::time::Instant::now();
        let second = tokio::task::spawn_blocking(move || {
            LocalIpcClient::connect_to(endpoint)
                .unwrap()
                .request(Request::DictationStop)
        })
        .await
        .unwrap()
        .unwrap();
        assert!(started.elapsed() < std::time::Duration::from_millis(150));
        assert!(matches!(second, Response::Error(error) if error.code == "operation_busy"));
        let status = tokio::task::spawn_blocking(move || {
            LocalIpcClient::connect_to(endpoint)
                .unwrap()
                .request(Request::Status)
        })
        .await
        .unwrap()
        .unwrap();
        assert!(matches!(status, Response::Status(status) if status.running));
        assert!(
            matches!(first.await.unwrap().unwrap(), Response::Control(control) if control.accepted)
        );
        task.abort();
    }

    #[tokio::test]
    async fn cancellation_is_admitted_while_long_operation_runs() {
        let server = LocalIpcServer::bind("127.0.0.1:0".parse().unwrap())
            .await
            .unwrap();
        let endpoint = server.local_addr().unwrap();
        let gate = Arc::new(std::sync::Barrier::new(2));
        let handler_gate = Arc::clone(&gate);
        let task = tokio::spawn(server.serve(move |request| match request {
            Request::DictationStop => {
                handler_gate.wait();
                std::thread::sleep(std::time::Duration::from_millis(200));
                Ok(Response::Control(ControlResponse {
                    accepted: true,
                    detail: "stopped".into(),
                }))
            }
            Request::DictationCancel => Ok(Response::Control(ControlResponse {
                accepted: true,
                detail: "cancel requested".into(),
            })),
            _ => Err(IpcError::UnexpectedResponse {
                request: Box::new(request),
            }),
        }));
        let stop = tokio::task::spawn_blocking(move || {
            LocalIpcClient::connect_to(endpoint)
                .unwrap()
                .request(Request::DictationStop)
        });
        tokio::task::spawn_blocking(move || gate.wait())
            .await
            .unwrap();
        let started = std::time::Instant::now();
        let cancel = tokio::task::spawn_blocking(move || {
            LocalIpcClient::connect_to(endpoint)
                .unwrap()
                .request(Request::DictationCancel)
        })
        .await
        .unwrap()
        .unwrap();
        assert!(started.elapsed() < std::time::Duration::from_millis(150));
        assert!(matches!(cancel, Response::Control(control) if control.accepted));
        assert!(
            matches!(stop.await.unwrap().unwrap(), Response::Control(control) if control.accepted)
        );
        task.abort();
    }

    #[tokio::test]
    async fn bind_refuses_an_endpoint_already_owned() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = listener.local_addr().unwrap();
        let error = match LocalIpcServer::bind(endpoint).await {
            Ok(_) => panic!("second server unexpectedly acquired an owned endpoint"),
            Err(error) => error,
        };
        assert!(error.to_string().contains("address") || error.to_string().contains("Only one"));
        drop(listener);
    }

    #[tokio::test]
    async fn repeated_calls_remain_independent_and_complete() {
        let server = LocalIpcServer::bind("127.0.0.1:0".parse().unwrap())
            .await
            .unwrap();
        let endpoint = server.local_addr().unwrap();
        let task = tokio::spawn(server.serve(|request| match request {
            Request::Status => Ok(Response::Status(StatusResponse {
                protocol_version: PROTOCOL_VERSION,
                daemon_version: "test".into(),
                running: true,
                activity: RuntimeActivity::Idle,
                paused: false,
                hotkey: "Alt+Space".into(),
                route: RouteSummary {
                    prefer_local: true,
                    allow_cloud: true,
                    prefer_warm_runtime: false,
                    optimize_battery: false,
                },
                profile: ProfileMode::Basic,
                privacy: PrivacyMode::LocalOnly,
            })),
            _ => Err(IpcError::UnexpectedResponse {
                request: Box::new(request),
            }),
        }));
        for _ in 0..20 {
            let client = LocalIpcClient::connect_to(endpoint).unwrap();
            let response = tokio::task::spawn_blocking(move || client.request(Request::Status))
                .await
                .unwrap()
                .unwrap();
            assert!(matches!(response, Response::Status(status) if status.running));
        }
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
            matches!(client.request(Request::Status).unwrap(), Response::Status(status) if status.running && !status.paused && status.activity == RuntimeActivity::Idle)
        );
        client.request(Request::Pause).unwrap();
        assert!(
            matches!(client.request(Request::Status).unwrap(), Response::Status(status) if status.paused && status.activity == RuntimeActivity::Paused)
        );
        client.request(Request::Resume).unwrap();
        assert!(
            matches!(client.request(Request::Status).unwrap(), Response::Status(status) if !status.paused && status.activity == RuntimeActivity::Idle)
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
