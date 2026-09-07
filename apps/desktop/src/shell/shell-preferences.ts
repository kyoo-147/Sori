import type { AppSettings } from '../types.js';
import { defaultShellLayout, normalizeShellLayout, type ShellLayout } from './layout-model.js';

export type ShellTheme = AppSettings['theme'];
export type ShellDensity = 'compact' | 'comfortable' | 'spacious';

export interface ShellPreferences {
  version: 1;
  layout: ShellLayout;
  theme: ShellTheme;
  density: ShellDensity;
}

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SHELL_PREFERENCES_KEY = 'sori.desktop.shell';

export const defaultShellPreferences: ShellPreferences = {
  version: 1,
  layout: defaultShellLayout,
  theme: 'clear',
  density: 'comfortable',
};

const themes = new Set<ShellTheme>(['clear', 'brown', 'green', 'blue']);
const densities = new Set<ShellDensity>(['compact', 'comfortable', 'spacious']);

function browserStorage(): PreferenceStorage | undefined {
  const candidate = globalThis as typeof globalThis & { localStorage?: PreferenceStorage };
  return candidate.localStorage;
}

function clonePreferences(preferences: ShellPreferences): ShellPreferences {
  return {
    version: 1,
    layout: normalizeShellLayout(preferences.layout),
    theme: preferences.theme,
    density: preferences.density,
  };
}

export function normalizeShellPreferences(value: unknown, fallback: ShellPreferences = defaultShellPreferences): ShellPreferences {
  if (!value || typeof value !== 'object') return clonePreferences(fallback);
  const candidate = value as Partial<ShellPreferences>;
  return {
    version: 1,
    layout: normalizeShellLayout(candidate.layout, fallback.layout),
    theme: normalizeShellTheme(candidate.theme, fallback.theme),
    density: densities.has(candidate.density as ShellDensity) ? candidate.density as ShellDensity : fallback.density,
  };
}

/** Accept the pre-Wave 2 names while keeping the persisted shell contract stable. */
export function normalizeShellTheme(value: unknown, fallback: ShellTheme = defaultShellPreferences.theme): ShellTheme {
  if (themes.has(value as ShellTheme)) return value as ShellTheme;
  if (value === 'dark-obsidian' || value === 'clean-light') return 'clear';
  if (value === 'codex-emerald') return 'green';
  return fallback;
}

export function readShellPreferences(
  fallback: ShellPreferences = defaultShellPreferences,
  storage: PreferenceStorage | undefined = browserStorage(),
): ShellPreferences {
  if (!storage) return clonePreferences(fallback);
  try {
    const raw = storage.getItem(SHELL_PREFERENCES_KEY);
    return raw === null ? clonePreferences(fallback) : normalizeShellPreferences(JSON.parse(raw), fallback);
  } catch {
    return clonePreferences(fallback);
  }
}

export function writeShellPreferences(
  preferences: ShellPreferences,
  storage: PreferenceStorage | undefined = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(SHELL_PREFERENCES_KEY, JSON.stringify(normalizeShellPreferences(preferences)));
  } catch {
    // Persistence is best effort in restricted webviews.
  }
}
