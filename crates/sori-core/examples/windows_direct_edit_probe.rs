#[cfg(not(windows))]
fn main() {
    eprintln!("SKIP: windows direct EDIT probe requires Windows");
}

#[cfg(windows)]
fn main() {
    use sori_core::text_injection::windows::WindowsTextInjector;
    use sori_core::text_injection::{
        TextInjectionRequest, TextInjectionResult, TextInjector, TextTarget, TextTargetCapabilities,
    };
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::WindowsAndMessaging::{FindWindowW, GetWindowThreadProcessId};

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
                supports_clipboard_paste: false,
                supports_undo: false,
                requires_elevation: false,
            }
        }
        fn identity(&self) -> Option<&str> {
            Some(&self.identity)
        }
    }

    let title = std::env::args().nth(1).expect("window title");
    let text = std::env::args()
        .nth(2)
        .unwrap_or_else(|| "Sori direct Unicode probe 😀 漢字".into());
    let wide: Vec<u16> = OsStr::new(&title)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let hwnd = unsafe { FindWindowW(std::ptr::null(), wide.as_ptr()) };
    if hwnd.is_null() {
        panic!("target window not found: {title}");
    }
    let mut pid = 0;
    unsafe {
        GetWindowThreadProcessId(hwnd, &mut pid);
    }
    let target = Target {
        identity: format!("pid:{pid};hwnd:{:x}", hwnd as usize),
    };
    let mut injector = WindowsTextInjector::native();
    let result: Result<TextInjectionResult, _> = injector.inject(
        &target,
        &TextInjectionRequest {
            text,
            dry_run: false,
        },
    );
    println!("{result:?}");
}
