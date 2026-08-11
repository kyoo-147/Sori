//! CPAL-backed microphone capture. The callback only performs a non-blocking send;
//! chunking and timestamping happen on the consumer side.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, Host, SampleFormat as CpalSampleFormat, Stream, StreamConfig};
use sori_core::{
    AudioCaptureEngine, AudioChunk, AudioDeviceInfo, AudioDeviceProvider, AudioEngine, AudioError,
    AudioFormat, CaptureConfig, SampleFormat,
};
use std::collections::VecDeque;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, SyncSender, TrySendError};
use time::OffsetDateTime;

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
    stream: Option<Stream>,
    packets: Option<Receiver<Packet>>,
    errors: Option<Receiver<String>>,
    pending: VecDeque<f32>,
}

impl CpalAudioEngine {
    pub fn new(config: CaptureConfig) -> Result<Self, AudioError> {
        config.validate()?;
        Ok(Self {
            provider: CpalAudioDeviceProvider::new(),
            input_format: config.format.clone(),
            config,
            stream: None,
            packets: None,
            errors: None,
            pending: VecDeque::new(),
        })
    }

    pub fn with_provider(
        config: CaptureConfig,
        provider: CpalAudioDeviceProvider,
    ) -> Result<Self, AudioError> {
        config.validate()?;
        Ok(Self {
            input_format: config.format.clone(),
            config,
            provider,
            stream: None,
            packets: None,
            errors: None,
            pending: VecDeque::new(),
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
            .map_err(|error| AudioError::DeviceUnavailable(error.to_string()))?;
        if !matches!(
            supported.sample_format(),
            CpalSampleFormat::F32 | CpalSampleFormat::I16 | CpalSampleFormat::U16
        ) {
            return Err(AudioError::BackendUnavailable(format!(
                "unsupported sample format {:?}",
                supported.sample_format()
            )));
        }
        // The adapter currently exposes its post-callback shape: mono f32. The
        // native rate is retained until a resampler is added.
        self.input_format = AudioFormat {
            sample_rate_hz: supported.sample_rate().0,
            channels: 1,
            sample_format: SampleFormat::F32,
        };
        let stream_config: StreamConfig = supported.config();
        let (tx, rx) = mpsc::sync_channel(8);
        let (error_tx, error_rx) = mpsc::sync_channel(1);
        let channels = stream_config.channels as usize;
        let stream = match supported.sample_format() {
            CpalSampleFormat::F32 => {
                build_stream_f32(&device, &stream_config, tx, error_tx, channels)?
            }
            CpalSampleFormat::I16 => {
                build_stream_i16(&device, &stream_config, tx, error_tx, channels)?
            }
            CpalSampleFormat::U16 => {
                build_stream_u16(&device, &stream_config, tx, error_tx, channels)?
            }
            _ => unreachable!(),
        };
        stream.play().map_err(classify_stream_error)?;
        self.packets = Some(rx);
        self.errors = Some(error_rx);
        self.pending.clear();
        self.stream = Some(stream);
        Ok(info)
    }

    pub fn stop(&mut self) {
        self.stream.take();
        self.packets.take();
        self.errors.take();
        self.pending.clear();
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
                    return Err(AudioError::Pipeline(error));
                }
            }
            match packets.recv_timeout(std::time::Duration::from_millis(100)) {
                Ok(packet) => self.pending.extend(packet),
                Err(RecvTimeoutError::Timeout) => continue,
                Err(RecvTimeoutError::Disconnected) => return Ok(None),
            }
        }
        let samples = self
            .pending
            .drain(..self.config.chunk_size_samples as usize)
            .collect();
        Ok(Some(AudioChunk {
            captured_at: OffsetDateTime::now_utc(),
            format: self.input_format(),
            samples,
        }))
    }
}

/// Send-owned controller. CPAL's stream stays on its worker thread because
/// CPAL intentionally does not mark streams Send on every backend.
pub struct CpalAudioController {
    config: CaptureConfig,
    format: AudioFormat,
    commands: Option<mpsc::Sender<()>>,
    chunks: Option<Receiver<Result<AudioChunk, AudioError>>>,
    worker: Option<std::thread::JoinHandle<()>>,
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
        })
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
        chunks
            .recv()
            .map(|chunk| chunk.map(Some))
            .map_err(|_| AudioError::Pipeline("audio worker stopped".into()))?
    }
}

