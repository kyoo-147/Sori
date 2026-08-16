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
function Get-PositiveOwnedDaemonPid([int]$Port, [string]$DaemonPath, $Listener) {
  if (-not $Listener) { throw 'refusing daemon cleanup: no listener was observed' }
  $leasePath = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Sori\daemon-owner.json' } else { Join-Path (Get-Location) 'sori-daemon-owner.json' }
  if (-not (Test-Path -LiteralPath $leasePath)) { throw "refusing daemon cleanup: ownership lease is absent ($leasePath)" }
  $lease = Get-Content -LiteralPath $leasePath -Raw | ConvertFrom-Json
  $expectedEndpoint = "127.0.0.1:$Port"
  if ($lease.endpoint -ne $expectedEndpoint) { throw "refusing daemon cleanup: lease endpoint '$($lease.endpoint)' does not match '$expectedEndpoint'" }
  $expectedPath = (Resolve-Path -LiteralPath $DaemonPath).Path
  $leasedPath = (Resolve-Path -LiteralPath $lease.executable).Path
  if (-not [String]::Equals($expectedPath, $leasedPath, [StringComparison]::OrdinalIgnoreCase)) { throw "refusing daemon cleanup: lease executable '$leasedPath' is not expected daemon '$expectedPath'" }
  $daemonPid = [int]$lease.pid
  if ($daemonPid -ne [int]$Listener[0].OwningProcess) { throw "refusing daemon cleanup: lease PID $daemonPid does not own listener PID $($Listener[0].OwningProcess)" }
  $process = Get-Process -Id $daemonPid -ErrorAction SilentlyContinue
  if (-not $process) { throw "refusing daemon cleanup: leased daemon PID $daemonPid is not running" }
  if (-not [String]::Equals((Resolve-Path -LiteralPath $process.Path).Path, $expectedPath, [StringComparison]::OrdinalIgnoreCase)) { throw "refusing daemon cleanup: live PID $daemonPid executable does not match expected daemon" }
  return $daemonPid
}
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
  $daemonPath = Join-Path (Split-Path -Parent (Resolve-Path -LiteralPath $SoriExecutable).Path) 'sorid.exe'
  if (-not (Test-Path -LiteralPath $daemonPath)) { throw "refusing daemon cleanup: expected sibling daemon is absent: $daemonPath" }
  $ownedDaemonPid = Get-PositiveOwnedDaemonPid -Port $IpcPort -DaemonPath $daemonPath -Listener $listener
  $artifact.steps += "recorded positively correlated harness-owned daemon pid $ownedDaemonPid"
  $rebindBody = @{ SetConfig = @{ key = 'hotkey.binding'; value = $Hotkey } } | ConvertTo-Json -Compress
  $rebindResponse = Invoke-RestMethod -Uri $ipcUrl -Method Post -ContentType 'application/json' -Body $rebindBody -TimeoutSec 2
  if (-not $rebindResponse.Control.accepted) { throw "runtime rebind was rejected: $($rebindResponse | ConvertTo-Json -Compress)" }
  $verifiedStatus = Invoke-RestMethod -Uri $ipcUrl -Method Post -ContentType 'application/json' -Body $statusBody -TimeoutSec 2
  if ($verifiedStatus.Status.hotkey -ne $Hotkey) { throw "daemon reported hotkey '$($verifiedStatus.Status.hotkey)' instead of '$Hotkey' after rebind" }
  $artifact.steps += "canonical IPC rebind accepted and Status reported $Hotkey"
  $historyRequest = @{ RecentHistory = @{ limit = 100 } } | ConvertTo-Json -Compress
  $eventsRequest = @{ RecentEvents = @{ limit = 200 } } | ConvertTo-Json -Compress
  $historyBefore = Invoke-RestMethod -Uri $ipcUrl -Method Post -ContentType 'application/json' -Body $historyRequest -TimeoutSec 5
  $eventsBefore = Invoke-RestMethod -Uri $ipcUrl -Method Post -ContentType 'application/json' -Body $eventsRequest -TimeoutSec 5
  $historyBeforeIds = @($historyBefore.RecentHistory.entries | ForEach-Object { [string]$_.id })
  $eventsBeforeIds = @($eventsBefore.RecentEvents.events | ForEach-Object { [string]$_.id })
  $artifact.baseline = [ordered]@{ history_count = $historyBeforeIds.Count; event_count = $eventsBeforeIds.Count }
  $artifact.steps += "snapshotted $($historyBeforeIds.Count) history and $($eventsBeforeIds.Count) event rows before physical action"
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
  $artifact.steps += 'visible text observed in the harness-owned foreground target'
  $historyAfter = Invoke-RestMethod -Uri $ipcUrl -Method Post -ContentType 'application/json' -Body $historyRequest -TimeoutSec 5
  $newHistory = @($historyAfter.RecentHistory.entries | Where-Object { $historyBeforeIds -notcontains ([string]$_.id) })
  $candidates = @($observed.Trim())
  if ($ExpectedText) { $candidates += $ExpectedText.Trim() }
  $matchingHistory = @($newHistory | Where-Object {
    $transcriptText = if ($_.transcript) { [string]$_.transcript.text } else { '' }
    $insertedText = if ($null -ne $_.inserted_text) { [string]$_.inserted_text } else { '' }
    $candidates -contains $transcriptText -and $candidates -contains $insertedText
  } | Select-Object -First 1)
  if (-not $matchingHistory) { throw "history evidence missing: no new entry matched observed or expected text (new=$($newHistory.Count))" }
  $artifact.history = $matchingHistory[0]
  $artifact.steps += 'canonical RecentHistory returned a new entry matching transcript and inserted_text'
  $eventsAfter = Invoke-RestMethod -Uri $ipcUrl -Method Post -ContentType 'application/json' -Body $eventsRequest -TimeoutSec 5
  $newEvents = @($eventsAfter.RecentEvents.events | Where-Object { $eventsBeforeIds -notcontains ([string]$_.id) })
  $requiredEventKinds = @('AudioStarted', 'AudioChunkCaptured', 'VadSpeechStarted', 'VadSpeechEnded', 'TranscriptFinal', 'AudioStopped')
  $eventEvidence = [ordered]@{}
  foreach ($kind in $requiredEventKinds) {
    $eventEvidence[$kind] = @($newEvents | Where-Object { [string]$_.kind -eq $kind })
  }
  $artifact.events = $eventEvidence
  $missingEventKinds = @($requiredEventKinds | Where-Object { @($eventEvidence[$_]).Count -eq 0 })
  if ($missingEventKinds.Count -gt 0) { throw "event evidence missing after physical action: $($missingEventKinds -join ', ')" }
  $artifact.steps += 'canonical RecentEvents returned the required audio, VAD, transcript, and stop evidence'
  $artifact.status = 'VERIFIED'
}
catch {
  $artifact.status = if ($_.Exception.Message -match 'physical|visible|history evidence|event evidence') { 'UNVERIFIED' } else { 'BLOCKED' }
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
