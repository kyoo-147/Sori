import React, { useState } from 'react';
import { Mic, CheckCircle2, ShieldCheck, Keyboard, Sparkles, ArrowRight, Play, RefreshCw, Volume2 } from 'lucide-react';
import { AppSettings } from '../../types';

interface FirstRunOnboardingScreenProps {
  settings: AppSettings;
  onComplete: () => void;
}

export const FirstRunOnboardingScreen: React.FC<FirstRunOnboardingScreenProps> = ({
  settings,
  onComplete,
}) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [selectedMic, setSelectedMic] = useState<string>('Default System Microphone (Realtek High Definition)');
  const [micTested, setMicTested] = useState<boolean>(false);
  const [micLevel, setMicLevel] = useState<number>(65);
  const [injectionGranted, setInjectionGranted] = useState<boolean>(true);
  const [hotkeyTested, setHotkeyTested] = useState<boolean>(false);
  const [isTestDictating, setIsTestDictating] = useState<boolean>(false);
  const [testText, setTestText] = useState<string>('');

  const handleTestMic = () => {
    setMicTested(true);
    setMicLevel(85);
    setTimeout(() => setMicLevel(40), 600);
    setTimeout(() => setMicLevel(75), 1200);
  };

  const handleSimulateHotkey = () => {
    setIsTestDictating(true);
    setTestText('Testing Sori local voice injection...');
    setTimeout(() => {
      setTestText('Sori successfully injected text into target window!');
      setIsTestDictating(false);
      setHotkeyTested(true);
    }, 1200);
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6 text-[#161616]">
      {/* Onboarding Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EEF2F6] text-[#24384C] border border-[#D5E0EA] text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5 text-[#5C728A]" />
          <span>Sori First-Run Setup (60s)</span>
        </div>
        <h1 className="sori-page-heading text-center">Get ready to speak into any window</h1>
        <p className="sori-body-text max-w-lg mx-auto">
          Sori runs as a quiet background voice daemon (`sorid`). Configure your microphone and text injection permissions in 4 simple steps.
        </p>
      </div>

      {/* Progress Steps Indicator */}
      <div className="flex items-center justify-between max-w-md mx-auto pt-2">
        {[
          { num: 1, label: 'Welcome' },
          { num: 2, label: 'Microphone' },
          { num: 3, label: 'Permissions' },
          { num: 4, label: 'Hotkey' },
          { num: 5, label: 'Ready' },
        ].map((s) => (
          <div key={s.num} className="flex flex-col items-center gap-1">
            <button
              onClick={() => setCurrentStep(s.num)}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                currentStep === s.num
                  ? 'bg-[#2E4E6D] text-white shadow-2xs'
                  : currentStep > s.num
                  ? 'bg-[#EAF6EE] text-[#1F6B43] border border-[#CBE5D4]'
                  : 'bg-[#F0F1F2] text-[#858A90] border border-[#E2E4E8]'
              }`}
            >
              {currentStep > s.num ? <CheckCircle2 className="w-4 h-4" /> : s.num}
            </button>
            <span className="text-[11px] font-medium text-[#5F6368]">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Step Content Panels */}
      <div className="bg-white border border-[#E2E4E8] rounded-[20px] p-6 shadow-2xs space-y-6 transition-all">
        {/* Step 1: Welcome */}
        {currentStep === 1 && (
          <div className="space-y-5 text-center py-4">
            <div className="w-14 h-14 rounded-2xl bg-[#EEF2F6] border border-[#D5E0EA] mx-auto flex items-center justify-center text-[#24384C]">
              <Volume2 className="w-7 h-7 text-[#667A90]" />
            </div>
            <div className="space-y-2 max-w-md mx-auto">
              <h2 className="sori-section-heading">Local-First Voice Dictation Setup</h2>
              <p className="sori-body-text text-xs">
                Sori runs as a background daemon (`sorid`). Hold hotkey, dictate in natural language, and Sori injects formatted text directly into your cursor location.
              </p>
            </div>
            <button
              onClick={() => setCurrentStep(2)}
              className="px-6 py-2.5 sori-tactile-btn rounded-[12px] text-xs font-semibold inline-flex items-center gap-2"
            >
              <span>Begin Setup (Microphone)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step 2: Microphone Choice */}
        {currentStep === 2 && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-[#E2E4E8]">
              <div className="p-2.5 rounded-[12px] bg-[#EEF2F6] text-[#24384C] border border-[#D5E0EA]">
                <Mic className="w-5 h-5 text-[#5C728A]" />
              </div>
              <div>
                <h2 className="sori-section-heading">Select Input Microphone</h2>
                <p className="sori-body-text">Choose your active audio capture device and test level meter.</p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-[#161616]">Available Audio Devices:</label>
              <select
                value={selectedMic}
                onChange={(e) => setSelectedMic(e.target.value)}
                className="w-full bg-[#F8F8F7] border border-[#E2E4E8] rounded-[12px] p-3 text-xs text-[#161616] focus:outline-none focus:bg-white focus:border-[#BAC7D8]"
              >
                <option value="Default System Microphone (Realtek High Definition)">Default System Microphone (Realtek High Definition)</option>
                <option value="MacBook Pro Microphone (Built-in)">MacBook Pro Microphone (Built-in)</option>
                <option value="External USB Condenser Microphone">External USB Condenser Microphone</option>
              </select>

              {/* Audio Level Meter Simulation */}
              <div className="p-4 bg-[#F8F8F7] border border-[#E2E4E8] rounded-[12px] space-y-2">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-[#5F6368]">Audio Input Gain Level:</span>
                  <span className="font-mono text-[#1F6B43]">{micLevel}%</span>
                </div>
                <div className="w-full bg-[#E2E4E8] h-3 rounded-full overflow-hidden flex items-center p-0.5">
                  <div
                    className="bg-[#1F6B43] h-full rounded-full transition-all duration-300"
                    style={{ width: `${micLevel}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={handleTestMic}
                className="px-4 py-2 bg-white hover:bg-[#F0F1F2] text-[#2B2F33] border border-[#E2E4E8] rounded-[10px] text-xs font-medium transition flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#5C728A]" />
                Test Mic Level
              </button>
              <button
                onClick={() => setCurrentStep(3)}
                className="px-6 py-2.5 bg-[#EEF2F6] hover:bg-[#E1E8F0] text-[#24384C] border border-[#D5E0EA] rounded-[12px] text-xs font-semibold transition shadow-2xs inline-flex items-center gap-2"
              >
                <span>Grant Permissions</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Text Injection Permission */}
        {currentStep === 3 && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-[#E2E4E8]">
              <div className="p-2.5 rounded-[12px] bg-[#EEF2F6] text-[#24384C] border border-[#D5E0EA]">
                <ShieldCheck className="w-5 h-5 text-[#5C728A]" />
              </div>
              <div>
                <h2 className="sori-section-heading">System Input & Text Injection</h2>
                <p className="sori-body-text">Sori requires OS input permissions to type transcribed text directly into focused windows.</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="p-4 bg-[#F8F8F7] border border-[#E2E4E8] rounded-[12px] flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-[#161616]">Accessibility / Input Emulation Permission</div>
                  <div className="text-[11px] text-[#858A90]">Allows `sorid` daemon to send simulated keypress events</div>
                </div>
                <button
                  onClick={() => setInjectionGranted(!injectionGranted)}
                  className={`px-3 py-1.5 rounded-[8px] text-xs font-semibold border ${
                    injectionGranted
                      ? 'bg-[#EAF6EE] text-[#1F6B43] border-[#CBE5D4]'
                      : 'bg-[#FDF2F2] text-[#A33A3A] border-[#F8D2D2]'
                  }`}
                >
                  {injectionGranted ? 'Granted ✓' : 'Grant Permission'}
                </button>
              </div>

              <div className="p-4 bg-[#F8F8F7] border border-[#E2E4E8] rounded-[12px] flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-[#161616]">Microphone OS Permission</div>
                  <div className="text-[11px] text-[#858A90]">Allows local voice capture from selected mic</div>
                </div>
                <span className="text-xs font-semibold text-[#1F6B43] bg-[#EAF6EE] px-3 py-1 rounded-[8px] border border-[#CBE5D4]">
                  Active ✓
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setCurrentStep(2)}
                className="px-4 py-2 bg-white hover:bg-[#F0F1F2] text-[#2B2F33] border border-[#E2E4E8] rounded-[10px] text-xs font-medium transition"
              >
                Back
              </button>
              <button
                onClick={() => setCurrentStep(4)}
                className="px-6 py-2.5 bg-[#EEF2F6] hover:bg-[#E1E8F0] text-[#24384C] border border-[#D5E0EA] rounded-[12px] text-xs font-semibold transition shadow-2xs inline-flex items-center gap-2"
              >
                <span>Test Hotkey</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Try Hotkey */}
        {currentStep === 4 && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-[#E2E4E8]">
              <div className="p-2.5 rounded-[12px] bg-[#EEF2F6] text-[#24384C] border border-[#D5E0EA]">
                <Keyboard className="w-5 h-5 text-[#5C728A]" />
              </div>
              <div>
                <h2 className="sori-section-heading">Test Dictation Hotkey</h2>
                <p className="sori-body-text">Hold <kbd className="px-2 py-0.5 bg-[#EEF2F6] border border-[#D5E0EA] rounded text-xs font-mono font-semibold">{settings.hotkey}</kbd> to dictate into the test field below.</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="p-4 bg-[#F8F8F7] border border-[#E2E4E8] rounded-[12px] space-y-2">
                <div className="flex items-center justify-between text-xs text-[#858A90]">
                  <span>Target Window Simulation</span>
                  <span className="text-[#1F6B43] font-medium">Focused App Ready</span>
                </div>
                <textarea
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  rows={3}
                  className="w-full bg-white border border-[#E2E4E8] rounded-[10px] p-3 font-mono text-xs text-[#161616] focus:outline-none"
                  placeholder="Click Simulate Hotkey below or hold Alt+Space to dictate..."
                />
              </div>

              <div className="flex items-center justify-center">
                <button
                  onClick={handleSimulateHotkey}
                  className={`px-5 py-2.5 rounded-[12px] text-xs font-semibold shadow-2xs flex items-center gap-2 transition border ${
                    isTestDictating
                      ? 'bg-[#A33A3A] text-white border-[#A33A3A] animate-pulse'
                      : 'bg-[#EEF2F6] hover:bg-[#E1E8F0] text-[#24384C] border-[#D5E0EA]'
                  }`}
                >
                  <Play className="w-4 h-4 text-[#5C728A]" />
                  <span>{isTestDictating ? 'Listening...' : `Simulate Holding ${settings.hotkey}`}</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setCurrentStep(3)}
                className="px-4 py-2 bg-white hover:bg-[#F0F1F2] text-[#2B2F33] border border-[#E2E4E8] rounded-[10px] text-xs font-medium transition"
              >
                Back
              </button>
              <button
                onClick={() => setCurrentStep(5)}
                className="px-6 py-2.5 bg-[#EEF2F6] hover:bg-[#E1E8F0] text-[#24384C] border border-[#D5E0EA] rounded-[12px] text-xs font-semibold transition shadow-2xs inline-flex items-center gap-2"
              >
                <span>Finish Setup</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Ready */}
        {currentStep === 5 && (
          <div className="space-y-5 text-center py-4">
            <div className="w-16 h-16 rounded-full bg-[#EAF6EE] border border-[#CBE5D4] mx-auto flex items-center justify-center text-[#1F6B43]">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="sori-section-heading">Sori is ready in background!</h2>
              <p className="sori-body-text max-w-md mx-auto">
                Background benchmark is currently tuning local Whisper Q5 routes for optimal speed on your hardware.
              </p>
            </div>

            <div className="p-4 bg-[#F8F8F7] border border-[#E2E4E8] rounded-[14px] text-left max-w-md mx-auto space-y-2">
              <div className="text-xs font-semibold text-[#161616] flex items-center justify-between">
                <span>Active Routing Policy:</span>
                <span className="text-[#1F6B43] font-mono">Local Baseline</span>
              </div>
              <div className="text-[12px] text-[#5F6368] leading-relaxed">
                Primary ASR: <span className="font-semibold text-[#161616]">Whisper.cpp (Q5_0)</span> • Target Latency: <span className="font-semibold text-[#1F6B43]">62ms</span>
              </div>
            </div>

            <button
              onClick={onComplete}
              className="px-8 py-3 bg-[#EEF2F6] hover:bg-[#E1E8F0] text-[#24384C] border border-[#D5E0EA] rounded-[12px] text-xs font-semibold transition shadow-2xs inline-flex items-center gap-2"
            >
              <span>Go to Home Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
