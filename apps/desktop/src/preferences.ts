import { AppSettings } from './types';

const PREFIX = 'sori.desktop.';

export function readPreference<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(`${PREFIX}${key}`);
    return value === null ? fallback : (JSON.parse(value) as T);
  } catch {
    return fallback;
  }
}

export function writePreference<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // Local persistence is best effort (for example, in restricted webviews).
  }
}

export function readSettings(fallback: AppSettings): AppSettings {
  const saved = readPreference<Partial<AppSettings>>('settings', {});
  return { ...fallback, ...saved };
}
