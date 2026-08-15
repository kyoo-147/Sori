[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$SoriExecutable,
  [string]$TargetExecutable = 'notepad.exe',
  [string]$Hotkey = 'Ctrl+Alt+K',
  [string]$ExpectedText = '',
  [int]$TimeoutSeconds = 180,
  [string]$ArtifactPath = 'artifacts/windows-hotkey-injection-acceptance.json',
  [int]$IpcPort = 0,
  [switch]$PreflightOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'This acceptance path requires Windows.' }
if (-not (Test-Path -LiteralPath $SoriExecutable)) { throw "Sori executable was not found: $SoriExecutable" }

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class SoriAcceptanceNative {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@

$artifact = [ordered]@{
  status = 'BLOCKED'
  target = $TargetExecutable
  hotkey = $Hotkey
  expected_text = $ExpectedText
  target_pid = $null
  target_hwnd = $null
  started_sori_pid = $null
  ipc_endpoint = $null
  steps = @()
  truth_boundary = 'Only a user physical hotkey plus real microphone/provider path can prove voice-to-visible injection. This harness never sends the configured hotkey and never kills an unknown process.'
}
$IpcPort = if ($IpcPort -gt 0) { $IpcPort } else { Get-Random -Minimum 20000 -Maximum 45000 }
$ipcEndpoint = "127.0.0.1:$IpcPort"
$artifact.ipc_endpoint = $ipcEndpoint
$ownedTarget = $null
$ownedSori = $null
 $ownedDaemonPid = $null
try {
  $ownedTarget = Start-Process -FilePath $TargetExecutable -PassThru
  $artifact.target_pid = $ownedTarget.Id
  $artifact.steps += "started owned target pid $($ownedTarget.Id)"
  $ownedTarget.WaitForInputIdle(10000)
  Start-Sleep -Milliseconds 500
  if ($PreflightOnly) {
    $artifact.steps += 'foreground target guard deferred; preflight does not synthesize focus or key input'
  } else {
    $hwnd = [SoriAcceptanceNative]::GetForegroundWindow()
    [uint32]$foregroundPid = 0
    [SoriAcceptanceNative]::GetWindowThreadProcessId($hwnd, [ref]$foregroundPid) | Out-Null
    if ($foregroundPid -ne $ownedTarget.Id) {
      [SoriAcceptanceNative]::SetForegroundWindow($ownedTarget.MainWindowHandle) | Out-Null
      Start-Sleep -Milliseconds 250
      $hwnd = [SoriAcceptanceNative]::GetForegroundWindow()
      [SoriAcceptanceNative]::GetWindowThreadProcessId($hwnd, [ref]$foregroundPid) | Out-Null
    }
    if ($foregroundPid -ne $ownedTarget.Id) { throw "owned target could not become foreground (pid=$foregroundPid expected=$($ownedTarget.Id))" }
    $artifact.target_hwnd = ('0x{0:X}' -f $hwnd.ToInt64())
    $artifact.steps += "foreground PID guard passed for owned target $foregroundPid"
  }

  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = (Resolve-Path -LiteralPath $SoriExecutable).Path
  $psi.UseShellExecute = $false
  $psi.EnvironmentVariables['SORI_IPC_ADDR'] = $ipcEndpoint
  $psi.EnvironmentVariables['SORI_IPC_URL'] = "http://$ipcEndpoint/ipc"
  $psi.EnvironmentVariables['SORI_HOTKEY_OVERRIDE'] = $Hotkey
  $ownedSori = [Diagnostics.Process]::Start($psi)
  $artifact.started_sori_pid = $ownedSori.Id
  $artifact.steps += "started Sori pid $($ownedSori.Id); requested isolated binding $Hotkey"
  $statusBody = ConvertTo-Json 'Status'
  $ipcUrl = "http://$ipcEndpoint/ipc"
  $statusResponse = $null
  $deadline = (Get-Date).AddSeconds(30)
  do {
    if ($ownedSori.HasExited) { throw "owned Sori exited before IPC became ready (exit=$($ownedSori.ExitCode))" }
    try { $statusResponse = Invoke-RestMethod -Uri $ipcUrl -Method Post -ContentType 'application/json' -Body $statusBody -TimeoutSec 2; break } catch { Start-Sleep -Milliseconds 250 }
  } while ((Get-Date) -lt $deadline)
  if (-not $statusResponse) { throw "isolated Sori IPC endpoint did not become ready: $ipcUrl" }
  $listener = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $IpcPort -State Listen -ErrorAction SilentlyContinue)
  if (-not $listener) { throw "isolated endpoint became reachable but has no owned listener: $ipcEndpoint" }
  $ownedDaemonPid = $listener[0].OwningProcess
  $artifact.steps += "recorded harness-owned daemon pid $ownedDaemonPid"
  $rebindBody = @{ SetConfig = @{ key = 'hotkey.binding'; value = $Hotkey } } | ConvertTo-Json -Compress
  $rebindResponse = Invoke-RestMethod -Uri $ipcUrl -Method Post -ContentType 'application/json' -Body $rebindBody -TimeoutSec 2
  if (-not $rebindResponse.Control.accepted) { throw "runtime rebind was rejected: $($rebindResponse | ConvertTo-Json -Compress)" }
  $verifiedStatus = Invoke-RestMethod -Uri $ipcUrl -Method Post -ContentType 'application/json' -Body $statusBody -TimeoutSec 2
  if ($verifiedStatus.Status.hotkey -ne $Hotkey) { throw "daemon reported hotkey '$($verifiedStatus.Status.hotkey)' instead of '$Hotkey' after rebind" }
  $artifact.steps += "canonical IPC rebind accepted and Status reported $Hotkey"
  if ($PreflightOnly) {
    $artifact.status = 'UNVERIFIED'
    $artifact.steps += 'physical hotkey, microphone speech, and visible injection left for captain interaction'
    return
  }
  Write-Host "Sori is running with owned target PID $($ownedTarget.Id)."
  Write-Host "Perform exactly one physical action now: focus the target, hold $Hotkey, speak the configured phrase, then release it."
  Write-Host "The harness will not synthesize the hotkey or microphone input. Waiting up to $TimeoutSeconds seconds..."
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if ($ownedTarget.HasExited) { throw 'Owned target exited before acceptance completed.' }
    Start-Sleep -Milliseconds 500
  }

  # Read back only from the harness-owned target. Ctrl+A/C is allowed here solely
  # to observe visible text after the user's physical hotkey action.
  [SoriAcceptanceNative]::SetForegroundWindow($hwnd) | Out-Null
  Start-Sleep -Milliseconds 250
  [System.Windows.Forms.SendKeys]::SendWait('^a')
  [System.Windows.Forms.SendKeys]::SendWait('^c')
  Start-Sleep -Milliseconds 250
  $observed = Get-Clipboard
  $artifact.observed_text = $observed
  if ($ExpectedText -and $observed -notlike "*$ExpectedText*") { throw "owned target did not contain expected visible text; observed: $observed" }
  if (-not $observed) { throw 'Owned target contained no visible text after the physical action.' }
  $artifact.status = 'VERIFIED'
  $artifact.steps += 'visible text observed in the harness-owned foreground target'
}
catch {
  $artifact.status = if ($_.Exception.Message -like '*physical*' -or $_.Exception.Message -like '*visible*') { 'UNVERIFIED' } else { 'BLOCKED' }
  $artifact.error = $_.Exception.Message
  throw
}
finally {
  $dir = Split-Path -Parent $ArtifactPath
  if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $artifact | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 -LiteralPath $ArtifactPath
  # Stop only processes created by this invocation, never a pre-existing PID.
  if ($ownedSori -and -not $ownedSori.HasExited) { Stop-Process -Id $ownedSori.Id -Force -ErrorAction SilentlyContinue }
  if ($ownedDaemonPid) { Stop-Process -Id $ownedDaemonPid -Force -ErrorAction SilentlyContinue }
  if ($ownedTarget -and -not $ownedTarget.HasExited) { Stop-Process -Id $ownedTarget.Id -Force -ErrorAction SilentlyContinue }
}
