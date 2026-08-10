import React, { useState } from 'react';
import { AppSettings } from '../../types';
import {
  FileCode2,
  Mic,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  GitCommit,
  Check,
  X,
  RotateCcw,
  Play,
} from 'lucide-react';

interface VoiceEditScreenProps {
  settings: AppSettings;
}

export const VoiceEditScreen: React.FC<VoiceEditScreenProps> = ({ settings }) => {
  const [prompt, setPrompt] = useState<string>('Add an Esc shortcut to exit voice mode.');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [applied, setApplied] = useState<boolean>(false);

  const handleApply = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setApplied(true);
    }, 600);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6 text-[#161616]">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E4E8] pb-3">
        <div>
          <h1 className="sori-page-heading">Voice Edit</h1>
          <p className="sori-body-text mt-0.5">
            Select code or text in any focused window, hold hotkey, and speak natural edit instructions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {applied && (
            <button
              onClick={() => setApplied(false)}
              className="px-3.5 py-1.5 rounded-[10px] bg-white hover:bg-[#F0F1F2] text-[#2B2F33] text-xs font-medium border border-[#E2E4E8] transition flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#5C728A]" />
              <span>Undo Last Edit</span>
            </button>
          )}
          <button
            onClick={handleApply}
            className="px-4 py-2 rounded-[10px] bg-[#EEF2F6] hover:bg-[#E1E8F0] text-[#24384C] border border-[#D5E0EA] text-xs font-semibold shadow-2xs flex items-center gap-1.5 transition"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-[#1F6B43]" />
            <span>Accept & Inject Edit</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Split */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left Column: Voice Instruction & Context */}
        <div className="bg-white border border-[#E2E4E8] rounded-[18px] p-5 shadow-2xs space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-[#858A90] font-mono">
              <span className="font-semibold text-[#161616]">Active Target: VS Code</span>
              <span className="text-[#1F6B43] font-semibold">Selection Detected (3 lines)</span>
            </div>

            {/* Instruction Bubble */}
            <div className="bg-[#F8F8F7] border border-[#E2E4E8] rounded-[12px] p-4 text-xs font-semibold text-[#161616] leading-relaxed">
              "{prompt}"
            </div>

            <div className="text-xs text-[#5F6368] space-y-2 leading-relaxed">
              <p>
                Parsed intent: Add <code className="px-1.5 py-0.5 bg-[#EEF2F6] border border-[#D5E0EA] rounded text-[#161616] font-mono text-[11px]">Esc</code> shortcut to exit voice mode in <span className="font-mono text-[#161616]">shortcuts.ts</span>.
              </p>
              <div className="text-[11px] text-[#858A90] font-mono flex items-center gap-3">
                <span>Latency: <strong className="text-[#1F6B43]">74ms</strong></span>
                <span>•</span>
                <span>Model: <strong className="text-[#161616]">Whisper Q5</strong></span>
              </div>
            </div>
          </div>

          {/* Quick Trigger Presets */}
          <div className="pt-3 border-t border-[#E2E4E8] space-y-2">
            <div className="text-xs font-semibold text-[#161616] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#5C728A]" />
              <span>Test Voice Transformations:</span>
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {[
                'Add Esc shortcut to exit voice mode.',
                'Refactor this function to return Result<T, Error>.',
                'Convert snake_case to camelCase and add docstring.',
              ].map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setPrompt(p);
                    setApplied(false);
                  }}
                  className="px-3 py-1.5 rounded-[10px] bg-[#F8F8F7] border border-[#E2E4E8] hover:border-[#BAC7D8] hover:bg-white text-[#2B2F33] text-xs transition font-medium text-left"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Code Diff Panel */}
        <div className="bg-white border border-[#E2E4E8] rounded-[18px] p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between text-xs pb-2 border-b border-[#E2E4E8] font-mono">
            <span className="font-semibold text-[#161616]">1 file changed <span className="text-[#1F6B43]">+1</span> <span className="text-[#A33A3A]">-0</span></span>
            <span className="text-[#858A90]">Diff Preview</span>
          </div>

          {/* File Diff View */}
          <div className="border border-[#E2E4E8] rounded-[12px] overflow-hidden font-mono text-xs bg-[#F8F8F7]">
            <div className="bg-[#EEF2F6] px-3 py-2 border-b border-[#D5E0EA] text-[#24384C] text-[11px] flex justify-between font-semibold">
              <span>src/voice/shortcuts.ts</span>
              <span className="text-[#1F6B43]">+1 -0</span>
            </div>

            <div className="p-3 space-y-1 text-[#161616] leading-relaxed overflow-x-auto text-[12px]">
              <div><span className="text-[#A33A3A] font-semibold">export const</span> shortcuts = [</div>
              <div className="pl-4 text-[#5F6368]">{`{ key: "Space", action: "toggle" },`}</div>
              {/* Added Line */}
              <div className="bg-[#EAF6EE] text-[#1F6B43] font-semibold px-2 py-0.5 rounded border border-[#CBE5D4] flex items-center">
                <span className="w-4 select-none mr-1">+</span>
                <span>{`{ key: "Esc", action: "exit" },`}</span>
              </div>
              <div>];</div>
              <br />
              <div><span className="text-[#A33A3A] font-semibold">export function</span> formatShortcut(key: string) {'{'}</div>
              <div className="pl-4">return key.<span className="font-bold text-[#161616]">toUpperCase</span>();</div>
              <div>{'}'}</div>
            </div>
          </div>

          {applied && (
            <div className="p-3 bg-[#EAF6EE] border border-[#CBE5D4] rounded-[12px] text-xs text-[#1F6B43] font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#1F6B43]" />
              <span>Voice edit cleanly injected into focused window!</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

