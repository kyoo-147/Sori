import React from 'react';

export const SystemDesignScreen: React.FC = () => {
  const colorSwatches = [
    { name: 'Canvas White', hex: '#FFFFFF', class: 'bg-white text-[#161616] border border-[#E2E4E8]' },
    { name: 'Sidebar Light', hex: '#F9F9F9', class: 'bg-[#F9F9F9] text-[#161616] border border-[#E2E4E8]' },
    { name: 'Soft Surface', hex: '#F8F8F8', class: 'bg-[#F8F8F8] text-[#161616] border border-[#E2E4E8]' },
    { name: 'Muted Neutral', hex: '#F0F1F2', class: 'bg-[#F0F1F2] text-[#161616] border border-[#E2E4E8]' },
    { name: 'Accent Soft Blue-Gray', hex: '#EEF2F6', class: 'bg-[#EEF2F6] text-[#24384C] border border-[#D5E0EA]' },
    { name: 'Border Standard', hex: '#E2E4E8', class: 'bg-[#E2E4E8] text-[#161616]' },
    { name: 'Border Soft Accent', hex: '#D5E0EA', class: 'bg-[#D5E0EA] text-[#24384C]' },
    { name: 'Deep Text Charcoal', hex: '#161616', class: 'bg-[#161616] text-white' },
  ];

  return (
    <div className="sori-screen sori-page-layout">
      <header>
        <h1 className="sori-page-heading">Design system</h1>
        <p className="sori-body-text mt-1">Review Sori’s shared colors, surfaces, and controls.</p>
      </header>

      {/* Color Palette Tokens */}
      <div className="bg-white border border-[#E2E4E8] rounded-[16px] p-6 shadow-2xs space-y-4">
        <h2 className="sori-section-heading">Colors</h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {colorSwatches.map((swatch, i) => (
            <div key={i} className="p-3 rounded-[12px] border border-[#E2E4E8] space-y-2 bg-[#F8F8F7]">
              <div className={`h-12 rounded-[8px] ${swatch.class} shadow-2xs flex items-center justify-center font-mono text-xs font-semibold`}>
                {swatch.hex}
              </div>
              <div>
                <div className="text-xs font-semibold text-[#161616]">{swatch.name}</div>
                <div className="text-[10px] text-[#858A90] font-mono">{swatch.hex}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Glass Interface Specimens */}
      <div className="bg-white border border-[#E2E4E8] rounded-[16px] p-6 shadow-2xs space-y-4">
        <h2 className="sori-section-heading">Elevated surfaces</h2>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Glass Card Specimen */}
          <div className="sori-glass p-5 rounded-[16px] space-y-3 border border-[#E2E4E8]">
            <div className="flex items-center justify-between text-xs font-semibold text-[#161616]">
              <span>Glass container</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-[6px] bg-[#EEF2F6] border border-[#D5E0EA] text-[#24384C]">
                blur(16px)
              </span>
            </div>
            <p className="text-xs text-[#5F6368] leading-relaxed">
              A translucent surface for temporary, elevated content.
            </p>
            <div className="flex items-center gap-2 pt-2">
              <button className="px-3.5 py-1.5 rounded-[10px] bg-[#EEF2F6] hover:bg-[#E1E8F0] text-[#24384C] border border-[#D5E0EA] text-xs font-semibold transition shadow-2xs">
                Accent action
              </button>
              <button className="px-3.5 py-1.5 rounded-[10px] bg-white hover:bg-[#F0F1F2] text-[#2B2F33] text-xs font-medium border border-[#E2E4E8] transition shadow-2xs">
                Neutral action
              </button>
            </div>
          </div>

          {/* Glass Overlay Popover Specimen */}
          <div className="sori-overlay p-5 rounded-[16px] space-y-3 border border-[#D0D4DC]">
            <div className="flex items-center justify-between text-xs font-semibold text-[#161616]">
              <span>Quick controls overlay</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-[6px] bg-[#EEF2F6] text-[#24384C] border border-[#D5E0EA]">
                blur(24px)
              </span>
            </div>
            <p className="text-xs text-[#5F6368] leading-relaxed">
              An in-app panel for runtime controls, model status, and hotkey state.
            </p>
            <div className="p-3 bg-white rounded-[10px] border border-[#E2E4E8] text-xs font-mono text-[#161616]">
              Active context: elevated surface
            </div>
          </div>
        </div>
      </div>

      {/* Button Variants Specimen */}
      <div className="bg-white border border-[#E2E4E8] rounded-[16px] p-6 shadow-2xs space-y-4">
        <h2 className="sori-section-heading">Buttons</h2>

        <div className="flex flex-wrap items-center gap-3">
          <button className="px-4 py-2 rounded-[10px] bg-[#EEF2F6] hover:bg-[#E1E8F0] text-[#24384C] border border-[#D5E0EA] font-semibold text-xs shadow-2xs transition">
            Accent
          </button>

          <button className="px-4 py-2 rounded-[10px] bg-[#F0F1F2] hover:bg-[#E5E7EB] text-[#2B2F33] border border-[#E2E4E8] font-medium text-xs transition">
            Secondary
          </button>

          <button className="px-4 py-2 rounded-[10px] sori-glass hover:bg-white text-[#161616] border border-[#E2E4E8] font-medium text-xs shadow-2xs transition">
            Glass
          </button>

          <button className="px-4 py-2 rounded-[10px] bg-white hover:bg-[#F8F8F7] text-[#161616] border border-[#E2E4E8] font-medium text-xs transition">
            Outline
          </button>

          <button className="px-4 py-2 rounded-[10px] bg-[#FDF2F2] hover:bg-[#FCE8E8] text-[#A33A3A] border border-[#F8D2D2] font-medium text-xs transition">
            Danger
          </button>
        </div>
      </div>
    </div>
  );
};
