import React, { useState } from 'react';
import { ModelInfo, RouteRule } from '../../types';
import {
  Cpu,
  Cloud,
  HardDrive,
  Sparkles,
  Check,
  CheckCircle2,
  Sliders,
  Zap,
} from 'lucide-react';

interface ModelManagerScreenProps {
  models: ModelInfo[];
  setModels: React.Dispatch<React.SetStateAction<ModelInfo[]>>;
  routes: RouteRule[];
  setRoutes: React.Dispatch<React.SetStateAction<RouteRule[]>>;
  runtimeAvailable?: boolean;
}

export const ModelManagerScreen: React.FC<ModelManagerScreenProps> = ({
  models,
  setModels,
  routes,
  setRoutes,
  runtimeAvailable = true,
}) => {
  const [topTab, setTopTab] = useState<'stt' | 'aimodels'>('aimodels');
  const [environmentFilter, setEnvironmentFilter] = useState<'cloud' | 'local'>('cloud');
  const [selectedProvider, setSelectedProvider] = useState<string>('OpenWhispr');
  const [selectedModelId, setSelectedModelId] = useState<string>('claude-sonnet-4');

  const providers = [
    { id: 'OpenWhispr', name: 'OpenWhispr' },
    { id: 'OpenAI', name: 'OpenAI' },
    { id: 'Anthropic', name: 'Anthropic' },
    { id: 'Gemini', name: 'Gemini' },
    { id: 'Groq', name: 'Groq' },
    { id: 'Custom', name: 'Custom' },
  ];

  const aiModelsList = [
    { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', badge: 'Balanced', provider: 'OpenWhispr' },
    { id: 'claude-opus-4', name: 'Claude Opus 4', badge: 'Highest quality', provider: 'OpenWhispr' },
    { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', badge: 'Fast reasoning', provider: 'OpenWhispr' },
    { id: 'gpt-4o', name: 'GPT-4o Omnimodal', badge: 'Ultra Fast', provider: 'OpenAI' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', badge: '1M Context', provider: 'Gemini' },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6 text-[#1C1B1A] font-sans">
      <div className="border-b border-[#E6E3DD] pb-4">
        <h1 className="sori-page-heading">Models & Routing</h1>
        <p className="sori-body-text mt-0.5">
          Choose local speech engines, route presets, and optional model fallbacks without blocking dictation.
        </p>
      </div>

      {/* Top Main Segment Tabs */}
      <div className="bg-[#EFECE6] border border-[#E6E3DD] p-1.5 rounded-[16px] flex items-center justify-center max-w-xl mx-auto shadow-2xs">
        <button
          onClick={() => setTopTab('stt')}
          className={`flex-1 py-2 rounded-[12px] text-xs font-semibold transition-all text-center ${
            topTab === 'stt'
              ? 'bg-white text-[#1C1B1A] shadow-2xs border border-[#E6E3DD]'
              : 'text-[#656461] hover:text-[#1C1B1A]'
          }`}
        >
          Speech-to-Text
        </button>
        <button
          onClick={() => setTopTab('aimodels')}
          className={`flex-1 py-2 rounded-[12px] text-xs font-semibold transition-all text-center ${
            topTab === 'aimodels'
              ? 'bg-white text-[#1C1B1A] shadow-2xs border border-[#E6E3DD]'
              : 'text-[#656461] hover:text-[#1C1B1A]'
          }`}
        >
          AI Models
        </button>
      </div>

      {/* Main Panel */}
      <div className="bg-white border border-[#E6E3DD] rounded-[16px] p-6 shadow-2xs space-y-6">
        {!runtimeAvailable && models.length === 0 && (
          <div role="status" className="rounded-xl border border-[#D5E0EA] bg-[#F8FAFC] p-6 text-center text-xs text-[#5C728A]">
            <p className="font-semibold">No models reported by sorid</p>
            <p className="mt-1">Model inventory and routing controls are unavailable until the daemon provides them through IPC.</p>
          </div>
        )}
        {/* Environment Filter: Cloud vs Local */}
        <div className="flex items-center gap-4 text-xs font-medium border-b border-[#E6E3DD] pb-3">
          <button
            onClick={() => setEnvironmentFilter('cloud')}
            className={`pb-2 border-b-2 transition-all ${
              environmentFilter === 'cloud'
                ? 'border-[#1C1B1A] text-[#1C1B1A] font-semibold'
                : 'border-transparent text-[#94928E] hover:text-[#656461]'
            }`}
          >
            Cloud
          </button>
          <button
            onClick={() => setEnvironmentFilter('local')}
            className={`pb-2 border-b-2 transition-all ${
              environmentFilter === 'local'
                ? 'border-[#1C1B1A] text-[#1C1B1A] font-semibold'
                : 'border-transparent text-[#94928E] hover:text-[#656461]'
            }`}
          >
            Local
          </button>
        </div>

        {/* Provider List Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedProvider(p.id)}
              className={`px-3.5 py-1.5 rounded-[10px] text-xs font-medium transition-all flex items-center gap-1.5 border ${
                selectedProvider === p.id
                  ? 'bg-[#F1EEE8] border-[#DAD7D0] text-[#1C1B1A] font-semibold shadow-2xs'
                  : 'bg-white border-[#E6E3DD] text-[#656461] hover:bg-[#F1EEE8]'
              }`}
            >
              <span>{p.name}</span>
            </button>
          ))}
        </div>

        {/* Models List */}
        {topTab === 'aimodels' && runtimeAvailable ? (
          <div className="space-y-2 pt-2">
            {aiModelsList.map((m) => {
              const isSelected = selectedModelId === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() => setSelectedModelId(m.id)}
                  className={`p-4 rounded-[12px] border flex items-center justify-between cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[#F1EEE8] border-[#DAD7D0] text-[#1C1B1A] shadow-2xs font-semibold'
                      : 'bg-white border-[#E6E3DD] text-[#656461] hover:bg-[#F6F4EF]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        isSelected ? 'bg-[#1C1B1A]' : 'bg-[#DAD7D0]'
                      }`}
                    />
                    <span className="font-semibold text-xs text-[#1C1B1A]">{m.name}</span>
                  </div>
                  <span className="text-xs text-[#94928E] font-medium">{m.badge}</span>
                </div>
              );
            })}
          </div>
        ) : (
          /* STT Speech Models */
          <div className="space-y-2 pt-2">
            {models.map((m) => {
              const isWarm = m.isWarm;
              return (
                <div
                  key={m.id}
                  onClick={() => {
                    setModels((prev) =>
                      prev.map((mod) => ({ ...mod, isWarm: mod.id === m.id }))
                    );
                  }}
                  className={`p-4 rounded-[12px] border flex items-center justify-between cursor-pointer transition-all ${
                    isWarm
                      ? 'bg-[#EAF6EE] border-[#CBE5D4] text-[#1C1B1A] shadow-2xs font-semibold'
                      : 'bg-white border-[#E6E3DD] text-[#656461] hover:bg-[#F6F4EF]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-[#1C1B1A]">{m.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-[6px] bg-[#F1EEE8] text-[#656461] font-mono border border-[#E6E3DD]">
                        {m.backend}
                      </span>
                    </div>
                    <p className="text-xs text-[#94928E]">{m.description}</p>
                  </div>
                  <div className="text-right space-y-1">
                    <span className="text-xs font-mono font-semibold text-[#1F6B43]">{m.latencyMs}ms</span>
                    <div className="text-[10px] text-[#94928E]">{m.speedRating}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
