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
    <div className="sori-screen sori-page-layout sori-screen-home space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="sori-page-heading">Overview</h1>
          <p className="sori-body-text mt-1">Capture, review, and check runtime readiness.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[var(--sori-border-soft)] bg-[var(--sori-bg-panel)] px-3 py-2 text-xs text-[var(--sori-text-secondary)] shadow-[var(--sori-shadow-xs)]">
          <span className={`h-2 w-2 rounded-full ${runtimeSource === 'native' || runtimeSource === 'backend' ? 'bg-[var(--sori-success-text)]' : 'bg-[var(--sori-warning-text)]'}`} />
          {routeLabel} · {activeModelName}
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-[18px] border border-[var(--sori-border-soft)] bg-[var(--sori-bg-panel)] p-2.5 shadow-[var(--sori-shadow-sm)]">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--sori-border-soft)] pb-4">
            <div className="flex gap-3">
              <div className="rounded-xl bg-[var(--sori-fill-hover)] p-2.5 text-[var(--sori-text-tertiary)]"><Target className="h-5 w-5" /></div>
              <div><h2 className="sori-section-heading">Focused target window</h2><p className="sori-meta-text mt-1">Focused-app detection is UNAVAILABLE in this surface.</p></div>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${state === 'ready' ? 'bg-[var(--sori-success-bg)] text-[var(--sori-success-text)]' : state === 'injection-error' ? 'bg-[var(--sori-error-bg)] text-[var(--sori-error-text)]' : 'bg-[var(--sori-warning-bg)] text-[var(--sori-warning-text)]'}`}>
              {copy.label}
            </span>
          </div>

          <div className="mt-5 rounded-[10px] border border-[var(--sori-warning-border)] bg-[var(--sori-warning-bg)] px-3 py-2 text-xs text-[var(--sori-warning-text)]">Native target detection is unavailable.</div>
          <div className="mt-4 overflow-hidden rounded-[14px] border border-[var(--sori-border-soft)] bg-[var(--sori-bg-panel)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sori-border-soft)] px-4 py-3 text-[11px] text-[var(--sori-text-tertiary)]"><span className="font-mono">Sori preview · no native target</span><span>{state === 'listening' ? 'Daemon capture active' : 'Preview only'}</span></div>
            <textarea value={preview} readOnly aria-label="Browser preview without focused target" className="sori-focus-ring min-h-[210px] w-full resize-y border-0 bg-transparent p-5 text-sm leading-7 text-[var(--sori-text-secondary)] outline-none" />
            <div className="flex items-center justify-between border-t border-[var(--sori-border-soft)] px-4 py-3 text-xs text-[var(--sori-text-secondary)]"><span className="flex items-center gap-2"><Activity className="h-4 w-4 text-[var(--sori-text-tertiary)]" />{copy.detail}</span><span className="font-mono">{settings.hotkey}</span></div>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2"><button type="button" onClick={startCapture} disabled={runtimeSource === 'unavailable' || runtimeSource === 'mock'} title={runtimeSource === 'mock' ? 'Unavailable in browser preview' : runtimeSource === 'unavailable' ? 'Unavailable: sorid is not connected' : undefined} className="sori-tactile-btn rounded-[10px] px-4 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"><Mic className="mr-2 inline h-4 w-4" />{isListening ? 'Stop daemon capture' : runtimeSource === 'unavailable' || runtimeSource === 'mock' ? 'Capture unavailable' : 'Start daemon capture'}</button><button type="button" onClick={() => setPreview('')} className="sori-tactile-btn rounded-[10px] px-3 py-2 text-xs">Clear preview</button></div>
            {state === 'injection-error' && <span className="flex items-center gap-1.5 text-[11px] text-[var(--sori-error-text)]"><WifiOff className="h-3.5 w-3.5" /> Connect sorid to enable injection.</span>}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-[18px] border border-[var(--sori-border-soft)] bg-[var(--sori-bg-panel-subtle)] p-2.5 shadow-[var(--sori-shadow-sm)]"><div className="mb-3 flex items-center justify-between"><h2 className="sori-section-heading">Recent dictations</h2><button type="button" onClick={() => onNavigate('transcripts')} className="text-xs text-[var(--sori-text-tertiary)]">View all <ChevronRight className="inline h-3.5 w-3.5" /></button></div><div className="divide-y divide-[var(--sori-border-soft)]">{history.length === 0 ? <div className="sori-empty-state"><FileText className="mx-auto h-5 w-5" /><strong>No dictations yet</strong><span>Start a daemon capture to see local history here.</span><button type="button" onClick={() => onNavigate('transcripts')} className="mt-3 text-xs font-medium text-[var(--sori-accent-primary)]">Open transcripts</button></div> : history.slice(0, 4).map((item) => <button type="button" key={item.id} onClick={() => onNavigate('transcripts')} className="flex w-full items-start gap-3 py-3 text-left first:pt-0 last:pb-0"><div className="mt-0.5 rounded-lg bg-[var(--sori-fill-hover)] p-2"><FileText className="h-4 w-4 text-[var(--sori-text-tertiary)]" /></div><span className="min-w-0 flex-1"><strong className="block truncate text-xs font-medium">{item.activeApp}</strong><span className="mt-1 block line-clamp-2 text-[11px] leading-4 text-[var(--sori-text-secondary)]">{item.processedText}</span></span><span className="font-mono text-[10px] text-[var(--sori-text-tertiary)]">{item.latencyMs}ms</span></button>)}</div></section>
          <section className="rounded-[18px] border border-[var(--sori-border-soft)] bg-[var(--sori-bg-panel-subtle)] p-2.5 shadow-[var(--sori-shadow-sm)]"><h2 className="sori-section-heading mb-3">Quick actions</h2><button type="button" onClick={() => onNavigate('vocabulary')} className="sori-tactile-btn mb-2 flex w-full items-center gap-3 rounded-[12px] p-3 text-left"><BookOpen className="h-4 w-4 text-[var(--sori-text-tertiary)]" /><span><strong className="block text-xs">Teach Sori your words</strong><span className="text-[11px] text-[var(--sori-text-tertiary)]">Add terms and pronunciation hints</span></span><ChevronRight className="ml-auto h-4 w-4 text-[var(--sori-text-tertiary)]" /></button><button type="button" onClick={() => onNavigate('diagnostics')} className="sori-tactile-btn flex w-full items-center gap-3 rounded-[12px] p-3 text-left"><Settings2 className="h-4 w-4 text-[var(--sori-text-tertiary)]" /><span><strong className="block text-xs">Check runtime health</strong><span className="text-[11px] text-[var(--sori-text-tertiary)]">See microphone and injection readiness</span></span><ChevronRight className="ml-auto h-4 w-4 text-[var(--sori-text-tertiary)]" /></button></section>
          <section className="rounded-[18px] border border-[var(--sori-border-soft)] bg-[var(--sori-fill-hover)] p-2.5"><div className="flex items-start gap-3"><Radio className="mt-0.5 h-4 w-4 text-[var(--sori-text-tertiary)]" /><div><h3 className="text-xs font-medium">Runtime status</h3><p className="mt-1 text-[11px] leading-4 text-[var(--sori-text-secondary)]">{runtimeSource === 'unavailable' || runtimeSource === 'mock' ? 'Daemon unavailable. Microphone, model, hotkey, and injection are UNVERIFIED.' : 'Connected to the local Sori runtime.'}</p></div></div></section>
        </aside>
      </div>
    </div>
  );
};
