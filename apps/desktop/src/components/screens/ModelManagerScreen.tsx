import React, { useEffect, useMemo, useState } from 'react';
import { Cloud, Cpu, HardDrive, RefreshCw, Trash2 } from 'lucide-react';
import type { RuntimeClient } from '../../runtime-client';
import type { ModelRecord } from '../../types';

type RouteState = { activeModelId: string | null; policy: string; fallbackModelIds: string[] };
interface Props { runtimeClient: RuntimeClient; onActiveModelChanged?: (modelId: string | null) => void }
const policies = ['LocalFirst', 'Balanced', 'Performance', 'Battery', 'Privacy', 'CloudAllowed', 'NeverCloud'] as const;

export const ModelManagerScreen: React.FC<Props> = ({ runtimeClient, onActiveModelChanged }) => {
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [route, setRoute] = useState<RouteState | null>(null);
  const [location, setLocation] = useState<'local' | 'cloud'>('local');
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [modelName, setModelName] = useState('');
  const [artifactPath, setArtifactPath] = useState('');
  const [whisperExecutable, setWhisperExecutable] = useState('');
  const [whisperModelDir, setWhisperModelDir] = useState('');
  const [checksum, setChecksum] = useState('');
  const [installDetail, setInstallDetail] = useState<string | null>(null);

  const load = async () => {
    setStatus('loading'); setError(null);
    const [modelsResult, routeResult, configResult] = await Promise.all([runtimeClient.models(), runtimeClient.route<RouteState>(), runtimeClient.resource<{ executable?: string | null; model_dir?: string | null }>('whisper')]);
    if (modelsResult.error || routeResult.error) { setStatus('error'); setError(modelsResult.error ?? routeResult.error); return; }
    if (!configResult.error) { setWhisperExecutable(configResult.data?.executable ?? ''); setWhisperModelDir(configResult.data?.model_dir ?? ''); }
    const nextModels = Array.isArray(modelsResult.data) ? modelsResult.data : [];
    setModels(nextModels); setRoute(routeResult.data); onActiveModelChanged?.(routeResult.data.activeModelId ?? null); setStatus(nextModels.length ? 'ready' : 'empty');
  };
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => models.filter((model) => model.location === location), [models, location]);
  const selectModel = async (id: string) => { setSaving(true); const result = await runtimeClient.setActiveModel(id); if (result.error) setError(result.error); else await load(); setSaving(false); };
  const selectPolicy = async (policy: typeof policies[number]) => { setSaving(true); const result = await runtimeClient.setRoutePolicy(policy); if (result.error) setError(result.error); else await load(); setSaving(false); };
  const lifecycle = async (model: ModelRecord, operation: 'load' | 'warm' | 'unload') => { setSaving(true); setError(null); const result = await (operation === 'load' ? runtimeClient.loadModel(model.id) : operation === 'warm' ? runtimeClient.warmModel(model.id) : runtimeClient.unloadModel(model.id)); if (result.error) setError(result.error); else await load(); setSaving(false); };
  const removeModel = async (model: ModelRecord) => { if (route?.activeModelId === model.id) return; setSaving(true); setError(null); const result = await runtimeClient.removeModel(model.id); if (result.error) setError(result.error); else await load(); setSaving(false); };
  const importModel = async () => {
    const name = modelName.trim(); const source = artifactPath.trim(); const digest = checksum.trim();
    if (!name || !source || !/^[0-9a-fA-F]{64}$/.test(digest)) { setInstallDetail('Import requires a model filename, an existing local artifact path, and its 64-character SHA-256 checksum.'); return; }
    setSaving(true); setError(null); setInstallDetail('Verifying checksum and importing the user-owned artifact…');
    const operation = runtimeClient.installModel(name, source, digest);
    const poll = window.setInterval(() => { void runtimeClient.modelStatus(name).then((result) => { const status = result.data as { status?: { progress_percent?: number | null; phase?: string | null } } | null; const percent = status?.status?.progress_percent; const phase = status?.status?.phase ?? 'provider'; if (!result.error && typeof percent === 'number') setInstallDetail(`Importing… ${percent}% (${phase})`); }); }, 250);
    const result = await operation;
    window.clearInterval(poll);
    if (result.error) { setError(result.error); setInstallDetail('Import failed; no model was selected or reported ready.'); }
    else { setInstallDetail('Import completed. Readiness below is reported by the configured provider.'); setModelName(''); setArtifactPath(''); setChecksum(''); await load(); }
    setSaving(false);
  };

  const saveRuntimeConfig = async () => {
    setSaving(true); setError(null);
    const result = await runtimeClient.setResource('whisper', { executable: whisperExecutable.trim(), model_dir: whisperModelDir.trim() || null });
    if (result.error) setError(result.error); else setInstallDetail('Runtime paths saved. Restart sorid to rediscover the configured executable and models.');
    setSaving(false);
  };

  return <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
    <header><h1 className="sori-page-heading">Models &amp; Routing</h1><p className="sori-body-text mt-1">Choose a canonical runtime route. Sori persists changes in the daemon, not browser state.</p></header>
    <section className="sori-pane space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E0D9] pb-4"><div><h2 className="sori-section-heading">Active route</h2><p className="sori-meta-text mt-1">{route ? `${route.policy} · ${route.activeModelId ?? 'No model selected'}` : 'Loading route…'}</p></div><button className="sori-tactile-btn rounded-lg px-3 py-2 text-xs" onClick={() => void load()} disabled={status === 'loading'}><RefreshCw className="mr-1 inline h-4 w-4"/>Refresh</button></div>
      <div className="flex flex-wrap gap-2">{policies.map((policy) => <button key={policy} className={`rounded-full border px-3 py-1.5 text-xs ${route?.policy === policy ? 'bg-[#ECEEEB] border-[#B9C0BF] font-medium' : 'border-[#E5E0D9] text-[#68635D]'}`} disabled={saving} onClick={() => void selectPolicy(policy)}>{policy}</button>)}</div>
      <div className="rounded-xl border border-[#E5E0D9] bg-[#FFFDF9] p-4 space-y-3"><div><h3 className="text-sm font-medium">Whisper runtime configuration</h3><p className="sori-meta-text mt-1">Configure a user-owned whisper.cpp executable and model directory. Paths persist in SQLite and are applied on daemon restart.</p></div><div className="grid gap-2 md:grid-cols-2"><input aria-label="Whisper executable path" className="rounded-lg border border-[#E5E0D9] bg-white p-2 text-xs" placeholder="whisper-cli.exe path" value={whisperExecutable} onChange={(event) => setWhisperExecutable(event.target.value)} /><input aria-label="Whisper model directory" className="rounded-lg border border-[#E5E0D9] bg-white p-2 text-xs" placeholder="Whisper model directory" value={whisperModelDir} onChange={(event) => setWhisperModelDir(event.target.value)} /></div><button type="button" className="sori-tactile-btn rounded-lg px-3 py-2 text-xs disabled:opacity-50" disabled={saving} onClick={() => void saveRuntimeConfig()}>Save runtime paths</button></div>
      <div className="rounded-xl border border-[#E5E0D9] bg-[#FFFDF9] p-4 space-y-3"><div><h3 className="text-sm font-medium">Import a user-owned Whisper model</h3><p className="sori-meta-text mt-1">Sori never bundles or downloads weights. The daemon verifies the checksum, imports atomically, and discovers only real files in its configured model directory.</p></div><div className="grid gap-2 md:grid-cols-3"><input aria-label="Model filename" className="rounded-lg border border-[#E5E0D9] bg-white p-2 text-xs" placeholder="ggml-base.en.bin" value={modelName} onChange={(event) => setModelName(event.target.value)} /><input aria-label="Model artifact path" className="rounded-lg border border-[#E5E0D9] bg-white p-2 text-xs" placeholder="Local artifact path" value={artifactPath} onChange={(event) => setArtifactPath(event.target.value)} /><input aria-label="Model SHA-256 checksum" className="rounded-lg border border-[#E5E0D9] bg-white p-2 text-xs" placeholder="SHA-256 checksum" value={checksum} onChange={(event) => setChecksum(event.target.value)} /></div><div className="flex flex-wrap items-center gap-3"><button type="button" className="sori-tactile-btn rounded-lg px-3 py-2 text-xs disabled:opacity-50" disabled={saving} onClick={() => void importModel()}>{saving ? 'Importing…' : 'Import and verify model'}</button>{installDetail && <span role="status" className="text-xs text-[#68635D]">{installDetail}</span>}</div></div>
      <div className="flex gap-4 border-b border-[#E5E0D9]"><button className={`border-b-2 pb-2 text-sm ${location === 'local' ? 'border-[#6E7A80] font-semibold' : 'border-transparent text-[#68635D]'}`} onClick={() => setLocation('local')}><HardDrive className="mr-1 inline h-4 w-4"/>Local</button><button className={`border-b-2 pb-2 text-sm ${location === 'cloud' ? 'border-[#6E7A80] font-semibold' : 'border-transparent text-[#68635D]'}`} onClick={() => setLocation('cloud')}><Cloud className="mr-1 inline h-4 w-4"/>Cloud</button></div>
      {status === 'loading' && <div className="p-8 text-center text-sm text-[#68635D]">Loading the daemon model registry…</div>}
      {status === 'error' && <div className="rounded-lg border border-[#EBD9A8] bg-[#FFF7E6] p-4 text-sm text-[#6B552C]">{error ?? 'Model registry unavailable.'} <button className="ml-2 underline" onClick={() => void load()}>Retry</button></div>}
      {status === 'empty' && <div className="p-8 text-center text-sm text-[#68635D]">No models are registered by sorid. Import a user-owned artifact or configure the runtime before selecting a route.</div>}
      {status === 'ready' && !visible.length && <div className="p-8 text-center text-sm text-[#68635D]">No {location} models are registered. Cloud routing does not send requests without a configured provider.</div>}
      <div className="space-y-2">{visible.map((model) => { const active = route?.activeModelId === model.id; return <div key={model.id} className={`flex items-center gap-3 rounded-xl border p-3.5 ${active ? 'bg-[#F2EEE8] border-[#C9C1B7]' : 'border-[#E5E0D9]'}`}><button aria-label={`Select ${model.name}`} aria-pressed={active} disabled={!model.available || saving} onClick={() => void selectModel(model.id)} className={`h-5 w-5 rounded-full border-2 ${active ? 'border-[#6E7A80] bg-[#6E7A80] shadow-[inset_0_0_0_3px_#FFFDF9]' : 'border-[#C9C1B7]'}`}/><Cpu className="h-8 w-8 rounded-lg bg-[#FFFDF9] p-2 text-[#6E7A80]"/><div className="min-w-0 flex-1"><div className="text-sm font-medium">{model.name} {model.recommended && <span className="ml-2 rounded-full bg-[#ECEEEB] px-2 py-0.5 text-[10px]">Recommended</span>}</div><div className="sori-meta-text">{model.provider} · {model.available ? 'Available' : model.unavailableReason ?? 'Unavailable'} · {model.warm ? 'Warm' : model.loaded ? 'Loaded' : 'Not loaded'}</div></div><span className="rounded-full border border-[#E5E0D9] px-2.5 py-1 text-[11px]">{model.qualityTier}</span><div className="flex gap-1"><button type="button" disabled={!model.available || saving} onClick={() => void lifecycle(model, model.warm ? 'unload' : 'warm')} className="sori-tactile-btn rounded-lg px-2 py-1 text-[11px] disabled:opacity-40">{model.warm ? 'Unload' : 'Warm'}</button><button type="button" disabled={active || saving} onClick={() => void removeModel(model)} className="sori-tactile-btn rounded-lg p-2 text-[#A75850] disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button></div></div>; })}</div>
    </section>
  </div>;
};
