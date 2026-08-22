import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { desktopBinaryPath, nativeAcceptancePaths } from '../scripts/e2e-desktop-native';

describe('installed native acceptance isolation', () => {
  it('uses an absolute per-run database and owner lease beside no shared state', () => {
    const paths = nativeAcceptancePaths('.tmp/native-contract-run');
    expect(paths.root).toBe(resolve('.tmp/native-contract-run'));
    expect(paths.database).toBe(resolve('.tmp/native-contract-run/sori.db'));
    expect(paths.owner).toBe(resolve('.tmp/native-contract-run/daemon-owner.json'));
    expect(paths.database).not.toBe(paths.owner);
  });

  it('supports an installed executable and resolves its sibling daemon', () => {
    const source = readFileSync(resolve('scripts/e2e-desktop-native.ts'), 'utf8');
    expect(source).toContain('process.env.SORI_DESKTOP_EXECUTABLE');
    expect(source).toContain("resolve(dirname(app), 'sorid.exe')");
    expect(source).toContain('SORI_DAEMON_OWNER_PATH: isolatedPaths.owner');
    expect(source).toContain('SORI_DATABASE_PATH: isolatedPaths.database');
    expect(source).toContain('spawn(daemonPath, [], { stdio: [\'ignore\', \'pipe\', \'pipe\'], shell: false, env: isolatedEnv })');
    expect(source).toContain('spawn(app, [], { stdio: [\'ignore\', \'pipe\', \'pipe\'], shell: false, env: isolatedEnv })');
    expect(source).toContain('rmSync(runRoot, { recursive: true, force: true })');
    const tauriSource = readFileSync(resolve('apps/desktop/src-tauri/src/lib.rs'), 'utf8');
    expect(tauriSource).toContain('SORI_DAEMON_OWNER_PATH');
    const previous = process.env.SORI_DESKTOP_EXECUTABLE;
    process.env.SORI_DESKTOP_EXECUTABLE = '.tmp/installed/sori-desktop.exe';
    try {
      expect(desktopBinaryPath()).toBe(resolve('.tmp/installed/sori-desktop.exe'));
    } finally {
      if (previous === undefined) delete process.env.SORI_DESKTOP_EXECUTABLE;
      else process.env.SORI_DESKTOP_EXECUTABLE = previous;
    }
  });
});
