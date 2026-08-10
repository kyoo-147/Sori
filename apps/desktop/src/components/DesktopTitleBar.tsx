import React from 'react';
import { AppSettings } from '../types';
import { Mic, Monitor, Tablet, Smartphone, Flame } from 'lucide-react';

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
}

export const DesktopTitleBar: React.FC<DesktopTitleBarProps> = ({
  settings,
  isListening,
  toggleListening,
  trayOpen,
  setTrayOpen,
  deviceView,
  setDeviceView,
}) => {
  return (
    <div className="h-12 bg-[rgba(248,245,241,0.85)] backdrop-blur-xl border-b border-[rgba(92,84,75,0.08)] px-4 flex items-center justify-between select-none text-[13px] text-[#68635D]">
      {/* Left: Window Controls & Title */}
      <div className="flex items-center gap-3">
        {/* Traffic Light Buttons */}
        <div className="flex items-center gap-1.5 mr-1">
          <div className="w-3 h-3 rounded-full bg-[#E56A54] border border-black/10 hover:opacity-80 cursor-pointer" />
          <div className="w-3 h-3 rounded-full bg-[#E5B54A] border border-black/10 hover:opacity-80 cursor-pointer" />
          <div className="w-3 h-3 rounded-full bg-[#52B868] border border-black/10 hover:opacity-80 cursor-pointer" />
        </div>

        {/* App Title */}
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#1C1B19] tracking-tight">Sori Desktop</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[rgba(235,230,223,0.5)] text-[#68635D] font-mono border border-[rgba(92,84,75,0.08)]">
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

