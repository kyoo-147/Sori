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
use tauri::Manager;

/// Native command boundary for the UI. The daemon remains the owner of IPC,
/// permissions, and all runtime capabilities; Tauri only forwards JSON.
mod commands {
    use super::*;

    const IPC_REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(2);

    async fn forward_ipc(request: Value) -> Result<Value, String> {
        let request: Request = serde_json::from_value(request).map_err(|error| error.to_string())?;
        let response = tokio::time::timeout(
            IPC_REQUEST_TIMEOUT,
            tauri::async_runtime::spawn_blocking(move || {
                let client = LocalIpcClient::connect().map_err(|error| error.to_string())?;
                client.request(request).map_err(|error| error.to_string())
            }),
        ).await
            .map_err(|_| format!("IPC request timed out after {:?}", IPC_REQUEST_TIMEOUT))?
            .map_err(|error| format!("IPC worker failed: {error}"))??;
        serde_json::to_value(response).map_err(|error| error.to_string())
    }

    #[tauri::command(rename = "sori_ipc")]
    pub async fn sori_ipc(request: Value) -> Result<Value, String> {
        let started = std::time::Instant::now();
        let result = forward_ipc(request).await;
        #[cfg(debug_assertions)]
        eprintln!("[sori_ipc] completed in {:?}: {}", started.elapsed(), if result.is_ok() { "ok" } else { "error" });
        result
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
            let window = app
                .get_webview_window("main")
                .expect("main window is not available");
            enforce_custom_window_frame(&window)?;
            window.set_focus()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::sori_ipc,
            commands::window_minimize,
            commands::window_maximize,
            commands::window_restore,
            commands::window_toggle_maximize,
            commands::window_close,
            commands::window_start_dragging
        ])
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
}
