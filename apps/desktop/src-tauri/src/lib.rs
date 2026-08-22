use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex as StdMutex;

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
struct DaemonOwner {
    endpoint: String,
    pid: u32,
    executable: String,
    process_start_time: u64,
    lease_id: String,
}

struct DaemonSupervisor {
    child: StdMutex<Option<Child>>,
    resource_dir: StdMutex<Option<PathBuf>>,
}

impl Default for DaemonSupervisor {
    fn default() -> Self {
        Self {
            child: StdMutex::new(None),
            resource_dir: StdMutex::new(None),
        }
    }
}

impl DaemonSupervisor {
    fn validate_owner_override(path: PathBuf) -> Result<PathBuf, String> {
        if !path.is_absolute() || path.file_name().is_none() || (path.exists() && path.is_dir()) {
            return Err("SORI_DAEMON_OWNER_PATH must be an absolute file path, not a directory".into());
        }
        if let Some(parent) = path.parent() {
            if parent.exists() && !parent.is_dir() {
                return Err("SORI_DAEMON_OWNER_PATH parent must be a directory".into());
            }
        }
        Ok(path)
    }

    fn owner_path_from_override(path: Option<std::ffi::OsString>) -> Result<PathBuf, String> {
        if let Some(path) = path {
            return Self::validate_owner_override(PathBuf::from(path));
        }
        if let Some(root) = std::env::var_os("LOCALAPPDATA") {
            return Ok(PathBuf::from(root).join("Sori").join("daemon-owner.json"));
        }
        Ok(PathBuf::from("sori-daemon-owner.json"))
    }

    fn owner_path() -> Result<PathBuf, String> {
        Self::owner_path_from_override(std::env::var_os("SORI_DAEMON_OWNER_PATH"))
    }

    fn read_owner(path: &std::path::Path) -> Result<Option<DaemonOwner>, String> {
        match std::fs::read_to_string(path) {
            Ok(value) => serde_json::from_str::<DaemonOwner>(&value).map(Some).map_err(|error| format!("invalid daemon owner lease: {error}")),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(format!("cannot read daemon owner lease: {error}")),
        }
    }

    fn process_start_time(pid: u32) -> Option<u64> {
        #[cfg(windows)]
        {
            use windows::Win32::Foundation::{CloseHandle, FILETIME};
            use windows::Win32::System::Threading::{GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
            let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()? };
            let mut creation = FILETIME::default();
            let mut exit = FILETIME::default();
            let mut kernel = FILETIME::default();
            let mut user = FILETIME::default();
            let result = unsafe { GetProcessTimes(process, &mut creation, &mut exit, &mut kernel, &mut user).ok() };
            unsafe { let _ = CloseHandle(process); }
            result?;
            Some((u64::from(creation.dwHighDateTime) << 32) | u64::from(creation.dwLowDateTime))
        }
        #[cfg(not(windows))]
        { let _ = pid; Some(0) }
    }

    fn owned_endpoint(endpoint: std::net::SocketAddr, daemon: &std::path::Path) -> Result<bool, String> {
        let owner = Self::read_owner(&Self::owner_path()?)?;
        Ok(owner.is_some_and(|owner| owner.endpoint == endpoint.to_string()
            && owner.pid != 0
            && owner.lease_id.len() >= 16
            && Self::process_start_time(owner.pid) == Some(owner.process_start_time)
            && std::fs::canonicalize(owner.executable).ok() == std::fs::canonicalize(daemon).ok()))
    }

