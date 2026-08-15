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
            persistence_path: default_persistence_path(),
        }
    }
}

/// Keep installed-product user data outside the application directory. The
/// installer may replace that directory during upgrade/uninstall, while the
/// SQLite database must survive those operations.
pub fn default_persistence_path() -> PathBuf {
    #[cfg(windows)]
    if let Some(root) = std::env::var_os("LOCALAPPDATA") {
        return PathBuf::from(root).join("Sori").join("sori.db");
    }
    #[cfg(not(windows))]
    if let Some(root) = std::env::var_os("XDG_DATA_HOME") {
        return PathBuf::from(root).join("sori").join("sori.db");
    }
    PathBuf::from("sori.db")
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
        assert_eq!(config.persistence_path, default_persistence_path());
    }

    #[test]
    fn empty_hotkey_is_rejected() {
        let mut config = DaemonConfig::default();
        config.hotkey.binding.clear();
        assert!(config.validate().is_err());
    }
}

/// Parse the user-facing `Alt+Space` style binding into the Win32 registration
/// contract. Unsupported bindings fail closed instead of silently registering a
/// different hotkey.
pub fn parse_hotkey_binding(binding: &str) -> Result<sori_core::HotkeyCombination, String> {
    let mut modifiers = 0u32;
    let mut key = None;
    for part in binding
        .split('+')
        .map(str::trim)
        .filter(|part| !part.is_empty())
    {
        match part.to_ascii_lowercase().as_str() {
            "alt" => modifiers |= 1,
            "ctrl" | "control" => modifiers |= 2,
            "shift" => modifiers |= 4,
            "win" | "meta" | "super" => modifiers |= 8,
            value if key.is_none() => key = Some(parse_virtual_key(value)?),
            _ => return Err(format!("hotkey has more than one non-modifier key: {part}")),
        }
    }
    let virtual_key = key.ok_or_else(|| "hotkey must include a key".to_owned())?;
    Ok(sori_core::HotkeyCombination::new(modifiers, virtual_key))
}

fn parse_virtual_key(value: &str) -> Result<u32, String> {
    if value.len() == 1 && value.as_bytes()[0].is_ascii_alphanumeric() {
        return Ok(value.as_bytes()[0].to_ascii_uppercase() as u32);
    }
    if let Some(number) = value
        .strip_prefix('f')
        .and_then(|value| value.parse::<u32>().ok())
    {
        if (1..=24).contains(&number) {
            return Ok(0x70 + number - 1);
        }
    }
    match value {
        "space" => Ok(0x20),
        "enter" | "return" => Ok(0x0d),
        "tab" => Ok(0x09),
        "escape" | "esc" => Ok(0x1b),
        "backspace" => Ok(0x08),
        _ => Err(format!("unsupported hotkey key: {value}")),
    }
}

#[cfg(test)]
mod hotkey_tests {
    use super::parse_hotkey_binding;
    #[test]
    fn parses_configured_hold_to_talk_binding() {
        let hotkey = parse_hotkey_binding("Ctrl+Alt+K").unwrap();
        assert_eq!(hotkey.modifiers, 3);
        assert_eq!(hotkey.virtual_key, b'K' as u32);
    }
    #[test]
    fn rejects_unsupported_binding_without_fallback() {
        assert!(parse_hotkey_binding("Alt+Mouse4").is_err());
    }
}
