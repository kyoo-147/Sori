import React from 'react';
import { OverlayStyle } from '../types';
import { Mic, AlertTriangle, X } from 'lucide-react';

interface OverlaySimulatorProps {
  overlayStyle: OverlayStyle;
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  activeApp: string;
  activeModel: string;
  errorMessage?: string | null;
  onCloseError?: () => void;
  onStyleChange?: (style: OverlayStyle) => void;
  editDiff?: { original: string; replacement: string } | null;
}

export const OverlaySimulator: React.FC<OverlaySimulatorProps> = ({
  overlayStyle,
  isListening,
  interimTranscript,
  activeApp,
  activeModel,
  errorMessage,
  onCloseError,
  onStyleChange,
  editDiff,
}) => {
  const waveHeights = [20, 45, 80, 50, 30, 65, 90, 40, 25];

  return (
    <div className="fixed bottom-2 right-2 sm:bottom-6 sm:right-6 z-50 pointer-events-auto w-[calc(100vw-1rem)] max-w-sm transition-all duration-300">
      {/* Error / Permission Gate Prompt */}
      {errorMessage ? (
        <div className="sori-floating p-4 text-[#1C1B19] space-y-2 animate-in fade-in slide-in-from-bottom-2 border border-[rgba(255,255,255,0.7)]">
          <div className="flex items-center justify-between text-[#A75850] font-semibold text-xs">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              <span>Permission / Hardware Error</span>
            </div>
            {onCloseError && (
              <button type="button" onClick={onCloseError} aria-label="Close error message" className="text-[#98928A] hover:text-[#1C1B19] p-1 rounded-md">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <p className="text-xs text-[#68635D]">{errorMessage}</p>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => alert('Simulating opening Windows Accessibility / Microphone Settings')}
              className="px-3 py-1 rounded-[8px] bg-[#F9EBEA] hover:bg-[#F3DFDF] text-[#A75850] text-[11px] font-medium border border-[rgba(167,88,80,0.22)]"
            >
              Open Settings
            </button>
            <button
              onClick={onCloseError}
              className="sori-tactile-btn px-3 py-1 rounded-[8px] text-[11px]"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : editDiff ? (
        /* Edit Diff Floating Bar */
        <div className="sori-floating p-4 text-[#1C1B19] space-y-2 border border-[rgba(255,255,255,0.7)]">
          <div className="flex items-center justify-between text-xs text-[#1C1B19] font-semibold">
            <span>Voice Edit Preview</span>
            <span className="text-[10px] text-[#98928A] font-mono">{activeApp}</span>
          </div>
          <div className="text-xs space-y-1 font-mono">
            <div className="line-through text-[#A75850] bg-[#F9EBEA] px-2.5 py-1 rounded-[6px] border border-[rgba(167,88,80,0.22)]">{editDiff.original}</div>
            <div className="text-[#4E7A61] bg-[#EAF3ED] px-2.5 py-1 rounded-[6px] border border-[rgba(78,122,97,0.22)]">{editDiff.replacement}</div>
          </div>
        </div>
      ) : (
        /* Standard Overlay Widget based on style choice */
        <div className="flex flex-col items-end gap-2">
          {/* Overlay Style Selector Pills (mini) */}
          {onStyleChange && (
            <div className="flex items-center gap-1 sori-glass px-3 py-1 rounded-full text-[10px] text-[#68635D] shadow-2xs">
              <span className="text-[#98928A] mr-1">Style:</span>
              {(['dot', 'pill', 'wave', 'orb', 'monochrome'] as OverlayStyle[]).map((style) => (
                <button
                  type="button"
                  key={style}
                  aria-pressed={overlayStyle === style}
                  onClick={() => onStyleChange(style)}
                  className={`px-2 py-0.5 rounded-full capitalize transition-all ${
                    overlayStyle === style ? 'bg-[rgba(255,254,251,0.9)] text-[#1C1B19] font-semibold border border-white/80' : 'hover:text-[#1C1B19]'
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
          )}

          {/* DOT STYLE */}
          {overlayStyle === 'dot' && (
            <div
              className={`p-3 rounded-full transition-all flex items-center gap-2 sori-floating ${
                isListening
                  ? 'ring-2 ring-[rgba(255,255,255,0.8)] scale-105'
                  : ''
              }`}
            >
              <div className={`w-3 h-3 rounded-full ${isListening ? 'bg-[#4E7A61] animate-ping' : 'bg-[#98928A]'}`} />
              {isListening && <span className="text-xs font-semibold text-[#1C1B19]">Listening...</span>}
            </div>
          )}

          {/* PILL STYLE */}
          {overlayStyle === 'pill' && (
            <div
              className={`px-4 py-2.5 rounded-full flex items-center gap-2.5 transition-all sori-floating ${
                isListening
                  ? 'ring-2 ring-[rgba(255,255,255,0.8)]'
                  : ''
              }`}
            >
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  isListening ? 'bg-[#4E7A61] animate-pulse' : 'bg-[#98928A]'
                }`}
              />
              <span className="text-xs font-semibold text-[#1C1B19]">
                {isListening ? interimTranscript || 'Listening...' : 'Sori Ready'}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(235,230,223,0.6)] text-[#1C1B19] border border-[rgba(92,84,75,0.1)] font-mono">
                {activeModel.split(' ')[0]}
              </span>
            </div>
          )}

          {/* WAVE STYLE */}
          {overlayStyle === 'wave' && (
            <div className="sori-floating p-3.5 flex flex-col gap-2 w-full sm:min-w-[220px]">
              <div className="flex items-center justify-between text-xs text-[#68635D]">
                <span className="flex items-center gap-1 font-semibold text-[#1C1B19]">
                  <Mic className="w-3.5 h-3.5 text-[#68635D]" />
                  {activeApp}
                </span>
                <span className="text-[10px] text-[#98928A] font-mono">{activeModel}</span>
              </div>
              <div className="flex items-end justify-center gap-1.5 h-9 bg-[rgba(242,238,232,0.6)] rounded-[10px] p-1.5 border border-[rgba(92,84,75,0.08)]">
                {waveHeights.map((h, idx) => (
                  <div
                    key={idx}
                    className="w-1.5 rounded-full bg-[#68635D] transition-all duration-150"
                    style={{
                      height: isListening ? `${Math.min(100, Math.max(15, (h * Math.random()) + 20))}%` : '20%',
                    }}
                  />
                ))}
              </div>
              {isListening && (
                <div className="text-xs text-[#1C1B19] font-mono italic truncate bg-white/80 px-2.5 py-1 rounded-[8px] border border-[rgba(92,84,75,0.08)]">
                  {interimTranscript || 'Listening...'}
                </div>
              )}
            </div>
          )}

          {/* ORB STYLE */}
          {overlayStyle === 'orb' && (
            <div className="flex items-center gap-3 sori-floating px-4 py-2.5">
              <div
                className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all ${
                  isListening
                    ? 'border-[rgba(78,122,97,0.3)] bg-[#EAF3ED] text-[#1C1B19]'
                    : 'border-[rgba(92,84,75,0.1)] bg-[rgba(242,238,232,0.6)] text-[#98928A]'
                }`}
              >
                <div className={`w-3 h-3 rounded-full ${isListening ? 'bg-[#4E7A61] animate-ping' : 'bg-[#98928A]'}`} />
              </div>
              <div className="text-xs">
                <div className="font-semibold text-[#1C1B19]">{isListening ? 'Listening...' : 'Sori Orb'}</div>
                <div className="text-[10px] text-[#98928A]">{activeApp} · {activeModel}</div>
              </div>
            </div>
          )}

          {/* MONOCHROME STYLE */}
          {overlayStyle === 'monochrome' && (
            <div className="sori-floating p-3 text-[#1C1B19] font-mono text-xs flex items-center gap-2">
              <span className={isListening ? 'text-[#4E7A61] underline font-bold' : 'text-[#98928A]'}>
                [SORI_VOICE]
              </span>
              <span>{isListening ? interimTranscript || 'REC...' : 'IDLE'}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

