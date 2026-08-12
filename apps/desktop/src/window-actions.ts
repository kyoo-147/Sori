export type WindowAction =
  | 'minimize'
  | 'maximize'
  | 'restore'
  | 'toggle-maximize'
  | 'close'
  | 'drag';

export interface WindowControlsApi {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  restore: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  startDragging: () => Promise<void>;
}

/** Execute a native window action without coupling UI tests to Tauri's runtime. */
export async function performWindowAction(
  windowApi: WindowControlsApi,
  action: WindowAction,
): Promise<void> {
  if (action === 'minimize') return windowApi.minimize();
  if (action === 'maximize') return windowApi.maximize();
  if (action === 'restore') return windowApi.restore();
  if (action === 'toggle-maximize') return windowApi.toggleMaximize();
  if (action === 'drag') return windowApi.startDragging();
  return windowApi.close();
}
