[CmdletBinding()]
param(
  [string]$SoriCli = 'sori.exe',
  [string]$CorpusDirectory = (Join-Path (Get-Location) 'data/audio-corpus'),
  [string]$ArtifactPath = '.tmp/windows-wave4-whisper-probe.json',
  [int]$Iterations = 3
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Wave 4 is a probe, not an installer. It only inspects already-owned local
# assets and, when every prerequisite is present, delegates inference to the
# canonical `sori benchmark` command. It never downloads, copies, or records
# user paths, model bytes, transcripts, or raw command output.
function Test-File([string]$Path) { return -not [string]::IsNullOrWhiteSpace($Path) -and (Test-Path -LiteralPath $Path -PathType Leaf) }
function Test-Directory([string]$Path) { return -not [string]::IsNullOrWhiteSpace($Path) -and (Test-Path -LiteralPath $Path -PathType Container) }
function Safe-Name([string]$Path) { if ([string]::IsNullOrWhiteSpace($Path)) { return $null }; return [IO.Path]::GetFileName($Path) }
function Check([string]$Name, [bool]$Ok, [string]$Detail, [string]$Remediation) { return [ordered]@{ name = $Name; ok = $Ok; detail = $Detail; remediation = $Remediation } }
function Read-Config([string]$Path) {
  if (-not (Test-File $Path)) { return $null }
  try { return (Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json) } catch { return $null }
}
function Invoke-Benchmark([string]$Cli, [string]$Model, [string]$Audio, [string]$Reference) {
  $output = & $Cli benchmark --model $Model --audio $Audio --reference $Reference --iterations $Iterations 2>$null | Out-String
  if ($LASTEXITCODE -ne 0) { return [ordered]@{ status = 'FAILED'; detail = 'canonical benchmark command failed; no benchmark evidence was recorded'; fixture = Safe-Name $Audio } }
  $line = ($output -split "`r?`n" | Where-Object { $_ -match '^model=' } | Select-Object -Last 1)
  if (-not $line) { return [ordered]@{ status = 'FAILED'; detail = 'canonical benchmark returned no parseable metrics'; fixture = Safe-Name $Audio } }
  $fields = @{}
  foreach ($pair in ($line -split ' ')) { if ($pair -match '^([^=]+)=(.*)$') { $fields[$Matches[1]] = $Matches[2] } }
  $wer = if ($fields.ContainsKey('wer')) { $fields.wer } else { 'UNVERIFIED' }
  $cer = if ($fields.ContainsKey('cer')) { $fields.cer } else { 'UNVERIFIED' }
  return [ordered]@{ status = 'VERIFIED_REAL_PROVIDER_BENCHMARK'; fixture = Safe-Name $Audio; model = Safe-Name $Model; provider = $fields['provider']; cold_ms = $fields['cold_ms']; warm_ms = $fields['warm_ms']; p50_ms = $fields['p50_ms']; p95_ms = $fields['p95_ms']; rtf = $fields['rtf']; wer = $wer; cer = $cer; ram_bytes = $fields['ram_bytes'] }
}

$artifact = [ordered]@{
  schema = 'sori.wave4.whisper-probe.v1'; status = 'BLOCKED'; started_at = (Get-Date).ToUniversalTime().ToString('o'); completed_at = $null
  network = $false; private_paths_recorded = $false; inference = @(); checks = @(); prerequisites = @(
    'Install or configure a user-owned whisper.cpp whisper-cli.exe/main.exe (SORI_WHISPER_CPP_BIN, Sori whisper.json, or PATH).',
    'Place a non-empty *.bin whisper.cpp model in the configured model directory (SORI_WHISPER_MODEL_DIR, Sori whisper.json, or %LOCALAPPDATA%\\Sori\\whisper\\models).',
    'Generate and verify the local SAPI corpus with scripts/windows-audio-fixture-corpus.ps1.',
    'Start the Sori daemon, then rerun this probe so `sori benchmark` can use canonical IPC.'
  )
}
try {
  $configPath = if ($env:SORI_WHISPER_CONFIG) { $env:SORI_WHISPER_CONFIG } elseif ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Sori/whisper.json' } else { $null }
  $config = Read-Config $configPath
  $configuredExe = if ($env:SORI_WHISPER_CPP_BIN) { $env:SORI_WHISPER_CPP_BIN } elseif ($env:WHISPER_CPP_BIN) { $env:WHISPER_CPP_BIN } elseif ($config) { [string]$config.executable } else { $null }
  $exe = $null
  if (Test-File $configuredExe) { $exe = $configuredExe }
  if (-not $exe) { foreach ($name in @('whisper-cli.exe', 'main.exe')) { try { $command = Get-Command $name -ErrorAction Stop; if (Test-File $command.Source) { $exe = $command.Source; break } } catch { } } }
  $exeDetail = if ($exe) { "found user-owned whisper.cpp executable ($([IO.Path]::GetFileName($exe)))" } else { 'no user-owned whisper.cpp executable found in configured paths or PATH' }
  $artifact.checks += Check 'whisper_cpp_executable' ([bool]$exe) $exeDetail 'Set SORI_WHISPER_CPP_BIN to an existing whisper-cli.exe, configure Sori whisper.json, or add whisper-cli.exe/main.exe to PATH.'

  $modelDir = if ($env:SORI_WHISPER_MODEL_DIR) { $env:SORI_WHISPER_MODEL_DIR } elseif ($env:WHISPER_CPP_MODEL_DIR) { $env:WHISPER_CPP_MODEL_DIR } elseif ($config) { [string]$config.model_dir } elseif ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Sori/whisper/models' } else { $null }
  $models = @()
  if (Test-Directory $modelDir) { $models = @(Get-ChildItem -LiteralPath $modelDir -File -Filter '*.bin' | Where-Object { $_.Length -gt 0 }) }
  $modelDetail = if ($models.Count -gt 0) { "found $($models.Count) non-empty user-owned whisper.cpp model file(s)" } elseif ($modelDir) { 'model directory is absent or contains no non-empty *.bin model' } else { 'no model directory is configured' }
  $artifact.checks += Check 'whisper_cpp_model' ($models.Count -gt 0) $modelDetail 'Set SORI_WHISPER_MODEL_DIR to a directory containing a non-empty whisper.cpp *.bin model; do not download through this probe.'

  $manifestPath = Join-Path $CorpusDirectory 'manifest.json'
  $corpusOk = Test-File $manifestPath
  $records = @()
  if ($corpusOk) {
    try {
      $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
      $records = @($manifest.files)
      $corpusOk = $manifest.schema -eq 'sori.audio-corpus.v1' -and $records.Count -gt 0
      if ($corpusOk) {
        & (Join-Path $PSScriptRoot 'windows-audio-fixture-corpus-verify.ps1') -CorpusDirectory $CorpusDirectory *> $null
        $corpusOk = $true
      }
    } catch { $corpusOk = $false }
  }
  $corpusDetail = if ($corpusOk) { "found verified-looking SAPI corpus with $($records.Count) fixture(s)" } else { 'SAPI corpus manifest is missing or invalid' }
  $artifact.checks += Check 'sapi_corpus' $corpusOk $corpusDetail 'Run scripts/windows-audio-fixture-corpus.ps1, then scripts/windows-audio-fixture-corpus-verify.ps1; keep generated WAVs outside Git.'

  $cli = $null
  try { $cli = (Get-Command $SoriCli -ErrorAction Stop).Source } catch { }
  $cliDetail = if ($cli) { 'sori CLI is available for canonical benchmark requests' } else { 'sori CLI was not found' }
  $artifact.checks += Check 'canonical_sori_cli' ([bool]$cli) $cliDetail 'Build the workspace or pass -SoriCli with the built sori.exe; do not substitute a fake provider.'
  $daemonOk = $false
  if ($cli) { & $cli status *> $null; $daemonOk = $LASTEXITCODE -eq 0 }
  $daemonDetail = if ($daemonOk) { 'sori status reached the daemon IPC endpoint' } else { 'sori status could not reach the daemon' }
  $artifact.checks += Check 'daemon_ipc' $daemonOk $daemonDetail 'Start sorid (or the installed Sori desktop) and rerun this probe.'
  $modelReady = $false
  if ($cli -and $daemonOk -and $models.Count -gt 0) {
    try {
      $modelsJson = & $cli --json models 2>$null | Out-String
      if ($LASTEXITCODE -eq 0) {
        $modelsResponse = $modelsJson | ConvertFrom-Json
        $modelRecords = @($modelsResponse.Models.models)
        $selected = @($modelRecords | Where-Object { [string]$_.manifest.id -eq [string]$models[0].Name } | Select-Object -First 1)
        $modelReady = $modelsResponse.Models.provider -eq 'whisper.cpp' -and $selected.Count -eq 1 -and $selected[0].status.installed -eq $true -and $selected[0].status.phase -eq 'Ready' -and [string]::IsNullOrWhiteSpace([string]$selected[0].status.error)
      }
    } catch { $modelReady = $false }
  }
  $modelReadyDetail = if ($modelReady) { 'daemon reports the selected model installed and Ready through provider whisper.cpp' } else { 'daemon did not report the selected model installed and Ready through provider whisper.cpp' }
  $artifact.checks += Check 'daemon_model_ready' $modelReady $modelReadyDetail 'Start the daemon with the selected user-owned model configured and verify `sori models` reports provider whisper.cpp, installed=true, and phase=Ready.'

  if ($exe -and $models.Count -gt 0 -and $corpusOk -and $cli -and $daemonOk -and $modelReady) {
    foreach ($record in $records) {
      $audio = Join-Path $CorpusDirectory ([string]$record.file)
      if (-not (Test-File $audio)) { $artifact.inference += [ordered]@{ status = 'BLOCKED'; fixture = Safe-Name $audio; detail = 'manifest fixture file is missing' }; continue }
      $artifact.inference += Invoke-Benchmark $cli $models[0].Name $audio ([string]$record.expected_transcript)
    }
    if (@($artifact.inference | Where-Object { $_.status -eq 'VERIFIED_REAL_PROVIDER_BENCHMARK' }).Count -eq $records.Count) { $artifact.status = 'VERIFIED_REAL_SAPI_CORPUS_BENCHMARK' } else { $artifact.status = 'PARTIAL_REAL_BENCHMARK'
    }
  } else { $artifact.status = 'BLOCKED_PREREQUISITES' }
} catch { $artifact.status = 'BLOCKED_PROBE_ERROR'; $artifact.error = 'probe failed without recording private exception details' }
finally { $artifact.completed_at = (Get-Date).ToUniversalTime().ToString('o'); $dir = Split-Path -Parent $ArtifactPath; if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }; $artifact | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $ArtifactPath -Encoding UTF8 }
$artifact | ConvertTo-Json -Depth 12
if ($artifact.status -eq 'BLOCKED_PROBE_ERROR') { exit 2 }
if ($artifact.status -ne 'VERIFIED_REAL_SAPI_CORPUS_BENCHMARK') { exit 3 }
