[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string]$BundleRoot,
  [ValidateSet('bundle', 'install', 'installed', 'launch', 'restart', 'reinstall')]
  [string]$Phase = 'bundle',
  [string]$InstallerPath,
  [ValidateSet('nsis', 'msi')]
  [string]$InstallerType = 'nsis',
  [string]$ProductCode,
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
function Invoke-Installer([string]$Path, [string]$Type, [string]$Root) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { Fail "installer was not found: $Path" }
  $resolvedRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\')
  New-Item -ItemType Directory -Force -Path $resolvedRoot | Out-Null
  $arguments = if ($Type -eq 'nsis') { @('/S', "/D=$resolvedRoot") } else { @('/i', $Path, '/qn', '/norestart', "INSTALLDIR=$resolvedRoot") }
  $file = if ($Type -eq 'nsis') { $Path } else { 'msiexec.exe' }
  $process = Start-Process -FilePath $file -ArgumentList $arguments -Wait -PassThru
  if ($process.ExitCode -ne 0) { Fail "$Type silent install failed with exit code $($process.ExitCode)" }
  Pass "$Type silent install completed into product-owned root $resolvedRoot"
}
function Invoke-Uninstaller([string]$Root, [string]$Type, [string]$Code) {
  if ($Type -eq 'msi') {
    if (-not $Code) { Fail '-ProductCode is required for safe MSI uninstall/reinstall' }
    $process = Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/x', $Code, '/qn', '/norestart') -Wait -PassThru
  } else {
    $uninstaller = Get-ChildItem -LiteralPath $Root -File -Filter 'uninstall*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $uninstaller) { Fail "refusing NSIS uninstall: no product-owned uninstaller under $Root" }
    $process = Start-Process -FilePath $uninstaller.FullName -ArgumentList @('/S') -Wait -PassThru
  }
  if ($process.ExitCode -ne 0) { Fail "$Type silent uninstall failed with exit code $($process.ExitCode)" }
  Pass "$Type silent uninstall completed; user data was not targeted"
}
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
  $installPath = [IO.Path]::GetFullPath($Install).TrimEnd('\')
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
  Skip 'install, launch, restart, and uninstall/reinstall phases require a real Windows installation; provide an explicit installer and product-owned root for install/reinstall'
  exit 0
}
if ($Phase -in @('install', 'reinstall')) {
  if (-not $InstallerPath) { Fail "-InstallerPath is required for -Phase $Phase" }
  if (-not $InstalledRoot) { Fail "-InstalledRoot is required for -Phase $Phase" }
  Assert-UserDataOutsideInstall $InstalledRoot $DataRoot
  if ($Phase -eq 'reinstall') {
    if (-not (Test-Path -LiteralPath $InstalledRoot)) { Fail "refusing reinstall: existing product root is absent: $InstalledRoot" }
    if (-not $DataRoot) { Fail '-DataRoot is required for reinstall acceptance' }
    $database = Get-ChildItem -LiteralPath $DataRoot -Recurse -File -Filter '*.db' -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $database) { Fail "refusing reinstall: no SQLite database found under user-owned data root $DataRoot" }
    Assert-EndpointFree
    Invoke-Uninstaller $InstalledRoot $InstallerType $ProductCode
    Start-Sleep -Seconds 2
    if (Test-Path -LiteralPath $InstalledRoot) {
      $remaining = @(Get-ChildItem -LiteralPath $InstalledRoot -Force -ErrorAction SilentlyContinue)
      if ($remaining) { Fail "reinstall safety check found files remaining under install root: $InstalledRoot" }
    }
  }
  Invoke-Installer $InstallerPath $InstallerType $InstalledRoot
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
  $database = Get-ChildItem -LiteralPath $DataRoot -Recurse -File -Filter '*.db' -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $database) { Fail "user-owned SQLite data did not survive reinstall: $DataRoot" }
  Pass "user-owned SQLite data survived silent uninstall/reinstall: $($database.FullName)"
}

Assert-EndpointFree
$desktop = $executables[0]
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
Skip 'automatic crash recovery is not supported; use -Phase restart to relaunch the desktop on request. This harness never kills an unknown endpoint owner'
