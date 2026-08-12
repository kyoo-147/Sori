use sori_core::{EventBus, HotkeyCombination, HotkeyError, HotkeyEvent};
use std::sync::Arc;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HotkeyServiceStatus {
    Running,
    Unsupported,
    Unavailable(String),
}

#[cfg(windows)]
pub struct HotkeyService {
    stop: std::sync::mpsc::Sender<()>,
    thread: Option<std::thread::JoinHandle<()>>,
}

#[cfg(not(windows))]
#[derive(Debug)]
pub struct HotkeyService;

#[cfg(windows)]
pub fn start_hotkey_service<B: EventBus + 'static>(
    events: Arc<B>,
    hotkey: HotkeyCombination,
    on_event: Arc<dyn Fn(HotkeyEvent) + Send + Sync>,
) -> Result<(HotkeyService, HotkeyServiceStatus), HotkeyError> {
    use sori_core::{HotkeyBackend, HotkeyEvent, WindowsHotkeyBackend};
    use std::sync::mpsc;
    use std::time::Duration;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        DispatchMessageW, MSG, PM_REMOVE, PeekMessageW, TranslateMessage, WM_HOTKEY, WM_QUIT,
    };

    let (ready_tx, ready_rx) = mpsc::sync_channel(1);
    let (stop_tx, stop_rx) = mpsc::channel();
    let thread = std::thread::spawn(move || {
        let mut backend = WindowsHotkeyBackend::new(hotkey);
        if let Err(error) = backend.start() {
            let _ = ready_tx.send(Err(error));
            return;
        }
        let _ = ready_tx.send(Ok(()));
        let mut message = MSG {
            hwnd: std::ptr::null_mut(),
            message: 0,
            wParam: 0,
            lParam: 0,
            time: 0,
            pt: windows_sys::Win32::Foundation::POINT { x: 0, y: 0 },
        };
        'outer: loop {
            if stop_rx.try_recv().is_ok() {
                break;
            }
            while unsafe { PeekMessageW(&mut message, std::ptr::null_mut(), 0, 0, PM_REMOVE) } != 0
            {
                if message.message == WM_QUIT {
                    break 'outer;
                }
                if message.message == WM_HOTKEY {
                    if let Ok(Some(event)) = backend.handle_message(
                        message.message,
                        message.wParam as usize,
                        message.lParam,
                    ) {
                        events.publish(event.into_event());
                        on_event(event);
                        if event == HotkeyEvent::Pressed {
                            while hotkey_is_down(hotkey) && stop_rx.try_recv().is_err() {
                                std::thread::sleep(Duration::from_millis(10));
                            }
                            if let Ok(Some(released)) =
                                backend.handle_input(sori_core::HotkeyInput::Released)
                            {
                                events.publish(released.into_event());
                                on_event(released);
                            }
                        }
                    }
                } else {
                    unsafe {
                        TranslateMessage(&message);
                        DispatchMessageW(&message);
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        let _ = backend.stop();
    });
    match ready_rx.recv().expect("hotkey worker startup response") {
        Ok(()) => Ok((
            HotkeyService {
                stop: stop_tx,
                thread: Some(thread),
            },
            HotkeyServiceStatus::Running,
        )),
        Err(error) => {
            let _ = thread.join();
            Err(error)
        }
    }
}

#[cfg(not(windows))]
pub fn start_hotkey_service<B: EventBus + 'static>(
    _events: Arc<B>,
    _hotkey: HotkeyCombination,
    _on_event: Arc<dyn Fn(HotkeyEvent) + Send + Sync>,
) -> Result<(HotkeyService, HotkeyServiceStatus), HotkeyError> {
    Ok((HotkeyService, HotkeyServiceStatus::Unsupported))
}

#[cfg(windows)]
impl Drop for HotkeyService {
    fn drop(&mut self) {
        let _ = self.stop.send(());
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

#[cfg(windows)]
fn hotkey_is_down(hotkey: HotkeyCombination) -> bool {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    let key_down = unsafe { GetAsyncKeyState(hotkey.virtual_key as i32) } < 0;
    let modifiers_down =
        [(1, 0x12), (2, 0x11), (4, 0x10), (8, 0x5b)]
            .iter()
            .all(|(modifier, key)| {
                hotkey.modifiers & modifier == 0 || unsafe { GetAsyncKeyState(*key) } < 0
            });
    key_down && modifiers_down
}
