import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { NativeIpcTransport, RuntimeClient } from '../apps/desktop/src/runtime-client.js';
import { binaryPath, parseEndpoint, requireEndpointFree, waitForEndpoint } from './e2e-desktop-backend.js';

/**
 * Product glue acceptance: exercise the exact RuntimeClient -> Tauri command
 * DTO (the invoke adapter below) -> real loopback sorid -> SQLite response.
 * The adapter is intentionally tiny and only stands in for Tauri's invoke;
 * rendered React/native-window acceptance remains `npm run e2e:product` and
 * `npm run e2e:desktop-native`.
 */
const endpoint = parseEndpoint();
const artifactDir = resolve('.tmp', 'e2e-native-bridge');
const evidencePath = join(artifactDir, `${process.pid}.json`);
const observations: Array<{ name: string; status: 'PASS' | 'UNVERIFIED'; detail: string }> = [];

function pass(name: string, detail: string) { observations.push({ name, status: 'PASS', detail }); console.log(`PASS: ${name} — ${detail}`); }
function unverified(name: string, detail: string) { observations.push({ name, status: 'UNVERIFIED', detail }); console.log(`UNVERIFIED: ${name} — ${detail}`); }
function assert(condition: unknown, detail: string): asserts condition { if (!condition) throw new Error(detail); }

async function invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
  assert(command === 'sori_ipc', `unexpected native command: ${command}`);
  assert(typeof args?.request_id === 'string' && String(args.request_id).startsWith('ui-'), 'Tauri request id was dropped');
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args?.request), signal: AbortSignal.timeout(2_000) });
  if (!response.ok) throw new Error(`loopback IPC HTTP ${response.status}`);
  return response.json();
}

function startDaemon(db: string): ChildProcess {
  const child = spawn(binaryPath('sorid'), [], { stdio: ['ignore', 'pipe', 'pipe'], shell: false, env: { ...process.env, SORI_IPC_URL: endpoint.toString(), SORI_IPC_ADDR: `${endpoint.hostname}:${endpoint.port || '80'}`, SORI_DATABASE_PATH: db, SORI_DB_PATH: db, SORI_E2E: '1' } });
  child.stdout.on('data', (chunk) => process.stdout.write(`[sorid] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[sorid] ${chunk}`));
  return child;
}
async function waitForEndpointDown(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { await fetch(endpoint, { method: 'POST', body: JSON.stringify('Status'), signal: AbortSignal.timeout(100) }); }
    catch { return; }
    await delay(50);
  }
  throw new Error(`owned daemon endpoint remained reachable after shutdown: ${endpoint}`);
}
async function stopDaemon(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    await new Promise<void>((done) => { const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' }); killer.once('close', () => done()); killer.once('error', () => done()); });
  } else { child.kill('SIGTERM'); await delay(500); if (child.exitCode === null) child.kill('SIGKILL'); }
  for (let attempt = 0; attempt < 40 && child.exitCode === null; attempt += 1) await delay(50);
  await waitForEndpointDown();
}

async function main(): Promise<void> {
  mkdirSync(artifactDir, { recursive: true });
  await requireEndpointFree(endpoint);
  assert(existsSync(binaryPath('sorid')), `missing ${binaryPath('sorid')}; run cargo build -p sorid first`);
  const db = join(artifactDir, `sori-${process.pid}.db`);
  const native = new NativeIpcTransport(invoke, () => true);
  const client = new RuntimeClient(native);
  let daemon: ChildProcess | null = startDaemon(db);
  try {
    assert(await waitForEndpoint(endpoint), 'real sorid did not become ready');
    const status = await client.status();
    assert(status.error === null && status.source === 'native' && status.data.daemon === 'running', `native status DTO failed: ${JSON.stringify(status)}`);
    pass('React RuntimeClient -> Tauri DTO -> loopback IPC', 'native source and running daemon response verified');

    const configWrite = await client.setConfig('history.retention_limit', 37);
    assert(configWrite.error === null && configWrite.data.accepted, `config write failed: ${JSON.stringify(configWrite)}`);
    const config = await client.configSummary();
    assert(config.error === null && config.data?.history_retention_limit === 37, `config response field was dropped: ${JSON.stringify(config)}`);
    pass('SQLite response and DTO field preservation', 'daemon-owned setting round-tripped through RuntimeClient');

    const failedAudio = await client.dictationAudio('whisper.cpp/e2e-missing-model', [], 'DirectInput');
    assert(failedAudio.error !== null && failedAudio.source === 'unavailable', 'provider/model/audio failure became fake success');
    unverified('fixture dictation', `real daemon reported expected unavailable provider/model: ${failedAudio.error}`);

    const statuses = await Promise.all(Array.from({ length: 12 }, () => client.status()));
    assert(statuses.every((result) => result.error === null && result.data.daemon === 'running'), 'concurrent native bridge requests were not stable');
    pass('concurrent requests', '12 RuntimeClient calls completed via the native bridge');

    await stopDaemon(daemon); daemon = null;
    daemon = startDaemon(db);
    assert(await waitForEndpoint(endpoint), 'daemon did not reconnect after owned restart');
    const restored = await client.configSummary();
    assert(restored.error === null && restored.data?.history_retention_limit === 37, 'SQLite state was not restored after reconnect');
    pass('daemon restart/reconnect', 'RuntimeClient recovered and SQLite state remained authoritative');
  } finally {
    await stopDaemon(daemon);
    writeFileSync(evidencePath, JSON.stringify({ endpoint: endpoint.toString(), database: db, observations }, null, 2));
  }
}

main().catch((error) => { writeFileSync(evidencePath, JSON.stringify({ endpoint: endpoint.toString(), observations, error: error instanceof Error ? error.stack ?? error.message : String(error) }, null, 2)); console.error(`FAIL: ${error instanceof Error ? error.stack ?? error.message : String(error)}`); process.exitCode = 1; });
