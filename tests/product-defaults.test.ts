import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const soridConfig = readFileSync('crates/sorid/src/config.rs', 'utf8');
const desktopInitialData = readFileSync('apps/desktop/src/data/initialData.ts', 'utf8');

describe('product defaults shared across frontend and daemon', () => {
  it('keeps the default hold-to-speak hotkey aligned', () => {
    expect(desktopInitialData).toContain("hotkey: 'Alt + Space'");
    expect(soridConfig).toContain('binding: "Alt+Space"');
  });

  it('does not enable cloud fallback before BYOK is configured', () => {
    expect(desktopInitialData).toContain("id: 'groq-whisper-cloud'");
    expect(desktopInitialData).toContain("recommendedFor: 'Optional BYOK/cloud fallback'");
    expect(desktopInitialData).toContain("condition: 'fallback_chain && byok_configured == true'");

    const cloudModelBlock = desktopInitialData.match(/id: 'groq-whisper-cloud',[\s\S]*?latencyMs: 95,/);
    expect(cloudModelBlock?.[0]).toContain('isInstalled: false');
    expect(cloudModelBlock?.[0]).toContain('isWarm: false');

    const cloudRouteBlock = desktopInitialData.match(/condition: 'fallback_chain && byok_configured == true',[\s\S]*?priority: 4,/);
    expect(cloudRouteBlock?.[0]).toContain('enabled: false');
  });
});
