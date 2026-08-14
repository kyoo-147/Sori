[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BundleRoot,
  [string]$InstalledRoot,
  [switch]$Launch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'This acceptance script must run on Windows.' }

$root = (Resolve-Path $BundleRoot).Path
$installers = @(Get-ChildItem -LiteralPath $root -Recurse -File -Include *.nsis.zip,*.exe,*.msi)
if (-not ($installers | Where-Object Extension -eq '.msi')) { throw 'MSI artifact was not found.' }
if (-not ($installers | Where-Object { $_.Name -match 'nsis|setup' -or $_.Extension -eq '.exe' })) { throw 'NSIS installer artifact was not found.' }
$forbidden = Get-ChildItem -LiteralPath $root -Recurse -File | Where-Object { $_.Name -match 'whisper|ggml|\.bin$' }
if ($forbidden) { throw "Bundle unexpectedly contains user-owned Whisper/model files: $($forbidden.FullName -join ', ')" }

Write-Host 'PASS: NSIS and MSI artifacts exist.'
Write-Host 'PASS: no Whisper executable, library, or model was bundled.'
if (-not $InstalledRoot) {
  Write-Host 'SKIP: installed-file and launch checks not requested; pass -InstalledRoot after real installer execution.'
  exit 0
}
$installed = (Resolve-Path $InstalledRoot).Path
$desktop = Get-ChildItem -LiteralPath $installed -Recurse -File -Filter 'Sori.exe' | Select-Object -First 1
if (-not $desktop) { throw 'Installed Sori.exe was not found.' }
$sorid = Get-ChildItem -LiteralPath $installed -Recurse -File -Filter 'sorid.exe' | Select-Object -First 1
if (-not $sorid) { throw 'Installed sorid.exe resource was not found.' }
$installedForbidden = Get-ChildItem -LiteralPath $installed -Recurse -File | Where-Object { $_.Name -match 'whisper|ggml|\.bin$' }
if ($installedForbidden) { throw "Installed bundle contains user-owned Whisper/model files: $($installedForbidden.FullName -join ', ')" }
Write-Host 'PASS: installed Sori.exe and sorid.exe exist.'

$owner = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17373 -State Listen -ErrorAction SilentlyContinue
if ($owner) { throw "Refusing launch test: endpoint is owned by PID $($owner.OwningProcess). Inspect it before retrying." }
if (-not $Launch) {
  Write-Host 'SKIP: launch/restart test not requested. Re-run with -Launch after confirming endpoint ownership.'
  exit 0
}

$process = Start-Process -FilePath $desktop.FullName -PassThru
try {
  Start-Sleep -Seconds 3
  if ($process.HasExited) { throw "Sori exited during launch test with code $($process.ExitCode)." }
  Write-Host "PASS: Sori launched (owned PID $($process.Id)); inspect native diagnostics for daemon/resource state."
} finally {
  if (-not $process.HasExited) {
    Stop-Process -Id $process.Id -Force
    Write-Host "PASS: stopped only the launch-test PID $($process.Id)."
  }
}
Write-Host 'SKIP: restart/crash recovery is not automatic; relaunch only after correcting prerequisites and re-checking endpoint ownership.'
