import React, { useState } from 'react';
import { ExtensionItem } from '../../types';
import { Calendar, MessageSquare, Github, CheckCircle2, FileText, Video } from 'lucide-react';

interface ExtensionsSandboxScreenProps {
  extensions: ExtensionItem[];
  setExtensions: React.Dispatch<React.SetStateAction<ExtensionItem[]>>;
}

const availableExtensions = [
  ['ext-slack', 'Slack Voice Channel Dictation', 'Direct text injection into active Slack channels with audio snippets', MessageSquare],
  ['ext-github-review', 'GitHub PR & Issue Voice Reviewer', 'Dictate PR reviews and inline code comments directly into GitHub', Github],
  ['ext-notion', 'Notion Transcript Sync', 'Stream clean transcripts and voice summaries to target Notion pages', FileText],
  ['ext-meetings', 'Zoom & MS Teams Meeting Capture', 'Local audio loopback transcription for video calls without cloud bots', Video],
] as const;

export const ExtensionsSandboxScreen: React.FC<ExtensionsSandboxScreenProps> = ({ extensions, setExtensions }) => {
  const [configuredId, setConfiguredId] = useState<string | null>(null);

  const togglePreview = (id: string) => {
    setExtensions((current) => {
      const existing = current.find((extension) => extension.id === id);
      if (!existing) {
        const definition = availableExtensions.find(([extensionId]) => extensionId === id);
        if (!definition) return current;
        return [...current, { id, name: definition[1], version: 'preview', description: definition[2], permissions: [], status: 'active', installedAt: new Date().toISOString() }];
      }
      return current.map((extension) => extension.id === id
        ? { ...extension, status: extension.status === 'disabled' ? 'active' : 'disabled' }
        : extension);
    });
  };

  const statusLabel = (status: ExtensionItem['status']) => status === 'active' ? 'Preview enabled' : 'Preview disabled';

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-8 space-y-8 text-[#1C1B19]">
      <div className="border-b border-[rgba(92,84,75,0.08)] pb-4 space-y-1.5">
        <h1 className="sori-page-heading">Extensions</h1>
        <p className="sori-body-text">Review local extension settings and preview their UI state.</p>
      </div>

      <div role="status" className="rounded-[12px] border border-[#D5E0EA] bg-[#EEF2F6] p-3 text-xs text-[#24384C]">
        <strong>Extension runtime not installed yet.</strong> These controls only change this local preview; they do not connect accounts, inject text, or run extension commands.
      </div>

      <div className="space-y-3">
        <div className="text-[11px] font-semibold text-[#98928A] uppercase tracking-wider">Installed Extensions (preview)</div>
        <div className="bg-[rgba(255,253,249,0.92)] border border-[rgba(92,84,75,0.12)] rounded-[16px] divide-y divide-[rgba(92,84,75,0.06)] overflow-hidden shadow-2xs">
          {extensions.map((extension) => (
            <div key={extension.id} className="p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-[10px] bg-[rgba(236,238,235,0.8)] border border-[rgba(92,84,75,0.1)] flex items-center justify-center shrink-0">
                  {extension.id.includes('spotify') ? <MessageSquare className="w-4 h-4 text-[#6E7A80]" /> : <Calendar className="w-4 h-4 text-[#6E7A80]" />}
                </div>
                <div>
                  <div className="text-xs font-semibold flex items-center gap-2">
                    <span>{extension.name}</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-[6px] border flex items-center gap-1 ${extension.status === 'active' ? 'text-[#4E7A61] bg-[#EAF3ED] border-[rgba(78,122,97,0.22)]' : 'text-[#98928A] bg-[#F3F1EE] border-[rgba(92,84,75,0.12)]'}`}>
                      <CheckCircle2 className="w-3 h-3" /> {statusLabel(extension.status)}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#98928A] font-mono mt-0.5">v{extension.version} • Runtime unavailable</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfiguredId(configuredId === extension.id ? null : extension.id)} aria-expanded={configuredId === extension.id} className="sori-tactile-btn px-3.5 py-1.5 rounded-[8px] text-xs font-medium">Configure preview</button>
                <button type="button" onClick={() => togglePreview(extension.id)} aria-pressed={extension.status === 'active'} className="sori-tactile-btn px-3.5 py-1.5 rounded-[8px] text-xs font-medium">{extension.status === 'active' ? 'Disable preview' : 'Enable preview'}</button>
              </div>
              {configuredId === extension.id && <p className="basis-full text-[11px] text-[#5F6368] bg-[#F8F8F7] rounded-[8px] p-2">Configuration is a local preview only. Permissions and account connections will be available when the extension runtime is installed.</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-[11px] font-semibold text-[#98928A] uppercase tracking-wider">Available Extensions</div>
        <div className="bg-[rgba(251,249,246,0.85)] border border-[rgba(92,84,75,0.12)] rounded-[16px] divide-y divide-[rgba(92,84,75,0.06)] overflow-hidden shadow-2xs">
          {availableExtensions.map(([id, name, description, Icon]) => {
            const extension = extensions.find((item) => item.id === id);
            const enabled = extension?.status === 'active';
            return <div key={id} className="p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3.5"><div className="w-8 h-8 rounded-[8px] bg-white border border-[rgba(92,84,75,0.1)] flex items-center justify-center"><Icon className="w-4 h-4 text-[#6E7A80]" /></div><div><div className="text-xs font-semibold">{name}</div><div className="text-[11px] text-[#98928A]">{description}</div></div></div>
              <button type="button" onClick={() => togglePreview(id)} aria-pressed={enabled} className="sori-tactile-btn px-3 py-1.5 rounded-[8px] text-xs font-medium">{enabled ? 'Disable preview' : 'Enable preview'}</button>
              <span className="basis-full text-[10px] text-[#98928A]">{enabled ? 'Local preview enabled; runtime still unavailable.' : 'Preview only — no runtime action.'}</span>
            </div>;
          })}
        </div>
      </div>
    </div>
  );
};
