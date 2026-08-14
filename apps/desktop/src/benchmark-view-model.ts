import type { BenchmarkResult } from './types';

export interface BackendBenchmarkResult {
  run_id?: string;
  started_at?: string;
  completed_at?: string;
  model?: string;
  provider?: string;
  samples?: number;
  attempts?: number;
  startup?: { cold_ms?: number; warm_ms?: number };
  latency?: { p50_ms?: number; p95_ms?: number };
  real_time_factor?: number;
  memory?: { ram_bytes?: number | null; vram_bytes?: number | null };
  accuracy?: { wer?: number | null; cer?: number | null } | null;
  reliability?: { failure_rate?: number; fallback_rate?: number | null };
}

/** Map the serde-shaped IPC value without inventing evidence or recommendation state. */
export function mapBenchmarkResult(value: BackendBenchmarkResult, recommendedRunId: string | null): BenchmarkResult {
  return {
    runId: value.run_id ?? null,
    startedAt: value.started_at ?? null,
    completedAt: value.completed_at ?? null,
    modelId: value.model ?? 'unknown',
    modelName: value.model ?? 'Unknown model',
    provider: value.provider ?? null,
    samples: value.samples ?? null,
    attempts: value.attempts ?? null,
    coldStartMs: value.startup?.cold_ms ?? null,
    warmLatencyMs: value.startup?.warm_ms ?? null,
    p50Ms: value.latency?.p50_ms ?? null,
    p95Ms: value.latency?.p95_ms ?? null,
    rtf: value.real_time_factor ?? null,
    ramMb: value.memory?.ram_bytes == null ? null : value.memory.ram_bytes / 1_000_000,
    vramMb: value.memory?.vram_bytes == null ? null : value.memory.vram_bytes / 1_000_000,
    werPercent: value.accuracy?.wer == null ? null : value.accuracy.wer * 100,
    cerPercent: value.accuracy?.cer == null ? null : value.accuracy.cer * 100,
    failureRate: value.reliability?.failure_rate ?? null,
    fallbackRate: value.reliability?.fallback_rate ?? null,
    isRecommended: value.run_id != null && value.run_id === recommendedRunId,
  };
}

export const unverified = (value: number | string | null | undefined): string => value == null ? 'UNVERIFIED' : String(value);
export const ms = (value: number | null | undefined): string => value == null ? 'UNVERIFIED' : `${value.toFixed(0)}ms`;
export const percent = (value: number | null | undefined): string => value == null ? 'UNVERIFIED' : `${value.toFixed(2)}%`;
export const ratio = (value: number | null | undefined): string => value == null ? 'UNVERIFIED' : value.toFixed(3);
