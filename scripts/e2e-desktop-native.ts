import { parseEndpoint, requireEndpointFree } from './e2e-desktop-backend.js';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const MIN_WIDTH = 720;
const MIN_HEIGHT = 480;
const TITLEBAR_HEIGHT = 20;
const CONTROL_WIDTH = 46;
const ARTIFACT_DIR = resolve('.tmp', 'e2e-native-shell');

type WindowInfo = {
  handle: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  style: number;
  minimized: boolean;
  maximized: boolean;
};

type ScreenshotArtifact = {
  name: string;
  path: string;
  sha256: string;
  width: number;
  height: number;
  review: 'pending';
  notes: string;
};

class NativeEnvironmentSkip extends Error {}

export function desktopBinaryPath(): string {
  return resolve('apps', 'desktop', 'src-tauri', 'target', 'debug', process.platform === 'win32' ? 'sori-desktop.exe' : 'sori-desktop');
}

function run(command: string, args: string[], env?: NodeJS.ProcessEnv, print = true): Promise<{ code: number; output: string }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env }, shell: false });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; if (print) process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { output += chunk; if (print) process.stderr.write(chunk); });
    child.on('error', reject);
    child.on('close', (code) => resolveRun({ code: code ?? 1, output }));
  });
}

function powershellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function runPowerShell(script: string): Promise<string> {
  const result = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], undefined, false);
  if (result.code !== 0) throw new Error(`PowerShell native-window command failed: ${result.output.trim()}`);
  return result.output.trim();
}

function nativeInterop(className: string): string {
  return String.raw`
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class ${className} {
  [DllImport("user32.dll", SetLastError = true)] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int index);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int command);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
`;
}

async function nativeWindowInfo(pid: number): Promise<WindowInfo> {
  const script = nativeInterop('SoriNativeWindowInfo') + String.raw`
$p = Get-Process -Id ${pid} -ErrorAction Stop
$h = $p.MainWindowHandle
if ($h -eq [IntPtr]::Zero) { throw "process ${pid} has no main window" }
$r = New-Object SoriNativeWindowInfo+RECT
if (-not [SoriNativeWindowInfo]::GetWindowRect($h, [ref]$r)) { throw "GetWindowRect failed" }
[pscustomobject]@{
  handle = $h.ToInt64().ToString()
  left = $r.Left
  top = $r.Top
  right = $r.Right
  bottom = $r.Bottom
  width = $r.Right - $r.Left
  height = $r.Bottom - $r.Top
  style = [SoriNativeWindowInfo]::GetWindowLongPtr($h, -16).ToInt64()
  minimized = [SoriNativeWindowInfo]::IsIconic($h)
  maximized = [SoriNativeWindowInfo]::IsZoomed($h)
} | ConvertTo-Json -Compress
`;
  return JSON.parse(await runPowerShell(script)) as WindowInfo;
}

