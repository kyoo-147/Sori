import React, { useState } from 'react';
import { VoiceProfile } from '../../types';
import {
  Shield,
  Lock,
  Database,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Download,
  Mic,
  X,
  UserCheck,
} from 'lucide-react';

interface VoiceIdentityScreenProps {
  voiceProfile: VoiceProfile;
  setVoiceProfile: React.Dispatch<React.SetStateAction<VoiceProfile>>;
}

export const VoiceIdentityScreen: React.FC<VoiceIdentityScreenProps> = ({
  voiceProfile,
  setVoiceProfile,
}) => {
  const [saveTranscripts, setSaveTranscripts] = useState<boolean>(true);
  const [retentionDays, setRetentionDays] = useState<number>(30);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState<string>('');
  const [deleteSuccessMsg, setDeleteSuccessMsg] = useState<string | null>(null);

  const [enrollStep, setEnrollStep] = useState<number>(0);
  const sampleSentences = [
    'Sori is my local programmable voice runtime.',
    'System authorization verified for user Alex.',
    'Execute cargo build release and run tests.',
  ];

  const advanceEnrollment = () => {
    if (enrollStep < sampleSentences.length) {
      setEnrollStep((prev) => prev + 1);
      if (enrollStep + 1 === sampleSentences.length) {
        setVoiceProfile((prev) => ({
          ...prev,
          enrolled: true,
          confidenceScore: 98.4,
          sampleCount: 3,
          enrolledDate: new Date().toLocaleDateString(),
        }));
      }
    }
  };

  const resetEnrollment = () => {
    setEnrollStep(0);
    setVoiceProfile((prev) => ({
      ...prev,
      enrolled: false,
      confidenceScore: 0,
      sampleCount: 0,
    }));
  };

  const handleDeleteHistory = () => {
    if (deleteConfirmInput !== 'DELETE') return;
    setDeleteSuccessMsg('Local transcripts database cleared successfully.');
    setIsDeleteModalOpen(false);
    setDeleteConfirmInput('');
    setTimeout(() => setDeleteSuccessMsg(null), 3000);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6 text-[#161616]">
      {/* Page Header */}
      <div className="border-b border-[#E2E4E8] pb-3">
        <h1 className="sori-page-heading">Privacy & Data Control</h1>
        <p className="sori-body-text mt-0.5">
          Local-first privacy enforcement. All audio capture, ASR transcription, and history retention stay on your machine.
        </p>
      </div>

      {deleteSuccessMsg && (
        <div className="p-3 bg-[#EAF6EE] border border-[#CBE5D4] rounded-[12px] text-xs font-medium text-[#1F6B43] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{deleteSuccessMsg}</span>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Local Data Retention Card */}
        <div className="bg-white border border-[#E2E4E8] rounded-[18px] p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-[#E2E4E8]">
            <Database className="w-4 h-4 text-[#5C728A]" />
            <h2 className="sori-section-heading">Local Data & Storage Retention</h2>
          </div>

          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between p-3 bg-[#F8F8F7] border border-[#E2E4E8] rounded-[12px]">
              <div>
                <div className="font-semibold text-[#161616]">Save Local Transcripts History</div>
                <div className="text-[11px] text-[#858A90]">Store text locally in SQLite database (`sori_history.db`)</div>
              </div>
              <input
                type="checkbox"
                checked={saveTranscripts}
                onChange={(e) => setSaveTranscripts(e.target.checked)}
                className="w-4 h-4 accent-[#2E4E6D] cursor-pointer"
              />
            </div>

            <div className="p-3 bg-[#F8F8F7] border border-[#E2E4E8] rounded-[12px] space-y-2">
              <div className="flex justify-between font-medium">
                <span className="text-[#5F6368]">Automatic History Retention Window:</span>
                <span className="font-mono text-[#161616] font-semibold">{retentionDays} Days</span>
              </div>
              <input
                type="range"
                min={1}
                max={90}
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
                className="w-full accent-[#2E4E6D] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-[#858A90]">
                <span>1 Day</span>
                <span>30 Days</span>
                <span>90 Days</span>
              </div>
            </div>

            <div className="p-3 bg-[#F8F8F7] border border-[#E2E4E8] rounded-[12px] flex items-center justify-between">
              <div>
                <div className="font-semibold text-[#161616]">Audio Stream Processing</div>
                <div className="text-[11px] text-[#858A90]">Audio RAM buffers wiped immediately post-transcription</div>
              </div>
              <span className="text-[11px] font-mono text-[#1F6B43] bg-[#EAF6EE] px-2.5 py-0.5 rounded-[6px] border border-[#CBE5D4] font-semibold">
                Ephemeral Only
              </span>
            </div>
          </div>
        </div>

        {/* Voice Lock Card */}
        <div className="bg-white border border-[#E2E4E8] rounded-[18px] p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-[#E2E4E8]">
            <Lock className="w-4 h-4 text-[#5C728A]" />
            <h2 className="sori-section-heading">Voice Lock (Biometric Owner Verification)</h2>
          </div>

          <div className="space-y-4 text-xs">
            <div className="p-3.5 bg-[#F8F8F7] border border-[#E2E4E8] rounded-[12px] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#161616]">Owner Voiceprint Status</span>
                <span className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-[6px] border ${
                  voiceProfile.enrolled
                    ? 'bg-[#EAF6EE] text-[#1F6B43] border-[#CBE5D4]'
                    : 'bg-[#FDF2F2] text-[#A33A3A] border-[#F8D2D2]'
                }`}>
                  {voiceProfile.enrolled ? 'Enrolled (98.4%)' : 'Not Enrolled'}
                </span>
              </div>

              {voiceProfile.enrolled ? (
                <div className="space-y-2">
                  <p className="text-[11.5px] text-[#5F6368] leading-relaxed">
                    Voice embeddings stored locally in OS keychain. Restricts sensitive shell commands to owner voice.
                  </p>
                  <button
                    onClick={resetEnrollment}
                    className="px-3 py-1.5 bg-white border border-[#E2E4E8] hover:bg-[#FDF2F2] hover:text-[#A33A3A] text-[#2B2F33] rounded-[8px] font-medium text-xs transition"
                  >
                    Reset Owner Voiceprint
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[11.5px] text-[#5F6368]">
                    Read the sample sentence out loud to enroll your voice profile ({enrollStep + 1}/3):
                  </p>
                  <div className="p-2.5 bg-white border border-[#E2E4E8] rounded-[8px] font-mono text-xs italic font-semibold text-[#161616]">
                    "{sampleSentences[Math.min(enrollStep, sampleSentences.length - 1)]}"
                  </div>
                  <button
                    onClick={advanceEnrollment}
                    className="w-full py-2 bg-[#EEF2F6] hover:bg-[#E1E8F0] text-[#24384C] border border-[#D5E0EA] rounded-[10px] font-semibold text-xs transition flex items-center justify-center gap-1.5"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Record Sample ({enrollStep + 1}/3)</span>
                  </button>
                </div>
              )}
            </div>

            {/* Guest Policy Selector */}
            <div className="space-y-2">
              <label className="block font-semibold text-[#161616]">Guest & Command Policy:</label>
              <select
                value={voiceProfile.guestPolicy}
                onChange={(e) => setVoiceProfile((prev) => ({ ...prev, guestPolicy: e.target.value as any }))}
                className="w-full bg-[#F8F8F7] border border-[#E2E4E8] rounded-[10px] p-2 text-xs text-[#161616] focus:outline-none"
              >
                <option value="off">Off — Allow all speakers</option>
                <option value="guest_dictation_only">Guest Dictation, Owner-Only Commands (Default)</option>
                <option value="strict_owner_only">Strict Owner Only — Ignore guest voices completely</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white border border-[#F8D2D2] rounded-[18px] p-5 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 text-[#A33A3A] font-semibold text-xs">
          <AlertTriangle className="w-4 h-4" />
          <span>Danger Zone & Local Export</span>
        </div>

        <p className="text-xs text-[#5F6368]">
          Permanently clear local transcription logs, audio metadata, and cached embeddings from `sori_history.db`.
        </p>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => setIsDeleteModalOpen(true)}
            className="px-4 py-2 bg-[#FDF2F2] hover:bg-[#F8D2D2] text-[#A33A3A] border border-[#F8D2D2] rounded-[10px] text-xs font-semibold transition"
          >
            Delete Local History...
          </button>
          <button
            onClick={() => alert('Exporting local SQLite database to sori_export.json...')}
            className="px-4 py-2 bg-white hover:bg-[#F0F1F2] text-[#2B2F33] border border-[#E2E4E8] rounded-[10px] text-xs font-medium transition flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-[#5C728A]" />
            <span>Export Local Data JSON</span>
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E4E8] rounded-[20px] p-6 max-w-md w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#E2E4E8] pb-3">
              <div className="flex items-center gap-2 text-[#A33A3A] font-semibold text-sm">
                <AlertTriangle className="w-5 h-5" />
                <span>Confirm Local History Deletion</span>
              </div>
              <button onClick={() => setIsDeleteModalOpen(false)} className="text-[#858A90] hover:text-[#161616]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-[#5F6368]">
              <p>This action cannot be undone. The following items will be permanently erased:</p>
              <ul className="list-disc pl-5 space-y-1 text-[#161616]">
                <li>All captured voice dictation history entries</li>
                <li>Temporary audio latency logs and model metrics</li>
                <li>Local custom profile statistics</li>
              </ul>
              <p className="pt-2 text-[#161616] font-medium">
                Type <kbd className="px-2 py-0.5 bg-[#EEF2F6] border border-[#D5E0EA] rounded font-mono font-bold">DELETE</kbd> below to confirm:
              </p>
            </div>

            <input
              type="text"
              value={deleteConfirmInput}
              onChange={(e) => setDeleteConfirmInput(e.target.value)}
              placeholder="Type DELETE"
              className="w-full bg-[#F8F8F7] border border-[#E2E4E8] rounded-[10px] p-2.5 text-xs font-mono focus:outline-none focus:bg-white focus:border-[#A33A3A]"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 text-xs text-[#5F6368] hover:text-[#161616]"
              >
                Cancel
              </button>
              <button
                disabled={deleteConfirmInput !== 'DELETE'}
                onClick={handleDeleteHistory}
                className={`px-4 py-2 rounded-[10px] text-xs font-semibold transition border ${
                  deleteConfirmInput === 'DELETE'
                    ? 'bg-[#A33A3A] text-white border-[#A33A3A]'
                    : 'bg-[#F0F1F2] text-[#858A90] border-[#E2E4E8] cursor-not-allowed'
                }`}
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

