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
    fn identity(&self) -> Option<&str> {
        None
    }
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
    pub outcome: InjectionOutcome,
    pub diagnostics: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum InjectionOutcome {
    Inserted,
    PartiallyInserted,
    CopiedFallback,
    Failed,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum TextInjectionError {
    #[error("target does not accept text")]
    TargetDoesNotAcceptText,
    #[error("unsupported target application: {0}")]
    UnsupportedTargetApp(String),
    #[error("target requires elevated access")]
    ElevatedTargetDenied,
    #[error("no usable text injection strategy for target")]
    NoUsableStrategy,
    #[error("clipboard restore failed: {0}")]
    ClipboardRestoreFailed(String),
    #[error("text injection adapter failed: {0}")]
    Adapter(String),
    #[error("focused target changed during injection")]
    FocusedTargetChanged,
}

pub trait TextInjectionAdapter {
    fn send_direct_input(&mut self, text: &str) -> Result<(), String>;
    fn snapshot_clipboard(&mut self) -> Result<(), String>;
    fn set_clipboard_text(&mut self, text: &str) -> Result<(), String>;
    fn paste_from_clipboard(&mut self) -> Result<(), String>;
    fn restore_clipboard(&mut self) -> Result<(), String>;
    fn request_undo(&mut self) -> Result<(), String>;
    fn release_modifiers(&mut self) -> Result<(), String> {
        Ok(())
    }
    fn focused_target_identity(&mut self) -> Result<Option<String>, String> {
        Ok(None)
    }
    fn clipboard_contains_text(&mut self, _text: &str) -> Result<bool, String> {
        Ok(true)
    }
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
    } else if target.supports_clipboard_paste && injector.clipboard && injector.clipboard_restore {
        // Clipboard fallback is only safe when the adapter can restore the user's
        // previous clipboard contents. A clipboard-only adapter would make a
        // failed or cancelled injection destructive.
        InjectionStrategy::ClipboardPaste
    } else {
        InjectionStrategy::Unavailable
    }
}

pub struct AdapterTextInjector<A> {
    adapter: A,
    capabilities: InjectorCapabilities,
    transaction_lock: std::sync::Mutex<()>,
}

impl<A> AdapterTextInjector<A> {
    pub fn new(adapter: A, capabilities: InjectorCapabilities) -> Self {
        Self {
            adapter,
            capabilities,
            transaction_lock: std::sync::Mutex::new(()),
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
        let _transaction = self.transaction_lock.lock().map_err(|_| {
            TextInjectionError::Adapter("injection transaction lock poisoned".into())
        })?;
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
                outcome: InjectionOutcome::Inserted,
                diagnostics: vec!["dry-run: no OS or clipboard side effects".into()],
            });
        }
        let expected_identity = target.identity().map(str::to_owned);
        self.adapter
            .release_modifiers()
            .map_err(TextInjectionError::Adapter)?;
        if let Some(expected) = expected_identity.as_deref() {
            if let Some(actual) = self
                .adapter
                .focused_target_identity()
                .map_err(TextInjectionError::Adapter)?
            {
                if actual != expected {
                    return Err(TextInjectionError::FocusedTargetChanged);
                }
            }
        }
        let mut diagnostics = Vec::new();
        match plan.strategy {
            InjectionStrategy::DirectInput => self
                .adapter
                .send_direct_input(&request.text)
                .map_err(TextInjectionError::Adapter)?,
            InjectionStrategy::ClipboardPaste => {
                // Snapshot/restore belongs to the platform adapter. This API deliberately
                // has no implicit clipboard access, making tests side-effect free. Restore is
                // attempted even when setting or pasting fails.
                self.adapter
                    .snapshot_clipboard()
                    .map_err(TextInjectionError::Adapter)?;
                let operation = self
                    .adapter
                    .set_clipboard_text(&request.text)
                    .and_then(|()| self.adapter.paste_from_clipboard());
                let restore = if self
                    .adapter
                    .clipboard_contains_text(&request.text)
                    .map_err(TextInjectionError::Adapter)?
                {
                    self.adapter.restore_clipboard()
                } else {
                    diagnostics.push("clipboard changed after paste; restore skipped".into());
                    Ok(())
                };
                if let Err(error) = restore {
                    // Never report success after replacing the user's clipboard. The
                    // restore error is deliberately distinct so callers can warn the
                    // user and avoid retrying destructively.
                    return Err(TextInjectionError::ClipboardRestoreFailed(error));
                }
                if let Err(error) = operation {
                    if self
                        .adapter
                        .clipboard_contains_text(&request.text)
                        .unwrap_or(false)
                    {
                        diagnostics.push(format!(
                            "paste failed; text remains available in clipboard: {error}"
                        ));
                        self.adapter
                            .release_modifiers()
                            .map_err(TextInjectionError::Adapter)?;
                        return Ok(TextInjectionResult {
                            dry_run_output: None,
                            plan,
                            outcome: InjectionOutcome::CopiedFallback,
                            diagnostics,
                        });
                    }
                    return Err(TextInjectionError::Adapter(error));
                }
            }
            InjectionStrategy::Unavailable => unreachable!(),
        }
        self.adapter
            .release_modifiers()
            .map_err(TextInjectionError::Adapter)?;
        Ok(TextInjectionResult {
            dry_run_output: None,
            plan,
            outcome: InjectionOutcome::Inserted,
            diagnostics,
        })
    }
}

