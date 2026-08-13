import React, { useState } from 'react';
import { AlertTriangle, Check, Eye, FileCode2, LoaderCircle } from 'lucide-react';
import type { RuntimeClient } from '../../runtime-client';
import type { AppSettings } from '../../types';

interface Props { settings: AppSettings; runtimeSource?: 'native' | 'backend' | 'mock' | 'unavailable'; runtimeClient: RuntimeClient; }
type State = 'selection' | 'capturing' | 'preview' | 'blocked' | 'applied' | 'error';

export const VoiceEditScreen: React.FC<Props> = ({ runtimeSource = 'unavailable', runtimeClient }) => {
  const [instruction, setInstruction] = useState('trim whitespace');
  const [selection, setSelection] = useState<{ target_identity: string; text: string } | null>(null);
  const [preview, setPreview] = useState<{ diff: string; transformed_text: string } | null>(null);
  const [state, setState] = useState<State>('selection');
  const [detail, setDetail] = useState('Select text in the focused editor, then capture an instruction.');
  const connected = runtimeSource === 'native' || runtimeSource === 'backend';

  const detectSelection = () => {
    const text = globalThis.getSelection?.()?.toString() ?? '';
    if (!text.trim()) { setSelection(null); setState('blocked'); setDetail('No browser selection is available. Native focused-app selection detection is UNAVAILABLE until sorid exposes a target-selection provider.'); return; }
    setSelection({ target_identity: 'browser:selection', text }); setState('selection'); setDetail('Selection captured from the current browser document.');
  };
  const captureInstruction = async () => {
    if (!connected) { setState('blocked'); setDetail('Instruction capture is UNAVAILABLE without a connected sorid runtime.'); return; }
    setState('capturing'); setDetail('Listening through canonical DictationStart/DictationStop IPC…');
    const started = await runtimeClient.dictationStart();
    if (started.error || !started.data.accepted) { setState('error'); setDetail(started.error ?? started.data.detail); return; }
    const stopped = await runtimeClient.dictationStop();
    if (stopped.error || !stopped.data) { setState('error'); setDetail(stopped.error ?? 'ASR returned no instruction.'); return; }
    setInstruction(stopped.data.text); setState('selection'); setDetail('Instruction captured from daemon ASR.');
  };
  const runPreview = async () => {
    if (!selection) { setState('blocked'); setDetail('Preview requires a real captured selection.'); return; }
    setState('capturing'); const result = await runtimeClient.voiceEdit(selection, instruction, false);
    if (result.error || !result.data?.diff || !result.data.transformed_text) { setState('error'); setDetail(result.error ?? result.data?.detail ?? 'Voice Edit preview is unavailable.'); return; }
    setPreview({ diff: result.data.diff, transformed_text: result.data.transformed_text }); setState('preview'); setDetail('Review this diff. Nothing has been injected.');
  };
  const apply = async () => {
    if (!selection || !preview) return;
    setState('capturing'); const result = await runtimeClient.voiceEdit(selection, instruction, true);
    if (result.error || !result.data?.accepted) { setState('error'); setDetail(result.error ?? result.data?.detail ?? 'Target revalidation or injection failed.'); return; }
    setState('applied'); setDetail('Replacement applied through canonical text injection.');
  };
  return <div className="mx-auto max-w-[1180px] space-y-6 p-4 text-[#1C1B19]">
    <header><p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[#98928A]">Review before action</p><h1 className="sori-page-heading">Voice selection edit</h1><p className="sori-body-text mt-1">Capture a real selection and instruction, review the generated diff, then approve replacement.</p></header>
    <div role="status" className="rounded-xl border border-[#DED9D1] bg-[#F2EEE8] p-3 text-xs">{detail}</div>
    <div className="grid gap-5 lg:grid-cols-[minmax(340px,0.85fr)_minmax(0,1.35fr)]">
      <section className="sori-pane p-5"><h2 className="sori-section-heading">Capture</h2><div className="mt-4 rounded-[14px] border border-[#DED9D1] bg-[#FFFDF9] p-4"><div className="mb-2 flex items-center gap-2 text-xs font-medium"><FileCode2 className="h-4 w-4 text-[#6E7A80]" />{selection ? 'Selection detected' : 'No selection detected'}</div><p className="text-[11px] text-[#98928A]">{selection ? `${selection.text.length} characters · ${selection.target_identity}` : 'Selection identity is required for safe replacement.'}</p></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={detectSelection} className="sori-tactile-btn rounded-[10px] px-3 py-2 text-xs">Detect selection</button><button type="button" onClick={captureInstruction} disabled={state === 'capturing'} className="sori-tactile-btn rounded-[10px] px-3 py-2 text-xs">Capture instruction</button></div><label className="mt-5 block text-xs font-medium">Instruction<textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={3} className="mt-2 w-full rounded-[12px] border border-[#DED9D1] bg-[#FFFDF9] p-3 text-sm leading-6 outline-none" /></label></section>
      <section className="sori-pane p-5"><div className="flex items-center justify-between"><div><h2 className="sori-section-heading">Diff preview</h2><p className="sori-meta-text mt-1">Approval is required; target is revalidated before injection.</p></div><button type="button" onClick={runPreview} disabled={!selection || state === 'capturing'} className="sori-tactile-btn rounded-[10px] px-3 py-2 text-xs"><Eye className="mr-1 inline h-3.5 w-3.5" />Generate diff</button></div>{state === 'capturing' ? <div className="flex min-h-[180px] items-center justify-center"><LoaderCircle className="h-6 w-6 animate-spin text-[#6E7A80]" /></div> : preview ? <pre className="mt-4 overflow-auto rounded-xl bg-[#FFFDF9] p-4 text-xs leading-6">{preview.diff}</pre> : <div className="mt-4 rounded-xl border border-dashed border-[#DED9D1] p-8 text-center text-xs text-[#98928A]">No generated diff.</div>}<div className="mt-4 flex items-start gap-2 rounded-[12px] bg-[#F2EEE8] p-3 text-[11px] text-[#68635D]"><AlertTriangle className="h-4 w-4 shrink-0 text-[#9A7442]" />{state === 'applied' ? detail : 'Browser selection detection is not native focused-app evidence.'}</div><button type="button" onClick={apply} disabled={!preview || state === 'capturing' || state === 'applied'} className="mt-4 rounded-[10px] bg-[#1C1B19] px-4 py-2 text-xs font-medium text-[#FFFDF9]"><Check className="mr-1 inline h-3.5 w-3.5" />Approve &amp; replace</button></section>
    </div>
  </div>;
};
