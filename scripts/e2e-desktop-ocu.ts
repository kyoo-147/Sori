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

const NAV_FLOWS: NavExpectation[] = [
  { label: 'Home', expected: ['Sori is ready', 'Simulate Dictation'] },
  { label: 'Transcripts', expected: ['Transcripts Timeline', 'Local voice capture audit log'] },
  { label: 'Vocabulary', expected: ['Vocabulary', 'voice macro expansions'] },
  { label: 'Voice Edit', expected: ['Voice Edit', 'natural edit instructions'] },
  { label: 'Models & Routing', expected: ['Models & Routing', 'Speech-to-Text'] },
  { label: 'Benchmarks', expected: ['Benchmarks', 'p50/p95 latency'] },
  { label: 'Extensions', expected: ['Extensions', 'INSTALLED EXTENSIONS'] },
  { label: 'Privacy', expected: ['Privacy', 'Local Data & Storage Retention'] },
  { label: 'Diagnostics', expected: ['Diagnostics', '11-Point System Integrity Check'] },
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
  if (result.code !== 0) {
    throw new Error(`open-computer-use sequence failed:\n${result.output}`);
  }
  const jsonStart = result.output.indexOf('[');
  if (jsonStart < 0) throw new Error(`open-computer-use did not return JSON:\n${result.output.slice(0, 500)}`);
  return JSON.parse(result.output.slice(jsonStart)) as OcuCallResult[];
}

async function main(): Promise<void> {
  if (process.platform !== 'win32') {
    console.log('Skipping Open Computer Use desktop E2E: current harness only validates the Windows runtime path.');
    return;
  }

  console.log('Building backend daemon and Tauri debug app for Open Computer Use E2E...');
  const daemonBuild = await run('cargo', ['build', '-p', 'sorid']);
  if (daemonBuild.code !== 0) throw new Error('sorid build failed');

  const build = await run('cmd.exe', ['/c', 'npm', '--prefix', 'apps/desktop', 'exec', 'tauri', 'build', '--', '--debug']);
  if (build.code !== 0) throw new Error('Tauri debug build failed');

  const app = desktopBinaryPath();
  if (!existsSync(app)) throw new Error(`desktop binary not found at ${app}`);

  const tmpDir = resolve('.tmp', 'e2e-ocu');
  mkdirSync(tmpDir, { recursive: true });

  const daemon = spawn(resolve('target', 'debug', 'sorid.exe'), [], { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  daemon.stdout.on('data', (chunk) => process.stdout.write(`[sorid] ${chunk}`));
  daemon.stderr.on('data', (chunk) => process.stderr.write(`[sorid] ${chunk}`));

  let appProcess: ChildProcess | null = null;
  try {
    await waitForIpc();
    appProcess = spawn(app, [], { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    appProcess.stdout.on('data', (chunk) => process.stdout.write(`[desktop] ${chunk}`));
    appProcess.stderr.on('data', (chunk) => process.stderr.write(`[desktop] ${chunk}`));
    await waitForWindowTitle('sori-desktop', 'Sori');
    await delay(2_000);

    console.log('Hydrating WebView2 accessibility tree through Open Computer Use...');
    const hydrated = await runOcuSequence([
      { tool: 'get_app_state', args: OCU_STATE_ARGS },
      { tool: 'click', args: { app: 'sori-desktop', x: 100, y: 100 } },
      { tool: 'get_app_state', args: OCU_STATE_ARGS },
    ], tmpDir, 'hydrate');
    let currentState = textFromResult(hydrated[2]);

    assertIncludes(currentState, 'Sori is ready', 'hydrated OCU state');
    assertIncludes(currentState, 'button Transcripts', 'hydrated OCU state');
    assertIncludes(currentState, 'Command Center', 'Windows command bar state');
    if (currentState.includes('Sori Desktop')) {
      throw new Error('Windows desktop UI still renders the old fake titlebar label');
    }

    console.log('Running complete navigation semantic userflow...');
    for (const flow of NAV_FLOWS) {
      const elementIndex = findButtonIndex(currentState, flow.label);
      const results = await runOcuSequence([
        { tool: 'get_app_state', args: OCU_STATE_ARGS },
        { tool: 'click', args: { app: 'sori-desktop', element_index: elementIndex } },
        { tool: 'get_app_state', args: OCU_STATE_ARGS },
      ], tmpDir, `nav-${flow.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`);
      currentState = textFromResult(results[2]);
      for (const expected of flow.expected) {
        assertIncludes(currentState, expected, `${flow.label} screen OCU state`);
      }
      console.log(`- ${flow.label}: ok`);
    }

    const status = await fetch('http://127.0.0.1:17373/ipc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify('Status'),
      signal: AbortSignal.timeout(2_000),
    }).then((response) => response.json()) as { Status?: { running?: boolean } };
    if (status.Status?.running !== true) throw new Error('daemon status was not running during OCU desktop smoke');

    console.log('PASS: Open Computer Use clicked all primary Sori desktop flows and asserted semantic screen state.');
  } finally {
    if (appProcess) await stop(appProcess);
    await stop(daemon);
  }
}

main().catch((error: unknown) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
