import React, { useState, useEffect, useCallback } from 'react';
import {
  ActiveScreen,
  AppSettings,
  ModelInfo,
  RouteRule,
  DictionaryTerm,
  Snippet,
  ExtensionItem,
  HistoryItem,
  BenchmarkResult,
  VoiceProfile,
  AssistantVoiceSettings,
} from './types';
import {
  initialModels,
  initialRoutes,
  initialDictionary,
  initialSnippets,
  initialExtensions,
  initialHistory,
  initialBenchmarkResults,
  defaultSettings,
  defaultVoiceProfile,
  defaultAssistantVoice,
} from './data/initialData';

import { DesktopTitleBar } from './components/DesktopTitleBar';
import { DesktopSidebar } from './components/DesktopSidebar';
import { OverlaySimulator } from './components/OverlaySimulator';
import { TrayQuickControls } from './components/TrayQuickControls';
import { DeviceFrame } from './components/DeviceFrame';

import { OverviewScreen } from './components/screens/OverviewScreen';
import { TranscriptsScreen } from './components/screens/TranscriptsScreen';
import { FirstRunOnboardingScreen } from './components/screens/FirstRunOnboardingScreen';
import { VoiceEditScreen } from './components/screens/VoiceEditScreen';
import { ModelManagerScreen } from './components/screens/ModelManagerScreen';
import { BenchmarkScreen } from './components/screens/BenchmarkScreen';
import { StudioSettingsScreen } from './components/screens/StudioSettingsScreen';
import { DictionarySnippetsScreen } from './components/screens/DictionarySnippetsScreen';
import { ExtensionsSandboxScreen } from './components/screens/ExtensionsSandboxScreen';
import { VoiceIdentityScreen } from './components/screens/VoiceIdentityScreen';
import { AssistantVoiceScreen } from './components/screens/AssistantVoiceScreen';
import { CoverageChecklistScreen } from './components/screens/CoverageChecklistScreen';
import { SystemDesignScreen } from './components/screens/SystemDesignScreen';
import { RuntimeClient, type DaemonStatus, type DoctorCheck, type RuntimeSource } from './runtime-client';
import { readPreference, readSettings, writePreference } from './preferences';

