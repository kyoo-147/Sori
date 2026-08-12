import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Keyboard, Mic, RefreshCw, ShieldCheck, Sparkles, Volume2, XCircle } from 'lucide-react';
import type { AppSettings } from '../../types';
import type { DaemonStatus, DoctorCheck, RuntimeClient, RuntimeSource } from '../../runtime-client';

type StepState = 'idle' | 'checking' | 'granted' | 'denied' | 'retry' | 'complete';

type FirstRunOnboardingScreenProps = {
  settings: AppSettings;
  runtimeClient: RuntimeClient;
  runtimeStatus: DaemonStatus;
  runtimeSource: RuntimeSource;
  doctorChecks: DoctorCheck[];
  onComplete: () => void;
};

const steps = [
  { id: 1, label: 'Welcome' },
  { id: 2, label: 'Microphone' },
  { id: 3, label: 'Permissions' },
  { id: 4, label: 'Hotkey' },
  { id: 5, label: 'Ready' },
] as const;

function checkFor(checks: DoctorCheck[], names: string[]): DoctorCheck | undefined {
  return checks.find((check) => names.includes(check.name));
}

function statusText(state: StepState): string {
  return { idle: 'Not checked', checking: 'Checking…', granted: 'Granted', denied: 'Denied', retry: 'Retry needed', complete: 'Complete' }[state];
}

