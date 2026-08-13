import React, { useEffect, useState } from 'react';
import { AppSettings, ActiveScreen } from '../types';
import type { DaemonStatus, RuntimeSource } from '../runtime-client';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Mic, Flame, Command, CircleDot, Menu, X, Minus, Square, Copy, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { performWindowAction, tauriWindowControls, type WindowAction } from '../window-controls';
export const isTitlebarInteractiveTarget = (target: EventTarget | null) =>
  typeof Element !== 'undefined' && target instanceof Element && Boolean(target.closest('[data-sori-no-drag], button, a, input, select, textarea'));


interface DesktopTitleBarProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  isListening: boolean;
  toggleListening: () => void;
  trayOpen: boolean;
  setTrayOpen: (open: boolean) => void;
  activeModelName: string;
  runtimeSource: RuntimeSource;
  runtimeStatus: DaemonStatus;
  runtimeError: string | null;
  onTogglePaused: () => void;
  sidebarOpen: boolean;
  onToggleMobileSidebar: () => void;
  onToggleSidebarCollapse: () => void;
  sidebarCollapsed: boolean;
  onNavigate: (screen: ActiveScreen) => void;
}

export const DesktopTitleBar: React.FC<DesktopTitleBarProps> = ({
  settings,
  isListening,
  toggleListening,
  trayOpen,
  setTrayOpen,
  runtimeSource,
  runtimeStatus,
  runtimeError,
  onTogglePaused,
  sidebarOpen,
  onToggleMobileSidebar,
  onToggleSidebarCollapse,
  sidebarCollapsed,
  onNavigate,
}) => {
  const runtimeConnected = runtimeSource === 'native' || runtimeSource === 'backend';
  const [isMaximized, setIsMaximized] = useState(false);
  const isTauri = '__TAURI_INTERNALS__' in globalThis;

  const refreshMaximized = () => {
    if (!isTauri) return;
    void getCurrentWindow().isMaximized().then(setIsMaximized).catch(() => undefined);
  };

  const refreshMaximizedAfterNativeAction = () => {
    refreshMaximized();
    window.setTimeout(refreshMaximized, 80);
    window.setTimeout(refreshMaximized, 240);
  };

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in globalThis)) return;
    const window = getCurrentWindow();
    let disposed = false;
    const refreshMaximized = () => {
      window.isMaximized().then((maximized) => {
        if (!disposed) setIsMaximized(maximized);
      }).catch(() => undefined);
    };
    refreshMaximized();
    let unlisten: (() => void) | undefined;
    window.onResized(refreshMaximized).then((unsubscribe) => {
      if (disposed) unsubscribe();
      else unlisten = unsubscribe;
    }).catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const runWindowAction = async (action: WindowAction) => {
    if (!isTauri) return;
    try {
      await performWindowAction(tauriWindowControls, action);
      if (action === 'maximize' || action === 'restore' || action === 'toggle-maximize') {
        refreshMaximizedAfterNativeAction();
      }
    } catch (error) {
      console.error('[titlebar] native window action failed', {
        action,
        window: isTauri ? getCurrentWindow().label : 'browser-preview',
        runtime: runtimeSource,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
      });
    }
  };

  const isInteractiveTarget = isTitlebarInteractiveTarget;

  const handleTitlebarMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isInteractiveTarget(event.target)) return;
    void runWindowAction('drag');
  };

  const handleTitlebarDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isInteractiveTarget(event.target)) void runWindowAction('toggle-maximize');
  };

  return (
    <div role="toolbar" aria-label="Sori window title bar" onMouseDown={handleTitlebarMouseDown} onDoubleClick={handleTitlebarDoubleClick} className="sori-titlebar px-2 sm:px-4 flex items-center justify-between gap-1 sm:gap-3 select-none text-[13px] text-[#68635D]">
      <button data-sori-no-drag
        type="button"
        onClick={onToggleMobileSidebar}
        aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
        className="md:hidden sori-tactile-btn rounded-[9px] p-1.5"
      >
        {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>
      <button type="button" onClick={onToggleSidebarCollapse} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-pressed={sidebarCollapsed} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="sori-titlebar__sidebar-toggle sori-tactile-btn hidden md:inline-flex rounded-[8px] p-1.5">
        {sidebarCollapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
      </button>
      {/* Left: product command context. The native frame is replaced by this bar. */}
      <div className="min-w-0 flex items-center gap-2.5">
        <div className="hidden sm:flex h-7 w-7 items-center justify-center rounded-[9px] border border-[rgba(92,84,75,0.10)] bg-white/70 text-[#5E564E] shadow-2xs" aria-hidden="true">
          <Command className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex items-center gap-2">
          <span className="hidden md:inline font-semibold text-[#1C1B19] tracking-tight">Command Center</span>
          <span title={runtimeError ?? undefined} className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${runtimeSource === 'backend' ? 'bg-[#EAF6EE] text-[#1F6B43] border-[#CBE5D4]' : runtimeSource === 'mock' ? 'bg-[#FFF5DD] text-[#8A6418] border-[#EBD9A8]' : 'bg-[#F9EBEA] text-[#A75850] border-[#E8C6C2]'}`}>
            <CircleDot className="h-2.5 w-2.5" aria-hidden="true" />
            {runtimeConnected ? (runtimeSource === 'native' ? 'Native' : 'Backend') : runtimeSource === 'mock' ? 'Mock fallback' : 'Unavailable'}
          </span>
          <span className="hidden sm:inline text-[11px] px-2 py-0.5 rounded-full bg-[rgba(235,230,223,0.5)] text-[#68635D] font-mono border border-[rgba(92,84,75,0.08)]">
            v0.2
          </span>
        </div>
      </div>

      {/* Center: local preview action and runtime status */}
      <div data-sori-no-drag className="sori-titlebar__center-actions flex items-center gap-2.5 min-w-0">
        <button
          onClick={toggleListening}
          title="Browser preview only — daemon microphone capture is not connected"
          aria-label={isListening ? 'Stop browser microphone preview' : 'Start browser microphone preview'}
          className={`px-3.5 py-1.5 rounded-[12px] font-medium transition-all flex items-center gap-2 text-[12px] border ${
            isListening
              ? 'bg-[#A75850] text-white border-[#A75850] animate-pulse'
              : 'sori-tactile-btn'
          }`}
        >
          <Mic className={`w-3.5 h-3.5 ${isListening ? 'text-white' : 'text-[#68635D]'}`} />
          <span className="hidden sm:inline">{isListening ? 'Preview listening…' : 'Preview capture'}</span>
        </button>

        <button onClick={onTogglePaused} aria-label={runtimeStatus.paused ? 'Resume Sori daemon' : 'Pause Sori daemon'} disabled={!runtimeConnected} title={runtimeSource === 'mock' ? 'Daemon controls are unavailable in preview mode' : undefined} className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-[12px] bg-[rgba(255,253,249,0.76)] border border-[rgba(92,84,75,0.12)] text-[11px] text-[#68635D] font-mono shadow-2xs disabled:opacity-50">
          {runtimeStatus.paused ? 'Resume daemon' : 'Pause daemon'}
        </button>
        <button type="button" onClick={() => onNavigate('models')} aria-label="Open model routing" className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[11px] text-[#68635D] font-mono">
          <Flame className="w-3.5 h-3.5 text-[#98928A]" />
          <span>Route: Local · Whisper Q5</span>
        </button>
      </div>

      {/* Right: Quick Tools and native window controls */}
      <div data-sori-no-drag className="sori-titlebar__actions flex items-center gap-2">
        {/* Tray Toggle */}
        <button
          type="button"
          onClick={() => setTrayOpen(!trayOpen)}
          aria-expanded={trayOpen}
          aria-controls="tray-quick-controls"
          aria-label={trayOpen ? 'Close quick controls' : 'Open quick controls'}
          className={`sori-titlebar__quick-controls px-3 py-1.5 rounded-[9px] border text-[12px] font-medium transition-all flex items-center gap-1.5 ${
            trayOpen
              ? 'bg-[rgba(221,217,211,0.46)] border-[rgba(91,84,77,0.15)] text-[#1C1B19] font-semibold'
              : 'sori-tactile-btn'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${trayOpen ? 'bg-[#4E7A61]' : 'bg-[#98928A]'}`} />
          <span className="hidden sm:inline">Quick controls</span>
        </button>


        <div className="sori-window-controls flex shrink-0 items-center" role="group" aria-label="Window controls">
          <button type="button" aria-label="Minimize window" title="Minimize" onClick={() => void runWindowAction('minimize')} className="sori-window-control">
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label={isMaximized ? 'Restore window' : 'Maximize window'} aria-pressed={isMaximized} title={isMaximized ? 'Restore' : 'Maximize'} onClick={() => void runWindowAction('toggle-maximize')} className="sori-window-control">
            {isMaximized ? <Copy className="h-3.5 w-3.5" aria-hidden="true" /> : <Square className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
          <button type="button" aria-label="Close window" title="Close" onClick={() => void runWindowAction('close')} className="sori-window-control sori-window-control-close">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};

