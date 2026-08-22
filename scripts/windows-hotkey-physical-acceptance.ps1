[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string]$TargetExecutable,
  [string]$TargetArguments = '',
  [string]$ExpectedText,
  [int]$TimeoutSeconds = 30,
  [string]$ArtifactPath = '.tmp/windows-hotkey-physical-acceptance.json'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'This harness must run on Windows.' }

# This harness deliberately emits no keyboard or mouse input. The captain must
# perform the configured Sori hotkey physically; observing a key state alone is
# not treated as proof of physical origin.
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class SoriPhysicalAcceptance {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder b, int n);
  public static string Text(IntPtr h) { var b = new StringBuilder(65536); GetWindowText(h,b,b.Capacity); return b.ToString(); }
}
'@

function Fail([string]$Message) { throw "physical hotkey acceptance failed: $Message" }
$artifact = [ordered]@{ status = 'UNVERIFIED'; target_pid = $null; target_hwnd = $null; before = ''; after = ''; physical_input = 'USER_ONLY_NOT_SYNTHESIZED' }
$target = $null
try {
  $target = Start-Process -FilePath (Resolve-Path -LiteralPath $TargetExecutable).Path -ArgumentList $TargetArguments -PassThru
  for ($i = 0; $i -lt 40 -and $target.MainWindowHandle -eq 0; $i++) { Start-Sleep -Milliseconds 250; $target.Refresh() }
  if (-not $target -or $target.HasExited -or $target.MainWindowHandle -eq 0) { Fail 'owned target did not expose a window' }
  [uint32]$pid = 0
  [SoriPhysicalAcceptance]::GetWindowThreadProcessId($target.MainWindowHandle, [ref]$pid) | Out-Null
  if ($pid -ne $target.Id -or -not [SoriPhysicalAcceptance]::IsWindow($target.MainWindowHandle)) { Fail 'target HWND/PID ownership could not be established' }
  $artifact.target_pid = $pid; $artifact.target_hwnd = ('0x{0:x}' -f $target.MainWindowHandle.ToInt64())
  $artifact.before = [SoriPhysicalAcceptance]::Text($target.MainWindowHandle)
  Write-Host "OWNED TARGET PID=$pid HWND=$($artifact.target_hwnd)"
  Write-Host 'Perform the Sori hotkey physically now, then release it. No input is synthesized by this script.'
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  do {
    Start-Sleep -Milliseconds 250
    $target.Refresh()
    if ($target.HasExited) { Fail 'target disappeared before readback' }
    $foregroundPid = 0
    [SoriPhysicalAcceptance]::GetWindowThreadProcessId([SoriPhysicalAcceptance]::GetForegroundWindow(), [ref]$foregroundPid) | Out-Null
    if ($foregroundPid -ne $pid) { Fail "foreground target changed (expected PID $pid, actual $foregroundPid)" }
    $artifact.after = [SoriPhysicalAcceptance]::Text($target.MainWindowHandle)
    $changed = $artifact.after -ne $artifact.before
    $expected = [string]::IsNullOrEmpty($ExpectedText) -or $artifact.after.Contains($ExpectedText)
  } while ((-not $changed -or -not $expected) -and [DateTime]::UtcNow -lt $deadline)
  if (-not $changed) { Fail 'no target text change was observed' }
  if (-not [string]::IsNullOrEmpty($ExpectedText) -and -not $artifact.after.Contains($ExpectedText)) { Fail 'target changed, but expected readback was absent' }
  $artifact.status = 'VERIFIED_USER_PHYSICAL_HOTKEY_AND_READBACK'
  Write-Host "PASS: owned target readback verified for PID=$pid HWND=$($artifact.target_hwnd)"
} finally {
  $artifact | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ArtifactPath -Encoding UTF8
  if ($target -and -not $target.HasExited) { Stop-Process -Id $target.Id -Force -ErrorAction SilentlyContinue }
}
