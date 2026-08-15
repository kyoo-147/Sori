//! Platform-neutral hold-to-talk hotkey contracts and state machine.
//!
//! OS adapters should translate native key notifications into [`HotkeyInput`]
//! values and feed them to [`HotkeyStateMachine`]. The state machine deliberately
//! ignores duplicate notifications, making it safe to use with key-repeat.

use crate::event::{Event, EventBus, EventKind, serde_json_like::Value};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HotkeyInput {
    Pressed,
    Released,
    Cancelled,
    /// Toggle the current session for sources without key-up notifications.
    Toggle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HotkeyState {
    Idle,
    Held,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HotkeyEvent {
    Pressed,
    Released,
    Cancelled,
}

impl HotkeyEvent {
    pub const fn kind(self) -> EventKind {
        match self {
            Self::Pressed => EventKind::HotkeyPressed,
            Self::Released => EventKind::HotkeyReleased,
            Self::Cancelled => EventKind::HotkeyCancelled,
        }
    }

    pub fn into_event(self) -> Event {
        Event {
            id: Uuid::new_v4(),
            at: OffsetDateTime::now_utc(),
            kind: self.kind(),
            payload: Value::Null,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct HotkeyStateMachine {
    state: HotkeyState,
}

impl Default for HotkeyStateMachine {
    fn default() -> Self {
        Self::new()
    }
}

impl HotkeyStateMachine {
    pub const fn new() -> Self {
        Self {
            state: HotkeyState::Idle,
        }
    }

    pub const fn state(self) -> HotkeyState {
        self.state
    }

    /// Applies an input and returns an event only when it changes the session.
    pub fn apply(&mut self, input: HotkeyInput) -> Option<HotkeyEvent> {
        match (self.state, input) {
            (HotkeyState::Idle, HotkeyInput::Pressed) => {
                self.state = HotkeyState::Held;
                Some(HotkeyEvent::Pressed)
            }
            (HotkeyState::Held, HotkeyInput::Released) => {
                self.state = HotkeyState::Idle;
                Some(HotkeyEvent::Released)
            }
            (HotkeyState::Held, HotkeyInput::Cancelled) => {
                self.state = HotkeyState::Idle;
                Some(HotkeyEvent::Cancelled)
            }
            (HotkeyState::Idle, HotkeyInput::Toggle) => {
                self.state = HotkeyState::Held;
                Some(HotkeyEvent::Pressed)
            }
            (HotkeyState::Held, HotkeyInput::Toggle) => {
                self.state = HotkeyState::Idle;
                Some(HotkeyEvent::Released)
            }
            // Ignore key-repeat and stale release/cancel notifications.
            _ => None,
        }
    }

    pub fn apply_and_publish<B: EventBus>(
        &mut self,
        input: HotkeyInput,
        events: &B,
    ) -> Option<HotkeyEvent> {
        let event = self.apply(input)?;
        events.publish(event.into_event());
        Some(event)
    }
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum HotkeyError {
    #[error("hotkey backend is not available on this platform")]
    Unsupported,
    #[error("hotkey backend is already running")]
    AlreadyRunning,
    #[error("hotkey backend is not running")]
    NotRunning,
    #[error("hotkey is already registered by another application")]
    Conflict,
    #[error("native hotkey operation failed with error code {0}")]
    Native(u32),
    #[error("hotkey listener became stale and could not be recovered")]
    StaleListener,
}

/// A Windows virtual-key combination. Modifiers use the Win32 MOD_* bit values.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HotkeyCombination {
    pub modifiers: u32,
    pub virtual_key: u32,
}

impl HotkeyCombination {
    pub const MOD_ALT: u32 = 1;
    pub const MOD_CTRL: u32 = 2;
    pub const MOD_SHIFT: u32 = 4;
    pub const MOD_WIN: u32 = 8;

    pub const fn new(modifiers: u32, virtual_key: u32) -> Self {
        Self {
            modifiers,
            virtual_key,
        }
    }

    pub const fn fallback() -> Self {
        Self::new(Self::MOD_CTRL | Self::MOD_ALT, 0x20)
    }
}

/// The small native boundary used by the Windows backend. Keeping registration
/// here makes lifecycle and conflict handling testable without Win32.
pub trait HotkeyRegistration {
    fn register(&mut self, hotkey: HotkeyCombination) -> Result<(), HotkeyError>;
    fn unregister(&mut self) -> Result<(), HotkeyError>;

    fn reregister(&mut self, hotkey: HotkeyCombination) -> Result<(), HotkeyError> {
        let _ = self.unregister();
        self.register(hotkey)
    }
}

/// In-memory registration adapter for hold-to-talk tests and non-interactive CI.
#[derive(Debug, Default)]
pub struct FakeHotkeyRegistration {
    pub register_calls: usize,
    pub unregister_calls: usize,
    pub fail_with: Option<HotkeyError>,
    registered: bool,
}

impl HotkeyRegistration for FakeHotkeyRegistration {
    fn register(&mut self, _hotkey: HotkeyCombination) -> Result<(), HotkeyError> {
        self.register_calls += 1;
        if let Some(error) = &self.fail_with {
            return Err(error.clone());
        }
        self.registered = true;
        Ok(())
    }

    fn unregister(&mut self) -> Result<(), HotkeyError> {
        self.unregister_calls += 1;
        self.registered = false;
        Ok(())
    }
}

/// A platform-independent backend harness. Feed native-like notifications to
/// [`FakeHotkeyBackend::input`] to verify hold-to-talk behavior.
#[derive(Debug)]
pub struct FakeHotkeyBackend<R = FakeHotkeyRegistration> {
    registration: R,
    hotkey: HotkeyCombination,
    running: bool,
    state: HotkeyStateMachine,
}

impl FakeHotkeyBackend {
    pub fn new(hotkey: HotkeyCombination) -> Self {
        Self::with_registration(hotkey, FakeHotkeyRegistration::default())
    }
}

impl<R: HotkeyRegistration> FakeHotkeyBackend<R> {
    pub fn with_registration(hotkey: HotkeyCombination, registration: R) -> Self {
        Self {
            registration,
            hotkey,
            running: false,
            state: HotkeyStateMachine::new(),
        }
    }

    pub fn input(&mut self, input: HotkeyInput) -> Result<Option<HotkeyEvent>, HotkeyError> {
        if !self.running {
            return Err(HotkeyError::NotRunning);
        }
        Ok(self.state.apply(input))
    }

    pub fn registration(&self) -> &R {
        &self.registration
    }
}

impl<R: HotkeyRegistration> HotkeyBackend for FakeHotkeyBackend<R> {
    fn start(&mut self) -> Result<(), HotkeyError> {
        if self.running {
            return Err(HotkeyError::AlreadyRunning);
        }
        self.registration.register(self.hotkey)?;
        self.running = true;
        Ok(())
    }

    fn stop(&mut self) -> Result<(), HotkeyError> {
        if !self.running {
            return Err(HotkeyError::NotRunning);
        }
        self.registration.unregister()?;
        self.running = false;
        self.state = HotkeyStateMachine::new();
        Ok(())
    }
}

/// Boundary for native registration and notification loops.
///
/// A backend owns OS resources; event normalization remains in
/// [`HotkeyStateMachine`] so it can be tested without Windows.
pub trait HotkeyBackend {
    fn start(&mut self) -> Result<(), HotkeyError>;
    fn stop(&mut self) -> Result<(), HotkeyError>;
    fn recover(&mut self) -> Result<(), HotkeyError> {
        self.stop()?;
        self.start()
    }
}

#[derive(Debug, Default)]
pub struct UnsupportedHotkeyBackend;

impl HotkeyBackend for UnsupportedHotkeyBackend {
    fn start(&mut self) -> Result<(), HotkeyError> {
        Err(HotkeyError::Unsupported)
    }

    fn stop(&mut self) -> Result<(), HotkeyError> {
        Err(HotkeyError::Unsupported)
    }
}

/// Win32 registration adapter. It only owns registration; a host message loop
/// should pass WM_HOTKEY messages to [`WindowsHotkeyBackend::handle_message`].
#[cfg(windows)]
#[derive(Debug)]
pub struct WindowsHotkeyRegistration {
    id: i32,
}

#[cfg(windows)]
impl Default for WindowsHotkeyRegistration {
    fn default() -> Self {
        Self { id: 0x534f }
    }
}

#[cfg(windows)]
impl HotkeyRegistration for WindowsHotkeyRegistration {
    fn register(&mut self, hotkey: HotkeyCombination) -> Result<(), HotkeyError> {
        let success = unsafe {
            windows_sys::Win32::UI::Input::KeyboardAndMouse::RegisterHotKey(
                std::ptr::null_mut(),
                self.id,
                hotkey.modifiers,
                hotkey.virtual_key,
            )
        };
        if success != 0 {
            return Ok(());
        }
        let code = unsafe { windows_sys::Win32::Foundation::GetLastError() };
        if code == 1409 {
            Err(HotkeyError::Conflict)
        } else {
            Err(HotkeyError::Native(code))
        }
    }

    fn unregister(&mut self) -> Result<(), HotkeyError> {
        let success = unsafe {
            windows_sys::Win32::UI::Input::KeyboardAndMouse::UnregisterHotKey(
                std::ptr::null_mut(),
                self.id,
            )
        };
        if success != 0 {
            Ok(())
        } else {
            Err(HotkeyError::Native(unsafe {
                windows_sys::Win32::Foundation::GetLastError()
            }))
        }
    }
}

#[cfg(windows)]
#[derive(Debug)]
pub struct WindowsHotkeyBackend<R = WindowsHotkeyRegistration> {
    registration: R,
    hotkey: HotkeyCombination,
    running: bool,
    state: HotkeyStateMachine,
}

#[cfg(windows)]
impl WindowsHotkeyBackend {
    pub fn new(hotkey: HotkeyCombination) -> Self {
        Self::with_registration(hotkey, WindowsHotkeyRegistration::default())
    }
}

#[cfg(windows)]
impl<R: HotkeyRegistration> WindowsHotkeyBackend<R> {
    pub fn with_registration(hotkey: HotkeyCombination, registration: R) -> Self {
        Self {
            registration,
            hotkey,
            running: false,
            state: HotkeyStateMachine::new(),
        }
    }

    /// Translate a WM_HOTKEY notification into a normalized hold-to-talk input.
    /// The caller supplies key-down/up notifications because RegisterHotKey
    /// reports a completed combination rather than key release itself.
    pub fn handle_input(&mut self, input: HotkeyInput) -> Result<Option<HotkeyEvent>, HotkeyError> {
        if !self.running {
            return Err(HotkeyError::NotRunning);
        }
        Ok(self.state.apply(input))
    }

    pub fn handle_message(
        &mut self,
        message: u32,
        wparam: usize,
        _lparam: isize,
    ) -> Result<Option<HotkeyEvent>, HotkeyError> {
        if message != windows_sys::Win32::UI::WindowsAndMessaging::WM_HOTKEY
            || wparam != self.registration_id() as usize
        {
            return Ok(None);
        }
        let packed = _lparam as u32;
        if (packed & 0xffff) != self.hotkey.modifiers
            || ((packed >> 16) & 0xffff) != self.hotkey.virtual_key
        {
            return Ok(None);
        }
        self.handle_input(HotkeyInput::Pressed)
    }

    pub fn rebind(&mut self, hotkey: HotkeyCombination) -> Result<(), HotkeyError> {
        if !self.running {
            self.hotkey = hotkey;
            return Ok(());
        }
        let previous = self.hotkey;
        self.stop()?;
        self.hotkey = hotkey;
        if let Err(error) = self.start() {
            self.hotkey = previous;
            let _ = self.start();
            return Err(error);
        }
        Ok(())
    }

    pub fn registration(&self) -> &R {
        &self.registration
    }

    pub fn active_hotkey(&self) -> HotkeyCombination {
        self.hotkey
    }

    fn registration_id(&self) -> i32 {
        0x534f
    }
}

#[cfg(windows)]
impl<R: HotkeyRegistration> HotkeyBackend for WindowsHotkeyBackend<R> {
    fn start(&mut self) -> Result<(), HotkeyError> {
        if self.running {
            return Err(HotkeyError::AlreadyRunning);
        }
        match self.registration.register(self.hotkey) {
            Ok(()) => {}
            Err(HotkeyError::Conflict) => return Err(HotkeyError::Conflict),
            Err(error) => return Err(error),
        }
        self.running = true;
        Ok(())
    }

    fn stop(&mut self) -> Result<(), HotkeyError> {
        if !self.running {
            return Err(HotkeyError::NotRunning);
        }
        self.registration.unregister()?;
        self.running = false;
        self.state = HotkeyStateMachine::new();
        Ok(())
    }

    fn recover(&mut self) -> Result<(), HotkeyError> {
        // A stale owner may already have disappeared; recovery must not
        // depend on UnregisterHotKey succeeding first.
        let _ = self.registration.unregister();
        self.running = false;
        self.state = HotkeyStateMachine::new();
        self.start()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::InMemoryEventBus;

    #[test]
    fn hold_to_talk_transitions_once() {
        let mut state = HotkeyStateMachine::new();
        assert_eq!(
            state.apply(HotkeyInput::Pressed),
            Some(HotkeyEvent::Pressed)
        );
        assert_eq!(state.apply(HotkeyInput::Pressed), None);
        assert_eq!(
            state.apply(HotkeyInput::Released),
            Some(HotkeyEvent::Released)
        );
        assert_eq!(state.state(), HotkeyState::Idle);
    }

    #[test]
    fn fake_backend_models_registration_and_hold_semantics() {
        let hotkey = HotkeyCombination::new(0, 0x20);
        let mut backend = FakeHotkeyBackend::new(hotkey);
        assert_eq!(
            backend.input(HotkeyInput::Pressed),
            Err(HotkeyError::NotRunning)
        );
        backend.start().unwrap();
        assert_eq!(
            backend.input(HotkeyInput::Pressed).unwrap(),
            Some(HotkeyEvent::Pressed)
        );
        assert_eq!(backend.input(HotkeyInput::Pressed).unwrap(), None);
        assert_eq!(
            backend.input(HotkeyInput::Released).unwrap(),
            Some(HotkeyEvent::Released)
        );
        backend.stop().unwrap();
        assert_eq!(backend.registration().register_calls, 1);
        assert_eq!(backend.registration().unregister_calls, 1);
    }

    #[cfg(windows)]
    #[test]
    fn windows_backend_translates_registered_message_and_release() {
        let registration = FakeHotkeyRegistration::default();
        let mut backend =
            WindowsHotkeyBackend::with_registration(HotkeyCombination::new(1, 0x20), registration);
        backend.start().unwrap();
        assert_eq!(
            backend.handle_message(
                windows_sys::Win32::UI::WindowsAndMessaging::WM_HOTKEY,
                0x534f,
                ((0x20u32 << 16) | 1) as isize
            ),
            Ok(Some(HotkeyEvent::Pressed))
        );
        assert_eq!(
            backend.handle_input(HotkeyInput::Released),
            Ok(Some(HotkeyEvent::Released))
        );
        backend.stop().unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn windows_backend_rebinds_without_fallback() {
        let registration = FakeHotkeyRegistration::default();
        let mut backend = WindowsHotkeyBackend::with_registration(
            HotkeyCombination::new(HotkeyCombination::MOD_ALT, 0x20),
            registration,
        );
        backend.start().unwrap();
        backend
            .rebind(HotkeyCombination::new(
                HotkeyCombination::MOD_CTRL,
                b'K' as u32,
            ))
            .unwrap();
        assert_eq!(backend.active_hotkey().virtual_key, b'K' as u32);
        assert_eq!(backend.registration().register_calls, 2);
        assert_eq!(backend.registration().unregister_calls, 1);
        backend.stop().unwrap();
    }

    #[test]
    fn fake_backend_preserves_registration_conflicts() {
        let registration = FakeHotkeyRegistration {
            fail_with: Some(HotkeyError::Conflict),
            ..Default::default()
        };
        let mut backend =
            FakeHotkeyBackend::with_registration(HotkeyCombination::new(0, 0x20), registration);
        assert_eq!(backend.start(), Err(HotkeyError::Conflict));
        assert_eq!(backend.registration().register_calls, 1);
    }

    #[test]
    fn cancellation_returns_to_idle_and_publishes() {
        let mut state = HotkeyStateMachine::new();
        let events = InMemoryEventBus::default();
        assert_eq!(
            state.apply_and_publish(HotkeyInput::Pressed, &events),
            Some(HotkeyEvent::Pressed)
        );
        assert_eq!(
            state.apply_and_publish(HotkeyInput::Cancelled, &events),
            Some(HotkeyEvent::Cancelled)
        );
        assert_eq!(state.apply(HotkeyInput::Released), None);
        assert_eq!(
            events
                .recent()
                .iter()
                .map(|event| event.kind.clone())
                .collect::<Vec<_>>(),
            vec![EventKind::HotkeyPressed, EventKind::HotkeyCancelled,]
        );
    }
}

#[cfg(test)]
mod lifecycle_tests {
    use super::*;

    #[test]
    fn toggle_and_stale_notifications_are_deterministic() {
        let mut state = HotkeyStateMachine::new();
        assert_eq!(state.apply(HotkeyInput::Released), None);
        assert_eq!(state.apply(HotkeyInput::Toggle), Some(HotkeyEvent::Pressed));
        assert_eq!(
            state.apply(HotkeyInput::Toggle),
            Some(HotkeyEvent::Released)
        );
        assert_eq!(state.apply(HotkeyInput::Cancelled), None);
        assert_eq!(state.state(), HotkeyState::Idle);
    }

    #[test]
    fn backend_recovery_reregisters_and_clears_held_state() {
        let mut backend =
            FakeHotkeyBackend::new(HotkeyCombination::new(HotkeyCombination::MOD_ALT, 0x20));
        backend.start().unwrap();
        assert_eq!(
            backend.input(HotkeyInput::Pressed).unwrap(),
            Some(HotkeyEvent::Pressed)
        );
        backend.recover().unwrap();
        assert_eq!(backend.input(HotkeyInput::Released).unwrap(), None);
        assert_eq!(backend.registration().register_calls, 2);
        assert_eq!(backend.registration().unregister_calls, 1);
    }
}
