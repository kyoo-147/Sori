//! Safe text-injection contracts and platform-neutral planning.
//!
//! Concrete adapters must keep OS side effects behind [`TextInjectionAdapter`].
//! Planning is pure, and dry-run injection never reads or writes the clipboard.

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct TextTargetCapabilities {
    pub accepts_text: bool,
    pub supports_direct_input: bool,
    pub supports_clipboard_paste: bool,
    pub supports_undo: bool,
    pub requires_elevation: bool,
}

impl TextTargetCapabilities {
    pub const fn unavailable() -> Self {
        Self {
            accepts_text: false,
            supports_direct_input: false,
            supports_clipboard_paste: false,
            supports_undo: false,
            requires_elevation: false,
        }
    }
}

pub trait TextTarget: Send + Sync {
    fn name(&self) -> &str;
    fn capabilities(&self) -> TextTargetCapabilities;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct InjectorCapabilities {
    pub direct_input: bool,
    pub clipboard: bool,
    pub clipboard_restore: bool,
    pub undo: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum InjectionStrategy {
    DirectInput,
    ClipboardPaste,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ClipboardPolicy {
    NotUsed,
    PreserveAndRestore,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum UndoRestoreStatus {
    NotRequested,
    NotSupported,
    Pending,
    Attempted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UndoRestoreAttempt {
    pub status: UndoRestoreStatus,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InjectionPlan {
    pub target: String,
    pub strategy: InjectionStrategy,
    pub clipboard_policy: ClipboardPolicy,
    pub undo_restore: UndoRestoreAttempt,
}

impl InjectionPlan {
    pub fn dry_run_output(&self, text_len: usize) -> String {
        format!(
            "text injection dry-run: target={}, strategy={:?}, clipboard={:?}, undo_restore={:?}, text_len={text_len}",
            self.target, self.strategy, self.clipboard_policy, self.undo_restore.status
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TextInjectionRequest {
    pub text: String,
    pub dry_run: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TextInjectionResult {
    pub plan: InjectionPlan,
    pub dry_run_output: Option<String>,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum TextInjectionError {
    #[error("target does not accept text")]
    TargetDoesNotAcceptText,
    #[error("no usable text injection strategy for target")]
    NoUsableStrategy,
    #[error("text injection adapter failed: {0}")]
    Adapter(String),
}

pub trait TextInjectionAdapter {
    fn send_direct_input(&mut self, text: &str) -> Result<(), String>;
    fn snapshot_clipboard(&mut self) -> Result<(), String>;
    fn set_clipboard_text(&mut self, text: &str) -> Result<(), String>;
    fn paste_from_clipboard(&mut self) -> Result<(), String>;
    fn restore_clipboard(&mut self) -> Result<(), String>;
    fn request_undo(&mut self) -> Result<(), String>;
}

pub trait TextInjector {
    fn capabilities(&self) -> InjectorCapabilities;
    fn plan(&self, target: &dyn TextTarget) -> InjectionPlan;
    fn inject(
        &mut self,
        target: &dyn TextTarget,
        request: &TextInjectionRequest,
    ) -> Result<TextInjectionResult, TextInjectionError>;
}

pub fn select_strategy(
    target: TextTargetCapabilities,
    injector: InjectorCapabilities,
) -> InjectionStrategy {
    if !target.accepts_text {
        return InjectionStrategy::Unavailable;
    }
    if target.supports_direct_input && injector.direct_input {
        InjectionStrategy::DirectInput
    } else if target.supports_clipboard_paste && injector.clipboard {
        InjectionStrategy::ClipboardPaste
    } else {
        InjectionStrategy::Unavailable
    }
}

pub struct AdapterTextInjector<A> {
    adapter: A,
    capabilities: InjectorCapabilities,
}

impl<A> AdapterTextInjector<A> {
    pub fn new(adapter: A, capabilities: InjectorCapabilities) -> Self {
        Self {
            adapter,
            capabilities,
        }
    }

    fn make_plan(&self, target: &dyn TextTarget) -> InjectionPlan {
        let target_capabilities = target.capabilities();
        let strategy = select_strategy(target_capabilities, self.capabilities);
        let clipboard_policy = if strategy == InjectionStrategy::ClipboardPaste {
            ClipboardPolicy::PreserveAndRestore
        } else {
            ClipboardPolicy::NotUsed
        };
        let undo_restore = if target_capabilities.supports_undo && self.capabilities.undo {
            UndoRestoreAttempt {
                status: UndoRestoreStatus::Pending,
                description: "request undo after insertion if needed".into(),
            }
        } else {
            UndoRestoreAttempt {
                status: UndoRestoreStatus::NotSupported,
                description: "target or adapter does not advertise undo".into(),
            }
        };
        InjectionPlan {
            target: target.name().into(),
            strategy,
            clipboard_policy,
            undo_restore,
        }
    }
}

impl<A: TextInjectionAdapter> TextInjector for AdapterTextInjector<A> {
    fn capabilities(&self) -> InjectorCapabilities {
        self.capabilities
    }
    fn plan(&self, target: &dyn TextTarget) -> InjectionPlan {
        self.make_plan(target)
    }

    fn inject(
        &mut self,
        target: &dyn TextTarget,
        request: &TextInjectionRequest,
    ) -> Result<TextInjectionResult, TextInjectionError> {
        let plan = self.make_plan(target);
        if plan.strategy == InjectionStrategy::Unavailable {
            return Err(if !target.capabilities().accepts_text {
                TextInjectionError::TargetDoesNotAcceptText
            } else {
                TextInjectionError::NoUsableStrategy
            });
        }
        if request.dry_run {
            return Ok(TextInjectionResult {
                dry_run_output: Some(plan.dry_run_output(request.text.len())),
                plan,
            });
        }
        match plan.strategy {
            InjectionStrategy::DirectInput => self
                .adapter
                .send_direct_input(&request.text)
                .map_err(TextInjectionError::Adapter)?,
            InjectionStrategy::ClipboardPaste => {
                // Snapshot/restore belongs to the platform adapter. This API deliberately
                // has no implicit clipboard access, making tests side-effect free.
                self.adapter
                    .snapshot_clipboard()
                    .map_err(TextInjectionError::Adapter)?;
                self.adapter
                    .set_clipboard_text(&request.text)
                    .map_err(TextInjectionError::Adapter)?;
                self.adapter
                    .paste_from_clipboard()
                    .map_err(TextInjectionError::Adapter)?;
                self.adapter
                    .restore_clipboard()
                    .map_err(TextInjectionError::Adapter)?;
            }
            InjectionStrategy::Unavailable => unreachable!(),
        }
        Ok(TextInjectionResult {
            dry_run_output: None,
            plan,
        })
    }
}

#[cfg(windows)]
pub mod windows {
    //! Windows boundary. An executable adapter can implement these operations with
    //! `SendInput` and an explicitly scoped clipboard snapshot/restore transaction.
    use super::*;

    pub struct WindowsTextInjector<A> {
        inner: AdapterTextInjector<A>,
    }
    impl<A> WindowsTextInjector<A> {
        pub fn new(adapter: A) -> Self {
            Self {
                inner: AdapterTextInjector::new(
                    adapter,
                    InjectorCapabilities {
                        direct_input: true,
                        clipboard: true,
                        clipboard_restore: true,
                        undo: true,
                    },
                ),
            }
        }
    }
    impl<A: TextInjectionAdapter> TextInjector for WindowsTextInjector<A> {
        fn capabilities(&self) -> InjectorCapabilities {
            self.inner.capabilities()
        }
        fn plan(&self, target: &dyn TextTarget) -> InjectionPlan {
            self.inner.plan(target)
        }
        fn inject(
            &mut self,
            target: &dyn TextTarget,
            request: &TextInjectionRequest,
        ) -> Result<TextInjectionResult, TextInjectionError> {
            self.inner.inject(target, request)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Target(TextTargetCapabilities);
    impl TextTarget for Target {
        fn name(&self) -> &str {
            "test-target"
        }
        fn capabilities(&self) -> TextTargetCapabilities {
            self.0
        }
    }
    struct Noop;
    impl TextInjectionAdapter for Noop {
        fn send_direct_input(&mut self, _: &str) -> Result<(), String> {
            panic!("dry run must not send input")
        }
        fn snapshot_clipboard(&mut self) -> Result<(), String> {
            panic!("dry run must not touch clipboard")
        }
        fn set_clipboard_text(&mut self, _: &str) -> Result<(), String> {
            panic!("dry run must not touch clipboard")
        }
        fn paste_from_clipboard(&mut self) -> Result<(), String> {
            panic!("dry run must not paste")
        }
        fn restore_clipboard(&mut self) -> Result<(), String> {
            panic!("dry run must not touch clipboard")
        }
        fn request_undo(&mut self) -> Result<(), String> {
            panic!("dry run must not undo")
        }
    }

    const TARGET: TextTargetCapabilities = TextTargetCapabilities {
        accepts_text: true,
        supports_direct_input: true,
        supports_clipboard_paste: true,
        supports_undo: true,
        requires_elevation: false,
    };

    #[test]
    fn selects_direct_before_clipboard() {
        assert_eq!(
            select_strategy(
                TARGET,
                InjectorCapabilities {
                    direct_input: true,
                    clipboard: true,
                    clipboard_restore: true,
                    undo: true
                }
            ),
            InjectionStrategy::DirectInput
        );
    }

    #[test]
    fn falls_back_to_clipboard() {
        assert_eq!(
            select_strategy(
                TARGET,
                InjectorCapabilities {
                    direct_input: false,
                    clipboard: true,
                    clipboard_restore: true,
                    undo: false
                }
            ),
            InjectionStrategy::ClipboardPaste
        );
    }

    #[test]
    fn dry_run_has_no_adapter_side_effects() {
        let mut injector = AdapterTextInjector::new(
            Noop,
            InjectorCapabilities {
                direct_input: true,
                clipboard: true,
                clipboard_restore: true,
                undo: true,
            },
        );
        let result = injector
            .inject(
                &Target(TARGET),
                &TextInjectionRequest {
                    text: "hello".into(),
                    dry_run: true,
                },
            )
            .unwrap();
        assert!(
            result
                .dry_run_output
                .unwrap()
                .contains("strategy=DirectInput")
        );
    }
}
