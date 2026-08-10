import React, { useState } from 'react';
import { DictionaryTerm, Snippet } from '../../types';
import {
  BookOpen,
  Plus,
  Trash2,
  Code,
  Sparkles,
  Info,
  X,
  CornerDownLeft,
  Search,
  Filter,
  FileSpreadsheet,
  CheckCircle2,
} from 'lucide-react';

interface DictionarySnippetsScreenProps {
  dictionary: DictionaryTerm[];
  setDictionary: React.Dispatch<React.SetStateAction<DictionaryTerm[]>>;
  snippets: Snippet[];
  setSnippets: React.Dispatch<React.SetStateAction<Snippet[]>>;
}

export const DictionarySnippetsScreen: React.FC<DictionarySnippetsScreenProps> = ({
  dictionary,
  setDictionary,
  snippets,
  setSnippets,
}) => {
  const [activeTab, setActiveTab] = useState<'vocabulary' | 'snippets'>('vocabulary');
  const [inputTerm, setInputTerm] = useState<string>('');
  const [inputPronunciation, setInputPronunciation] = useState<string>('');
  const [inputCategory, setInputCategory] = useState<'code' | 'name' | 'acronym' | 'vietnamese' | 'custom'>('custom');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isImportOpen, setIsImportOpen] = useState<boolean>(false);
  const [csvText, setCsvText] = useState<string>('');
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);

  const handleAddTerm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputTerm.trim()) return;
    const newTerm: DictionaryTerm = {
      id: `vocab-${Date.now()}`,
      term: inputTerm.trim(),
      pronunciation: inputPronunciation.trim() || undefined,
      category: inputCategory,
    };
    setDictionary((prev) => [newTerm, ...prev]);
    setInputTerm('');
    setInputPronunciation('');
  };

  const handleImportCsv = () => {
    if (!csvText.trim()) return;
    const lines = csvText.split('\n');
    const imported: DictionaryTerm[] = [];
    lines.forEach((line) => {
      const parts = line.split(',');
      if (parts[0] && parts[0].trim()) {
        imported.push({
          id: `csv-${Date.now()}-${Math.random()}`,
          term: parts[0].trim(),
          pronunciation: parts[1] ? parts[1].trim() : undefined,
          category: 'custom',
        });
      }
    });
    setDictionary((prev) => [...imported, ...prev]);
    setCsvText('');
    setIsImportOpen(false);
    setImportSuccessMessage(`Successfully imported ${imported.length} vocabulary terms.`);
    setTimeout(() => setImportSuccessMessage(null), 3000);
  };

  const removeWord = (id: string) => {
    setDictionary((prev) => prev.filter((item) => item.id !== id));
  };

  const filteredDictionary = dictionary.filter((item) => {
    const matchesSearch = item.term.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = categoryFilter === 'all' || item.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6 text-[#161616]">
      {/* Header & Tabs */}
      <div className="flex items-center justify-between border-b border-[#E2E4E8] pb-3">
        <div>
          <h1 className="sori-page-heading">Vocabulary</h1>
          <p className="sori-body-text mt-0.5">
            Teach Sori company names, domain terminology, casing rules, and voice macro expansions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('vocabulary')}
            className={`px-3 py-1.5 rounded-[10px] text-xs font-semibold transition ${
              activeTab === 'vocabulary'
                ? 'bg-[#EEF2F6] text-[#24384C] border border-[#D5E0EA] shadow-2xs'
                : 'text-[#5F6368] hover:text-[#161616]'
            }`}
          >
            Custom Vocabulary ({dictionary.length})
          </button>
          <button
            onClick={() => setActiveTab('snippets')}
            className={`px-3 py-1.5 rounded-[10px] text-xs font-semibold transition ${
              activeTab === 'snippets'
                ? 'bg-[#EEF2F6] text-[#24384C] border border-[#D5E0EA] shadow-2xs'
                : 'text-[#5F6368] hover:text-[#161616]'
            }`}
          >
            Voice Snippets ({snippets.length})
          </button>
        </div>
      </div>

      {importSuccessMessage && (
        <div className="p-3 bg-[#EAF6EE] border border-[#CBE5D4] rounded-[12px] text-xs font-medium text-[#1F6B43] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{importSuccessMessage}</span>
        </div>
      )}

      {activeTab === 'vocabulary' ? (
        <div className="space-y-6">
          {/* Add Term Form */}
          <div className="bg-white border border-[#E2E4E8] rounded-[16px] p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#161616] flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-[#5C728A]" />
                Add New Vocabulary Term
              </span>

              <button
                onClick={() => setIsImportOpen(!isImportOpen)}
                className="text-xs font-medium text-[#2E4E6D] hover:underline flex items-center gap-1"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Paste terms</span>
              </button>
            </div>

            {/* CSV Import Panel */}
            {isImportOpen && (
              <div className="p-4 bg-[#F8F8F7] border border-[#E2E4E8] rounded-[12px] space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#161616]">
                  <FileSpreadsheet className="w-4 h-4 text-[#5C728A]" />
                  <span>Paste CSV Data (term, pronunciation)</span>
                </div>
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  rows={3}
                  placeholder="Sori, so-ree&#10;PostgreSQL, post-gres-q-l&#10;whisper.cpp, whisper-dot-c-p-p"
                  className="w-full bg-white border border-[#E2E4E8] rounded-[10px] p-3 text-xs font-mono focus:outline-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsImportOpen(false)}
                    className="px-3 py-1.5 text-xs text-[#5F6368] hover:text-[#161616]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImportCsv}
                    className="px-4 py-1.5 bg-[#EEF2F6] hover:bg-[#E1E8F0] text-[#24384C] border border-[#D5E0EA] rounded-[8px] text-xs font-semibold"
                  >
                    Import Terms
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleAddTerm} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                type="text"
                value={inputTerm}
                onChange={(e) => setInputTerm(e.target.value)}
                placeholder="Term (e.g. Anthropic, PhoWhisper)"
                className="bg-[#F8F8F7] border border-[#E2E4E8] rounded-[10px] px-3 py-2 text-xs text-[#161616] focus:outline-none focus:bg-white focus:border-[#BAC7D8]"
              />

              <input
                type="text"
                value={inputPronunciation}
                onChange={(e) => setInputPronunciation(e.target.value)}
                placeholder="Pronunciation hint (optional)"
                className="bg-[#F8F8F7] border border-[#E2E4E8] rounded-[10px] px-3 py-2 text-xs text-[#161616] focus:outline-none focus:bg-white focus:border-[#BAC7D8]"
              />

              <select
                value={inputCategory}
                onChange={(e) => setInputCategory(e.target.value as any)}
                className="bg-[#F8F8F7] border border-[#E2E4E8] rounded-[10px] px-3 py-2 text-xs text-[#161616] focus:outline-none"
              >
                <option value="custom">Custom Term</option>
                <option value="code">Code Identifier</option>
                <option value="name">Brand / Name</option>
                <option value="acronym">Acronym</option>
                <option value="vietnamese">Vietnamese Word</option>
              </select>

              <button
                type="submit"
                className="px-4 py-2 bg-[#EEF2F6] hover:bg-[#E1E8F0] text-[#24384C] border border-[#D5E0EA] rounded-[10px] text-xs font-semibold shadow-2xs flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Term</span>
              </button>
            </form>
          </div>

          {/* Search & Category Filter */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-[14px] border border-[#E2E4E8]">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#858A90]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter vocabulary terms..."
                className="w-full bg-[#F8F8F7] border border-[#E2E4E8] rounded-[10px] pl-8 pr-3 py-1.5 text-xs focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 text-xs">
              <Filter className="w-3.5 h-3.5 text-[#858A90]" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-[#F8F8F7] border border-[#E2E4E8] rounded-[10px] px-2.5 py-1.5 text-xs text-[#161616]"
              >
                <option value="all">All Categories</option>
                <option value="code">Code</option>
                <option value="name">Names</option>
                <option value="acronym">Acronyms</option>
                <option value="vietnamese">Vietnamese</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>

          {/* Terms Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {filteredDictionary.map((item) => (
              <div
                key={item.id}
                className="p-3.5 bg-white border border-[#E2E4E8] rounded-[12px] flex items-center justify-between group shadow-2xs hover:border-[#BAC7D8] transition"
              >
                <div className="space-y-0.5 truncate">
                  <div className="text-xs font-semibold text-[#161616] truncate">{item.term}</div>
                  <div className="text-[11px] text-[#858A90] font-mono flex items-center gap-2">
                    <span className="capitalize">{item.category}</span>
                    {item.pronunciation && <span>• [{item.pronunciation}]</span>}
                  </div>
                </div>

                <button
                  onClick={() => removeWord(item.id)}
                  className="text-[#858A90] hover:text-[#A33A3A] opacity-60 group-hover:opacity-100 transition p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Snippets View */
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {snippets.map((snip) => (
              <div
                key={snip.id}
                className="p-5 bg-white border border-[#E2E4E8] rounded-[16px] space-y-2.5 shadow-2xs"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#161616] font-mono bg-[#EEF2F6] px-2.5 py-1 rounded-[8px] border border-[#D5E0EA]">
                    "{snip.triggerPhrase}"
                  </span>
                  <button
                    onClick={() => setSnippets((prev) => prev.filter((s) => s.id !== snip.id))}
                    className="p-1 text-[#858A90] hover:text-[#A33A3A] transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <pre className="p-3 bg-[#F8F8F7] rounded-[10px] text-[11.5px] font-mono text-[#161616] border border-[#E2E4E8] overflow-x-auto whitespace-pre-wrap">
                  {snip.expansion}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

