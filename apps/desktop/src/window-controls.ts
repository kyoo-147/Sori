import { invoke } from '@tauri-apps/api/core';
import type { WindowControlsApi } from './window-actions';

export type { WindowAction, WindowControlsApi } from './window-actions';
export { performWindowAction } from './window-actions';

/** The Rust command names are the authoritative native window boundary. */
export const tauriWindowControls: WindowControlsApi = {
  minimize: () => invoke<void>('window_minimize'),
  maximize: () => invoke<void>('window_maximize'),
  restore: () => invoke<void>('window_restore'),
  toggleMaximize: () => invoke<void>('window_toggle_maximize'),
  close: () => invoke<void>('window_close'),
  startDragging: () => invoke<void>('window_start_dragging'),
};
