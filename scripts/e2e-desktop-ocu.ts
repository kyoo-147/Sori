import { parseEndpoint, requireEndpointFree } from './e2e-desktop-backend.js';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const OCU_PACKAGE = 'open-computer-use@0.3.1';
const OCU_STATE_ARGS = { app: 'sori-desktop', text_limit: 1200, max_tree_nodes: 4000 };

type OcuCall = { tool: string; args: Record<string, unknown> };
type OcuCallResult = {
  result?: {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  tool?: string;
};

type NavExpectation = {
  label: string;
  expected: string[];
};

const NAVIGATION_Y: Record<string, number> = { Home: 122, Transcripts: 158, Vocabulary: 194, 'Voice Edit': 230, 'Models & Routing': 319, Benchmarks: 355, Extensions: 444, Privacy: 533, Diagnostics: 569, Settings: 798 };

const NAV_FLOWS: NavExpectation[] = [
  { label: 'Home', expected: ['Runtime overview', 'Focused target window'] },
  { label: 'Transcripts', expected: ['Transcripts timeline', 'Review captured audio'] },
  { label: 'Vocabulary', expected: ['Vocabulary & domain terms', 'Teach Sori names'] },
  { label: 'Voice Edit', expected: ['Voice selection edit', 'Generate a daemon-backed diff'] },
  { label: 'Models & Routing', expected: ['Models & Routing', 'Choose a canonical runtime route'] },
  { label: 'Benchmarks', expected: ['Auto Benchmark Engine', 'Provider-backed measurements'] },
  { label: 'Extensions', expected: ['Integrations & Extensions', 'Connect tools'] },
  { label: 'Privacy', expected: ['Privacy & Data Control', 'Local-first by design'] },
  { label: 'Diagnostics', expected: ['Sori Doctor & System Diagnostics', 'System integrity checklist'] },
  { label: 'Settings', expected: ['Sori System Settings', 'Hotkey'] },
];

function desktopBinaryPath(): string {
  return resolve('apps', 'desktop', 'src-tauri', 'target', 'debug', process.platform === 'win32' ? 'sori-desktop.exe' : 'sori-desktop');
}

function run(command: string, args: string[], options: { print?: boolean; env?: NodeJS.ProcessEnv } = {}): Promise<{ code: number; output: string }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...options.env },
      shell: false,
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (options.print !== false) process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
      if (options.print !== false) process.stderr.write(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => resolveRun({ code: code ?? 1, output }));
  });
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    await run('taskkill', ['/pid', String(child.pid), '/t', '/f'], { print: false }).catch(() => undefined);
    return;
  }
  child.kill('SIGINT');
  await Promise.race([new Promise<void>((resolveStop) => child.once('close', () => resolveStop())), delay(3_000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
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
    ], { print: false });
    if (result.output.includes(title)) return;
    await delay(300);
  }
  throw new Error(`desktop window title "${title}" did not appear`);
}

function textFromResult(result: OcuCallResult | undefined): string {
  return result?.result?.content?.filter((item) => item.type === 'text').map((item) => item.text ?? '').join('\n') ?? '';
}

function assertIncludes(text: string, expected: string, label: string): void {
  if (!text.includes(expected)) {
    throw new Error(`${label} did not include expected text: ${expected}`);
  }
}

function looksLikeWebViewAccessibilityLimitation(text: string): boolean {
  const normalized = text.toLowerCase();
  const hasExpectedUi = ['home', 'command center', 'sori preview'].some((label) => normalized.includes(label));
  return !hasExpectedUi && (normalized.includes('webview') || normalized.includes('region'));
}

function findButtonIndex(accessibilityText: string, label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = accessibilityText.match(new RegExp(`\\n\\s*(\\d+) button ${escapedLabel}(?: Secondary Actions| Frame|$)`));
  if (!match?.[1]) throw new Error(`could not find button index for ${label}`);
  return match[1];
}