    fn whisper_runtime_diagnostic(configured: bool) -> Option<&'static str> {
        if configured {
            None
        } else {
            Some("Whisper runtime is external and user-owned; configure SORI_WHISPER_CPP_BIN or Sori's whisper.json when voice is required")
        }
    }
    fn daemon_path(resource_dir: Option<&std::path::Path>) -> PathBuf {
        if let Some(path) = std::env::var_os("SORI_DAEMON_PATH") {
            return PathBuf::from(path);
        }
        let executable_name = if cfg!(windows) { "sorid.exe" } else { "sorid" };
        let parent = std::env::current_exe()
            .ok()
            .and_then(|path| path.parent().map(|parent| parent.to_path_buf()))
            .unwrap_or_else(|| PathBuf::from("."));
        let sibling = parent.join(executable_name);
        if sibling.is_file() {
            sibling
        } else if let Some(resource_dir) = resource_dir {
            resource_dir.join(executable_name)
        } else {
            parent.join("resources").join(executable_name)
        }
    }

    fn parse_endpoint(value: Option<String>) -> Result<std::net::SocketAddr, String> {
        let endpoint: std::net::SocketAddr = value
            .unwrap_or_else(|| sori_ipc::DEFAULT_ENDPOINT.to_owned())
            .parse()
            .map_err(|error| format!("invalid SORI_IPC_ADDR: {error}"))?;
        if !endpoint.ip().is_loopback() {
            return Err("SORI_IPC_ADDR must be a loopback address".into());
        }
        Ok(endpoint)
    }

    fn endpoint() -> Result<std::net::SocketAddr, String> {
        Self::parse_endpoint(std::env::var("SORI_IPC_ADDR").ok())
    }

    fn endpoint_occupied(endpoint: std::net::SocketAddr) -> bool {
        std::net::TcpStream::connect_timeout(&endpoint, std::time::Duration::from_millis(150)).is_ok()
    }

    fn start(&self, resource_dir: Option<&std::path::Path>) -> Result<(), String> {
        Self::owner_path()?;
        if let Some(resource_dir) = resource_dir {
            *self.resource_dir.lock().map_err(|_| "daemon resource lock poisoned".to_string())? = Some(resource_dir.to_path_buf());
        }
        let endpoint = Self::endpoint()?;
        let mut tracked = self.child.lock().map_err(|_| "daemon supervisor lock poisoned".to_string())?;
        if let Some(child) = tracked.as_mut() {
            if child.try_wait().map_err(|error| error.to_string())?.is_none() {
                return Ok(());
            }
            tracked.take();
        }
        if Self::endpoint_occupied(endpoint) {
            let expected = Self::daemon_path(resource_dir);
            if Self::owned_endpoint(endpoint, &expected)? {
                eprintln!("[sori] an owned sorid already serves this desktop; reusing the loopback connection");
                return Ok(());
            }
            return Err(format!("Sori cannot start because its local runtime endpoint is already in use by an unknown process; close that application or choose a separate isolated runtime before retrying (endpoint {endpoint})"));
        }
        let path = Self::daemon_path(resource_dir);
        if !path.is_file() {
            eprintln!("[sori] sorid is not bundled or configured at {}; desktop remains offline", path.display());
            return Ok(());
        }
        let configured_whisper = std::env::var_os("SORI_WHISPER_CPP_BIN").is_some();
        if let Some(message) = Self::whisper_runtime_diagnostic(configured_whisper) {
            eprintln!("[sori] {message}");
        }
        let mut command = Command::new(&path);
        let child = command
            .env("SORI_IPC_ADDR", endpoint.to_string())
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|error| format!("failed to launch sorid at {}: {error}", path.display()))?;
        *tracked = Some(child);
        Ok(())
    }

    fn ensure_running(&self) -> Result<std::net::SocketAddr, String> {
        let endpoint = Self::endpoint()?;
        let resource_dir = self.resource_dir.lock().map_err(|_| "daemon resource lock poisoned".to_string())?.clone();
        self.start(resource_dir.as_deref())?;
        Ok(endpoint)
    }
    fn owner_for_child(child_pid: u32, daemon: &std::path::Path) -> Result<Option<DaemonOwner>, String> {
        let Some(owner) = Self::read_owner(&Self::owner_path()?)? else { return Ok(None); };
        Ok((owner.pid == child_pid
            && owner.process_start_time == Self::process_start_time(child_pid).unwrap_or(u64::MAX)
            && std::fs::canonicalize(&owner.executable).ok() == std::fs::canonicalize(daemon).ok())
        .then_some(owner))
    }

    fn owner_snapshot_is_current(snapshot: &DaemonOwner, current: Option<&DaemonOwner>) -> bool {
        current == Some(snapshot)
    }

    fn remove_owner_if_current(path: &std::path::Path, snapshot: &DaemonOwner) -> Result<(), String> {
        let current = Self::read_owner(path)?;
        if Self::owner_snapshot_is_current(snapshot, current.as_ref()) {
            std::fs::remove_file(path).map_err(|error| format!("failed to remove owned daemon lease: {error}"))?;
        }
        Ok(())
    }

    fn stop(&self) -> Result<(), String> {
        let mut child = self.child.lock().map_err(|_| "daemon supervisor lock poisoned".to_string())?;
        let Some(mut child) = child.take() else {
            return Ok(());
        };
        let child_pid = child.id();
        let daemon = Self::daemon_path(self.resource_dir.lock().ok().and_then(|dir| dir.as_deref().map(PathBuf::from)).as_deref());
        let owner_snapshot = Self::owner_for_child(child_pid, &daemon)?;
        if child.try_wait().ok().flatten().is_none() {
            let _ = child.kill();
            let _ = child.wait();
        }
        // sorid owns lease cleanup; the shell must not delete another
        // generation's lease or touch an unknown process.
        if let Some(snapshot) = owner_snapshot {
            Self::remove_owner_if_current(&Self::owner_path()?, &snapshot)?;
        }
        Ok(())
    }
}
#[cfg(windows)]
fn enforce_custom_window_frame(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_STYLE, SWP_FRAMECHANGED,
        SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WS_CAPTION,
    };

    let hwnd = window.hwnd()?;
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
        let without_caption = style & !(WS_CAPTION.0 as isize);
        if style != without_caption {
            SetWindowLongPtrW(hwnd, GWL_STYLE, without_caption);
            SetWindowPos(
                hwnd,
                None,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED,
            )
            .map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error.to_string())))?;
        }
    }
    Ok(())
}

