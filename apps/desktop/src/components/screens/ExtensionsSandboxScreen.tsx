import React, { useEffect, useState } from 'react';
import { Calendar, Check, FileText, Github, MessageSquare, Settings2, Video } from 'lucide-react';
import type { ExtensionItem } from '../../types';
import type { ExtensionRecord } from '../../ipc-contract';
import type { RuntimeClient, RuntimeSource } from '../../runtime-client';

interface Props { runtimeClient: RuntimeClient; }
const available = [['ext-slack', 'Slack Voice Channel Dictation', 'Dictate in Slack voice channels with structured transcripts', MessageSquare], ['ext-github-review', 'GitHub PR & Issue Voice Reviewer', 'Review, summarize, and comment on PRs and issues', Github], ['ext-notion', 'Notion Meeting Notes Sync', 'Create and sync meeting notes to Notion', FileText], ['ext-meetings', 'Zoom & MS Teams Meeting Capture', 'Capture and transcribe meetings locally', Video]] as const;

function toItem(record: ExtensionRecord): ExtensionItem {
  return { id: record.manifest.id, name: record.manifest.name, version: record.manifest.version, description: record.manifest.description, permissions: record.manifest.permissions, status: record.state === 'enabled' ? 'active' : record.state === 'disabled' ? 'disabled' : 'needs_approval', installedAt: new Date(record.installed_at * 1000).toISOString() };
}
function iconFor(id: string) { return id.includes('github') ? Github : id.includes('slack') ? MessageSquare : id.includes('notion') ? FileText : Calendar; }

export const ExtensionsSandboxScreen: React.FC<Props> = ({ runtimeClient }) => {
  const [extensions, setExtensions] = useState<ExtensionItem[]>([]);
  const [source, setSource] = useState<RuntimeSource>('unavailable');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const result = await runtimeClient.extensions();
    setError(result.error);
    setSource(result.source);
    if (!result.error) setExtensions(result.data.map(toItem));
    setLoading(false);
  };
  useEffect(() => { refresh().catch((reason) => { setError(String(reason)); setLoading(false); }); }, [runtimeClient]);

  const changeState = async (item: ExtensionItem) => {
    setBusy(item.id); setNotice(null);
    const result = item.status === 'active' ? await runtimeClient.extensionDisable(item.id) : await runtimeClient.extensionEnable(item.id);
    setBusy(null);
    if (result.error || !result.data.accepted) setNotice(`Unavailable: ${result.error ?? result.data.detail}`);
    else { setNotice('Extension state updated by sorid.'); await refresh(); }
  };
  const installedIds = new Set(extensions.map((item) => item.id));

  return <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
    <header><h1 className="sori-page-heading">Integrations &amp; Extensions</h1><p className="sori-body-text mt-1">Connect tools and control the permissions Sori would need.</p></header>
    <div role="status" className="rounded-xl border border-[var(--sori-warning-border)] bg-[var(--sori-warning-bg)] p-3 text-xs text-[var(--sori-warning-text)]">{error ? `Extension runtime unavailable: ${error}` : `Canonical extension state from ${source}. Install, account authentication, and command execution are Unavailable.`}</div>
    {loading && <div role="status" className="sori-meta-text">Loading canonical extension state…</div>}
    <section className="sori-pane space-y-3 p-5"><h2 className="sori-section-heading">Installed extensions</h2>{extensions.length === 0 ? <p className="sori-body-text py-5">No installed extensions reported by sorid.</p> : extensions.map((item) => { const Icon = iconFor(item.id); return <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--sori-border-default)] p-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--sori-fill-hover)]"><Icon className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="text-sm font-medium">{item.name}</div><div className="sori-meta-text">{item.status === 'active' ? 'Enabled by sorid' : item.status === 'disabled' ? 'Disabled by sorid' : 'Runtime reported an error'} · v{item.version}</div></div><span className="rounded-full bg-[var(--sori-fill-hover)] px-2.5 py-1 text-xs">{item.status === 'active' && <Check className="mr-1 inline h-3 w-3" />}{item.status === 'active' ? 'Enabled' : item.status === 'disabled' ? 'Disabled' : 'Error'}</span><button className="sori-tactile-btn rounded-lg px-3 py-2 text-xs" aria-expanded={open === item.id} aria-controls={`extension-details-${item.id}`} onClick={() => setOpen(open === item.id ? null : item.id)}><Settings2 className="mr-1 inline h-3.5 w-3.5" />Configure</button>{open === item.id && <div id={`extension-details-${item.id}`} role="region" aria-label={`${item.name} permissions`} className="basis-full rounded-lg bg-[var(--sori-bg-panel-subtle)] p-3 text-xs text-[var(--sori-text-secondary)]">Permissions: {item.permissions.join(', ') || 'none'}<div className="mt-2 flex gap-2"><button disabled className="rounded-lg border border-[var(--sori-border-default)] px-3 py-1.5 text-[var(--sori-text-tertiary)]" title="Account authentication is not wired">Connect account <span className="sr-only">Unavailable</span></button><button disabled={busy === item.id || source === 'unavailable'} className="rounded-lg border border-[var(--sori-border-default)] px-3 py-1.5" onClick={() => changeState(item)}>{busy === item.id ? 'Updating…' : item.status === 'active' ? 'Disable' : 'Enable'}</button></div></div>}</div>; })}</section>
    <section className="sori-pane space-y-3 p-5"><h2 className="sori-section-heading">Available extensions</h2>{available.map(([id, name, description, Icon]) => <div key={id} className="flex flex-wrap items-center gap-3 border-b border-[var(--sori-border-default)] py-3 last:border-0"><Icon className="h-5 w-5 text-[var(--sori-text-tertiary)]" /><div className="min-w-0 flex-1"><div className="text-sm font-medium">{name}</div><div className="sori-meta-text">{description}</div></div><button disabled className="rounded-lg border border-[var(--sori-border-default)] px-3 py-2 text-xs text-[var(--sori-text-tertiary)]" title="Extension installation is not wired">Install <span className="sr-only">Unavailable</span></button>{installedIds.has(id) && <span className="text-xs text-[var(--sori-text-secondary)]">Installed</span>}</div>)}</section>
    {(notice) && <p className="text-xs text-[var(--sori-warning-text)]" role="status">{notice}</p>}
  </div>;
};
