# Verify a local Windows SAPI corpus without network, model, or microphone access.
# This is intentionally strict: a manifest is evidence only when every file,
# hash, expected transcript, and provenance field agrees with the bytes on disk.
[CmdletBinding()]
param(
  [string]$CorpusDirectory = (Join-Path (Get-Location) 'data/audio-corpus')
)
$ErrorActionPreference = 'Stop'

function Fail([string]$Message) { throw "Corpus verification failed: $Message" }
function Read-U16([byte[]]$Bytes, [int]$Offset) { return [BitConverter]::ToUInt16($Bytes, $Offset) }
function Read-U32([byte[]]$Bytes, [int]$Offset) { return [BitConverter]::ToUInt32($Bytes, $Offset) }
function Read-Ascii([byte[]]$Bytes, [int]$Offset, [int]$Length) { return [Text.Encoding]::ASCII.GetString($Bytes, $Offset, $Length) }

$manifestPath = Join-Path $CorpusDirectory 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { Fail "manifest is missing: $manifestPath" }
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if ($manifest.schema -ne 'sori.audio-corpus.v1') { Fail "unsupported schema: $($manifest.schema)" }
if ($manifest.generated_by -ne 'scripts/windows-audio-fixture-corpus.ps1') { Fail 'manifest generator provenance is incorrect' }
if (-not $manifest.voice -or [string]::IsNullOrWhiteSpace($manifest.voice.name) -or [string]::IsNullOrWhiteSpace($manifest.voice.culture)) { Fail 'voice provenance is incomplete' }

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $installed = @($synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name })
  if ($installed -notcontains [string]$manifest.voice.name) { Fail "manifest voice is no longer installed: $($manifest.voice.name)" }
} finally { $synth.Dispose() }

$records = @($manifest.files)
if ($records.Count -eq 0) { Fail 'manifest contains no files' }
$seen = @{}
foreach ($record in $records) {
  if ([string]::IsNullOrWhiteSpace($record.file) -or $record.file -match '[\\/]') { Fail 'manifest contains an unsafe file name' }
  if ($seen.ContainsKey($record.file)) { Fail "duplicate manifest file: $($record.file)" }
  $seen[$record.file] = $true
  $path = Join-Path $CorpusDirectory $record.file
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Fail "fixture is missing: $($record.file)" }
  $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()
  if ($actualHash -ne ([string]$record.sha256).ToLowerInvariant()) { Fail "SHA-256 mismatch for $($record.file)" }
  if ([string]::IsNullOrWhiteSpace($record.expected_transcript) -or [string]::IsNullOrWhiteSpace($record.language) -or [string]::IsNullOrWhiteSpace($record.variant)) { Fail "transcript metadata is incomplete for $($record.file)" }
  if (-not $record.provenance -or $record.provenance.source -ne 'Windows SAPI installed voice' -or $record.provenance.network -ne $false -or $record.provenance.microphone -ne $false) { Fail "provenance is not local-only for $($record.file)" }
  if ($record.provenance.voice.name -ne $manifest.voice.name -or $record.provenance.voice.culture -ne $manifest.voice.culture) { Fail "voice provenance disagrees for $($record.file)" }

  [byte[]]$bytes = [IO.File]::ReadAllBytes($path)
  if ($bytes.Length -lt 44 -or (Read-Ascii $bytes 0 4) -ne 'RIFF' -or (Read-Ascii $bytes 8 4) -ne 'WAVE') { Fail "not a RIFF/WAVE file: $($record.file)" }
  if ((Read-U16 $bytes 20) -ne 1 -or (Read-U16 $bytes 22) -ne 1 -or (Read-U32 $bytes 24) -ne 16000 -or (Read-U16 $bytes 34) -ne 16) { Fail "fixture is not mono PCM16 16 kHz: $($record.file)" }
  $dataAt = -1
  for ($i = 12; $i -le $bytes.Length - 8; $i++) { if ((Read-Ascii $bytes $i 4) -eq 'data') { $dataAt = $i; break } }
  if ($dataAt -lt 0 -or (Read-U32 $bytes ($dataAt + 4)) -lt 2) { Fail "fixture has no PCM data: $($record.file)" }
}

$unexpected = @(Get-ChildItem -LiteralPath $CorpusDirectory -File | Where-Object { $_.Name -ne 'manifest.json' -and -not $seen.ContainsKey($_.Name) })
if ($unexpected.Count -gt 0) { Fail "unlisted files are present: $($unexpected.Name -join ', ')" }
Write-Output "PASS: verified $($records.Count) local SAPI WAV fixtures, hashes, expected text, voice, and provenance."
