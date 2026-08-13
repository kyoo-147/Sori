//! Voice Edit domain boundary: validate a captured selection, transform it,
//! produce a reviewable diff, and only inject after explicit approval.
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VoiceEditSelection {
    pub target_identity: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VoiceEditResponse {
    pub accepted: bool,
    pub transformed_text: Option<String>,
    pub diff: Option<String>,
    pub detail: String,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum VoiceEditError {
    #[error("no focused selection was captured")]
    NoSelection,
    #[error("focused target identity is required")]
    MissingTargetIdentity,
    #[error("instruction is empty")]
    EmptyInstruction,
    #[error("unsupported voice edit instruction: {0}")]
    UnsupportedInstruction(String),
    #[error("approval is required before replacement")]
    ApprovalRequired,
    #[error("focused target changed before replacement")]
    TargetChanged,
}

/// The MVP transformer is intentionally small and truthful. Provider-backed
/// semantic edits must implement this boundary; they must not be simulated in
/// the UI or inferred from a timer.
pub fn transform(
    selection: &VoiceEditSelection,
    instruction: &str,
) -> Result<String, VoiceEditError> {
    if selection.text.trim().is_empty() {
        return Err(VoiceEditError::NoSelection);
    }
    if selection.target_identity.trim().is_empty() {
        return Err(VoiceEditError::MissingTargetIdentity);
    }
    let instruction = instruction.trim();
    if instruction.is_empty() {
        return Err(VoiceEditError::EmptyInstruction);
    }
    let lower = instruction.to_ascii_lowercase();
    if lower == "trim whitespace" || lower == "remove surrounding whitespace" {
        return Ok(selection.text.trim().to_owned());
    }
    if lower == "uppercase" || lower == "convert to uppercase" {
        return Ok(selection.text.to_uppercase());
    }
    if lower == "lowercase" || lower == "convert to lowercase" {
        return Ok(selection.text.to_lowercase());
    }
    Err(VoiceEditError::UnsupportedInstruction(
        instruction.to_owned(),
    ))
}

pub fn unified_diff(before: &str, after: &str) -> String {
    if before == after {
        return String::new();
    }
    format!("@@ selection @@\n-{}\n+{}", before, after)
}

pub fn preview(
    selection: &VoiceEditSelection,
    instruction: &str,
) -> Result<VoiceEditResponse, VoiceEditError> {
    let transformed = transform(selection, instruction)?;
    Ok(VoiceEditResponse {
        accepted: false,
        diff: Some(unified_diff(&selection.text, &transformed)),
        transformed_text: Some(transformed),
        detail: "Review required; no replacement performed.".into(),
    })
}

pub fn approve(
    selection: &VoiceEditSelection,
    instruction: &str,
    current_target_identity: Option<&str>,
) -> Result<(String, String), VoiceEditError> {
    let current = current_target_identity.ok_or(VoiceEditError::MissingTargetIdentity)?;
    if current != selection.target_identity {
        return Err(VoiceEditError::TargetChanged);
    }
    let transformed = transform(selection, instruction)?;
    Ok((
        transformed.clone(),
        unified_diff(&selection.text, &transformed),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn selection() -> VoiceEditSelection {
        VoiceEditSelection {
            target_identity: "notepad:42:selection-1".into(),
            text: "  Hello  ".into(),
        }
    }
    #[test]
    fn preview_is_deterministic_and_unapplied() {
        let result = preview(&selection(), "trim whitespace").unwrap();
        assert!(!result.accepted);
        assert_eq!(
            result.diff.as_deref(),
            Some("@@ selection @@\n-  Hello  \n+Hello")
        );
    }
    #[test]
    fn unsupported_semantic_edits_are_not_fake_success() {
        assert_eq!(
            transform(&selection(), "add error handling"),
            Err(VoiceEditError::UnsupportedInstruction(
                "add error handling".into()
            ))
        );
    }
    #[test]
    fn approval_revalidates_target() {
        assert_eq!(
            approve(&selection(), "uppercase", Some("notepad:99:selection-1")),
            Err(VoiceEditError::TargetChanged)
        );
    }
    #[test]
    fn empty_selection_is_rejected() {
        let mut value = selection();
        value.text.clear();
        assert_eq!(
            preview(&value, "uppercase"),
            Err(VoiceEditError::NoSelection)
        );
    }
}
