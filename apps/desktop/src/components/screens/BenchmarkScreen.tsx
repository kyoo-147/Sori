import React, { useRef, useState } from 'react';
import { Check, Download, Play } from 'lucide-react';
import type { BenchmarkResult as BenchmarkResultData } from '../../types';
import { ms, percent, ratio, unverified } from '../../benchmark-view-model';
import { readBenchmarkFixture, type BenchmarkFixture } from '../../benchmark-fixture';

interface Props {
  benchmarkResults: BenchmarkResultData[];
  onApplyPolicy: () => Promise<void>;
  activeModelId: string | null;
  onRun: (fixture: BenchmarkFixture) => Promise<string>;
  onCancel?: () => Promise<void>;
}

const Evidence = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 rounded-lg bg-[var(--sori-bg-panel-subtle)] p-2">
    <dt className="text-[10px] uppercase tracking-wide text-[var(--sori-text-tertiary)]">{label}</dt>
    <dd className="mt-1 break-words font-mono text-xs text-[var(--sori-text-primary)]">{value}</dd>
  </div>
);

const provenanceValue = (value: string | number | null | undefined) => value == null ? 'UNVERIFIED' : String(value);

export const BenchmarkResult: React.FC<{ result: BenchmarkResultData }> = ({ result }) => (
  <tr className="border-t border-[var(--sori-border-soft)] align-top">
    <td className="py-3 pr-3 font-medium">
      <div>{result.modelName}</div>
      <div className="sori-meta-text">
        {result.provider ?? 'UNVERIFIED'} {result.isRecommended && <span className="text-[var(--sori-success-text)]"><Check className="mr-1 inline h-3 w-3" aria-hidden="true" />Backend recommendation</span>}
      </div>
    </td>
    <td className="py-3 pr-3">
      <dl className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
        <Evidence label="Evidence class" value={provenanceValue(result.provenance?.evidenceClass)} />
        <Evidence label="Manifest" value={provenanceValue(result.provenance?.manifestVersion)} />
        <Evidence label="Run ID" value={unverified(result.runId)} />
        <Evidence label="Started" value={unverified(result.startedAt)} />
        <Evidence label="Completed" value={unverified(result.completedAt)} />
        <Evidence label="Samples / attempts" value={`${unverified(result.samples)} / ${unverified(result.attempts)}`} />
        <Evidence label="Cold / warm" value={`${ms(result.coldStartMs)} / ${ms(result.warmLatencyMs)}`} />
        <Evidence label="p50 / p95" value={`${ms(result.p50Ms)} / ${ms(result.p95Ms)}`} />
        <Evidence label="RTF" value={ratio(result.rtf)} />
        <Evidence label="WER / CER" value={`${percent(result.werPercent)} / ${percent(result.cerPercent)}`} />
        <Evidence label="Failure / fallback" value={`${percent(result.failureRate)} / ${percent(result.fallbackRate)}`} />
        <Evidence label="RAM / VRAM" value={`${result.ramMb == null ? 'UNVERIFIED' : `${result.ramMb.toFixed(2)}MB`} / ${result.vramMb == null ? 'UNVERIFIED' : `${result.vramMb.toFixed(2)}MB`}`} />
      </dl>
    </td>
  </tr>
);

