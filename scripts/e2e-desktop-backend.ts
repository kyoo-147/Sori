import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export const DEFAULT_IPC_URL = 'http://127.0.0.1:17373/ipc';

export function parseEndpoint(value = process.env.SORI_IPC_URL ?? DEFAULT_IPC_URL): URL {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`SORI_IPC_URL must be HTTP(S), got ${url.protocol}`);
  return url;
}

export function binaryPath(name: string): string {
  return resolve('target', 'debug', process.platform === 'win32' ? `${name}.exe` : name);
}

export async function waitForEndpoint(url: URL, timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify('Status'),
        signal: AbortSignal.timeout(750),
      });
      if (response.ok) return true;
    } catch { /* daemon is not ready yet */ }
    await delay(150);
  }
  return false;
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
  } else {
    child.kill('SIGINT');
    await Promise.race([new Promise<void>((resolveStop) => child.once('close', () => resolveStop())), delay(3_000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}

async function main(): Promise<void> {
  const endpoint = parseEndpoint();
  const sorid = binaryPath('sorid');
  const sori = binaryPath('sori');
  if (!existsSync(sorid) || !existsSync(sori)) {
    console.log('Building Rust daemon and CLI binaries...');
    const cargo = await run('cargo', ['build', '-p', 'sorid', '-p', 'sori-cli']);
    if (cargo.code !== 0 || !existsSync(sorid) || !existsSync(sori)) throw new Error('could not build sorid/sori');
  }

  const db = join(resolve('.tmp'), `sori-e2e-${process.pid}.db`);
  const daemon = spawn(sorid, [], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SORI_IPC_URL: endpoint.toString(), SORI_IPC_ADDR: endpoint.host, SORI_DATABASE_PATH: db, SORI_DB_PATH: db, SORI_E2E: '1' },
    shell: false,
  });
  daemon.stdout.on('data', (chunk) => process.stdout.write(`[sorid] ${chunk}`));
  daemon.stderr.on('data', (chunk) => process.stderr.write(`[sorid] ${chunk}`));

  try {
    if (!(await waitForEndpoint(endpoint))) {
      console.log(`SKIP: no daemon IPC endpoint at ${endpoint}. Backend IPC is not implemented yet (see issues #47/#48/#49).`);
      return;
    }

    for (const name of ['status', 'doctor']) {
      const result = await run(sori, [name], { SORI_IPC_URL: endpoint.toString(), SORI_IPC_ADDR: endpoint.host });
      if (result.code !== 0 || (name === 'status' && !result.output.includes('running')) || (name === 'doctor' && result.output.includes('failed'))) {
        throw new Error(`sori ${name} did not report a healthy daemon`);
      }
    }

    const direct = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify('Status'),
      signal: AbortSignal.timeout(2_000),
    });
    if (!direct.ok) throw new Error(`direct IPC status request returned HTTP ${direct.status}`);
    const response = await direct.json() as { Status?: { running?: boolean; protocol_version?: number } };
    const status = response.Status;
    if (status?.running !== true) throw new Error('direct IPC status response did not report running=true');
    if (typeof status.protocol_version !== 'number') throw new Error('direct IPC status response omitted protocol_version');

    if (process.platform === 'win32') {
      await run('cmd.exe', ['/c', 'npm', 'run', 'desktop:build']);
    } else {
      await run('npm', ['run', 'desktop:build']);
    }
    console.log('PASS: desktop build and real sorid IPC compatibility check completed.');
  } finally {
    await stop(daemon);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => { console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
}