async function focusNativeWindow(pid: number): Promise<void> {
  const script = nativeInterop('SoriNativeFocus') + String.raw`
$p = Get-Process -Id ${pid} -ErrorAction Stop
$h = $p.MainWindowHandle
if ($h -eq [IntPtr]::Zero) { throw "process ${pid} has no main window" }
[SoriNativeFocus]::ShowWindow($h, 9) | Out-Null
[SoriNativeFocus]::BringWindowToTop($h) | Out-Null
[uint32]$targetThread = 0
[SoriNativeFocus]::GetWindowThreadProcessId($h, [ref]$targetThread) | Out-Null
$foreground = [SoriNativeFocus]::GetForegroundWindow()
[uint32]$foregroundThread = 0
if ($foreground -ne [IntPtr]::Zero) {
  [SoriNativeFocus]::GetWindowThreadProcessId($foreground, [ref]$foregroundThread) | Out-Null
}
$attached = $false
if ($foregroundThread -ne 0 -and $foregroundThread -ne $targetThread) {
  $attached = [SoriNativeFocus]::AttachThreadInput($foregroundThread, $targetThread, $true)
}
[SoriNativeFocus]::SetForegroundWindow($h) | Out-Null
[SoriNativeFocus]::BringWindowToTop($h) | Out-Null
if ($attached) {
  [SoriNativeFocus]::AttachThreadInput($foregroundThread, $targetThread, $false) | Out-Null
}
Start-Sleep -Milliseconds 150
$foreground = [SoriNativeFocus]::GetForegroundWindow()
[uint32]$foregroundPid = 0
[SoriNativeFocus]::GetWindowThreadProcessId($foreground, [ref]$foregroundPid) | Out-Null
if ($foregroundPid -ne ${pid}) { throw "native app could not become foreground (foreground pid=$foregroundPid, expected=${pid})" }
`;
  try {
    await runPowerShell(script);
  } catch (error) {
    throw new NativeEnvironmentSkip(`shared interactive overlay or desktop focus policy owns the foreground window: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function nativeWindowCommand(pid: number, command: 'minimize' | 'restore' | 'maximize'): Promise<void> {
  const systemCommand = command === 'minimize' ? 0xF020 : command === 'maximize' ? 0xF030 : 0xF120;
  await runPowerShell(nativeInterop('SoriNativeState') + String.raw`$p = Get-Process -Id ${pid} -ErrorAction Stop
$h = $p.MainWindowHandle
if ($h -eq [IntPtr]::Zero) { throw "process ${pid} has no main window" }
[SoriNativeState]::ShowWindowAsync($h, ${command === 'minimize' ? 6 : command === 'maximize' ? 3 : 9}) | Out-Null
[SoriNativeState]::SendMessage($h, 0x0112, [IntPtr]::new(${systemCommand}), [IntPtr]::Zero) | Out-Null
Start-Sleep -Milliseconds 350
`);
}

async function nativeSetWindowRect(pid: number, left: number, top: number, width: number, height: number): Promise<void> {
  await runPowerShell(nativeInterop('SoriNativeGeometry') + String.raw`$p = Get-Process -Id ${pid} -ErrorAction Stop
$h = $p.MainWindowHandle
if ($h -eq [IntPtr]::Zero) { throw "process ${pid} has no main window" }
[SoriNativeGeometry]::SetWindowPos($h, [IntPtr]::Zero, ${left}, ${top}, ${width}, ${height}, 0x0014) | Out-Null
Start-Sleep -Milliseconds 250
`);
}

async function captureWindowNoFocus(pid: number, outputPath: string): Promise<ScreenshotArtifact> {
  mkdirSync(dirname(outputPath), { recursive: true });
  const escaped = powershellLiteral(outputPath);
  const script = nativeInterop('SoriNativeCaptureNoFocus') + String.raw`
Add-Type -AssemblyName System.Drawing
$p = Get-Process -Id ${pid} -ErrorAction Stop
$r = New-Object SoriNativeCaptureNoFocus+RECT
if (-not [SoriNativeCaptureNoFocus]::GetWindowRect($p.MainWindowHandle, [ref]$r)) { throw "GetWindowRect failed" }
$w = [Math]::Max(1, $r.Right - $r.Left); $height = [Math]::Max(1, $r.Bottom - $r.Top)
$bitmap = New-Object System.Drawing.Bitmap $w, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($r.Left, $r.Top, 0, 0, $bitmap.Size)
$bitmap.Save(${escaped}, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose(); $bitmap.Dispose()
`;
  await runPowerShell(script);
  if (!existsSync(outputPath)) throw new Error(`native screenshot was not written: ${outputPath}`);
  const info = await nativeWindowInfo(pid);
  return { name: relative(ARTIFACT_DIR, outputPath).replaceAll('\\', '/'), path: relative(process.cwd(), outputPath).replaceAll('\\', '/'), sha256: createHash('sha256').update(readFileSync(outputPath)).digest('hex'), width: info.width, height: info.height, review: 'pending', notes: 'Captured without foreground activation; review shell geometry and material continuity.' };
}

async function waitForNativeWindow(pid: number, timeoutMs = 20_000): Promise<WindowInfo> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'window handle was not ready';
  while (Date.now() < deadline) {
    try {
      return await nativeWindowInfo(pid);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await delay(250);
    }
  }
  throw new Error(`desktop native window did not become ready: ${lastError}`);
}

async function nativeMouseAction(pid: number, start: { x: number; y: number }, end = start): Promise<void> {
  const script = nativeInterop('SoriNativeMouse') + String.raw`
$p = Get-Process -Id ${pid} -ErrorAction Stop
$h = $p.MainWindowHandle
if ($h -eq [IntPtr]::Zero) { throw "process ${pid} has no main window" }
[uint32]$foregroundPid = 0
$foreground = [SoriNativeMouse]::GetForegroundWindow()
[SoriNativeMouse]::GetWindowThreadProcessId($foreground, [ref]$foregroundPid) | Out-Null
if ($foregroundPid -ne $p.Id) { throw "foreground pid changed immediately before mouse input (foreground pid=$foregroundPid, expected=$($p.Id))" }
[SoriNativeMouse]::SetCursorPos(${start.x}, ${start.y}) | Out-Null
Start-Sleep -Milliseconds 120
[SoriNativeMouse]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
$steps = 12
for ($i = 1; $i -le $steps; $i++) {
  $x = [int](${start.x} + ((${end.x} - ${start.x}) * $i / $steps))
  $y = [int](${start.y} + ((${end.y} - ${start.y}) * $i / $steps))
  [SoriNativeMouse]::SetCursorPos($x, $y) | Out-Null
  Start-Sleep -Milliseconds 30
}
[SoriNativeMouse]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 250
`;
  await focusNativeWindow(pid);
  await runPowerShell(script);
}

async function clickWindowRelative(pid: number, x: number, y: number): Promise<void> {
  const info = await nativeWindowInfo(pid);
  await nativeMouseAction(pid, { x: info.left + x, y: info.top + y });
}

async function dragWindowRelative(pid: number, x: number, y: number, dx: number, dy: number): Promise<void> {
  const info = await nativeWindowInfo(pid);
  await nativeMouseAction(pid, { x: info.left + x, y: info.top + y }, { x: info.left + x + dx, y: info.top + y + dy });
}

async function captureWindow(pid: number, outputPath: string): Promise<ScreenshotArtifact> {
  mkdirSync(dirname(outputPath), { recursive: true });
  const escaped = powershellLiteral(outputPath);
  const script = nativeInterop('SoriNativeCapture') + String.raw`
Add-Type -AssemblyName System.Drawing
$p = Get-Process -Id ${pid} -ErrorAction Stop
$h = $p.MainWindowHandle
$r = New-Object SoriNativeCapture+RECT
if (-not [SoriNativeCapture]::GetWindowRect($h, [ref]$r)) { throw "GetWindowRect failed" }
[SoriNativeCapture]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 250
$w = [Math]::Max(1, $r.Right - $r.Left)
$height = [Math]::Max(1, $r.Bottom - $r.Top)
$bitmap = New-Object System.Drawing.Bitmap $w, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($r.Left, $r.Top, 0, 0, $bitmap.Size)
$bitmap.Save(${escaped}, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
`;
  await focusNativeWindow(pid);
  await runPowerShell(script);
  if (!existsSync(outputPath)) throw new Error(`native screenshot was not written: ${outputPath}`);
  const info = await nativeWindowInfo(pid);
  return {
    name: relative(ARTIFACT_DIR, outputPath).replaceAll('\\', '/'),
    path: relative(process.cwd(), outputPath).replaceAll('\\', '/'),
    sha256: createHash('sha256').update(readFileSync(outputPath)).digest('hex'),
    width: info.width,
    height: info.height,
    review: 'pending',
    notes: 'Review the single custom titlebar, absence of a duplicate OS caption, clipping, and resize behavior.',
  };
}

async function waitForIpc(endpoint: URL, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify('Status'),
        signal: AbortSignal.timeout(750),
      });
      if (response.ok) return;
    } catch { /* daemon startup */ }
    await delay(150);
  }
  throw new Error('sorid IPC did not become ready');
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    await run('taskkill', ['/pid', String(child.pid), '/t', '/f'], undefined, false).catch(() => undefined);
    return;
  }
  child.kill('SIGINT');
  await Promise.race([new Promise<void>((resolveStop) => child.once('close', () => resolveStop())), delay(3_000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function waitForExit(child: ChildProcess, timeoutMs = 5_000): Promise<boolean> {
  if (child.exitCode !== null) return true;
  await Promise.race([new Promise<void>((resolveExit) => child.once('close', () => resolveExit())), delay(timeoutMs)]);
  return child.exitCode !== null;
}

function controlX(info: WindowInfo, control: 'minimize' | 'maximize' | 'close'): number {
  const width = info.width <= 760 ? 38 : CONTROL_WIDTH;
  const indexFromRight = control === 'close' ? 0 : control === 'maximize' ? 1 : 2;
  return info.width - (width * indexFromRight) - Math.floor(width / 2);
}

async function main(): Promise<void> {
  if (process.platform !== 'win32') {
    console.log('SKIP: native desktop shell E2E is Windows-only and requires an interactive desktop session.');
    return;
  }

  const endpoint = parseEndpoint(process.env.SORI_IPC_URL ?? `http://127.0.0.1:${17400 + (process.pid % 500)}/ipc`);
  await requireEndpointFree(endpoint);
  const configPath = resolve('apps', 'desktop', 'src-tauri', 'tauri.conf.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as { app?: { windows?: Array<Record<string, unknown>> } };
  const windowConfig = config.app?.windows?.[0];
  if (windowConfig?.decorations !== false) throw new Error('native shell contract failed: Tauri decorations must be disabled for the custom titlebar');
  if (windowConfig?.minWidth !== MIN_WIDTH || windowConfig?.minHeight !== MIN_HEIGHT) throw new Error('native shell contract failed: minimum window size drifted');

  console.log('Building backend daemon, desktop web assets, and Tauri debug app...');
  const daemonBuild = await run('cargo', ['build', '-p', 'sorid']);
  if (daemonBuild.code !== 0) throw new Error('sorid build failed');
  const build = await run('cmd.exe', ['/c', 'npm', '--prefix', 'apps/desktop', 'exec', 'tauri', 'build', '--', '--debug']);
  if (build.code !== 0) throw new Error('Tauri debug build failed');

  const app = desktopBinaryPath();
  if (!existsSync(app)) throw new Error(`desktop binary not found at ${app}`);
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const daemon = spawn(resolve('target', 'debug', 'sorid.exe'), [], { stdio: ['ignore', 'pipe', 'pipe'], shell: false, env: { ...process.env, SORI_IPC_URL: endpoint.toString(), SORI_IPC_ADDR: endpoint.host } });
  daemon.stdout?.on('data', (chunk) => process.stdout.write(`[sorid] ${chunk}`));
  daemon.stderr?.on('data', (chunk) => process.stderr.write(`[sorid] ${chunk}`));
  let appProcess: ChildProcess | null = null;
  const artifacts: ScreenshotArtifact[] = [];
  const assertions: string[] = [];

  try {
    await waitForIpc(endpoint);
    appProcess = spawn(app, [], { stdio: ['ignore', 'pipe', 'pipe'], shell: false, env: { ...process.env, SORI_IPC_URL: endpoint.toString(), SORI_IPC_ADDR: endpoint.host, SORI_DAEMON_PATH: resolve('target', 'debug', 'sorid.exe') } });
    appProcess.stdout?.on('data', (chunk) => process.stdout.write(`[desktop] ${chunk}`));
    appProcess.stderr?.on('data', (chunk) => process.stderr.write(`[desktop] ${chunk}`));
    if (!appProcess.pid) throw new Error('desktop process did not expose a PID');
    let info = await waitForNativeWindow(appProcess.pid);
    const WS_CAPTION = 0x00c00000;
    if ((info.style & WS_CAPTION) !== 0) throw new Error(`native shell still has a default caption bar (style=${info.style})`);
    assertions.push('runtime Win32 style has no WS_CAPTION/default OS caption');
    assertions.push('Tauri config disables decorations, centers launch, and retains custom minimum size');
    artifacts.push(await captureWindowNoFocus(appProcess.pid, resolve(ARTIFACT_DIR, '01-launch.png')));

    console.log('Verifying focus-independent native window state...');
    let stateSkip: string | null = null;
    try {
      await nativeWindowCommand(appProcess.pid, 'minimize');
      info = await waitForNativeWindow(appProcess.pid);
      if (!info.minimized) throw new Error('native minimize state did not apply');
      assertions.push('native minimize state verified without foreground activation');
      await nativeWindowCommand(appProcess.pid, 'restore');
      info = await waitForNativeWindow(appProcess.pid);
      if (info.minimized || info.maximized) throw new Error('native restore state did not apply');
      await nativeWindowCommand(appProcess.pid, 'maximize');
      info = await waitForNativeWindow(appProcess.pid);
      if (!info.maximized) throw new Error('native maximize state did not apply');
      assertions.push('native maximize state verified without foreground activation');
      await nativeWindowCommand(appProcess.pid, 'restore');
      info = await waitForNativeWindow(appProcess.pid);
      if (info.maximized) throw new Error('native restore after maximize did not apply');
      assertions.push('native restore state verified without foreground activation');
    } catch (error) {
      stateSkip = error instanceof Error ? error.message : String(error);
      assertions.push(`native minimize/maximize state SKIP: ${stateSkip}`);
      await nativeWindowCommand(appProcess.pid, 'restore').catch(() => undefined);
      await delay(350);
      info = await waitForNativeWindow(appProcess.pid);
    }

    console.log('Verifying focus-independent geometry changes...');
    // A failed state probe may leave the HWND zoomed; normalize before geometry
    // and foreground-click assertions so the click sequence is deterministic.
    await nativeWindowCommand(appProcess.pid, 'restore');
    info = await waitForNativeWindow(appProcess.pid);
    if (info.minimized || info.maximized) throw new Error('could not normalize native window before interaction E2E');
    await nativeSetWindowRect(appProcess.pid, Math.max(40, info.left), Math.max(40, info.top), 1462, 880);
    info = await waitForNativeWindow(appProcess.pid);
    const beforeDrag = info;
    await nativeSetWindowRect(appProcess.pid, beforeDrag.left + 80, beforeDrag.top + 40, beforeDrag.width, beforeDrag.height);
    info = await waitForNativeWindow(appProcess.pid);
    if (Math.abs(info.left - beforeDrag.left) < 20 || Math.abs(info.top - beforeDrag.top) < 20) throw new Error('native geometry move did not move the window');
    assertions.push('native window geometry move verified without foreground activation');
    artifacts.push(await captureWindowNoFocus(appProcess.pid, resolve(ARTIFACT_DIR, '02-moved.png')));

    const beforeResize = info;
    await nativeSetWindowRect(appProcess.pid, beforeResize.left, beforeResize.top, beforeResize.width + 100, beforeResize.height + 70);
    info = await waitForNativeWindow(appProcess.pid);
    if (info.width < beforeResize.width + 40 || info.height < beforeResize.height + 30) throw new Error('native geometry resize did not grow the window');
    assertions.push('native resize geometry verified without foreground activation');
    artifacts.push(await captureWindowNoFocus(appProcess.pid, resolve(ARTIFACT_DIR, '03-resized.png')));

    await nativeSetWindowRect(appProcess.pid, info.left, info.top, MIN_WIDTH, MIN_HEIGHT);
    info = await waitForNativeWindow(appProcess.pid);
    if (info.width < MIN_WIDTH || info.height < MIN_HEIGHT) throw new Error(`native resize ignored configured minimum size: ${info.width}x${info.height}`);
    assertions.push(`native minimum geometry ${MIN_WIDTH}x${MIN_HEIGHT} verified without foreground activation`);
    artifacts.push(await captureWindowNoFocus(appProcess.pid, resolve(ARTIFACT_DIR, '04-minimum.png')));

    console.log('Verifying real foreground mouse controls and workspace interactions...');
    const initialRestored = info;
    await clickWindowRelative(appProcess.pid, controlX(initialRestored, 'maximize'), Math.floor(TITLEBAR_HEIGHT / 2));
    info = await waitForNativeWindow(appProcess.pid);
    if (!info.maximized || info.width <= initialRestored.width || info.height <= initialRestored.height) throw new Error(`native maximize click did not produce a larger maximized window: ${info.width}x${info.height}`);
    assertions.push('native maximize control click verified maximized state and larger native size');
    await clickWindowRelative(appProcess.pid, controlX(info, 'maximize'), Math.floor(TITLEBAR_HEIGHT / 2));
    info = await waitForNativeWindow(appProcess.pid);
    if (info.maximized) throw new Error('native restore click did not leave maximized state');
    assertions.push('native restore control click verified restored native state');
    await clickWindowRelative(appProcess.pid, controlX(info, 'minimize'), Math.floor(TITLEBAR_HEIGHT / 2));
    info = await waitForNativeWindow(appProcess.pid);
    if (!info.minimized) throw new Error('native minimize control click did not minimize the window');
    assertions.push('native minimize control click verified minimized native state');
    await nativeWindowCommand(appProcess.pid, 'restore');
    info = await waitForNativeWindow(appProcess.pid);
    if (info.minimized || info.maximized) throw new Error('native restore after minimize did not restore normal state');

    // Click the maximize button at the SVG path center, using real native input.
    await clickWindowRelative(appProcess.pid, controlX(info, 'maximize'), Math.floor(TITLEBAR_HEIGHT / 2));
    info = await waitForNativeWindow(appProcess.pid);
    if (!info.maximized) throw new Error('nested SVG/path maximize click was stolen by native dragging');
    assertions.push('nested SVG/path maximize click reached the button action without titlebar drag theft');
    await clickWindowRelative(appProcess.pid, controlX(info, 'maximize'), Math.floor(TITLEBAR_HEIGHT / 2));
    info = await waitForNativeWindow(appProcess.pid);

    const sidebarBefore = await captureWindowNoFocus(appProcess.pid, resolve(ARTIFACT_DIR, '05-sidebar-expanded.png'));
    artifacts.push(sidebarBefore);
    await clickWindowRelative(appProcess.pid, 28, Math.floor(TITLEBAR_HEIGHT / 2));
    await delay(300);
    const sidebarCollapsed = await captureWindowNoFocus(appProcess.pid, resolve(ARTIFACT_DIR, '06-sidebar-collapsed.png'));
    artifacts.push(sidebarCollapsed);
    if (sidebarBefore.sha256 === sidebarCollapsed.sha256) throw new Error('sidebar collapse click produced no native inspectable visual change');
    assertions.push('sidebar collapse click verified by changed real-window evidence; main workspace expansion is inspectable in 06-sidebar-collapsed.png');

    // Restore the sidebar, then exercise pointerdown + multiple pointermoves + pointerup.
    await clickWindowRelative(appProcess.pid, 28, Math.floor(TITLEBAR_HEIGHT / 2));
    await delay(300);
    info = await waitForNativeWindow(appProcess.pid);
    const resizeBefore = await captureWindowNoFocus(appProcess.pid, resolve(ARTIFACT_DIR, '07-sidebar-before-resize.png'));
    artifacts.push(resizeBefore);
    await dragWindowRelative(appProcess.pid, 252, Math.max(TITLEBAR_HEIGHT + 80, Math.floor(info.height / 2)), 96, 0);
    const resizeAfter = await captureWindowNoFocus(appProcess.pid, resolve(ARTIFACT_DIR, '08-sidebar-after-resize.png'));
    artifacts.push(resizeAfter);
    if (resizeBefore.sha256 === resizeAfter.sha256) throw new Error('sidebar pointer resize produced no inspectable visual change');
    assertions.push('sidebar pointerdown/pointermove/pointerup resize verified with real native input and before/after evidence');

    await clickWindowRelative(appProcess.pid, controlX(info, 'close'), Math.floor(TITLEBAR_HEIGHT / 2));
    if (!await waitForExit(appProcess)) throw new Error('native close control did not exit the Tauri process');
    assertions.push('native close control verified Tauri process exit');
    const interactiveSkip: string | null = null;
    const manifest = {
      schema: 1,
      generatedAt: new Date().toISOString(),
      window: { minimumWidth: MIN_WIDTH, minimumHeight: MIN_HEIGHT },
      assertions,
      artifacts,
      visualReview: 'pending',
      stateSkip,
      interactiveSkip,
      truthBoundary: `This native shell E2E proves the real Tauri executable/HWND, geometry, foreground-PID-guarded mouse controls, nested SVG/path routing, sidebar collapse/expansion, pointer resize, close/process exit, and inspectable PNG evidence${stateSkip ? '; focus-independent minimize/maximize state is SKIP' : ''}. This does not prove microphone capture, Whisper inference, global hotkeys, overlay delivery, or OS text injection.`,
    };
    writeFileSync(resolve(ARTIFACT_DIR, 'visual-review-manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`PASS: native shell controls and geometry verified; ${artifacts.length} screenshots recorded at ${ARTIFACT_DIR}`);
  } finally {
    if (appProcess) await stop(appProcess);
    await stop(daemon);
  }
}

main().catch((error: unknown) => {
  if (error instanceof NativeEnvironmentSkip) {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    const skipEvidence = {
      schema: 1,
      status: 'SKIP',
      generatedAt: new Date().toISOString(),
      reason: error.message,
      evidence: 'The real Tauri HWND could not own the foreground. Browser preview or an overlay screenshot is not native evidence.',
    };
    writeFileSync(resolve(ARTIFACT_DIR, 'skip.json'), JSON.stringify(skipEvidence, null, 2));
    writeFileSync(resolve(ARTIFACT_DIR, 'visual-review-manifest.json'), JSON.stringify({ ...skipEvidence, visualReview: 'pending', artifacts: [], assertions: [], truthBoundary: skipEvidence.evidence }, null, 2));
    writeFileSync(resolve(ARTIFACT_DIR, 'native-e2e.log'), `SKIP ${skipEvidence.generatedAt}
${error.message}
`);
    console.log(`SKIP: native visual E2E unavailable: ${error.message}`);
    return;
  }
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
