import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ActiveScreen,
  AppSettings,
  ModelRecord,
  RouteRule,
  DictionaryTerm,
  Snippet,
  HistoryItem,
  BenchmarkResult,
  VoiceProfile,
  AssistantVoiceSettings,
} from './types';
import {
  initialRoutes,
  initialSnippets,
  initialBenchmarkResults,
  defaultSettings,
  defaultVoiceProfile,
  defaultAssistantVoice,
} from './data/initialData';

import { DesktopTitleBar } from './components/DesktopTitleBar';
import { DesktopSidebar } from './components/DesktopSidebar';
import { OverlaySimulator } from './components/OverlaySimulator';
import { TrayQuickControls } from './components/TrayQuickControls';

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
export const applySidebarLiveWidth = (shell: Pick<HTMLElement, 'style'>, width: number) => {
  shell.style.setProperty('--sori-sidebar-width-live', `${width}px`);
};
import { RuntimeClient, type DaemonStatus, type DoctorCheck, type RuntimeSource } from './runtime-client';
import type { BenchmarkFixture } from './benchmark-fixture';
import { readSettings, writePreference } from './preferences';

export default function App() {
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('home');
  const [settings, setSettings] = useState<AppSettings>(() => readSettings(defaultSettings));
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [routes, setRoutes] = useState<RouteRule[]>(initialRoutes);
  const [dictionary, setDictionary] = useState<DictionaryTerm[]>([]);
  const [snippets, setSnippets] = useState<Snippet[]>(initialSnippets);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [benchmarkResults, setBenchmarkResults] = useState<BenchmarkResult[]>([]);
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile>(defaultVoiceProfile);
  const [assistantVoice, setAssistantVoice] = useState<AssistantVoiceSettings>(defaultAssistantVoice);

  const [isListening, setIsListening] = useState<boolean>(false);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [trayOpen, setTrayOpen] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => window.localStorage.getItem('sori.sidebar.collapsed') === 'true');
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => Number(window.localStorage.getItem('sori.sidebar.width')) || 248);
  const resizeFrame = useRef<number | null>(null);
  const resizeWidth = useRef(248);
  const shellRef = useRef<HTMLDivElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [runtimeStatus, setRuntimeStatus] = useState<DaemonStatus>({ daemon: 'unavailable', activity: 'error', paused: false, hotkey: 'Alt+Space', route: { prefer_local: true, allow_cloud: true, prefer_warm_runtime: false, optimize_battery: false }, profile: 'Basic', privacy: 'LocalOnly', version: null });
  const [runtimeSource, setRuntimeSource] = useState<RuntimeSource>('unavailable');
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [doctorChecks, setDoctorChecks] = useState<DoctorCheck[]>([]);
  const [runtimeClient] = useState(() => new RuntimeClient());

  const refreshHistory = useCallback(async () => {
    const result = await runtimeClient.history(50);
    if (result.error !== null) return false;
    setHistory(result.data.map((entry) => ({
      id: entry.id,
      timestamp: entry.at,
      rawTranscript: entry.transcript.text,
      processedText: entry.transcript.text,
      activeApp: entry.active_app ?? 'Unknown target',
      mode: 'dictation' as const,
      latencyMs: 0,
      modelUsed: typeof entry.route === 'object' && entry.route && 'model' in entry.route ? String((entry.route as { model?: unknown }).model) : 'Unknown model',
    })));
    return true;
  }, [runtimeClient]);

  const refreshRuntime = useCallback(async () => {
    const [statusResult, doctorResult, historyResult, modelsResult, routeResult] = await Promise.all([runtimeClient.status(), runtimeClient.doctor(), runtimeClient.history(50), runtimeClient.models(), runtimeClient.route<{ activeModelId: string | null }>()]);
    setRuntimeStatus(statusResult.data);
    setRuntimeSource(statusResult.source);
    setRuntimeError(statusResult.error ?? doctorResult.error ?? historyResult.error);
    setDoctorChecks(doctorResult.data);
    if (!modelsResult.error && Array.isArray(modelsResult.data)) setModels(modelsResult.data);
    if (!routeResult.error && routeResult.data && typeof routeResult.data.activeModelId === 'string') setActiveModelId(routeResult.data.activeModelId);
    else if (!routeResult.error) setActiveModelId(null);
    if (historyResult.error === null) {
      setHistory(historyResult.data.map((entry) => ({
        id: entry.id,
        timestamp: entry.at,
        rawTranscript: entry.transcript.text,
        processedText: entry.transcript.text,
        activeApp: entry.active_app ?? 'Unknown target',
        mode: 'dictation' as const,
        latencyMs: 0,
        modelUsed: typeof entry.route === 'object' && entry.route && 'model' in entry.route ? String((entry.route as { model?: unknown }).model) : 'Unknown model',
      })));
    }
  }, [runtimeClient]);

  useEffect(() => {
    refreshRuntime().catch(() => undefined);
  }, [refreshRuntime]);
  const refreshBenchmarks = useCallback(async () => {
    const result = await runtimeClient.recentBenchmarks(20);
    if (result.error || !result.data || !Array.isArray(result.data.runs)) return result.error;
    const recommendation = result.data.recommendation;
    setBenchmarkResults(result.data.runs.map((item) => { const value = item as { run_id?: string; started_at?: string; completed_at?: string; model?: string; provider?: string; samples?: number; attempts?: number; startup?: { cold_ms?: number; warm_ms?: number }; latency?: { p50_ms?: number; p95_ms?: number }; memory?: { ram_bytes?: number | null; vram_bytes?: number | null }; accuracy?: { wer?: number | null; cer?: number | null }; real_time_factor?: number; reliability?: { failure_rate?: number; fallback_rate?: number | null } }; return { runId: value.run_id ?? 'unknown', startedAt: value.started_at ?? '', completedAt: value.completed_at ?? '', modelId: value.model ?? 'unknown', provider: value.provider ?? 'unknown', modelName: value.model ?? 'Unknown model', samples: value.samples ?? 0, attempts: value.attempts ?? 0, coldStartMs: value.startup?.cold_ms ?? null, warmLatencyMs: value.startup?.warm_ms ?? null, p50Ms: value.latency?.p50_ms ?? null, p95Ms: value.latency?.p95_ms ?? null, ramMb: value.memory?.ram_bytes == null ? null : value.memory.ram_bytes / 1_000_000, vramMb: value.memory?.vram_bytes == null ? null : value.memory.vram_bytes / 1_000_000, werPercent: value.accuracy?.wer == null ? null : value.accuracy.wer * 100, cerPercent: value.accuracy?.cer == null ? null : value.accuracy.cer * 100, rtf: value.real_time_factor ?? null, failureRate: value.reliability?.failure_rate ?? null, fallbackRate: value.reliability?.fallback_rate ?? null, insertionMs: null, passed: (value.attempts ?? 0) > 0 && (value.samples ?? 0) > 0 && (value.reliability?.failure_rate ?? 1) === 0, isRecommended: recommendation?.run_id === value.run_id }; }));
    return null;
  }, [runtimeClient]);

  useEffect(() => { void refreshBenchmarks(); }, [refreshBenchmarks]);

  useEffect(() => {
    writePreference('settings', settings);
  }, [settings]);

  useEffect(() => {
    runtimeClient.resource<Array<{ id: string; term: string; pronunciationHint?: string | null; category?: string }>>('vocabulary').then((result) => {
      if (result.error || !Array.isArray(result.data)) return;
      setDictionary(result.data.map((item) => ({ id: item.id, term: item.term, pronunciation: item.pronunciationHint ?? undefined, category: (item.category === 'library_framework' ? 'code' : item.category ?? 'custom') as DictionaryTerm['category'] })));
    }).catch(() => undefined);
  }, [runtimeClient]);


  useEffect(() => {
    window.localStorage.setItem('sori.sidebar.collapsed', String(sidebarCollapsed));
    window.localStorage.setItem('sori.sidebar.width', String(sidebarWidth));
  }, [sidebarCollapsed, sidebarWidth]);

  const startSidebarResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (sidebarCollapsed) return;
    event.preventDefault();
    const owner = event.currentTarget;
    const pointerId = event.pointerId;
    owner.setPointerCapture(pointerId);
    resizeWidth.current = sidebarWidth;
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    let finished = false;
    const applyLiveWidth = () => {
      if (shellRef.current) applySidebarLiveWidth(shellRef.current, resizeWidth.current);
    };
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId || finished) return;
      const next = Math.max(180, Math.min(360, startWidth + moveEvent.clientX - startX));
      resizeWidth.current = next;
      if (resizeFrame.current === null) {
        resizeFrame.current = window.requestAnimationFrame(() => {
          applyLiveWidth();
          resizeFrame.current = null;
        });
      }
    };
    const stop = (stopEvent?: PointerEvent) => {
      if ((stopEvent && stopEvent.pointerId !== pointerId) || finished) return;
      finished = true;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      owner.removeEventListener('lostpointercapture', stop);
      if (resizeFrame.current !== null) {
        window.cancelAnimationFrame(resizeFrame.current);
        resizeFrame.current = null;
      }
      setSidebarWidth(resizeWidth.current);
      applyLiveWidth();
      if (owner.hasPointerCapture(pointerId)) owner.releasePointerCapture(pointerId);
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    owner.addEventListener('lostpointercapture', stop);
  };

  const setPaused = async (paused: boolean) => {
    const result = await (paused ? runtimeClient.pause() : runtimeClient.resume());
    setRuntimeStatus(result.data);
    setRuntimeSource(result.source);
    setRuntimeError(result.error);
  };

  // The daemon route and model registry are authoritative. A disconnected or
  // stale route must not fall back to preview metadata.
  const activeModel = models.find((model) => model.id === activeModelId && model.available);
  const activeModelName = activeModel?.name ?? 'UNAVAILABLE';

  // Capture and ASR are owned by sorid. The UI never fabricates transcript success.
  const toggleListening = async () => {
    if (!isListening) {
      const result = await runtimeClient.dictationStart();
      setRuntimeSource(result.source);
      setRuntimeError(result.error);
      if (!result.error && result.data.accepted) {
        setIsListening(true);
        setInterimTranscript('Capturing microphone audio…');
      }
      return;
    }

    const result = await runtimeClient.dictationStop();
    setRuntimeSource(result.source);
    setRuntimeError(result.error);
    setIsListening(false);
    setInterimTranscript('');
    if (!result.error && result.data?.text) await refreshRuntime();
  };

  const handleApplyRecommendedPolicy = async () => {
    const result = await runtimeClient.applyBenchmarkRecommendation();
    setRuntimeError(result.error);
    const route = result.data as { activeModelId?: unknown } | null;
    if (!result.error && typeof route?.activeModelId === 'string') setActiveModelId(route.activeModelId);
  };
  const runBenchmark = async (fixture: BenchmarkFixture) => {
    if (!activeModel) return 'Benchmark unavailable: no available active model is configured.';
    const result = await runtimeClient.runBenchmark(activeModel.id, fixture.audio, fixture.reference, 5);
    setRuntimeSource(result.source);
    if (result.error) { setRuntimeError(result.error); return `Benchmark unavailable: ${result.error}`; }
    const refreshError = await refreshBenchmarks();
    if (refreshError) { setRuntimeError(refreshError); return `Benchmark completed, but persisted results could not refresh: ${refreshError}`; }
    return 'Benchmark completed and persisted results refreshed.';
  };

  return (
    <div ref={shellRef} className="sori-shell select-none sori-app-shell h-full min-h-0 text-[#1C1B1A] flex flex-col font-sans overflow-hidden antialiased" data-sori-layout="shell" data-sidebar-collapsed={sidebarCollapsed} style={{ '--sori-sidebar-width': sidebarCollapsed ? '0px' : `${sidebarWidth}px`, '--sori-sidebar-width-live': sidebarCollapsed ? '0px' : `${sidebarWidth}px` } as React.CSSProperties}>
      {/* Top Window Titlebar (Chrome Window Header) */}
      <div className="sori-shell__titlebar">
      <DesktopTitleBar
          settings={settings}
          setSettings={setSettings}
          isListening={isListening}
          toggleListening={toggleListening}
          trayOpen={trayOpen}
          setTrayOpen={setTrayOpen}
          activeModelName={activeModelName}
          runtimeSource={runtimeSource}
          runtimeStatus={runtimeStatus}
          runtimeError={runtimeError}
          onWindowError={setErrorMessage}
          onTogglePaused={() => setPaused(!runtimeStatus.paused)}
          sidebarOpen={sidebarOpen}
          onToggleMobileSidebar={() => setSidebarOpen((open) => !open)}
          onToggleSidebarCollapse={() => setSidebarCollapsed((collapsed) => !collapsed)}
          sidebarCollapsed={sidebarCollapsed}
          onNavigate={(screen) => setActiveScreen(screen)}
      />
      </div>

        {/* Main Application Window Shell */}
      <div className="sori-shell__body flex-1 sori-app-body min-h-0 flex overflow-hidden relative" data-sori-layout="workspace">
          {/* Left Navigation Sidebar */}
          <DesktopSidebar
            activeScreen={activeScreen}
            setActiveScreen={setActiveScreen}
            settings={settings}
            setSettings={setSettings}
            openSettingsModal={() => setIsSettingsModalOpen(true)}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            collapsed={sidebarCollapsed}
          />

          <div className="sori-sidebar-divider" role="separator" aria-orientation="vertical" aria-label="Resize sidebar" onPointerDown={startSidebarResize} />

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
            activeModelName={activeModelName}
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
            activeModel={activeModelName}
            errorMessage={errorMessage}
            onCloseError={() => setErrorMessage(null)}
          />

          {/* Main Content View Container */}
          <main id="sori-main-content" role="main" aria-label="Sori desktop workspace" className="sori-shell__workspace sori-main-content min-w-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6 custom-scrollbar" data-sori-pane="workspace">
            {(activeScreen === 'playground' || activeScreen === 'home') && (
              <OverviewScreen
                settings={settings}
                isListening={isListening}
                toggleListening={toggleListening}
                onNavigate={setActiveScreen}
                history={history}
                activeModelName={activeModelName}
                runtimeSource={runtimeSource}
                runtimeActivity={runtimeStatus.activity}
              />
            )}

            {activeScreen === 'transcripts' && (
              <TranscriptsScreen history={history} setHistory={setHistory} runtimeClient={runtimeClient} onRetry={refreshHistory} />
            )}

            {activeScreen === 'onboarding' && (
              <FirstRunOnboardingScreen
                settings={settings}
                runtimeClient={runtimeClient}
                runtimeStatus={runtimeStatus}
                runtimeSource={runtimeSource}
                doctorChecks={doctorChecks}
                onComplete={() => setActiveScreen('home')}
              />
            )}

            {activeScreen === 'voice-edit' && <VoiceEditScreen settings={settings} runtimeSource={runtimeSource} runtimeClient={runtimeClient} />}

            {activeScreen === 'models' && (
              <ModelManagerScreen
                runtimeClient={runtimeClient}
                onActiveModelChanged={setActiveModelId}
              />
            )}

            {(activeScreen === 'benchmark' || activeScreen === 'benchmarks') && (
              <BenchmarkScreen
                benchmarkResults={benchmarkResults}
                activeModelId={activeModel?.id ?? null}
                onApplyPolicy={handleApplyRecommendedPolicy}
                onRun={runBenchmark}
              />
            )}

            {(activeScreen === 'studio' || activeScreen === 'settings') && (
              <StudioSettingsScreen settings={settings} setSettings={setSettings} runtimeClient={runtimeClient} />
            )}

            {(activeScreen === 'dictionary' || activeScreen === 'snippets' || activeScreen === 'vocabulary') && (
              <DictionarySnippetsScreen
                dictionary={dictionary}
                setDictionary={setDictionary}
                snippets={snippets}
                setSnippets={setSnippets}
                runtimeClient={runtimeClient}
              />
            )}

            {activeScreen === 'extensions' && (
              <ExtensionsSandboxScreen runtimeClient={runtimeClient} />
            )}

            {(activeScreen === 'voice-id' || activeScreen === 'privacy') && (
              <VoiceIdentityScreen
                voiceProfile={voiceProfile}
                setVoiceProfile={setVoiceProfile}
                history={history}
                setHistory={setHistory}
                runtimeClient={runtimeClient}
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
              <StudioSettingsScreen settings={settings} setSettings={setSettings} runtimeClient={runtimeClient} />
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
  );
}
