import React, { useState } from 'react';
import { AppSettings, HistoryItem } from '../../types';
import {
  Mic,
  CheckCircle2,
  Terminal,
  FileCode,
  MessageSquare,
  Sparkles,
  Copy,
  Play,
  Clock,
  BookOpen,
} from 'lucide-react';

interface OverviewScreenProps {
  settings: AppSettings;
  isListening: boolean;
  toggleListening: () => void;
  onNavigate: (screen: any) => void;
  history: HistoryItem[];
  activeModelName: string;
  runtimeAvailable?: boolean;
}

export const OverviewScreen: React.FC<OverviewScreenProps> = ({
  settings,
  isListening,
  toggleListening,
  onNavigate,
  history,
  runtimeAvailable = true,
}) => {
  const [activeAppMock, setActiveAppMock] = useState<'vscode' | 'terminal' | 'slack'>('vscode');
  const [inputText, setInputText] = useState<string>(
    'Short, friendly email to my team asking if we can review the new design system PR today.'
  );
  const [lastInserted, setLastInserted] = useState<string>('');

  const sampleVoicePrompts = [
    { label: 'Dictate Vietnamese comment', text: '// Cấu hình ASR router với độ trễ dưới 100ms' },
    { label: 'Dictate Rust code snippet', text: 'pub fn route_asr_request(ctx: &Context) -> Result<ModelId> {' },
    { label: 'Dictate Terminal command', text: 'cargo run --release -- --config sori.toml' },
    { label: 'Dictate Email / Slack message', text: 'Hi team, local Whisper Q5 baseline is running at 65ms latency!' },
  ];

  const handleSimulateVoice = (phrase: string) => {
    if (!runtimeAvailable) return;
    setInputText((prev) => prev + (prev.endsWith('\n') ? '' : '\n') + phrase);
    setLastInserted(phrase);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6 text-[#1C1B19]">
      {/* Top Single-Purpose Banner */}
      <div className="bg-[rgba(251,249,246,0.85)] border border-[rgba(92,84,75,0.12)] rounded-[18px] p-5 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#4E7A61] animate-pulse" />
            <h1 className="text-[20px] leading-[28px] font-semibold text-[#1C1B19] tracking-[-0.01em]">
              Sori preview — Try a local capture
            </h1>
          </div>
          <p className="sori-body-text text-xs text-[#68635D]">
            Browser capture and sample prompts update this preview only. OS hotkeys, microphone routing, and text injection are not connected yet.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('vocabulary')}
            className="sori-tactile-btn px-3.5 py-1.5 rounded-[10px] text-xs transition flex items-center gap-1.5"
          >
            <BookOpen className="w-3.5 h-3.5 text-[#6E7A80]" />
            <span>Teach Sori your words</span>
          </button>

          <button
            onClick={toggleListening}
            className={`px-4 py-2 rounded-[10px] text-xs font-medium shadow-2xs flex items-center gap-2 transition-all border ${
              isListening
                ? 'bg-[#A75850] text-white border-[#A75850] animate-pulse'
                : 'sori-tactile-btn'
            }`}
          >
            <Mic className="w-4 h-4 text-[#6E7A80]" />
            <span>{isListening ? 'Listening...' : 'Simulate Dictation'}</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Playground & Active Window Simulator */}
      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        {/* Focused Application Simulator */}
        <div className="bg-[rgba(251,249,246,0.85)] border border-[rgba(92,84,75,0.12)] rounded-[18px] p-5 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[rgba(92,84,75,0.08)]">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#E5B54A]/30" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#E5B54A]/30" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#E5B54A]/30" />
              <span className="text-xs font-semibold text-[#1C1B19] ml-1">Focused Target Window:</span>
            </div>

            {/* App Switcher Tabs */}
            <div className="flex items-center gap-1 bg-[rgba(216,211,204,0.30)] p-1 rounded-[10px] text-xs border border-[rgba(92,84,75,0.08)]">
              <button
                onClick={() => setActiveAppMock('vscode')}
                className={`px-3 py-1 rounded-[8px] flex items-center gap-1.5 transition-all ${
                  activeAppMock === 'vscode' ? 'bg-[rgba(255,254,251,0.88)] text-[#1C1B19] font-semibold shadow-2xs' : 'text-[#68635D] hover:text-[#1C1B19]'
                }`}
              >
                <FileCode className="w-3.5 h-3.5 text-[#68635D]" />
                VS Code
              </button>
              <button
                onClick={() => setActiveAppMock('terminal')}
                className={`px-3 py-1 rounded-[8px] flex items-center gap-1.5 transition-all ${
                  activeAppMock === 'terminal' ? 'bg-[rgba(255,254,251,0.88)] text-[#1C1B19] font-semibold shadow-2xs' : 'text-[#68635D] hover:text-[#1C1B19]'
                }`}
              >
                <Terminal className="w-3.5 h-3.5 text-[#68635D]" />
                Terminal
              </button>
              <button
                onClick={() => setActiveAppMock('slack')}
                className={`px-3 py-1 rounded-[8px] flex items-center gap-1.5 transition-all ${
                  activeAppMock === 'slack' ? 'bg-[rgba(255,254,251,0.88)] text-[#1C1B19] font-semibold shadow-2xs' : 'text-[#68635D] hover:text-[#1C1B19]'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 text-[#68635D]" />
                Slack / Mail
              </button>
            </div>
          </div>

          {/* Interactive Input Container */}
          <div className="relative space-y-2">
            <div className="flex items-center justify-between text-[11px] text-[#98928A] font-mono">
              <span>{activeAppMock === 'vscode' ? 'src/router.rs' : activeAppMock === 'terminal' ? 'zsh — local daemon' : '#general-dev'}</span>
              <span className="text-[#9A7442] font-medium">Preview target · no OS injection</span>
            </div>

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={6}
              className="w-full bg-[rgba(242,238,232,0.6)] border border-[rgba(92,84,75,0.12)] rounded-[12px] p-3.5 font-mono text-[12px] leading-[20px] font-normal text-[#1C1B19] focus:outline-none focus:bg-white focus:border-[rgba(92,84,75,0.25)] resize-none"
              placeholder="Use a sample prompt or type here to preview output..."
            />

            {/* Quick Voice Simulation Triggers */}
            <div className="space-y-2 pt-1">
              <div className="text-xs text-[#1C1B19] font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#6E7A80]" />
                <span>Test Voice Dictation Triggers:</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {sampleVoicePrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSimulateVoice(prompt.text)}
                    className="p-2.5 rounded-[10px] bg-[rgba(242,238,232,0.6)] border border-[rgba(92,84,75,0.1)] hover:border-[rgba(92,84,75,0.2)] hover:bg-white text-left transition-all group"
                  >
                    <div className="text-xs font-semibold text-[#1C1B19] flex items-center justify-between">
                      <span>{prompt.label}</span>
                      <Play className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-[#6E7A80]" />
                    </div>
                    <div className="text-[11px] text-[#98928A] font-mono truncate mt-0.5">{prompt.text}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Live Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[rgba(92,84,75,0.08)]">
            <div className="flex items-center gap-2">
              <button
                onClick={toggleListening}
                className={`px-4 py-2 rounded-[10px] text-xs font-medium flex items-center gap-2 transition-all border ${
                  isListening
                    ? 'bg-[#A75850] text-white border-[#A75850] animate-pulse'
                    : 'sori-tactile-btn'
                }`}
              >
                <Mic className="w-3.5 h-3.5 text-[#6E7A80]" />
                {isListening ? 'Stop Capture' : 'Start Speech Capture'}
              </button>
              <button
                onClick={() => setInputText('')}
                className="sori-tactile-btn px-3.5 py-2 rounded-[10px] text-xs transition-all font-medium"
              >
                Clear Text
              </button>
            </div>

            {lastInserted && (
              <div className="text-xs text-[#4E7A61] font-mono flex items-center gap-1.5 bg-[#EAF3ED] px-3 py-1 rounded-[8px] border border-[rgba(78,122,97,0.22)] font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#4E7A61]" />
                Preview text updated locally
              </div>
            )}
          </div>
        </div>

        {/* Sidebar: Recent Transcripts */}
        <div className="space-y-4">
          <div className="bg-[rgba(251,249,246,0.85)] border border-[rgba(92,84,75,0.12)] rounded-[18px] p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between font-semibold text-xs text-[#1C1B19]">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#6E7A80]" />
                Recent Dictations
              </span>
              <button
                onClick={() => onNavigate('transcripts')}
                className="text-[11px] text-[#6E7A80] hover:underline font-normal"
              >
                View all
              </button>
            </div>

            <div className="space-y-2 text-xs">
              {history.map((item) => (
                <div key={item.id} className="p-3 rounded-[12px] bg-[rgba(242,238,232,0.6)] border border-[rgba(92,84,75,0.08)] space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-[#98928A] font-mono">
                    <span className="text-[#1C1B19] font-semibold">{item.activeApp}</span>
                    <span className="text-[#4E7A61] font-semibold">{item.latencyMs}ms</span>
                  </div>
                  <p className="text-[#1C1B19] text-xs line-clamp-3 leading-relaxed">{item.processedText}</p>
                  <div className="flex items-center justify-between text-[11px] text-[#98928A] pt-1 border-t border-[rgba(92,84,75,0.08)]">
                    <span className="bg-white px-2 py-0.5 rounded text-[#68635D] border border-[rgba(92,84,75,0.1)] font-mono">{item.modelUsed}</span>
                    <button
                      onClick={() => handleSimulateVoice(item.processedText)}
                      className="hover:text-[#1C1B19] flex items-center gap-1 transition-colors font-semibold text-[#68635D]"
                    >
                      <Copy className="w-3 h-3" /> Re-insert
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


