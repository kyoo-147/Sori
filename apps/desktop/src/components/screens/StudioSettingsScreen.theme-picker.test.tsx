// @vitest-environment happy-dom
import React, { act, useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { defaultSettings } from '../../data/initialData';
import { soriThemes, themeLabels } from '../../../design-system/tokens';
import type { RuntimeClient } from '../../runtime-client';
import { StudioSettingsScreen } from './StudioSettingsScreen';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const runtimeClient = {
  configSummary: vi.fn(async () => ({
    data: { profile: 'Coding', privacy: 'LocalOnly', history_enabled: false, history_retention_limit: 7, hotkey: 'Alt + Space', route: { prefer_local: true, allow_cloud: false, prefer_warm_runtime: false, optimize_battery: false } },
    source: 'mock' as const,
    error: null,
  })),
  audioReadiness: vi.fn(async () => ({ data: { state: 'Unavailable', configured: false, detail: 'not configured', signal: 'none' }, source: 'mock' as const, error: null })),
} as unknown as RuntimeClient;

let root: Root | undefined;
let host: HTMLDivElement;
let settingsSetter: ReturnType<typeof vi.fn>;

function renderScreen(theme = 'clear' as typeof defaultSettings.theme) {
  host = document.createElement('div');
  document.body.append(host);
  function Harness() {
    const [settings, setSettingsState] = useState({ ...defaultSettings, theme });
    const setterRef = useRef<React.Dispatch<React.SetStateAction<typeof settings>> | null>(null);
    if (!setterRef.current) setterRef.current = vi.fn((action: React.SetStateAction<typeof settings>) => setSettingsState(action));
    settingsSetter = setterRef.current as ReturnType<typeof vi.fn>;
    return <StudioSettingsScreen settings={settings} setSettings={setterRef.current} runtimeClient={runtimeClient} />;
  }
  act(() => { root = createRoot(host); root.render(<Harness />); });
  return host;
}

function trigger() { return host.querySelector<HTMLButtonElement>('.theme-picker__trigger')!; }
function options() { return [...host.querySelectorAll<HTMLButtonElement>('[role="option"]')]; }
function key(element: Element, keyName: string) { act(() => { element.dispatchEvent(new KeyboardEvent('keydown', { key: keyName, bubbles: true })); }); }
async function settle() { await act(async () => { await Promise.resolve(); }); }

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
});

describe('theme picker rendered behavior', () => {
  it('opens from ArrowDown and ArrowUp, entering the mounted selected option', async () => {
    renderScreen('clear');
    await settle();
    trigger().focus();
    key(trigger(), 'ArrowDown');
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(options().length).toBe(soriThemes.length);
    expect(document.activeElement).toBe(options()[soriThemes.indexOf('clear')]);
    act(() => trigger().click());
    trigger().focus();
    key(trigger(), 'ArrowUp');
    expect(document.activeElement).toBe(options()[soriThemes.indexOf('clear')]);
  });

  it('keeps listbox semantics, selected option, and checkmark mounted', async () => {
    renderScreen('clear');
    await settle();
    act(() => trigger().click());
    const listbox = host.querySelector('[role="listbox"]');
    expect(listbox?.getAttribute('aria-labelledby')).toBe('theme-label');
    expect(options().filter((option) => option.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    expect(options()[soriThemes.indexOf('clear')].classList.contains('is-selected')).toBe(true);
    expect(options()[soriThemes.indexOf('clear')].querySelector('.theme-picker__check')).not.toBeNull();
    expect(options().every((option) => option.tabIndex === (option.getAttribute('aria-selected') === 'true' ? 0 : -1))).toBe(true);
  });

  it('uses ArrowDown/ArrowUp to enter adjacent options and keeps focus on the mounted selection', async () => {
    renderScreen('clear');
    await settle();
    act(() => trigger().click());
    key(options()[0], 'ArrowDown');
    expect(document.activeElement).toBe(options()[1]);
    expect(options()[1].getAttribute('aria-selected')).toBe('true');
    key(options()[1], 'ArrowUp');
    expect(document.activeElement).toBe(options()[0]);
    expect(options()[0].getAttribute('aria-selected')).toBe('true');
  });

  it('closes on Escape and restores trigger focus', async () => {
    renderScreen('clear');
    await settle();
    act(() => trigger().click());
    key(options()[0], 'Escape');
    expect(host.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('applies selection, closes, and restores trigger focus', async () => {
    renderScreen('clear');
    await settle();
    act(() => trigger().click());
    const selected = options()[soriThemes.indexOf('ink')];
    act(() => selected.click());
    expect(trigger().textContent).toContain(themeLabels.ink);
    expect(settingsSetter).toHaveBeenCalledWith(expect.any(Function));
    expect(host.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on outside pointerdown without stealing outside focus', async () => {
    renderScreen('clear');
    await settle();
    const outside = document.createElement('button');
    outside.textContent = 'Outside';
    document.body.append(outside);
    act(() => trigger().click());
    outside.focus();
    act(() => outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))); 
    expect(host.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
