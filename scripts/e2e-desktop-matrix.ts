import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const OCU_PACKAGE = 'open-computer-use@0.3.1';
const OCU_STATE = { app: 'sori-desktop', text_limit: 1600, max_tree_nodes: 5000 };
const VIEWPORTS = ['Desktop', 'Tablet', 'Mobile'] as const;
const STATES = [
  { name: 'empty', control: 'Empty', expected: 'No Transcripts Yet' },
  { name: 'loading', control: 'Loading', expected: 'Normal' },
  { name: 'error', control: 'Error', expected: 'Could not load local history database' },
] as const;

type OcuResult = { result?: { content?: Array<{ type: string; text?: string }> } };
type Artifact = { viewport: string; state: string; path: string; sha256: string; review: 'pending'; notes: string };

function run(command: string, args: string[], print = true): Promise<{ code: number; output: string }> {
  return new Promise((done, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false, env: process.env });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; if (print) process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { output += chunk; if (print) process.stderr.write(chunk); });
    child.on('error', reject);
    child.on('close', (code) => done({ code: code ?? 1, output }));
  });
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    await run('taskkill', ['/pid', String(child.pid), '/t', '/f'], false).catch(() => undefined);
  } else {
    child.kill('SIGINT');
    await Promise.race([new Promise<void>((r) => child.once('close', () => r())), delay(3000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}

function text(result: OcuResult | undefined): string {
  return result?.result?.content?.filter((item) => item.type === 'text').map((item) => item.text ?? '').join('\n') ?? '';
}

function buttonIndex(state: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = state.match(new RegExp(`\\n\\s*(\\d+) button ${escaped}(?: Secondary Actions| Frame|$)`));
  if (!match?.[1]) throw new Error(`OCU could not find semantic button: ${label}`);
  return match[1];
}

async function ocu(calls: Array<{ tool: string; args: Record<string, unknown> }>, dir: string, name: string): Promise<OcuResult[]> {
  mkdirSync(dir, { recursive: true });
  const callsPath = resolve(dir, `${name}.calls.json`);
  writeFileSync(callsPath, JSON.stringify(calls, null, 2));
  const command = process.platform === 'win32' ? 'cmd.exe' : 'npx';
  const args = process.platform === 'win32'
    ? ['/c', 'npx', '-y', OCU_PACKAGE, 'call', '--calls-file', callsPath]
    : ['-y', OCU_PACKAGE, 'call', '--calls-file', callsPath];
  const result = await run(command, args, false);
  writeFileSync(resolve(dir, `${name}.raw.txt`), result.output);
  if (result.code !== 0) throw new Error(`OCU failed; see ${name}.raw.txt`);
  const start = result.output.indexOf('[');
  if (start < 0) throw new Error(`OCU returned no JSON; see ${name}.raw.txt`);
  const parsed = JSON.parse(result.output.slice(start)) as OcuResult[];
  writeFileSync(resolve(dir, `${name}.results.json`), JSON.stringify(parsed, null, 2));
  return parsed;
}

async function captureWindow(outputPath: string): Promise<string> {
  mkdirSync(dirname(outputPath), { recursive: true });
  const escaped = outputPath.replace(/'/g, "''");
  const script = String.raw`
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public class MatrixCapture { [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); public struct RECT { public int Left; public int Top; public int Right; public int Bottom; } }
"@
$p = Get-Process sori-desktop -ErrorAction Stop | Select-Object -First 1
$r = New-Object MatrixCapture+RECT
[MatrixCapture]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
[MatrixCapture]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 200
$w = [Math]::Max(1, $r.Right - $r.Left); $h = [Math]::Max(1, $r.Bottom - $r.Top)
$b = New-Object System.Drawing.Bitmap $w, $h; $g = [System.Drawing.Graphics]::FromImage($b)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, $b.Size); $b.Save('${escaped}', [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose()
`;
  const result = await run('powershell.exe', ['-NoProfile', '-Command', script], false);
  if (result.code !== 0 || !existsSync(outputPath)) throw new Error(`screenshot capture failed: ${outputPath}`);
  return createHash('sha256').update(readFileSync(outputPath)).digest('hex');
}

async function waitForDaemon(): Promise<void> {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:17373/ipc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify('Status'), signal: AbortSignal.timeout(700) });
      if (response.ok) return;
    } catch { /* startup */ }
    await delay(150);
  }
  throw new Error('sorid IPC did not become ready');
}

