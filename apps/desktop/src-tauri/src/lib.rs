use serde_json::Value;
use sori_ipc::{IpcClient, LocalIpcClient, Request};

/// Native command boundary for the UI. The daemon remains the owner of IPC,
/// permissions, and all runtime capabilities; Tauri only forwards JSON.
mod commands {
    use super::*;

    #[tauri::command(rename = "sori_ipc")]
    pub fn sori_ipc(request: Value) -> Result<Value, String> {
        let request: Request =
            serde_json::from_value(request).map_err(|error| error.to_string())?;
        let client = LocalIpcClient::connect().map_err(|error| error.to_string())?;
        let response = client.request(request).map_err(|error| error.to_string())?;
        serde_json::to_value(response).map_err(|error| error.to_string())
    }
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![commands::sori_ipc])
        .run(tauri::generate_context!())
        .expect("error while running Sori desktop");
}
