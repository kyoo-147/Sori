import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve('scripts/windows-wave4-whisper-probe.ps1'), 'utf8');

describe('Wave 4 Whisper probe contract', () => {
  it('is local-only and never records private paths or downloads assets', () => {
    expect(source).toContain('$artifact = [ordered]@{');
    expect(source).toContain('network = $false');
    expect(source).toContain('private_paths_recorded = $false');
    expect(source).toContain('It never downloads');
    expect(source).not.toContain('Invoke-WebRequest');
    expect(source).not.toContain('Start-BitsTransfer');
    expect(source).not.toContain('$artifact.error = $_.Exception.Message');
  });

  it('trusts verifier success, requires daemon model readiness, and uses canonical benchmark', () => {
    expect(source).toContain("status = 'BLOCKED'");
    expect(source).toContain('sori status could not reach the daemon');
    expect(source).toContain("windows-audio-fixture-corpus-verify.ps1') -CorpusDirectory $CorpusDirectory *> $null");
    expect(source).toContain('$corpusOk = $true');
    expect(source).not.toContain("windows-audio-fixture-corpus-verify.ps1') -CorpusDirectory $CorpusDirectory *> $null\n        $corpusOk = $LASTEXITCODE -eq 0");
    expect(source).toContain("Check 'daemon_model_ready'");
    expect(source).toContain("$modelsResponse.Models.provider -eq 'whisper.cpp'");
    expect(source).toContain("$selected[0].status.phase -eq 'Ready'");
    expect(source).toContain('& $Cli benchmark --model $Model --audio $Audio --reference $Reference --iterations $Iterations');
    expect(source).toContain('VERIFIED_REAL_SAPI_CORPUS_BENCHMARK');
    expect(source).toContain('UNVERIFIED');
    expect(source).toContain('no benchmark evidence was recorded');
    expect(source).toContain("if ($artifact.status -ne 'VERIFIED_REAL_SAPI_CORPUS_BENCHMARK') { exit 3 }");
  });
});
