use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ActionRisk {
    ReadOnly,
    LocalEdit,
    ExternalNetwork,
    FilesystemWrite,
    Shell,
    Destructive,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PermissionRequest {
    pub id: Uuid,
    pub actor: String,
    pub action: String,
    pub risk: ActionRisk,
    pub dry_run: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PermissionDecision {
    AllowOnce,
    Deny,
    RememberForActor,
}

impl PermissionRequest {
    pub fn requires_explicit_approval(&self) -> bool {
        !matches!(self.risk, ActionRisk::ReadOnly)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn side_effects_require_approval() {
        let request = PermissionRequest {
            id: Uuid::new_v4(),
            actor: "extension.github".to_owned(),
            action: "create pull request".to_owned(),
            risk: ActionRisk::ExternalNetwork,
            dry_run: "gh pr create ...".to_owned(),
        };
        assert!(request.requires_explicit_approval());
    }
}
