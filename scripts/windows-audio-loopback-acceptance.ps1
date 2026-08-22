# Opt-in Windows playback -> CPAL input acceptance gate.
# This never claims that speaker playback reached the selected CPAL input.
[CmdletBinding()]
param(
  [string]$CorpusDirectory = (Join-Path (Get-Location) 'data/audio-corpus'),
  [string]$PlaybackWav,
  [string]$DeviceId,
  [int]$DurationMs = 3000,
  [switch]$Transcribe
)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows -and $env:OS -ne 'Windows_NT') { throw 'This gate requires Windows.' }
if (-not $PlaybackWav) {
  if (-not (Test-Path (Join-Path $CorpusDirectory 'manifest.json'))) {
    & (Join-Path $PSScriptRoot 'windows-audio-fixture-corpus.ps1') -OutputDirectory $CorpusDirectory
  }
  $PlaybackWav = Join-Path $CorpusDirectory 'en-greeting--base.wav'
}
if (-not (Test-Path -LiteralPath $PlaybackWav -PathType Leaf)) { throw "Playback WAV not found: $PlaybackWav" }
$resolved = (Resolve-Path -LiteralPath $PlaybackWav).Path
$env:SORI_NATIVE_AUDIO_HARNESS = '1'
$env:SORI_NATIVE_AUDIO_HARNESS_MS = "$DurationMs"
$env:SORI_NATIVE_AUDIO_PLAYBACK_WAV = $resolved
if ($DeviceId) { $env:SORI_NATIVE_AUDIO_DEVICE_ID = $DeviceId }
if ($Transcribe) { $env:SORI_NATIVE_AUDIO_TRANSCRIBE = '1' }
Write-Output "GATE: starting real CPAL capture and local SAPI WAV playback"
$deviceLabel = if ($DeviceId) { $DeviceId } else { '<default input>' }
Write-Output "GATE: playback=$resolved device=$deviceLabel"
Write-Output 'UNVERIFIED: playback is not loopback proof; verify the selected CPAL input is a Windows loopback/virtual route.'
$args = @('-p','sori-audio','test','--test','native_harness','native_device_capture_reports_signal_and_can_reach_whisper','--','--ignored','--nocapture')
& cargo @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output 'GATE: CPAL capture/restart path completed; inspect peak/RMS and route before any loopback claim.'