#[cfg(not(windows))]
fn enforce_custom_window_frame(_window: &tauri::WebviewWindow) -> tauri::Result<()> {
    Ok(())
}
use serde_json::Value;
use sori_ipc::{IpcClient, LocalIpcClient, Request};
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};
use tauri::Manager;

/// Native command boundary for the UI. The daemon remains the owner of IPC,
/// permissions, and all runtime capabilities; Tauri only forwards JSON.
mod commands {
    use super::*;

    const IPC_REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(2);
    const IPC_MAX_IN_FLIGHT: usize = 4;
    static NEXT_REQUEST_ID: AtomicU64 = AtomicU64::new(1);

    pub struct IpcRuntime {
        permits: Arc<tokio::sync::Semaphore>,
        cancellations: Mutex<HashMap<String, Arc<AtomicBool>>>,
    }

    impl Default for IpcRuntime {
        fn default() -> Self {
            Self {
                permits: Arc::new(tokio::sync::Semaphore::new(IPC_MAX_IN_FLIGHT)),
                cancellations: Mutex::new(HashMap::new()),
            }
        }
    }

    fn normalize_request_id(value: Option<String>) -> String {
        let value = value.unwrap_or_default();
        if value.is_empty() {
            format!("ipc-{}", NEXT_REQUEST_ID.fetch_add(1, Ordering::Relaxed))
        } else {
            value.chars().take(128).collect()
        }
    }

    async fn forward_ipc(request: Value, id: &str, runtime: &IpcRuntime, supervisor: &DaemonSupervisor) -> Result<Value, String> {
        let request: Request =
            serde_json::from_value(request).map_err(|error| error.to_string())?;
        let endpoint = supervisor.ensure_running()?;
        let permit = runtime
            .permits
            .clone()
            .try_acquire_owned()
            .map_err(|_| "IPC busy: maximum concurrent requests reached".to_string())?;
        let cancelled = Arc::new(AtomicBool::new(false));
        runtime
            .cancellations
            .lock()
            .map_err(|_| "IPC cancellation registry is unavailable".to_string())?
            .insert(id.to_owned(), Arc::clone(&cancelled));
        let response = tokio::time::timeout(
            IPC_REQUEST_TIMEOUT,
            tauri::async_runtime::spawn_blocking(move || {
                let _permit = permit;
                if cancelled.load(Ordering::Acquire) {
                    return Err("IPC request cancelled".to_string());
                }
                let client = LocalIpcClient::connect_to(endpoint).map_err(|error| error.to_string())?;
                client.request(request).map_err(|error| error.to_string())
            }),
        )
        .await
        .map_err(|_| format!("IPC request {id} timed out after {:?}", IPC_REQUEST_TIMEOUT))?
        .map_err(|error| format!("IPC worker failed: {error}"))??;
        serde_json::to_value(response).map_err(|error| error.to_string())
    }

    #[tauri::command(rename = "sori_ipc")]
    pub async fn sori_ipc(
        request: Value,
        request_id: Option<String>,
        state: tauri::State<'_, IpcRuntime>,
        supervisor: tauri::State<'_, DaemonSupervisor>,
    ) -> Result<Value, String> {
        let id = normalize_request_id(request_id);
        #[cfg(debug_assertions)]
        let started = std::time::Instant::now();
        let result = forward_ipc(request, &id, &state, &supervisor).await;
        if let Ok(mut active) = state.cancellations.lock() {
            active.remove(&id);
        }
        #[cfg(debug_assertions)]
        eprintln!(
            "[sori_ipc] request_id={id} completed_ms={} outcome={}",
            started.elapsed().as_millis(),
            if result.is_ok() { "ok" } else { "error" }
        );
        result
    }

