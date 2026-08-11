import React from 'react';
import { ActiveScreen, AppSettings } from '../types';
import {
  Home,
  Clock,
  BookOpen,
  Sparkles,
  Cpu,
  Zap,
  Puzzle,
  Shield,
  Activity,
  PlayCircle,
  Settings,
  Search,
} from 'lucide-react';

interface DesktopSidebarProps {
  activeScreen: ActiveScreen;
  setActiveScreen: (screen: ActiveScreen) => void;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  openSettingsModal: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  activeScreen,
  setActiveScreen,
  openSettingsModal,
  isOpen = true,
  onClose,
}) => {
  const navigate = (screen: ActiveScreen) => {
    setActiveScreen(screen);
    onClose?.();
  };

  const coreNav: { id: ActiveScreen; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: 'Home', icon: <Home className="w-4 h-4" /> },
    { id: 'transcripts', label: 'Transcripts', icon: <Clock className="w-4 h-4" /> },
    { id: 'vocabulary', label: 'Vocabulary', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'voice-edit', label: 'Voice Edit', icon: <Sparkles className="w-4 h-4" /> },
  ];

  const engineNav: { id: ActiveScreen; label: string; icon: React.ReactNode }[] = [
    { id: 'models', label: 'Models & Routing', icon: <Cpu className="w-4 h-4" /> },
    { id: 'benchmarks', label: 'Benchmarks', icon: <Zap className="w-4 h-4" /> },
  ];

  const programmableNav: { id: ActiveScreen; label: string; icon: React.ReactNode }[] = [
    { id: 'extensions', label: 'Extensions', icon: <Puzzle className="w-4 h-4" /> },
  ];

  const systemNav: { id: ActiveScreen; label: string; icon: React.ReactNode }[] = [
    { id: 'privacy', label: 'Privacy', icon: <Shield className="w-4 h-4" /> },
    { id: 'diagnostics', label: 'Diagnostics', icon: <Activity className="w-4 h-4" /> },
  ];

  return (
    <aside className={`${isOpen ? 'flex' : 'hidden'} md:flex w-60 max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:shadow-xl bg-[rgba(235,231,225,0.96)] backdrop-blur-2xl border-r border-[rgba(92,84,75,0.08)] flex-col justify-between h-full select-none text-[#1C1B19]`}>
      <button type="button" aria-label="Close navigation" onClick={onClose} className="md:hidden absolute top-3 right-3 text-[#68635D] p-2 rounded-md hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6E7A80]">×</button>
      {/* Top Search & Nav */}
      <div className="p-3 space-y-3.5 overflow-y-auto custom-scrollbar" role="navigation" aria-label="Primary Sori navigation">
        {/* Search Input Box */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#98928A]" />
          <input
            type="text"
            aria-label="Search Sori"
            placeholder="Search Sori..."
            className="w-full bg-[rgba(255,253,249,0.76)] border border-[rgba(92,84,75,0.12)] rounded-[10px] pl-8 pr-12 py-1.5 text-[12.5px] text-[#1C1B19] placeholder-[#B2AEA8] focus:outline-none focus:bg-white focus:border-[rgba(92,84,75,0.25)] transition-all shadow-2xs"
          />
          <span className="absolute right-2.5 top-2 text-[10px] text-[#98928A] font-mono bg-white/70 px-1 rounded border border-[rgba(92,84,75,0.12)]">
            Ctrl+K
          </span>
        </div>

        {/* Core Navigation Section */}
        <div className="space-y-0.5">
          {coreNav.map((item) => {
            const isActive = activeScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveScreen(item.id)}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[10px] text-[13.5px] leading-[20px] font-medium transition-all ${
                  isActive
                    ? 'bg-[rgba(214,209,201,0.48)] text-[#1C1B19] font-semibold border border-[rgba(91,84,77,0.12)] shadow-2xs'
                    : 'text-[#68635D] hover:bg-[rgba(225,220,212,0.4)] hover:text-[#1C1B19]'
                }`}
              >
                <span className={isActive ? 'text-[#1C1B19]' : 'text-[#68635D]'}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Engine Section */}
        <div className="pt-2 border-t border-[rgba(92,84,75,0.06)]">
          <div className="px-3 pb-1 text-[10.5px] font-semibold text-[#98928A] uppercase tracking-[0.03em]">
            Engine
          </div>
          <div className="space-y-0.5">
            {engineNav.map((item) => {
              const isActive = activeScreen === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveScreen(item.id)}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[10px] text-[13.5px] leading-[20px] font-medium transition-all ${
                    isActive
                      ? 'bg-[rgba(214,209,201,0.48)] text-[#1C1B19] font-semibold border border-[rgba(91,84,77,0.12)] shadow-2xs'
                      : 'text-[#68635D] hover:bg-[rgba(225,220,212,0.4)] hover:text-[#1C1B19]'
                  }`}
                >
                  <span className={isActive ? 'text-[#1C1B19]' : 'text-[#68635D]'}>{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Programmable Section */}
        <div className="pt-2 border-t border-[rgba(92,84,75,0.06)]">
          <div className="px-3 pb-1 text-[10.5px] font-semibold text-[#98928A] uppercase tracking-[0.03em]">
            Programmable
          </div>
          <div className="space-y-0.5">
            {programmableNav.map((item) => {
              const isActive = activeScreen === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveScreen(item.id)}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[10px] text-[13.5px] leading-[20px] font-medium transition-all ${
                    isActive
                      ? 'bg-[rgba(214,209,201,0.48)] text-[#1C1B19] font-semibold border border-[rgba(91,84,77,0.12)] shadow-2xs'
                      : 'text-[#68635D] hover:bg-[rgba(225,220,212,0.4)] hover:text-[#1C1B19]'
                  }`}
                >
                  <span className={isActive ? 'text-[#1C1B19]' : 'text-[#68635D]'}>{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* System Section */}
        <div className="pt-2 border-t border-[rgba(92,84,75,0.06)]">
          <div className="px-3 pb-1 text-[10.5px] font-semibold text-[#98928A] uppercase tracking-[0.03em]">
            System
          </div>
          <div className="space-y-0.5">
            {systemNav.map((item) => {
              const isActive = activeScreen === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveScreen(item.id)}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[10px] text-[13.5px] leading-[20px] font-medium transition-all ${
                    isActive
                      ? 'bg-[rgba(214,209,201,0.48)] text-[#1C1B19] font-semibold border border-[rgba(91,84,77,0.12)] shadow-2xs'
                      : 'text-[#68635D] hover:bg-[rgba(225,220,212,0.4)] hover:text-[#1C1B19]'
                  }`}
                >
                  <span className={isActive ? 'text-[#1C1B19]' : 'text-[#68635D]'}>{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Prototype Flows Section */}
        <div className="pt-2 border-t border-[rgba(92,84,75,0.06)]">
          <div className="px-3 pb-1 text-[10.5px] font-semibold text-[#98928A] uppercase tracking-[0.03em]">
            Prototype Flows
          </div>
          <button
            onClick={() => navigate('onboarding')}
            aria-current={activeScreen === 'onboarding' ? 'page' : undefined}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[10px] text-[13.5px] leading-[20px] font-medium transition-all ${
              activeScreen === 'onboarding'
                ? 'bg-[rgba(214,209,201,0.48)] text-[#1C1B19] font-semibold border border-[rgba(91,84,77,0.12)] shadow-2xs'
                : 'text-[#68635D] hover:bg-[rgba(225,220,212,0.4)] hover:text-[#1C1B19]'
            }`}
          >
            <PlayCircle className="w-4 h-4 text-[#68635D]" />
            <span className="truncate">First-Run Setup</span>
          </button>
        </div>
      </div>

      {/* Bottom Profile & Settings Section */}
      <div className="p-3 border-t border-[rgba(92,84,75,0.08)] space-y-1 bg-[rgba(230,225,218,0.3)]">
        <button
          onClick={() => {
            navigate('settings');
            openSettingsModal();
          }}
          aria-current={activeScreen === 'settings' ? 'page' : undefined}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-[13px] font-medium transition-all ${
            activeScreen === 'settings'
              ? 'bg-[rgba(214,209,201,0.48)] text-[#1C1B19] font-semibold border border-[rgba(91,84,77,0.12)] shadow-2xs'
              : 'text-[#68635D] hover:bg-[rgba(225,220,212,0.4)] hover:text-[#1C1B19]'
          }`}
        >
          <Settings className="w-4 h-4 text-[#68635D]" />
          <span>Settings</span>
        </button>

        {/* User Account Tile */}
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-[12px] bg-[rgba(255,253,249,0.7)] border border-[rgba(92,84,75,0.1)] shadow-2xs">
          <div className="w-7 h-7 rounded-full bg-[#68635D] text-white font-semibold flex items-center justify-center text-xs shadow-2xs">
            A
          </div>
          <div className="truncate text-left leading-tight">
            <div className="font-semibold text-[#1C1B19] text-[12px] truncate">Alex Chen</div>
            <div className="text-[11px] text-[#98928A] truncate">alex@company.com</div>
          </div>
        </div>
      </div>
    </aside>
  );
};


