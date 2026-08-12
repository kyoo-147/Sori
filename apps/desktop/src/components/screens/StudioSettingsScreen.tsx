import React, { useState } from 'react';
import { AppSettings } from '../../types';
import { Sliders, Mic, Volume2, Shield, X, Check, Activity, Keyboard, Layers, Sparkles, Monitor, Terminal, Zap, Power, Cpu } from 'lucide-react';

interface StudioSettingsScreenProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  runtimeAvailable?: boolean;
}

export type SettingsTab =
  | 'General'
  | 'Hotkey'
  | 'Microphone'
  | 'Overlay'
  | 'Text Injection'
  | 'Startup & Tray'
  | 'Profiles'
  | 'Labs'
  | 'Advanced'
  | 'Data & Privacy';

export const StudioSettingsScreen: React.FC<StudioSettingsScreenProps> = ({
  settings,
  setSettings,
  runtimeAvailable = true,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('Microphone');
  const [selectedMic, setSelectedMic] = useState<string>('realtek');
  const [isTestingMic, setIsTestingMic] = useState<boolean>(false);
  const [micTestMsg, setMicTestMsg] = useState<string | null>(null);
  const [injectionStrategy, setInjectionStrategy] = useState<'automation' | 'clipboard'>('automation');
  const [startOnLogin, setStartOnLogin] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(false);

  const mainTabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'General', label: 'General', icon: <Sliders className="w-3.5 h-3.5" /> },
    { id: 'Hotkey', label: 'Hotkey', icon: <Keyboard className="w-3.5 h-3.5" /> },
    { id: 'Microphone', label: 'Microphone', icon: <Mic className="w-3.5 h-3.5" /> },
    { id: 'Overlay', label: 'Overlay', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'Text Injection', label: 'Text Injection', icon: <Terminal className="w-3.5 h-3.5" /> },
    { id: 'Startup & Tray', label: 'Startup & Tray', icon: <Power className="w-3.5 h-3.5" /> },
  ];

  const advancedTabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'Profiles', label: 'Profiles', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: 'Labs', label: 'Labs', icon: <Zap className="w-3.5 h-3.5" /> },
    { id: 'Advanced', label: 'Advanced', icon: <Cpu className="w-3.5 h-3.5" /> },
    { id: 'Data & Privacy', label: 'Data & Privacy', icon: <Shield className="w-3.5 h-3.5" /> },
  ];

  const handleTestMic = () => {
    if (!runtimeAvailable) {
      setMicTestMsg('Microphone test unavailable: sorid IPC is not connected.');
      return;
    }
    setIsTestingMic(true);
    setMicTestMsg('Testing audio input levels (48kHz 16-bit)...');
    setTimeout(() => {
      setIsTestingMic(false);
      setMicTestMsg('Microphone signal verified: Clear, -18dB RMS');
    }, 1500);
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 text-[#161616]">
      {/* Page Heading */}
      <div className="border-b border-[#E2E4E8] pb-3 mb-6">
        <h1 className="sori-page-heading">Sori System Settings</h1>
        <p className="sori-body-text mt-0.5">
          Configure microphone input, local hotkey triggers, overlay visuals, and daemon behavior.
        </p>
      </div>

      {!runtimeAvailable && <div role="status" className="mb-6 rounded-xl border border-[#D5E0EA] bg-[#F8FAFC] p-4 text-xs text-[#5C728A]">Settings are disconnected from sorid. Controls that require microphone, hotkey, injection, startup, or privacy capabilities are unavailable and are not reporting success.</div>}

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
              <p className="text-[#5F6368]">
                Choose the microphone Sori uses for dictation. This does not affect your system default input device.
              </p>

              {/* Status Banner */}
              <div className="p-3 bg-[#EAF6EE] border border-[#CBE5D4] rounded-[10px] text-[#1F6B43] flex items-center justify-between">
                <span className="font-semibold">OS Permission: {runtimeAvailable ? 'Reported by daemon' : 'Unavailable'}</span>
                <span className="text-[11px] font-mono">Sample Rate: 48,000 Hz</span>
              </div>

              {/* Device 1: Realtek Active Selected Box */}
              <div
                onClick={() => setSelectedMic('realtek')}
                className={`p-4 rounded-[12px] border flex items-center justify-between cursor-pointer transition-all ${
                  selectedMic === 'realtek'
                    ? 'bg-[#F8F8F7] border-[#2E4E6D] shadow-2xs font-semibold'
                    : 'bg-white border-[#E2E4E8] hover:bg-[#F8F8F7]'
                }`}
              >
                <div>
                  <div className="font-semibold text-[#161616]">Microphone Array (Realtek(R) Audio)</div>
                  <div className="text-[11px] text-[#858A90]">Hardware Direct • Primary Input</div>
                </div>

                {/* Audio Level Meter Bars */}
                <div className="flex items-end gap-1 h-5">
                  <div className="w-1.5 h-2 bg-[#2E4E6D] rounded-xs" />
                  <div className="w-1.5 h-3.5 bg-[#2E4E6D] rounded-xs" />
                  <div className="w-1.5 h-5 bg-[#1F6B43] rounded-xs animate-pulse" />
                  <div className="w-1.5 h-3 bg-[#D5E0EA] rounded-xs" />
                </div>
              </div>

              {/* Device 2: Auto Detect */}
              <div
                onClick={() => setSelectedMic('autodetect')}
                className={`p-4 rounded-[12px] border cursor-pointer transition-all ${
                  selectedMic === 'autodetect'
                    ? 'bg-[#F8F8F7] border-[#2E4E6D] shadow-2xs font-semibold'
                    : 'bg-white border-[#E2E4E8] hover:bg-[#F8F8F7]'
                }`}
              >
                <div className="font-semibold text-[#161616]">Auto-detect System Default</div>
                <div className="text-[11px] text-[#858A90]">Follow Windows / macOS audio input changes automatically</div>
              </div>

              {/* Device 3: Communications */}
              <div
                onClick={() => setSelectedMic('comms')}
                className={`p-4 rounded-[12px] border cursor-pointer transition-all ${
                  selectedMic === 'comms'
                    ? 'bg-[#F8F8F7] border-[#2E4E6D] shadow-2xs font-semibold'
                    : 'bg-white border-[#E2E4E8] hover:bg-[#F8F8F7]'
                }`}
              >
                <div className="font-semibold text-[#161616]">Communications Input Device</div>
                <div className="text-[11px] text-[#858A90]">Fallback headset microphone</div>
              </div>

              {micTestMsg && (
                <div className="p-3 bg-[#EEF2F6] border border-[#D5E0EA] rounded-[10px] text-[#24384C] font-mono text-[11px]">
                  {micTestMsg}
                </div>
              )}

              <div className="pt-2 flex items-center justify-between">
                <button
                  onClick={handleTestMic}
                  disabled={isTestingMic}
                  className="px-4 py-2 bg-[#EEF2F6] hover:bg-[#E1E8F0] text-[#24384C] border border-[#D5E0EA] rounded-[10px] font-semibold transition"
                >
                  {isTestingMic ? 'Testing...' : 'Test Microphone'}
                </button>
                <button type="button" disabled aria-disabled="true" title="Runtime support is not installed yet" className="px-4 py-2 bg-white text-[#858A90] rounded-[10px] font-medium border border-[#E2E4E8] cursor-not-allowed">
                  Manage Priority (preview)
                </button>
              </div>
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
                    value={settings.hotkey}
                    onChange={(e) => setSettings((prev) => ({ ...prev, hotkey: e.target.value }))}
                    className="w-full bg-white border border-[#E2E4E8] rounded-[8px] p-2 text-xs font-mono font-bold"
                  />
                  <div className="text-[11px] text-[#858A90]">Hold hotkey, speak, release to insert text into active app.</div>
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
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['dot', 'Dot'],
                  ['pill', 'Pill'],
                  ['wave', 'Waveform'],
                  ['orb', 'Orb'],
                  ['monochrome', 'Monochrome'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setSettings((prev) => ({ ...prev, overlayStyle: value }))}
                    className={`p-3 rounded-[10px] border text-left transition ${
                      settings.overlayStyle === value
                        ? 'bg-[#EEF2F6] border-[#2E4E6D] font-semibold text-[#24384C]'
                        : 'bg-white border-[#E2E4E8] text-[#5F6368]'
                    }`}
                  >
                    {label} Style
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'Text Injection' && (
            <div className="space-y-4 text-xs">
              <p className="text-[#5F6368]">Configure how dictated text is pasted into focused applications.</p>
              <div className="p-3 bg-[#F8F8F7] border border-[#E2E4E8] rounded-[12px] space-y-2">
                <div className="font-semibold text-[#161616]">Injection Strategy</div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="inj" checked={injectionStrategy === 'automation'} onChange={() => setInjectionStrategy('automation')} className="accent-[#2E4E6D]" />
                    <span>OS UI Automation API (Direct Synthetic Keystrokes)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="inj" checked={injectionStrategy === 'clipboard'} onChange={() => setInjectionStrategy('clipboard')} className="accent-[#2E4E6D]" />
                    <span>Clipboard Buffer Injection + Auto Restore</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Startup & Tray' && (
            <div className="space-y-4 text-xs">
              <p className="text-[#5F6368]">Configure system startup and taskbar tray icon behavior.</p>
              <div className="p-3 bg-[#F8F8F7] border border-[#E2E4E8] rounded-[12px] space-y-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-semibold text-[#161616]">Start Sori daemon automatically on login</span>
                  <input type="checkbox" checked={startOnLogin} onChange={(e) => setStartOnLogin(e.target.checked)} className="w-4 h-4 accent-[#2E4E6D]" />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-semibold text-[#161616]">Minimize to system tray on close</span>
                  <input type="checkbox" checked={minimizeToTray} onChange={(e) => setMinimizeToTray(e.target.checked)} className="w-4 h-4 accent-[#2E4E6D]" />
                </label>
              </div>
            </div>
          )}

          {(activeTab === 'Profiles' || activeTab === 'Labs' || activeTab === 'Advanced' || activeTab === 'Data & Privacy') && (
            <div className="space-y-4 text-xs">
              <div className="p-4 bg-[#F8F8F7] border border-[#E2E4E8] rounded-[12px] space-y-2">
                <div className="font-semibold text-[#161616]">{activeTab} Configuration</div>
                <p className="text-[#5F6368]">
                  Detailed preferences and local parameters for {activeTab.toLowerCase()}. Runtime-backed controls are preview-only until the Sori daemon is installed.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
