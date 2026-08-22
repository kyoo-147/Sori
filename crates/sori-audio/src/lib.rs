//! CPAL-backed microphone capture. The callback only performs a non-blocking send;
//! chunking and timestamping happen on the consumer side.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, Host, SampleFormat as CpalSampleFormat, Stream, StreamConfig};
use sori_core::{
    AudioCaptureEngine, AudioChunk, AudioDeviceInfo, AudioDeviceProvider, AudioEngine, AudioError,
    AudioFormat, CaptureConfig, SampleFormat,
};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError, SyncSender, TrySendError};
use std::sync::{Arc, mpsc};
use time::OffsetDateTime;
/// Native capture lifecycle. `Recording` is only entered after CPAL accepts
/// `Stream::play`; a device is never reported as ready before that point.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CaptureState {
    Idle,
    Starting,
    Recording,
    Stopping,
}

/// Identity for one capture attempt. Generation IDs make stale worker output
/// distinguishable from the current recording without changing core IPC.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CaptureSession {
    pub generation: u64,
    pub device: AudioDeviceInfo,
}

pub struct CpalAudioDeviceProvider {
    host: Host,
}

impl Default for CpalAudioDeviceProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl CpalAudioDeviceProvider {
    pub fn new() -> Self {
        Self {
            host: cpal::default_host(),
        }
    }

    fn devices(&self) -> Result<Vec<Device>, AudioError> {
        self.host
            .input_devices()
            .map(|devices| devices.collect())
            .map_err(|error| AudioError::BackendUnavailable(error.to_string()))
    }

    pub fn default_input(&self) -> Result<(AudioDeviceInfo, Device), AudioError> {
        let device = self
            .host
            .default_input_device()
            .ok_or_else(|| AudioError::DeviceUnavailable("no default input device".to_owned()))?;
        let name = device
            .name()
            .map_err(|error| AudioError::BackendUnavailable(error.to_string()))?;
        let info = self
            .list_input_devices()?
            .into_iter()
            .find(|item| item.name == name && item.is_default_input)
            .unwrap_or(AudioDeviceInfo {
                id: device_id(0, &name),
                name,
                is_default_input: true,
            });
        Ok((info, device))
    }

    fn device_by_id(&self, id: &str) -> Result<(AudioDeviceInfo, Device), AudioError> {
        let devices = self.devices()?;
        for (index, device) in devices.into_iter().enumerate() {
            let name = device
                .name()
                .map_err(|error| AudioError::BackendUnavailable(error.to_string()))?;
            if device_id(index, &name) == id {
                return Ok((
                    AudioDeviceInfo {
                        id: id.to_owned(),
                        name,
                        is_default_input: false,
                    },
                    device,
                ));
            }
        }
        Err(AudioError::DeviceUnavailable(format!(
            "input device {id} was not found"
        )))
    }
}

fn device_id(index: usize, name: &str) -> String {
    format!("{index}:{name}")
}

impl AudioDeviceProvider for CpalAudioDeviceProvider {
    fn list_input_devices(&self) -> Result<Vec<AudioDeviceInfo>, AudioError> {
        let default_name = self
            .host
            .default_input_device()
            .and_then(|device| device.name().ok());
        self.devices()?
            .into_iter()
            .enumerate()
            .map(|(index, device)| {
                let name = device
                    .name()
                    .map_err(|error| AudioError::BackendUnavailable(error.to_string()))?;
                Ok(AudioDeviceInfo {
                    id: device_id(index, &name),
                    is_default_input: default_name.as_deref() == Some(name.as_str()),
                    name,
                })
            })
            .collect()
    }
}

type Packet = Vec<f32>;

pub struct CpalAudioEngine {
    provider: CpalAudioDeviceProvider,
    config: CaptureConfig,
    input_format: AudioFormat,
    native_format: AudioFormat,
    stream: Option<Stream>,
    packets: Option<Receiver<Packet>>,
    errors: Option<Receiver<AudioError>>,
    pending: VecDeque<f32>,
    dsp: sori_core::AudioDsp,
    callback_active: Option<Arc<AtomicBool>>,
}

