import React, { useRef, useState } from 'react';
import { Check, Download, Play } from 'lucide-react';
import type { BenchmarkResult } from '../../types';
import { readBenchmarkFixture, type BenchmarkFixture } from '../../benchmark-fixture';

interface Props {
  benchmarkResults: BenchmarkResult[];
  onApplyPolicy: () => Promise<void>;
  activeModelId: string | null;
  onRun: (fixture: BenchmarkFixture) => Promise<string>;
}

export const BenchmarkScreen: React.FC<Props> = ({ benchmarkResults, onApplyPolicy, activeModelId, onRun }) => {
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
    setMessage('Calling the canonical provider benchmark over IPC…');
    try { setMessage(await onRun({ ...fixture, reference: reference.trim() || null })); } catch (error) { setMessage(`Benchmark failed: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setRunning(false); }
  };
  const exportResults = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), results: benchmarkResults }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'sori-benchmark-results.json'; link.click(); URL.revokeObjectURL(url);
  };
  return <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
    <header><h1 className="sori-page-heading">Auto Benchmark Engine</h1><p className="sori-body-text mt-1">Provider-backed measurements only; no timer-generated metrics.</p></header>
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="sori-pane space-y-5 p-5">
        <div className="flex items-center justify-between border-b border-[#E5E0D9] pb-3"><h2 className="sori-section-heading">Benchmark execution</h2><span className="rounded-full bg-[#F2EEE8] px-2.5 py-1 text-xs">{running ? 'Running' : 'Idle'}</span></div>
        <p className="text-sm text-[#68635D]">{message}</p>
        <input ref={fileInput} className="hidden" type="file" accept=".wav,audio/wav" onChange={(event) => void chooseFile(event.target.files?.[0])} />
        <button className="sori-tactile-btn w-full rounded-xl py-2.5 text-sm" onClick={() => fileInput.current?.click()}>Select real WAV fixture</button>
        <label className="block text-xs text-[#68635D]">Reference transcript (optional)
          <textarea className="mt-1 w-full rounded-lg border border-[#E5E0D9] bg-white p-2" rows={3} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Expected transcript for WER/CER" />
        </label>
        <button className="sori-tactile-btn w-full rounded-xl py-2.5 text-sm disabled:opacity-50" disabled={running || !fixture || !activeModelId} onClick={() => void run}><Play className="mr-1 inline h-4 w-4" />{running ? 'Running…' : fixture ? 'Run provider benchmark' : 'Run unavailable — select a WAV fixture'}</button>
        <p className="text-xs text-[#98928A]">Only the selected mono PCM16 WAV and optional reference are sent to the canonical RuntimeClient. No fixture means unavailable, never fake success.</p>
      </section>
      <section className="sori-pane space-y-4 p-5">
        <div className="flex items-center justify-between border-b border-[#E5E0D9] pb-3"><div><h2 className="sori-section-heading">Persisted results</h2><p className="sori-meta-text">SQLite-backed provider results</p></div><button className="sori-tactile-btn rounded-lg px-3 py-2 text-xs" onClick={exportResults}><Download className="mr-1 inline h-4 w-4" />Export</button></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="text-[#98928A]"><tr><th className="py-2">Model/provider</th><th>Cold</th><th>RAM</th><th>WER/CER</th><th>p50</th><th>p95</th></tr></thead><tbody>{benchmarkResults.map((result) => <tr key={result.runId ?? result.modelId} className="border-t border-[#E5E0D9]"><td className="py-3 font-medium">{result.modelName}<div className="sori-meta-text">{result.provider ?? 'UNVERIFIED'} · {result.samples ?? 0}/{result.attempts ?? 0} samples/attempts {result.isRecommended && <span className="text-[#4E7A61]"><Check className="mr-1 inline h-3 w-3" />Recommended</span>}</div></td><td className="font-mono">{result.coldStartMs == null ? 'UNVERIFIED' : `${result.coldStartMs.toFixed(0)}ms`}</td><td className="font-mono">{result.ramMb == null ? 'UNVERIFIED' : `${result.ramMb}MB`}</td><td className="font-mono">{result.werPercent == null ? 'UNVERIFIED' : `${result.werPercent}%`} / {result.cerPercent == null ? 'UNVERIFIED' : `${result.cerPercent}%`}</td><td className="font-mono">{result.p50Ms == null ? 'UNVERIFIED' : `${result.p50Ms.toFixed(0)}ms`}</td><td className="font-mono">{result.p95Ms == null ? 'UNVERIFIED' : `${result.p95Ms.toFixed(0)}ms`}</td></tr>)}</tbody></table></div>
        <button className="sori-tactile-btn rounded-lg px-3 py-2 text-xs disabled:opacity-50" disabled={!benchmarkResults.length} onClick={() => void onApplyPolicy()}>Apply recommended route</button>
      </section>
    </div>
  </div>;
};
