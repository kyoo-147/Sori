import React, { useMemo, useState } from 'react';
import { AppSettings, HistoryItem } from '../../types';
import { Activity, AlertCircle, BookOpen, CheckCircle2, ChevronRight, Clock3, FileText, Mic, Play, Radio, Settings2, Sparkles, Target, WifiOff } from 'lucide-react';

interface OverviewScreenProps {
  settings: AppSettings;
  isListening: boolean;
  toggleListening: () => void;
  onNavigate: (screen: any) => void;
  history: HistoryItem[];
  activeModelName: string;
  runtimeSource?: 'native' | 'backend' | 'mock' | 'unavailable';
  runtimeActivity?: string;
}

type CaptureState = 'ready' | 'listening' | 'processing' | 'inserting' | 'no-target' | 'mic-error' | 'model-loading' | 'injection-error' | 'error';

const stateCopy: Record<CaptureState, { label: string; detail: string }> = {
  ready: { label: 'Daemon capture available', detail: 'Canonical daemon capture is available; target focus and injection remain UNVERIFIED.' },
  listening: { label: 'Listening', detail: 'Speak naturally. Release the hotkey when you are done.' },
  processing: { label: 'Processing audio', detail: 'The active route is transcribing your capture.' },
  inserting: { label: 'Inserting text', detail: 'The daemon is sending output to the focused window.' },
  'no-target': { label: 'No focused target', detail: 'Focus a writable app before starting capture.' },
  'mic-error': { label: 'Microphone unavailable', detail: 'Check microphone permission and the selected input device.' },
  'model-loading': { label: 'Model loading', detail: 'The selected model is warming up. Try again shortly.' },
  'injection-error': { label: 'Injection unavailable', detail: 'The runtime does not currently expose focused-app injection.' },
  error: { label: 'Capture error', detail: 'The local runtime reported an error. Open Diagnostics for details.' },
};