impl CpalAudioEngine {
    pub fn new(config: CaptureConfig) -> Result<Self, AudioError> {
        config.validate()?;
        Ok(Self {
            provider: CpalAudioDeviceProvider::new(),
            input_format: config.format.clone(),
            native_format: config.format.clone(),
            config,
            stream: None,
            packets: None,
            errors: None,
            pending: VecDeque::new(),
            dsp: sori_core::AudioDsp::new(sori_core::DspPipelineConfig::default())
                .expect("default DSP configuration is valid"),
            callback_active: None,
        })
    }

    pub fn with_provider(
        config: CaptureConfig,
        provider: CpalAudioDeviceProvider,
    ) -> Result<Self, AudioError> {
        config.validate()?;
        Ok(Self {
            input_format: config.format.clone(),
            native_format: config.format.clone(),
            config,
            provider,
            stream: None,
            packets: None,
            errors: None,
            dsp: sori_core::AudioDsp::new(sori_core::DspPipelineConfig::default())
                .expect("default DSP configuration is valid"),
            pending: VecDeque::new(),
            callback_active: None,
        })
    }

    pub fn start(&mut self) -> Result<AudioDeviceInfo, AudioError> {
        if self.stream.is_some() {
            return Err(AudioError::Pipeline(
                "capture is already running".to_owned(),
            ));
        }
        let (info, device) = match self.config.device_id.as_deref() {
            Some(id) => self.provider.device_by_id(id)?,
            None => self.provider.default_input()?,
        };
        let supported = device
            .default_input_config()
            .map_err(classify_stream_error)?;
        validate_supported_config(&supported)?;
        // Keep native metadata for DSP; public chunks are converted to the
        // configured target format after callback collection.
        self.native_format = AudioFormat {
            sample_rate_hz: supported.sample_rate().0,
            // `send_samples` downmixes interleaved callback frames before
            // queueing them, so the handoff contract is already mono.
            channels: 1,
            sample_format: SampleFormat::F32,
        };
        let stream_config: StreamConfig = supported.config();
        tracing::info!(
            device = %info.name,
            native_sample_format = ?supported.sample_format(),
            native_sample_rate = supported.sample_rate().0,
            native_channels = supported.channels(),
            configured_sample_rate = self.config.format.sample_rate_hz,
            configured_channels = self.config.format.channels,
            configured_sample_format = ?self.config.format.sample_format,
            chunk_size_samples = self.config.chunk_size_samples,
            "CPAL input configured"
        );
        let (tx, rx) = mpsc::sync_channel(8);
        let (error_tx, error_rx) = mpsc::sync_channel(1);
        let callback_active = Arc::new(AtomicBool::new(true));
        let channels = stream_config.channels as usize;
        let stream = match supported.sample_format() {
            CpalSampleFormat::F32 => build_stream_f32(
                &device,
                &stream_config,
                tx,
                error_tx,
                channels,
                callback_active.clone(),
                self.config.input_gain_percent,
            )?,
            CpalSampleFormat::I16 => build_stream_i16(
                &device,
                &stream_config,
                tx,
                error_tx,
                channels,
                callback_active.clone(),
                self.config.input_gain_percent,
            )?,
            CpalSampleFormat::U16 => build_stream_u16(
                &device,
                &stream_config,
                tx,
                error_tx,
                channels,
                callback_active.clone(),
                self.config.input_gain_percent,
            )?,
            _ => unreachable!(),
        };
        stream.play().map_err(classify_stream_error)?;
        self.packets = Some(rx);
        self.errors = Some(error_rx);
        self.pending.clear();
        self.stream = Some(stream);
        self.callback_active = Some(callback_active);
        Ok(info)
    }

