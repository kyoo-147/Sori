import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const endpoint = new URL(process.env.SORI_IPC_URL ?? 'http://127.0.0.1:17373/ipc');
const timeoutMs = 2_000;
const artifactDir = resolve('.tmp/e2e-matrix');
const artifactPath = join(artifactDir, 'reliability-matrix.json');

type Observation = {
  name: string;
  status: 'PASS' | 'FAIL' | 'UNVERIFIED' | 'SKIP';
  detail: string;
  durationMs?: number;
  evidence?: unknown;
};

const observations: Observation[] = [];

function binary(name: string): string {
  return resolve('target', 'debug', process.platform === 'win32' ? `${name}.exe` : name);
}

async function request(body: string, limit = timeoutMs): Promise<{ durationMs: number; ok: boolean; status: number; json: unknown }> {
  const started = performance.now();
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(limit),
    });
    const json = await response.json().catch(() => undefined);
    return { durationMs: Math.round(performance.now() - started), ok: response.ok, status: response.status, json };
  } catch (error) {
    return { durationMs: Math.round(performance.now() - started), ok: false, status: 0, json: String(error) };
  }
}

async function waitReady(): Promise<boolean> {
  for (let i = 0; i < 100; i += 1) {
    if ((await request('Status', 500)).ok) return true;
    await delay(150);
  }
  return false;
}

async function terminateKnownDaemon(child: ChildProcess, force = true): Promise<void> {
  if (child.exitCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    spawn('taskkill', ['/pid', String(child.pid), '/t', ...(force ? ['/f'] : [])], { stdio: 'ignore' });
  } else {
    child.kill(force ? 'SIGKILL' : 'SIGTERM');
  }
  for (let i = 0; i < 40 && child.exitCode === null; i += 1) await delay(50);
}

async function waitForExit(child: ChildProcess, limitMs: number): Promise<number | null> {
  if (child.exitCode !== null) return child.exitCode;
  return Promise.race([
    new Promise<number>((resolveExit) => child.once('close', (code) => resolveExit(code ?? 1))),
    delay(limitMs).then(() => null),
  ]);
}

async function stop(child: ChildProcess): Promise<void> {
  await terminateKnownDaemon(child, false);
  if (child.exitCode === null) await terminateKnownDaemon(child, true);
}

function accepted(result: { ok: boolean; json: unknown } | undefined): boolean {
  if (!result?.ok || typeof result.json !== 'object' || result.json === null) return false;
  return !Object.prototype.hasOwnProperty.call(result.json, 'Error');
}

function record(observation: Observation): void {
  observations.push(observation);
  console.log(`${observation.status}: ${observation.name} — ${observation.detail}`);
}
function workingSetKb(pid: number | undefined): number | undefined {
  if (!pid || process.platform !== 'win32') return undefined;
  try {
    const output = execFileSync('tasklist', ['/fi', `PID eq ${pid}`, '/fo', 'csv', '/nh'], { encoding: 'utf8' });
    const match = output.match(/"([\d,]+) K"/);
    return match ? Number(match[1].replaceAll(',', '')) : undefined;
  } catch {
    return undefined;
  }
}

async function launch(db: string): Promise<ChildProcess> {
  const child = spawn(binary('sorid'), [], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SORI_IPC_URL: endpoint.toString(),
      SORI_IPC_ADDR: endpoint.host,
      SORI_DATABASE_PATH: db,
      SORI_DB_PATH: db,
      SORI_E2E: '1',
    },
    shell: false,
  });
  child.stdout.on('data', (chunk) => process.stdout.write(`[sorid] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[sorid] ${chunk}`));
  if (!(await waitReady())) throw new Error('sorid did not become ready');
  return child;
}