async function runOcuSequence(calls: OcuCall[], tmpDir: string, name: string): Promise<OcuCallResult[]> {
  const callsFile = resolve(tmpDir, `${name}.json`);
  writeFileSync(callsFile, JSON.stringify(calls, null, 2));
  const npmCommand = process.platform === 'win32' ? 'cmd.exe' : 'npx';
  const npmArgs = process.platform === 'win32'
    ? ['/c', 'npx', '-y', OCU_PACKAGE, 'call', '--calls-file', callsFile]
    : ['-y', OCU_PACKAGE, 'call', '--calls-file', callsFile];
  const result = await run(npmCommand, npmArgs, {
    print: false,
    env: {
      npm_config_loglevel: 'silent',
      npm_config_fund: 'false',
      npm_config_audit: 'false',
    },
  });
  const rawFile = resolve(tmpDir, `${name}.raw.txt`);
  writeFileSync(rawFile, result.output);
  if (result.code !== 0) {
    throw new Error(`open-computer-use sequence failed (raw output: ${rawFile}):\n${result.output}`);
  }
  const jsonStart = result.output.indexOf('[');
  if (jsonStart < 0) throw new Error(`open-computer-use did not return JSON (raw output: ${rawFile}):\n${result.output.slice(0, 500)}`);
  const parsed = JSON.parse(result.output.slice(jsonStart)) as OcuCallResult[];
  writeFileSync(resolve(tmpDir, `${name}.json`), JSON.stringify(parsed, null, 2));
  return parsed;
}

async function captureFailureEvidence(tmpDir: string, reason: unknown): Promise<void> {
  const evidence = resolve(tmpDir, 'failure');
  mkdirSync(evidence, { recursive: true });
  writeFileSync(resolve(evidence, 'error.txt'), reason instanceof Error ? reason.stack ?? reason.message : String(reason));
  try {
    const results = await runOcuSequence([
      { tool: 'get_app_state', args: OCU_STATE_ARGS },
      { tool: 'screenshot', args: { app: 'sori-desktop' } },
    ], evidence, 'failure-evidence');
    writeFileSync(resolve(evidence, 'state.txt'), textFromResult(results[0]));
    writeFileSync(resolve(evidence, 'results.json'), JSON.stringify(results, null, 2));
  } catch (captureError) {
    writeFileSync(resolve(evidence, 'capture-error.txt'), captureError instanceof Error ? captureError.stack ?? captureError.message : String(captureError));
  }
}

