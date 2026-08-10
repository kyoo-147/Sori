import React from 'react';
import {
  ActiveScreen,
  AppSettings,
  UserLevel,
} from '../types';
import {
  Mic,
  Sliders,
  Cpu,
  Zap,
  BookOpen,
  Code,
  Shield,
  Layers,
  Terminal as TerminalIcon,
  UserCheck,
  Volume2,
  FileCode2,
  CheckCircle2,
  Monitor,
  Tablet,
  Smartphone,
  ChevronRight,
  Flame,
} from 'lucide-react';

interface NavbarProps {
  activeScreen: ActiveScreen;
  setActiveScreen: (screen: ActiveScreen) => void;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  deviceView: 'desktop' | 'tablet' | 'mobile';
  setDeviceView: (view: 'desktop' | 'tablet' | 'mobile') => void;
  isListening: boolean;
  toggleListening: () => void;
  trayOpen: boolean;
  setTrayOpen: (open: boolean) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeScreen,
  setActiveScreen,
  settings,
  setSettings,
  deviceView,
  setDeviceView,
  isListening,
  toggleListening,
  trayOpen,
  setTrayOpen,
}) => {
  // Product navigation uses the approved IA labels only. Prototype-only flows live in the sidebar.
  const navItems: { id: ActiveScreen; label: string; icon: React.ReactNode; level: UserLevel }[] = [
    { id: 'home', label: 'Home', icon: <Mic className="w-4 h-4" />, level: 'basic' },
    { id: 'transcripts', label: 'Transcripts', icon: <FileCode2 className="w-4 h-4" />, level: 'basic' },
    { id: 'vocabulary', label: 'Vocabulary', icon: <BookOpen className="w-4 h-4" />, level: 'basic' },
    { id: 'voice-edit', label: 'Voice Edit', icon: <FileCode2 className="w-4 h-4" />, level: 'basic' },
    { id: 'models', label: 'Models & Routing', icon: <Cpu className="w-4 h-4" />, level: 'advanced' },
    { id: 'benchmarks', label: 'Benchmarks', icon: <Zap className="w-4 h-4" />, level: 'advanced' },
    { id: 'extensions', label: 'Extensions', icon: <Code className="w-4 h-4" />, level: 'advanced' },
    { id: 'privacy', label: 'Privacy', icon: <Shield className="w-4 h-4" />, level: 'basic' },
    { id: 'diagnostics', label: 'Diagnostics', icon: <CheckCircle2 className="w-4 h-4" />, level: 'basic' },
    { id: 'settings', label: 'Settings', icon: <Sliders className="w-4 h-4" />, level: 'basic' },
  ];

  return (
    <header className="sticky top-0 z-30 bg-[#FAF8F5]/90 backdrop-blur-xl border-b border-[#E6E3DD] text-[#1C1B1A]">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-[8px] bg-[#656461] flex items-center justify-center font-bold text-white text-xs shadow-2xs">
              S
            </div>
            <div>
              <div className="flex items-center gap-2 font-semibold text-xs tracking-tight text-[#1C1B1A]">
                Sori Runtime
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F1EEE8] text-[#656461] border border-[#E6E3DD] font-mono">
                  v0.2
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setTrayOpen(!trayOpen)}
            className={`text-xs px-3 py-1.5 rounded-[10px] border transition-all flex items-center gap-1.5 ${
              trayOpen
                ? 'bg-[#F2F0EA] border-[#DAD7D0] text-[#1C1B1A] font-semibold'
                : 'bg-white border-[#E6E3DD] text-[#656461] hover:bg-[#F1EEE8]'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${trayOpen ? 'bg-[#1F6B43]' : 'bg-[#94928E]'}`}></span>
            Tray Popover
          </button>
        </div>

        {/* Center: Live Hotkey Trigger Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleListening}
            className={`px-3.5 py-1.5 rounded-[10px] text-xs font-semibold transition-all flex items-center gap-2 ${
              isListening
                ? 'bg-[#A33A3A] text-white animate-pulse'
                : 'sori-tactile-btn'
            }`}
          >
            <Mic className={`w-3.5 h-3.5 ${isListening ? 'animate-bounce text-white' : 'text-[#656461]'}`} />
            <span>{isListening ? 'Listening (Release)...' : `Hold ${settings.hotkey}`}</span>
          </button>

          {/* Level Filter Toggle */}
          <div className="hidden md:flex items-center bg-[#EFECE6] p-1 rounded-[10px] border border-[#E6E3DD] text-xs">
            {(['basic', 'advanced', 'expert'] as UserLevel[]).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setSettings((prev) => ({ ...prev, userLevel: lvl }))}
                className={`px-2.5 py-1 rounded-[6px] capitalize transition-all ${
                  settings.userLevel === lvl
                    ? 'bg-white text-[#1C1B1A] font-semibold border border-[#E2DFD8] shadow-2xs'
                    : 'text-[#94928E] hover:text-[#1C1B1A]'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        {/* Viewport device switcher */}
        <div className="flex items-center gap-1 bg-[#EFECE6] p-1 rounded-[10px] border border-[#E6E3DD]">
          <button
            onClick={() => setDeviceView('desktop')}
            className={`p-1.5 rounded-[6px] transition-all ${
              deviceView === 'desktop' ? 'bg-white text-[#1C1B1A] border border-[#E2DFD8] shadow-2xs' : 'text-[#94928E] hover:text-[#1C1B1A]'
            }`}
            title="Desktop View"
          >
            <Monitor className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setDeviceView('tablet')}
            className={`p-1.5 rounded-[6px] transition-all ${
              deviceView === 'tablet' ? 'bg-white text-[#1C1B1A] border border-[#E2DFD8] shadow-2xs' : 'text-[#94928E] hover:text-[#1C1B1A]'
            }`}
            title="Tablet Viewport Simulator"
          >
            <Tablet className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setDeviceView('mobile')}
            className={`p-1.5 rounded-[6px] transition-all ${
              deviceView === 'mobile' ? 'bg-white text-[#1C1B1A] border border-[#E2DFD8] shadow-2xs' : 'text-[#94928E] hover:text-[#1C1B1A]'
            }`}
            title="Mobile Viewport Simulator"
          >
            <Smartphone className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Horizontal Nav Tabs */}
      <div className="border-t border-[#E6E3DD] bg-[#F6F4EF]/60">
        <div className="max-w-7xl mx-auto px-4 flex items-center gap-1 overflow-x-auto py-1.5 scrollbar-none text-xs">
          {navItems.map((item) => {
            const isActive = activeScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveScreen(item.id)}
                className={`px-3 py-1.5 rounded-[8px] flex items-center gap-2 whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-white text-[#1C1B1A] font-semibold border border-[#E2DFD8] shadow-2xs'
                    : 'text-[#656461] hover:text-[#1C1B1A] hover:bg-[#F1EEE8]'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
