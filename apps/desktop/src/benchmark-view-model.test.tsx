import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { mapBenchmarkResult } from './benchmark-view-model';
import { BenchmarkResult } from './components/screens/BenchmarkScreen';

describe('benchmark evidence mapping and rendering', () => {
  it('maps every backend metric and only marks the backend-selected run', () => {
    const result = mapBenchmarkResult({ run_id: 'run-2', started_at: '2026-01-01T00:00:00Z', completed_at: '2026-01-01T00:01:00Z', model: 'whisper.cpp/base', provider: 'whisper.cpp', samples: 4, attempts: 5, startup: { cold_ms: 1200, warm_ms: 80 }, latency: { p50_ms: 90, p95_ms: 140 }, real_time_factor: 0.4, memory: { ram_bytes: 2_000_000, vram_bytes: 3_000_000 }, accuracy: { wer: 0.02, cer: 0.01 }, reliability: { failure_rate: 0.2, fallback_rate: 0.1 }, provenance: { manifest_version: 1, evidence_class: 'real-provider-fixture', audio_sha256: 'audio-hash', reference_sha256: null, reference_absent_reason: 'not supplied' } }, 'run-2');
    expect(result).toMatchObject({ runId: 'run-2', provider: 'whisper.cpp', samples: 4, attempts: 5, coldStartMs: 1200, warmLatencyMs: 80, p50Ms: 90, p95Ms: 140, rtf: 0.4, ramMb: 2, vramMb: 3, werPercent: 2, cerPercent: 1, failureRate: 0.2, fallbackRate: 0.1, isRecommended: true, provenance: { manifestVersion: 1, evidenceClass: 'real-provider-fixture', audioSha256: 'audio-hash', referenceAbsentReason: 'not supplied' } });
    expect(mapBenchmarkResult({ run_id: 'run-1', model: 'other' }, 'run-2').isRecommended).toBe(false);
  });

  it('keeps nullable evidence truthful and renders UNVERIFIED for each absent field', () => {
    const html = renderToStaticMarkup(<BenchmarkResult result={{ modelId: 'missing', modelName: 'Missing evidence', runId: null, startedAt: null, completedAt: null, provider: null, samples: null, attempts: null, coldStartMs: null, warmLatencyMs: null, p50Ms: null, p95Ms: null, rtf: null, ramMb: null, vramMb: null, werPercent: null, cerPercent: null, failureRate: null, fallbackRate: null }} />);
    expect(html).toContain('Missing evidence');
    expect((html.match(/UNVERIFIED/g) ?? []).length).toBeGreaterThanOrEqual(11);
    expect(html).not.toContain('0ms');
  });
});
