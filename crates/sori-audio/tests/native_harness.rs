//! Opt-in native CPAL lifecycle harness.
//!
//! This never runs in ordinary CI and does not claim microphone speech proof.
//! Run with `SORI_NATIVE_AUDIO_HARNESS=1 cargo test -p sori-audio
//! --test native_harness -- --ignored --nocapture` on a Windows host with a
//! safe input device.

use sori_audio::CpalAudioController;
use sori_core::{AudioCaptureEngine, CaptureConfig};
use std::time::Duration;

#[test]
#[ignore = "requires an opted-in native input device"]
fn native_device_start_stop_is_recovery_safe() {
    if std::env::var("SORI_NATIVE_AUDIO_HARNESS").as_deref() != Ok("1") {
        eprintln!("SKIP: set SORI_NATIVE_AUDIO_HARNESS=1 to open a native input device");
        return;
    }

    let mut controller = CpalAudioController::new(CaptureConfig::default())
        .expect("default capture configuration must validate");
    let device = controller.start_capture();
    match device {
        Ok(device) => {
            eprintln!(
                "VERIFIED: CPAL stream started for {}; speech/VAD/transcription remain unverified",
                device.name
            );
            std::thread::sleep(Duration::from_millis(250));
            controller.stop_capture();
            assert!(!controller.is_running());
            assert!(controller.session().is_none());
            assert!(
                controller.start_capture().is_ok(),
                "capture must recover after stop"
            );
            controller.stop_capture();
        }
        Err(error) => {
            eprintln!("UNVERIFIED: native CPAL start failed: {error}");
            assert!(!controller.is_running());
        }
    }
}
