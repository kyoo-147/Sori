import React from 'react';
import { ExtensionItem } from '../../types';
import {
  Calendar,
  MessageSquare,
  Github,
  CheckCircle2,
  FileText,
  Video,
} from 'lucide-react';

interface ExtensionsSandboxScreenProps {
  extensions: ExtensionItem[];
  setExtensions: React.Dispatch<React.SetStateAction<ExtensionItem[]>>;
}

export const ExtensionsSandboxScreen: React.FC<ExtensionsSandboxScreenProps> = () => {
  return (
    <div className="max-w-4xl mx-auto p-6 md:p-8 space-y-8 text-[#1C1B19]">
      {/* Heading */}
      <div className="border-b border-[rgba(92,84,75,0.08)] pb-4 space-y-1.5">
        <h1 className="sori-page-heading">Integrations & Extensions</h1>
        <p className="sori-body-text">
          Connect local app extensions and workspace integrations for voice dictation and workflow triggers.
        </p>
      </div>

      {/* Connected Integrations Section */}
      <div className="space-y-3">
        <div className="text-[11px] font-semibold text-[#98928A] uppercase tracking-wider">
          Connected Integrations
        </div>

        <div className="bg-[rgba(255,253,249,0.92)] border border-[rgba(92,84,75,0.12)] rounded-[16px] p-4 shadow-2xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-9 h-9 rounded-[10px] bg-[rgba(236,238,235,0.8)] text-[#1C1B19] border border-[rgba(92,84,75,0.1)] flex items-center justify-center shrink-0 font-semibold">
              <Calendar className="w-4 h-4 text-[#6E7A80]" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[#1C1B19] flex items-center gap-2">
                <span>Google Calendar</span>
                <span className="text-[10px] font-mono text-[#4E7A61] bg-[#EAF3ED] px-2 py-0.5 rounded-[6px] border border-[rgba(78,122,97,0.22)] font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-[#4E7A61]" /> Connected
                </span>
              </div>
              <div className="text-[11px] text-[#98928A] font-mono mt-0.5">
                alex@company.com • Auto-detect calendar meeting events
              </div>
            </div>
          </div>

          <button className="sori-tactile-btn px-3.5 py-1.5 rounded-[8px] text-xs font-medium">
            Configure
          </button>
        </div>
      </div>

      {/* Available Extensions List */}
      <div className="space-y-3">
        <div className="text-[11px] font-semibold text-[#98928A] uppercase tracking-wider">
          Available Extensions
        </div>

        <div className="bg-[rgba(251,249,246,0.85)] border border-[rgba(92,84,75,0.12)] rounded-[16px] divide-y divide-[rgba(92,84,75,0.06)] overflow-hidden shadow-2xs">
          {/* Extension Row: Slack */}
          <div className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-[rgba(242,238,232,0.4)] transition-colors">
            <div className="flex items-center gap-3.5">
              <div className="w-8 h-8 rounded-[8px] bg-white border border-[rgba(92,84,75,0.1)] flex items-center justify-center text-[#68635D]">
                <MessageSquare className="w-4 h-4 text-[#6E7A80]" />
              </div>
              <div>
                <div className="text-xs font-semibold text-[#1C1B19]">Slack Voice Channel Dictation</div>
                <div className="text-[11px] text-[#98928A]">Direct text injection into active Slack channels with audio snippets</div>
              </div>
            </div>

            <button className="sori-tactile-btn px-3 py-1.5 rounded-[8px] text-xs font-medium">
              Enable Extension
            </button>
          </div>

          {/* Extension Row: GitHub */}
          <div className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-[rgba(242,238,232,0.4)] transition-colors">
            <div className="flex items-center gap-3.5">
              <div className="w-8 h-8 rounded-[8px] bg-white border border-[rgba(92,84,75,0.1)] flex items-center justify-center text-[#68635D]">
                <Github className="w-4 h-4 text-[#6E7A80]" />
              </div>
              <div>
                <div className="text-xs font-semibold text-[#1C1B19]">GitHub PR & Issue Voice Reviewer</div>
                <div className="text-[11px] text-[#98928A]">Dictate PR reviews and inline code comments directly into GitHub</div>
              </div>
            </div>

            <button className="sori-tactile-btn px-3 py-1.5 rounded-[8px] text-xs font-medium">
              Enable Extension
            </button>
          </div>

          {/* Extension Row: Notion */}
          <div className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-[rgba(242,238,232,0.4)] transition-colors">
            <div className="flex items-center gap-3.5">
              <div className="w-8 h-8 rounded-[8px] bg-white border border-[rgba(92,84,75,0.1)] flex items-center justify-center text-[#68635D]">
                <FileText className="w-4 h-4 text-[#6E7A80]" />
              </div>
              <div>
                <div className="text-xs font-semibold text-[#1C1B19]">Notion Meeting Notes Sync</div>
                <div className="text-[11px] text-[#98928A]">Stream clean transcripts and voice summaries to target Notion pages</div>
              </div>
            </div>

            <button className="sori-tactile-btn px-3 py-1.5 rounded-[8px] text-xs font-medium">
              Enable Extension
            </button>
          </div>

          {/* Extension Row: Zoom / Teams */}
          <div className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-[rgba(242,238,232,0.4)] transition-colors">
            <div className="flex items-center gap-3.5">
              <div className="w-8 h-8 rounded-[8px] bg-white border border-[rgba(92,84,75,0.1)] flex items-center justify-center text-[#68635D]">
                <Video className="w-4 h-4 text-[#6E7A80]" />
              </div>
              <div>
                <div className="text-xs font-semibold text-[#1C1B19]">Zoom & MS Teams Meeting Capture</div>
                <div className="text-[11px] text-[#98928A]">Local audio loopback transcription for video calls without cloud bots</div>
              </div>
            </div>

            <button className="sori-tactile-btn px-3 py-1.5 rounded-[8px] text-xs font-medium">
              Enable Extension
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