async function main(): Promise<void> {
  if (process.platform !== 'win32') {
    console.log('SKIP: desktop matrix requires Windows Tauri, WebView2, and an interactive desktop session.');
    return;
  }
  const stale = await fetch('http://127.0.0.1:17373/ipc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify('Status'), signal: AbortSignal.timeout(400) }).catch(() => null);
  if (stale?.ok) throw new Error('refusing matrix: stale daemon already owns 127.0.0.1:17373');

  const build = await run('cargo', ['build', '-p', 'sorid']);
  if (build.code !== 0) throw new Error('sorid build failed');
  const desktopBuild = await run('cmd.exe', ['/c', 'npm', '--prefix', 'apps/desktop', 'exec', 'tauri', 'build', '--', '--debug']);
  if (desktopBuild.code !== 0) throw new Error('Tauri debug build failed');

  const artifactDir = resolve('.tmp', 'e2e-matrix');
  mkdirSync(artifactDir, { recursive: true });
  const daemon = spawn(resolve('target', 'debug', 'sorid.exe'), [], { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  daemon.stdout.on('data', (chunk) => process.stdout.write(`[sorid] ${chunk}`));
  daemon.stderr.on('data', (chunk) => process.stderr.write(`[sorid] ${chunk}`));
  let app: ChildProcess | undefined;
  const artifacts: Artifact[] = [];
  try {
    await waitForDaemon();
    app = spawn(resolve('apps', 'desktop', 'src-tauri', 'target', 'debug', 'sori-desktop.exe'), [], { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    await delay(3500);
    let state = '';
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const hydrated = await ocu([{ tool: 'get_app_state', args: OCU_STATE }, { tool: 'click', args: { app: 'sori-desktop', x: 100, y: 100 } }, { tool: 'get_app_state', args: OCU_STATE }], artifactDir, `initial-${attempt}`);
      state = text(hydrated[2]);
      if (state.includes('Command Center') && state.includes('Sori preview')) break;
      await delay(750);
    }
    if (!state.includes('Command Center') || !state.includes('Sori preview')) throw new Error('semantic hydration did not expose the real desktop UI');

    for (const viewport of VIEWPORTS) {
      const index = buttonIndex(state, `${viewport} preview`);
      state = text((await ocu([{ tool: 'get_app_state', args: OCU_STATE }, { tool: 'click', args: { app: 'sori-desktop', element_index: index } }, { tool: 'get_app_state', args: OCU_STATE }], artifactDir, `viewport-${viewport.toLowerCase()}`))[2]);
      if (!state.includes(`${viewport === 'Desktop' ? 'Command Center' : 'Command Center'}`)) throw new Error(`${viewport} viewport lost semantic shell`);
      const path = resolve(artifactDir, `viewport-${viewport.toLowerCase()}-normal.png`);
      artifacts.push({ viewport, state: 'normal', path, sha256: await captureWindow(path), review: 'pending', notes: 'Review shell proportions, clipping, and hierarchy.' });
    }

    state = text((await ocu([{ tool: 'get_app_state', args: OCU_STATE }, { tool: 'click', args: { app: 'sori-desktop', element_index: buttonIndex(state, 'Transcripts') } }, { tool: 'get_app_state', args: OCU_STATE }], artifactDir, 'navigate-transcripts'))[2]);
    if (!state.includes('Transcripts Timeline')) throw new Error('semantic navigation did not reach Transcripts');
    for (const fixture of STATES) {
      state = text((await ocu([{ tool: 'get_app_state', args: OCU_STATE }, { tool: 'click', args: { app: 'sori-desktop', element_index: buttonIndex(state, fixture.control) } }, { tool: 'get_app_state', args: OCU_STATE }], artifactDir, `state-${fixture.name}`))[2]);
      if (!state.includes(fixture.expected)) throw new Error(`${fixture.name} state did not expose expected semantic copy`);
      const path = resolve(artifactDir, `viewport-mobile-${fixture.name}.png`);
      artifacts.push({ viewport: 'Mobile', state: fixture.name, path, sha256: await captureWindow(path), review: 'pending', notes: 'Review state clarity and recovery affordance.' });
    }

    state = text((await ocu([{ tool: 'get_app_state', args: OCU_STATE }, { tool: 'click', args: { app: 'sori-desktop', element_index: buttonIndex(state, 'Error') } }, { tool: 'get_app_state', args: OCU_STATE }], artifactDir, 'destructive-error'))[2]);
    if (!state.includes('Could not load local history database')) throw new Error('error/destructive recovery state was not reachable');
    state = text((await ocu([{ tool: 'get_app_state', args: OCU_STATE }, { tool: 'click', args: { app: 'sori-desktop', element_index: buttonIndex(state, 'Diagnostics') } }, { tool: 'get_app_state', args: OCU_STATE }], artifactDir, 'navigate-diagnostics'))[2]);
    const injectionIndex = buttonIndex(state, 'Test Text Injection');
    state = text((await ocu([{ tool: 'get_app_state', args: OCU_STATE }, { tool: 'click', args: { app: 'sori-desktop', element_index: injectionIndex } }, { tool: 'get_app_state', args: OCU_STATE }], artifactDir, 'unsupported-injection-action'))[2]);
    if (!state.includes('Text injection is not wired in this preview; no payload was delivered.')) throw new Error('unsafe injection action did not remain explicitly unsupported');
    const restartIndex = buttonIndex(state, 'Restart Daemon (`sorid`) — not wired');
    state = text((await ocu([{ tool: 'get_app_state', args: OCU_STATE }, { tool: 'click', args: { app: 'sori-desktop', element_index: restartIndex } }, { tool: 'get_app_state', args: OCU_STATE }], artifactDir, 'unsupported-restart-action'))[2]);
    if (!state.includes('Daemon restart is not wired in this preview.')) throw new Error('destructive restart action did not remain explicitly unsupported');
    const status = await fetch('http://127.0.0.1:17373/ipc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify('Status') }).then((r) => r.json()) as { Status?: { running?: boolean } };
    if (status.Status?.running !== true) throw new Error('daemon was not running throughout desktop matrix');

    const manifest = { schema: 1, generatedAt: new Date().toISOString(), truthBoundary: 'This matrix proves daemon IPC, semantic desktop UI, responsive preview controls, and rendered states only; it does not prove microphone, Whisper, hotkey, overlay, or OS text injection.', artifacts };
    writeFileSync(resolve(artifactDir, 'visual-review-manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`PASS: desktop matrix captured ${artifacts.length} screenshot artifacts; visual review manifest is pending human review at ${artifactDir}/visual-review-manifest.json`);
  } finally {
    if (app) await stop(app);
    await stop(daemon);
  }
}

main().catch((error: unknown) => { console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