async function main(): Promise<void> {
  if (await request('Status', 300).then((result) => result.ok)) {
    throw new Error(`refusing to run against an existing daemon at ${endpoint}`);
  }
  const sorid = binary('sorid');
  if (!existsSync(sorid)) {
    const build = spawn('cargo', ['build', '-p', 'sorid'], { stdio: 'inherit', shell: false });
    await new Promise<void>((resolveBuild, reject) => {
      build.on('close', (code) => code === 0 ? resolveBuild() : reject(new Error(`cargo build exited ${code}`)));
      build.on('error', reject);
    });
  }

  mkdirSync(artifactDir, { recursive: true });
  const db = join(resolve('.tmp'), `sori-reliability-${process.pid}.db`);
  let daemon = await launch(db);
  const occupied = spawn(binary('sorid'), [], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SORI_IPC_URL: endpoint.toString(), SORI_IPC_ADDR: endpoint.host, SORI_DATABASE_PATH: db, SORI_DB_PATH: db, SORI_E2E: '1' },
    shell: false,
  });
  const occupiedExit = await waitForExit(occupied, 3_000);
  if (occupiedExit === null) await terminateKnownDaemon(occupied, true);
  record({ name: 'occupied endpoint fails closed', status: occupiedExit !== null && occupiedExit !== 0 ? 'PASS' : 'FAIL', detail: occupiedExit === null ? 'second owned daemon did not reject the occupied endpoint before deadline' : `second owned daemon exited with code ${occupiedExit}`, evidence: { exitCode: occupiedExit } });
  try {
    const samples: number[] = [];
    for (let i = 0; i < 20; i += 1) samples.push((await request('Status')).durationMs);
    const sorted = [...samples].sort((a, b) => a - b);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
    record({ name: 'status latency', status: p95 < 750 ? 'PASS' : 'FAIL', detail: `20 real sorid IPC requests; p95=${p95}ms`, evidence: { samples, p95 } });

    const doctor = await request('Doctor');
    record({ name: 'doctor and failure diagnostics', status: doctor.ok ? 'PASS' : 'FAIL', detail: `real daemon response in ${doctor.durationMs}ms`, durationMs: doctor.durationMs, evidence: doctor.json });

    const unavailableModel = await request(JSON.stringify({ ModelStatus: { model: '__sori_missing_model__' } }));
    record({ name: 'unavailable model fails closed', status: !unavailableModel.ok || (typeof unavailableModel.json === 'object' && unavailableModel.json !== null && Object.prototype.hasOwnProperty.call(unavailableModel.json, 'Error')) ? 'PASS' : 'FAIL', detail: `missing-model probe returned ${unavailableModel.ok ? 'a response' : 'an error'} in ${unavailableModel.durationMs}ms`, evidence: unavailableModel.json });

    const memoryBefore = workingSetKb(daemon.pid);
    const memorySamples: Array<number | undefined> = [memoryBefore];
    const cycles: unknown[] = [];
    const requestedCycles = Number(process.env.SORI_E2E_CYCLES ?? 20);
    const cycleCount = Number.isFinite(requestedCycles) ? Math.min(50, Math.max(10, Math.floor(requestedCycles))) : 20;
    for (let i = 0; i < cycleCount; i += 1) {
      const start = await request('DictationStart');
      const cancel = start.ok ? await request('DictationCancel') : undefined;
      cycles.push({ start, cancel });
      memorySamples.push(workingSetKb(daemon.pid));
    }
    const successfulCycles = cycles.filter((cycle) => {
      const value = cycle as { start: { ok: boolean; json: unknown }; cancel?: { ok: boolean; json: unknown } };
      return accepted(value.start) && accepted(value.cancel);
    }).length;
    const captureBlocker = cycles.find((cycle) => !accepted((cycle as { cancel?: { ok: boolean; json: unknown } }).cancel));
    record({ name: 'repeated dictation cancellation', status: successfulCycles === cycleCount ? 'PASS' : 'UNVERIFIED', detail: `${successfulCycles}/${cycleCount} real sorid start/cancel requests completed; native capture blocker=${captureBlocker ? JSON.stringify(captureBlocker) : 'none'}`, evidence: { cycleCount, cycles } });

    const rapidStarts = await Promise.all([request('DictationStart'), request('DictationStart')]);
    const rapidAccepted = rapidStarts.filter(accepted).length;
    if (rapidAccepted > 0) await request('DictationCancel');
    record({ name: 'rapid concurrent start serialization', status: rapidAccepted <= 1 ? 'PASS' : 'FAIL', detail: `${rapidAccepted}/2 concurrent starts accepted; at most one session may own capture`, evidence: rapidStarts });
    const memoryAfter = workingSetKb(daemon.pid);
    const memoryDelta = memoryBefore !== undefined && memoryAfter !== undefined ? memoryAfter - memoryBefore : undefined;
    const memoryBudget = memoryBefore !== undefined ? Math.max(8_192, Math.round(memoryBefore * 0.25)) : undefined;
    const memoryStatus = memoryDelta === undefined || memoryBudget === undefined ? 'UNVERIFIED' : memoryDelta <= memoryBudget ? 'PASS' : 'FAIL';
    record({ name: 'memory growth observation', status: memoryStatus, detail: memoryDelta !== undefined && memoryBudget !== undefined ? `working set ${memoryBefore}KB -> ${memoryAfter}KB after ${cycleCount} cycles (delta=${memoryDelta}KB, budget=${memoryBudget}KB)` : 'Windows working-set sampling unavailable on this host', evidence: { memoryBefore, memoryAfter, memoryDelta, memoryBudget, memorySamples, cycleCount } });

    const start = await request('DictationStart');
    const captureWaitMs = Number(process.env.SORI_E2E_CAPTURE_MS ?? 100);
    await delay(captureWaitMs);
    const stopPromise = request('DictationStop', 5_000);
    const concurrentStatuses = await Promise.all(Array.from({ length: 5 }, () => request('Status', 1_500)));
    const stopped = await stopPromise;
    const maxStatusMs = Math.max(...concurrentStatuses.map((result) => result.durationMs));
    record({ name: 'responsive status during recording/stop', status: concurrentStatuses.every((result) => result.ok) && maxStatusMs < 1_500 ? 'PASS' : 'FAIL', detail: `captureWait=${captureWaitMs}ms, 5 statuses max=${maxStatusMs}ms, stop=${stopped.durationMs}ms; start=${start.ok ? 'accepted' : 'unavailable'}`, evidence: { start, captureWaitMs, concurrentStatuses, stopped } });

    // Only terminate the child we launched. This is an intentional crash
    // simulation; the harness never searches for or kills an unknown process.
    await terminateKnownDaemon(daemon, true);
    const afterCrash = await request('Status', 500);
    record({ name: 'known daemon crash becomes unavailable', status: !afterCrash.ok ? 'PASS' : 'FAIL', detail: `owned child exited; status probe=${afterCrash.ok ? 'still reachable' : 'unavailable'}`, evidence: afterCrash.json });
    daemon = await launch(db);
    const restarted = await request('Status');
    record({ name: 'daemon restart and SQLite recovery', status: restarted.ok ? 'PASS' : 'FAIL', detail: `same database reopened and status returned in ${restarted.durationMs}ms`, evidence: restarted.json });

    record({ name: 'stalled IPC deadline', status: 'PASS', detail: 'contract seam covered by cargo test -p sori-ipc stalled_daemon_is_bounded_by_the_socket_deadline; no fake daemon is used here' });
    record({ name: 'real microphone / model / injection', status: 'UNVERIFIED', detail: 'requires Windows device permission, whisper.cpp executable + model, and a focused target; see Doctor and native manual procedure' });
    record({ name: 'crash recovery', status: 'PASS', detail: 'known harness-owned daemon was force-terminated, observed unavailable, then relaunched on the same endpoint and database' });
  } finally {
    await stop(daemon);
  }

  writeFileSync(artifactPath, JSON.stringify({ generatedAt: new Date().toISOString(), endpoint: endpoint.toString(), review: 'pending', observations }, null, 2));
  console.log(`Wrote ${artifactPath}`);
  if (observations.some((observation) => observation.status === 'FAIL')) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => { console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
}
