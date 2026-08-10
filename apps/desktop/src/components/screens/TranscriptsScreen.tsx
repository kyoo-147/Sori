import React, { useState } from 'react';
import { HistoryItem } from '../../types';
import { Search, Filter, Copy, Play, Trash2, Clock, CheckCircle2, ChevronRight, RefreshCw, X, AlertCircle } from 'lucide-react';

interface TranscriptsScreenProps {
  history: HistoryItem[];
  setHistory?: React.Dispatch<React.SetStateAction<HistoryItem[]>>;
  onReinsert?: (text: string) => void;
}

export const TranscriptsScreen: React.FC<TranscriptsScreenProps> = ({
  history,
  setHistory,
  onReinsert,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [appFilter, setAppFilter] = useState<string>('all');
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(history[0] || null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewState, setViewState] = useState<'normal' | 'empty' | 'loading' | 'error'>('normal');

  const filteredHistory = history.filter((item) => {
    const matchesSearch =
      item.processedText.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.rawTranscript.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesApp = appFilter === 'all' || item.activeApp.toLowerCase().includes(appFilter.toLowerCase());
    return matchesSearch && matchesApp;
  });

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleDelete = (id: string) => {
    if (setHistory) {
      setHistory((prev) => prev.filter((item) => item.id !== id));
    }
    if (selectedItem?.id === id) {
      setSelectedItem(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6 text-[#161616]">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E4E8] pb-4">
        <div>
          <h1 className="sori-page-heading">Transcripts Timeline</h1>
          <p className="sori-body-text mt-0.5">
            Local voice capture audit log. Review, copy, or re-insert recent dictations across all applications.
          </p>
        </div>

        {/* View State Test Toggles */}
        <div className="flex items-center gap-1.5 bg-[#F0F1F2] p-1 rounded-[10px] border border-[#E2E4E8] text-[12px]">
          <button
            onClick={() => setViewState('normal')}
            className={`px-2.5 py-1 rounded-[8px] font-medium transition ${
              viewState === 'normal' ? 'bg-white text-[#161616] shadow-2xs font-semibold' : 'text-[#5F6368]'
            }`}
          >
            Normal
          </button>
          <button
            onClick={() => setViewState('empty')}
            className={`px-2.5 py-1 rounded-[8px] font-medium transition ${
              viewState === 'empty' ? 'bg-white text-[#161616] shadow-2xs font-semibold' : 'text-[#5F6368]'
            }`}
          >
            Empty
          </button>
          <button
            onClick={() => setViewState('loading')}
            className={`px-2.5 py-1 rounded-[8px] font-medium transition ${
              viewState === 'loading' ? 'bg-white text-[#161616] shadow-2xs font-semibold' : 'text-[#5F6368]'
            }`}
          >
            Loading
          </button>
          <button
            onClick={() => setViewState('error')}
            className={`px-2.5 py-1 rounded-[8px] font-medium transition ${
              viewState === 'error' ? 'bg-white text-[#161616] shadow-2xs font-semibold' : 'text-[#5F6368]'
            }`}
          >
            Error
          </button>
        </div>
      </div>

      {/* Loading State */}
      {viewState === 'loading' && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-4 bg-white border border-[#E2E4E8] rounded-[14px] space-y-2 animate-pulse">
              <div className="flex justify-between">
                <div className="h-4 bg-[#E2E4E8] w-28 rounded" />
                <div className="h-4 bg-[#E2E4E8] w-16 rounded" />
              </div>
              <div className="h-5 bg-[#E2E4E8] w-full rounded" />
              <div className="h-3 bg-[#E2E4E8] w-2/3 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {viewState === 'error' && (
        <div className="p-6 bg-[#FDF2F2] border border-[#F8D2D2] rounded-[16px] text-center space-y-3 max-w-md mx-auto">
          <AlertCircle className="w-8 h-8 text-[#A33A3A] mx-auto" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-[#161616]">Could not load local history database</h3>
            <p className="text-xs text-[#5F6368]">SQLite database file was temporarily locked by another daemon process.</p>
          </div>
          <button
            onClick={() => setViewState('normal')}
            className="px-4 py-2 bg-white border border-[#F8D2D2] text-[#A33A3A] text-xs font-semibold rounded-[10px] shadow-2xs hover:bg-[#FDF2F2] transition"
          >
            Retry Database Connection
          </button>
        </div>
      )}

      {/* Empty State */}
      {viewState === 'empty' && (
        <div className="p-12 bg-white border border-[#E2E4E8] rounded-[16px] text-center space-y-3 max-w-md mx-auto">
          <div className="w-12 h-12 rounded-full bg-[#EEF2F6] border border-[#D5E0EA] text-[#5C728A] flex items-center justify-center mx-auto">
            <Clock className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="sori-section-heading">No Transcripts Yet</h3>
            <p className="sori-body-text">
              Hold <kbd className="px-2 py-0.5 bg-[#EEF2F6] border border-[#D5E0EA] rounded text-xs font-mono">Alt + Space</kbd> to dictate into any window.
            </p>
          </div>
        </div>
      )}

      {/* Normal Main State */}
      {viewState === 'normal' && (
        <div className="grid lg:grid-cols-[1fr_360px] gap-6">
          {/* Main Transcripts List */}
          <div className="space-y-4">
            {/* Search and Filters */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-[14px] border border-[#E2E4E8] shadow-2xs">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#858A90]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search transcript text or app..."
                  className="w-full bg-[#F8F8F7] border border-[#E2E4E8] rounded-[10px] pl-8 pr-3 py-1.5 text-xs text-[#161616] focus:outline-none focus:bg-white focus:border-[#BAC7D8]"
                />
              </div>

              <div className="flex items-center gap-2 text-xs">
                <Filter className="w-3.5 h-3.5 text-[#858A90]" />
                <select
                  value={appFilter}
                  onChange={(e) => setAppFilter(e.target.value)}
                  className="bg-[#F8F8F7] border border-[#E2E4E8] rounded-[10px] px-2.5 py-1.5 text-xs text-[#161616] focus:outline-none"
                >
                  <option value="all">All Target Apps</option>
                  <option value="vscode">VS Code</option>
                  <option value="slack">Slack</option>
                  <option value="terminal">Terminal</option>
                </select>
              </div>
            </div>

            {/* List Rows */}
            <div className="space-y-2">
              {filteredHistory.length === 0 ? (
                <div className="p-8 text-center bg-white border border-[#E2E4E8] rounded-[14px] text-xs text-[#858A90]">
                  No matching transcripts found for "{searchQuery}".
                </div>
              ) : (
                filteredHistory.map((item) => {
                  const isSelected = selectedItem?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className={`p-4 rounded-[14px] border transition-all cursor-pointer space-y-2 ${
                        isSelected
                          ? 'bg-[#F3F6FA] border-[#C7D4E0] shadow-2xs'
                          : 'bg-white border-[#E2E4E8] hover:bg-[#F8F8F7]'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono text-[#858A90]">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#161616]">{item.activeApp}</span>
                          <span>•</span>
                          <span>{item.timestamp}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[#1F6B43] font-semibold">{item.latencyMs}ms</span>
                          <span className="bg-white px-2 py-0.5 rounded text-[#5F6368] border border-[#E2E4E8]">
                            {item.modelUsed}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-[#161616] leading-relaxed line-clamp-2">
                        {item.processedText}
                      </p>

                      <div className="flex items-center justify-between pt-1 border-t border-[#E2E4E8]/60 text-[11px]">
                        <span className="text-[#858A90]">Mode: {item.mode}</span>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(item.processedText, item.id);
                            }}
                            className="hover:text-[#161616] text-[#5F6368] flex items-center gap-1 font-medium"
                          >
                            <Copy className="w-3 h-3" />
                            {copiedId === item.id ? 'Copied!' : 'Copy'}
                          </button>
                          {onReinsert && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onReinsert(item.processedText);
                              }}
                              className="hover:text-[#161616] text-[#2E4E6D] flex items-center gap-1 font-medium"
                            >
                              <Play className="w-3 h-3" /> Re-insert
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(item.id);
                            }}
                            className="hover:text-[#A33A3A] text-[#858A90] transition"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Detail Drawer Panel */}
          {selectedItem ? (
            <div className="bg-white border border-[#E2E4E8] rounded-[16px] p-5 space-y-4 shadow-2xs h-fit sticky top-4">
              <div className="flex items-center justify-between border-b border-[#E2E4E8] pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#5C728A]" />
                  <span className="font-semibold text-xs text-[#161616]">Transcript Details</span>
                </div>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="text-[#858A90] hover:text-[#161616]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Audio Waveform Mock */}
              <div className="p-3 bg-[#F8F8F7] border border-[#E2E4E8] rounded-[12px] space-y-1.5">
                <div className="flex justify-between text-[11px] text-[#858A90] font-mono">
                  <span>Captured Local Audio</span>
                  <span>1.4s</span>
                </div>
                <div className="flex items-center justify-between gap-1 h-8 px-1">
                  {[40, 65, 30, 85, 95, 60, 45, 75, 90, 50, 30, 70, 85, 40, 20].map((h, idx) => (
                    <div
                      key={idx}
                      className="w-1.5 bg-[#5C728A] rounded-full"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <div className="text-[11px] font-semibold text-[#858A90] uppercase tracking-wider mb-1">
                    Processed Output Text
                  </div>
                  <div className="p-3 bg-[#F8F8F7] border border-[#E2E4E8] rounded-[10px] text-[#161616] font-mono text-[12.5px] leading-relaxed">
                    {selectedItem.processedText}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-semibold text-[#858A90] uppercase tracking-wider mb-1">
                    Raw ASR Transcript
                  </div>
                  <div className="p-3 bg-[#F8F8F7] border border-[#E2E4E8] rounded-[10px] text-[#5F6368] font-mono text-[12px]">
                    {selectedItem.rawTranscript}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-1">
                  <div className="p-2 bg-[#F8F8F7] border border-[#E2E4E8] rounded-[8px]">
                    <span className="text-[#858A90]">Latency:</span>{' '}
                    <span className="text-[#1F6B43] font-semibold">{selectedItem.latencyMs}ms</span>
                  </div>
                  <div className="p-2 bg-[#F8F8F7] border border-[#E2E4E8] rounded-[8px]">
                    <span className="text-[#858A90]">Model:</span>{' '}
                    <span className="text-[#161616] font-semibold">{selectedItem.modelUsed}</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[#E2E4E8] flex items-center justify-between gap-2">
                <button
                  onClick={() => handleCopy(selectedItem.processedText, selectedItem.id)}
                  className="flex-1 py-2 bg-[#EEF2F6] hover:bg-[#E1E8F0] text-[#24384C] border border-[#D5E0EA] rounded-[10px] text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedId === selectedItem.id ? 'Copied!' : 'Copy Text'}</span>
                </button>
                {onReinsert && (
                  <button
                    onClick={() => onReinsert(selectedItem.processedText)}
                    className="flex-1 py-2 bg-white hover:bg-[#F0F1F2] text-[#2B2F33] border border-[#E2E4E8] rounded-[10px] text-xs font-medium transition flex items-center justify-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Re-insert</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-[#E2E4E8] rounded-[16px] p-6 text-center text-xs text-[#858A90]">
              Select a transcript from the timeline to view audio waveform and raw ASR details.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
