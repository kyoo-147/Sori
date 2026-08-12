import { createServer, request as httpRequest, type Server } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

import { DEFAULT_IPC_URL, binaryPath, parseEndpoint, requireEndpointFree, waitForEndpoint } from './e2e-desktop-backend.js';

export const PRODUCT_NAVIGATION = [
  { label: 'Home', expected: ['Sori is ready to help', 'Focused target window'] },
  { label: 'Transcripts', expected: ['Transcripts timeline', 'Review captured audio'] },
  { label: 'Vocabulary', expected: ['Vocabulary & domain terms', 'Teach Sori names'] },
  { label: 'Voice Edit', expected: ['Voice selection edit', 'Review the parsed instruction'] },
  { label: 'Models & Routing', expected: ['Models & Routing', 'Choose where Sori processes speech'] },
  { label: 'Benchmarks', expected: ['Auto Benchmark Engine', 'Benchmark test execution'] },
  { label: 'Extensions', expected: ['Integrations & Extensions', 'Extension runtime is not installed'] },
  { label: 'Privacy', expected: ['Privacy & Data Control', 'Local data & retention'] },
  { label: 'Diagnostics', expected: ['Sori Doctor & System Diagnostics', 'System integrity checklist'] },
  { label: 'Settings', expected: ['Settings', 'Sori System Settings'] },
  { label: 'First-Run Setup', expected: ['First Run Setup', 'Get ready to speak into any window'] },
] as const;

export const UNVERIFIED_HARDWARE_CAPABILITIES = [
  'global hotkey',
  'physical microphone capture',
  'Whisper model inference',
  'focused-app text injection',
] as const;

type RunResult = { code: number; output: string };

function run(command: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<RunResult> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
      shell: false,
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { output += chunk; process.stderr.write(chunk); });
    child.on('error', reject);
    child.on('close', (code) => resolveRun({ code: code ?? 1, output }));
  });
}

function commandArgs(command: string, args: string[]): [string, string[]] {
  return process.platform === 'win32' ? ['cmd.exe', ['/c', command, ...args]] : [command, args];
}

async function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<RunResult> {
  const [executable, executableArgs] = commandArgs(command, args);
  return run(executable, executableArgs, env);
}

async function stop(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    await runCommand('taskkill', ['/pid', String(child.pid), '/t', '/f']).catch(() => undefined);
    return;
  }
  child.kill('SIGINT');
  await Promise.race([
    new Promise<void>((resolveStop) => child.once('close', () => resolveStop())),
    delay(3_000),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

function start(command: string, args: string[], env: NodeJS.ProcessEnv = {}): ChildProcess {
  const [executable, executableArgs] = commandArgs(command, args);
  const child = spawn(executable, executableArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
    shell: false,
  });
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return child;
}

async function waitForHttp(url: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(750) });
      if (response.ok) return;
    } catch { /* the dev server is not ready yet */ }
    await delay(150);
  }
  throw new Error(`HTTP server did not become ready: ${url}`);
}

function startSameOriginProxy(endpoint: URL, vitePort: number, proxyPort: number): Server {
  const server = createServer((incoming, outgoing) => {
    const isIpc = new URL(incoming.url ?? '/', `http://${incoming.headers.host ?? '127.0.0.1'}`).pathname === endpoint.pathname;
    const target = isIpc
      ? endpoint
      : new URL(incoming.url ?? '/', `http://127.0.0.1:${vitePort}`);
    const headers = { ...incoming.headers, host: target.host };
    const upstream = httpRequest(target, { method: incoming.method, headers }, (response) => {
      if (!isIpc && target.pathname === '/') {
        let html = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { html += chunk; });
        response.on('end', () => {
          const injected = html.replace('<head>', '<head><script>window.fetch=window.fetch.bind(window);</script>');
          const responseHeaders = { ...response.headers };
          delete responseHeaders['content-length'];
          outgoing.writeHead(response.statusCode ?? 502, responseHeaders);
          outgoing.end(injected);
        });
        return;
      }
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });
    upstream.on('error', (error) => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end(String(error));
    });
    incoming.pipe(upstream);
  });
  server.listen(proxyPort, '127.0.0.1');
  return server;
}

async function stopServer(server: Server | null): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
}

function browserEnv(session: string): NodeJS.ProcessEnv {
  return {
    CHROME_DEVTOOLS_AXI_SESSION: session,
    CHROME_DEVTOOLS_AXI_USER_DATA_DIR: resolve('.tmp', `${session}-profile`),
  };
}

async function browser(args: string[], session: string): Promise<string> {
  const [command, commandLine] = commandArgs('chrome-devtools-axi', args);
  const result = await run(command, commandLine, browserEnv(session));
  if (result.code !== 0) throw new Error(`chrome-devtools-axi ${args[0] ?? ''} failed: ${result.output.trim()}`);
  return result.output;
}