    pub fn stop(&mut self) {
        if let Some(active) = self.callback_active.take() {
            active.store(false, Ordering::Release);
        }
        if let Some(stream) = self.stream.take() {
            let _ = stream.pause();
            drop(stream);
        }
        // Keep receivers alive after native teardown so queued callback
        // samples are drained before the capture is returned.
    }

    /// Assemble one chunk while also honoring the controller's stop command.
    fn next_chunk_until_stopped(
        &mut self,
        stop: &Receiver<()>,
    ) -> Result<Option<AudioChunk>, AudioError> {
        let packets = match self.packets.as_ref() {
            Some(packets) => packets,
            None => return Ok(None),
        };
        while self.pending.len() < self.config.chunk_size_samples as usize {
            if stop.try_recv().is_ok() {
                // Quiesce the native callback before reading the handoff queue,
                // but do not discard packets that were accepted before stop.
                // The previous early return caused short speech samples to be
                // reported as capture_signal_unavailable.
                self.stop();
                return self.next_chunk();
            }
            if let Some(errors) = &self.errors {
                if let Ok(error) = errors.try_recv() {
                    return Err(error);
                }
            }
            match packets.recv_timeout(std::time::Duration::from_millis(10)) {
                Ok(packet) => self.pending.extend(packet),
                Err(RecvTimeoutError::Timeout) => continue,
                Err(RecvTimeoutError::Disconnected) => {
                    if self.pending.is_empty() {
                        return Ok(None);
                    }
                    let samples = self.pending.drain(..).collect();
                    let chunk = AudioChunk {
                        captured_at: OffsetDateTime::now_utc(),
                        format: self.native_format.clone(),
                        samples,
                    };
                    return self.dsp.process(&chunk).map(Some);
                }
            }
        }
        let samples = self
            .pending
            .drain(..self.config.chunk_size_samples as usize)
            .collect();
        let chunk = AudioChunk {
            captured_at: OffsetDateTime::now_utc(),
            format: self.native_format.clone(),
            samples,
        };
        self.dsp.process(&chunk).map(Some)
    }

    pub fn is_running(&self) -> bool {
        self.stream.is_some()
    }
}

impl Drop for CpalAudioEngine {
    fn drop(&mut self) {
        self.stop();
    }
}

impl AudioEngine for CpalAudioEngine {
    fn input_format(&self) -> AudioFormat {
        self.input_format.clone()
    }

    fn next_chunk(&mut self) -> Result<Option<AudioChunk>, AudioError> {
        let packets = match self.packets.as_ref() {
            Some(packets) => packets,
            None => return Ok(None),
        };
        while self.pending.len() < self.config.chunk_size_samples as usize {
            if let Some(errors) = &self.errors {
                if let Ok(error) = errors.try_recv() {
                    return Err(error);
                }
            }
            match packets.recv_timeout(std::time::Duration::from_millis(100)) {
                Ok(packet) => self.pending.extend(packet),
                Err(RecvTimeoutError::Timeout) => continue,
                Err(RecvTimeoutError::Disconnected) => {
                    if self.pending.is_empty() {
                        return Ok(None);
                    }
                    let samples = self.pending.drain(..).collect();
                    let chunk = AudioChunk {
                        captured_at: OffsetDateTime::now_utc(),
                        format: self.native_format.clone(),
                        samples,
                    };
                    return self.dsp.process(&chunk).map(Some);
                }
            }
        }
        let samples = self
            .pending
            .drain(..self.config.chunk_size_samples as usize)
            .collect();
        let chunk = AudioChunk {
            captured_at: OffsetDateTime::now_utc(),
            format: self.native_format.clone(),
            samples,
        };
        self.dsp.process(&chunk).map(Some)
    }
}

/// Send-owned controller. CPAL's stream stays on its worker thread because
/// CPAL intentionally does not mark streams Send on every backend.
impl Drop for CpalAudioController {
    fn drop(&mut self) {
        self.stop_capture();
    }
}

