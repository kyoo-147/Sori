import React, { useEffect, useState } from 'react';
import { AppSettings } from '../../types';
import type { RuntimeClient } from '../../runtime-client';
import { Sliders, Mic, Volume2, Shield, X, Check, Activity, Keyboard, Layers, Sparkles, Monitor, Terminal, Zap, Power, Cpu } from 'lucide-react';

interface StudioSettingsScreenProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  runtimeClient: RuntimeClient;
}

export type SettingsTab =
  | 'General'
  | 'Hotkey'
  | 'Microphone'
  | 'Overlay'
  | 'Text Injection'
  | 'Startup & Runtime'
  | 'Profiles'
  | 'Labs'
  | 'Advanced'
  | 'Data & Privacy';

export const StudioSettingsScreen: React.FC<StudioSettingsScreenProps> = ({
  settings,
  setSettings,
  runtimeClient,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('Microphone');
  const [micTestMsg, setMicTestMsg] = useState<string | null>(null);
  const [configMsg, setConfigMsg] = useState<string | null>(null);
  const [savingHotkey, setSavingHotkey] = useState(false);
  const [hotkeyDraft, setHotkeyDraft] = useState(settings.hotkey);
  const [micCheck, setMicCheck] = useState<string>('UNVERIFIED: microphone readiness has not been checked.');
  const [micReadiness, setMicReadiness] = useState<'checking' | 'ready' | 'attention' | 'unverified'>('unverified');

  useEffect(() => {
    runtimeClient.configSummary().then((result) => {
      if (result.error || !result.data) return;
      const config = result.data;
      setHotkeyDraft(config.hotkey);
      setSettings((current) => ({ ...current, hotkey: config.hotkey }));
    });
    void checkMicrophone();
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
    if (!binding) {
      setConfigMsg('Enter a combination such as Ctrl+Alt+K.');
      return;
    }
    setSavingHotkey(true);
    const result = await runtimeClient.setConfig('hotkey.binding', binding);
    setSavingHotkey(false);
    if (result.error || !result.data.accepted) {
      setConfigMsg(`Not registered: ${result.error ?? result.data.detail}. The previous hotkey remains active.`);
      return;
    }
    setSettings((current) => ({ ...current, hotkey: binding }));
    setConfigMsg(`Registered ${binding}. The old hotkey was unregistered and SQLite was updated.`);
  };

  const mainTabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'General', label: 'General', icon: <Sliders className="w-3.5 h-3.5" /> },
    { id: 'Hotkey', label: 'Hotkey', icon: <Keyboard className="w-3.5 h-3.5" /> },
    { id: 'Microphone', label: 'Microphone', icon: <Mic className="w-3.5 h-3.5" /> },
    { id: 'Overlay', label: 'Overlay', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'Text Injection', label: 'Text Injection', icon: <Terminal className="w-3.5 h-3.5" /> },
    { id: 'Startup & Runtime', label: 'Startup & Runtime', icon: <Power className="w-3.5 h-3.5" /> },
  ];

  const advancedTabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'Profiles', label: 'Profiles', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: 'Labs', label: 'Labs', icon: <Zap className="w-3.5 h-3.5" /> },
    { id: 'Advanced', label: 'Advanced', icon: <Cpu className="w-3.5 h-3.5" /> },
    { id: 'Data & Privacy', label: 'Data & Privacy', icon: <Shield className="w-3.5 h-3.5" /> },
  ];

  const handleTestMic = async () => { setMicTestMsg('Checking configured device and permission…'); await checkMicrophone(); setMicTestMsg('Readiness checked without recording. Speak into the microphone only during an opted-in native acceptance run.'); };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 text-[#161616]">
      {/* Page Heading */}
      <div className="border-b border-[#E2E4E8] pb-3 mb-6">
        <h1 className="sori-page-heading">Sori System Settings</h1>
        <p className="sori-body-text mt-0.5">
          Configure microphone input, local hotkey triggers, overlay visuals, and daemon behavior.
        </p>
      </div>

      {/* Settings Dialog Container */}
      <div className="bg-white border border-[#E2E4E8] rounded-[18px] shadow-2xs overflow-hidden grid md:grid-cols-[210px_1fr]">
        {/* Settings Left Navigation Sidebar */}
        <div className="bg-[#F8F8F7] border-r border-[#E2E4E8] p-4 space-y-4 text-xs font-medium text-[#5F6368]">
          <div className="space-y-1">
            <div className="text-[10px] uppercase font-bold text-[#858A90] tracking-wider px-2 pb-1">Core Config</div>
            {mainTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full text-left px-3 py-2 rounded-[8px] transition-all flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'bg-white border border-[#E2E4E8] font-semibold text-[#161616] shadow-2xs'
                    : 'hover:bg-[#EEF2F6] text-[#5F6368]'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="space-y-1 pt-2 border-t border-[#E2E4E8]">
            <div className="text-[10px] uppercase font-bold text-[#858A90] tracking-wider px-2 pb-1">System & Expert</div>
            {advancedTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full text-left px-3 py-2 rounded-[8px] transition-all flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'bg-white border border-[#E2E4E8] font-semibold text-[#161616] shadow-2xs'
                    : 'hover:bg-[#EEF2F6] text-[#5F6368]'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right Settings Pane */}
        <div className="p-6 space-y-5 bg-white">
          <div className="flex items-center justify-between pb-3 border-b border-[#E2E4E8]">
            <h2 className="text-sm font-semibold text-[#161616]">{activeTab}</h2>
            <span className="text-[11px] font-mono text-[#858A90]">Sori Daemon Engine</span>
          </div>

          {activeTab === 'Microphone' && (
            <div className="space-y-4 text-xs">
              <p className="text-[#5F6368]">Microphone discovery, permission, device selection, and level testing are owned by sorid. This screen does not claim hardware state.</p>
              <div className={`p-3 border rounded-[10px] ${micReadiness === 'ready' ? 'bg-[#E8F1E9] border-[#BFD7C5] text-[#315C42]' : 'bg-[#FFF7E6] border-[#EBD9A8] text-[#6B552C]'}`} role="status">{micCheck}</div>
              {micTestMsg && <div className="p-3 bg-[#EEF2F6] border border-[#D5E0EA] rounded-[10px] text-[#24384C] font-mono text-[11px]">{micTestMsg}</div>}
              <button type="button" onClick={() => void handleTestMic()} disabled={micReadiness === 'checking'} className="px-4 py-2 bg-white text-[#24384C] rounded-[10px] font-medium border border-[#D5E0EA] disabled:opacity-50">Check microphone readiness</button>
              <p className="text-[11px] text-[#858A90]">This checks only software-visible configuration, permission errors, and device availability. It does not record or claim speech input.</p>
            </div>
          )}

          {activeTab === 'Hotkey' && (
            <div className="space-y-4 text-xs">
              <p className="text-[#5F6368]">Configure global activation hotkeys for push-to-talk and voice editing modes.</p>
              <div className="space-y-3">
                <div className="p-3 bg-[#F8F8F7] border border-[#E2E4E8] rounded-[12px] space-y-1">
                  <label className="font-semibold text-[#161616]">Push-to-Talk Hotkey:</label>
                  <input
                    type="text"
                    value={hotkeyDraft}
                    onChange={(e) => setHotkeyDraft(e.target.value)}
                    onBlur={() => void saveHotkey()}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void saveHotkey(); } }}
                    aria-describedby="hotkey-help"
                    disabled={savingHotkey}
                    className="w-full bg-white border border-[#E2E4E8] rounded-[8px] p-2 text-xs font-mono font-bold"
                  />
                  <div id="hotkey-help" className="text-[11px] text-[#858A90]">Use Alt, Ctrl, Shift, or Win plus one key. Save attempts native registration first; conflicts leave the previous binding active.</div>
                  <button type="button" onClick={() => void saveHotkey()} disabled={savingHotkey} className="px-3 py-1.5 rounded-[8px] border border-[#D5E0EA] bg-white font-medium disabled:opacity-50">{savingHotkey ? 'Registering…' : 'Register hotkey'}</button>
                </div>

                <div className="p-3 bg-[#F8F8F7] border border-[#E2E4E8] rounded-[12px] space-y-1">
                  <label className="font-semibold text-[#161616]">Selection Voice Edit Hotkey:</label>
                  <input
                    type="text"
                    value="Ctrl + Alt + Space"
                    readOnly
                    className="w-full bg-white border border-[#E2E4E8] rounded-[8px] p-2 text-xs font-mono font-bold"
                  />
                  <div className="text-[11px] text-[#858A90]">Select text in any app, press shortcut, speak transformation.</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'General' && (
            <div className="space-y-4 text-xs">
              <p className="text-[#5F6368]">General application behavior and theme preferences.</p>
              <div className="p-3 bg-[#F8F8F7] border border-[#E2E4E8] rounded-[12px] space-y-2">
                <div className="font-semibold text-[#161616]">Language & Region</div>
                <select disabled aria-label="Language and region preview" className="w-full bg-white border border-[#E2E4E8] rounded-[8px] p-2 text-xs text-[#858A90]" title="Runtime support is not installed yet">
                  <option>English (US)</option>
                  <option>Vietnamese (Tiếng Việt)</option>
                  <option>Bilingual Auto-Detect (EN / VI)</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'Overlay' && (
            <div className="space-y-4 text-xs">
              <p className="text-[#5F6368]">Choose visual overlay style when dictation hotkey is held down.</p>
              <div className="p-3 bg-[#F8F8F7] border border-[#E2E4E8] rounded-[12px] text-[#5F6368]">
                The compact Sori overlay is fixed for the current desktop shell. Experimental overlay variants are not part of the production surface.
              </div>
            </div>
          )}

          {activeTab === 'Text Injection' && (
            <div className="space-y-4 text-xs">
              <p className="text-[#5F6368]">Configure how dictated text is pasted into focused applications.</p>
              <div className="p-3 bg-[#FFF7E6] border border-[#EBD9A8] rounded-[12px] text-[#6B552C]">Unavailable: injection strategy selection is not exposed by the canonical IPC contract. No focused-app success is claimed.</div>
            </div>
          )}

          {activeTab === 'Startup & Runtime' && (
            <div className="space-y-4 text-xs">
              <p className="text-[#5F6368]">Configure startup and background runtime behavior.</p>
              <div className="p-3 bg-[#FFF7E6] border border-[#EBD9A8] rounded-[12px] text-[#6B552C]">Unavailable: startup persistence and an OS notification-area icon are not exposed by the canonical IPC contract. Quick Controls are available only inside this app window.</div>
            </div>
          )}

          {(activeTab === 'Profiles' || activeTab === 'Labs' || activeTab === 'Advanced' || activeTab === 'Data & Privacy') && (
            <div className="space-y-4 text-xs">
              <div className="p-4 bg-[#F8F8F7] border border-[#E2E4E8] rounded-[12px] space-y-2">
                <div className="font-semibold text-[#161616]">{activeTab} Configuration</div>
                <p className="text-[#5F6368]">
                  Unavailable: no canonical IPC operation exists for these settings yet.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    {configMsg && <p className="mt-3 text-xs text-[#9A7442]" role="status">{configMsg}</p>}
    </div>
  );
};