function uidFor(snapshot: string, role: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const line = snapshot.split('\n').find((candidate) => new RegExp(` ${role} "${escaped}\\s*"(?: |$)`).test(candidate));
  const uid = line?.match(/uid=(\S+)/)?.[1];
  if (!uid) throw new Error(`semantic browser snapshot did not expose ${role} "${label}"`);
  return uid;
}

async function clickLabel(snapshot: string, label: string, session: string): Promise<void> {
  await browser(['click', `@${uidFor(snapshot, 'button', label)}`], session);
}

async function snapshot(session: string): Promise<string> {
  return browser(['snapshot'], session);
}

async function waitForText(session: string, expected: string, timeoutMs = 8_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let current = '';
  while (Date.now() < deadline) {
    current = await snapshot(session);
    if (current.includes(expected)) return current;
    await delay(250);
  }
  throw new Error(`semantic browser state did not contain "${expected}"`);
}

async function evalBrowser(session: string, expression: string): Promise<string> {
  const output = await browser(['eval', expression], session);
  return output.match(/^result: (.*)$/m)?.[1]?.trim() ?? output.trim();
}

function assertIncludes(actual: string, expected: string, stage: string): void {
  if (!actual.includes(expected)) throw new Error(`${stage} did not include "${expected}"`);
}

function assertNotIncludes(actual: string, unexpected: string, stage: string): void {
  if (actual.includes(unexpected)) throw new Error(`${stage} unexpectedly included "${unexpected}"`);
}

async function checkBrowserAvailable(session: string): Promise<boolean> {
  try {
    await browser(['start'], session);
    return true;
  } catch (error) {
    console.log(`SKIP: UNVERIFIED desktop semantic E2E; chrome-devtools-axi/Chrome is unavailable (${error instanceof Error ? error.message : String(error)}).`);
    return false;
  }
}