impl AudioCaptureEngine for CpalAudioController {
    fn start_capture(&mut self) -> Result<AudioDeviceInfo, AudioError> {
        if self.worker.is_some() {
            return Err(AudioError::Pipeline("capture is already running".into()));
        }
        let config = self.config.clone();
        let (ready_tx, ready_rx) = mpsc::sync_channel(1);
        let (command_tx, command_rx) = mpsc::channel();
        let (chunk_tx, chunk_rx) = mpsc::sync_channel(8);
        let worker = std::thread::spawn(move || {
            let mut engine = match CpalAudioEngine::new(config) {
                Ok(engine) => engine,
                Err(error) => {
                    let _ = ready_tx.send(Err(error));
                    return;
                }
            };
            let device = match engine.start() {
                Ok(device) => device,
                Err(error) => {
                    let _ = ready_tx.send(Err(error));
                    return;
                }
            };
            let format = engine.input_format();
            let _ = ready_tx.send(Ok((device, format)));
            loop {
                if command_rx.try_recv().is_ok() {
                    break;
                }
                match engine.next_chunk() {
                    Ok(Some(chunk)) => {
                        if chunk_tx.send(Ok(chunk)).is_err() {
                            break;
                        }
                    }
                    Ok(None) => break,
                    Err(error) => {
                        let _ = chunk_tx.send(Err(error));
                        break;
                    }
                }
            }
            engine.stop();
        });
        let (device, format) = ready_rx
            .recv()
            .map_err(|_| AudioError::Pipeline("audio worker failed to start".into()))??;
        self.commands = Some(command_tx);
        self.chunks = Some(chunk_rx);
        self.worker = Some(worker);
        self.format = format;
        Ok(device)
    }

    fn stop_capture(&mut self) {
        if let Some(command) = self.commands.take() {
            let _ = command.send(());
        }
        self.chunks.take();
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }

    fn is_running(&self) -> bool {
        self.worker.is_some()
    }
}

fn classify_stream_error(error: impl ToString) -> AudioError {
    let message = error.to_string();
    let lower = message.to_ascii_lowercase();
    if lower.contains("access is denied") || lower.contains("permission") {
        AudioError::MissingPermission
    } else {
        AudioError::Pipeline(message)
    }
}

fn build_stream_f32(
    device: &Device,
    config: &StreamConfig,
    tx: SyncSender<Packet>,
    errors: SyncSender<String>,
    channels: usize,
) -> Result<Stream, AudioError> {
    device
        .build_input_stream(
            config,
            move |data: &[f32], _| send_samples(data, &tx, channels),
            move |error| {
                let _ = errors.try_send(error.to_string());
            },
            None,
        )
        .map_err(classify_stream_error)
}
fn build_stream_i16(
    device: &Device,
    config: &StreamConfig,
    tx: SyncSender<Packet>,
    errors: SyncSender<String>,
    channels: usize,
) -> Result<Stream, AudioError> {
    device
        .build_input_stream(
            config,
            move |data: &[i16], _| {
                send_samples(
                    &data.iter().map(|x| *x as f32 / 32768.0).collect::<Vec<_>>(),
                    &tx,
                    channels,
                )
            },
            move |error| {
                let _ = errors.try_send(error.to_string());
            },
            None,
        )
        .map_err(classify_stream_error)
}
fn build_stream_u16(
    device: &Device,
    config: &StreamConfig,
    tx: SyncSender<Packet>,
    errors: SyncSender<String>,
    channels: usize,
) -> Result<Stream, AudioError> {
    device
        .build_input_stream(
            config,
            move |data: &[u16], _| {
                send_samples(
                    &data
                        .iter()
                        .map(|x| (*x as f32 / 32768.0) - 1.0)
                        .collect::<Vec<_>>(),
                    &tx,
                    channels,
                )
            },
            move |error| {
                let _ = errors.try_send(error.to_string());
            },
            None,
        )
        .map_err(classify_stream_error)
}
fn send_samples(data: &[f32], tx: &SyncSender<Packet>, channels: usize) {
    let mono = if channels <= 1 {
        data.to_vec()
    } else {
        data.chunks(channels)
            .map(|frame| frame.iter().copied().sum::<f32>() / channels as f32)
            .collect()
    };
    let _ = tx.try_send(mono).map_err(|error| match error {
        TrySendError::Full(_) | TrySendError::Disconnected(_) => {}
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn callback_mixes_interleaved_samples_without_hardware() {
        let (tx, rx) = mpsc::sync_channel(1);
        send_samples(&[1.0, -1.0, 0.5, 0.0], &tx, 2);
        assert_eq!(rx.recv().unwrap(), vec![0.0, 0.25]);
    }

    #[test]
    fn callback_drops_when_consumer_is_slow() {
        let (tx, rx) = mpsc::sync_channel(1);
        send_samples(&[1.0], &tx, 1);
        send_samples(&[2.0], &tx, 1);
        assert_eq!(rx.recv().unwrap(), vec![1.0]);
    }
}
