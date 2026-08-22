import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('scripts/windows-wave3-final-acceptance.ps1', 'utf8');

describe('Wave 3 Windows acceptance safety contract', () => {
  it('refuses occupied endpoints and tracks only positively owned processes', () => {
    expect(source).toContain('Assert-EndpointFree');
    expect(source).toContain('endpoint was free before app launch');
    expect(source).toContain('Read-DaemonLease $daemonPath $listener $launchStarted');
    expect(source).toContain('Stop-TrackedProcess $appTrack $appPath');
    expect(source).toContain('Stop-TrackedProcess $daemonTrack $daemonPath');
    expect(source).toContain('refusing to stop reused PID');
    expect(source).not.toContain('function Get-OwnedDaemon');
    expect(source).not.toContain('Stop-Process -Id $oldDaemonPid');
  });

  it('validates runtime configuration instead of merely recording it', () => {
    expect(source).toContain('$status.Status.hotkey -ne $Hotkey');
    expect(source).toContain('permissions resource is empty');
    expect(source).toContain('selected audio device is not ready');
    expect(source).toContain('ModelStatus');
    expect(source).toContain("status.phase -ne 'Ready'");
  });

  it('proves restart ownership and uses literal normalized text comparison', () => {
    expect(source).toContain('staleListener.Count -gt 0');
    expect(source).toContain('$newDaemonTrack.pid -eq $oldDaemonTrack.pid');
    expect(source).toContain('$newDaemonTrack.lease_generation -eq $oldDaemonTrack.lease_generation');
    expect(source).toContain('Normalize-Text $artifact.transcript) -cne (Normalize-Text $ExpectedText');
    expect(source).not.toContain('$artifact.transcript -notlike');
  });

  it('creates .tmp before resolving the generated target path', () => {
    expect(source.indexOf("New-Item -ItemType Directory -Force -Path '.tmp'")).toBeGreaterThanOrEqual(0);
    expect(source.indexOf("Resolve-Path '.tmp'")).toBeGreaterThan(source.indexOf("New-Item -ItemType Directory -Force -Path '.tmp'"));
  });
});
