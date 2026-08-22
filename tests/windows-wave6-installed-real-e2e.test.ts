import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const scripts = [
  'scripts/windows-wave6-installed-real-e2e.ps1',
  'scripts/windows-native-voice-acceptance.ps1',
];

describe('installed real-Whisper acceptance', () => {
  it('parses as PowerShell when the Windows parser is available', () => {
    if (!existsSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe')) return;
    for (const script of scripts) {
      execFileSync('powershell.exe', ['-NoProfile', '-Command', `$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path '${script}'),[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){$errors|% Message;exit 1}`], { stdio: 'pipe' });
    }
  });

  it('keeps the fail-closed installed boundary and isolated ownership contract', () => {
    const source = readFileSync(scripts[0], 'utf8');
    const native = readFileSync(scripts[1], 'utf8');
    expect(source).toContain("ArtifactPath = '.tmp/");
    expect(source).not.toContain('D:\\work\\Sori');
    expect(source).toContain('installed daemon is stale/wrong bundle');
    expect(source).toContain('FreshPackagedDaemon');
    expect(source).toContain('MEASURED_REAL_QUALITY');
    expect(source).toContain('windows-audio-fixture-corpus-verify.ps1');
    expect(source).toContain("Join-Path $corpusPath $record[0].file");
    expect(source).not.toContain("Join-Path $CorpusDirectory $record[0].file");
    expect(source).toContain('port = $Port');
    expect(source).toContain('$Track.port');
    const cleanup = source.slice(source.indexOf('function Stop-Tracked('), source.indexOf('function Stop-TrackedProcess('));
    expect(cleanup).toContain('$Track.port');
    expect(cleanup).not.toContain('LocalPort $Port');
    expect(source).toContain('safe cleanup failed');
    expect(source).toContain('primary_error');
    expect(source).toContain('if ($evidence.primary_error -or $cleanupErrors.Count -gt 0) { exit 1 }');
    expect(native).toContain('foreach (uint thread in new uint[] { targetThread, foregroundThread })');
    expect(native).toContain('finally { foreach (uint thread in attached) AttachThreadInput');
    expect(native).toContain('Join-Path $dataPath $targetFileName');
    expect(native).toContain('sori-native-edit-target-$([Guid]::NewGuid()');
    expect(native).toContain('FAILED_CLEANUP');
    expect(native).not.toContain("Resolve-Path '.tmp'");
  });
});
