import React, { useEffect, useState } from 'react';
import { Check, FileText, Github, MessageSquare, Puzzle, Settings2 } from 'lucide-react';
import type { ExtensionItem } from '../../types';
import type { ExtensionRecord } from '../../ipc-contract';
import type { RuntimeClient, RuntimeSource } from '../../runtime-client';

interface Props { runtimeClient: RuntimeClient; }

function toItem(record: ExtensionRecord): ExtensionItem {
  return { id: record.manifest.id, name: record.manifest.name, version: record.manifest.version, description: record.manifest.description, permissions: record.manifest.permissions, status: record.state === 'enabled' ? 'active' : record.state === 'disabled' ? 'disabled' : 'needs_approval', installedAt: new Date(record.installed_at * 1000).toISOString() };
}
function iconFor(id: string) { return id.includes('github') ? Github : id.includes('slack') ? MessageSquare : id.includes('notion') ? FileText : Puzzle; }

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

  return <div className="sori-screen sori-page-layout space-y-6">
    <header><h1 className="sori-page-heading">Integrations &amp; Extensions</h1><p className="sori-body-text mt-1">Connect tools and control the permissions Sori would need.</p></header>
    <div role="status" className="rounded-xl border border-[var(--sori-warning-border)] bg-[var(--sori-warning-bg)] p-3 text-xs text-[var(--sori-warning-text)]">{error ? `Extension runtime unavailable: ${error}` : `Canonical extension state from ${source}. Install, account authentication, and command execution are Unavailable.`}</div>
    {loading && <div role="status" className="sori-meta-text">Loading canonical extension state…</div>}
    <section className="sori-pane space-y-3 p-5" aria-labelledby="extension-catalog-heading"><h2 id="extension-catalog-heading" className="sori-section-heading">Extension catalog</h2><div className="rounded-xl border border-[var(--sori-warning-border)] bg-[var(--sori-warning-bg)] p-4"><p className="text-sm font-medium text-[var(--sori-warning-text)]">Catalog unavailable</p><p className="sori-meta-text mt-1">This build does not expose a trusted extension catalog or installation flow. No extensions are presented as available.</p></div></section>
    {(notice) && <p className="text-xs text-[var(--sori-warning-text)]" role="status">{notice}</p>}
  </div>;
};
