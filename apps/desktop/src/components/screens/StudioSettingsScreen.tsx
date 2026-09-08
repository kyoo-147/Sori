import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { themePickerFocusIndex, shouldRestoreThemeTriggerFocus, type ThemePickerCloseReason } from './theme-picker-behavior';
import { getThemePickerPlacement, type ThemePickerPlacement } from './theme-picker-placement';
import { AppSettings } from '../../types';
import type { RuntimeClient } from '../../runtime-client';
import { soriThemes, themeLabels, themePalettes } from '../../../design-system/tokens';
import './StudioSettingsScreen.css';
import { Sliders, Mic, Shield, X, Check, CheckCircle2, ChevronDown, Keyboard, Layers, Sparkles, Terminal, Power, Cpu } from 'lucide-react';

interface StudioSettingsScreenProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  runtimeClient: RuntimeClient;
  onClose?: () => void;
  closeRef?: React.RefObject<HTMLButtonElement | null>;
  /** Modal surfaces omit the standalone page framing and own their close affordance. */
  compact?: boolean;
}

export type SettingsTab = 'General' | 'Hotkey' | 'Microphone' | 'Overlay' | 'Text Injection' | 'Startup & Runtime' | 'Profiles' | 'Labs' | 'Advanced' | 'Data & Privacy';
type Tab = { id: SettingsTab; label: string; icon: React.ReactNode };

const coreTabs: Tab[] = [
  { id: 'General', label: 'General', icon: <Sliders aria-hidden="true" /> },
  { id: 'Hotkey', label: 'Hotkey', icon: <Keyboard aria-hidden="true" /> },
  { id: 'Microphone', label: 'Microphone', icon: <Mic aria-hidden="true" /> },
  { id: 'Overlay', label: 'Overlay', icon: <Layers aria-hidden="true" /> },
  { id: 'Text Injection', label: 'Text injection', icon: <Terminal aria-hidden="true" /> },
  { id: 'Startup & Runtime', label: 'Startup & runtime', icon: <Power aria-hidden="true" /> },
];
const systemTabs: Tab[] = [
  { id: 'Profiles', label: 'Profiles', icon: <Sparkles aria-hidden="true" /> },
  { id: 'Advanced', label: 'Advanced', icon: <Cpu aria-hidden="true" /> },
  { id: 'Data & Privacy', label: 'Data & privacy', icon: <Shield aria-hidden="true" /> },
];

