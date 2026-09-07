import React, { useEffect, useState } from 'react';
import { ActiveScreen, AppSettings } from '../types';
import type { DaemonStatus, RuntimeSource } from '../runtime-client';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Activity, Copy, Menu, Mic, Minus, PanelLeftClose, PanelLeftOpen, Pause, Play, Settings2, Square, X } from 'lucide-react';
import { performWindowAction, tauriWindowControls, type WindowAction } from '../window-controls';

export const isTitlebarInteractiveTarget = (target: EventTarget | null) =>
  typeof Element !== 'undefined' && target instanceof Element && Boolean(target.closest('[data-sori-no-drag], button, a, input, select, textarea'));
export const titlebarRouteLabel = (runtimeSource: RuntimeSource, activeModelName: string) =>
  runtimeSource === 'native' || runtimeSource === 'backend' ? `Route: ${activeModelName}` : 'Route: UNVERIFIED';
export const titlebarCaptureLabel = (runtimeSource: RuntimeSource, isListening: boolean) => isListening ? 'Stop daemon dictation' : runtimeSource === 'native' || runtimeSource === 'backend' ? 'Start daemon dictation' : 'Dictation unavailable';
export const titlebarCaptureDisabled = (runtimeSource: RuntimeSource) => runtimeSource === 'mock' || runtimeSource === 'unavailable';
export const handleTitlebarMouseDownBoundary = (target: EventTarget | null, button: number, startDragging: () => void) => {
  if (button !== 0 || isTitlebarInteractiveTarget(target)) return;
  startDragging();
};

interface DesktopTitleBarProps {
  settings: AppSettings; setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  isListening: boolean; toggleListening: () => void; trayOpen: boolean; setTrayOpen: (open: boolean) => void;
  activeModelName: string; runtimeSource: RuntimeSource; runtimeStatus: DaemonStatus; runtimeError: string | null;
  onWindowError: (message: string) => void; onTogglePaused: () => void; onReconnect: () => void;
  sidebarOpen: boolean; onToggleMobileSidebar: () => void; onToggleSidebarCollapse: () => void;
  sidebarCollapsed: boolean; onNavigate: (screen: ActiveScreen) => void;
}

export const DesktopTitleBar: React.FC<DesktopTitleBarProps> = ({
  isListening, toggleListening, trayOpen, setTrayOpen, runtimeSource, runtimeStatus, runtimeError,
  onWindowError, onTogglePaused, onReconnect, sidebarOpen, onToggleMobileSidebar, onToggleSidebarCollapse,
  sidebarCollapsed, onNavigate, activeModelName,
}) => {
  const runtimeConnected = runtimeSource === 'native' || runtimeSource === 'backend';
  const [isMaximized, setIsMaximized] = useState(false);
  const isTauri = '__TAURI_INTERNALS__' in globalThis;
  const refreshMaximized = () => { if (isTauri) void getCurrentWindow().isMaximized().then(setIsMaximized).catch(() => undefined); };
  useEffect(() => {
    if (!isTauri) return;
    const win = getCurrentWindow(); let disposed = false; refreshMaximized();
    let unlisten: (() => void) | undefined;
    win.onResized(() => { if (!disposed) refreshMaximized(); }).then((unsubscribe) => { if (disposed) unsubscribe(); else unlisten = unsubscribe; }).catch(() => undefined);
    return () => { disposed = true; unlisten?.(); };
  }, [isTauri]);
  const runWindowAction = async (action: WindowAction) => {
    if (!isTauri) return;
    try { await performWindowAction(tauriWindowControls, action); if (action === 'maximize' || action === 'restore' || action === 'toggle-maximize') { window.setTimeout(refreshMaximized, 80); window.setTimeout(refreshMaximized, 240); } }
    catch (error) { onWindowError(`[titlebar:${action}] ${error instanceof Error ? error.message : String(error)}`); }
  };
  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => handleTitlebarMouseDownBoundary(event.target, event.button, () => void runWindowAction('drag'));
  const handleTitlebarDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => { if (!isTitlebarInteractiveTarget(event.target)) void runWindowAction('toggle-maximize'); };
  return (
    <div role="toolbar" aria-label="Sori window title bar" onMouseDown={handleMouseDown} onDoubleClick={handleTitlebarDoubleClick} className="sori-titlebar">
      <div className="sori-titlebar__leading" data-sori-no-drag>
        <button type="button" onClick={onToggleMobileSidebar} aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'} className="sori-titlebar__mobile-menu md:hidden">{sidebarOpen ? <X /> : <Menu />}</button>
        <button type="button" onClick={onToggleSidebarCollapse} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-pressed={sidebarCollapsed} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="sori-titlebar__sidebar-toggle hidden md:inline-flex">{sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
        <span className="sori-titlebar__brand">Sori</span>
      </div>
      <div className="sori-titlebar__center-actions" data-sori-no-drag>
        <button type="button" onClick={toggleListening} disabled={titlebarCaptureDisabled(runtimeSource)} title={titlebarCaptureDisabled(runtimeSource) ? 'Unavailable until the canonical sorid runtime is connected' : 'Uses canonical DictationStart/DictationStop IPC'} aria-label={titlebarCaptureLabel(runtimeSource, isListening)} className={`sori-capture-button ${isListening ? 'is-listening' : ''}`}><Mic /><span>{isListening ? 'Stop daemon dictation' : 'Dictate'}</span></button>
        <button type="button" onClick={onTogglePaused} disabled={!runtimeConnected} aria-label={runtimeStatus.paused ? 'Resume Sori daemon' : 'Pause Sori daemon'} title={!runtimeConnected ? 'Unavailable until the canonical sorid runtime is connected' : undefined} className="sori-titlebar__status-action">{runtimeStatus.paused ? <Play /> : <Pause />}<span className="hidden lg:inline">{runtimeStatus.paused ? 'Resume' : 'Pause'}</span></button>
      </div>
      <div className="sori-titlebar__actions" data-sori-no-drag>
        <button type="button" className={`sori-runtime-affordance ${runtimeConnected ? 'is-connected' : 'is-unavailable'}`} onClick={runtimeConnected ? () => onNavigate('models') : onReconnect} title={runtimeError ?? (runtimeConnected ? titlebarRouteLabel(runtimeSource, activeModelName) : 'Runtime unavailable. Reconnect to try again.')} aria-label={runtimeConnected ? titlebarRouteLabel(runtimeSource, activeModelName) : 'Runtime unavailable; reconnect'}><Activity /><span className="hidden sm:inline">{runtimeConnected ? 'Ready' : 'Unavailable'}</span></button>
        <button type="button" onClick={() => setTrayOpen(!trayOpen)} aria-expanded={trayOpen} aria-controls="tray-quick-controls" aria-label={trayOpen ? 'Close quick controls' : 'Open quick controls'} className={`sori-quick-controls ${trayOpen ? 'is-open' : ''}`}><Settings2 /><span className="hidden sm:inline">Controls</span></button>
        <div className="sori-window-controls" role="group" aria-label="Window controls"><button type="button" aria-label="Minimize window" title="Minimize" onClick={() => void runWindowAction('minimize')}><Minus /></button><button type="button" aria-label={isMaximized ? 'Restore window' : 'Maximize window'} onClick={() => void runWindowAction('toggle-maximize')}><>{isMaximized ? <Copy /> : <Square />}</></button><button type="button" aria-label="Close window" title="Close" onClick={() => void runWindowAction('close')} className="is-close"><X /></button></div>
      </div>
    </div>
  );
};
