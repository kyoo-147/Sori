use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PrivacyMode {
    Auto,
    LocalOnly,
    CloudAllowed,
    NeverCloud,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProfileMode {
    Basic,
    Coding,
    Email,
    Chat,
    Terminal,
    Custom,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ContextSnapshot {
    pub active_app: Option<String>,
    pub window_title: Option<String>,
    pub selected_text_present: bool,
    pub clipboard_present: bool,
    pub project_root: Option<String>,
    pub profile: ProfileMode,
    pub privacy: PrivacyMode,
    pub vocabulary_hints: Vec<String>,
    pub metadata: BTreeMap<String, String>,
}

impl Default for ContextSnapshot {
    fn default() -> Self {
        Self {
            active_app: None,
            window_title: None,
            selected_text_present: false,
            clipboard_present: false,
            project_root: None,
            profile: ProfileMode::Basic,
            privacy: PrivacyMode::Auto,
            vocabulary_hints: Vec::new(),
            metadata: BTreeMap::new(),
        }
    }
}

impl ContextSnapshot {
    pub fn for_active_app(app: impl Into<String>) -> Self {
        Self {
            active_app: Some(app.into()),
            ..Self::default()
        }
    }
}
