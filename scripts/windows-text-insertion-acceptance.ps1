[CmdletBinding()]
param(
  [string]$ArtifactPath = '.tmp/windows-text-insertion-acceptance.json',
  [string]$ProbeExecutable = 'target/debug/examples/windows_direct_edit_probe.exe'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'This acceptance path requires Windows.' }
Add-Type -AssemblyName System.Windows.Forms
$artifactDirectory = Split-Path -Parent $ArtifactPath
if ($artifactDirectory) { New-Item -ItemType Directory -Force -Path $artifactDirectory | Out-Null }

# C# is deliberately limited to owned target/focus/readback/clear helpers. All
# insertion and clipboard transactions run through Sori's Rust example.
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class SoriOwnedEditNative {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint command);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder name, int max);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder text, int max);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr h, uint message, IntPtr w, string text);
  const uint GW_CHILD=5, GW_HWNDNEXT=2, WM_SETTEXT=0x000C;
  public static uint OwnerPid(IntPtr h) { uint pid=0; GetWindowThreadProcessId(h,out pid); return pid; }
  public static bool IsOwned(IntPtr h,int pid) { return h!=IntPtr.Zero && IsWindow(h) && OwnerPid(h)==(uint)pid; }
  public static bool FocusOwned(IntPtr h,int pid) { if(!IsOwned(h,pid)) return false; BringWindowToTop(h); SetForegroundWindow(h); System.Threading.Thread.Sleep(100); return GetForegroundWindow()==h && OwnerPid(h)==(uint)pid; }
  public static IntPtr Edit(IntPtr form) { var child=GetWindow(form,GW_CHILD); while(child!=IntPtr.Zero) { var n=new StringBuilder(128); GetClassName(child,n,n.Capacity); if(n.ToString().Contains("EDIT")) return child; var nested=Edit(child); if(nested!=IntPtr.Zero) return nested; child=GetWindow(child,GW_HWNDNEXT); } return IntPtr.Zero; }
  public static void Clear(IntPtr form) { var edit=Edit(form); if(edit==IntPtr.Zero) throw new InvalidOperationException("owned target has no EDIT child"); SendMessage(edit,WM_SETTEXT,IntPtr.Zero,String.Empty); }
  public static string Read(IntPtr form) { var edit=Edit(form); var b=new StringBuilder(131072); GetWindowText(edit==IntPtr.Zero?form:edit,b,b.Capacity); return b.ToString(); }
}
'@

function Ensure-EditTarget([string]$path) {
  if (Test-Path -LiteralPath $path) { return (Resolve-Path -LiteralPath $path).Path }
  $source = @'
using System; using System.Drawing; using System.Windows.Forms;
public static class SoriOwnedEditTarget {
  [STAThread] public static void Main() { Application.EnableVisualStyles(); var f=new Form { Text=Environment.GetEnvironmentVariable("SORI_EDIT_TARGET_TITLE"), Width=900, Height=500 }; var e=new TextBox { Multiline=true, Dock=DockStyle.Fill, ScrollBars=ScrollBars.Both, Font=new Font("Segoe UI",16), Name="OwnedEdit" }; f.Controls.Add(e); f.Shown+=(s,a)=>e.Focus(); Application.Run(f); }
}
'@
  Add-Type -TypeDefinition $source -OutputAssembly $path -OutputType WindowsApplication -ReferencedAssemblies @('System.Windows.Forms.dll','System.Drawing.dll')
  return (Resolve-Path -LiteralPath $path).Path
}
function Fail([string]$message) { throw "owned text acceptance failed: $message" }
function Assert-Owned($process, [IntPtr]$hwnd) {
  $process.Refresh()
  if ($process.HasExited -or -not [SoriOwnedEditNative]::IsOwned($hwnd,$process.Id)) { Fail "refusing HWND 0x$($hwnd.ToInt64().ToString('x')): process/HWND ownership changed" }
}
function Invoke-SoriProbe([string]$title,[string]$mode,[string]$text) {
  $probePath = (Resolve-Path -LiteralPath $ProbeExecutable).Path
  $output = @(& $probePath $title $mode $text 2>&1)
  if ($LASTEXITCODE -ne 0) { throw (($output | ForEach-Object { $_.ToString() }) -join "`n") }
  return ($output | ForEach-Object { $_.ToString() }) -join "`n"
}

