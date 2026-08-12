import { describe, expect, it } from 'vitest';
import { performWindowAction, type WindowAction } from '../apps/desktop/src/window-controls.js';

describe('desktop window controls', () => {
  it.each<WindowAction>(['minimize', 'toggle-maximize', 'close'])('forwards %s to the native window', async (action) => {
    const calls: string[] = [];
    const api = {
      minimize: async () => void calls.push('minimize'),
      toggleMaximize: async () => void calls.push('toggle-maximize'),
      close: async () => void calls.push('close'),
    };

    await performWindowAction(api, action);

    expect(calls).toEqual([action]);
  });
});