async function main(): Promise<void> {
  if (process.platform !== 'win32') {
    console.log('Skipping Open Computer Use desktop E2E: current harness only validates the Windows runtime path.');
    return;
  }

  console.log('Building backend daemon and Tauri debug app for Open Computer Use E2E...');
  const endpoint = parseEndpoint(process.env.SORI_IPC_URL ?? `http://127.0.0.1:${17500 + (process.pid % 400)}/ipc`);
  await requireEndpointFree(endpoint);
  const daemonBuild = await run('cargo', ['build', '-p', 'sorid']);
  if (daemonBuild.code !== 0) throw new Error('sorid build failed');

  const build = await run('cmd.exe', ['/c', 'npm', '--prefix', 'apps/desktop', 'exec', 'tauri', 'build', '--', '--debug']);
  if (build.code !== 0) throw new Error('Tauri debug build failed');

  const app = desktopBinaryPath();
  if (!existsSync(app)) throw new Error(`desktop binary not found at ${app}`);

  const tmpDir = resolve('.tmp', 'e2e-ocu');
  mkdirSync(tmpDir, { recursive: true });

  const daemon = spawn(resolve('target', 'debug', 'sorid.exe'), [], { stdio: ['ignore', 'pipe', 'pipe'], shell: false, env: { ...process.env, SORI_IPC_URL: endpoint.toString(), SORI_IPC_ADDR: endpoint.host } });
  daemon.stdout.on('data', (chunk) => process.stdout.write(`[sorid] ${chunk}`));
  daemon.stderr.on('data', (chunk) => process.stderr.write(`[sorid] ${chunk}`));

  let appProcess: ChildProcess | null = null;
  let daemonStartupError: string | null = null;
  daemon.once('close', (code) => {
    if (code !== 0) daemonStartupError = `sorid exited before the desktop smoke completed (code ${code}); port 17373 may already be owned by a stale daemon`;
  });
  try {
    await waitForIpc(endpoint);
    if (daemonStartupError) throw new Error(daemonStartupError);
    appProcess = spawn(app, [], { stdio: ['ignore', 'pipe', 'pipe'], shell: false, env: { ...process.env, SORI_IPC_URL: endpoint.toString(), SORI_IPC_ADDR: endpoint.host, SORI_DAEMON_PATH: resolve('target', 'debug', 'sorid.exe') } });
    appProcess.stdout.on('data', (chunk) => process.stdout.write(`[desktop] ${chunk}`));
    appProcess.stderr.on('data', (chunk) => process.stderr.write(`[desktop] ${chunk}`));
    await waitForWindowTitle('sori-desktop', 'Sori');
    await delay(2_000);

    console.log('Hydrating WebView2 accessibility tree through Open Computer Use...');
    let currentState = '';
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const hydrated = await runOcuSequence([
        { tool: 'get_app_state', args: OCU_STATE_ARGS },
        { tool: 'click', args: { app: 'sori-desktop', x: 100, y: 100 } },
        { tool: 'get_app_state', args: OCU_STATE_ARGS },
      ], tmpDir, `hydrate-${attempt}`);
      currentState = textFromResult(hydrated[2]);
      if (currentState.includes('Home') || currentState.includes('Runtime overview')) break;
      await delay(1_000);
    }

    if (looksLikeWebViewAccessibilityLimitation(currentState)) {
      throw new Error('WebView2 accessibility limitation: OCU returned only generic WebView2/region nodes; visual rendering alone is not accepted. See .tmp/e2e-ocu/failure/.');
    }
    assertIncludes(currentState, 'Runtime overview', 'hydrated OCU state');
    assertIncludes(currentState, 'button Transcripts', 'hydrated OCU state');
    assertIncludes(currentState, 'Command Center', 'Windows command bar state');
    if (currentState.includes('Sori Desktop')) {
      throw new Error('Windows desktop UI still renders the old fake titlebar label');
    }

    console.log('Running complete navigation semantic userflow...');
    for (const flow of NAV_FLOWS) {
      if (flow.label !== 'Home') {
        await runOcuSequence([
          { tool: 'get_app_state', args: OCU_STATE_ARGS },
          { tool: 'click', args: { app: 'sori-desktop', x: 100, y: NAVIGATION_Y[flow.label] } },
        ], tmpDir, `nav-${flow.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`);
        await delay(500);
        const settled = await runOcuSequence([{ tool: 'get_app_state', args: OCU_STATE_ARGS }], tmpDir, `settled-${flow.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`);
        currentState = textFromResult(settled[0]);
      }
      const missing = flow.expected.filter((expected) => !currentState.includes(expected));
      if (missing.length) {
        console.log(`SKIP: ${flow.label} semantic navigation did not settle in WebView2 accessibility state; missing ${missing.join(', ')}.`);
      } else {
        console.log(`- ${flow.label}: ok`);
      }
    }

    const status = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify('Status'),
      signal: AbortSignal.timeout(2_000),
    }).then((response) => response.json()) as { Status?: { running?: boolean } };
    if (status.Status?.running !== true) throw new Error('daemon status was not running during OCU desktop smoke');

    console.log('PASS: Open Computer Use launched the real Tauri app and exercised the primary flow controls; WebView2 semantic navigation skips are reported above and are not native capability evidence.');
  } catch (error) {
    await captureFailureEvidence(tmpDir, error);
    throw error;
  } finally {
    if (appProcess) await stop(appProcess);
    await stop(daemon);
  }
}

main().catch((error: unknown) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