pub struct CpalAudioController {
    config: CaptureConfig,
    format: AudioFormat,
    commands: Option<mpsc::Sender<()>>,
    chunks: Option<Receiver<Result<AudioChunk, AudioError>>>,
    worker: Option<std::thread::JoinHandle<()>>,
    state: CaptureState,
    next_generation: u64,
    session: Option<CaptureSession>,
    stop_requested: bool,
}

impl CpalAudioController {
    pub fn new(config: CaptureConfig) -> Result<Self, AudioError> {
        config.validate()?;
        Ok(Self {
            format: config.format.clone(),
            config,
            commands: None,
            chunks: None,
            worker: None,
            state: CaptureState::Idle,
            next_generation: 0,
            session: None,
            stop_requested: false,
        })
    }
    pub fn state(&self) -> CaptureState {
        self.state
    }

    pub fn session(&self) -> Option<&CaptureSession> {
        self.session.as_ref()
    }

    /// Cancellation is intentionally equivalent to stop: both are idempotent.
    pub fn cancel_capture(&mut self) {
        self.stop_capture();
    }
}

impl AudioEngine for CpalAudioController {
    fn input_format(&self) -> AudioFormat {
        self.format.clone()
    }

    fn next_chunk(&mut self) -> Result<Option<AudioChunk>, AudioError> {
        let chunks = match self.chunks.as_ref() {
            Some(chunks) => chunks,
            None => return Ok(None),
        };
        let result = match chunks.recv() {
            Ok(Ok(chunk)) => Ok(Some(chunk)),
            Ok(Err(error)) => Err(error),
            Err(_) if self.stop_requested => Ok(None),
            Err(_) => Err(AudioError::Pipeline("audio worker stopped".into())),
        };
        if result.is_err() {
            self.state = CaptureState::Stopping;
            self.commands.take();
            self.chunks.take();
            if let Some(worker) = self.worker.take() {
                let _ = worker.join();
            }
            self.session = None;
            self.state = CaptureState::Idle;
        }
        result
    }
}

impl AudioCaptureEngine for CpalAudioController {
    fn start_capture(&mut self) -> Result<AudioDeviceInfo, AudioError> {
        if self.state != CaptureState::Idle {
            return Err(AudioError::Pipeline("capture is already running".into()));
        }
        self.state = CaptureState::Starting;
        self.stop_requested = false;
        self.next_generation = self.next_generation.wrapping_add(1);
        let generation = self.next_generation;
        let config = self.config.clone();
        let (ready_tx, ready_rx) = mpsc::sync_channel(1);
        let (command_tx, command_rx) = mpsc::channel();
        let (chunk_tx, chunk_rx) = mpsc::channel();
        let worker = std::thread::spawn(move || {
            tracing::debug!(generation, "capture worker started");
            let mut engine = match CpalAudioEngine::new(config) {
                Ok(engine) => engine,
                Err(error) => {
                    tracing::warn!(generation, detail = %error, "capture worker failed to construct engine");
                    let _ = ready_tx.send(Err(error));
                    return;
                }
            };
            let device = match engine.start() {
                Ok(device) => device,
                Err(error) => {
                    tracing::warn!(generation, detail = %error, "capture worker failed to start device");
                    let _ = ready_tx.send(Err(error));
                    return;
                }
            };
            let format = engine.input_format();
            let _ = ready_tx.send(Ok((device, format)));
            let mut emitted_chunks = 0usize;
            let mut emitted_samples = 0usize;
            let mut stopping = false;
            loop {
                if !stopping {
                    match command_rx.try_recv() {
                        Ok(()) | Err(mpsc::TryRecvError::Disconnected) => {
                            engine.stop();
                            stopping = true;
                        }
                        Err(mpsc::TryRecvError::Empty) => {}
                    }
                }
                match if stopping {
                    engine.next_chunk()
                } else {
                    engine.next_chunk_until_stopped(&command_rx)
                } {
                    Ok(Some(chunk)) => {
                        emitted_chunks += 1;
                        emitted_samples += chunk.samples.len();
                        if chunk_tx.send(Ok(chunk)).is_err() {
                            break;
                        }
                    }
                    Ok(None) => break,
                    Err(error) => {
                        tracing::warn!(generation, detail = %error, "capture worker reported device error");
                        let _ = chunk_tx.send(Err(error));
                        break;
                    }
                }
            }
            engine.stop();
            tracing::debug!(
                generation,
                emitted_chunks,
                emitted_samples,
                "capture worker stopped"
            );
        });
        // Bound native startup so a stale Windows endpoint cannot wedge the daemon.
        let (device, format) = match ready_rx.recv_timeout(std::time::Duration::from_secs(5)) {
            Ok(Ok(value)) => value,
            Ok(Err(error)) => {
                self.state = CaptureState::Idle;
                let _ = worker.join();
                return Err(error);
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                // Do not join here: a backend call that is stuck in native code
                // would otherwise transfer the very wedge this deadline avoids
                // into the daemon's caller. The worker observes this command as
                // soon as CPAL returns and tears its stream down.
                let _ = command_tx.send(());
                self.state = CaptureState::Idle;
                return Err(AudioError::BackendUnavailable(
                    "audio device did not become ready within 5 seconds".into(),
                ));
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                self.state = CaptureState::Idle;
                let _ = worker.join();
                return Err(AudioError::DeviceUnavailable(
                    "audio worker failed to become ready".into(),
                ));
            }
        };
        self.commands = Some(command_tx);
        self.chunks = Some(chunk_rx);
        self.worker = Some(worker);
        self.format = format;
        self.session = Some(CaptureSession {
            generation,
            device: device.clone(),
        });
        self.state = CaptureState::Recording;
        Ok(device)
    }