async function runProductGate(): Promise<void> {
  const endpoint = parseEndpoint(process.env.SORI_IPC_URL ?? DEFAULT_IPC_URL);
  await requireEndpointFree(endpoint);

  const session = `sori-product-e2e-${process.pid}`;
  if (!(await checkBrowserAvailable(session))) return;

  const evidenceDir = resolve('.tmp', 'e2e-product-gate', String(process.pid));
  mkdirSync(evidenceDir, { recursive: true });
  const db = join(evidenceDir, 'sori.db');
  const vitePort = Number(process.env.SORI_E2E_WEB_PORT ?? 4173);
  const proxyPort = Number(process.env.SORI_E2E_PROXY_PORT ?? vitePort + 1);
  const webUrl = `http://127.0.0.1:${proxyPort}/`;
  let daemon: ChildProcess | null = null;
  let vite: ChildProcess | null = null;
  let proxy: Server | null = null;

  try {
    const sorid = binaryPath('sorid');
    if (!existsSync(sorid)) {
      const build = await runCommand('cargo', ['build', '-p', 'sorid']);
      if (build.code !== 0 || !existsSync(sorid)) throw new Error('could not build sorid');
    }

    daemon = start(sorid, [], {
      SORI_IPC_URL: endpoint.toString(),
      SORI_IPC_ADDR: endpoint.host,
      SORI_DATABASE_PATH: db,
      SORI_DB_PATH: db,
      SORI_E2E: '1',
    });
    if (!(await waitForEndpoint(endpoint))) throw new Error('real sorid IPC did not become ready');

    vite = start('npm', ['--prefix', 'apps/desktop', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', String(vitePort)], {
      VITE_SORI_IPC_URL: `${webUrl}ipc`,
    });
    await waitForHttp(`http://127.0.0.1:${vitePort}/`);
    proxy = startSameOriginProxy(endpoint, vitePort, proxyPort);
    await waitForHttp(webUrl);

    await browser(['newpage', webUrl], session);
    let state = await waitForText(session, 'Sori is ready to help');
    state = await waitForText(session, 'Backend');
    assertIncludes(state, 'Backend', 'real daemon-backed initial desktop state');
    assertNotIncludes(state, 'Mock fallback', 'real daemon-backed initial desktop state');
    assertIncludes(state, 'Preview only', 'truthful unsupported preview state');

    console.log('PASS: real sorid/backend connection and initial desktop semantic state.');

    // The production shell owns the native window; responsive behavior is exercised by real window resize, not a viewport simulator.
    assertIncludes(state, 'Minimize window', 'native titlebar controls');
    assertIncludes(state, 'Maximize window', 'native titlebar controls');
    assertIncludes(state, 'Close window', 'native titlebar controls');
    assertNotIncludes(state, 'Mobile preview', 'native desktop shell');
    assertNotIncludes(state, 'Tablet preview', 'native desktop shell');
    console.log('PASS: native titlebar controls and no production viewport simulator.');

    // Keep one browser page and one daemon alive while traversing every primary route.
    for (const flow of PRODUCT_NAVIGATION) {
      state = await snapshot(session);
      await clickLabel(state, flow.label, session);
      state = await waitForText(session, flow.expected[0]);
      for (const expected of flow.expected.slice(1)) assertIncludes(state, expected, `${flow.label} semantic screen`);
      if (flow.label === 'Settings' && state.includes('Close settings')) {
        await clickLabel(state, 'Close settings', session);
        await delay(150);
      }
    }
    state = await snapshot(session);
    if (state.includes('Close settings')) {
      await clickLabel(state, 'Close settings', session);
      await delay(150);
    }
    console.log(`PASS: sequential semantic navigation covered ${PRODUCT_NAVIGATION.length} primary screens.`);

    // First Run Setup is a real IPC-aware flow. Hardware-dependent failures remain visible and do not become fake success.
    state = await snapshot(session);
    await clickLabel(state, 'Begin setup', session);
    state = await waitForText(session, 'Check your microphone');
    assertIncludes(state, 'Check microphone', 'first-run setup retryable control');
    assertIncludes(state, 'UNVERIFIED', 'first-run setup capability boundary');
    console.log('PASS: First Run Setup renders truthful microphone/permission/hotkey states; physical hardware remains SKIP/UNVERIFIED.');

    // Resilient transcript states are real controls in the product surface, not source-only assertions.
    state = await snapshot(session);
    await clickLabel(state, 'Transcripts', session);
    state = await waitForText(session, 'Transcripts timeline');
    await clickLabel(state, 'Empty', session);
    state = await waitForText(session, 'No transcripts yet');
    assertNotIncludes(state, 'Transcript details', 'empty transcripts state');
    await clickLabel(state, 'Loading', session);
    const loadingPulseCount = Number(await evalBrowser(session, '() => document.querySelectorAll(".animate-pulse").length'));
    if (loadingPulseCount < 1) throw new Error('loading transcripts state did not render skeleton rows');
    await clickLabel(await snapshot(session), 'Error', session);
    state = await waitForText(session, 'History could not be loaded');
    await clickLabel(state, 'Retry', session);
    state = await waitForText(session, 'No transcripts yet');
    console.log('PASS: empty, loading, error, and retry transcript states.');

    // Destructive state: confirm the explicit DELETE guard, then prove the list is empty.
    await clickLabel(await snapshot(session), 'Privacy', session);
    state = await waitForText(session, 'Privacy & Data Control');
    await clickLabel(state, 'Delete local history', session);
    state = await waitForText(session, 'Delete local history?');
    const confirmUid = uidFor(state, 'textbox', 'DELETE');
    await browser(['fill', `@${confirmUid}`, 'DELETE'], session);
    state = await snapshot(session);
    await clickLabel(state, 'Delete permanently', session);
    state = await waitForText(session, 'History cleared from this UI session.');
    await clickLabel(state, 'Transcripts', session);
    state = await waitForText(session, 'Transcripts timeline');
    assertIncludes(state, 'No transcripts yet', 'post-delete transcript state');
    console.log('PASS: destructive delete confirmation and empty post-delete state.');

    // Unsupported actions must report no side effect instead of claiming hardware success.
    await clickLabel(state, 'Diagnostics', session);
    state = await waitForText(session, 'Sori Doctor & System Diagnostics');
    assertIncludes(state, 'backend', 'real backend diagnostics state');
    await clickLabel(state, 'Run Doctor Check', session);
    state = await waitForText(session, 'UNVERIFIED');
    assertIncludes(state, 'Sori Doctor & System Diagnostics', 'truthful unsupported diagnostics state');
    assertIncludes(state, 'backend', 'truthful unsupported diagnostics state');
    console.log('PASS: unsupported injection/restart actions remain explicitly truthful.');

    const statusResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify('Status'),
      signal: AbortSignal.timeout(2_000),
    });
    if (!statusResponse.ok) throw new Error(`final real daemon status returned HTTP ${statusResponse.status}`);
    const status = await statusResponse.json() as { Status?: { running?: boolean } };
    if (status.Status?.running !== true) throw new Error('real daemon stopped during the product gate');

    console.log(`SKIP: UNVERIFIED hardware/external capability path — ${UNVERIFIED_HARDWARE_CAPABILITIES.join(', ')} require separate machine-level validation.`);
    console.log('PASS: sequential product E2E gate completed with real daemon/backend and semantic desktop coverage.');
  } catch (error) {
    writeFileSync(join(evidenceDir, 'error.txt'), error instanceof Error ? error.stack ?? error.message : String(error));
    try { writeFileSync(join(evidenceDir, 'failure-snapshot.txt'), await snapshot(session)); } catch { /* preserve original failure */ }
    throw error;
  } finally {
    await stopServer(proxy);
    await stop(vite);
    await stop(daemon);
    await browser(['stop'], session).catch(() => undefined);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runProductGate().catch((error: unknown) => {
    console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
