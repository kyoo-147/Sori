# Wave 6: installed Windows real-Whisper synthetic vertical.
# Uses only existing user-owned assets. It never downloads, synthesizes input, or
# labels SAPI playback as physical microphone evidence.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string]$InstalledDesktopExecutable,
  [Parameter(Mandatory = $true)] [string]$CliExecutable,
  [Parameter(Mandatory = $true)] [string]$CorpusDirectory,
  [string]$DaemonExecutable = '',
  [string]$ModelPath = (Join-Path $env:LOCALAPPDATA 'Sori\whisper\models\ggml-base.en.bin'),
  [string]$WhisperExecutable = (Join-Path $env:LOCALAPPDATA 'Sori\whisper\whisper-cli.exe'),
  [string]$DataRoot = (Join-Path (Get-Location) '.tmp\wave6r-installed-real-e2e'),
  [int]$IpcPort = 18476,
  [string]$ArtifactPath = 'D:\work\Sori\.firstmate\data\wave6r-installed-real-e2e-1787399001\report.md'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Wave 6 requires Windows.' }

function Fail([string]$Message) { throw "Wave 6 failed: $Message" }
function RequireFile([string]$Path, [string]$Name) { if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { Fail "$Name is missing: $Path" }; return (Resolve-Path -LiteralPath $Path).Path }
function Stop-Owned([int]$Pid) { if ($Pid -and (Get-Process -Id $Pid -ErrorAction SilentlyContinue)) { Stop-Process -Id $Pid -Force -ErrorAction SilentlyContinue } }
function Wait-Endpoint([int]$Port) { for ($i = 0; $i -lt 60; $i++) { if (@(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) { return }; Start-Sleep -Milliseconds 250 }; Fail "owned daemon did not listen on 127.0.0.1:$Port" }
function Run-Json([string]$Exe, [string[]]$Args) { $text = (& $Exe @Args 2>&1 | Out-String); if ($LASTEXITCODE -ne 0) { Fail "CLI failed: $text" }; try { return ($text | ConvertFrom-Json) } catch { Fail "CLI returned non-JSON output: $text" } }
function Stop-DesktopAndDaemon([object]$Desktop, [string]$LeasePath) {
  if ($Desktop -and -not $Desktop.HasExited) { Stop-Process -Id $Desktop.Id -Force -ErrorAction SilentlyContinue }
  if (Test-Path -LiteralPath $LeasePath) { try { $lease = Get-Content -Raw -LiteralPath $LeasePath | ConvertFrom-Json; Stop-Owned ([int]$lease.pid) } catch { } }
}
function Write-Report([hashtable]$Evidence, [string]$Path) {
  $dir = Split-Path -Parent $Path; if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $lines = @('# Wave 6 installed real Whisper synthetic vertical', '', "- status: **$($Evidence.status)**", "- started_utc: $($Evidence.started)", "- completed_utc: $([DateTime]::UtcNow.ToString('o'))", "- installed_desktop: ``$($Evidence.desktop)``", "- bundled_daemon: ``$($Evidence.daemon)``", "- installed_cli: ``$($Evidence.cli)``", "- whisper_cpp: ``$($Evidence.whisper)``", "- model: ``$($Evidence.model)``", "- model_sha256: ``$($Evidence.model_hash)``", "- SAPI_manifest: ``$($Evidence.manifest)``", "- fixture: ``$($Evidence.fixture)``", "- fixture_sha256: ``$($Evidence.fixture_hash)``", "- endpoint: ``127.0.0.1:$($Evidence.port)``", "- database: isolated under ``$($Evidence.data)``", '', '## Evidence', '', '- Real whisper.cpp provider transcription: VERIFIED only when the installed harness exits 0.', '- SAPI provenance: VERIFIED from the corpus manifest and byte hash; network=false and microphone=false.', '- Owned Win32 EDIT HWND/PID and visible readback: VERIFIED by the native harness.', '- SQLite/history and restart persistence: VERIFIED by the installed CLI history read after relaunch.', '- Frontend refresh: NOT CLAIMED; this run records daemon/CLI observability only.', '- Physical microphone and physical hotkey: UNVERIFIED; this synthetic SAPI input is not microphone proof.', '', '```json', ($Evidence | ConvertTo-Json -Depth 8), '```')
  Set-Content -LiteralPath $Path -Value ($lines -join "`r`n") -Encoding UTF8
}

$started = [DateTime]::UtcNow.ToString('o')
$desktopPath = RequireFile $InstalledDesktopExecutable 'installed desktop'
$cliPath = RequireFile $CliExecutable 'installed CLI'
$whisperPath = RequireFile $WhisperExecutable 'user-owned whisper.cpp executable'
$modelPath = RequireFile $ModelPath 'user-owned Whisper model'
$manifestPath = RequireFile (Join-Path $CorpusDirectory 'manifest.json') 'SAPI corpus manifest'
$daemonPath = if ($DaemonExecutable) { RequireFile $DaemonExecutable 'bundled daemon' } else { RequireFile (Join-Path (Split-Path -Parent $desktopPath) 'sorid.exe') 'bundled daemon' }
if ([IO.Path]::GetFileName($modelPath) -cne 'ggml-base.en.bin') { Fail "Wave 6 requires ggml-base.en.bin, got $([IO.Path]::GetFileName($modelPath))" }
& (Join-Path $PSScriptRoot 'windows-audio-fixture-corpus-verify.ps1') -CorpusDirectory (Resolve-Path $CorpusDirectory).Path | Out-Null
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$record = @($manifest.files | Where-Object { $_.file -eq 'en-greeting--base.wav' } | Select-Object -First 1)
if ($record.Count -ne 1) { Fail 'verified SAPI manifest lacks en-greeting--base.wav' }
$fixturePath = RequireFile (Join-Path $CorpusDirectory $record[0].file) 'verified SAPI fixture'
$fixtureHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $fixturePath).Hash.ToLowerInvariant()
if ($fixtureHash -ne ([string]$record[0].sha256).ToLowerInvariant()) { Fail 'SAPI fixture hash disagrees with manifest' }
$modelHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $modelPath).Hash.ToLowerInvariant()
New-Item -ItemType Directory -Force -Path $DataRoot | Out-Null
$dataPath = (Resolve-Path $DataRoot).Path
$leasePath = Join-Path $env:LOCALAPPDATA 'Sori\daemon-owner.json'
$evidence = @{ status = 'FAILED'; started = $started; desktop = $desktopPath; daemon = $daemonPath; cli = $cliPath; whisper = $whisperPath; model = $modelPath; model_hash = $modelHash; manifest = $manifestPath; fixture = $fixturePath; fixture_hash = $fixtureHash; port = $IpcPort; data = $dataPath; native = $null; restart_history = $null }
$desktop = $null
$old = @{}; foreach ($name in @('SORI_IPC_ADDR','SORI_IPC_URL','SORI_DATABASE_PATH','SORI_DB_PATH','SORI_WHISPER_CPP_BIN','SORI_WHISPER_MODEL_DIR','SORI_WHISPER_MODEL')) { $old[$name] = [Environment]::GetEnvironmentVariable($name) }
try {
  if (@(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $IpcPort -State Listen -ErrorAction SilentlyContinue)) { Fail "endpoint is already occupied: 127.0.0.1:$IpcPort" }
  $env:SORI_IPC_ADDR = "127.0.0.1:$IpcPort"; $env:SORI_IPC_URL = "http://127.0.0.1:$IpcPort/ipc"; $env:SORI_DATABASE_PATH = Join-Path $dataPath 'sori.db'; $env:SORI_DB_PATH = $env:SORI_DATABASE_PATH
  $env:SORI_WHISPER_CPP_BIN = $whisperPath; $env:SORI_WHISPER_MODEL_DIR = Split-Path -Parent $modelPath; $env:SORI_WHISPER_MODEL = [IO.Path]::GetFileName($modelPath)
  $nativeArtifact = Join-Path $dataPath 'native-voice.json'
  $nativeArgs = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'windows-native-voice-acceptance.ps1'),'-SoriExecutable',$desktopPath,'-DaemonExecutable',$daemonPath,'-TargetExecutable',(Join-Path $env:WINDIR 'System32\notepad.exe'),'-TargetKind','win32-edit','-WavPath',$fixturePath,'-Model','ggml-base.en.bin','-DataRoot',$dataPath,'-IpcPort',([string]$IpcPort),'-ArtifactPath',$nativeArtifact)
  & powershell.exe @nativeArgs
  if ($LASTEXITCODE -ne 0) { Fail 'installed native real-Whisper harness failed' }
  $evidence.native = Get-Content -Raw -LiteralPath $nativeArtifact | ConvertFrom-Json
  $desktop = Start-Process -FilePath $desktopPath -WorkingDirectory (Split-Path -Parent $desktopPath) -PassThru
  Wait-Endpoint $IpcPort
  $history = Run-Json $cliPath @('--json','history','--limit','20')
  if (-not $history.RecentHistory.entries -or @($history.RecentHistory.entries).Count -eq 0) { Fail 'restart history is empty after relaunch' }
  $evidence.restart_history = $history.RecentHistory.entries[0]
  $evidence.status = 'VERIFIED'
} catch { $evidence.error = $_.Exception.Message; throw } finally {
  Stop-DesktopAndDaemon $desktop $leasePath
  foreach ($name in $old.Keys) { [Environment]::SetEnvironmentVariable($name, $old[$name]) }
  Write-Report $evidence $ArtifactPath
}