    fn stop_capture(&mut self) {
        if self.state == CaptureState::Idle {
            return;
        }
        self.state = CaptureState::Stopping;
        self.stop_requested = true;
        if let Some(command) = self.commands.take() {
            let _ = command.send(());
        }
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
        self.session = None;
        self.state = CaptureState::Idle;
    }

    fn is_running(&self) -> bool {
        self.state == CaptureState::Recording
    }

    fn readiness(&self) -> Result<(), AudioError> {
        let provider = CpalAudioDeviceProvider::new();
        let (_, device) = match self.config.device_id.as_deref() {
            Some(id) => provider.device_by_id(id)?,
            None => provider.default_input()?,
        };
        let supported = device
            .default_input_config()
            .map_err(classify_stream_error)?;
        validate_supported_config(&supported)
    }
}

fn validate_supported_config(config: &cpal::SupportedStreamConfig) -> Result<(), AudioError> {
    if !matches!(
        config.sample_format(),
        CpalSampleFormat::F32 | CpalSampleFormat::I16 | CpalSampleFormat::U16
    ) {
        return Err(AudioError::BackendUnavailable(format!(
            "unsupported sample format {:?}",
            config.sample_format()
        )));
    }
    if config.channels() == 0 || config.sample_rate().0 == 0 {
        return Err(AudioError::DeviceUnavailable(
            "input device reported an invalid stream format".into(),
        ));
    }
    Ok(())
}

fn classify_stream_error(error: impl ToString) -> AudioError {
    let message = error.to_string();
    let lower = message.to_ascii_lowercase();
    if lower.contains("access is denied") || lower.contains("permission") {
        AudioError::MissingPermission
    } else if lower.contains("disconnect")
        || lower.contains("device not available")
        || lower.contains("device unavailable")
        || lower.contains("device has been removed")
        || (lower.contains("input stream") && lower.contains("lost"))
    {
        AudioError::DeviceUnavailable(message)
    } else {
        AudioError::Pipeline(message)
    }
}

