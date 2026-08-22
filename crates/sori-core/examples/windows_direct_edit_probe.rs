#[cfg(not(windows))]
fn main() {
    eprintln!("SKIP: windows direct EDIT probe requires Windows");
}

#[cfg(windows)]
fn main() {
    use sori_core::text_injection::windows::WindowsTextInjector;
    use sori_core::text_injection::{
        InjectionStrategy, TextInjectionRequest, TextInjector, TextTarget, TextTargetCapabilities,
    };
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        FindWindowW, GetForegroundWindow, GetWindowThreadProcessId,
    };

    let mut args = std::env::args().skip(1);
    let title = args.next().expect("window title");
    let mode = args.next().unwrap_or_else(|| "direct".into());
    let text = args
        .next()
        .unwrap_or_else(|| "Sori direct Unicode probe 😀 漢字".into());
    let strategy = match mode.as_str() {
        "direct" => InjectionStrategy::DirectInput,
        "clipboard" => InjectionStrategy::ClipboardPaste,
        other => panic!("mode must be direct or clipboard, got {other}"),
    };
    let wide: Vec<u16> = OsStr::new(&title)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let hwnd = unsafe { FindWindowW(std::ptr::null(), wide.as_ptr()) };
    if hwnd.is_null() {
        panic!("target window not found: {title}");
    }
    let mut pid = 0;
    unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
    let foreground = unsafe { GetForegroundWindow() };
    let mut foreground_pid = 0;
    unsafe { GetWindowThreadProcessId(foreground, &mut foreground_pid) };
    if foreground != hwnd || foreground_pid != pid {
        panic!(
            "refusing unknown foreground target: expected pid={pid};hwnd:{:x}, actual pid={foreground_pid};hwnd:{:x}",
            hwnd as usize, foreground as usize
        );
    }
    struct Target {
        identity: String,
    }
    impl TextTarget for Target {
        fn name(&self) -> &str {
            "harness-owned Win32 EDIT target"
        }
        fn capabilities(&self) -> TextTargetCapabilities {
            TextTargetCapabilities {
                accepts_text: true,
                supports_direct_input: true,
                supports_clipboard_paste: true,
                supports_undo: false,
                requires_elevation: false,
            }
        }
        fn identity(&self) -> Option<&str> {
            Some(&self.identity)
        }
    }
    let target = Target {
        identity: format!("pid:{pid};hwnd:{:x}", hwnd as usize),
    };
    let mut injector = WindowsTextInjector::native();
    let result = match strategy {
        InjectionStrategy::DirectInput => injector.inject(
            &target,
            &TextInjectionRequest {
                text,
                dry_run: false,
            },
        ),
        InjectionStrategy::ClipboardPaste => injector.inject_clipboard(
            &target,
            &TextInjectionRequest {
                text,
                dry_run: false,
            },
        ),
        InjectionStrategy::Unavailable => unreachable!(),
    };
    match result {
        Ok(result) => println!(
            "PASS mode={mode} outcome={:?} diagnostics={:?}",
            result.outcome, result.diagnostics
        ),
        Err(error) => {
            eprintln!("ERROR mode={mode}: {error}");
            std::process::exit(2);
        }
    }
}
