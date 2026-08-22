import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('scripts/windows-wave3-final-acceptance.ps1', 'utf8');

describe('Wave 3 Windows acceptance safety contract', () => {
  it('isolates endpoint/state and positively validates ownership', () => {
    expect(source).toContain('Assert-EndpointFree');
    expect(source).toContain('endpoint was free before app launch');
    expect(source).toContain('Read-DaemonLease $daemonPath $ownerPath $listener $launchStarted');
    expect(source).toContain('Stop-TrackedProcess $appTrack $appPath');
    expect(source).toContain('refusing to stop reused PID');
    expect(source).toContain('lease.process_start_time');
    expect(source).toContain('lease_id');
    expect(source).toContain('[int]$IpcPort = 0');
    expect(source).toContain('$env:SORI_IPC_URL = "http://127.0.0.1:$IpcPort/ipc"');
    expect(source).toContain('$env:SORI_DAEMON_OWNER_PATH = $ownerPath');
    expect(source).toContain('$env:SORI_DATABASE_PATH = $databasePath');
    expect(source).toContain('isolated_state');
    expect(source).toContain('cleanup_errors');
    expect(source).toContain('$primaryError = $null');
    expect(source).toContain('$primaryError = $_.Exception');
    expect(source).toContain('if ($primaryError -or $cleanupErrors.Count -gt 0)');
    expect(source).toContain('exit 1');
    expect(source).toContain('Write-Host "Wave 3 artifact: $ArtifactPath"');
    expect(source.indexOf('if (-not $DataRoot)')).toBeLessThan(source.indexOf('if ($IpcPort -lt 1024'));
    expect(source).not.toContain("Join-Path $env:LOCALAPPDATA 'Sori\\daemon-owner.json'");
    expect(source).not.toContain('Stop-Process -Id $oldDaemonPid');
  });

  it('validates runtime configuration instead of merely recording it', () => {
    expect(source).toContain('$status.Status.hotkey -ne $Hotkey');
    expect(source).toContain('requiredDoctorChecks = @(\'audio\', \'hotkey\', \'whisper\', \'text-injection\')');
    expect(source).toContain('selected audio device is not ready');
    expect(source).toContain('ModelStatus');
    expect(source).toContain("status.phase -ne 'Ready'");
  });

  it('proves restart ownership and uses literal normalized text comparison', () => {
    expect(source).toContain('staleListener.Count -gt 0');
    expect(source).toContain('$newDaemonTrack.pid -eq $oldDaemonTrack.pid');
    expect(source).toContain('$newDaemonTrack.lease_id -eq $oldDaemonTrack.lease_id');
    expect(source).toContain('Normalize-Text $artifact.transcript) -cne (Normalize-Text $ExpectedText');
    expect(source).not.toContain('$artifact.transcript -notlike');
  });

  it('uses the installed desktop and its sibling daemon by default', () => {
    expect(source).toContain("Join-Path (Split-Path -Parent $appPath) 'sorid.exe'");
    const manual = readFileSync('docs/audio-windows-manual.md', 'utf8');
    expect(manual).toContain('$env:LOCALAPPDATA\\Programs\\Sori\\sori-desktop.exe');
    expect(manual).not.toContain('C:\\Program Files\\Sori\\sori.exe');
  });
});
