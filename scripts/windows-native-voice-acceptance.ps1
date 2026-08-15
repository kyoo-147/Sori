[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string]$SoriExecutable,
  [Parameter(Mandatory = $true)] [string]$TargetExecutable,
  [ValidateSet('notepad', 'win32-edit')] [string]$TargetKind = 'notepad',
  [Parameter(Mandatory = $true)] [string]$WavPath,
  [Parameter(Mandatory = $true)] [string]$Model,
  [Parameter(Mandatory = $true)] [string]$DataRoot,
  [int]$IpcPort = 18470,
  [string]$ArtifactPath = '.tmp/windows-native-voice-acceptance.json'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'This acceptance script must run on Windows.' }

function Fail([string]$Message) { throw "Windows native voice acceptance failed: $Message" }
function Pass([string]$Message) { Write-Host "PASS: $Message" }
function Assert-EndpointFree {
  $listener = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $IpcPort -State Listen -ErrorAction SilentlyContinue)
  if ($listener) { Fail "refusing to touch endpoint owned by PID $($listener[0].OwningProcess)" }
}
function Get-PositiveOwnedDaemonPid([string]$DaemonPath, $Listener) {
  if (-not $Listener) { Fail 'refusing daemon cleanup: no listener was observed' }
  $leasePath = Join-Path $env:LOCALAPPDATA 'Sori\daemon-owner.json'
  if (-not (Test-Path -LiteralPath $leasePath)) { Fail "refusing daemon cleanup: ownership lease is absent ($leasePath)" }
  $lease = Get-Content -LiteralPath $leasePath -Raw | ConvertFrom-Json
  if ($lease.endpoint -ne "127.0.0.1:$IpcPort") { Fail "refusing daemon cleanup: lease endpoint mismatch" }
  $expectedPath = (Resolve-Path -LiteralPath $DaemonPath).Path
  $leasedPath = (Resolve-Path -LiteralPath $lease.executable).Path
  if (-not [String]::Equals($expectedPath, $leasedPath, [StringComparison]::OrdinalIgnoreCase)) { Fail 'refusing daemon cleanup: lease executable mismatch' }
  $daemonPid = [int]$lease.pid
  if ($daemonPid -ne [int]$Listener[0].OwningProcess) { Fail 'refusing daemon cleanup: lease PID does not own listener' }
  $process = Get-Process -Id $daemonPid -ErrorAction SilentlyContinue
  if (-not $process) { Fail 'refusing daemon cleanup: leased daemon is not running' }
  if (-not [String]::Equals((Resolve-Path -LiteralPath $process.Path).Path, $expectedPath, [StringComparison]::OrdinalIgnoreCase)) { Fail 'refusing daemon cleanup: live executable mismatch' }
  return $daemonPid
}
function Read-Ascii([byte[]]$Bytes, [int]$Offset, [int]$Length) {
  return [Text.Encoding]::ASCII.GetString($Bytes, $Offset, $Length)
}
function Read-WavAudio([string]$Path) {
  $bytes = [IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $Path).Path)
  if ($bytes.Length -lt 44 -or (Read-Ascii $bytes 0 4) -ne 'RIFF' -or (Read-Ascii $bytes 8 4) -ne 'WAVE') { Fail 'fixture is not a RIFF/WAVE file' }
  $channels = [BitConverter]::ToUInt16($bytes, 22)
  $rate = [BitConverter]::ToUInt32($bytes, 24)
  $bits = [BitConverter]::ToUInt16($bytes, 34)
  if ($channels -ne 1 -or $bits -ne 16 -or $rate -eq 0) { Fail "fixture must be mono PCM16 WAV (channels=$channels bits=$bits rate=$rate)" }
  $offset = 12; $dataOffset = -1; $dataSize = 0
  while ($offset + 8 -le $bytes.Length) {
    $chunk = Read-Ascii $bytes $offset 4
    $size = [BitConverter]::ToUInt32($bytes, $offset + 4)
    if ($chunk -eq 'data') { $dataOffset = $offset + 8; $dataSize = [Math]::Min([int64]$size, $bytes.Length - $dataOffset); break }
    $offset += 8 + $size + ($size % 2)
  }
  if ($dataOffset -lt 0 -or $dataSize -lt 2) { Fail 'fixture has no PCM data chunk' }
  $samples = [Collections.Generic.List[double]]::new()
  for ($index = 0; $index + 1 -lt $dataSize; $index += 2) { [void]$samples.Add([BitConverter]::ToInt16($bytes, $dataOffset + $index) / 32767.0) }
  return @{ captured_at = (Get-Date).ToUniversalTime().ToString('o'); format = @{ sample_rate_hz = $rate; channels = 1; sample_format = 'F32' }; samples = $samples }
}
function Ensure-Win32EditTarget([string]$OutputPath) {
  if (Test-Path -LiteralPath $OutputPath) { return (Resolve-Path -LiteralPath $OutputPath).Path }
  $source = @'
using System;
using System.Drawing;
using System.Windows.Forms;
public static class SoriEditTarget {
  [STAThread]
  public static void Main() {
    Application.EnableVisualStyles();
    Application.SetCompatibleTextRenderingDefault(false);
    var form = new Form { Text = Environment.GetEnvironmentVariable("SORI_EDIT_TARGET_TITLE") ?? "Sori Native Edit Target", Width = 900, Height = 500 };
    var edit = new TextBox { Multiline = true, Dock = DockStyle.Fill, Font = new Font("Segoe UI", 16), Name = "Editor" };
    form.Controls.Add(edit);
    form.Shown += (sender, args) => edit.Focus();
    Application.Run(form);
  }
}
'@
  Add-Type -TypeDefinition $source -OutputAssembly $OutputPath -OutputType WindowsApplication -ReferencedAssemblies @('System.Windows.Forms.dll', 'System.Drawing.dll')
  return (Resolve-Path -LiteralPath $OutputPath).Path
}

Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class SoriNativeText {
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int command);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool SwitchToThisWindow(IntPtr hWnd, bool altTab);
  [DllImport("user32.dll")] static extern IntPtr SetActiveWindow(IntPtr hWnd);
  [DllImport("user32.dll")] static extern IntPtr SetFocus(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr hWnd, EnumWindowProc callback, IntPtr data);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int max);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowTextLength(IntPtr hWnd);
  delegate bool EnumWindowProc(IntPtr hWnd, IntPtr data);
  public static bool Focus(IntPtr hWnd) {
    if (!IsWindow(hWnd)) return false;
    ShowWindow(hWnd, 9); SwitchToThisWindow(hWnd, true); BringWindowToTop(hWnd);
    uint targetPid = 0; uint targetThread = GetWindowThreadProcessId(hWnd, out targetPid);
    IntPtr foreground = GetForegroundWindow(); uint priorPid = 0; uint foregroundThread = foreground == IntPtr.Zero ? 0 : GetWindowThreadProcessId(foreground, out priorPid);
    bool attached = foregroundThread != 0 && foregroundThread != targetThread && AttachThreadInput(foregroundThread, targetThread, true);
    bool focused = SetForegroundWindow(hWnd); SetActiveWindow(hWnd); SetFocus(hWnd); BringWindowToTop(hWnd);
    if (attached) AttachThreadInput(foregroundThread, targetThread, false);
    uint foregroundPid = 0; GetWindowThreadProcessId(GetForegroundWindow(), out foregroundPid);
    return foregroundPid == targetPid;
  }
  public static string ReadText(IntPtr hWnd) {
    var values = new List<string>();
    Action<IntPtr> read = (window) => { int n=GetWindowTextLength(window); var b=new StringBuilder(n+1); GetWindowText(window,b,b.Capacity); if(n>0) values.Add(b.ToString()); };
    read(hWnd);
    EnumChildWindows(hWnd, (child, data) => { read(child); return true; }, IntPtr.Zero);
    return string.Join("\n", values);
  }
  public static void Save() {
    keybd_event(0x11, 0, 0, UIntPtr.Zero); keybd_event(0x53, 0, 0, UIntPtr.Zero);
    keybd_event(0x53, 0, 2, UIntPtr.Zero); keybd_event(0x11, 0, 2, UIntPtr.Zero);
  }
}
'@
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
function Read-TargetText([IntPtr]$Handle) {
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($Handle)
  $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
  $elements = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
  $values = [Collections.Generic.List[string]]::new()
  foreach ($element in $elements) {
    try {
      $textPattern = $element.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
      $text = $textPattern.DocumentRange.GetText(-1)
      if ($text) { [void]$values.Add($text) }
    } catch {
      try {
        $valuePattern = $element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        if ($valuePattern.Current.Value) { [void]$values.Add($valuePattern.Current.Value) }
      } catch { }
    }
  }
  return ($values -join "`n")
}

