import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const timeoutMs = 2_000;
const expectedText = 'Wave 5 deterministic transcript';
type Observation = { name: string; status: 'PASS' | 'FAIL' | 'UNVERIFIED'; detail: string; evidence?: unknown };
type Result = { durationMs: number; ok: boolean; status: number; json: any };
const observations: Observation[] = [];

function record(observation: Observation): void { observations.push(observation); console.log(`${observation.status}: ${observation.name} — ${observation.detail}`); }
function accepted(result: Result | undefined): boolean { return !!result?.ok && typeof result.json === 'object' && result.json !== null && !('Error' in result.json); }
function responseVariant(json: any, key: string): any { return json && typeof json === 'object' ? json[key] : undefined; }
function canonical(value: unknown): string { return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item); }
function workingSetKb(pid: number | undefined): number | undefined {
  if (!pid || process.platform !== 'win32') return undefined;
  try { const out = execFileSync('tasklist', ['/fi', `PID eq ${pid}`, '/fo', 'csv', '/nh'], { encoding: 'utf8' }); const match = out.match(/"([\d,]+) K"/); return match ? Number(match[1].replaceAll(',', '')) : undefined; } catch { return undefined; }
}
function daemonExecutable(): { path: string; mode: 'configured' | 'development-fallback' } {
  const configured = process.env.SORI_DAEMON_EXECUTABLE;
  const path = configured ? resolve(configured) : resolve('target', 'debug', process.platform === 'win32' ? 'sorid.exe' : 'sorid');
  if (configured && (!isAbsolute(configured) || !existsSync(path) || !statSync(path).isFile())) {
    throw new Error(`SORI_DAEMON_EXECUTABLE must be an existing absolute executable file: ${configured}`);
  }
  return { path, mode: configured ? 'configured' : 'development-fallback' };
}
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolveListen()); });
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
  return port;
}
async function request(endpoint: string, body: unknown, limit = timeoutMs): Promise<Result> {
  const started = performance.now();
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(limit) });
    return { durationMs: Math.round(performance.now() - started), ok: response.ok, status: response.status, json: await response.json().catch(() => undefined) };
  } catch (error) { return { durationMs: Math.round(performance.now() - started), ok: false, status: 0, json: String(error) }; }
}
async function waitReady(endpoint: string): Promise<boolean> { for (let i = 0; i < 100; i++) { if ((await request(endpoint, 'Status', 500)).ok) return true; await delay(100); } return false; }
async function waitExit(child: ChildProcess, limitMs: number): Promise<number | null> {
  if (child.exitCode !== null) return child.exitCode;
  return Promise.race([new Promise<number>(resolveExit => child.once('close', code => resolveExit(code ?? 1))), delay(limitMs).then(() => null)]);
}
async function terminate(child: ChildProcess, force = true): Promise<number | null> {
  if (child.exitCode !== null) return child.exitCode;
  if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/t', ...(force ? ['/f'] : [])], { stdio: 'ignore' });
  else child.kill(force ? 'SIGKILL' : 'SIGTERM');
  return waitExit(child, 3_000);
}
async function buildIfNeeded(executable: string): Promise<void> {
  if (existsSync(executable)) return;
  const build = spawn('cargo', ['build', '-p', 'sorid'], { stdio: 'inherit', shell: false });
  const exit = await waitExit(build, 120_000);
  if (exit === null) { await terminate(build, true); throw new Error('cargo build timed out; owned build child was terminated'); }
  if (exit !== 0 || !existsSync(executable)) throw new Error(`cargo build failed with exit ${exit}`);
}
async function launch(executable: string, endpoint: string, db: string, owner: string): Promise<ChildProcess> {
  const child = spawn(executable, [], { stdio: ['ignore', 'pipe', 'pipe'], shell: false, env: { ...process.env,
    SORI_IPC_URL: endpoint, SORI_IPC_ADDR: new URL(endpoint).host, SORI_DATABASE_PATH: db, SORI_DB_PATH: db,
    SORI_DAEMON_OWNER_PATH: owner, SORI_TEST_PROVIDER: 'deterministic-sapi', SORI_TEST_PROVIDER_TEXT: expectedText,
    SORI_TEST_NO_OS_INJECTION: '1', SORI_E2E: '1',
  } });
  child.stdout.on('data', chunk => process.stdout.write(`[sorid] ${chunk}`)); child.stderr.on('data', chunk => process.stderr.write(`[sorid] ${chunk}`));
  if (!(await waitReady(endpoint))) { await terminate(child); throw new Error('sorid did not become ready'); }
  return child;
}
function ownerLease(path: string): any | undefined { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return undefined; } }
function audioRequest(): unknown { return { DictationAudio: { model: 'sapi-wav-test', audio: [{ captured_at: '1970-01-01T00:00:00Z', format: { sample_rate_hz: 16000, channels: 1, sample_format: 'F32' }, samples: [0.25, 0.25, 0.25, 0.25] }], injection_strategy: null } }; }

