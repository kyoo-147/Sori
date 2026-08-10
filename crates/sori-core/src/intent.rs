use crate::{ContextSnapshot, Transcript};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum FastIntent {
    Dictation { text: String },
    EditSelection { instruction: String },
    DeterministicCommand { command: String },
    Snippet { trigger: String },
    AgentRequest { prompt: String },
}

pub trait IntentRouter: Send + Sync {
    fn route(&self, transcript: &Transcript, context: &ContextSnapshot) -> FastIntent;
}

#[derive(Debug, Default)]
pub struct RuleFirstIntentRouter;

impl IntentRouter for RuleFirstIntentRouter {
    fn route(&self, transcript: &Transcript, context: &ContextSnapshot) -> FastIntent {
        let text = transcript.text.trim();
        let lower = text.to_ascii_lowercase();

        if matches!(lower.as_str(), "new line" | "undo" | "delete last sentence") {
            return FastIntent::DeterministicCommand { command: lower };
        }

        if context.selected_text_present {
            return FastIntent::EditSelection {
                instruction: text.to_owned(),
            };
        }

        FastIntent::Dictation {
            text: text.to_owned(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selected_text_routes_to_edit_without_llm() {
        let router = RuleFirstIntentRouter;
        let context = ContextSnapshot {
            selected_text_present: true,
            ..ContextSnapshot::default()
        };
        assert!(matches!(
            router.route(&Transcript::plain("make this shorter"), &context),
            FastIntent::EditSelection { .. }
        ));
    }

    #[test]
    fn simple_commands_route_deterministically() {
        let router = RuleFirstIntentRouter;
        assert!(matches!(
            router.route(&Transcript::plain("undo"), &ContextSnapshot::default()),
            FastIntent::DeterministicCommand { .. }
        ));
    }
}
