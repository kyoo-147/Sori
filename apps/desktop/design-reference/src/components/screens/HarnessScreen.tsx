import React, { useState } from 'react';
import { CheckCircle, Folder, ArrowRight, UploadCloud, FileText } from 'lucide-react';

export const HarnessScreen: React.FC = () => {
  const [folder, setFolder] = useState<string>('Personal');
  const [isUploaded, setIsUploaded] = useState<boolean>(true);

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-12 text-zinc-900 font-sans min-h-[500px] flex flex-col items-center justify-center">
      {isUploaded ? (
        /* Upload Complete Screen */
        <div className="text-center space-y-6 max-w-md mx-auto animate-in fade-in zoom-in-95 duration-300">
          {/* Centered Checkmark Icon */}
          <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-500 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
            <CheckCircle className="w-8 h-8 stroke-[2.5]" />
          </div>

          {/* Heading & Excerpt */}
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Transcription Complete</h1>
            <p className="text-xs text-zinc-500 leading-relaxed max-w-sm mx-auto">
              The team agreed to move forward with the new design system. Sarah will lead the migration...
            </p>
          </div>

          {/* Folder Selector Dropdown */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-700 font-medium">
            <Folder className="w-3.5 h-3.5 text-zinc-400" />
            <select
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              className="bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="Personal">Personal</option>
              <option value="Meetings">Meetings</option>
              <option value="Work">Work</option>
            </select>
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              onClick={() => alert('Opening transcribed note in Notes editor...')}
              className="px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs shadow-2xs flex items-center gap-2 transition"
            >
              <span>Open Note</span>
              <span className="w-4 h-4 rounded-full bg-white/20 text-white font-mono text-[10px] flex items-center justify-center">1</span>
            </button>
            <button
              onClick={() => setIsUploaded(false)}
              className="px-4 py-2.5 rounded-xl text-zinc-600 hover:text-zinc-900 text-xs font-semibold hover:bg-zinc-100 transition"
            >
              New Upload
            </button>
          </div>
        </div>
      ) : (
        /* Upload Input Dropzone */
        <div className="border-2 border-dashed border-zinc-200 rounded-2xl p-10 text-center space-y-4 max-w-md w-full bg-zinc-50/80">
          <div className="w-12 h-12 rounded-full bg-zinc-900 text-white flex items-center justify-center mx-auto shadow-xs">
            <UploadCloud className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Upload Audio or Meeting Recording</h2>
            <p className="text-xs text-zinc-500 mt-1">Supports MP3, WAV, M4A up to 500MB</p>
          </div>
          <button
            onClick={() => setIsUploaded(true)}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl transition shadow-2xs"
          >
            Select Audio File
          </button>
        </div>
      )}
    </div>
  );
};