pub mod windows {
    //! Windows injection policy boundary.
    //!
    //! The native implementation is intentionally supplied by an outer adapter
    //! (typically `SendInput` plus a clipboard transaction). Keeping this type
    //! platform-neutral lets CI exercise policy with fakes and prevents tests from
    //! touching the user's desktop or clipboard.
    use super::*;

    pub struct WindowsTextInjector<A> {
        inner: AdapterTextInjector<A>,
        elevated_target_access: bool,
    }

    impl<A> WindowsTextInjector<A> {
        pub fn new(adapter: A) -> Self {
            Self::with_capabilities(
                adapter,
                InjectorCapabilities {
                    direct_input: true,
                    clipboard: true,
                    clipboard_restore: true,
                    undo: true,
                },
            )
        }

        pub fn with_capabilities(adapter: A, capabilities: InjectorCapabilities) -> Self {
            Self {
                inner: AdapterTextInjector::new(adapter, capabilities),
                elevated_target_access: false,
            }
        }

        /// Opt in only after the host has explicitly established matching
        /// integrity/elevation. This does not attempt to bypass UAC.
        pub fn with_elevated_target_access(mut self, permitted: bool) -> Self {
            self.elevated_target_access = permitted;
            self
        }
    }

    #[cfg(windows)]
    #[derive(Debug, Default)]
    pub struct WindowsSendInputAdapter {
        clipboard_snapshot: Option<Vec<u16>>,
    }

    #[cfg(windows)]
    impl WindowsSendInputAdapter {
        pub fn new() -> Self {
            Self {
                clipboard_snapshot: None,
            }
        }

