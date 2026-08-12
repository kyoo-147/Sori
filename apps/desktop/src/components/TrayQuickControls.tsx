import React from 'react';
import { AppSettings } from '../types';
import type { DaemonStatus, RuntimeSource } from '../runtime-client';
import {
  X,
  Power,
  Sliders,
  Cpu,
  Zap,
  Check,
  Flame,
  Activity,
  Layers,
} from 'lucide-react';

interface TrayQuickControlsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  activeModelName: string;
  onNavigate: (screen: any) => void;
  runtimeSource: RuntimeSource;
  runtimeStatus: DaemonStatus;
  onTogglePaused: () => void;
}

export const TrayQuickControls: React.FC<TrayQuickControlsProps> = ({
  isOpen,
  onClose,
  settings,
  setSettings,
  activeModelName,
  onNavigate,
  runtimeSource,
  runtimeStatus,
  onTogglePaused,
}) => {
  if (!isOpen) return null;

  const profiles: AppSettings['activeProfile'][] = ['Coding', 'Writing', 'Vietnamese', 'General'];
  const runtimeConnected = runtimeSource === 'native' || runtimeSource === 'backend';

  return (
    <div id="tray-quick-controls" role="dialog" aria-label="Sori quick controls" className="fixed top-14 right-2 sm:right-6 z-40 w-[calc(100vw-1rem)] max-w-80 sori-floating p-5 shadow-xl text-[#1C1B19] animate-in fade-in zoom-in-95 duration-200 border border-[rgba(255,255,255,0.7)]">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[rgba(92,84,75,0.08)]">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#4E7A61] animate-pulse"></div>
          <span className="font-bold text-sm text-[#1C1B19]">Sori System Tray</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[rgba(235,230,223,0.6)] text-[#68635D] font-mono border border-[rgba(92,84,75,0.08)]">
            {runtimeConnected ? (runtimeSource === 'native' ? 'Native Active' : 'Backend Active') : runtimeSource === 'mock' ? 'Mock Fallback' : 'Unavailable'}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close quick controls"
          className="text-[#98928A] hover:text-[#1C1B19] p-1 rounded-md hover:bg-[rgba(235,230,223,0.5)] transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Quick Status Bar */}
      <div className="py-3 border-b border-[rgba(92,84,75,0.08)] space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#68635D] flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-[#98928A]" />
            Warm Model
          </span>
          <span className="font-mono text-[#4E7A61] font-medium">{activeModelName}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#68635D] flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-[#98928A]" />
            Latency (p50)
          </span>
          <span className="font-mono text-[#1C1B19]">65ms (Local CUDA)</span>
        </div>
      </div>

      {/* Profile Switcher */}
      <div className="py-3 border-b border-[rgba(92,84,75,0.08)] space-y-2">
        <label className="text-xs text-[#98928A] font-medium flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-[#98928A]" />
          Active Context Profile
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {profiles.map((prof) => (
            <button
              type="button"
              key={prof}
              aria-pressed={settings.activeProfile === prof}
              onClick={() => setSettings((prev) => ({ ...prev, activeProfile: prof }))}
              className={`px-2.5 py-1.5 rounded-[10px] text-xs font-medium flex items-center justify-between transition-all ${
                settings.activeProfile === prof
                  ? 'bg-[rgba(221,217,211,0.46)] text-[#1C1B19] border border-[rgba(91,84,77,0.15)] font-semibold shadow-2xs'
                  : 'sori-tactile-btn'
              }`}
            >
              <span>{prof}</span>
              {settings.activeProfile === prof && <Check className="w-3 h-3 text-[#1C1B19]" />}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation Quick Links */}
      <div className="pt-3 space-y-1">
        <button
          onClick={() => {
            onNavigate('models');
            onClose();
          }}
          className="w-full text-left px-3 py-1.5 rounded-[10px] text-xs text-[#68635D] hover:bg-[rgba(235,230,223,0.5)] flex items-center justify-between transition"
        >
          <span className="flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-[#98928A]" />
            Model Manager & Routing
          </span>
          <span className="text-[10px] text-[#98928A] font-mono">5 Models</span>
        </button>

        <button
          onClick={() => {
            onNavigate('benchmark');
            onClose();
          }}
          className="w-full text-left px-3 py-1.5 rounded-[10px] text-xs text-[#68635D] hover:bg-[rgba(235,230,223,0.5)] flex items-center justify-between transition"
        >
          <span className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-[#4E7A61]" />
            Benchmarks
          </span>
          <span className="text-[10px] text-[#98928A] font-mono">Run Test</span>
        </button>

        <button
          onClick={() => {
            onNavigate('studio');
            onClose();
          }}
          className="w-full text-left px-3 py-1.5 rounded-[10px] text-xs text-[#68635D] hover:bg-[rgba(235,230,223,0.5)] flex items-center justify-between transition"
        >
          <span className="flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-[#98928A]" />
            Studio Settings IA
          </span>
        </button>

        <button
          onClick={onTogglePaused}
          disabled={runtimeSource === 'unavailable'}
          className="w-full text-left px-3 py-1.5 rounded-[10px] text-xs text-[#A75850] hover:bg-[#F9EBEA] flex items-center gap-2 transition mt-1"
        >
          <Power className="w-3.5 h-3.5" />
          {runtimeStatus.paused ? 'Resume Sori Daemon' : 'Pause Sori Daemon'}
        </button>
      </div>
    </div>
  );
};