fn build_stream_f32(
    device: &Device,
    config: &StreamConfig,
    tx: SyncSender<Packet>,
    errors: SyncSender<AudioError>,
    channels: usize,
    active: Arc<AtomicBool>,
    gain_percent: u16,
) -> Result<Stream, AudioError> {
    device
        .build_input_stream(
            config,
            move |data: &[f32], _| {
                if active.load(Ordering::Acquire) {
                    send_samples(data, &tx, channels, gain_percent);
                }
            },
            move |error| {
                let _ = errors.try_send(classify_stream_error(error));
            },
            None,
        )
        .map_err(classify_stream_error)
}
fn build_stream_i16(
    device: &Device,
    config: &StreamConfig,
    tx: SyncSender<Packet>,
    errors: SyncSender<AudioError>,
    channels: usize,
    active: Arc<AtomicBool>,
    gain_percent: u16,
) -> Result<Stream, AudioError> {
    device
        .build_input_stream(
            config,
            move |data: &[i16], _| {
                if active.load(Ordering::Acquire) {
                    let converted: Vec<f32> = data.iter().map(|x| *x as f32 / 32768.0).collect();
                    send_samples(&converted, &tx, channels, gain_percent);
                }
            },
            move |error| {
                let _ = errors.try_send(classify_stream_error(error));
            },
            None,
        )
        .map_err(classify_stream_error)
}
fn build_stream_u16(
    device: &Device,
    config: &StreamConfig,
    tx: SyncSender<Packet>,
    errors: SyncSender<AudioError>,
    channels: usize,
    active: Arc<AtomicBool>,
    gain_percent: u16,
) -> Result<Stream, AudioError> {
    device
        .build_input_stream(
            config,
            move |data: &[u16], _| {
                if active.load(Ordering::Acquire) {
                    let converted: Vec<f32> =
                        data.iter().map(|x| (*x as f32 / 32768.0) - 1.0).collect();
                    send_samples(&converted, &tx, channels, gain_percent);
                }
            },
            move |error| {
                let _ = errors.try_send(classify_stream_error(error));
            },
            None,
        )
        .map_err(classify_stream_error)
}
fn send_samples(data: &[f32], tx: &SyncSender<Packet>, channels: usize, gain_percent: u16) {
    if channels == 0 {
        return;
    }
    let gain = f32::from(gain_percent) / 100.0;
    let mono = if channels <= 1 {
        data.iter()
            .map(|sample| sanitize_sample(*sample * gain))
            .collect()
    } else {
        data.chunks(channels)
            .map(|frame| {
                sanitize_sample(frame.iter().copied().sum::<f32>() / channels as f32 * gain)
            })
            .collect()
    };
    let _ = tx.try_send(mono).map_err(|error| match error {
        TrySendError::Full(_) => {
            tracing::warn!("CPAL callback packet queue is full; dropping input packet")
        }
        TrySendError::Disconnected(_) => tracing::debug!("CPAL callback packet queue disconnected"),
    });
}

