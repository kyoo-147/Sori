# Wave 6 installed Windows real-Whisper synthetic vertical.
# This is fail-closed: SAPI playback is not physical microphone proof.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string]$InstalledDesktopExecutable,
  [Parameter(Mandatory = $true)] [string]$CorpusDirectory,
  [string]$DaemonExecutable = '',
  [string]$ModelPath = (Join-Path $env:LOCALAPPDATA 'Sori\whisper\models\ggml-base.en.bin'),
  [string]$WhisperExecutable = (Join-Path $env:LOCALAPPDATA 'Sori\whisper\whisper-cli.exe'),
  [string]$BenchmarkCli = (Join-Path (Get-Location) 'target\release\sori.exe'),
  [string]$FreshPackagedDaemon = (Join-Path (Get-Location) 'target\debug\sorid.exe'),
  [string]$DataRoot = (Join-Path (Get-Location) '.tmp\wave6r-installed-real-e2e'),
  [int]$IpcPort = 18476,
  [string]$ArtifactPath = '.tmp/wave8-installed-real-e2e/report.md'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Wave 6 requires Windows.' }
function Test-AbsoluteWindowsPath([string]$Path) { return $Path -match '^[A-Za-z]:[\\/]' }

function Fail([string]$Message) { throw "Wave 6 failed: $Message" }
function Require-AbsoluteFile([string]$Path, [string]$Name) {
  if (-not (Test-AbsoluteWindowsPath $Path) -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) { Fail "$Name must be an existing absolute file: $Path" }
  return (Resolve-Path -LiteralPath $Path).Path
}
function Get-FileEvidence([string]$Path) {
  $item = Get-Item -LiteralPath $Path
  return [ordered]@{ path = $item.FullName; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToUpperInvariant(); length = [int64]$item.Length; last_write_utc = $item.LastWriteTimeUtc.ToString('o'); file_version = [string]$item.VersionInfo.FileVersion }
}
function Invoke-Ipc([string]$Url, [object]$Body, [int]$Timeout = 10) {
  return Invoke-RestMethod -Uri $Url -Method Post -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 20 -Compress) -TimeoutSec $Timeout
}
function Wait-Endpoint([int]$Port) {
  for ($i = 0; $i -lt 120; $i++) { if (@(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) { return }; Start-Sleep -Milliseconds 250 }
  Fail "owned daemon did not listen on 127.0.0.1:$Port"
}
function Read-Track([string]$LeasePath, [string]$DaemonPath, [int]$Port, [DateTime]$NotBefore) {
  if (-not (Test-Path -LiteralPath $LeasePath -PathType Leaf)) { Fail "isolated daemon lease is absent: $LeasePath" }
  $leaseText = Get-Content -Raw -LiteralPath $LeasePath; $lease = $leaseText | ConvertFrom-Json
  if ($lease.endpoint -ne "127.0.0.1:$Port" -or [string]::IsNullOrWhiteSpace([string]$lease.lease_id)) { Fail 'daemon lease endpoint or generation is invalid' }
  $expected = (Resolve-Path -LiteralPath $DaemonPath).Path
  if (-not [String]::Equals((Resolve-Path -LiteralPath $lease.executable).Path, $expected, [StringComparison]::OrdinalIgnoreCase)) { Fail 'daemon lease executable does not match requested bundled daemon' }
  $listener = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  if ($listener.Count -ne 1 -or [int]$listener[0].OwningProcess -ne [int]$lease.pid) { Fail 'daemon lease does not own the isolated listener' }
  $process = Get-Process -Id ([int]$lease.pid) -ErrorAction Stop
  if (-not [String]::Equals((Resolve-Path -LiteralPath $process.Path).Path, $expected, [StringComparison]::OrdinalIgnoreCase)) { Fail 'live daemon executable mismatch' }
  try { $start = $process.StartTime.ToUniversalTime() } catch { Fail 'daemon creation time unavailable' }
  if ($start -lt $NotBefore -or [uint64]$lease.process_start_time -ne [uint64]$start.ToFileTimeUtc()) { Fail 'daemon creation time does not match the lease' }
  return [ordered]@{ pid = [int]$lease.pid; port = $Port; start_time = $start; lease_id = [string]$lease.lease_id; executable = $expected; lease_path = $LeasePath }
}
function Stop-Tracked([object]$Track) {
  if (-not $Track) { return }
  $leaseText = Get-Content -Raw -LiteralPath $Track.lease_path -ErrorAction SilentlyContinue
  if (-not $leaseText) { return }
  $lease = $leaseText | ConvertFrom-Json
  if ([string]$lease.lease_id -ne $Track.lease_id) { Fail 'refusing cleanup: lease generation changed' }
  $process = Get-Process -Id $Track.pid -ErrorAction SilentlyContinue
  if (-not $process) { return }
  if (-not [String]::Equals((Resolve-Path -LiteralPath $process.Path).Path, $Track.executable, [StringComparison]::OrdinalIgnoreCase)) { Fail 'refusing cleanup: executable changed' }
  try { if ($process.StartTime.ToUniversalTime() -ne $Track.start_time) { Fail 'refusing cleanup: creation time changed' } } catch { Fail 'refusing cleanup: creation time unavailable' }
  $listener = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Track.port -State Listen -ErrorAction SilentlyContinue)
  if ($listener.Count -ne 1 -or [int]$listener[0].OwningProcess -ne $Track.pid) { Fail 'refusing cleanup: daemon no longer owns the tracked endpoint' }
  Stop-Process -Id $process.Id -Force
}
function Stop-TrackedProcess([object]$Track) {
  if (-not $Track) { return }
  $process = Get-Process -Id $Track.pid -ErrorAction SilentlyContinue
  if (-not $process) { return }
  if (-not [String]::Equals((Resolve-Path -LiteralPath $process.Path).Path, $Track.executable, [StringComparison]::OrdinalIgnoreCase)) { Fail 'refusing desktop cleanup: executable changed' }
  try { if ($process.StartTime.ToUniversalTime() -ne $Track.start_time) { Fail 'refusing desktop cleanup: creation time changed' } } catch { Fail 'refusing desktop cleanup: creation time unavailable' }
  Stop-Process -Id $process.Id -Force
}
function Write-Report([hashtable]$Evidence, [string]$Path) {
  $dir = Split-Path -Parent $Path; $root = [IO.Path]::GetPathRoot((Resolve-Path -LiteralPath (Get-Location)).Path); if ($dir -and $dir -ne $root) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $lines = @('# Wave 6 installed real Whisper synthetic vertical', '', "- status: **$($Evidence.status)**", "- reason: $($Evidence.reason)", "- source_commit: ``$($Evidence.source_commit)``", "- endpoint: ``127.0.0.1:$($Evidence.port)``", "- isolated_data_root: ``$($Evidence.data)``", "- isolated_owner_path: ``$($Evidence.owner)``", "- desktop: ``$($Evidence.desktop)``", "- daemon: ``$($Evidence.daemon)``", "- installed_daemon_sha256: ``$($Evidence.daemon_installed.sha256)``", "- packaged_daemon_sha256: ``$($Evidence.daemon_packaged.sha256)``", "- whisper_cpp: ``$($Evidence.whisper)``", "- model: ``$($Evidence.model)``", "- model_sha256: ``$($Evidence.model_hash)``", "- fixture: ``$($Evidence.fixture)``", "- fixture_sha256: ``$($Evidence.fixture_hash)``", "- expected_reference: ``$($Evidence.expected_reference)``", "- actual_transcript: ``$($Evidence.transcript)``", '', '## Truth boundary', '', '- Real Whisper is VERIFIED only when the actual transcript is nonblank, the canonical benchmark records measured WER/CER, and owned readback/history/restart preserve that actual transcript exactly.', '- SAPI provenance is local installed-voice output (`network=false`, `microphone=false`). It is not physical microphone proof.', '- No ASR quality pass threshold is asserted without an authoritative threshold.', '- Physical microphone and physical hotkey remain USER_ONLY/UNVERIFIED.', '- Frontend visual refresh is NOT CLAIMED; this acceptance observes canonical IPC only.', '', '```json', ($Evidence | ConvertTo-Json -Depth 12), '```')
  Set-Content -LiteralPath $Path -Value ($lines -join "`r`n") -Encoding UTF8
}