export const StudioSettingsScreen: React.FC<StudioSettingsScreenProps> = ({ settings, setSettings, runtimeClient, onClose, closeRef, compact = false }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('General');
  const [micTestMsg, setMicTestMsg] = useState<string | null>(null);
  const [configMsg, setConfigMsg] = useState<string | null>(null);
  const [savingHotkey, setSavingHotkey] = useState(false);
  const [hotkeyDraft, setHotkeyDraft] = useState(settings.hotkey);
  const [micCheck, setMicCheck] = useState('UNVERIFIED: microphone readiness has not been checked.');
  const [micReadiness, setMicReadiness] = useState<'checking' | 'ready' | 'attention' | 'unverified'>('unverified');
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const themePickerRef = useRef<HTMLDivElement>(null);
  const themeTriggerRef = useRef<HTMLButtonElement>(null);
  const themeOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [themePickerPlacement, setThemePickerPlacement] = useState<ThemePickerPlacement>('below');
  const [themePickerMaxHeight, setThemePickerMaxHeight] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    setConfigLoading(true);
    runtimeClient.configSummary().then((result) => {
      if (!mounted) return;
      if (result.error || !result.data) setConfigError(result.error ?? 'Settings are unavailable right now.');
      else { setHotkeyDraft(result.data.hotkey); setSettings((current) => ({ ...current, hotkey: result.data!.hotkey })); }
      setConfigLoading(false);
    });
    void checkMicrophone();
    return () => { mounted = false; };
  }, [runtimeClient, setSettings]);

  const checkMicrophone = async () => {
    setMicReadiness('checking');
    const result = await runtimeClient.audioReadiness();
    if (result.error) { setMicReadiness('unverified'); setMicCheck(`UNVERIFIED: ${result.error}`); return; }
    setMicReadiness(result.data.state === 'Ready' ? 'ready' : 'attention');
    setMicCheck(`${result.data.state}: ${result.data.detail} Physical speech signal: ${result.data.signal}.`);
  };
  const saveHotkey = async () => {
    const binding = hotkeyDraft.trim();
    if (!binding) { setConfigMsg('Enter a combination such as Ctrl+Alt+K.'); return; }
    setSavingHotkey(true);
    const result = await runtimeClient.setConfig('hotkey.binding', binding);
    setSavingHotkey(false);
    if (result.error || !result.data.accepted) { setConfigMsg(`Not registered: ${result.error ?? result.data.detail}. The previous hotkey remains active.`); return; }
    setSettings((current) => ({ ...current, hotkey: binding }));
    setConfigMsg(`Registered ${binding}. The previous shortcut was replaced.`);
  };
  const handleTestMic = async () => { setMicTestMsg('Checking configured device and permission…'); await checkMicrophone(); setMicTestMsg('Readiness checked without recording.'); };
  const tabs = [...coreTabs, ...systemTabs];
  const themeIndex = Math.max(0, soriThemes.indexOf(settings.theme));
  const closeThemePicker = (reason: ThemePickerCloseReason) => {
    if (shouldRestoreThemeTriggerFocus(reason)) themeTriggerRef.current?.focus();
    setThemePickerOpen(false);
  };
  const openThemePicker = () => setThemePickerOpen(true);
  const selectTheme = (index: number, close = true) => {
    const next = (index + soriThemes.length) % soriThemes.length;
    setSettings((current) => ({ ...current, theme: soriThemes[next] }));
    if (close) closeThemePicker('selection');
    else themeOptionRefs.current[next]?.focus();
  };
  useLayoutEffect(() => {
    if (!themePickerOpen || !themePickerRef.current || !themeMenuRef.current) return;
    const picker = themePickerRef.current;
    const menu = themeMenuRef.current;
    const scrollContainer = picker.closest<HTMLElement>('.settings-panel--modal') ?? document.documentElement;
    const updatePlacement = () => {
      const pickerRect = picker.getBoundingClientRect();
      const containerRect = scrollContainer === document.documentElement
        ? { top: 0, bottom: window.innerHeight }
        : scrollContainer.getBoundingClientRect();
      const gap = 6;
      const above = pickerRect.top - containerRect.top - gap;
      const below = containerRect.bottom - pickerRect.bottom - gap;
      const result = getThemePickerPlacement({ above, below, menuHeight: menu.scrollHeight });
      setThemePickerPlacement(result.placement);
      setThemePickerMaxHeight(result.maxHeight);
    };
    updatePlacement();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePlacement);
    resizeObserver?.observe(scrollContainer);
    window.addEventListener('resize', updatePlacement);
    scrollContainer.addEventListener('scroll', updatePlacement, { passive: true });
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updatePlacement);
      scrollContainer.removeEventListener('scroll', updatePlacement);
    };
  }, [themePickerOpen, activeTab, themeIndex]);
  useEffect(() => {
    if (!themePickerOpen) return;
    const focusIndex = themePickerFocusIndex(themeIndex, soriThemes.length);
    if (focusIndex >= 0) themeOptionRefs.current[focusIndex]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (themePickerRef.current && !themePickerRef.current.contains(event.target as Node)) closeThemePicker('outside');
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeThemePicker('escape'); }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [themePickerOpen, themeIndex]);
  const moveTheme = (offset: number) => selectTheme(themeIndex + offset, false);

  const renderContent = () => {
    if (activeTab === 'Microphone') return <section className="space-y-4" aria-labelledby="settings-section-title"><p className="settings-copy">Check microphone access before dictation.</p><div className={`settings-status ${micReadiness === 'ready' ? 'settings-status--ready' : 'settings-status--attention'}`} role="status"><span className="settings-status__dot" />{micCheck}</div>{micTestMsg && <div className="settings-note" role="status">{micTestMsg}</div>}<button type="button" onClick={() => void handleTestMic()} disabled={micReadiness === 'checking'} className="settings-button settings-button--primary">{micReadiness === 'checking' ? 'Checking…' : 'Check microphone'}</button><p className="settings-help">Checks software status only; it does not record audio.</p></section>;
    if (activeTab === 'Hotkey') return <section className="space-y-4"><p className="settings-copy">Choose the shortcut that starts and stops dictation.</p><div className="settings-group"><label htmlFor="push-hotkey" className="settings-label">Push-to-talk shortcut</label><input id="push-hotkey" type="text" value={hotkeyDraft} onChange={(e) => setHotkeyDraft(e.target.value)} onBlur={() => void saveHotkey()} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void saveHotkey(); } }} aria-describedby="hotkey-help" disabled={savingHotkey} className="settings-input settings-input--mono" /><div id="hotkey-help" className="settings-help">Use Alt, Ctrl, Shift, or Win plus one key. Conflicts keep the previous shortcut.</div><button type="button" onClick={() => void saveHotkey()} disabled={savingHotkey} className="settings-button">{savingHotkey ? 'Registering…' : 'Register shortcut'}</button></div><div className="settings-group"><div className="settings-label">Selection voice edit</div><div className="settings-input settings-input--mono settings-input--readonly">Ctrl + Alt + Space</div><div className="settings-help">Shortcut for transforming selected text.</div></div></section>;
    if (activeTab === 'General') return <section className="settings-section"><p className="settings-copy">Choose a workspace palette. Changes apply immediately and remain selected after restart.</p><div className="settings-group"><span className="settings-label" id="theme-label">Workspace palette</span><div className="theme-picker" ref={themePickerRef}><button type="button" ref={themeTriggerRef} className="theme-picker__trigger" aria-haspopup="listbox" aria-expanded={themePickerOpen} aria-labelledby="theme-label theme-picker-value" onClick={() => themePickerOpen ? closeThemePicker('trigger') : openThemePicker()} onKeyDown={(event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openThemePicker(); } }}><span className="theme-picker__swatch" style={{ backgroundColor: themePalettes[settings.theme].primary }} aria-hidden="true" /><span id="theme-picker-value" className="theme-picker__name">{themeLabels[settings.theme]}</span><ChevronDown className="theme-picker__chevron" aria-hidden="true" /></button>{themePickerOpen && <div ref={themeMenuRef} className={`theme-picker__menu theme-picker__menu--${themePickerPlacement}`} style={themePickerMaxHeight ? { '--theme-picker-max-height': `${themePickerMaxHeight}px` } as React.CSSProperties : undefined} role="listbox" aria-labelledby="theme-label">{soriThemes.map((id, index) => <button key={id} ref={(element) => { themeOptionRefs.current[index] = element; }} type="button" role="option" aria-selected={settings.theme === id} tabIndex={settings.theme === id ? 0 : -1} className={'theme-picker__option' + (settings.theme === id ? ' is-selected' : '')} onClick={() => selectTheme(index)} onKeyDown={(event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { event.preventDefault(); moveTheme(1); } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { event.preventDefault(); moveTheme(-1); } else if (event.key === 'Home') { event.preventDefault(); selectTheme(0); } else if (event.key === 'End') { event.preventDefault(); selectTheme(soriThemes.length - 1); } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectTheme(index); } }}><span className="theme-picker__swatch" style={{ backgroundColor: themePalettes[id].primary }} aria-hidden="true" /><span className="theme-picker__name">{themeLabels[id]}</span>{settings.theme === id && <Check className="theme-picker__check" aria-hidden="true" />}</button>)}</div>}</div></div><div className="settings-group"><label htmlFor="language-region" className="settings-label">Language &amp; region</label><select id="language-region" disabled aria-label="Language and region preview" className="settings-input"><option>English (US)</option><option>Vietnamese (Tiếng Việt)</option><option>Bilingual Auto-Detect (EN / VI)</option></select><p className="settings-help">Additional languages are not yet available.</p></div></section>;
    if (activeTab === 'Overlay') return <section className="space-y-4"><p className="settings-copy">Choose how Sori appears while the dictation shortcut is held.</p><div className="settings-note">The compact overlay is currently the only available option.</div></section>;
    if (activeTab === 'Text Injection') return <section className="space-y-4"><p className="settings-copy">How dictated text reaches the focused application.</p><div className="settings-status settings-status--attention" role="status">Unavailable: text injection is not connected. No focused-app success is claimed.</div></section>;
    if (activeTab === 'Startup & Runtime') return <section className="space-y-4"><p className="settings-copy">Startup and background runtime behavior.</p><div className="settings-status settings-status--attention" role="status">Unavailable: startup persistence and a notification-area icon are not connected.</div></section>;
    return <section className="space-y-4"><div className="settings-note"><div className="settings-label">{activeTab}</div><p className="settings-copy mt-2">Unavailable: these settings are not connected yet.</p></div></section>;
  };

  return <div className={compact ? 'settings-panel settings-panel--modal' : 'settings-panel sori-page-layout'}>
    <header className="settings-header"><div><h1 className="settings-title sori-page-heading">Settings</h1></div>{onClose && <button type="button" onClick={onClose} ref={closeRef} className="settings-close" aria-label="Close settings"><X aria-hidden="true" /></button>}</header>
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="Settings sections"><div className="settings-nav__label">Core</div>{coreTabs.map((tab) => <TabButton key={tab.id} tab={tab} active={activeTab === tab.id} onSelect={setActiveTab} />)}<div className="settings-nav__label settings-nav__label--spaced">System</div>{systemTabs.map((tab) => <TabButton key={tab.id} tab={tab} active={activeTab === tab.id} onSelect={setActiveTab} />)}</nav>
      <main className="settings-content" aria-labelledby="settings-section-title"><div className="settings-content__heading"><div><h2 id="settings-section-title">{activeTab}</h2></div>{activeTab === 'Microphone' && <span className="settings-chip"><CheckCircle2 aria-hidden="true" /> Local</span>}</div>{configLoading && <div className="settings-note" role="status">Loading canonical settings...</div>}{configError && <div className="settings-status settings-status--error" role="alert">Settings unavailable: {configError}</div>}{renderContent()}{configMsg && <p className="settings-feedback" role="status">{configMsg}</p>}</main>
    </div>
  </div>;
};

function TabButton({ tab, active, onSelect }: { tab: Tab; active: boolean; onSelect: (id: SettingsTab) => void }) {
  return <button type="button" onClick={() => onSelect(tab.id)} aria-current={active ? 'page' : undefined} className={`settings-tab${active ? ' settings-tab--active' : ''}`}><span className="settings-tab__icon">{tab.icon}</span><span>{tab.label}</span></button>;
}
