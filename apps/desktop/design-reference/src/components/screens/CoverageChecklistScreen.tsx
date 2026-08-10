import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Play,
  Download,
  ShieldAlert,
  Cpu,
  Terminal,
  Database,
  Volume2,
  HardDrive,
} from 'lucide-react';

export const CoverageChecklistScreen: React.FC = () => {
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [daemonStatus, setDaemonStatus] = useState<'running' | 'restarting'>('running');
  const [testResult, setTestResult] = useState<string | null>(null);

  const doctorChecklist = [
    { name: 'Platform Runtime', status: 'Passed', detail: 'Windows 11 x64 (x86_64-pc-windows-msvc)' },
    { name: 'Sori Daemon (`sorid`)', status: daemonStatus === 'running' ? 'Passed' : 'Restarting', detail: 'Process PID: 4092 • Memory: 42MB • Local IPC Active' },
    { name: 'Global Hotkey Listener', status: 'Passed', detail: 'Registered shortcut: Alt + Space (Low-level Windows hook)' },
    { name: 'Microphone Device', status: 'Passed', detail: 'Realtek High Definition Audio • 48kHz / 16-bit Mono' },
    { name: 'OS Microphone Permission', status: 'Passed', detail: 'Granted in Windows Privacy Settings' },
    { name: 'Voice Activity Detection (VAD)', status: 'Passed', detail: 'Silero VAD v4.0 local ONNX pipeline ready' },
    { name: 'Local ASR Engine', status: 'Passed', detail: 'Whisper.cpp (Q5_0 quantized) warm in RAM (240MB)' },
    { name: 'Text Injection Permission', status: 'Passed', detail: 'Windows UI Automation API hook attached' },
    { name: 'Clipboard Fallback Buffer', status: 'Passed', detail: 'Clipboard state backup and automatic restore functional' },
    { name: 'SQLite Local Storage', status: 'Passed', detail: 'Database health: OK (`sori_history.db`, WAL mode)' },
    { name: 'System Tray Manager', status: 'Passed', detail: 'Tray icon active in taskbar notification area' },
  ];

  const handleRestartDaemon = () => {
    setDaemonStatus('restarting');
    setTimeout(() => {
      setDaemonStatus('running');
    }, 1200);
  };

  const handleTestInjection = () => {
    setTestResult('Text injection payload successfully delivered to focused input window.');
    setTimeout(() => setTestResult(null), 3000);
  };

  const handleRefreshDoctor = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 800);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6 text-[#161616]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E4E8] pb-3">
        <div>
          <h1 className="sori-page-heading">Sori Doctor & System Diagnostics</h1>
          <p className="sori-body-text mt-0.5">
            Automated diagnostic doctor checklist for audio capture, local daemon health, and text injection hooks.
          </p>
        </div>

        <button
          onClick={handleRefreshDoctor}
          className="px-4 py-2 bg-[#EEF2F6] hover:bg-[#E1E8F0] text-[#24384C] border border-[#D5E0EA] rounded-[10px] text-xs font-semibold shadow-2xs flex items-center gap-1.5 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#5C728A] ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Run Doctor Check</span>
        </button>
      </div>

      {testResult && (
        <div className="p-3 bg-[#EAF6EE] border border-[#CBE5D4] rounded-[12px] text-xs font-medium text-[#1F6B43] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{testResult}</span>
        </div>
      )}

      {/* Doctor Checklist Table */}
      <div className="bg-white border border-[#E2E4E8] rounded-[18px] p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#E2E4E8]">
          <span className="text-xs font-semibold text-[#161616] flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#5C728A]" />
            11-Point System Integrity Check
          </span>
          <span className="text-[11px] font-mono text-[#1F6B43] bg-[#EAF6EE] px-2.5 py-0.5 rounded-[6px] border border-[#CBE5D4] font-semibold">
            All Systems Healthy (11/11)
          </span>
        </div>

        <div className="divide-y divide-[#E2E4E8]">
          {doctorChecklist.map((item, idx) => (
            <div key={idx} className="py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="space-y-0.5">
                <div className="font-semibold text-[#161616]">{item.name}</div>
                <div className="text-[11px] font-mono text-[#858A90]">{item.detail}</div>
              </div>

              <div className="flex items-center gap-2 font-mono">
                <span className="px-2.5 py-0.5 rounded-[6px] bg-[#EAF6EE] text-[#1F6B43] border border-[#CBE5D4] text-[11px] font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {item.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Repair Actions Toolbar */}
      <div className="bg-white border border-[#E2E4E8] rounded-[18px] p-5 shadow-2xs space-y-3">
        <h3 className="text-xs font-semibold text-[#161616]">Diagnostic & Repair Actions</h3>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleTestInjection}
            className="px-4 py-2 bg-[#EEF2F6] hover:bg-[#E1E8F0] text-[#24384C] border border-[#D5E0EA] rounded-[10px] text-xs font-semibold shadow-2xs transition flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5 text-[#5C728A]" />
            <span>Test Text Injection</span>
          </button>

          <button
            onClick={handleRestartDaemon}
            className="px-4 py-2 bg-white hover:bg-[#F0F1F2] text-[#2B2F33] border border-[#E2E4E8] rounded-[10px] text-xs font-medium transition flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#5C728A]" />
            <span>Restart Daemon (`sorid`)</span>
          </button>

          <button
            onClick={() => alert('Exporting diagnostics log to sori_diagnostics.log...')}
            className="px-4 py-2 bg-white hover:bg-[#F0F1F2] text-[#2B2F33] border border-[#E2E4E8] rounded-[10px] text-xs font-medium transition flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-[#5C728A]" />
            <span>Export Diagnostics Log</span>
          </button>
        </div>
      </div>
    </div>
  );
};

