export type WindowAction = 'minimize' | 'toggle-maximize' | 'close';

export interface WindowControlsApi {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
}

/** Execute a native window action without coupling UI tests to Tauri's runtime. */
export async function performWindowAction(
  windowApi: WindowControlsApi,
  action: WindowAction,
): Promise<void> {
  if (action === 'minimize') return windowApi.minimize();
  if (action === 'toggle-maximize') return windowApi.toggleMaximize();
  return windowApi.close();
}