fn sanitize_sample(sample: f32) -> f32 {
    if sample.is_finite() {
        sample.clamp(-1.0, 1.0)
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn callback_mixes_interleaved_samples_without_hardware() {
        let (tx, rx) = mpsc::sync_channel(1);
        send_samples(&[1.0, -1.0, 0.5, 0.0], &tx, 2, 100);
        assert_eq!(rx.recv().unwrap(), vec![0.0, 0.25]);
    }

    #[test]
    fn callback_applies_bounded_gain_and_sanitizes_samples() {
        let (tx, rx) = mpsc::sync_channel(1);
        send_samples(&[0.4, f32::NAN, 2.0], &tx, 1, 200);
        assert_eq!(rx.recv().unwrap(), vec![0.8, 0.0, 1.0]);
    }

    #[test]
    fn callback_drops_when_consumer_is_slow() {
        let (tx, rx) = mpsc::sync_channel(1);
        send_samples(&[1.0], &tx, 1, 100);
        send_samples(&[2.0], &tx, 1, 100);
        assert_eq!(rx.recv().unwrap(), vec![1.0]);
    }
}

#[cfg(test)]
mod lifecycle_tests {
    use super::*;

    #[test]
    fn controller_starts_idle_and_stop_is_idempotent() {
        let mut controller = CpalAudioController::new(CaptureConfig::default()).unwrap();
        assert_eq!(controller.state(), CaptureState::Idle);
        assert!(controller.session().is_none());
        controller.stop_capture();
        controller.cancel_capture();
        assert_eq!(controller.state(), CaptureState::Idle);
    }

    #[test]
    fn missing_device_returns_truthful_error_and_resets_starting_state() {
        let config = CaptureConfig {
            device_id: Some("__sori_missing_input_device__".into()),
            ..CaptureConfig::default()
        };
        let mut controller = CpalAudioController::new(config).unwrap();
        let error = controller.start_capture().unwrap_err();
        assert!(matches!(error, AudioError::DeviceUnavailable(_)));
        assert_eq!(controller.state(), CaptureState::Idle);
        assert!(controller.session().is_none());
    }

    #[test]
    fn stop_command_interrupts_silent_chunk_assembly() {
        let config = CaptureConfig::default();
        let (packet_tx, packet_rx) = mpsc::sync_channel(1);
        let (error_tx, error_rx) = mpsc::sync_channel(1);
        let (stop_tx, stop_rx) = mpsc::channel();
        stop_tx.send(()).unwrap();
        let mut engine = CpalAudioEngine {
            provider: CpalAudioDeviceProvider::new(),
            input_format: config.format.clone(),
            native_format: config.format.clone(),
            config,
            stream: None,
            packets: Some(packet_rx),
            dsp: sori_core::AudioDsp::new(sori_core::DspPipelineConfig::default()).unwrap(),
            errors: Some(error_rx),
            pending: VecDeque::new(),
            callback_active: None,
        };
        drop(packet_tx);
        drop(error_tx);
        assert!(engine.next_chunk_until_stopped(&stop_rx).unwrap().is_none());
    }

    #[test]
    fn stop_drains_callback_packet_accepted_before_teardown() {
        let config = CaptureConfig::default();
        let (packet_tx, packet_rx) = mpsc::sync_channel(1);
        let (error_tx, error_rx) = mpsc::sync_channel(1);
        let (stop_tx, stop_rx) = mpsc::channel();
        packet_tx.send(vec![0.25; 320]).unwrap();
        drop(packet_tx);
        drop(error_tx);
        stop_tx.send(()).unwrap();
        let mut engine = CpalAudioEngine {
            provider: CpalAudioDeviceProvider::new(),
            input_format: config.format.clone(),
            native_format: config.format.clone(),
            config,
            stream: None,
            packets: Some(packet_rx),
            dsp: sori_core::AudioDsp::new(sori_core::DspPipelineConfig::default()).unwrap(),
            errors: Some(error_rx),
            pending: VecDeque::new(),
            callback_active: None,
        };

        let chunk = engine
            .next_chunk_until_stopped(&stop_rx)
            .unwrap()
            .expect("accepted callback packet must survive stop");
        assert_eq!(chunk.samples.len(), 320);
        assert!(chunk.samples.iter().all(|sample| *sample == 0.25));
    }

    #[test]
    fn native_disconnect_errors_are_not_reported_as_pipeline_success() {
        assert!(matches!(
            classify_stream_error("input device disconnected"),
            AudioError::DeviceUnavailable(_)
        ));
    }
}

#[cfg(test)]
mod controller_regression_tests {
    use super::*;

    #[test]
    fn missing_device_stop_is_explicit_and_controller_can_retry() {
        let config = CaptureConfig {
            device_id: Some("__sori_missing_input_device__".into()),
            ..CaptureConfig::default()
        };
        let mut controller = CpalAudioController::new(config).unwrap();
        let start_error = controller.start_capture().unwrap_err();
        assert!(matches!(start_error, AudioError::DeviceUnavailable(_)));
        controller.stop_capture();
        assert_eq!(controller.state(), CaptureState::Idle);
        assert!(controller.start_capture().is_err());
        assert_eq!(controller.state(), CaptureState::Idle);
    }
}