$artifact = [ordered]@{ status='FAILED'; synthesized_input='NOT_PHYSICAL_PROOF'; probe=$ProbeExecutable; cases=@(); ownership=@{}; truth_boundary='Sori Rust WindowsTextInjector/WindowsSendInputAdapter performs every insertion. Synthetic input is not physical hotkey, microphone, ASR, or Sori voice-path proof.' }
$target=$null; $second=$null; $targetHwnd=[IntPtr]::Zero; $secondHwnd=[IntPtr]::Zero
try {
  if (-not (Test-Path -LiteralPath $ProbeExecutable)) { & cargo build -p sori-core --example windows_direct_edit_probe; if($LASTEXITCODE -ne 0){Fail 'could not build windows_direct_edit_probe'} }
  $exe=Ensure-EditTarget (Join-Path (Resolve-Path '.tmp').Path 'sori-owned-edit-target.exe')
  $title="Sori Owned EDIT-$([Guid]::NewGuid().ToString('N'))"; $env:SORI_EDIT_TARGET_TITLE=$title
  $target=Start-Process -FilePath $exe -PassThru
  for($i=0;$i -lt 40;$i++){ $target.Refresh(); if($target.MainWindowHandle -ne 0){$targetHwnd=$target.MainWindowHandle;break}; Start-Sleep -Milliseconds 100 }
  Assert-Owned $target $targetHwnd
  $editHwnd=[SoriOwnedEditNative]::Edit($targetHwnd)
  if($editHwnd -eq [IntPtr]::Zero){Fail 'owned target did not expose a Win32 EDIT control'}
  $artifact.ownership.target_pid=$target.Id; $artifact.ownership.target_hwnd=('0x{0:x}' -f $targetHwnd.ToInt64()); $artifact.ownership.edit_hwnd=('0x{0:x}' -f $editHwnd.ToInt64())
  $cases=@('ASCII Sori',('Unicode: '+[char]0x1ec7+'t '+[char]0x65e5+[char]0x672c+' '+[char]0xd55c+[char]0xad6d+' '+[char]::ConvertFromUtf32(0x1F600)),("multiline one"+[Environment]::NewLine+"two"+[Environment]::NewLine+"three"),'punctuation: !@#$%^&*() [] {} <> ?;:/\\ |',('repeat: '+('abc123'+[char]0x2014) * 256))
  foreach($text in $cases){
    Assert-Owned $target $targetHwnd; [SoriOwnedEditNative]::Clear($targetHwnd)
    if(-not [SoriOwnedEditNative]::FocusOwned($targetHwnd,$target.Id)){Fail 'foreground ownership was lost before Rust direct input'}
    $probeOutput=Invoke-SoriProbe $title 'direct' $text
    Assert-Owned $target $targetHwnd; $observed=[SoriOwnedEditNative]::Read($targetHwnd)
    if($observed -ne $text){Fail "Sori direct readback mismatch (expected $($text.Length), observed $($observed.Length))"}
    $artifact.cases += [ordered]@{strategy='DirectInput';status='PASS';length=$text.Length;probe=$probeOutput}
    # Attempt every case through the real clipboard adapter. Unsupported formats
    # must fail closed; this is never reported as successful insertion.
    [Windows.Forms.Clipboard]::SetText('pre-existing acceptance text')
    if(-not [SoriOwnedEditNative]::FocusOwned($targetHwnd,$target.Id)){Fail 'foreground ownership was lost before Rust clipboard input'}
    [SoriOwnedEditNative]::Clear($targetHwnd)
    try {
      $clipboardOutput=Invoke-SoriProbe $title 'clipboard' $text
      Assert-Owned $target $targetHwnd; $clipboardObserved=[SoriOwnedEditNative]::Read($targetHwnd)
      if($clipboardObserved -ne $text){Fail "Sori clipboard readback mismatch (expected $($text.Length), observed $($clipboardObserved.Length))"}
      if([Windows.Forms.Clipboard]::GetText() -ne 'pre-existing acceptance text'){Fail 'clipboard restore contract failed for pre-existing Unicode text'}
      $artifact.cases += [ordered]@{strategy='ClipboardPaste';status='PASS';length=$text.Length;probe=$clipboardOutput;restored=$true}
    } catch {
      if($_.Exception.Message -match 'clipboard_restore_unsupported'){ $artifact.cases += [ordered]@{strategy='ClipboardPaste';status='UNSUPPORTED';length=$text.Length;detail='adapter failed closed because unrelated clipboard formats cannot be preserved losslessly'} }
      else { throw }
    }
  }
  $second=Start-Process -FilePath $exe -PassThru
  for($i=0;$i -lt 40;$i++){ $second.Refresh(); if($second.MainWindowHandle -ne 0){$secondHwnd=$second.MainWindowHandle;break}; Start-Sleep -Milliseconds 100 }
  Assert-Owned $second $secondHwnd; if(-not [SoriOwnedEditNative]::FocusOwned($secondHwnd,$second.Id)){Fail 'second owned EDIT could not become foreground'}
  if([SoriOwnedEditNative]::OwnerPid([SoriOwnedEditNative]::GetForegroundWindow()) -eq [uint32]$target.Id){Fail 'target-switch guard failed'}
  $artifact.ownership.target_switch='PASS: no input attempted while second owned target was foreground'
  $stale=$targetHwnd; $stalePid=$target.Id; Stop-Process -Id $target.Id -Force; $target=$null; Start-Sleep -Milliseconds 200
  if([SoriOwnedEditNative]::IsOwned($stale,$stalePid)){Fail 'stale HWND remained owned after target disappearance'}
  $artifact.ownership.disappearance='PASS: original HWND rejected after process exit'; $artifact.status='VERIFIED'
} catch { $artifact.error=$_.Exception.Message; throw } finally {
  $artifact | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ArtifactPath -Encoding UTF8
  if($target -and -not $target.HasExited){Stop-Process -Id $target.Id -Force -ErrorAction SilentlyContinue}
  if($second -and -not $second.HasExited){Stop-Process -Id $second.Id -Force -ErrorAction SilentlyContinue}
  Remove-Item Env:SORI_EDIT_TARGET_TITLE -ErrorAction SilentlyContinue
}
Write-Host "PASS: Sori-owned Win32 EDIT insertion/readback matrix; evidence $ArtifactPath"
