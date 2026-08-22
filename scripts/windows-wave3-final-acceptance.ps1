[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string]$InstalledAppExecutable,
  [Parameter(Mandatory = $true)] [string]$Model,
  [string]$DaemonExecutable = '',
  [string]$Hotkey = 'Alt+Space',
  [string]$ExpectedText = '',
  [int]$TimeoutSeconds = 180,
  [string]$ArtifactPath = '.tmp/windows-wave3-final-acceptance.json'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Wave 3 acceptance requires Windows.' }

# This is deliberately a physical-only gate. It never sends keys, audio, or
# clipboard input. All runtime work is delegated to the installed product IPC.
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class SoriWave3Native {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
}
'@
function Fail([string]$Message) { throw "wave3 acceptance failed: $Message" }
function Normalize-Text([string]$Text) { return (($Text -replace "`r`n", "`n" -replace "`r", "`n").Trim()) }
function Get-LeaseGeneration([string]$Text) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return [Convert]::ToBase64String($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text))) } finally { $sha.Dispose() }
}
function Assert-EndpointFree {
  $listeners = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17373 -State Listen -ErrorAction SilentlyContinue)
  if ($listeners.Count -gt 0) { Fail "refusing to launch against occupied IPC endpoint; listener PID=$($listeners[0].OwningProcess)" }
}
function Read-DaemonLease([string]$ExpectedPath, $Listener, [DateTime]$NotBefore) {
  $leasePath = Join-Path $env:LOCALAPPDATA 'Sori\daemon-owner.json'
  if (-not $Listener) { Fail 'installed app did not expose a loopback daemon listener' }
  if (-not (Test-Path -LiteralPath $leasePath)) { Fail "daemon ownership lease is absent: $leasePath" }
  $leaseText = Get-Content -LiteralPath $leasePath -Raw
  $lease = $leaseText | ConvertFrom-Json
  $path = (Resolve-Path -LiteralPath $ExpectedPath).Path
  if (-not [String]::Equals((Resolve-Path -LiteralPath $lease.executable).Path, $path, [StringComparison]::OrdinalIgnoreCase)) { Fail 'daemon lease executable does not match the installed daemon' }
  if ([int]$lease.pid -ne [int]$Listener[0].OwningProcess) { Fail 'daemon lease PID does not own the listener' }
  $process = Get-Process -Id ([int]$lease.pid) -ErrorAction Stop
  if (-not [String]::Equals((Resolve-Path -LiteralPath $process.Path).Path, $path, [StringComparison]::OrdinalIgnoreCase)) { Fail 'live daemon executable does not match the installed daemon' }
  if ($process.StartTime.ToUniversalTime() -lt $NotBefore) { Fail 'daemon was running before this harness launch; refusing to claim or stop it' }
  [ordered]@{ process = $process; pid = [int]$lease.pid; lease = $lease; lease_text = $leaseText; lease_generation = Get-LeaseGeneration $leaseText; lease_path = $leasePath }
}
function Stop-TrackedProcess($Tracked, [string]$ExpectedPath) {
  if (-not $Tracked) { return }
  $process = Get-Process -Id $Tracked.pid -ErrorAction SilentlyContinue
  if (-not $process) { return }
  if (-not [String]::Equals((Resolve-Path -LiteralPath $process.Path).Path, (Resolve-Path -LiteralPath $ExpectedPath).Path, [StringComparison]::OrdinalIgnoreCase)) { Fail "refusing to stop reused PID $($Tracked.pid) with unexpected executable" }
  if ($process.StartTime.ToUniversalTime() -ne $Tracked.start_time) { Fail "refusing to stop reused PID $($Tracked.pid) with unexpected start time" }
  Stop-Process -Id $process.Id -Force
}
function Invoke-Ipc($Url, $Body, [int]$Timeout = 5) {
  Invoke-RestMethod -Uri $Url -Method Post -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 20 -Compress) -TimeoutSec $Timeout
}
function Read-EditText([IntPtr]$Hwnd) {
  try {
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($Hwnd)
    $edit = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
      [System.Windows.Automation.ControlType]::Edit)
    $items = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $edit)
    $values = [Collections.Generic.List[string]]::new()
    foreach ($item in $items) {
      try { $p = $item.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern); $t = $p.DocumentRange.GetText(-1); if ($t) { [void]$values.Add($t) } } catch {
        try { $p = $item.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern); if ($p.Current.Value) { [void]$values.Add($p.Current.Value) } } catch { }
      }
    }
    return ($values -join "`n")
  } catch { return '' }
}
function Wait-TargetForeground([int]$Pid, [IntPtr]$Hwnd, [int]$Seconds) {
  $until = [DateTime]::UtcNow.AddSeconds($Seconds)
  while ([DateTime]::UtcNow -lt $until) {
    [uint32]$foregroundPid = 0
    $foreground = [SoriWave3Native]::GetForegroundWindow()
    [SoriWave3Native]::GetWindowThreadProcessId($foreground, [ref]$foregroundPid) | Out-Null
    if ($foregroundPid -eq $Pid -and $foreground -eq $Hwnd) { return $true }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

$artifact = [ordered]@{
  status = 'BLOCKED'; started_at = (Get-Date).ToUniversalTime().ToString('o'); completed_at = $null
  physical_input = 'USER_ONLY_NOT_SYNTHESIZED'; hotkey = $Hotkey; model = $Model
  installed_app = $null; daemon = $null; target = $null; preflight = [ordered]@{}
  baseline = $null; transcript = $null; inserted_text = $null; target_readback = $null
  history = $null; events = $null; frontend_refresh = 'UNVERIFIED_NOT_AUTOMATABLE'; restart = $null; error = $null
  truth_boundary = 'Only the captain physical focus, configured hotkey, and spoken sentence can prove physical voice input. This artifact never synthesizes keyboard, audio, clipboard, or focus input.'
}
$app = $null; $daemon = $null; $target = $null; $ipcUrl = $null; $daemonPath = $DaemonExecutable
$appTrack = $null; $daemonTrack = $null; $launchStarted = $null
try {
  New-Item -ItemType Directory -Force -Path '.tmp' | Out-Null
  Assert-EndpointFree
  $launchStarted = [DateTime]::UtcNow
  $appPath = (Resolve-Path -LiteralPath $InstalledAppExecutable).Path
  if (-not $daemonPath) { $daemonPath = Join-Path (Split-Path -Parent $appPath) 'sorid.exe' }
  if (-not (Test-Path -LiteralPath $daemonPath)) { Fail "installed daemon was not found: $daemonPath" }
  $artifact.installed_app = [ordered]@{ path = $appPath }
  $artifact.daemon = [ordered]@{ path = (Resolve-Path -LiteralPath $daemonPath).Path }

  $app = Start-Process -FilePath $appPath -WorkingDirectory (Split-Path -Parent $appPath) -PassThru
  $appTrack = [ordered]@{ pid = $app.Id; start_time = $app.StartTime.ToUniversalTime() }
  $artifact.installed_app.pid = $app.Id
  for ($i = 0; $i -lt 80; $i++) { $app.Refresh(); if ($app.MainWindowHandle -ne 0) { break }; Start-Sleep -Milliseconds 250 }
  if ($app.HasExited) { Fail "installed app exited before readiness (exit=$($app.ExitCode))" }
  if ($app.MainWindowHandle -eq 0) { Fail 'installed app did not expose a main window' }
  $artifact.installed_app.hwnd = ('0x{0:X}' -f $app.MainWindowHandle.ToInt64())

  $endpoint = 'http://127.0.0.1:17373/ipc'; $ipcUrl = $endpoint
  $status = $null; $deadline = [DateTime]::UtcNow.AddSeconds(30)
  do { try { $status = Invoke-Ipc $ipcUrl 'Status' 2; break } catch { Start-Sleep -Milliseconds 300 } } while ([DateTime]::UtcNow -lt $deadline)
  if (-not $status) { Fail 'installed app/daemon IPC did not become ready at 127.0.0.1:17373' }
  $listener = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17373 -State Listen -ErrorAction SilentlyContinue)
  $daemonTrack = Read-DaemonLease $daemonPath $listener $launchStarted
  $daemon = $daemonTrack.process
  $artifact.daemon.pid = $daemonTrack.pid
  $artifact.daemon.ownership = 'harness-owned: endpoint was free before app launch and lease/process identity was correlated'
  $artifact.daemon.lease_generation = $daemonTrack.lease_generation
  $artifact.preflight.status = $status.Status
  $artifact.preflight.doctor = Invoke-Ipc $ipcUrl 'Doctor'
  try { $artifact.preflight.permissions = Invoke-Ipc $ipcUrl @{ ResourceGet = @{ resource = 'permissions' } } } catch { $artifact.preflight.permissions = $null }
  try { $artifact.preflight.onboarding = Invoke-Ipc $ipcUrl @{ ResourceGet = @{ resource = 'onboarding' } } } catch { $artifact.preflight.onboarding = $null }
  $artifact.preflight.audio_device = Invoke-Ipc $ipcUrl @{ SettingGet = @{ key = 'audio.device_id' } }
  $artifact.preflight.audio_readiness = Invoke-Ipc $ipcUrl 'AudioReadiness'
  $artifact.preflight.models = Invoke-Ipc $ipcUrl 'Models'
  $checks = @($artifact.preflight.doctor.Doctor.checks)
  if ($checks | Where-Object { -not $_.ok }) { Fail 'Doctor reported a failed installed-runtime check; see artifact.preflight.doctor' }
  $requiredDoctorChecks = @('audio', 'hotkey', 'whisper', 'text-injection')
  $missingDoctorChecks = @($requiredDoctorChecks | Where-Object { $name = $_; -not (@($checks | Where-Object { $_.name -eq $name -and $_.ok }).Count) })
  if ($missingDoctorChecks.Count -gt 0) { Fail "Doctor did not provide green capability checks: $($missingDoctorChecks -join ', ')" }
  if ($status.Status.hotkey -ne $Hotkey) { Fail "runtime hotkey '$($status.Status.hotkey)' does not equal requested -Hotkey '$Hotkey'" }
  $permissionResponse = $artifact.preflight.permissions.Resource
  $artifact.preflight.permissions_state = if ($permissionResponse -and $permissionResponse.resource -eq 'permissions') { if (@($permissionResponse.value).Count -eq 0) { 'empty_default_not_a_capability_gate' } else { 'recorded_only' } } else { 'unavailable_not_a_capability_gate' }
  $onboardingResponse = if ($artifact.preflight.onboarding) { $artifact.preflight.onboarding.Resource } else { $null }
  if ($onboardingResponse -and $onboardingResponse.resource -eq 'onboarding' -and $null -ne $onboardingResponse.value) { $artifact.preflight.onboarding_state = $onboardingResponse.value }
  $audio = $artifact.preflight.audio_readiness.AudioReadiness
  if ($audio.state -ne 'Ready' -or -not $audio.configured -or $audio.detail -notmatch 'configured input device') { Fail "selected audio device is not ready: $($audio.detail)" }
  $artifact.preflight.selected_audio_device = if ($artifact.preflight.audio_device.Setting.value) { $artifact.preflight.audio_device.Setting.value } else { 'Windows default input device' }
  $modelRecord = @($artifact.preflight.models.Models.models | Where-Object { $_.manifest.id -eq $Model } | Select-Object -First 1)
  $modelStatus = Invoke-Ipc $ipcUrl @{ ModelStatus = @{ model = $Model } }
  if (-not $modelRecord -or -not $modelRecord[0].status.installed -or $modelStatus.ModelStatus.status.phase -ne 'Ready' -or $modelStatus.ModelStatus.status.error) { Fail "configured model is not ready: $Model" }
  $artifact.preflight.model = [ordered]@{ catalog = $modelRecord[0]; status = $modelStatus.ModelStatus }
  $artifact.preflight.device_signal = 'READINESS_ONLY; NO RECORDING WAS MADE'

  $targetTitle = "Sori Wave 3 EDIT Target-$([Guid]::NewGuid().ToString('N'))"
  $targetExe = Join-Path (Resolve-Path '.tmp').Path 'sori-wave3-edit-target.exe'
  if (-not (Test-Path -LiteralPath $targetExe)) {
    Add-Type -ReferencedAssemblies @('System.Windows.Forms.dll','System.Drawing.dll') -TypeDefinition @'
using System; using System.Drawing; using System.Windows.Forms;
public static class SoriWave3EditTarget { [STAThread] public static void Main() { Application.EnableVisualStyles(); var f=new Form { Text=Environment.GetEnvironmentVariable("SORI_WAVE3_TARGET_TITLE"), Width=900, Height=500 }; var e=new TextBox { Multiline=true, Dock=DockStyle.Fill, Font=new Font("Segoe UI",16) }; f.Controls.Add(e); f.Shown+=(s,a)=>e.Focus(); Application.Run(f); } }
'@ -OutputAssembly $targetExe -OutputType WindowsApplication
  }
  $env:SORI_WAVE3_TARGET_TITLE = $targetTitle
  $target = Start-Process -FilePath $targetExe -PassThru
  for ($i = 0; $i -lt 50; $i++) { $target.Refresh(); if ($target.MainWindowHandle -ne 0) { break }; Start-Sleep -Milliseconds 200 }
  if ($target.MainWindowHandle -eq 0) { Fail 'repo-owned EDIT target did not expose a window' }
  $artifact.target = [ordered]@{ pid = $target.Id; hwnd = ('0x{0:X}' -f $target.MainWindowHandle.ToInt64()); title = $targetTitle; ownership = 'harness-owned' }
  $artifact.baseline = [ordered]@{ history = Invoke-Ipc $ipcUrl @{ RecentHistory = @{ limit = 100 } }; events = Invoke-Ipc $ipcUrl @{ RecentEvents = @{ limit = 200 } } }
  $beforeIds = @($artifact.baseline.history.RecentHistory.entries | ForEach-Object { [string]$_.id })
  Write-Host "READY: focus EDIT target PID=$($target.Id) HWND=$($artifact.target.hwnd), then hold $Hotkey, speak one known sentence, and release. No input will be synthesized."
  if (-not (Wait-TargetForeground $target.Id $target.MainWindowHandle 30)) { Fail 'captain did not focus the owned EDIT target within 30 seconds' }

  $until = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds); $match = $null
  while ([DateTime]::UtcNow -lt $until) {
    if ($target.HasExited) { Fail 'EDIT target exited during physical acceptance' }
    $current = Invoke-Ipc $ipcUrl @{ RecentHistory = @{ limit = 100 } }
    $match = @($current.RecentHistory.entries | Where-Object { $beforeIds -notcontains ([string]$_.id) } | Select-Object -First 1)
    if ($match) { break }; Start-Sleep -Milliseconds 500
  }
  if (-not $match) { Fail 'no new SQLite history row observed; physical speech/hotkey remains unverified' }
  $entry = $match[0]; $artifact.history = $entry
  $artifact.transcript = [string]$entry.transcript.text; $artifact.inserted_text = [string]$entry.inserted_text
  if (-not $artifact.transcript -or $artifact.inserted_text -ne $artifact.transcript) { Fail 'history row did not contain matching transcript and inserted_text' }
  if ($ExpectedText -and (Normalize-Text $artifact.transcript) -cne (Normalize-Text $ExpectedText)) { Fail 'transcript did not equal ExpectedText after documented CRLF/trim normalization' }
  if (-not $entry.route.reason -or $entry.route.reason -notmatch 'target=pid:\d+;hwnd:') { Fail 'history route did not retain HWND/PID target ownership' }
  $artifact.target_readback = Read-EditText $target.MainWindowHandle
  if (-not $artifact.target_readback.Contains($artifact.inserted_text)) { Fail 'visible EDIT readback did not contain the persisted inserted text' }
  $artifact.events = Invoke-Ipc $ipcUrl @{ RecentEvents = @{ limit = 200 } }
  $needed = @('AudioStarted','AudioChunkCaptured','VadSpeechStarted','VadSpeechEnded','TranscriptFinal','AudioStopped')
  $baselineEventIds = @($artifact.baseline.events.RecentEvents.events | ForEach-Object { [string]$_.id })
  $newEvents = @($artifact.events.RecentEvents.events | Where-Object { $baselineEventIds -notcontains ([string]$_.id) })
  $missing = @($needed | Where-Object { $kind = $_; -not (@($newEvents | Where-Object { $_.kind -eq $kind }).Count) })
  $artifact.event_check = [ordered]@{ required = $needed; missing = $missing; status = if ($missing.Count -eq 0) { 'VERIFIED' } else { 'UNVERIFIED' } }
  if ($missing.Count -gt 0) { Fail "physical event chain is incomplete: $($missing -join ', ')" }
  # Keep event presence check explicit; the transcript/history/readback are the acceptance gate.
  $artifact.frontend_refresh = 'UNVERIFIED_NOT_AUTOMATABLE_TAURI_WEBVIEW'
  $artifact.status = 'VERIFIED_USER_PHYSICAL_HOTKEY_TRANSCRIPT_INSERTION_READBACK'

  $oldDaemonTrack = $daemonTrack; $oldDaemonPid = $daemonTrack.pid; $restartStarted = [DateTime]::UtcNow
  Stop-TrackedProcess $appTrack $appPath
  Stop-TrackedProcess $daemonTrack $daemonPath
  $staleListener = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17373 -State Listen -ErrorAction SilentlyContinue)
  if ($staleListener.Count -gt 0) { Fail "old daemon listener remained after stopping harness-owned PID $oldDaemonPid" }
  Assert-EndpointFree
  $app = Start-Process -FilePath $appPath -WorkingDirectory (Split-Path -Parent $appPath) -PassThru
  $appTrack = [ordered]@{ pid = $app.Id; start_time = $app.StartTime.ToUniversalTime() }
  $restartStatus = $null; $deadline = [DateTime]::UtcNow.AddSeconds(30)
  do { try { $restartStatus = Invoke-Ipc $ipcUrl 'Status' 2; break } catch { Start-Sleep -Milliseconds 300 } } while ([DateTime]::UtcNow -lt $deadline)
  if (-not $restartStatus -or -not $restartStatus.Status.running) { Fail 'daemon did not recover after owned restart' }
  $newListener = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17373 -State Listen -ErrorAction SilentlyContinue)
  $newDaemonTrack = Read-DaemonLease $daemonPath $newListener $restartStarted
  if ($newDaemonTrack.pid -eq $oldDaemonTrack.pid) { Fail 'restart reused the old daemon PID; refusing to claim persistence' }
  if ($newDaemonTrack.lease_generation -eq $oldDaemonTrack.lease_generation) { Fail 'restart did not produce a new daemon lease generation' }
  $daemonTrack = $newDaemonTrack; $daemon = $newDaemonTrack.process
  $restored = Invoke-Ipc $ipcUrl @{ RecentHistory = @{ limit = 100 } }
  if (-not (@($restored.RecentHistory.entries | Where-Object { $_.id -eq $entry.id }))) { Fail 'verified transcript did not survive daemon restart' }
  $artifact.restart = [ordered]@{ status = 'VERIFIED'; old_pid = $oldDaemonTrack.pid; new_pid = $newDaemonTrack.pid; old_lease_generation = $oldDaemonTrack.lease_generation; new_lease_generation = $newDaemonTrack.lease_generation; restored_history_id = [string]$entry.id; status_response = $restartStatus }
}
catch { $artifact.status = if ($artifact.status -like 'VERIFIED*') { 'PARTIAL' } else { 'BLOCKED' }; $artifact.error = $_.Exception.Message; throw }
finally {
  $artifact.completed_at = (Get-Date).ToUniversalTime().ToString('o'); $dir = Split-Path -Parent $ArtifactPath; if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $artifact | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $ArtifactPath -Encoding UTF8
  if ($target -and -not $target.HasExited) { Stop-Process -Id $target.Id -Force -ErrorAction SilentlyContinue }
  Stop-TrackedProcess $appTrack $appPath
  Stop-TrackedProcess $daemonTrack $daemonPath
  Remove-Item Env:SORI_WAVE3_TARGET_TITLE -ErrorAction SilentlyContinue
}
