//! Configuration for the daemon's platform-neutral runtime scaffold.

use serde::{Deserialize, Serialize};
use sori_core::{CaptureConfig, RoutePolicy, RoutePreset};
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HotkeyConfig {
    /// A display string interpreted by the platform hotkey adapter.
    pub binding: String,
}

impl Default for HotkeyConfig {
    fn default() -> Self {
        Self {
            binding: "Alt+Space".into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DaemonConfig {
    pub hotkey: HotkeyConfig,
    pub audio: CaptureConfig,
    pub route: RoutePolicy,
    pub persistence_path: PathBuf,
}

impl Default for DaemonConfig {
    fn default() -> Self {
        Self {
            hotkey: HotkeyConfig::default(),
            audio: CaptureConfig::default(),
            route: RoutePreset::LocalFirst.policy(),
            persistence_path: PathBuf::from("sori.db"),
        }
    }
}

impl DaemonConfig {
    pub fn validate(&self) -> Result<(), String> {
        if self.hotkey.binding.trim().is_empty() {
            return Err("hotkey binding must not be empty".into());
        }
        self.audio.validate().map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_safe_for_local_first_runtime() {
        let config = DaemonConfig::default();
        assert_eq!(config.hotkey.binding, "Alt+Space");
        assert_eq!(config.audio.format.sample_rate_hz, 16_000);
        assert_eq!(config.audio.format.channels, 1);
        assert_eq!(config.route, RoutePreset::LocalFirst.policy());
        assert_eq!(config.persistence_path, PathBuf::from("sori.db"));
    }

    #[test]
    fn empty_hotkey_is_rejected() {
        let mut config = DaemonConfig::default();
        config.hotkey.binding.clear();
        assert!(config.validate().is_err());
    }
}
