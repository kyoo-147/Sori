import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Download, Fingerprint, Lock, Trash2, Volume2 } from 'lucide-react';
import { HistoryItem, VoiceProfile } from '../../types';
import type { RuntimeClient } from '../../runtime-client';

interface Props {
  voiceProfile: VoiceProfile;
  setVoiceProfile: React.Dispatch<React.SetStateAction<VoiceProfile>>;
  history: HistoryItem[];
  setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>;
  runtimeClient: RuntimeClient;
}

export const VoiceIdentityScreen: React.FC<Props> = ({ voiceProfile, setVoiceProfile, history, setHistory, runtimeClient }) => {
  const [save, setSave] = useState(true);
  const [retention, setRetention] = useState(30);
  const [policy] = useState(voiceProfile.guestPolicy);
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [configState, setConfigState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void runtimeClient.configSummary().then((result) => {
      if (result.error || !result.data) { setConfigState('unavailable'); setError(result.error ?? 'Runtime configuration is unavailable.'); return; }
      setSave(result.data.history_enabled);
      setRetention(result.data.history_retention_limit);
      setConfigState('ready');
    });
  }, [runtimeClient]);

  useEffect(() => {
    if (!confirm) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>('[data-dialog-initial-focus]')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setConfirm(false);
        setTyped('');
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])')).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [confirm]);

  const updateConfig = async (key: string, value: unknown, onSuccess: () => void) => {
    setError('');
    const result = await runtimeClient.setConfig(key, value);
    if (result.error || !result.data.accepted) {
      setError(result.error ?? result.data.detail);
      return;
    }
    onSuccess();
    setMsg('Setting saved by sorid.');
  };
  const deleteData = async () => {
    if (typed !== 'DELETE' || busy) return;
    setBusy(true);
    setError('');
    const result = await runtimeClient.purgeHistory();
    setBusy(false);
    if (result.error || !result.data.accepted) {
      setError(result.error ?? result.data.detail);
      return;
    }
    setHistory([]);
    setConfirm(false);
    setTyped('');
    setMsg('History permanently cleared from SQLite.');
  };
  const exportData = async () => {
    const result = await runtimeClient.history(365);
    if (result.error) { setError(`Export unavailable: ${result.error}`); return; }
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), history: result.data }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'sori-local-data.json'; a.click(); URL.revokeObjectURL(url);
    setMsg('Export downloaded from authoritative persisted history.');
  };
  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => <button type="button" role="switch" aria-checked={value} onClick={() => onChange(!value)} className={`h-6 w-11 rounded-full p-1 ${value ? 'bg-[var(--sori-accent-primary)]' : 'bg-[var(--sori-fill-disabled)]'}`}><span className={`block h-4 w-4 rounded-full bg-[var(--sori-bg-panel)] transition-transform ${value ? 'translate-x-5' : ''}`} /></button>;
  return <div className="sori-screen sori-page-layout space-y-6">
    <header><h1 className="sori-page-heading">Privacy &amp; Data Control</h1><p className="sori-body-text mt-1">Data stays on this device unless you choose otherwise.</p></header>
    {configState === 'loading' && <div role="status" className="rounded-xl border border-[var(--sori-border-soft)] bg-[var(--sori-bg-panel-subtle)] p-3 text-xs text-[var(--sori-text-secondary)]">Loading persisted privacy settings…</div>}
    {msg && <div role="status" className="rounded-xl border border-[var(--sori-success-border)] bg-[var(--sori-success-bg)] p-3 text-xs text-[var(--sori-success-text)]">{msg}</div>}
    {error && <div role="alert" className="rounded-xl border border-[var(--sori-error-border)] bg-[var(--sori-error-bg)] p-3 text-xs text-[var(--sori-error-text)]">Privacy operation unavailable: {error}</div>}
    <div className="grid gap-5 lg:grid-cols-2"><section className="sori-pane space-y-4 p-5"><h2 className="sori-section-heading">Local data &amp; retention</h2>
      <div className="flex items-center gap-3 rounded-xl border border-[var(--sori-border-soft)] p-3"><Volume2 className="h-5 w-5 text-[var(--sori-text-tertiary)]" /><div className="flex-1"><div className="text-sm font-medium">Save transcript history</div><div className="sori-meta-text">Persist transcripts locally for search and review.</div></div><Toggle value={save} onChange={(value) => updateConfig('history.enabled', value, () => setSave(value))} /></div>
      <label className="block rounded-xl border border-[var(--sori-border-soft)] p-3 text-sm font-medium">History retention limit <output className="float-right font-mono">{retention} entries</output><input aria-label="History retention limit" type="range" min="1" max="365" value={retention} onChange={(e) => { const value = Number(e.target.value); updateConfig('history.retention_limit', value, () => setRetention(value)); }} className="mt-4 w-full accent-[var(--sori-accent-primary)]" /></label>
      <div className="flex items-center gap-3 rounded-xl border border-[var(--sori-border-soft)] p-3"><Lock className="h-5 w-5 text-[var(--sori-text-tertiary)]" /><div><div className="text-sm font-medium">Ephemeral audio processing</div><div className="sori-meta-text">Audio is not written to disk by sorid.</div></div><span className="ml-auto rounded-full bg-[var(--sori-success-bg)] px-2 py-1 text-xs text-[var(--sori-success-text)]">Enabled</span></div>
    </section><section className="sori-pane space-y-4 p-5"><h2 className="sori-section-heading">Voice lock &amp; access</h2><div className="flex items-center gap-3 rounded-xl border border-[var(--sori-border-soft)] p-3"><Fingerprint className="h-5 w-5 text-[var(--sori-text-tertiary)]" /><div className="flex-1"><div className="text-sm font-medium">Voice Lock (Biometric)</div><div className="sori-meta-text">Hardware capture and biometric verification are UNVERIFIED.</div></div><span className="rounded-full bg-[var(--sori-warning-bg)] px-2 py-1 text-xs text-[var(--sori-warning-text)]">Unavailable</span></div><label className="block text-sm font-medium">Require owner verification<select className="sori-control mt-2 w-full rounded-lg p-2 text-[var(--sori-text-tertiary)]" value={policy} disabled aria-label="Require owner verification unavailable" title="Voice verification configuration is not exposed by canonical IPC"><option value="off">Unavailable — allow all speakers</option><option value="guest_dictation_only">Sensitive actions only</option><option value="strict_owner_only">Strict owner only</option></select><span className="mt-1 block text-xs font-normal text-[var(--sori-warning-text)]">Unavailable: canonical IPC does not expose voice verification configuration.</span></label><div className="rounded-lg bg-[var(--sori-warning-bg)] p-3 text-xs text-[var(--sori-warning-text)]">Voice enrollment and verification are <b>UNVERIFIED</b>; this UI makes no biometric capability claim.</div></section></div>
    <section className="rounded-2xl border border-[var(--sori-error-border)] bg-[var(--sori-error-bg)] p-5"><div className="flex items-center gap-2 text-[var(--sori-error-text)]"><AlertTriangle className="h-4 w-4" /><h2 className="font-semibold">Danger zone</h2></div><p className="mt-2 text-xs text-[var(--sori-error-text)]">Delete or export data through the canonical local runtime.</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" className="rounded-lg border border-[var(--sori-error-border)] px-3 py-2 text-xs text-[var(--sori-error-text)]" onClick={() => setConfirm(true)}><Trash2 className="mr-1 inline h-4 w-4" />Delete local history</button><button type="button" className="sori-tactile-btn rounded-lg px-3 py-2 text-xs" onClick={exportData}><Download className="mr-1 inline h-4 w-4" />Export local data</button></div></section>
    {confirm && <div className="sori-overlay fixed inset-0 z-50 flex items-center justify-center p-4"><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="delete-history-title" aria-describedby="delete-history-description" className="w-full max-w-md rounded-2xl bg-[var(--sori-bg-panel)] p-6"><h2 id="delete-history-title" className="sori-section-heading">Delete local history?</h2><p id="delete-history-description" className="sori-body-text mt-2">This permanently purges persisted SQLite history. Type DELETE to confirm.</p><input data-dialog-initial-focus className="sori-control mt-4 w-full rounded-lg p-2 font-mono" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" aria-label="Type DELETE to confirm" /><div className="mt-5 flex justify-end gap-2"><button type="button" className="px-3 py-2 text-sm" onClick={() => { setConfirm(false); setTyped(''); }}>Cancel</button><button type="button" disabled={typed !== 'DELETE' || busy} className="rounded-lg bg-[var(--sori-error-text)] px-3 py-2 text-sm text-white disabled:opacity-40" onClick={deleteData}>{busy ? 'Deleting…' : 'Delete permanently'}</button></div></div></div>}</div>;
};