export const BenchmarkScreen: React.FC<Props> = ({ benchmarkResults, onApplyPolicy, activeModelId, onRun, onCancel }) => {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('No benchmark run in this session.');
  const [fixture, setFixture] = useState<BenchmarkFixture | null>(null);
  const [reference, setReference] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = await readBenchmarkFixture(file, reference);
      setFixture(parsed);
      setMessage(`Ready: ${parsed.fileName}${parsed.reference ? ' with reference text.' : '.'}`);
    } catch (error) {
      setFixture(null);
      setMessage(`Fixture unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const run = async () => {
    if (running || !fixture || !activeModelId) return;
    setRunning(true);
    setMessage('Checking provider readiness and calling the canonical benchmark over IPC…');
    try {
      setMessage(await onRun({ ...fixture, reference: reference.trim() || null }));
    } catch (error) {
      setMessage(`Benchmark failed and was not persisted: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRunning(false);
    }
  };
  const cancel = async () => {
    setMessage('Cancellation requested; waiting for the provider operation to terminate…');
    await onCancel?.();
  };
  const exportResults = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), results: benchmarkResults }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sori-benchmark-results.json';
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <main className="sori-screen sori-page-layout min-w-0" aria-busy={running}>
      <header><h1 className="sori-page-heading">Benchmarks</h1><p className="sori-body-text mt-1">Measure a model with a real WAV file.</p></header>
      <div className="grid min-w-0 gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="sori-pane min-w-0 space-y-5 p-5" aria-labelledby="benchmark-execution-heading">
          <div className="flex items-center justify-between border-b border-[var(--sori-border-soft)] pb-3"><h2 id="benchmark-execution-heading" className="sori-section-heading">Benchmark execution</h2><span className="rounded-full bg-[var(--sori-fill-selected)] px-2.5 py-1 text-xs" aria-live="polite">{running ? 'Running' : 'Idle'}</span></div>
          <p className="text-sm text-[var(--sori-text-secondary)]" role="status" aria-live="polite">{message}</p>
          <input ref={fileInput} className="hidden" type="file" accept=".wav,audio/wav" onChange={(event) => void chooseFile(event.target.files?.[0])} />
          <button className="sori-tactile-btn w-full rounded-xl py-2.5 text-sm" onClick={() => fileInput.current?.click()}>Select real WAV fixture</button>
          <label className="block text-xs text-[var(--sori-text-secondary)]">Reference transcript (optional)<textarea aria-label="Reference transcript" className="mt-1 w-full rounded-lg border border-[var(--sori-border-default)] bg-[var(--sori-bg-panel)] p-2" rows={3} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Expected transcript for WER/CER" /></label>
          <div className="flex gap-2"><button className="sori-tactile-btn min-w-0 flex-1 rounded-xl py-2.5 text-sm disabled:opacity-50" disabled={running || !fixture || !activeModelId} onClick={() => void run()}><Play className="mr-1 inline h-4 w-4" aria-hidden="true" />{running ? 'Running…' : fixture ? 'Run provider benchmark' : 'Run unavailable — select a WAV fixture'}</button>{running && <button className="sori-tactile-btn rounded-xl px-4 py-2.5 text-sm text-[var(--sori-error-text)]" onClick={() => void cancel()}>Cancel</button>}</div>
        </section>
        <section className="sori-pane min-w-0 space-y-4 p-5" aria-labelledby="persisted-results-heading">
          <div className="flex items-center justify-between border-b border-[var(--sori-border-soft)] pb-3"><div><h2 id="persisted-results-heading" className="sori-section-heading">Persisted results</h2></div><button className="sori-tactile-btn rounded-lg px-3 py-2 text-xs" onClick={exportResults}><Download className="mr-1 inline h-4 w-4" aria-hidden="true" />Export</button></div>
          {benchmarkResults.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--sori-border-default)] p-8 text-center text-sm text-[var(--sori-text-secondary)]">No provider benchmark results yet. Select a real WAV fixture to begin; unavailable runs are never presented as success.</div> : <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain"><table className="w-full min-w-[700px] text-left text-xs"><caption className="sr-only">Persisted provider benchmark results</caption><thead className="text-[var(--sori-text-tertiary)]"><tr><th className="py-2">Model / provider</th><th>Backend evidence</th></tr></thead><tbody>{benchmarkResults.map((result) => <BenchmarkResult key={result.runId ?? result.modelId} result={result} />)}</tbody></table></div>}
          <button className="sori-tactile-btn rounded-lg px-3 py-2 text-xs disabled:opacity-50" disabled={!benchmarkResults.length} onClick={() => void onApplyPolicy()}>Apply backend-recommended route</button>
        </section>
      </div>
    </main>
  );
};
