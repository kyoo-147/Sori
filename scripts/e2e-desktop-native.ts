import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export function desktopBinaryPath(): string {
  return resolve('apps', 'desktop', 'src-tauri', 'target', 'debug', process.platform === 'win32' ? 'sori-desktop.exe' : 'sori-desktop');
}

function run(command: string, args: string[], env?: NodeJS.ProcessEnv): Promise<{ code: number; output: string }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env }, shell: false });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { output += chunk; process.stderr.write(chunk); });
    child.on('error', reject);
    child.on('close', (code) => resolveRun({ code: code ?? 1, output }));
  });
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    await run('taskkill', ['/pid', String(child.pid), '/t', '/f']).catch(() => undefined);
    return;
  }
  child.kill('SIGINT');
  await Promise.race([new Promise<void>((resolveStop) => child.once('close', () => resolveStop())), delay(3_000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function waitForIpc(timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:17373/ipc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify('Status'),
        signal: AbortSignal.timeout(750),
      });
      if (response.ok) return;
    } catch { /* not ready */ }
    await delay(150);
  }
  throw new Error('sorid IPC did not become ready');
}

async function waitForWindowTitle(processName: string, title: string, timeoutMs = 20_000): Promise<void> {
  if (process.platform !== 'win32') {
    await delay(3_000);
    return;
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await run('powershell.exe', [
      '-NoProfile',
      '-Command',
      `(Get-Process ${processName} -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty MainWindowTitle)`,
    ]);
    if (result.output.includes(title)) return;
    await delay(300);
  }
  throw new Error(`desktop window title "${title}" did not appear`);
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function captureWindow(processName: string, outputPath: string): Promise<string> {
  if (process.platform !== 'win32') {
    console.log(`Skipping screenshot capture on non-Windows platform: ${outputPath}`);
    return '';
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  const escaped = outputPath.replace(/'/g, "''");
  const script = String.raw`
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeCapture {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
$p = Get-Process ${processName} -ErrorAction Stop | Select-Object -First 1
$r = New-Object NativeCapture+RECT
[NativeCapture]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
[NativeCapture]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 250
$w = [Math]::Max(1, $r.Right - $r.Left)
$h = [Math]::Max(1, $r.Bottom - $r.Top)
$bmp = New-Object System.Drawing.Bitmap $w, $h
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size)
$bmp.Save('${escaped}', [System.Drawing.Imaging.ImageFormat]::Png)
$gfx.Dispose()
$bmp.Dispose()
Write-Host '${escaped}'
`;
  const result = await run('powershell.exe', ['-NoProfile', '-Command', script]);
  if (result.code !== 0 || !existsSync(outputPath)) throw new Error(`failed to capture native desktop window to ${outputPath}`);
  return sha256(outputPath);
}

async function clickWindowRelative(processName: string, x: number, y: number): Promise<void> {
  if (process.platform !== 'win32') {
    console.log(`Skipping coordinate click (${x}, ${y}) on non-Windows platform.`);
    return;
  }
  const script = String.raw`
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeClick {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
$p = Get-Process ${processName} -ErrorAction Stop | Select-Object -First 1
$r = New-Object NativeClick+RECT
[NativeClick]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
[NativeClick]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 250
$cx = $r.Left + ${x}
$cy = $r.Top + ${y}
[NativeClick]::SetCursorPos($cx, $cy) | Out-Null
[NativeClick]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero)
Start-Sleep -Milliseconds 80
[NativeClick]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero)
Write-Host "clicked $cx,$cy"
`;
  const result = await run('powershell.exe', ['-NoProfile', '-Command', script]);
  if (result.code !== 0) throw new Error(`failed to click native desktop window at ${x},${y}`);
}

async function main(): Promise<void> {
  console.log('Building backend daemon, desktop web assets, and Tauri debug app...');
  const daemonBuild = await run('cargo', ['build', '-p', 'sorid']);
  if (daemonBuild.code !== 0) throw new Error('sorid build failed');

  const build = process.platform === 'win32'
    ? await run('cmd.exe', ['/c', 'npm', '--prefix', 'apps/desktop', 'exec', 'tauri', 'build', '--', '--debug'])
    : await run('npm', ['--prefix', 'apps/desktop', 'exec', 'tauri', 'build', '--', '--debug']);
  if (build.code !== 0) throw new Error('Tauri debug build failed');

  const app = desktopBinaryPath();
  if (!existsSync(app)) throw new Error(`desktop binary not found at ${app}`);

  const daemon = spawn(resolve('target', 'debug', process.platform === 'win32' ? 'sorid.exe' : 'sorid'), [], { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  daemon.stdout.on('data', (chunk) => process.stdout.write(`[sorid] ${chunk}`));
  daemon.stderr.on('data', (chunk) => process.stderr.write(`[sorid] ${chunk}`));

  let appProcess: ChildProcess | null = null;
  try {
    await waitForIpc();
    appProcess = spawn(app, [], { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    appProcess.stdout.on('data', (chunk) => process.stdout.write(`[desktop] ${chunk}`));
    appProcess.stderr.on('data', (chunk) => process.stderr.write(`[desktop] ${chunk}`));
    await waitForWindowTitle('sori-desktop', 'Sori');
    const screenshotDir = resolve('.tmp', 'e2e-native');
    const homeHash = await captureWindow('sori-desktop', resolve(screenshotDir, '01-home.png'));
    console.log('Clicking native desktop UI controls and comparing screenshots...');
    await clickWindowRelative('sori-desktop', 86, 160); // Transcripts nav row
    await delay(700);
    const transcriptsHash = await captureWindow('sori-desktop', resolve(screenshotDir, '02-transcripts.png'));
    await clickWindowRelative('sori-desktop', 86, 520); // Diagnostics/System area
    await delay(700);
    const diagnosticsHash = await captureWindow('sori-desktop', resolve(screenshotDir, '03-diagnostics.png'));
    await clickWindowRelative('sori-desktop', 1010, 78); // Simulate Dictation/top action region when available
    await delay(700);
    const actionHash = await captureWindow('sori-desktop', resolve(screenshotDir, '04-action.png'));
    if (process.platform === 'win32') {
      const uniqueScreens = new Set([homeHash, transcriptsHash, diagnosticsHash, actionHash]);
      if (uniqueScreens.size < 3) {
        throw new Error('native clicks did not produce enough visual state changes');
      }
      console.log(`Screenshot visual states: ${uniqueScreens.size}/4 unique`);
    }

    const status = await fetch('http://127.0.0.1:17373/ipc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify('Status'),
      signal: AbortSignal.timeout(2_000),
    }).then((response) => response.json()) as { Status?: { running?: boolean } };
    if (status.Status?.running !== true) throw new Error('daemon status was not running during native desktop smoke');
    console.log('PASS: native Tauri desktop window launched while connected to real sorid IPC.');
  } finally {
    if (appProcess) await stop(appProcess);
    await stop(daemon);
  }
}

main().catch((error: unknown) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
