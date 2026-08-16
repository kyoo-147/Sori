[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string]$BundleRoot,
  [ValidateSet('bundle', 'installed', 'launch', 'restart', 'crash-recovery', 'reinstall')]
  [string]$Phase = 'bundle',
  [string]$InstalledRoot,
  [string]$DataRoot,
  [int]$IpcPort = 17373
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'This acceptance script must run on Windows.' }

function Fail([string]$Message) { throw "Windows product acceptance failed: $Message" }
function Pass([string]$Message) { Write-Host "PASS: $Message" }
function Skip([string]$Message) { Write-Host "SKIP: $Message" }
function Assert-ExternalRuntimeBoundary([string]$Root) {
  $forbidden = @(Get-ChildItem -LiteralPath $Root -Recurse -File | Where-Object { $_.Name -match 'whisper|ggml|\.bin$' })
  if ($forbidden) { Fail "bundle contains user-owned Whisper/model files: $($forbidden.FullName -join ', ')" }
  Pass 'external Whisper executable and model boundary is preserved'
}
function Get-InstalledExecutables([string]$Root) {
  $desktop = Get-ChildItem -LiteralPath $Root -Recurse -File | Where-Object { $_.Name -in @('Sori.exe', 'sori-desktop.exe') } | Select-Object -First 1
  $daemon = Get-ChildItem -LiteralPath $Root -Recurse -File -Filter 'sorid.exe' | Select-Object -First 1
  if (-not $desktop) { Fail 'installed desktop executable (Sori.exe or sori-desktop.exe) was not found' }
  if (-not $daemon) { Fail 'installed sorid.exe resource was not found' }
  return @($desktop, $daemon)
}
function Get-PositiveOwnedDaemonPid([int]$Port, [string]$DaemonPath, $Listener) {
  if (-not $Listener) { Fail 'refusing daemon cleanup: no listener was observed' }
  $leasePath = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Sori\daemon-owner.json' } else { Join-Path (Get-Location) 'sori-daemon-owner.json' }
  if (-not (Test-Path -LiteralPath $leasePath)) { Fail "refusing daemon cleanup: ownership lease is absent ($leasePath)" }
  $lease = Get-Content -LiteralPath $leasePath -Raw | ConvertFrom-Json
  $expectedEndpoint = "127.0.0.1:$Port"
  if ($lease.endpoint -ne $expectedEndpoint) { Fail "refusing daemon cleanup: lease endpoint '$($lease.endpoint)' does not match '$expectedEndpoint'" }
  $expectedPath = (Resolve-Path -LiteralPath $DaemonPath).Path
  $leasedPath = (Resolve-Path -LiteralPath $lease.executable).Path
  if (-not [String]::Equals($expectedPath, $leasedPath, [StringComparison]::OrdinalIgnoreCase)) { Fail "refusing daemon cleanup: lease executable '$leasedPath' is not installed daemon '$expectedPath'" }
  $daemonPid = [int]$lease.pid
  if ($daemonPid -ne [int]$Listener[0].OwningProcess) { Fail "refusing daemon cleanup: lease PID $daemonPid does not own listener PID $($Listener[0].OwningProcess)" }
  $process = Get-Process -Id $daemonPid -ErrorAction SilentlyContinue
  if (-not $process) { Fail "refusing daemon cleanup: leased daemon PID $daemonPid is not running" }
  if (-not [String]::Equals((Resolve-Path -LiteralPath $process.Path).Path, $expectedPath, [StringComparison]::OrdinalIgnoreCase)) { Fail "refusing daemon cleanup: live PID $daemonPid executable does not match installed daemon" }
  return $daemonPid
}
function Assert-EndpointFree {
  $owner = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $IpcPort -State Listen -ErrorAction SilentlyContinue)
  if ($owner) { Fail "refusing to touch endpoint owned by PID $($owner[0].OwningProcess); inspect it before retrying" }
}
function Assert-UserDataOutsideInstall([string]$Install, [string]$Data) {
  if (-not $Data) { Skip 'user-data location not supplied; set -DataRoot for persistence evidence'; return }
  if (-not (Test-Path -LiteralPath $Data)) { New-Item -ItemType Directory -Force -Path $Data | Out-Null }
  $installPath = (Resolve-Path $Install).Path.TrimEnd('\')
  $dataPath = [IO.Path]::GetFullPath((Resolve-Path $Data).Path).TrimEnd('\')
  if ($dataPath.StartsWith($installPath, [StringComparison]::OrdinalIgnoreCase)) {
    Fail "user data must not live under the replaceable install root: $dataPath"
  }
  Pass "user data is outside the install root: $dataPath"
}

$bundle = (Resolve-Path $BundleRoot).Path
$artifacts = @(Get-ChildItem -LiteralPath $bundle -Recurse -File)
if (-not ($artifacts | Where-Object Extension -eq '.msi')) { Fail 'MSI artifact was not found' }
if (-not ($artifacts | Where-Object { $_.Name -match 'nsis|setup' -or $_.Extension -eq '.exe' })) { Fail 'NSIS installer artifact was not found' }
Pass 'NSIS and MSI installer artifacts exist'
Assert-ExternalRuntimeBoundary $bundle
if ($Phase -eq 'bundle') {
  Skip 'install, launch, restart, crash-recovery, and uninstall/reinstall phases require a real Windows installation; rerun with an installed phase'
  exit 0
}
if (-not $InstalledRoot) { Fail "-InstalledRoot is required for -Phase $Phase" }
$install = (Resolve-Path $InstalledRoot).Path
$executables = Get-InstalledExecutables $install
Assert-ExternalRuntimeBoundary $install
Assert-UserDataOutsideInstall $install $DataRoot
Pass 'installed Sori.exe and sorid.exe are present'

if ($Phase -eq 'installed') {
  Skip 'launch and restart not requested; rerun with -Phase launch'
  exit 0
}
if ($Phase -eq 'reinstall') {
  if (-not $DataRoot) { Fail '-DataRoot is required for reinstall acceptance' }
  $database = Get-ChildItem -LiteralPath $DataRoot -Recurse -File -Filter '*.db' -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $database) { Fail "no SQLite database found under user-owned data root $DataRoot after uninstall/reinstall" }
  Pass "user-owned SQLite data survived reinstall: $($database.FullName)"
  Skip 'installer uninstall/reinstall execution is manual and must be recorded with the installer product code'
  exit 0
}

Assert-EndpointFree
$desktop = $executables[0]
if ($Phase -eq 'crash-recovery') {
  $oldIpcAddr = $env:SORI_IPC_ADDR
  $oldIpcUrl = $env:SORI_IPC_URL
  $oldDbPath = $env:SORI_DATABASE_PATH
  $oldDbPathAlias = $env:SORI_DB_PATH
  $process = $null
  $ownedDaemonPid = $null
  $recoveredDaemonPid = $null
  $env:SORI_IPC_ADDR = "127.0.0.1:$IpcPort"
  $env:SORI_IPC_URL = "http://127.0.0.1:$IpcPort/ipc"
  if ($DataRoot) {
    New-Item -ItemType Directory -Force -Path $DataRoot | Out-Null
    $env:SORI_DATABASE_PATH = [IO.Path]::Combine((Resolve-Path $DataRoot).Path, 'sori.db')
    $env:SORI_DB_PATH = $env:SORI_DATABASE_PATH
  }
  try {
    $process = Start-Process -FilePath $desktop.FullName -WorkingDirectory $desktop.DirectoryName -PassThru
    Start-Sleep -Seconds 3
    if ($process.HasExited) { Fail "Sori exited during crash-recovery launch with code $($process.ExitCode)" }
    $listener = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $IpcPort -State Listen -ErrorAction SilentlyContinue)
    if (-not $listener) { Fail 'Sori launched but sorid did not bind the crash-recovery endpoint' }
    $ownedDaemonPid = Get-PositiveOwnedDaemonPid -Port $IpcPort -DaemonPath $executables[1].FullName -Listener $listener
    $initialDaemonPid = $ownedDaemonPid
    $ipcUrl = "http://127.0.0.1:$IpcPort/ipc"
    $setBody = @{ SetConfig = @{ key = 'history.retention_limit'; value = 41 } } | ConvertTo-Json -Compress
    $setResponse = Invoke-RestMethod -Uri $ipcUrl -Method Post -ContentType 'application/json' -Body $setBody -TimeoutSec 5
    if (-not $setResponse.Control.accepted) { Fail 'crash-recovery precondition setting write was rejected' }
    Pass "crash-recovery precondition persisted SQLite setting with owned daemon PID $initialDaemonPid"
    Stop-Process -Id $initialDaemonPid -Force
    Pass "terminated only the positively correlated installed daemon PID $initialDaemonPid"
    $ownedDaemonPid = $null
    $unavailableDeadline = (Get-Date).AddSeconds(10)
    do {
      $listener = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $IpcPort -State Listen -ErrorAction SilentlyContinue)
      if (-not $listener) { break }
      Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $unavailableDeadline)
    if ($listener) { Fail 'installed daemon did not become unavailable after owned crash termination' }
    Pass 'desktop-owned daemon endpoint became unavailable after the correlated child termination'
    $recoveryDeadline = (Get-Date).AddSeconds(20)
    do {
      $listener = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $IpcPort -State Listen -ErrorAction SilentlyContinue)
      if ($listener) {
        try {
          $candidate = Get-PositiveOwnedDaemonPid -Port $IpcPort -DaemonPath $executables[1].FullName -Listener $listener
          if ($candidate -ne $initialDaemonPid) { $recoveredDaemonPid = $candidate; break }
        } catch { }
      }
      Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $recoveryDeadline)
    if (-not $recoveredDaemonPid) { Fail 'desktop did not relaunch a positively correlated installed daemon child after endpoint loss' }
    $ownedDaemonPid = $recoveredDaemonPid
    Pass "desktop detected daemon loss and relaunched owned installed daemon PID $recoveredDaemonPid"
    $status = Invoke-RestMethod -Uri $ipcUrl -Method Post -ContentType 'application/json' -Body (ConvertTo-Json 'Status') -TimeoutSec 5
    if (-not $status.Status.running) { Fail 'recovered daemon did not report running status through IPC' }
    Pass 'desktop/runtime status reconnected over recovered IPC'
    $summary = Invoke-RestMethod -Uri $ipcUrl -Method Post -ContentType 'application/json' -Body (ConvertTo-Json 'ConfigSummary') -TimeoutSec 5
    if ($summary.ConfigSummary.history_retention_limit -ne 41) { Fail 'SQLite setting was not preserved across installed daemon crash recovery' }
    Pass 'SQLite-backed setting survived installed daemon crash recovery'
  } finally {
    if ($process -and -not $process.HasExited) {
      Stop-Process -Id $process.Id -Force
      Wait-Process -Id $process.Id -Timeout 10 -ErrorAction SilentlyContinue
      Pass "stopped only the acceptance-owned desktop PID $($process.Id)"
    }
    if ($ownedDaemonPid) {
      Stop-Process -Id $ownedDaemonPid -Force -ErrorAction SilentlyContinue
      Pass "stopped only the positively correlated recovered daemon PID $ownedDaemonPid"
    }
    $env:SORI_IPC_ADDR = $oldIpcAddr
    $env:SORI_IPC_URL = $oldIpcUrl
    $env:SORI_DATABASE_PATH = $oldDbPath
    $env:SORI_DB_PATH = $oldDbPathAlias
  }
  if ($DataRoot) {
    $database = Get-ChildItem -LiteralPath $DataRoot -Recurse -File -Filter '*.db' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($database) { Pass "SQLite database remains available after crash recovery: $($database.FullName)" }
    else { Fail 'no SQLite database found after crash recovery' }
  }
  exit 0
}
$passes = if ($Phase -eq 'restart') { 2 } else { 1 }
for ($attempt = 1; $attempt -le $passes; $attempt++) {
  $oldIpcAddr = $env:SORI_IPC_ADDR
  $ownedDaemonPid = $null
  $oldIpcUrl = $env:SORI_IPC_URL
  $oldDbPath = $env:SORI_DATABASE_PATH
  $oldDbPathAlias = $env:SORI_DB_PATH
  $env:SORI_IPC_ADDR = "127.0.0.1:$IpcPort"
  $env:SORI_IPC_URL = "http://127.0.0.1:$IpcPort/ipc"
  if ($DataRoot) {
    New-Item -ItemType Directory -Force -Path $DataRoot | Out-Null
    $env:SORI_DATABASE_PATH = [IO.Path]::Combine((Resolve-Path $DataRoot).Path, 'sori.db')
    $env:SORI_DB_PATH = $env:SORI_DATABASE_PATH
  }
  $process = Start-Process -FilePath $desktop.FullName -WorkingDirectory $desktop.DirectoryName -PassThru
  $listener = @()
  try {
    Start-Sleep -Seconds 3
    if ($process.HasExited) { Fail "Sori exited during launch with code $($process.ExitCode)" }
    $listener = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $IpcPort -State Listen -ErrorAction SilentlyContinue)
    if (-not $listener) { Fail 'Sori launched but sorid did not bind the loopback endpoint' }
    $ownedDaemonPid = Get-PositiveOwnedDaemonPid -Port $IpcPort -DaemonPath $executables[1].FullName -Listener $listener
    $ipcUrl = "http://127.0.0.1:$IpcPort/ipc"
    $setBody = @{ SetConfig = @{ key = 'history.retention_limit'; value = 37 } } | ConvertTo-Json -Compress
    $setResponse = Invoke-RestMethod -Uri $ipcUrl -Method Post -ContentType 'application/json' -Body $setBody -TimeoutSec 5
    if (-not $setResponse.Control.accepted) { Fail "installed daemon rejected SQLite-backed setting write: $($setResponse | ConvertTo-Json -Compress)" }
    Pass "installed product persisted setting through canonical IPC on launch $attempt/$passes"
    if ($attempt -gt 1) {
      $summary = Invoke-RestMethod -Uri $ipcUrl -Method Post -ContentType 'application/json' -Body (ConvertTo-Json 'ConfigSummary') -TimeoutSec 5
      if ($summary.ConfigSummary.history_retention_limit -ne 37) { Fail 'installed product did not restore persisted setting after restart' }
      Pass 'installed product restored SQLite-backed setting after restart'
    }
    Pass "installed product launch $attempt/$passes bound endpoint with PID $($listener[0].OwningProcess)"
  } finally {
    if (-not $process.HasExited) {
      Stop-Process -Id $process.Id -Force
      Wait-Process -Id $process.Id -Timeout 10 -ErrorAction SilentlyContinue
      Pass "stopped only the acceptance-owned desktop PID $($process.Id)"
    }
    if ($ownedDaemonPid) {
      Stop-Process -Id $ownedDaemonPid -Force -ErrorAction SilentlyContinue
      Pass "stopped only the positively correlated acceptance-owned daemon PID $ownedDaemonPid"
    }
    $env:SORI_IPC_ADDR = $oldIpcAddr
    $env:SORI_IPC_URL = $oldIpcUrl
    $env:SORI_DATABASE_PATH = $oldDbPath
    $env:SORI_DB_PATH = $oldDbPathAlias
  }
  if ($attempt -lt $passes) { Assert-EndpointFree }
}
if ($Phase -eq 'restart' -and $DataRoot) {
  $database = Get-ChildItem -LiteralPath $DataRoot -Recurse -File -Filter '*.db' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($database) { Pass "SQLite database remains available after restart: $($database.FullName)" }
  else { Skip 'no SQLite database found under supplied DataRoot; persistence content is not claimed' }
}
Skip 'physical crash recovery and installer uninstall/reinstall remain manual; this harness never kills an unknown endpoint owner'
