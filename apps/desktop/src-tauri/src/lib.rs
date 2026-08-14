use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex as StdMutex;

struct DaemonSupervisor {
    child: StdMutex<Option<Child>>,
}

impl Default for DaemonSupervisor {
    fn default() -> Self {
        Self {
            child: StdMutex::new(None),
        }
    }
}

impl DaemonSupervisor {
    fn whisper_runtime_diagnostic(configured: bool) -> Option<&'static str> {
        if configured {
            None
        } else {
            Some("Whisper runtime is external and user-owned; configure SORI_WHISPER_CPP_BIN or Sori's whisper.json when voice is required")
        }
    }
    fn daemon_path() -> PathBuf {
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
        } else {
            parent.join("resources").join(executable_name)
        }
    }

    fn endpoint_occupied() -> bool {
        std::net::TcpStream::connect_timeout(
            &sori_ipc::DEFAULT_ENDPOINT
                .parse()
                .expect("valid daemon endpoint"),
            std::time::Duration::from_millis(150),
        )
        .is_ok()
    }

    fn start(&self) -> Result<(), String> {
        if Self::endpoint_occupied() {
            eprintln!(
                "[sori] daemon endpoint is already occupied; refusing to launch an unknown sorid"
            );
            return Ok(());
        }
        let path = Self::daemon_path();
        if !path.is_file() {
            eprintln!(
                "[sori] sorid is not bundled or configured at {}; desktop remains offline",
                path.display()
            );
            return Ok(());
        }
        let configured_whisper = std::env::var_os("SORI_WHISPER_CPP_BIN").is_some();
        if let Some(message) = Self::whisper_runtime_diagnostic(configured_whisper) {
            eprintln!("[sori] {message}");
        }
        let mut command = Command::new(&path);
        let child = command
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|error| format!("failed to launch sorid at {}: {error}", path.display()))?;
        *self
            .child
            .lock()
            .map_err(|_| "daemon supervisor lock poisoned".to_string())? = Some(child);
        Ok(())
    }

    fn stop(&self) {
        let Ok(mut child) = self.child.lock() else {
            return;
        };
        let Some(mut child) = child.take() else {
            return;
        };
        if child.try_wait().ok().flatten().is_none() {
            let _ = child.kill();
            let _ = child.wait();
        }
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

    async fn forward_ipc(request: Value, id: &str, runtime: &IpcRuntime) -> Result<Value, String> {
        let request: Request =
            serde_json::from_value(request).map_err(|error| error.to_string())?;
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
                let client = LocalIpcClient::connect().map_err(|error| error.to_string())?;
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
    ) -> Result<Value, String> {
        let id = normalize_request_id(request_id);
        let started = std::time::Instant::now();
        let result = forward_ipc(request, &id, &state).await;
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
            supervisor
                .start()
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
                window.app_handle().state::<DaemonSupervisor>().stop();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Sori desktop");
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
        let resources = config["bundle"]["resources"].as_array().unwrap();
        assert!(resources
            .iter()
            .any(|item| item == "../../../target/debug/sorid.exe"));
        assert!(!resources
            .iter()
            .any(|item| item.as_str().is_some_and(|item| item.contains("whisper"))));
    }
}
