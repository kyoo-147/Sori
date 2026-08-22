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

$manifestPath = Join-Path $CorpusDirectory 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  & (Join-Path $PSScriptRoot 'windows-audio-fixture-corpus.ps1') -OutputDirectory $CorpusDirectory
  if ($LASTEXITCODE -ne 0) { throw "SAPI corpus generation failed with exit code $LASTEXITCODE" }
}
# Always verify the corpus before choosing or playing a fixture. The verifier
# rejects changed bytes, missing manifest entries, and non-WAV corpus files.
& (Join-Path $PSScriptRoot 'windows-audio-fixture-corpus-verify.ps1') -CorpusDirectory $CorpusDirectory
if ($LASTEXITCODE -ne 0) { throw "SAPI corpus verification failed with exit code $LASTEXITCODE" }

$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if (-not $PlaybackWav) { $PlaybackWav = Join-Path $CorpusDirectory 'en-greeting--base.wav' }
if (-not (Test-Path -LiteralPath $PlaybackWav -PathType Leaf)) { throw "Playback WAV not found: $PlaybackWav" }
$resolved = (Resolve-Path -LiteralPath $PlaybackWav).Path
$corpusRoot = (Resolve-Path -LiteralPath $CorpusDirectory).Path
$manifestEntry = @($manifest.files | Where-Object { $_.file -eq [IO.Path]::GetFileName($resolved) }) | Select-Object -First 1
$inVerifiedManifest = $false
if ($manifestEntry) {
  $expected = [IO.Path]::GetFullPath((Join-Path $corpusRoot $manifestEntry.file))
  $inVerifiedManifest = $expected -eq $resolved
}
$sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolved).Hash.ToLowerInvariant()
$bytes = [IO.File]::ReadAllBytes($resolved)
if ($bytes.Length -lt 12 -or [Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne 'RIFF' -or [Text.Encoding]::ASCII.GetString($bytes, 8, 4) -ne 'WAVE') {
  throw "Playback file is not a RIFF/WAVE file: $resolved"
}
if ($inVerifiedManifest -and $sha256 -ne $manifestEntry.sha256) { throw "Verified manifest hash mismatch for playback WAV: $resolved" }
$evidenceDirectory = Join-Path (Get-Location) '.tmp/windows-audio-loopback'
New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null
$evidencePath = Join-Path $evidenceDirectory ("playback-" + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ') + '.json')
[ordered]@{
  schema = 'sori.windows-audio-loopback-evidence.v1'
  generated_utc = [DateTime]::UtcNow.ToString('o')
  playback_wav = $resolved
  sha256 = $sha256
  riff_header_hex = (($bytes[0..11] | ForEach-Object { $_.ToString('X2') }) -join '')
  manifest_verified = $true
  manifest_path = (Resolve-Path -LiteralPath $manifestPath).Path
  manifest_entry = if ($manifestEntry) { $manifestEntry } else { $null }
  custom_wav_outside_verified_manifest = (-not $inVerifiedManifest)
  route = 'unknown'
  microphone_claim = $false
} | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -LiteralPath $evidencePath

$env:SORI_NATIVE_AUDIO_HARNESS = '1'
$env:SORI_NATIVE_AUDIO_HARNESS_MS = "$DurationMs"
$env:SORI_NATIVE_AUDIO_PLAYBACK_WAV = $resolved
if ($DeviceId) { $env:SORI_NATIVE_AUDIO_DEVICE_ID = $DeviceId }
if ($Transcribe) { $env:SORI_NATIVE_AUDIO_TRANSCRIBE = '1' }
Write-Output "GATE: verified corpus=$manifestPath"
Write-Output "GATE: raw playback evidence=$evidencePath sha256=$sha256 manifest_member=$inVerifiedManifest"
Write-Output "GATE: starting real CPAL capture and local SAPI WAV playback"
$deviceLabel = if ($DeviceId) { $DeviceId } else { '<default input>' }
Write-Output "GATE: playback=$resolved device=$deviceLabel"
Write-Output 'UNVERIFIED: playback is not loopback proof; verify the selected CPAL input is a Windows loopback/virtual route.'
$args = @('-p','sori-audio','test','--test','native_harness','native_device_capture_reports_signal_and_can_reach_whisper','--','--ignored','--nocapture')
& cargo @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output 'GATE: CPAL capture/restart path completed; inspect peak/RMS and route before any loopback claim.'
