import React from 'react';
import { AssistantVoiceSettings } from '../../types';

interface AssistantVoiceScreenProps {
  assistantVoice: AssistantVoiceSettings;
  onAssistantVoiceChange: (next: AssistantVoiceSettings) => Promise<boolean>;
}

export const assistantVoicePreferencePatch = (current: AssistantVoiceSettings, patch: Partial<AssistantVoiceSettings>): AssistantVoiceSettings => ({ ...current, ...patch });

export const AssistantVoiceScreen: React.FC<AssistantVoiceScreenProps> = ({
  assistantVoice,
  onAssistantVoiceChange,
}) => {
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const update = async (patch: Partial<AssistantVoiceSettings>) => {
    setSaving(true);
    setSaveError(null);
    const accepted = await onAssistantVoiceChange(assistantVoicePreferencePatch(assistantVoice, patch));
    if (!accepted) setSaveError('Spoken reply preferences could not be saved by sorid.');
    setSaving(false);
  };
  return (
    <div className="sori-screen sori-page-layout space-y-6">
      <header>
        <h1 className="sori-page-heading">Spoken replies</h1>
        <p className="sori-body-text mt-1">Choose when Sori speaks and which voice it uses.</p>
      </header>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Voice Library */}
        <div className="sori-pane space-y-4 p-4 sm:p-6">
          <h2 className="sori-section-heading">Voice</h2>

          <div className="space-y-2.5 text-xs">
            {[
              { id: 'calm-assistant-en', name: 'Calm English Assistant', provider: 'Local Piper TTS' },
              { id: 'warm-vietnamese', name: 'Warm Vietnamese Female', provider: 'Local / BYOK' },
              { id: 'eleven-studio', name: 'Studio Natural Voice', provider: 'ElevenLabs Cloud' },
            ].map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={assistantVoice.voiceId === v.id}
                onClick={() => { if (!saving) void update({ voiceId: v.id }); }}
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
                <span
                  aria-disabled="true"
                  title="Unavailable: no TTS preview IPC contract is wired"
                  aria-label={`${v.name} preview unavailable`}
                  onClick={(e) => e.stopPropagation()}
                  className="px-3 py-1.5 rounded-xl border border-zinc-200 bg-zinc-100 text-zinc-500 text-[11px] font-bold shadow-2xs disabled:cursor-not-allowed"
                >
                  Preview unavailable
                </span>
              </button>
            ))}
          </div>

          {/* Controls: Speed, Pitch, Tone */}
          <div className="space-y-3 pt-2 text-xs">
            <div>
              <div className="flex justify-between text-zinc-700 font-medium mb-1.5">
                <span>Speed: {assistantVoice.speed}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={assistantVoice.speed}
                onChange={(e) => void update({ speed: parseFloat(e.target.value) })}
                disabled={saving}
                className="w-full accent-zinc-900 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Reply Policies */}
        <div className="sori-pane space-y-4 p-4 sm:p-6">
          <h2 className="sori-section-heading">When to speak</h2>

          <div className="space-y-2.5 text-xs">
            {[
              { id: 'never', label: 'Never — text only' },
              { id: 'conversation_only', label: 'Conversations only (default)' },
              { id: 'short_confirmations', label: 'Short confirmations' },
              { id: 'full_answers', label: 'Full answers' },
            ].map((pol) => (
              <label
                key={pol.id}
                onClick={() => { if (!saving) void update({ replyPolicy: pol.id as AssistantVoiceSettings['replyPolicy'] }); }}
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
                  onChange={() => { if (!saving) void update({ replyPolicy: pol.id as AssistantVoiceSettings['replyPolicy'] }); }}
                  disabled={saving}
                  className="accent-zinc-900 cursor-pointer"
                />
                <span className="font-bold text-zinc-900">{pol.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
      {saveError && <p role="alert" className="text-xs text-[#A75850]">{saveError}</p>}
    </div>
  );
};
