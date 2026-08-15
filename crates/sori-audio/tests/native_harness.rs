//! Opt-in native CPAL capture and Whisper handoff harness.
//!
//! This never runs in ordinary CI. Run with `SORI_NATIVE_AUDIO_HARNESS=1` on a
//! Windows host with a safe input device. Set `SORI_NATIVE_AUDIO_TRANSCRIBE=1`
//! to invoke a user-owned whisper.cpp runtime after capture; configure
//! `SORI_WHISPER_CPP_BIN`, `SORI_WHISPER_MODEL_DIR`, and optionally
//! `SORI_WHISPER_MODEL` for that path.

use sori_audio::CpalAudioController;
use sori_core::{AudioCaptureEngine, AudioEngine, CaptureConfig, ModelProvider};
use sori_provider_whisper::{OutputFormat, ProcessOptions, WhisperCppConfig, WhisperCppProvider};
use std::time::Duration;

#[test]
#[ignore = "requires an opted-in native input device"]
fn native_device_capture_reports_signal_and_can_reach_whisper() {
    if std::env::var("SORI_NATIVE_AUDIO_HARNESS").as_deref() != Ok("1") {
        eprintln!("SKIP: set SORI_NATIVE_AUDIO_HARNESS=1 to open a native input device");
        return;
    }

    let duration_ms = std::env::var("SORI_NATIVE_AUDIO_HARNESS_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(1_000);
    let config = CaptureConfig {
        device_id: std::env::var("SORI_NATIVE_AUDIO_DEVICE_ID").ok(),
        ..CaptureConfig::default()
    };
    let mut controller =
        CpalAudioController::new(config).expect("default capture configuration must validate");
    let device = controller
        .start_capture()
        .unwrap_or_else(|error| panic!("native CPAL capture failed: {error}"));
    eprintln!(
        "VERIFIED: CPAL stream started for {}; collect signal for {duration_ms} ms now",
        device.name
    );
    std::thread::sleep(Duration::from_millis(duration_ms));
    controller.stop_capture();

    let mut chunks = Vec::new();
    while let Some(chunk) = controller
        .next_chunk()
        .unwrap_or_else(|error| panic!("native capture handoff failed: {error}"))
    {
        chunks.push(chunk);
    }
    let sample_count: usize = chunks.iter().map(|chunk| chunk.samples.len()).sum();
    let peak = chunks
        .iter()
        .flat_map(|chunk| chunk.samples.iter())
        .map(|sample| sample.abs())
        .fold(0.0_f32, f32::max);
    let energy: f32 = chunks
        .iter()
        .flat_map(|chunk| chunk.samples.iter())
        .map(|sample| sample * sample)
        .sum();
    let rms = if sample_count == 0 {
        0.0
    } else {
        (energy / sample_count as f32).sqrt()
    };
    let format = chunks.first().map(|chunk| &chunk.format);
    eprintln!(
        "VERIFIED: native capture diagnostics device={} chunks={} samples={} rate={} channels={} peak={peak:.9} rms={rms:.9}",
        device.name,
        chunks.len(),
        sample_count,
        format.map_or(0, |value| value.sample_rate_hz),
        format.map_or(0, |value| value.channels),
    );
    assert!(
        chunks
            .iter()
            .all(|chunk| chunk.format.sample_rate_hz == 16_000)
    );
    assert!(chunks.iter().all(|chunk| chunk.format.channels == 1));
    assert!(!chunks.is_empty(), "native stream produced no audio chunks");

    if std::env::var("SORI_NATIVE_AUDIO_TRANSCRIBE").as_deref() == Ok("1") {
        if peak < 0.005 {
            eprintln!(
                "UNVERIFIED: capture_signal_unavailable samples={sample_count} rate={} peak={peak:.9} rms={rms:.9}; speak into the selected device or fix Windows microphone permission before Whisper acceptance",
                format.map_or(0, |value| value.sample_rate_hz)
            );
        } else {
            transcribe_with_user_owned_runtime(&chunks);
        }
    } else {
        eprintln!(
            "SKIP: set SORI_NATIVE_AUDIO_TRANSCRIBE=1 plus SORI_WHISPER_CPP_BIN and SORI_WHISPER_MODEL_DIR to invoke Whisper"
        );
    }

    assert!(!controller.is_running());
    assert!(controller.session().is_none());
    assert!(
        controller.start_capture().is_ok(),
        "capture must recover after drain"
    );
    controller.stop_capture();
}

fn transcribe_with_user_owned_runtime(chunks: &[sori_core::AudioChunk]) {
    let config = WhisperCppConfig::discover().unwrap_or_else(|error| {
        panic!(
            "Whisper runtime setup failed: {error}; set SORI_WHISPER_CPP_BIN to a user-owned whisper-cli executable and SORI_WHISPER_MODEL_DIR to its model directory"
        )
    });
    let model_dir = config.model_dir.clone().unwrap_or_else(|| {
        panic!("Whisper runtime setup failed: model directory is unset; set SORI_WHISPER_MODEL_DIR")
    });
    let provider = WhisperCppProvider::from_config(config, Vec::new());
    let manifests = provider.discover_models().unwrap_or_else(|error| {
        panic!(
            "Whisper model discovery failed in {}: {error}",
            model_dir.display()
        )
    });
    let model_name = std::env::var("SORI_WHISPER_MODEL")
        .ok()
        .or_else(|| manifests.first().map(|manifest| manifest.id.0.clone()))
        .unwrap_or_else(|| {
            panic!(
                "Whisper model setup failed: no .bin model found in {}",
                model_dir.display()
            )
        });
    let model = sori_core::ModelId::from(model_name.as_str());
    if !provider.can_transcribe(&model) {
        panic!(
            "Whisper model is unavailable: {} (expected a real .bin file under {})",
            model.0,
            model_dir.display()
        );
    }
    let transcript = provider
        .transcribe_audio(
            &model,
            chunks,
            OutputFormat::Text,
            &ProcessOptions::default(),
        )
        .unwrap_or_else(|error| {
            panic!("Whisper ran but produced no canonical transcript: {error}")
        });
    assert!(
        !transcript.text.trim().is_empty(),
        "Whisper returned an empty transcript"
    );
    eprintln!(
        "VERIFIED: real captured audio produced transcript: {}",
        transcript.text
    );
}
