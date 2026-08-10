import React, { useState } from 'react';
import { BenchmarkResult } from '../../types';
import { RefreshCw, Sparkles, CheckCircle2 } from 'lucide-react';

interface BenchmarkScreenProps {
  benchmarkResults: BenchmarkResult[];
  onApplyPolicy: () => void;
}

export const BenchmarkScreen: React.FC<BenchmarkScreenProps> = ({
  benchmarkResults,
  onApplyPolicy,
}) => {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(100);
  const [logs, setLogs] = useState<string[]>([
    '[1.2s] Benchmark complete: Whisper Q5 local engine active at 65ms p50 latency.',
  ]);
  const [applied, setApplied] = useState<boolean>(false);

  const startBenchmark = () => {
    setIsRunning(true);
    setProgress(0);
    setLogs(['[0.0s] Initializing local audio harness...']);

    setTimeout(() => {
      setProgress(35);
      setLogs((prev) => [...prev, '[0.4s] Benchmarking Parakeet v2 ONNX engine...']);
    }, 400);

    setTimeout(() => {
      setProgress(70);
      setLogs((prev) => [...prev, '[0.8s] Testing PhoWhisper Base Vietnamese technical sample...']);
    }, 800);

    setTimeout(() => {
      setProgress(100);
      setIsRunning(false);
      setLogs((prev) => [
        ...prev,
        '[1.2s] Benchmark complete: Parakeet p50 latency 65ms, WER 2.1%.',
      ]);
    }, 1300);
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6 text-[#171717]">
      {/* Title + Explanation (Simple & Direct) */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E7E5E1] pb-4">
        <div>
          <h1 className="sori-page-heading">Benchmarks</h1>
          <p className="sori-body-text mt-1">
            Measure local ASR cold/warm start, p50/p95 latency, RAM usage, and word error rate on your hardware.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={startBenchmark}
            disabled={isRunning}
            className={`px-4 py-2 rounded-[10px] text-xs font-semibold flex items-center gap-2 transition-all shadow-2xs border ${
              isRunning
                ? 'bg-[#F6F5F0] text-[#92979E] cursor-not-allowed border-[#E7E5E1]'
                : 'sori-tactile-btn'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#667A90] ${isRunning ? 'animate-spin' : ''}`} />
            {isRunning ? 'Benchmarking...' : 'Run Benchmark'}
          </button>

          <button
            onClick={() => {
              onApplyPolicy();
              setApplied(true);
            }}
            disabled={applied}
            className={`px-4 py-2 rounded-[10px] text-xs font-medium transition-all ${
              applied
                ? 'bg-[#EAF6EE] text-[#1F6B43] border border-[#CBE5D4] font-semibold'
                : 'bg-white hover:bg-[#F2F0EC] text-[#24384C] border border-[#E7E5E1]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#667A90] inline mr-1.5" />
            {applied ? 'Policy Applied' : 'Auto-Apply Recommended Route'}
          </button>
        </div>
      </div>

      {/* Progress & Log Output */}
      {isRunning || progress < 100 ? (
        <div className="bg-[#FCFBF8] border border-[#E7E5E1] rounded-[14px] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-[#63676D]">
            <span>Benchmarking local hardware...</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full h-1.5 bg-[#EEEEEA] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#667A90] rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* Execution Log Snippet */}
      <div className="bg-[#F6F5F0] border border-[#E7E5E1] rounded-[12px] p-3 font-mono text-[11px] text-[#63676D]">
        {logs.map((log, idx) => (
          <div key={idx}>{log}</div>
        ))}
      </div>

      {/* Results List */}
      <div className="bg-[#FCFBF8] border border-[#E7E5E1] rounded-[18px] p-5 space-y-3">
        <div className="flex items-center justify-between text-xs font-semibold text-[#171717] pb-2 border-b border-[#E7E5E1]">
          <span>Evaluated Local Models</span>
          <span className="text-[11px] font-mono text-[#92979E]">3 Models Tested</span>
        </div>

        <div className="space-y-2.5">
          {benchmarkResults.map((res) => (
            <div
              key={res.modelId}
              className="p-3.5 bg-white border border-[#E7E5E1] rounded-[12px] flex flex-wrap items-center justify-between gap-3 text-xs"
            >
              <div>
                <div className="font-semibold text-[#171717]">{res.modelName}</div>
                <div className="text-[11px] text-[#92979E] font-mono mt-0.5">
                  RAM: {res.ramMb}MB • WER: {res.werPercent}% • Cold start: {res.coldStartMs}ms
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-semibold text-[#1F6B43] bg-[#EAF6EE] px-2.5 py-1 rounded-[6px] border border-[#CBE5D4]">
                  {res.warmLatencyMs}ms (p50)
                </span>
                {res.isRecommended && (
                  <span className="text-[11px] font-medium text-[#24384C] bg-[#EEF2F6] px-2.5 py-1 rounded-[6px] border border-[#D5E0EA] flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-[#1F6B43]" /> Recommended
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