export const FirstRunOnboardingScreen: React.FC<FirstRunOnboardingScreenProps> = ({
  settings,
  runtimeClient,
  runtimeStatus,
  runtimeSource,
  doctorChecks,
  onComplete,
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [stepStates, setStepStates] = useState<Record<number, StepState>>({ 1: 'idle', 2: 'idle', 3: 'idle', 4: 'idle', 5: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [isDictating, setIsDictating] = useState(false);

  const setStep = (step: number, state: StepState) => setStepStates((previous) => ({ ...previous, [step]: state }));
  const audioCheck = checkFor(doctorChecks, ['audio', 'microphone']);
  const hotkeyCheck = checkFor(doctorChecks, ['hotkey']);
  const injectionCheck = checkFor(doctorChecks, ['text-injection']);
  const daemonReady = runtimeStatus.daemon === 'running' && runtimeSource !== 'unavailable';

  const refreshChecks = useCallback(async (step: number) => {
    setStep(step, 'checking');
    setError(null);
    const result = await runtimeClient.doctor();
    const relevant = step === 2 ? checkFor(result.data, ['audio', 'microphone']) : step === 3 ? checkFor(result.data, ['text-injection']) : checkFor(result.data, ['hotkey']);
    if (result.error || !relevant?.ok) {
      setStep(step, result.error ? 'retry' : 'denied');
      setError(result.error ?? relevant?.detail ?? 'The daemon reported this capability is unavailable.');
      return false;
    }
    setStep(step, 'granted');
    return true;
  }, [runtimeClient]);

  useEffect(() => {
    if (currentStep === 1 && daemonReady) setStep(1, 'granted');
  }, [currentStep, daemonReady]);

  const runFirstDictation = async () => {
    setStep(4, 'checking');
    setIsDictating(true);
    setError(null);
    setTranscript(null);
    try {
      const started = await runtimeClient.dictationStart();
      if (started.error) throw new Error(started.error);
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      const stopped = await runtimeClient.dictationStop();
      if (stopped.error || !stopped.data) throw new Error(stopped.error ?? 'The daemon did not return a transcript.');
      setTranscript(stopped.data.text);
      setStep(4, 'complete');
      setStep(5, 'complete');
      setCurrentStep(5);
    } catch (cause) {
      setStep(4, 'retry');
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setIsDictating(false);
    }
  };

  const canAdvance = useMemo(() => {
    if (currentStep === 1) return daemonReady;
    if (currentStep === 2) return stepStates[2] === 'granted';
    if (currentStep === 3) return stepStates[3] === 'granted';
    return false;
  }, [currentStep, daemonReady, stepStates]);

  const stateBadge = (step: number) => {
    const state = stepStates[step];
    return <span className="sori-meta-text" data-testid={`onboarding-step-${step}-state`}>{statusText(state)}</span>;
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 text-[#1C1B19] md:p-8" data-testid="first-run-setup">
      <header className="space-y-2 text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[#D9D4CC] bg-[#F2EEE8] px-3 py-1 text-xs font-medium text-[#68635D]"><Sparkles className="h-3.5 w-3.5" /> First Run Setup</div>
        <h1 className="sori-page-heading">Get ready to speak into any window</h1>
        <p className="sori-body-text mx-auto max-w-xl">We’ll check your local daemon, microphone, permissions, and hotkey. Hardware-dependent checks stay explicitly visible when they cannot be verified here.</p>
      </header>

      <nav aria-label="First Run Setup progress" className="mx-auto flex max-w-2xl items-start justify-between">
        {steps.map((step, index) => {
          const active = currentStep === step.id;
          const complete = stepStates[step.id] === 'complete' || (step.id < currentStep && stepStates[step.id] === 'granted');
          return <React.Fragment key={step.id}>
            <button type="button" onClick={() => step.id <= currentStep && setCurrentStep(step.id)} disabled={step.id > currentStep} aria-current={active ? 'step' : undefined} className="flex min-w-0 flex-col items-center gap-1 text-center disabled:cursor-not-allowed">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${active ? 'border-[#6E7A80] bg-[#6E7A80] text-white' : complete ? 'border-[#BFD7C5] bg-[#E8F1E9] text-[#4E7A61]' : 'border-[#D9D4CC] bg-[#F8F5F1] text-[#98928A]'}`}>{complete ? <CheckCircle2 className="h-4 w-4" /> : step.id}</span>
              <span className="text-[11px] text-[#68635D]">{step.label}</span>
            </button>
            {index < steps.length - 1 && <span className="mt-4 h-px flex-1 bg-[#DDD8D0]" />}
          </React.Fragment>;
        })}
      </nav>

      <section className="space-y-6 rounded-[18px] border border-[#DED9D1] bg-[#FBF9F6] p-5 shadow-sm md:p-8" aria-live="polite">
        {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-[#E6BDB7] bg-[#FBEFED] p-3 text-sm text-[#A75850]"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>Setup check failed.</strong> {error} Retry the check or resolve it in Diagnostics.</span></div>}

        {currentStep === 1 && <div className="space-y-5 py-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#DED9D1] bg-[#F2EEE8]"><Volume2 className="h-7 w-7 text-[#6E7A80]" /></div>
          <div><h2 className="sori-section-heading">Private. Local. Ready when you are.</h2><p className="sori-body-text mx-auto mt-2 max-w-lg">Setup uses canonical loopback IPC when the daemon is reachable. This screen never treats a preview or timer as microphone, Whisper, hotkey, or injection proof.</p></div>
          <p className="sori-meta-text">Daemon: {runtimeSource} · {daemonReady ? 'reachable' : 'unavailable'}</p>
          <button type="button" onClick={() => setCurrentStep(2)} disabled={!daemonReady} className="sori-tactile-btn rounded-xl px-6 py-3 text-sm disabled:opacity-60">Begin setup <ArrowRight className="ml-1 inline h-4 w-4" /></button>
        </div>}

        {currentStep === 2 && <div className="space-y-5">
          <div className="flex items-start gap-3"><Mic className="mt-1 h-5 w-5 text-[#6E7A80]" /><div><h2 className="sori-section-heading">Check your microphone</h2><p className="sori-body-text">The daemon’s Doctor response is authoritative for audio adapter readiness. A physical speaking test remains UNVERIFIED until run on the target Windows machine.</p></div></div>
          <div className="rounded-xl border border-[#DED9D1] bg-[#F2EEE8] p-4"><div className="flex items-center justify-between"><span className="font-medium">Microphone adapter</span>{stateBadge(2)}</div><p className="sori-meta-text mt-2">{audioCheck?.detail ?? 'No audio check has been returned by sorid yet.'}</p></div>
          <div className="flex flex-wrap justify-between gap-3"><button type="button" onClick={() => setCurrentStep(1)} className="sori-tactile-btn rounded-xl px-4 py-2 text-sm"><ArrowLeft className="mr-1 inline h-4 w-4" /> Back</button><div className="flex gap-2"><button type="button" onClick={() => void refreshChecks(2)} className="sori-tactile-btn rounded-xl px-4 py-2 text-sm"><RefreshCw className="mr-1 inline h-4 w-4" /> Check microphone</button><button type="button" onClick={() => setCurrentStep(3)} disabled={!canAdvance} className="sori-tactile-btn rounded-xl px-4 py-2 text-sm disabled:opacity-50">Continue <ArrowRight className="ml-1 inline h-4 w-4" /></button></div></div>
        </div>}

        {currentStep === 3 && <div className="space-y-5">
          <div className="flex items-start gap-3"><ShieldCheck className="mt-1 h-5 w-5 text-[#6E7A80]" /><div><h2 className="sori-section-heading">Review permissions</h2><p className="sori-body-text">Permission state comes from the daemon. Sori does not show “Granted” for OS permissions it cannot actually query.</p></div></div>
          <div className="space-y-3"><div className="rounded-xl border border-[#DED9D1] bg-[#F2EEE8] p-4"><div className="flex items-center justify-between"><span className="font-medium">Text injection permission</span>{stateBadge(3)}</div><p className="sori-meta-text mt-2">{injectionCheck?.detail ?? 'No text-injection check has been returned by sorid yet.'}</p></div><div className="rounded-xl border border-dashed border-[#D9D4CC] p-4 text-sm text-[#68635D]">Physical microphone permission and focused-app insertion are <strong>UNVERIFIED</strong> in browser/preview acceptance.</div></div>
          <div className="flex flex-wrap justify-between gap-3"><button type="button" onClick={() => setCurrentStep(2)} className="sori-tactile-btn rounded-xl px-4 py-2 text-sm"><ArrowLeft className="mr-1 inline h-4 w-4" /> Back</button><div className="flex gap-2"><button type="button" onClick={() => void refreshChecks(3)} className="sori-tactile-btn rounded-xl px-4 py-2 text-sm"><RefreshCw className="mr-1 inline h-4 w-4" /> Check permissions</button><button type="button" onClick={() => setCurrentStep(4)} disabled={!canAdvance} className="sori-tactile-btn rounded-xl px-4 py-2 text-sm disabled:opacity-50">Continue <ArrowRight className="ml-1 inline h-4 w-4" /></button></div></div>
        </div>}

        {currentStep === 4 && <div className="space-y-5">
          <div className="flex items-start gap-3"><Keyboard className="mt-1 h-5 w-5 text-[#6E7A80]" /><div><h2 className="sori-section-heading">Try your hotkey and first dictation</h2><p className="sori-body-text">Configured hotkey: <kbd className="rounded border border-[#D9D4CC] bg-[#F2EEE8] px-1.5 py-0.5 font-mono text-xs">{settings.hotkey}</kbd>. The button below sends real DictationStart/DictationStop IPC calls; it never fabricates text or claims OS injection.</p></div></div>
          <div className="rounded-xl border border-[#DED9D1] bg-[#F2EEE8] p-4"><div className="flex items-center justify-between"><span className="font-medium">Global hotkey registration</span>{stateBadge(4)}</div><p className="sori-meta-text mt-2">{hotkeyCheck?.detail ?? 'Doctor check not loaded for the configured hotkey.'}</p></div>
          {transcript && <div className="rounded-xl border border-[#BFD7C5] bg-[#E8F1E9] p-4 text-sm text-[#315C42]"><strong>Daemon transcript returned:</strong> {transcript}<p className="sori-meta-text mt-2">Focused-app text injection is still UNVERIFIED; this acceptance proves IPC response only.</p></div>}
          <div className="flex flex-wrap justify-between gap-3"><button type="button" onClick={() => setCurrentStep(3)} className="sori-tactile-btn rounded-xl px-4 py-2 text-sm"><ArrowLeft className="mr-1 inline h-4 w-4" /> Back</button><button type="button" onClick={() => void runFirstDictation()} disabled={isDictating} className="sori-tactile-btn rounded-xl px-5 py-2 text-sm disabled:opacity-60">{isDictating ? 'Waiting for daemon…' : 'Run first dictation'} <ArrowRight className="ml-1 inline h-4 w-4" /></button></div>
        </div>}

        {currentStep === 5 && <div className="space-y-5 py-4 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#BFD7C5] bg-[#E8F1E9]"><CheckCircle2 className="h-8 w-8 text-[#4E7A61]" /></div><div><h2 className="sori-section-heading">Setup checks complete</h2><p className="sori-body-text mx-auto mt-2 max-w-lg">Sori received a transcript from the daemon. Physical hotkey, microphone capture, Whisper inference, and focused-app injection remain UNVERIFIED until machine-level validation.</p></div><button type="button" onClick={onComplete} className="sori-tactile-btn rounded-xl px-6 py-3 text-sm">Go to Home <ArrowRight className="ml-1 inline h-4 w-4" /></button></div>}
      </section>
    </div>
  );
};