export default function App() {
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('home');
  const [settings, setSettings] = useState<AppSettings>(() => readSettings(defaultSettings));
  const [models, setModels] = useState<ModelInfo[]>(initialModels);
  const [routes, setRoutes] = useState<RouteRule[]>(initialRoutes);
  const [dictionary, setDictionary] = useState<DictionaryTerm[]>(initialDictionary);
  const [snippets, setSnippets] = useState<Snippet[]>(initialSnippets);
  const [extensions, setExtensions] = useState<ExtensionItem[]>(() => readPreference('extensions', initialExtensions));
  const [history, setHistory] = useState<HistoryItem[]>(initialHistory);
  const [benchmarkResults] = useState<BenchmarkResult[]>(initialBenchmarkResults);
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile>(defaultVoiceProfile);
  const [assistantVoice, setAssistantVoice] = useState<AssistantVoiceSettings>(defaultAssistantVoice);

  const [deviceView, setDeviceView] = useState<'desktop' | 'tablet' | 'mobile'>(() => readPreference('deviceView', 'desktop'));
  const [isListening, setIsListening] = useState<boolean>(false);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [trayOpen, setTrayOpen] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [runtimeStatus, setRuntimeStatus] = useState<DaemonStatus>({ daemon: 'unavailable', activity: 'error', paused: false, hotkey: 'Alt+Space', route: { prefer_local: true, allow_cloud: true, prefer_warm_runtime: false, optimize_battery: false }, profile: 'Basic', privacy: 'LocalOnly', version: null });
  const [runtimeSource, setRuntimeSource] = useState<RuntimeSource>('unavailable');
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [doctorChecks, setDoctorChecks] = useState<DoctorCheck[]>([]);
  const [runtimeClient] = useState(() => new RuntimeClient());

  const refreshRuntime = useCallback(async () => {
    const [statusResult, doctorResult] = await Promise.all([runtimeClient.status(), runtimeClient.doctor()]);
    setRuntimeStatus(statusResult.data);
    setRuntimeSource(statusResult.source);
    setRuntimeError(statusResult.error ?? doctorResult.error);
    setDoctorChecks(doctorResult.data);
  }, [runtimeClient]);

  useEffect(() => {
    refreshRuntime().catch(() => undefined);
  }, [refreshRuntime]);

  useEffect(() => {
    writePreference('settings', settings);
  }, [settings]);

  useEffect(() => {
    writePreference('extensions', extensions);
  }, [extensions]);

  useEffect(() => {
    writePreference('deviceView', deviceView);
  }, [deviceView]);

  const setPaused = async (paused: boolean) => {
    const result = await (paused ? runtimeClient.pause() : runtimeClient.resume());
    setRuntimeStatus(result.data);
    setRuntimeSource(result.source);
    setRuntimeError(result.error);
  };

  // Active warm model
  const activeWarmModel = models.find((m) => m.isWarm && m.isInstalled) || models[0];

  // Speech Recognition setup (Web Speech API with graceful fallback)
  useEffect(() => {
    let recognition: any = null;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (isListening && SpeechRecognition) {
      try {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = settings.activeProfile === 'Vietnamese' ? 'vi-VN' : 'en-US';

        recognition.onresult = (event: any) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              const text = event.results[i][0].transcript;
              setHistory((prev) => [
                {
                  id: `hist-${Date.now()}`,
                  timestamp: 'Just now',
                  rawTranscript: text,
                  processedText: text,
                  activeApp: 'VS Code',
                  mode: 'dictation',
                  latencyMs: activeWarmModel.latencyMs,
                  modelUsed: activeWarmModel.name,
                },
                ...prev,
              ]);
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          setInterimTranscript(interim);
        };

        recognition.onerror = (err: any) => {
          console.warn('Speech recognition notice:', err);
        };

        recognition.start();
      } catch (e) {
        console.warn('Speech recognition init fallback:', e);
      }
    }

    return () => {
      if (recognition) {
        try {
          recognition.stop();
        } catch (_) {}
      }
    };
  }, [isListening, settings.activeProfile, activeWarmModel]);

  // Toggle speech simulation/listening
  const toggleListening = () => {
    if (!isListening) {
      setIsListening(true);
      setInterimTranscript('Listening for speech audio...');
      setTimeout(() => {
        setInterimTranscript('Short, friendly email to my team asking if we can review the new PR today.');
      }, 1000);
    } else {
      setIsListening(false);
      setInterimTranscript('');
    }
  };

  const handleApplyRecommendedPolicy = () => {
    setRoutes((prev) => [
      {
        id: `rule-auto-${Date.now()}`,
        condition: 'benchmark_latency <= 65ms && language == "en"',
        targetModel: 'parakeet-v2',
        enabled: true,
        priority: 1,
      },
      ...prev,
    ]);
  };

  return (
    <DeviceFrame deviceView={deviceView}>
      <div className="h-screen bg-[#FAF8F5] text-[#1C1B1A] flex flex-col font-sans select-none overflow-hidden antialiased">
        {/* Top Window Titlebar (Chrome Window Header) */}
        <DesktopTitleBar
          settings={settings}
          setSettings={setSettings}
          isListening={isListening}
          toggleListening={toggleListening}
          trayOpen={trayOpen}
          setTrayOpen={setTrayOpen}
          deviceView={deviceView}
          setDeviceView={setDeviceView}
          activeModelName={activeWarmModel.name}
          runtimeSource={runtimeSource}
          runtimeStatus={runtimeStatus}
          runtimeError={runtimeError}
          onTogglePaused={() => setPaused(!runtimeStatus.paused)}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
        />

        {/* Main Application Window Shell */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Left Navigation Sidebar */}
          <DesktopSidebar
            activeScreen={activeScreen}
            setActiveScreen={setActiveScreen}
            settings={settings}
            setSettings={setSettings}
            openSettingsModal={() => setIsSettingsModalOpen(true)}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />

          {sidebarOpen && (
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setSidebarOpen(false)}
              className="md:hidden fixed inset-0 z-30 bg-[#1C1B1A]/20"
            />
          )}

          {/* Tray Quick Controls Popover */}
          <TrayQuickControls
            isOpen={trayOpen}
            onClose={() => setTrayOpen(false)}
            settings={settings}
            setSettings={setSettings}
            activeModelName={activeWarmModel.name}
            runtimeSource={runtimeSource}
            runtimeStatus={runtimeStatus}
            onTogglePaused={() => setPaused(!runtimeStatus.paused)}
            onNavigate={(sc) => {
              setActiveScreen(sc);
              setTrayOpen(false);
            }}
          />

          {/* Floating Overlay Simulator */}
          <OverlaySimulator
            overlayStyle={settings.overlayStyle}
            isListening={isListening}
            transcript=""
            interimTranscript={interimTranscript}
            activeApp={activeScreen === 'voice-edit' ? 'VS Code Selection' : 'VS Code (src/router.rs)'}
            activeModel={activeWarmModel.name}
            errorMessage={errorMessage}
            onCloseError={() => setErrorMessage(null)}
            onStyleChange={(st) => setSettings((prev) => ({ ...prev, overlayStyle: st }))}
          />

          {/* Main Content View Container */}
          <main id="sori-main-content" role="main" aria-label="Sori desktop workspace" className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#FAF8F5] p-3 sm:p-4 md:p-6 custom-scrollbar">
            {(activeScreen === 'playground' || activeScreen === 'home') && (
              <OverviewScreen
                settings={settings}
                isListening={isListening}
                toggleListening={toggleListening}
                onNavigate={setActiveScreen}
                history={history}
                activeModelName={activeWarmModel.name}
              />
            )}

            {activeScreen === 'transcripts' && (
              <TranscriptsScreen history={history} setHistory={setHistory} />
            )}

            {activeScreen === 'onboarding' && (
              <FirstRunOnboardingScreen settings={settings} onComplete={() => setActiveScreen('home')} />
            )}

            {activeScreen === 'voice-edit' && <VoiceEditScreen settings={settings} />}

            {activeScreen === 'models' && (
              <ModelManagerScreen
                models={models}
                setModels={setModels}
                routes={routes}
                setRoutes={setRoutes}
              />
            )}

            {(activeScreen === 'benchmark' || activeScreen === 'benchmarks') && (
              <BenchmarkScreen
                benchmarkResults={benchmarkResults}
                onApplyPolicy={handleApplyRecommendedPolicy}
              />
            )}

            {(activeScreen === 'studio' || activeScreen === 'settings') && (
              <StudioSettingsScreen settings={settings} setSettings={setSettings} />
            )}

            {(activeScreen === 'dictionary' || activeScreen === 'snippets' || activeScreen === 'vocabulary') && (
              <DictionarySnippetsScreen
                dictionary={dictionary}
                setDictionary={setDictionary}
                snippets={snippets}
                setSnippets={setSnippets}
              />
            )}

            {activeScreen === 'extensions' && (
              <ExtensionsSandboxScreen extensions={extensions} setExtensions={setExtensions} />
            )}

            {(activeScreen === 'voice-id' || activeScreen === 'privacy') && (
              <VoiceIdentityScreen
                voiceProfile={voiceProfile}
                setVoiceProfile={setVoiceProfile}
                history={history}
                setHistory={setHistory}
              />
            )}

            {activeScreen === 'assistant-voice' && (
              <AssistantVoiceScreen
                assistantVoice={assistantVoice}
                setAssistantVoice={setAssistantVoice}
              />
            )}

            {activeScreen === 'system-design' && <SystemDesignScreen />}

            {(activeScreen === 'coverage' || activeScreen === 'diagnostics') && (
              <CoverageChecklistScreen
                checks={doctorChecks}
                runtimeSource={runtimeSource}
                runtimeStatus={runtimeStatus}
                runtimeError={runtimeError}
                onRefresh={refreshRuntime}
              />
            )}
          </main>
        </div>

        {/* Studio Settings Modal overlay if invoked */}
        {isSettingsModalOpen && (
          <div className="fixed inset-0 z-50 bg-[#1C1B1A]/20 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-3xl relative animate-in fade-in zoom-in-95 duration-200">
              <StudioSettingsScreen settings={settings} setSettings={setSettings} />
              <button
                type="button"
                aria-label="Close settings"
                onClick={() => setIsSettingsModalOpen(false)}
                className="absolute top-4 right-4 text-[#94928E] hover:text-[#1C1B1A] p-1"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>
    </DeviceFrame>
  );
}
