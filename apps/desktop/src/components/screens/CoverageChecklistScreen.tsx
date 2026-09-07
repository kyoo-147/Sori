import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardList, Download, RefreshCw } from 'lucide-react';
import type { DaemonStatus, DoctorCheck, RuntimeSource } from '../../runtime-client';

interface Props {
  checks?: DoctorCheck[];
  runtimeSource?: RuntimeSource;
  runtimeStatus?: DaemonStatus;
  runtimeError?: string | null;
  onRefresh?: () => Promise<void>;
}

const labels: Record<string, string> = {
  platform: 'Platform runtime', daemon: 'Sori daemon', 'ipc-bind': 'Loopback IPC', hotkey: 'Global hotkey listener',
  microphone: 'Microphone device', 'microphone-permission': 'OS microphone permission', vad: 'Voice activity detection (VAD)',
  whisper: 'Local ASR engine', injection: 'Text injection permission', clipboard: 'Clipboard fallback',
  sqlite: 'SQLite local storage', overlay: 'Overlay system', updater: 'Desktop updater',
};
const updaterMvpCheck: DoctorCheck = { name: 'updater', ok: false, detail: 'Unavailable in MVP: installers are manually distributed; no signed update endpoint or updater plugin is shipped.' };
const unavailableActions = {
  injection: 'Text injection is not wired in this preview; no payload was delivered.',
  restart: 'Daemon restart is not wired in this preview. Start sorid separately, then run Doctor Check.',
  label: 'Restart Daemon (`sorid`) — not wired',
};

export const CoverageChecklistScreen: React.FC<Props> = ({ checks = [], runtimeSource = 'unavailable', runtimeStatus, runtimeError, onRefresh }) => {
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string | null>(null);
  const baseRows = checks.length ? checks : [{ name: 'daemon', ok: false, detail: 'Waiting for a real sorid Doctor response.' }];
  const rows = baseRows.some((c) => c.name === 'updater') ? baseRows : [...baseRows, updaterMvpCheck];
  const refresh = async () => { setLoading(true); try { await onRefresh?.(); } finally { setLoading(false); } };
  const exportLog = () => {
    const text = rows.map((c) => `${labels[c.name] ?? c.name}: ${c.ok ? 'Passed' : 'Needs Wiring'} — ${c.detail}`).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = 'sori-doctor.log'; a.click(); URL.revokeObjectURL(a.href); setLog('Doctor log exported.');
  };
  return <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
    <header className="flex flex-wrap items-end justify-between gap-4"><div>
      <h1 className="sori-page-heading">System diagnostics</h1>
      <p className="sori-body-text mt-1">Check runtime health and dictation readiness.</p>
      <p className="sori-meta-text mt-2">Source: {runtimeSource} · Activity: {runtimeStatus?.activity ?? 'unknown'}{runtimeError ? ` · ${runtimeError}` : ''}</p>
    </div><button className="sori-tactile-btn rounded-xl px-4 py-2.5 text-sm" onClick={refresh} disabled={loading}><RefreshCw className={`mr-1 inline h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Run Doctor Check</button></header>
    {log && <div role="status" className="rounded-xl border border-[var(--sori-success-border)] bg-[var(--sori-success-bg)] p-3 text-xs text-[var(--sori-success-text)]">{log}</div>}
    <section className="sori-pane p-5"><div className="flex items-center justify-between border-b border-[var(--sori-border-default)] pb-3"><h2 className="sori-section-heading"><ClipboardList className="mr-2 inline h-5 w-5 text-[var(--sori-text-tertiary)]" />System integrity checklist</h2><span className="text-xs text-[var(--sori-text-secondary)]">{rows.filter((c) => c.ok).length}/{rows.length} ready</span></div><div className="divide-y divide-[var(--sori-border-default)]">{rows.map((c) => <div key={c.name} className="grid gap-2 py-3 md:grid-cols-[24px_190px_1fr_auto] md:items-center"><div>{c.ok ? <CheckCircle2 className="h-4 w-4 text-[var(--sori-success-text)]" /> : <AlertTriangle className="h-4 w-4 text-[var(--sori-warning-text)]" />}</div><div className="text-sm font-medium">{labels[c.name] ?? c.name}</div><div className="sori-meta-text">{c.detail}</div><span className={`w-fit rounded-full px-2.5 py-1 text-[11px] ${c.ok ? 'bg-[var(--sori-success-bg)] text-[var(--sori-success-text)]' : 'bg-[var(--sori-warning-bg)] text-[var(--sori-warning-text)]'}`}>{c.ok ? 'Passed' : 'Needs Wiring'}</span></div>)}</div></section>
    <div className="flex flex-wrap items-center justify-end gap-3"><button className="sori-tactile-btn rounded-lg px-3 py-2 text-xs" onClick={exportLog}><Download className="mr-1 inline h-4 w-4" />View / export logs</button></div>
  </div>;
};