        /// `SendInput` queues events but cannot prove that the foreground
        /// application accepted or rendered the text.
        pub const fn diagnostic() -> &'static str {
            "direct UTF-16 SendInput available; clipboard paste fallback available; focused-target insertion remains UNVERIFIED until observed"
        }
    }

    #[cfg(windows)]
    impl TextInjectionAdapter for WindowsSendInputAdapter {
        fn send_direct_input(&mut self, text: &str) -> Result<(), String> {
            use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
                INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE,
            };
            let utf16_units = text.encode_utf16().count();
            if utf16_units > (u32::MAX as usize / 2) {
                return Err("text is too large for one SendInput request".into());
            }
            let mut inputs = Vec::with_capacity(utf16_units * 2);
            for code_unit in text.encode_utf16() {
                let key = KEYBDINPUT {
                    wVk: 0,
                    wScan: code_unit,
                    dwFlags: KEYEVENTF_UNICODE,
                    time: 0,
                    dwExtraInfo: 0,
                };
                inputs.push(INPUT {
                    r#type: INPUT_KEYBOARD,
                    Anonymous: INPUT_0 { ki: key },
                });
                inputs.push(INPUT {
                    r#type: INPUT_KEYBOARD,
                    Anonymous: INPUT_0 {
                        ki: KEYBDINPUT {
                            dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                            ..key
                        },
                    },
                });
            }
            if inputs.is_empty() {
                return Ok(());
            }
            let sent = unsafe {
                windows_sys::Win32::UI::Input::KeyboardAndMouse::SendInput(
                    inputs.len() as u32,
                    inputs.as_ptr(),
                    std::mem::size_of::<INPUT>() as i32,
                )
            };
            if sent == inputs.len() as u32 {
                Ok(())
            } else {
                let error = unsafe { windows_sys::Win32::Foundation::GetLastError() };
                Err(format!(
                    "SendInput sent {sent}/{} events (error {error})",
                    inputs.len()
                ))
            }
        }
        fn snapshot_clipboard(&mut self) -> Result<(), String> {
            use windows_sys::Win32::System::DataExchange::{
                CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
            };
            const CF_UNICODETEXT: u32 = 13;
            use windows_sys::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};
            unsafe {
                if OpenClipboard(std::ptr::null_mut()) == 0 {
                    return Err("OpenClipboard failed".into());
                }
                let result: Result<Option<Vec<u16>>, String> =
                    if IsClipboardFormatAvailable(CF_UNICODETEXT) == 0 {
                        Ok(None)
                    } else {
                        let handle = GetClipboardData(CF_UNICODETEXT);
                        if handle.is_null() {
                            Err("GetClipboardData failed".into())
                        } else {
                            let size = GlobalSize(handle);
                            let ptr = GlobalLock(handle) as *const u16;
                            if ptr.is_null() {
                                Err("GlobalLock failed".into())
                            } else {
                                let units = size / 2;
                                let slice = std::slice::from_raw_parts(ptr, units);
                                let end = slice.iter().position(|unit| *unit == 0).unwrap_or(units);
                                let value = slice[..end].to_vec();
                                GlobalUnlock(handle);
                                Ok(Some(value))
                            }
                        }
                    };
                CloseClipboard();
                self.clipboard_snapshot = result?;
                Ok(())
            }
        }
        fn set_clipboard_text(&mut self, text: &str) -> Result<(), String> {
            use windows_sys::Win32::System::DataExchange::{
                CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
            };
            const CF_UNICODETEXT: u32 = 13;
            use windows_sys::Win32::System::Memory::{
                GMEM_MOVEABLE, GlobalAlloc, GlobalLock, GlobalUnlock,
            };
            let value: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
            unsafe {
                if OpenClipboard(std::ptr::null_mut()) == 0 {
                    return Err("OpenClipboard failed".into());
                }
                if EmptyClipboard() == 0 {
                    CloseClipboard();
                    return Err("EmptyClipboard failed".into());
                }
                let handle = GlobalAlloc(GMEM_MOVEABLE, value.len() * 2);
                if handle.is_null() {
                    CloseClipboard();
                    return Err("GlobalAlloc failed".into());
                }
                let ptr = GlobalLock(handle) as *mut u16;
                if ptr.is_null() {
                    CloseClipboard();
                    return Err("GlobalLock failed".into());
                }
                std::ptr::copy_nonoverlapping(value.as_ptr(), ptr, value.len());
                GlobalUnlock(handle);
                if SetClipboardData(CF_UNICODETEXT, handle).is_null() {
                    CloseClipboard();
                    return Err("SetClipboardData failed".into());
                }
                CloseClipboard();
                Ok(())
            }
        }
        fn paste_from_clipboard(&mut self) -> Result<(), String> {
            use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
                INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, SendInput, VK_CONTROL,
                VK_V,
            };
            let key = |vk: u16, flags: u32| INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: vk,
                        wScan: 0,
                        dwFlags: flags,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            };
            let inputs = [
                key(VK_CONTROL, 0),
                key(VK_V, 0),
                key(VK_V, KEYEVENTF_KEYUP),
                key(VK_CONTROL, KEYEVENTF_KEYUP),
            ];
            let sent = unsafe {
                SendInput(
                    inputs.len() as u32,
                    inputs.as_ptr(),
                    std::mem::size_of::<INPUT>() as i32,
                )
            };
            if sent == inputs.len() as u32 {
                Ok(())
            } else {
                Err(format!(
                    "paste SendInput sent {sent}/{} events",
                    inputs.len()
                ))
            }
        }
        fn restore_clipboard(&mut self) -> Result<(), String> {
            let Some(snapshot) = self.clipboard_snapshot.take() else {
                return Ok(());
            };
            self.set_clipboard_text(&String::from_utf16_lossy(&snapshot))
        }
        fn request_undo(&mut self) -> Result<(), String> {
            Err("Windows undo is not wired".into())
        }
        fn release_modifiers(&mut self) -> Result<(), String> {
            use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
                INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, SendInput, VK_CONTROL,
                VK_LMENU, VK_LSHIFT, VK_LWIN,
            };
            let keys = [VK_CONTROL, VK_LSHIFT, VK_LMENU, VK_LWIN];
            let inputs: Vec<INPUT> = keys
                .into_iter()
                .map(|vk| INPUT {
                    r#type: INPUT_KEYBOARD,
                    Anonymous: INPUT_0 {
                        ki: KEYBDINPUT {
                            wVk: vk,
                            wScan: 0,
                            dwFlags: KEYEVENTF_KEYUP,
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                })
                .collect();
            let sent = unsafe {
                SendInput(
                    inputs.len() as u32,
                    inputs.as_ptr(),
                    std::mem::size_of::<INPUT>() as i32,
                )
            };
            if sent == inputs.len() as u32 {
                Ok(())
            } else {
                Err(format!(
                    "modifier release sent {sent}/{} events",
                    inputs.len()
                ))
            }
        }
        fn focused_target_identity(&mut self) -> Result<Option<String>, String> {
            use windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
            let hwnd = unsafe { GetForegroundWindow() };
            if hwnd.is_null() {
                Ok(None)
            } else {
                Ok(Some(format!("hwnd:{:x}", hwnd as usize)))
            }
        }
        fn clipboard_contains_text(&mut self, text: &str) -> Result<bool, String> {
            self.snapshot_clipboard()?;
            Ok(self.clipboard_snapshot.as_deref()
                == Some(text.encode_utf16().collect::<Vec<_>>().as_slice()))
        }
    }

    #[cfg(windows)]
    impl WindowsTextInjector<WindowsSendInputAdapter> {
        pub fn native() -> Self {
            Self::with_capabilities(
                WindowsSendInputAdapter::new(),
                InjectorCapabilities {
                    direct_input: true,
                    clipboard: false,
                    clipboard_restore: false,
                    undo: false,
                },
            )
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
            let capabilities = target.capabilities();
            if !capabilities.accepts_text {
                return Err(TextInjectionError::UnsupportedTargetApp(
                    target.name().into(),
                ));
            }
            if capabilities.requires_elevation && !self.elevated_target_access {
                return Err(TextInjectionError::ElevatedTargetDenied);
            }
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
    fn refuses_clipboard_without_restore_capability() {
        assert_eq!(
            select_strategy(
                TARGET,
                InjectorCapabilities {
                    direct_input: false,
                    clipboard: true,
                    clipboard_restore: false,
                    undo: false
                }
            ),
            InjectionStrategy::Unavailable
        );
    }

    #[derive(Default)]
    struct FakeAdapter {
        restore_error: Option<String>,
        calls: Vec<&'static str>,
    }

    impl TextInjectionAdapter for FakeAdapter {
        fn send_direct_input(&mut self, _: &str) -> Result<(), String> {
            self.calls.push("direct");
            Ok(())
        }
        fn snapshot_clipboard(&mut self) -> Result<(), String> {
            self.calls.push("snapshot");
            Ok(())
        }
        fn set_clipboard_text(&mut self, _: &str) -> Result<(), String> {
            self.calls.push("set");
            Ok(())
        }
        fn paste_from_clipboard(&mut self) -> Result<(), String> {
            self.calls.push("paste");
            Ok(())
        }
        fn restore_clipboard(&mut self) -> Result<(), String> {
            self.calls.push("restore");
            self.restore_error.clone().map_or(Ok(()), Err)
        }
        fn request_undo(&mut self) -> Result<(), String> {
            self.calls.push("undo");
            Ok(())
        }
    }

    #[test]
    fn reports_clipboard_restore_failure() {
        let mut injector = AdapterTextInjector::new(
            FakeAdapter {
                restore_error: Some("clipboard locked".into()),
                ..Default::default()
            },
            InjectorCapabilities {
                direct_input: false,
                clipboard: true,
                clipboard_restore: true,
                undo: false,
            },
        );
        let target = Target(TextTargetCapabilities {
            supports_direct_input: false,
            ..TARGET
        });
        assert_eq!(
            injector.inject(
                &target,
                &TextInjectionRequest {
                    text: "x".into(),
                    dry_run: false
                }
            ),
            Err(TextInjectionError::ClipboardRestoreFailed(
                "clipboard locked".into()
            ))
        );
    }

    #[test]
    fn windows_policy_rejects_elevated_and_unsupported_targets() {
        let elevated = Target(TextTargetCapabilities {
            requires_elevation: true,
            ..TARGET
        });
        let unsupported = Target(TextTargetCapabilities::unavailable());
        let mut injector = windows::WindowsTextInjector::new(FakeAdapter::default());
        let request = TextInjectionRequest {
            text: "x".into(),
            dry_run: false,
        };
        assert_eq!(
            injector.inject(&elevated, &request),
            Err(TextInjectionError::ElevatedTargetDenied)
        );
        assert_eq!(
            injector.inject(&unsupported, &request),
            Err(TextInjectionError::UnsupportedTargetApp(
                "test-target".into()
            ))
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
