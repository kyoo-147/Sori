import React from 'react';
import { AppSettings } from '../types';
import type { DaemonStatus, RuntimeSource } from '../runtime-client';
import { Mic, Monitor, Tablet, Smartphone, Flame, Command, CircleDot } from 'lucide-react';

interface DesktopTitleBarProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  isListening: boolean;
  toggleListening: () => void;
  trayOpen: boolean;
  setTrayOpen: (open: boolean) => void;
  deviceView: 'desktop' | 'tablet' | 'mobile';
  setDeviceView: (view: 'desktop' | 'tablet' | 'mobile') => void;
  activeModelName: string;
  runtimeSource: RuntimeSource;
  runtimeStatus: DaemonStatus;
  runtimeError: string | null;
  onTogglePaused: () => void;
}

export const DesktopTitleBar: React.FC<DesktopTitleBarProps> = ({
  settings,
  isListening,
  toggleListening,
  trayOpen,
  setTrayOpen,
  deviceView,
  setDeviceView,
  runtimeSource,
  runtimeStatus,
  runtimeError,
  onTogglePaused,
}) => {
  return (
    <div className="min-h-12 bg-[rgba(250,248,245,0.86)] backdrop-blur-xl border-b border-[rgba(92,84,75,0.08)] px-3 sm:px-4 flex items-center justify-between gap-3 select-none text-[13px] text-[#68635D]">
      {/* Left: product command context. Native OS chrome owns close/minimize/maximize. */}
      <div className="min-w-0 flex items-center gap-2.5">
        <div className="hidden sm:flex h-7 w-7 items-center justify-center rounded-[9px] border border-[rgba(92,84,75,0.10)] bg-white/70 text-[#5E564E] shadow-2xs" aria-hidden="true">
          <Command className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex items-center gap-2">
          <span className="hidden md:inline font-semibold text-[#1C1B19] tracking-tight">Command Center</span>
          <span title={runtimeError ?? undefined} className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${runtimeSource === 'backend' ? 'bg-[#EAF6EE] text-[#1F6B43] border-[#CBE5D4]' : runtimeSource === 'mock' ? 'bg-[#FFF5DD] text-[#8A6418] border-[#EBD9A8]' : 'bg-[#F9EBEA] text-[#A75850] border-[#E8C6C2]'}`}>
            <CircleDot className="h-2.5 w-2.5" aria-hidden="true" />
            {runtimeSource === 'backend' ? 'Backend' : runtimeSource === 'mock' ? 'Mock fallback' : 'Unavailable'}
          </span>
          <span className="hidden sm:inline text-[11px] px-2 py-0.5 rounded-full bg-[rgba(235,230,223,0.5)] text-[#68635D] font-mono border border-[rgba(92,84,75,0.08)]">
            v0.2
          </span>
        </div>
      </div>

      {/* Center: Live Speech Hotkey Button & Warm Model Indicator */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={toggleListening}
          className={`px-3.5 py-1.5 rounded-[12px] font-medium transition-all flex items-center gap-2 text-[12px] border ${
            isListening
              ? 'bg-[#A75850] text-white border-[#A75850] animate-pulse'
              : 'sori-tactile-btn'
          }`}
        >
          <Mic className={`w-3.5 h-3.5 ${isListening ? 'animate-bounce text-white' : 'text-[#68635D]'}`} />
          <span>{isListening ? 'Listening (Release)...' : `Hold ${settings.hotkey} to speak`}</span>
        </button>

        <button onClick={onTogglePaused} disabled={runtimeSource === 'unavailable'} className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-[12px] bg-[rgba(255,253,249,0.76)] border border-[rgba(92,84,75,0.12)] text-[11px] text-[#68635D] font-mono shadow-2xs disabled:opacity-50">
          {runtimeStatus.paused ? 'Resume daemon' : 'Pause daemon'}
        </button>
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-[12px] bg-[rgba(255,253,249,0.76)] border border-[rgba(92,84,75,0.12)] text-[11px] text-[#68635D] font-mono shadow-2xs">
          <Flame className="w-3.5 h-3.5 text-[#98928A]" />
          <span>Route: Local · Whisper Q5</span>
        </div>
      </div>

      {/* Right: Quick Tools & Viewport Controls */}
      <div className="flex items-center gap-2">
        {/* Tray Toggle */}
        <button
          onClick={() => setTrayOpen(!trayOpen)}
          className={`px-3 py-1.5 rounded-[12px] border text-[12px] font-medium transition-all flex items-center gap-1.5 ${
            trayOpen
              ? 'bg-[rgba(221,217,211,0.46)] border-[rgba(91,84,77,0.15)] text-[#1C1B19] font-semibold'
              : 'sori-tactile-btn'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${trayOpen ? 'bg-[#4E7A61]' : 'bg-[#98928A]'}`} />
          <span>System Tray</span>
        </button>

        {/* Viewport Switcher - Translucent Warm Track */}
        <div className="flex items-center bg-[rgba(216,211,204,0.30)] p-1 rounded-[10px] border border-[rgba(92,84,75,0.08)]">
          <button
            onClick={() => setDeviceView('desktop')}
            className={`p-1 rounded-[6px] transition-all ${
              deviceView === 'desktop' ? 'bg-[rgba(255,254,251,0.88)] text-[#1C1B19] shadow-2xs border border-white/60 font-bold' : 'text-[#98928A] hover:text-[#1C1B19]'
            }`}
            title="Desktop View"
          >
            <Monitor className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setDeviceView('tablet')}
            className={`p-1 rounded-[6px] transition-all ${
              deviceView === 'tablet' ? 'bg-[rgba(255,254,251,0.88)] text-[#1C1B19] shadow-2xs border border-white/60 font-bold' : 'text-[#98928A] hover:text-[#1C1B19]'
            }`}
            title="Tablet Simulator (768px)"
          >
            <Tablet className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setDeviceView('mobile')}
            className={`p-1 rounded-[6px] transition-all ${
              deviceView === 'mobile' ? 'bg-[rgba(255,254,251,0.88)] text-[#1C1B19] shadow-2xs border border-white/60 font-bold' : 'text-[#98928A] hover:text-[#1C1B19]'
            }`}
            title="Mobile Simulator (375px)"
          >
            <Smartphone className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