export const OverviewScreen: React.FC<OverviewScreenProps> = ({ settings, isListening, toggleListening, onNavigate, history, activeModelName, runtimeSource = 'unavailable', runtimeActivity = 'error' }) => {
  const [stateOverride, setStateOverride] = useState<CaptureState | null>(null);
  const target = 'Unavailable';
  const [preview, setPreview] = useState('Browser preview only. No focused target or injected output is available here.');
  const state: CaptureState = stateOverride ?? (isListening ? 'listening' : runtimeActivity === 'processing' ? 'processing' : runtimeSource === 'unavailable' ? 'injection-error' : 'ready');
  const copy = stateCopy[state];
  const routeLabel = runtimeSource === 'native' || runtimeSource === 'backend' ? 'Connected runtime' : 'Runtime unavailable';
  const quickPrompts = useMemo(() => [
    'Summarize the selected project update in three bullets.',
    'Draft a concise status update for the team.',
    'Add error handling and preserve the existing return type.',
  ], []);

  const startCapture = () => {
    if (runtimeSource === 'unavailable' || runtimeSource === 'mock') {
      setStateOverride('injection-error');
      return;
    }
    setStateOverride(null);
    toggleListening();
  };

  return (
    <div className="mx-auto max-w-[1180px] space-y-6 p-1 text-[#1C1B19] sm:p-2 md:p-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[#98928A]">Overview</p>
          <h1 className="sori-page-heading">Runtime overview</h1>
          <p className="sori-body-text mt-1">Local-first dictation with explicit capability boundaries.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[rgba(92,84,75,0.12)] bg-[#FFFDF9] px-3 py-2 text-xs text-[#68635D] shadow-[0_2px_8px_rgba(92,84,75,0.05)]">
          <span className={`h-2 w-2 rounded-full ${runtimeSource === 'native' || runtimeSource === 'backend' ? 'bg-[#4E7A61]' : 'bg-[#9A7442]'}`} />
          {routeLabel} · {activeModelName}
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-[18px] border border-[rgba(92,84,75,0.13)] bg-[#FBF9F6] p-5 shadow-[0_4px_18px_rgba(92,84,75,0.05)] md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[rgba(92,84,75,0.08)] pb-4">
            <div className="flex gap-3">
              <div className="rounded-xl bg-[#ECEEEB] p-2.5 text-[#6E7A80]"><Target className="h-5 w-5" /></div>
              <div><h2 className="sori-section-heading">Focused target window</h2><p className="sori-meta-text mt-1">Focused-app detection is UNAVAILABLE in this surface.</p></div>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${state === 'ready' ? 'bg-[#EAF3ED] text-[#4E7A61]' : state === 'injection-error' ? 'bg-[#FAEDEA] text-[#A75850]' : 'bg-[#F5EEDC] text-[#9A7442]'}`}>
              {copy.label}
            </span>
          </div>

          <div className="mt-5 rounded-[10px] border border-[#EBD9A8] bg-[#FFF7E6] px-3 py-2 text-xs text-[#6B552C]">Unavailable: native focused-window identity and target selection are not exposed by the canonical IPC contract.</div>
          <div className="mt-4 overflow-hidden rounded-[14px] border border-[rgba(92,84,75,0.12)] bg-[#FFFDF9]">
            <div className="flex items-center justify-between border-b border-[rgba(92,84,75,0.08)] px-4 py-3 text-[11px] text-[#98928A]"><span className="font-mono">Sori preview · no native target</span><span>{state === 'listening' ? 'Daemon capture active' : 'Preview only'}</span></div>
            <textarea value={preview} readOnly aria-label="Browser preview without focused target" className="min-h-[210px] w-full resize-y border-0 bg-transparent p-5 text-sm leading-7 text-[#68635D] outline-none" />
            <div className="flex items-center justify-between border-t border-[rgba(92,84,75,0.08)] px-4 py-3 text-xs text-[#68635D]"><span className="flex items-center gap-2"><Activity className="h-4 w-4 text-[#6E7A80]" />{copy.detail}</span><span className="font-mono">{settings.hotkey}</span></div>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2"><button type="button" onClick={startCapture} disabled={runtimeSource === 'unavailable' || runtimeSource === 'mock'} title={runtimeSource === 'mock' ? 'Unavailable in browser preview' : runtimeSource === 'unavailable' ? 'Unavailable: sorid is not connected' : undefined} className="sori-tactile-btn rounded-[10px] px-4 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"><Mic className="mr-2 inline h-4 w-4" />{isListening ? 'Stop daemon capture' : runtimeSource === 'unavailable' || runtimeSource === 'mock' ? 'Capture unavailable' : 'Start daemon capture'}</button><button type="button" onClick={() => setPreview('')} className="sori-tactile-btn rounded-[10px] px-3 py-2 text-xs">Clear preview</button></div>
            {state === 'injection-error' && <span className="flex items-center gap-1.5 text-[11px] text-[#A75850]"><WifiOff className="h-3.5 w-3.5" /> No fake success: connect sorid to enable injection.</span>}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-[18px] border border-[rgba(92,84,75,0.13)] bg-[#FBF9F6] p-4 shadow-[0_4px_18px_rgba(92,84,75,0.05)]"><div className="mb-3 flex items-center justify-between"><h2 className="sori-section-heading">Recent dictations</h2><button type="button" onClick={() => onNavigate('transcripts')} className="text-xs text-[#6E7A80]">View all <ChevronRight className="inline h-3.5 w-3.5" /></button></div><div className="divide-y divide-[rgba(92,84,75,0.08)]">{history.slice(0, 4).map((item) => <button type="button" key={item.id} onClick={() => onNavigate('transcripts')} className="flex w-full items-start gap-3 py-3 text-left first:pt-0 last:pb-0"><div className="mt-0.5 rounded-lg bg-[#F2EEE8] p-2"><FileText className="h-4 w-4 text-[#6E7A80]" /></div><span className="min-w-0 flex-1"><strong className="block truncate text-xs font-medium">{item.activeApp}</strong><span className="mt-1 block line-clamp-2 text-[11px] leading-4 text-[#68635D]">{item.processedText}</span></span><span className="font-mono text-[10px] text-[#98928A]">{item.latencyMs}ms</span></button>)}</div></section>
          <section className="rounded-[18px] border border-[rgba(92,84,75,0.13)] bg-[#FBF9F6] p-4 shadow-[0_4px_18px_rgba(92,84,75,0.05)]"><h2 className="sori-section-heading mb-3">Quick actions</h2><button type="button" onClick={() => onNavigate('vocabulary')} className="sori-tactile-btn mb-2 flex w-full items-center gap-3 rounded-[12px] p-3 text-left"><BookOpen className="h-4 w-4 text-[#6E7A80]" /><span><strong className="block text-xs">Teach Sori your words</strong><span className="text-[11px] text-[#98928A]">Add terms and pronunciation hints</span></span><ChevronRight className="ml-auto h-4 w-4 text-[#98928A]" /></button><button type="button" onClick={() => onNavigate('diagnostics')} className="sori-tactile-btn flex w-full items-center gap-3 rounded-[12px] p-3 text-left"><Settings2 className="h-4 w-4 text-[#6E7A80]" /><span><strong className="block text-xs">Check runtime health</strong><span className="text-[11px] text-[#98928A]">See microphone and injection readiness</span></span><ChevronRight className="ml-auto h-4 w-4 text-[#98928A]" /></button></section>
          <section className="rounded-[18px] border border-[rgba(92,84,75,0.13)] bg-[#F2EEE8] p-4"><div className="flex items-start gap-3"><Radio className="mt-0.5 h-4 w-4 text-[#6E7A80]" /><div><h3 className="text-xs font-medium">Runtime status</h3><p className="mt-1 text-[11px] leading-4 text-[#68635D]">{runtimeSource === 'mock' ? 'Mock fallback is active. Hardware capabilities are UNVERIFIED.' : runtimeSource === 'unavailable' ? 'Daemon unavailable. Microphone, model, hotkey, and injection are UNVERIFIED.' : 'Connected to the local Sori runtime.'}</p></div></div></section>
        </aside>
      </div>
    </div>
  );
};
