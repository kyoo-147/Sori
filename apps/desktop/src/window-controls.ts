import { getCurrentWindow } from '@tauri-apps/api/window';
import type { WindowControlsApi } from './window-actions';

export type { WindowAction, WindowControlsApi } from './window-actions';
export { performWindowAction } from './window-actions';

/** Use Tauri's native window API directly for low-latency shell controls. */
export const tauriWindowControls: WindowControlsApi = {
  minimize: () => getCurrentWindow().minimize(),
  maximize: () => getCurrentWindow().maximize(),
  restore: () => getCurrentWindow().unmaximize(),
  toggleMaximize: () => getCurrentWindow().toggleMaximize(),
  close: () => getCurrentWindow().close(),
  startDragging: () => getCurrentWindow().startDragging(),
};