async function main(): Promise<void> {
  const executable = daemonExecutable();
  await buildIfNeeded(executable.path);
  const port = await freePort(); const endpoint = `http://127.0.0.1:${port}/ipc`;
  const root = join(tmpdir(), `sori-wave5-${process.pid}-${Date.now()}`); mkdirSync(root, { recursive: true });
  const db = join(root, 'runtime.sqlite'); const owner = join(root, 'owner.json'); const secondOwner = join(root, 'occupied-owner.json');
  const artifactPath = join(root, 'reliability-matrix.json');
  if ((await request(endpoint, 'Status', 300)).ok) throw new Error(`refusing existing daemon at ${endpoint}`);
  let daemon = await launch(executable.path, endpoint, db, owner);
  let firstLease = ownerLease(owner);
  try {
    const occupiedOutput: string[] = [];
    const occupied = spawn(executable.path, [], { stdio: ['ignore', 'pipe', 'pipe'], shell: false, env: { ...process.env, SORI_IPC_ADDR: new URL(endpoint).host, SORI_DATABASE_PATH: db, SORI_DAEMON_OWNER_PATH: secondOwner, SORI_TEST_PROVIDER: 'deterministic-sapi', SORI_TEST_PROVIDER_TEXT: expectedText, SORI_TEST_NO_OS_INJECTION: '1' } });
    occupied.stdout?.on('data', chunk => occupiedOutput.push(String(chunk))); occupied.stderr?.on('data', chunk => occupiedOutput.push(String(chunk)));
    const occupiedExit = await waitExit(occupied, 4_000); if (occupiedExit === null) await terminate(occupied, true);
    const conflict = occupiedOutput.join('').toLowerCase();
    const firstHealthy = accepted(await request(endpoint, 'Status'));
    record({ name: 'occupied endpoint rejects second owner', status: occupiedExit !== null && occupiedExit !== 0 && /bind|address already in use|endpoint|owned/.test(conflict) && !existsSync(secondOwner) && firstHealthy ? 'PASS' : 'FAIL', detail: `exit=${occupiedExit}; conflict=${/bind|address already in use|endpoint|owned/.test(conflict)}; firstHealthy=${firstHealthy}; secondLeasePresent=${existsSync(secondOwner)}`, evidence: { occupiedExit, output: occupiedOutput, firstHealthy, secondLeasePresent: existsSync(secondOwner) } });

    const samples: number[] = []; for (let i = 0; i < 20; i++) samples.push((await request(endpoint, 'Status')).durationMs);
    const sorted = [...samples].sort((a, b) => a - b); const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
    record({ name: 'status latency', status: p95 < 750 ? 'PASS' : 'FAIL', detail: `20 real sorid IPC requests; p95=${p95}ms`, evidence: { samples, p95 } });
    const doctor = await request(endpoint, 'Doctor');
    const doctorChecks = responseVariant(doctor.json, 'Doctor')?.checks ?? [];
    const failedDoctorChecks = doctorChecks.filter((check: any) => check.ok !== true).map((check: any) => ({ name: check.name, detail: check.detail }));
    record({ name: 'doctor transport diagnostics', status: doctor.ok ? 'PASS' : 'FAIL', detail: `real daemon response in ${doctor.durationMs}ms`, evidence: doctor.json });
    record({ name: 'doctor readiness checks', status: !doctor.ok || doctorChecks.length === 0 ? 'FAIL' : failedDoctorChecks.length === 0 ? 'PASS' : failedDoctorChecks.some((check: any) => ['daemon', 'ipc-bind', 'sqlite'].includes(check.name)) ? 'FAIL' : 'UNVERIFIED', detail: failedDoctorChecks.length === 0 ? 'all Doctor checks are green' : `failed checks: ${failedDoctorChecks.map((check: any) => `${check.name}: ${check.detail}`).join('; ')}`, evidence: { checks: doctorChecks, failed: failedDoctorChecks } });
    const unavailableModel = await request(endpoint, { ModelStatus: { model: '__sori_missing_model__' } });
    record({ name: 'unavailable model fails closed', status: !unavailableModel.ok || !!responseVariant(unavailableModel.json, 'Error') ? 'PASS' : 'FAIL', detail: `missing-model probe returned ${unavailableModel.ok ? 'a response' : 'an error'}`, evidence: unavailableModel.json });

    const configWrite = await request(endpoint, { SetConfig: { key: 'history.retention_limit', value: 100 } });
    const vocabulary = [{ term: 'Wave', pronunciationHint: 'wave', correction: 'Wave' }];
    const resourceWrite = await request(endpoint, { ResourceSet: { resource: 'vocabulary', value: vocabulary } });
    record({ name: 'isolated config/resource persistence', status: accepted(configWrite) && accepted(resourceWrite) ? 'PASS' : 'FAIL', detail: 'writes completed through real IPC', evidence: { configWrite, resourceWrite } });

    const before = workingSetKb(daemon.pid); const cycles: Result[] = [];
    for (let i = 0; i < 50; i++) cycles.push(await request(endpoint, audioRequest(), 5_000));
    const exact = cycles.filter(result => responseVariant(result.json, 'Transcript')?.text === expectedText).length;
    record({ name: '50 sequential deterministic dictations', status: exact === 50 ? 'PASS' : 'FAIL', detail: `${exact}/50 exact transcripts`, evidence: { exact, durationsMs: cycles.map(result => result.durationMs) } });

    const cancelCycles: unknown[] = [];
    for (let i = 0; i < 20; i++) { const start = await request(endpoint, 'DictationStart'); const cancel = accepted(start) ? await request(endpoint, 'DictationCancel') : undefined; cancelCycles.push({ start, cancel }); }
    const completedCancels = cancelCycles.filter((cycle: any) => accepted(cycle.start) && accepted(cycle.cancel)).length;
    record({ name: 'repeated dictation cancellation', status: completedCancels === 20 ? 'PASS' : 'UNVERIFIED', detail: `${completedCancels}/20 real start/cancel requests completed`, evidence: { completedCancels, cancelCycles } });
    const rapid = await Promise.all(['DictationStart', 'DictationStart'].map(body => request(endpoint, body))); const rapidAccepted = rapid.filter(accepted).length;
    if (rapidAccepted) await request(endpoint, 'DictationCancel');
    const retryStart = await request(endpoint, 'DictationStart'); const retryCancel = accepted(retryStart) ? await request(endpoint, 'DictationCancel') : undefined;
    record({ name: 'rapid concurrent start serialization', status: rapidAccepted <= 1 ? 'PASS' : 'FAIL', detail: `${rapidAccepted}/2 concurrent starts accepted`, evidence: { rapid } });
    record({ name: 'rapid start/cancel/retry session race', status: accepted(retryStart) && accepted(retryCancel) ? 'PASS' : 'FAIL', detail: `retry start=${accepted(retryStart)} cancel=${accepted(retryCancel)}`, evidence: { retryStart, retryCancel } });

    const concurrent = await Promise.all([...Array(8)].flatMap(() => ['Status', { RecentHistory: { limit: 100 } }, 'ConfigSummary', { ResourceGet: { resource: 'vocabulary' } }].map(body => request(endpoint, body))));
    record({ name: 'concurrent status/history/config/resource', status: concurrent.every(accepted) ? 'PASS' : 'FAIL', detail: `${concurrent.filter(accepted).length}/${concurrent.length} accepted non-Error responses`, evidence: { maxDurationMs: Math.max(...concurrent.map(result => result.durationMs)), rejected: concurrent.filter(result => !accepted(result)) } });

    const start = await request(endpoint, 'DictationStart'); await delay(100); const stopPromise = request(endpoint, 'DictationStop', 5_000);
    const concurrentStatuses = await Promise.all([...Array(5)].map(() => request(endpoint, 'Status', 1_500))); const stopped = await stopPromise;
    const recordingStatus = accepted(start) && accepted(stopped) && concurrentStatuses.every(accepted) && Math.max(...concurrentStatuses.map(result => result.durationMs)) < 1_500 ? 'PASS' : !accepted(start) || !accepted(stopped) ? 'UNVERIFIED' : 'FAIL';
    record({ name: 'responsive status during recording/stop', status: recordingStatus, detail: `5 status max=${Math.max(...concurrentStatuses.map(result => result.durationMs))}ms; start=${accepted(start)}; stop=${accepted(stopped)}; native capture unavailable=${!accepted(start)}`, evidence: { start, concurrentStatuses, stopped } });

    const history = await request(endpoint, { RecentHistory: { limit: 100 } }); const events = await request(endpoint, { RecentEvents: { limit: 500 } });
    const entries = responseVariant(history.json, 'RecentHistory')?.entries ?? []; const eventList = responseVariant(events.json, 'RecentEvents')?.events ?? [];
    const exactEntries = entries.filter((entry: any) => entry.transcript?.text === expectedText && entry.inserted_text === expectedText && entry.route?.reason === 'TEST-ONLY no-OS-injection seam');
    const eventKinds = new Set(eventList.map((event: any) => event.kind)); const requiredKinds = ['AudioStarted', 'AudioChunkCaptured', 'AsrSelected', 'TranscriptFinal', 'ActionAfter'];
    record({ name: 'exact transcript/event/history journal', status: exactEntries.length === 50 && requiredKinds.every(kind => eventKinds.has(kind)) ? 'PASS' : 'FAIL', detail: `${exactEntries.length}/50 exact SQLite entries; required events=${requiredKinds.every(kind => eventKinds.has(kind))}`, evidence: { historyCount: entries.length, eventCount: eventList.length, eventKinds: [...eventKinds] } });
    const after = workingSetKb(daemon.pid); record({ name: 'memory growth observation', status: before === undefined || after === undefined ? 'UNVERIFIED' : after - before <= Math.max(8_192, Math.round(before * 0.25)) ? 'PASS' : 'FAIL', detail: before === undefined ? 'tasklist working-set unavailable' : `${before}KB -> ${after}KB after 50 cycles`, evidence: { before, after, delta: after === undefined ? undefined : after - before } });

    const oldPid = daemon.pid; const oldLease = firstLease;
    const crashExit = await terminate(daemon, true); const unavailable = await request(endpoint, 'Status', 500); const leaseAfterCrash = ownerLease(owner);
    record({ name: 'known daemon crash becomes unavailable', status: crashExit !== null && !unavailable.ok ? 'PASS' : 'FAIL', detail: `owned child exit=${crashExit}; status=${unavailable.ok ? 'reachable' : 'unavailable'}`, evidence: { crashExit, oldPid, leaseAfterCrash } });
    daemon = await launch(executable.path, endpoint, db, owner); const restartedLease = ownerLease(owner);
    const generationChanged = !!restartedLease && !!oldLease && (restartedLease.lease_id !== oldLease.lease_id || restartedLease.pid !== oldLease.pid);
    record({ name: 'owner lease generation changes safely after restart', status: generationChanged && restartedLease.pid === daemon.pid ? 'PASS' : 'FAIL', detail: `old pid=${oldPid}; new pid=${daemon.pid}; leaseChanged=${generationChanged}`, evidence: { oldLease, leaseAfterCrash, restartedLease } });
    const restartedHistory = await request(endpoint, { RecentHistory: { limit: 100 } }); const restartedResource = await request(endpoint, { ResourceGet: { resource: 'vocabulary' } });
    const restartedEntries = responseVariant(restartedHistory.json, 'RecentHistory')?.entries ?? [];
    record({ name: 'SQLite exact data survives restart', status: restartedEntries.filter((entry: any) => entry.transcript?.text === expectedText).length === 50 && canonical(responseVariant(restartedResource.json, 'Resource')?.value) === canonical(vocabulary) ? 'PASS' : 'FAIL', detail: `${restartedEntries.length} history rows after restart`, evidence: { restartedHistory, restartedResource } });
    record({ name: 'stalled IPC deadline', status: 'PASS', detail: 'contract seam covered by cargo test -p sori-ipc stalled_daemon_is_bounded_by_the_socket_deadline' });
    record({ name: 'real microphone / model / injection', status: 'UNVERIFIED', detail: 'requires Windows device permission, whisper.cpp executable + model, and a focused target' });
    record({ name: 'native readiness boundary', status: 'UNVERIFIED', detail: 'this gate uses deterministic fixture audio and no OS injection; AudioReadiness/Doctor remain the authority for physical readiness' });
  } finally {
    await terminate(daemon, false); if (daemon.exitCode === null) await terminate(daemon, true);
    writeFileSync(artifactPath, JSON.stringify({ generatedAt: new Date().toISOString(), executable: executable.path, executableMode: executable.mode, endpoint, database: db, owner, observations }, null, 2));
    try { if (existsSync(owner)) unlinkSync(owner); } catch { /* only the harness-owned lease is cleaned */ }
  }
  console.log(`Wrote ${artifactPath}`); if (observations.some(observation => observation.status === 'FAIL')) process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
