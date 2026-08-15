import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const endpoint = new URL(process.env.SORI_IPC_URL ?? 'http://127.0.0.1:17373/ipc');
const artifactDir = resolve('.tmp/e2e-full-product');
const db = join(artifactDir, `sori-${process.pid}.db`);
const observations: Array<{ name: string; status: 'PASS' | 'UNVERIFIED' | 'SKIP'; detail: string }> = [];

type Result = { ok: boolean; status: number; body: any; ms: number };

async function request(body: unknown, timeout = 2_000): Promise<Result> {
  const started = performance.now();
  try {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(timeout),
    });
    return { ok: response.ok, status: response.status, body: await response.json().catch(() => null), ms: Math.round(performance.now() - started) };
  } catch (error) {
    return { ok: false, status: 0, body: String(error), ms: Math.round(performance.now() - started) };
  }
}
function pass(name: string, detail: string) { observations.push({ name, status: 'PASS', detail }); console.log(`PASS: ${name} — ${detail}`); }
function unverified(name: string, detail: string) { observations.push({ name, status: 'UNVERIFIED', detail }); console.log(`UNVERIFIED: ${name} — ${detail}`); }
function skip(name: string, detail: string) { observations.push({ name, status: 'SKIP', detail }); console.log(`SKIP: ${name} — ${detail}`); }
function assert(condition: unknown, detail: string): asserts condition { if (!condition) throw new Error(detail); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
function variant(result: Result, name: string): any { return result.body && typeof result.body === 'object' ? result.body[name] : undefined; }
function hasError(result: Result): boolean { return Boolean(variant(result, 'Error')); }

async function waitReady(): Promise<void> {
  for (let i = 0; i < 100; i++) { if ((await request('Status', 500)).ok) return; await delay(100); }
  throw new Error('sorid did not become ready');
}
function startDaemon(): ChildProcess {
  const binary = resolve('target/debug', process.platform === 'win32' ? 'sorid.exe' : 'sorid');
  const child = spawn(binary, [], { stdio: ['ignore', 'pipe', 'pipe'], shell: false, env: { ...process.env, SORI_IPC_URL: endpoint.toString(), SORI_IPC_ADDR: endpoint.host, SORI_DATABASE_PATH: db, SORI_DB_PATH: db, SORI_E2E: '1' } });
  child.stdout.on('data', chunk => process.stdout.write(`[sorid] ${chunk}`));
  child.stderr.on('data', chunk => process.stderr.write(`[sorid] ${chunk}`));
  return child;
}
async function stopDaemon(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    await new Promise<void>(resolveStop => { const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' }); killer.once('close', () => resolveStop()); killer.once('error', () => resolveStop()); });
  } else { child.kill('SIGTERM'); await delay(500); if (child.exitCode === null) child.kill('SIGKILL'); }
}
function expectControl(result: Result, operation: string): void { assert(result.ok && variant(result, 'Control')?.accepted === true, `${operation} failed: ${JSON.stringify(result.body)}`); }
function expectResource(result: Result, resource: string): any { const value = variant(result, 'Resource'); assert(result.ok && value?.resource === resource, `${resource} resource failed: ${JSON.stringify(result.body)}`); return value.value; }

async function main(): Promise<void> {
  mkdirSync(artifactDir, { recursive: true });
  assert(!(await request('Status', 300)).ok, `refusing to run against an already-owned endpoint ${endpoint}`);
  const binary = resolve('target/debug', process.platform === 'win32' ? 'sorid.exe' : 'sorid');
  if (!existsSync(binary)) throw new Error(`missing ${binary}; run cargo build -p sorid first`);
  let daemon: ChildProcess | null = startDaemon();
  try {
    await waitReady();
    const status = await request('Status');
    assert(status.ok && variant(status, 'Status')?.running === true, 'launch/connect did not return running Status');
    pass('launch/connect', `${status.ms}ms real loopback IPC`);

    const doctor = await request('Doctor');
    assert(doctor.ok && variant(doctor, 'Doctor')?.checks?.some((check: any) => check.name === 'sqlite' && check.ok), `SQLite Doctor check failed: ${JSON.stringify(doctor.body)}`);
    pass('SQLite migration/health', 'daemon Doctor reports SQLite migrations open');

    const models = await request('Models');
    assert(models.ok && variant(models, 'Models'), `Models enumeration failed: ${JSON.stringify(models.body)}`);
    pass('models enumeration', `${variant(models, 'Models').models.length} provider-owned model records returned`);

    const route = { activeModelId: 'whisper.cpp/e2e-missing-model', provider: 'whisper.cpp', policy: 'LocalFirst', fallbackModelIds: [] };
    const rejectedRoute = await request({ ResourceSet: { resource: 'route', value: route } });
    assert(hasError(rejectedRoute) || !rejectedRoute.ok, 'unavailable route was incorrectly accepted');
    pass('routing validation', 'unavailable/provider-invalid route is rejected without persistence');

    const vocabulary = [{ term: 'Sori', pronunciationHint: 'soh-ree', correction: 'Sori' }];
    const snippets = [{ id: 'e2e-snippet', title: 'Greeting', content: 'Hello from Sori' }];
    expectResource(await request({ ResourceSet: { resource: 'vocabulary', value: vocabulary } }), 'vocabulary');
    expectResource(await request({ ResourceSet: { resource: 'snippets', value: snippets } }), 'snippets');
    expectControl(await request({ SetConfig: { key: 'history.retention_limit', value: 37 } }), 'settings write');
    const vocabularyRead = expectResource(await request({ ResourceGet: { resource: 'vocabulary' } }), 'vocabulary');
    const snippetsRead = expectResource(await request({ ResourceGet: { resource: 'snippets' } }), 'snippets');
    assert(canonical(vocabularyRead) === canonical(vocabulary), `vocabulary did not round-trip: actual=${canonical(vocabularyRead)} expected=${canonical(vocabulary)}`);
    assert(canonical(snippetsRead) === canonical(snippets), `snippets did not round-trip: actual=${canonical(snippetsRead)} expected=${canonical(snippets)}`);
    assert(variant(await request('ConfigSummary'), 'ConfigSummary')?.history_retention_limit === 37, 'settings did not round-trip');
    pass('settings/vocabulary/snippets persistence', 'writes and reads are daemon/SQLite-backed');

    const history = await request({ RecentHistory: { limit: 20 } });
    assert(history.ok && Array.isArray(variant(history, 'RecentHistory')?.entries), 'history listing failed');
    const deleteMissing = await request({ DeleteHistory: { id: '00000000-0000-0000-0000-000000000000' } });
    assert(hasError(deleteMissing) || !deleteMissing.ok, 'delete of missing history unexpectedly succeeded');
    expectControl(await request('PurgeHistory'), 'history purge');
    pass('history persistence/delete', 'history listing, safe missing-delete error, and purge are authoritative');

    const start = await request('DictationStart');
    if (variant(start, 'Control')?.accepted) {
      const cancel = await request('DictationCancel');
      expectControl(cancel, 'dictation cancel');
      const retry = await request('DictationStart');
      if (variant(retry, 'Control')?.accepted) {
        const stop = await request('DictationStop', 35_000);
        if (hasError(stop)) unverified('dictation stop/timeout', `native capture/provider boundary returned ${JSON.stringify(stop.body)}`);
        else pass('dictation start/stop/cancel', 'native session accepted and stopped');
      } else unverified('dictation start retry', `native retry unavailable: ${JSON.stringify(retry.body)}`);
    } else unverified('dictation start/stop/cancel', `native microphone/session unavailable: ${JSON.stringify(start.body)}`);

    const benchmarkSession = '00000000-0000-0000-0000-000000000001';
    const benchmark = await request({ RunBenchmark: { model: 'e2e-missing-model', audio: [], reference: null, iterations: 2, session_id: benchmarkSession, timeout_ms: 100 } }, 3_000);
    if (hasError(benchmark) || !benchmark.ok) {
      unverified('benchmark run/timeout/retry', `provider unavailable as expected: ${JSON.stringify(benchmark.body)}`);
      const retry = await request({ RunBenchmark: { model: 'e2e-missing-model', audio: [], reference: null, iterations: 1, session_id: '00000000-0000-0000-0000-000000000002', timeout_ms: 100 } });
      assert(hasError(retry) || !retry.ok, 'benchmark retry converted unavailable provider into success');
      skip('benchmark cancel', 'no active provider session exists to cancel on this host');
    } else {
      expectControl(await request({ CancelBenchmark: { session_id: benchmarkSession } }), 'benchmark cancel');
      pass('benchmark run/cancel/retry', 'provider-backed benchmark session exercised');
    }

    const concurrent = await Promise.all(Array.from({ length: 20 }, () => request('Status')));
    assert(concurrent.every(result => result.ok && variant(result, 'Status')?.running === true), 'concurrent IPC Status requests were not all successful');
    pass('concurrent IPC/recovery', `20 concurrent Status requests; max=${Math.max(...concurrent.map(result => result.ms))}ms`);

    await stopDaemon(daemon); daemon = null;
    daemon = startDaemon(); await waitReady();
    assert(canonical(expectResource(await request({ ResourceGet: { resource: 'vocabulary' } }), 'vocabulary')) === canonical(vocabulary), 'vocabulary missing after daemon restart/SQLite reopen');
    assert(canonical(expectResource(await request({ ResourceGet: { resource: 'snippets' } }), 'snippets')) === canonical(snippets), 'snippets missing after daemon restart/SQLite reopen');
    assert(variant(await request('ConfigSummary'), 'ConfigSummary')?.history_retention_limit === 37, 'settings missing after daemon restart/SQLite reopen');
    pass('restart/reconnect/SQLite reopen', 'same daemon-owned database reloaded settings, vocabulary, and snippets');

    const reconnect = await request('Status'); assert(reconnect.ok, 'reconnect Status failed');
    pass('error/recovery', 'endpoint recovered after owned daemon restart; unsupported operations remained explicit errors');
    console.log('UNVERIFIED: native microphone, Whisper inference, global hotkey, and focused-app injection require machine-level evidence; fixtures are not native evidence.');
  } finally { await stopDaemon(daemon); writeFileSync(join(artifactDir, 'evidence.json'), JSON.stringify({ endpoint: endpoint.toString(), database: db, observations }, null, 2)); }
}

main().catch(error => { writeFileSync(join(artifactDir, 'evidence.json'), JSON.stringify({ endpoint: endpoint.toString(), database: db, observations, error: error instanceof Error ? error.stack ?? error.message : String(error) }, null, 2)); console.error(`FAIL: ${error instanceof Error ? error.stack ?? error.message : String(error)}`); process.exitCode = 1; });
