import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('scripts/windows-wave6-installed-real-e2e.ps1', 'utf8');
const native = readFileSync('scripts/windows-native-voice-acceptance.ps1', 'utf8');

describe('Wave 6 installed real Whisper acceptance contract', () => {
  it('requires installed product components and existing user-owned assets', () => {
    expect(source).toContain('InstalledDesktopExecutable');
    expect(source).toContain('CliExecutable');
    expect(source).toContain('ggml-base.en.bin');
    expect(source).toContain('whisper-cli.exe');
    expect(source).toContain('RequireFile $ModelPath');
    expect(source).toContain('windows-audio-fixture-corpus-verify.ps1');
    expect(source).toContain('network=false and microphone=false');
  });

  it('isolates endpoint and SQLite state and refuses an occupied endpoint', () => {
    expect(source).toContain('endpoint is already occupied');
    expect(source).toContain('SORI_DATABASE_PATH');
    expect(source).toContain('127.0.0.1:$IpcPort');
    expect(source).toContain("native-voice.json");
  });

  it('proves restart persistence through the installed CLI without claiming frontend proof', () => {
    expect(source).toContain("Run-Json $cliPath @('--json','history','--limit','20')");
    expect(source).toContain('restart history is empty after relaunch');
    expect(source).toContain('Frontend refresh: NOT CLAIMED');
    expect(source).toContain('Physical microphone and physical hotkey: UNVERIFIED');
  });

  it('allows the bundled daemon to live outside the desktop directory', () => {
    expect(native).toContain('[string]$DaemonExecutable =');
    expect(native).toContain('if ($DaemonExecutable)');
  });
});
