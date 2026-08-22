import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('scripts/windows-wave6-installed-real-e2e.ps1', 'utf8');
const native = readFileSync('scripts/windows-native-voice-acceptance.ps1', 'utf8');

describe('Wave 6 installed real Whisper acceptance contract', () => {
  it('requires installed product components and existing user-owned assets', () => {
    expect(source).toContain('InstalledDesktopExecutable');
    expect(source).not.toContain('CliExecutable');
    expect(source).toContain('ggml-base.en.bin');
    expect(source).toContain('FreshPackagedDaemon');
    expect(source).toContain('installed daemon is stale/wrong bundle');
    expect(source).toContain('Get-FileEvidence');
    expect(source).toContain('whisper-cli.exe');
    expect(source).toContain('Require-AbsoluteFile $ModelPath');
    expect(source).toContain('MEASURED_REAL_QUALITY');
    expect(source).toContain("reference = $expectedText; actual = $evidence.transcript");
    expect(source).toContain('IsNullOrWhiteSpace($evidence.transcript)');
    expect(source).not.toContain('transcript -cne $expectedText');
    expect(source).toContain('windows-audio-fixture-corpus-verify.ps1');
  });

  it('isolates endpoint and SQLite state and refuses an occupied endpoint', () => {
    expect(source).toContain('endpoint is already occupied');
    expect(source).toContain('SORI_DATABASE_PATH');
    expect(source).toContain('127.0.0.1:$IpcPort');
    expect(source).toContain("native-voice.json");
  });

  it('proves restart persistence through direct IPC without claiming frontend proof', () => {
    expect(source).toContain('Frontend visual refresh is NOT CLAIMED');
    expect(source).not.toContain('Run-Json');
    expect(source).not.toContain('CliExecutable');
  });

  it('allows the bundled daemon to live outside the desktop directory', () => {
    expect(native).toContain('[string]$DaemonExecutable =');
    expect(native).toContain('SORI_DAEMON_OWNER_PATH');
    expect(native).toContain('Stop-TrackedDaemon');
    expect(native).toContain('creation time');
    expect(native).toContain('ExpectedReference');
    expect(native).toContain('expected_reference');
    expect(native).not.toContain('ExpectedTranscript');
    expect(native).not.toContain('Join-Path $env:LOCALAPPDATA');
  });
});
