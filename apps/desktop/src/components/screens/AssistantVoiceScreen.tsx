import React from 'react';
import { AssistantVoiceSettings } from '../../types';
import {
  Volume2,
  Play,
  Sliders,
  CheckCircle2,
  Sparkles,
  Zap,
} from 'lucide-react';

interface AssistantVoiceScreenProps {
  assistantVoice: AssistantVoiceSettings;
  setAssistantVoice: React.Dispatch<React.SetStateAction<AssistantVoiceSettings>>;
}

export const AssistantVoiceScreen: React.FC<AssistantVoiceScreenProps> = ({
  assistantVoice,
  setAssistantVoice,
}) => {
  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6 text-zinc-900 font-sans">
      {/* Header */}
      <div className="sori-glass p-6 rounded-2xl border border-zinc-200/80 shadow-xs space-y-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-zinc-900 text-white shadow-xs">
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-zinc-900">Settings / Labs — Spoken Replies</h1>
            <p className="text-xs text-zinc-500">
              Optional speech synthesis when interacting with LLMs / conversational agents. Does not affect fast text dictation.
            </p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Voice Library */}
        <div className="bg-white/80 backdrop-blur-md border border-zinc-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="font-bold text-xs text-zinc-900">Spoken Voice Library</div>

          <div className="space-y-2.5 text-xs">
            {[
              { id: 'calm-assistant-en', name: 'Calm English Assistant', provider: 'Local Piper TTS' },
              { id: 'warm-vietnamese', name: 'Warm Vietnamese Female', provider: 'Local / BYOK' },
              { id: 'eleven-studio', name: 'Studio Natural Voice', provider: 'ElevenLabs Cloud' },
            ].map((v) => (
              <div
                key={v.id}
                onClick={() => setAssistantVoice((prev) => ({ ...prev, voiceId: v.id }))}
                className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                  assistantVoice.voiceId === v.id
                    ? 'bg-zinc-100/90 border-zinc-900 text-zinc-900 shadow-2xs font-bold'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                }`}
              >
                <div>
                  <div className="font-bold text-zinc-900">{v.name}</div>
                  <div className="text-[10px] text-zinc-500 font-mono">{v.provider}</div>
                </div>
                <button
                  type="button"
                  disabled
                  title="Unavailable: no TTS preview IPC contract is wired"
                  aria-label={`${v.name} preview unavailable`}
                  onClick={(e) => e.stopPropagation()}
                  className="px-3 py-1.5 rounded-xl border border-zinc-200 bg-zinc-100 text-zinc-500 text-[11px] font-bold shadow-2xs disabled:cursor-not-allowed"
                >
                  Preview unavailable
                </button>
              </div>
            ))}
          </div>

          {/* Controls: Speed, Pitch, Tone */}
          <div className="space-y-3 pt-2 text-xs">
            <div>
              <div className="flex justify-between text-zinc-700 font-medium mb-1.5">
                <span>Speed Rate: {assistantVoice.speed}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={assistantVoice.speed}
                onChange={(e) => setAssistantVoice((prev) => ({ ...prev, speed: parseFloat(e.target.value) }))}
                className="w-full accent-zinc-900 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Reply Policies */}
        <div className="bg-white/80 backdrop-blur-md border border-zinc-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="font-bold text-xs text-zinc-900">Spoken Reply Policy</div>

          <div className="space-y-2.5 text-xs">
            {[
              { id: 'never', label: 'Never Speak (Text output only)' },
              { id: 'conversation_only', label: 'Conversation Mode Only (Default)' },
              { id: 'short_confirmations', label: 'Short Audio Confirmations' },
              { id: 'full_answers', label: 'Speak Full Answers' },
            ].map((pol) => (
              <label
                key={pol.id}
                onClick={() => setAssistantVoice((prev) => ({ ...prev, replyPolicy: pol.id as any }))}
                className={`p-3.5 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                  assistantVoice.replyPolicy === pol.id
                    ? 'bg-zinc-100/90 border-zinc-900 text-zinc-900 shadow-2xs font-bold'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                }`}
              >
                <input
                  type="radio"
                  name="replyPolicy"
                  checked={assistantVoice.replyPolicy === pol.id}
                  onChange={() => {}}
                  className="accent-zinc-900 cursor-pointer"
                />
                <span className="font-bold text-zinc-900">{pol.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