$evidence = @{ status = 'BLOCKED'; reason = 'not run'; primary_error = $null; cleanup_errors = @(); started_utc = [DateTime]::UtcNow.ToString('o'); source_commit = $null; port = $IpcPort; data = $DataRoot; owner = $null; desktop = $null; daemon = $null; daemon_installed = @{ sha256 = 'UNAVAILABLE' }; daemon_packaged = @{ sha256 = 'UNAVAILABLE' }; whisper = $null; benchmark_cli = $null; model = $null; model_hash = $null; fixture = $null; fixture_hash = $null; expected_reference = $null; transcript = $null; readback = $null; history = $null; benchmark = $null; restart_history = $null }
$desktop = $null; $restartDesktop = $null; $restartDesktopTrack = $null; $restartTrack = $null; $cleanupErrors = [Collections.Generic.List[string]]::new()
$old = @{}; foreach ($name in @('SORI_IPC_ADDR','SORI_IPC_URL','SORI_DATABASE_PATH','SORI_DB_PATH','SORI_DAEMON_PATH','SORI_DAEMON_OWNER_PATH','SORI_WHISPER_CPP_BIN','SORI_WHISPER_MODEL_DIR','SORI_WHISPER_MODEL','SORI_TEST_PROVIDER','SORI_TEST_PROVIDER_TEXT','SORI_TEST_NO_OS_INJECTION')) { $old[$name] = [Environment]::GetEnvironmentVariable($name) }
try {
  $evidence.source_commit = (& git rev-parse HEAD 2>$null | Out-String).Trim()
  $desktopPath = Require-AbsoluteFile $InstalledDesktopExecutable 'installed desktop'
  $packagedDaemonPath = Require-AbsoluteFile $FreshPackagedDaemon 'fresh packaged daemon payload'
  $daemonPath = if ($DaemonExecutable) { Require-AbsoluteFile $DaemonExecutable 'bundled daemon' } else { Require-AbsoluteFile (Join-Path (Split-Path -Parent $desktopPath) 'sorid.exe') 'bundled daemon' }
  $installedDaemonEvidence = Get-FileEvidence $daemonPath; $packagedDaemonEvidence = Get-FileEvidence $packagedDaemonPath; $evidence.daemon = $daemonPath; $evidence.daemon_installed = $installedDaemonEvidence; $evidence.daemon_packaged = $packagedDaemonEvidence
  if ($installedDaemonEvidence.sha256 -ne $packagedDaemonEvidence.sha256 -or $installedDaemonEvidence.length -ne $packagedDaemonEvidence.length) { Fail "installed daemon is stale/wrong bundle: installed=$($installedDaemonEvidence.sha256)/$($installedDaemonEvidence.length); packaged=$($packagedDaemonEvidence.sha256)/$($packagedDaemonEvidence.length)" }
  if ([IO.Path]::GetExtension($daemonPath) -ne '.exe') { Fail 'bundled daemon override must be a Windows executable' }
  $whisperPath = Require-AbsoluteFile $WhisperExecutable 'user-owned whisper.cpp executable'
  $benchmarkCliPath = Require-AbsoluteFile $BenchmarkCli 'latest built benchmark CLI'
  $modelPath = Require-AbsoluteFile $ModelPath 'user-owned Whisper model'
  if ([IO.Path]::GetFileName($modelPath) -cne 'ggml-base.en.bin') { Fail 'Wave 6 requires ggml-base.en.bin' }
  $corpusPath = (Resolve-Path -LiteralPath $CorpusDirectory -ErrorAction Stop).Path
  $manifestPath = Require-AbsoluteFile (Join-Path $corpusPath 'manifest.json') 'SAPI corpus manifest'
  & (Join-Path $PSScriptRoot 'windows-audio-fixture-corpus-verify.ps1') -CorpusDirectory $corpusPath | Out-Null
  $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  $record = @($manifest.files | Where-Object { $_.file -eq 'en-greeting--base.wav' } | Select-Object -First 1)
  if ($record.Count -ne 1) { Fail 'verified SAPI manifest lacks en-greeting--base.wav' }
  $fixturePath = Require-AbsoluteFile (Join-Path $corpusPath $record[0].file) 'verified SAPI fixture'
  $fixtureHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $fixturePath).Hash.ToLowerInvariant()
  if ($fixtureHash -ne ([string]$record[0].sha256).ToLowerInvariant()) { Fail 'SAPI fixture hash disagrees with manifest' }
  $expectedText = [string]$record[0].expected_transcript
  $modelHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $modelPath).Hash.ToLowerInvariant()
  New-Item -ItemType Directory -Force -Path $DataRoot | Out-Null; $dataPath = (Resolve-Path -LiteralPath $DataRoot).Path
  $ownerPath = Join-Path $dataPath 'daemon-owner.json'
  $evidence.desktop = $desktopPath; $evidence.daemon = $daemonPath; $evidence.daemon_installed = $installedDaemonEvidence; $evidence.daemon_packaged = $packagedDaemonEvidence; $evidence.whisper = $whisperPath; $evidence.benchmark_cli = $benchmarkCliPath; $evidence.model = $modelPath; $evidence.model_hash = $modelHash; $evidence.fixture = $fixturePath; $evidence.fixture_hash = $fixtureHash; $evidence.expected_reference = $expectedText; $evidence.data = $dataPath; $evidence.owner = $ownerPath
  if (@(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $IpcPort -State Listen -ErrorAction SilentlyContinue)) { Fail "endpoint is already occupied: 127.0.0.1:$IpcPort" }
  $env:SORI_IPC_ADDR = "127.0.0.1:$IpcPort"; $env:SORI_IPC_URL = "http://127.0.0.1:$IpcPort/ipc"; $env:SORI_DATABASE_PATH = Join-Path $dataPath 'sori.db'; $env:SORI_DB_PATH = $env:SORI_DATABASE_PATH; $env:SORI_DAEMON_PATH = $daemonPath; $env:SORI_DAEMON_OWNER_PATH = $ownerPath; $env:SORI_WHISPER_CPP_BIN = $whisperPath; $env:SORI_WHISPER_MODEL_DIR = Split-Path -Parent $modelPath; $env:SORI_WHISPER_MODEL = [IO.Path]::GetFileName($modelPath)
  Remove-Item Env:SORI_TEST_PROVIDER,Env:SORI_TEST_PROVIDER_TEXT,Env:SORI_TEST_NO_OS_INJECTION -ErrorAction SilentlyContinue
  $nativeArtifact = Join-Path $dataPath 'native-voice.json'; $nativeArgs = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'windows-native-voice-acceptance.ps1'),'-SoriExecutable',$desktopPath,'-DaemonExecutable',$daemonPath,'-TargetExecutable',(Join-Path $env:WINDIR 'System32\notepad.exe'),'-TargetKind','win32-edit','-WavPath',$fixturePath,'-Model','ggml-base.en.bin','-ExpectedReference',$expectedText,'-DataRoot',$dataPath,'-IpcPort',([string]$IpcPort),'-ArtifactPath',$nativeArtifact)
  & powershell.exe @nativeArgs; if ($LASTEXITCODE -ne 0) { Fail 'installed native real-Whisper harness failed' }
  $native = Get-Content -Raw -LiteralPath $nativeArtifact | ConvertFrom-Json; $evidence.transcript = [string]$native.transcript; $evidence.readback = [string]$native.target_text; $evidence.history = $native.history
  if ([string]::IsNullOrWhiteSpace($evidence.transcript) -or -not $evidence.readback.Contains($evidence.transcript) -or $native.history.transcript.text -cne $evidence.transcript -or $native.history.inserted_text -cne $evidence.transcript) { Fail 'native readback/history do not exactly preserve the actual provider transcript' }
  $restartStarted = [DateTime]::UtcNow; $restartDesktop = Start-Process -FilePath $desktopPath -WorkingDirectory (Split-Path -Parent $desktopPath) -PassThru; $restartDesktopTrack = [ordered]@{ pid = $restartDesktop.Id; executable = $desktopPath; start_time = (Get-Process -Id $restartDesktop.Id).StartTime.ToUniversalTime() }; Wait-Endpoint $IpcPort; $restartTrack = Read-Track $ownerPath $daemonPath $IpcPort $restartStarted
  $restart = Invoke-Ipc $env:SORI_IPC_URL @{ RecentHistory = @{ limit = 20 } } 10; $entry = @($restart.RecentHistory.entries | Where-Object { $_.transcript.text -eq $evidence.transcript -and $_.inserted_text -eq $evidence.transcript } | Select-Object -First 1); if ($entry.Count -ne 1) { Fail 'restart IPC history did not contain exact actual transcript/insertion' }; $evidence.restart_history = $entry[0]
  $benchmarkOutput = (& $benchmarkCliPath benchmark --model ggml-base.en.bin --audio $fixturePath --reference $expectedText --iterations 3 2>&1 | Out-String); if ($LASTEXITCODE -ne 0) { Fail "canonical benchmark CLI failed: $benchmarkOutput" }; $benchmarkLine = ($benchmarkOutput -split "`r?`n" | Where-Object { $_ -match '^model=' } | Select-Object -Last 1); if (-not $benchmarkLine) { Fail 'canonical benchmark emitted no parseable metrics' }; $fields = @{}; foreach ($pair in ($benchmarkLine -split ' ')) { if ($pair -match '^([^=]+)=(.*)$') { $fields[$Matches[1]] = $Matches[2] } }; $evidence.benchmark = [ordered]@{ status = 'MEASURED_REAL_QUALITY'; reference = $expectedText; actual = $evidence.transcript; wer = $fields['wer']; cer = $fields['cer']; provider = $fields['provider']; p50_ms = $fields['p50_ms']; p95_ms = $fields['p95_ms']; raw = $benchmarkLine }
  $evidence.status = 'VERIFIED'; $evidence.reason = 'fresh packaged daemon matched installed payload; real Whisper measured quality, actual transcript readback, history, and restart checks passed'
} catch { $evidence.primary_error = $_.Exception.Message; $evidence.reason = "primary failure: $($evidence.primary_error)" } finally {
  foreach ($cleanup in @(
    @{ name = 'restart desktop'; track = $restartDesktopTrack; action = { Stop-TrackedProcess $restartDesktopTrack } },
    @{ name = 'daemon'; track = $restartTrack; action = { Stop-Tracked $restartTrack } }
  )) { if ($cleanup.track) { try { & $cleanup.action } catch { [void]$cleanupErrors.Add("$($cleanup.name): $($_.Exception.Message)") } } }
  foreach ($name in $old.Keys) { try { [Environment]::SetEnvironmentVariable($name, $old[$name]) } catch { [void]$cleanupErrors.Add("restore ${name}: $($_.Exception.Message)") } }
  if ($cleanupErrors.Count -gt 0) { $evidence.status = 'BLOCKED'; $cleanupReason = "safe cleanup failed: $($cleanupErrors -join '; ')"; $evidence.reason = if ($evidence.primary_error) { "$($evidence.reason); $cleanupReason" } else { $cleanupReason } }
  $evidence.cleanup_errors = @($cleanupErrors)
  Write-Report $evidence $ArtifactPath
}
if ($evidence.primary_error -or $cleanupErrors.Count -gt 0) { exit 1 }