    #[tauri::command(rename = "sori_ipc_cancel")]
    pub fn sori_ipc_cancel(
        request_id: String,
        state: tauri::State<'_, IpcRuntime>,
    ) -> Result<bool, String> {
        let active = state
            .cancellations
            .lock()
            .map_err(|_| "IPC cancellation registry is unavailable".to_string())?;
        Ok(active
            .get(&request_id)
            .map(|flag| {
                flag.store(true, Ordering::Release);
                true
            })
            .unwrap_or(false))
    }

    fn window_error(action: &str, error: impl std::fmt::Display) -> String {
        format!("window {action} failed: {error}")
    }

    #[tauri::command(rename = "window_minimize")]
    pub fn window_minimize(window: tauri::Window) -> Result<(), String> {
        window
            .minimize()
            .map_err(|error| window_error("minimize", error))
    }

    #[tauri::command(rename = "window_maximize")]
    pub fn window_maximize(window: tauri::Window) -> Result<(), String> {
        if !window
            .is_maximized()
            .map_err(|error| window_error("maximize state", error))?
        {
            window
                .maximize()
                .map_err(|error| window_error("maximize", error))?;
        }
        Ok(())
    }

    #[tauri::command(rename = "window_restore")]
    pub fn window_restore(window: tauri::Window) -> Result<(), String> {
        if window
            .is_maximized()
            .map_err(|error| window_error("maximize state", error))?
        {
            window
                .unmaximize()
                .map_err(|error| window_error("restore", error))?;
        }
        Ok(())
    }

    #[tauri::command(rename = "window_toggle_maximize")]
    pub fn window_toggle_maximize(window: tauri::Window) -> Result<(), String> {
        if window
            .is_maximized()
            .map_err(|error| window_error("maximize state", error))?
        {
            window
                .unmaximize()
                .map_err(|error| window_error("restore", error))?;
        } else {
            window
                .maximize()
                .map_err(|error| window_error("maximize", error))?;
        }
        Ok(())
    }

    #[tauri::command(rename = "window_close")]
    pub fn window_close(window: tauri::Window) -> Result<(), String> {
        window.close().map_err(|error| window_error("close", error))
    }

    #[tauri::command(rename = "window_start_dragging")]
    pub fn window_start_dragging(window: tauri::Window) -> Result<(), String> {
        window
            .start_dragging()
            .map_err(|error| window_error("drag", error))
    }
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let supervisor = app.state::<DaemonSupervisor>();
            let resource_dir = app.path().resource_dir().ok();
            supervisor
                .start(resource_dir.as_deref())
                .map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error)))?;
            let window = app
                .get_webview_window("main")
                .expect("main window is not available");
            enforce_custom_window_frame(&window)?;
            window.set_focus()?;
            Ok(())
        })
        .manage(commands::IpcRuntime::default())
        .manage(DaemonSupervisor::default())
        .invoke_handler(tauri::generate_handler![
            commands::sori_ipc,
            commands::sori_ipc_cancel,
            commands::window_minimize,
            commands::window_maximize,
            commands::window_restore,
            commands::window_toggle_maximize,
            commands::window_close,
            commands::window_start_dragging
        ])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                if let Err(error) = window.app_handle().state::<DaemonSupervisor>().stop() {
                    eprintln!("[sori] daemon cleanup skipped: {error}");
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Sori desktop");
}

#[cfg(test)]
mod supervisor_tests {
    #[test]
    fn endpoint_defaults_to_loopback() {
        let endpoint = super::DaemonSupervisor::parse_endpoint(None).unwrap();
        assert!(endpoint.ip().is_loopback());
    }

    #[test]
    fn endpoint_rejects_non_loopback_owners() {
        let error = super::DaemonSupervisor::parse_endpoint(Some("0.0.0.0:17373".into())).unwrap_err();
        assert!(error.contains("loopback"));
    }

    #[test]
    fn endpoint_accepts_isolated_loopback_recovery_port() {
        let endpoint = super::DaemonSupervisor::parse_endpoint(Some("127.0.0.1:17375".into())).unwrap();
        assert_eq!(endpoint.port(), 17375);
    }