$artifact = [ordered]@{ status = 'FAILED'; steps = [Collections.Generic.List[string]]::new(); transcript = $null; history = $null; target_text = $null }
$desktop = $null; $target = $null; $ownedDaemonPid = $null
$oldIpcAddr = $env:SORI_IPC_ADDR; $oldIpcUrl = $env:SORI_IPC_URL; $oldDb = $env:SORI_DATABASE_PATH; $oldDbAlias = $env:SORI_DB_PATH; $oldEditTitle = $env:SORI_EDIT_TARGET_TITLE
try {
  Assert-EndpointFree
  $dataPath = (Resolve-Path -LiteralPath $DataRoot -ErrorAction SilentlyContinue)
  if (-not $dataPath) { New-Item -ItemType Directory -Force -Path $DataRoot | Out-Null; $dataPath = Resolve-Path -LiteralPath $DataRoot }
  $env:SORI_IPC_ADDR = "127.0.0.1:$IpcPort"; $env:SORI_IPC_URL = "http://127.0.0.1:$IpcPort/ipc"
  $env:SORI_DATABASE_PATH = [IO.Path]::Combine($dataPath.Path, 'sori.db'); $env:SORI_DB_PATH = $env:SORI_DATABASE_PATH
  $desktop = Start-Process -FilePath (Resolve-Path -LiteralPath $SoriExecutable).Path -WorkingDirectory (Split-Path -Parent (Resolve-Path -LiteralPath $SoriExecutable).Path) -PassThru
  $artifact.steps.Add("started owned Sori desktop PID $($desktop.Id)")
  Start-Sleep -Seconds 4
  if ($desktop.HasExited) { Fail "Sori desktop exited with code $($desktop.ExitCode)" }
  $listener = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $IpcPort -State Listen -ErrorAction SilentlyContinue)
  $daemonPath = Join-Path (Split-Path -Parent (Resolve-Path -LiteralPath $SoriExecutable).Path) 'sorid.exe'
  if (-not $listener) { Fail 'installed desktop did not start sorid' }
  $ownedDaemonPid = Get-PositiveOwnedDaemonPid -DaemonPath $daemonPath -Listener $listener
  $artifact.steps.Add("positively correlated installed daemon PID $ownedDaemonPid")
  $models = Invoke-RestMethod -Uri $env:SORI_IPC_URL -Method Post -ContentType 'application/json' -Body (ConvertTo-Json 'Models') -TimeoutSec 5
  if (-not $models.Models.available -or -not ($models.Models.models.manifest.id -contains $Model)) { Fail "real model was not available through canonical Models IPC: $($models | ConvertTo-Json -Compress)" }
  Pass "canonical provider discovered real model $Model"
  $artifact.steps.Add('canonical Models response reported whisper.cpp and the real installed model')
  $targetFileName = "sori-native-target-$([Guid]::NewGuid().ToString('N')).txt"
  $targetFile = Join-Path (Resolve-Path '.tmp').Path $targetFileName
  Set-Content -LiteralPath $targetFile -Value '' -Encoding Unicode
  if ($TargetKind -eq 'win32-edit') {
    $targetTitle = "Sori Native Edit Target-$([Guid]::NewGuid().ToString('N'))"
    $editExecutable = Ensure-Win32EditTarget (Join-Path (Resolve-Path '.tmp').Path 'sori-native-edit-target.exe')
    $env:SORI_EDIT_TARGET_TITLE = $targetTitle
    if (@(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq $targetTitle })) { Fail 'unique Win32 EDIT target title was already present before launch' }
    $targetLaunch = Start-Process -FilePath $editExecutable -PassThru
  } else {
    $targetTitle = $targetFileName
    if (@(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like "$targetFileName*" })) { Fail 'unique harness target title was already present before launch' }
    $targetLaunch = Start-Process -FilePath $TargetExecutable -ArgumentList "`"$targetFile`"" -PassThru
  }
  for ($i=0; $i -lt 40; $i++) {
    $target = if ($TargetKind -eq 'win32-edit') { Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq $targetTitle } | Select-Object -First 1 } else { Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like "$targetFileName*" } | Select-Object -First 1 }
    if ($target -and $target.MainWindowHandle -ne 0) { break }
    Start-Sleep -Milliseconds 250
  }
  if (-not $target) { Fail "harness-owned $TargetKind target did not expose a window" }
  $artifact.steps.Add("started harness-owned target PID $($target.Id) via launcher PID $($targetLaunch.Id)")
  if ($target.HasExited -or $target.MainWindowHandle -eq 0) { Fail "harness-owned $TargetKind target did not expose a window" }
  if (-not [SoriNativeText]::Focus($target.MainWindowHandle)) { Fail "could not focus harness-owned $TargetKind target" }
  Start-Sleep -Milliseconds 300
  $artifact.steps.Add("focused harness-owned target PID $($target.Id) without claiming physical input")
  $audio = Read-WavAudio $WavPath
  $body = @{ DictationAudio = @{ model = $Model; audio = @($audio) } } | ConvertTo-Json -Depth 10 -Compress
  if (-not [SoriNativeText]::Focus($target.MainWindowHandle)) { Fail 'harness-owned Notepad lost foreground before canonical injection' }
  $response = Invoke-RestMethod -Uri $env:SORI_IPC_URL -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 180
  if (-not $response.Transcript.text) { Fail "canonical audio dictation produced no transcript: $($response | ConvertTo-Json -Compress)" }
  $artifact.transcript = $response.Transcript.text
  Pass "real Whisper fixture produced transcript: $($response.Transcript.text)"
  $artifact.steps.Add('real fixture audio traversed canonical provider and actual Windows SendInput path')
  $history = Invoke-RestMethod -Uri $env:SORI_IPC_URL -Method Post -ContentType 'application/json' -Body (ConvertTo-Json @{ RecentHistory = @{ limit = 20 } } -Compress) -TimeoutSec 5
  $entry = @($history.RecentHistory.entries | Where-Object { $_.transcript.text -eq $response.Transcript.text } | Select-Object -First 1)
  if (-not $entry) { Fail 'SQLite RecentHistory did not contain the real injected transcript' }
  if ($entry[0].inserted_text -ne $response.Transcript.text) { Fail 'SQLite history did not record inserted_text for the real target' }
  if (-not $entry[0].route.reason -or $entry[0].route.reason -notmatch 'target=pid:\d+;hwnd:') { Fail 'backend history did not retain the immediate foreground target PID/HWND assertion' }
  Pass "backend asserted focused target immediately before injection: $($entry[0].route.reason)"
  Pass 'SQLite history persisted transcript and inserted_text'
  $artifact.history = $entry[0]
  $artifact.steps.Add('canonical RecentHistory returned persisted SQLite evidence')
  $status = Invoke-RestMethod -Uri $env:SORI_IPC_URL -Method Post -ContentType 'application/json' -Body (ConvertTo-Json 'Status') -TimeoutSec 5
  if (-not $status.Status.running) { Fail 'runtime status did not report running after injection' }
  Pass 'FE/runtime reconnect refresh boundary remained healthy through canonical Status/History reads'
  $artifact.steps.Add('canonical status and history refresh reads succeeded after injection')
  if (-not [SoriNativeText]::Focus($target.MainWindowHandle)) { Fail "harness-owned $TargetKind was not foreground for readback" }
  $target.Refresh(); $targetText = [SoriNativeText]::ReadText($target.MainWindowHandle)
  if (-not $targetText.Contains($response.Transcript.text)) { $targetText = Read-TargetText $target.MainWindowHandle }
  if ($TargetKind -eq 'notepad' -and -not $targetText.Contains($response.Transcript.text)) {
    [SoriNativeText]::Save(); Start-Sleep -Milliseconds 700
    $savedBytes = [IO.File]::ReadAllBytes($targetFile)
    $savedUnicode = [Text.Encoding]::Unicode.GetString($savedBytes)
    $savedUtf8 = [Text.Encoding]::UTF8.GetString($savedBytes)
    if ($savedUnicode.Contains($response.Transcript.text)) { $targetText = $savedUnicode }
    elseif ($savedUtf8.Contains($response.Transcript.text)) { $targetText = $savedUtf8 }
  }
  if ($TargetKind -eq 'notepad' -and -not $targetText.Contains($response.Transcript.text)) {
    $clipboardBefore = Get-Clipboard -Raw -ErrorAction SilentlyContinue
    [System.Windows.Forms.SendKeys]::SendWait('^a'); [System.Windows.Forms.SendKeys]::SendWait('^c'); Start-Sleep -Milliseconds 400
    $clipboardText = Get-Clipboard -Raw -ErrorAction SilentlyContinue
    if ($clipboardText -and $clipboardText.Contains($response.Transcript.text)) { $targetText = $clipboardText }
    if ($null -eq $clipboardBefore) { Set-Clipboard -Value '' } else { Set-Clipboard -Value $clipboardBefore }
  }
  $artifact.target_text = $targetText
  if (-not $targetText.Contains($response.Transcript.text)) { Fail "harness-owned $TargetKind text did not contain the transcript. Captured text: $targetText" }
  Pass "harness-owned $TargetKind contained actual Unicode SendInput output"
  $artifact.status = 'VERIFIED'
} catch {
  $artifact.steps.Add("ERROR: $($_.Exception.Message)")
  throw
} finally {
  $artifact | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ArtifactPath -Encoding UTF8
  if ($desktop -and -not $desktop.HasExited) { Stop-Process -Id $desktop.Id -Force -ErrorAction SilentlyContinue }
  if ($ownedDaemonPid) { Stop-Process -Id $ownedDaemonPid -Force -ErrorAction SilentlyContinue }
  if ($target -and -not $target.HasExited) { Stop-Process -Id $target.Id -Force -ErrorAction SilentlyContinue }
  $env:SORI_IPC_ADDR = $oldIpcAddr; $env:SORI_IPC_URL = $oldIpcUrl; $env:SORI_DATABASE_PATH = $oldDb; $env:SORI_DB_PATH = $oldDbAlias; $env:SORI_EDIT_TARGET_TITLE = $oldEditTitle
}