    #[test]
    fn newer_same_pid_and_executable_lease_survives_stop_cleanup() {
        let old = super::DaemonOwner {
            endpoint: "127.0.0.1:17373".into(), pid: 7, executable: "sorid.exe".into(),
            process_start_time: 1, lease_id: "old-generation-1234".into(),
        };
        let newer = super::DaemonOwner { lease_id: "new-generation-1234".into(), ..old.clone() };
        assert!(!super::DaemonSupervisor::owner_snapshot_is_current(&old, Some(&newer)));
        assert!(super::DaemonSupervisor::owner_snapshot_is_current(&old, Some(&old)));
        let path = std::env::temp_dir().join(format!("sori-owner-newer-{}.json", std::process::id()));
        std::fs::write(&path, serde_json::to_vec(&newer).unwrap()).unwrap();
        super::DaemonSupervisor::remove_owner_if_current(&path, &old).unwrap();
        assert!(path.exists());
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn owner_override_accepts_absolute_serialized_env_path() {
        let root = std::env::temp_dir().join(format!("sori-owner-valid-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("daemon-owner.json");
        let serialized = path.to_string_lossy().to_string();
        assert_eq!(super::DaemonSupervisor::owner_path_from_override(Some(serialized.into())).unwrap(), path);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn owner_override_rejects_relative_and_directory_serialized_env_paths() {
        let relative = super::DaemonSupervisor::owner_path_from_override(Some("relative-owner.json".into())).unwrap_err();
        assert!(relative.contains("absolute"));
        let directory = std::env::temp_dir().join(format!("sori-owner-directory-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        let error = super::DaemonSupervisor::owner_path_from_override(Some(directory.clone().into_os_string())).unwrap_err();
        assert!(error.contains("absolute file path"));
        std::fs::remove_dir_all(directory).unwrap();
    }
}

#[cfg(test)]
mod titlebar_tests {
    use serde_json::Value;

    #[test]
    fn native_decorations_are_disabled_for_the_custom_titlebar() {
        let config: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(config["app"]["windows"][0]["decorations"], false);
    }

    #[test]
    fn launch_window_is_centered_without_starting_maximized() {
        let config: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let window = &config["app"]["windows"][0];
        assert_eq!(window["center"], true);
        assert_eq!(window["maximized"], Value::Null);
    }

    #[test]
    fn minimum_window_size_is_kept_in_logical_pixels_for_dpi_scaling() {
        let config: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let window = &config["app"]["windows"][0];
        assert_eq!(window["minWidth"], 720);
        assert_eq!(window["minHeight"], 480);
        assert_eq!(window["resizable"], true);
    }

    #[test]
    fn main_window_capability_allows_native_shell_actions() {
        let capability: Value =
            serde_json::from_str(include_str!("../capabilities/main-window.json")).unwrap();
        for permission in [
            "core:window:allow-close",
            "core:window:allow-minimize",
            "core:window:allow-maximize",
            "core:window:allow-unmaximize",
            "core:window:allow-toggle-maximize",
            "core:window:allow-start-dragging",
        ] {
            assert!(
                capability["permissions"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|item| item == permission),
                "missing permission: {permission}"
            );
        }
    }

    #[test]
    fn custom_titlebar_uses_one_explicit_drag_mechanism() {
        let source = include_str!("../../src/components/DesktopTitleBar.tsx");
        assert!(!source.contains("data-tauri-drag-region"));
        assert!(
            source.contains("startWindowAction('drag')")
                || source.contains("runWindowAction('drag')")
        );
    }

    #[test]
    fn custom_titlebar_commands_are_registered() {
        let source = include_str!("lib.rs");
        for command in [
            "window_minimize",
            "window_maximize",
            "window_restore",
            "window_toggle_maximize",
            "window_close",
            "window_start_dragging",
        ] {
            assert!(source.contains(command), "missing command: {command}");
        }
    }
    #[test]
    fn optional_whisper_runtime_never_blocks_desktop_startup() {
        assert!(super::DaemonSupervisor::whisper_runtime_diagnostic(false).is_some());
        assert!(super::DaemonSupervisor::whisper_runtime_diagnostic(true).is_none());
    }

    #[test]
    fn packaging_keeps_user_owned_whisper_runtime_out_of_tauri_resources() {
        let config: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let resources = config["bundle"]["resources"].as_object().unwrap();
        assert_eq!(resources.get("../../../target/debug/sorid.exe").and_then(|item| item.as_str()), Some("sorid.exe"));
        assert!(!resources.keys().any(|item| item.contains("whisper")));
    }
}
