import { createRequest, isStatus, type DaemonStatus, type TrayMenuItem, type TrayMethod, type TrayResponse } from './protocol.js';

export interface TrayTransport {
  send(request: ReturnType<typeof createRequest>): Promise<TrayResponse<unknown>>;
}

export interface TrayState {
  status: DaemonStatus | null;
  unavailable: boolean;
}

/** Thin tray-side adapter. A newline IPC transport can implement TrayTransport later. */
export class TrayClient {
  private requestNumber = 0;
  private state: TrayState = { status: null, unavailable: false };

  public constructor(private readonly transport: TrayTransport) {}

  public getState(): TrayState {
    return this.state;
  }

  public async refresh(): Promise<DaemonStatus | null> {
    const response = await this.call('status');
    if (!response.ok || !isStatus(response.result)) {
      this.state = { status: null, unavailable: true };
      return null;
    }
    this.state = { status: response.result, unavailable: false };
    return response.result;
  }

  public async setPaused(paused: boolean): Promise<DaemonStatus | null> {
    const response = await this.call(paused ? 'pause' : 'resume');
    if (!response.ok || !isStatus(response.result)) {
      this.state = { ...this.state, unavailable: true };
      return null;
    }
    this.state = { status: response.result, unavailable: false };
    return response.result;
  }

  public menu(status = this.state.status): ReadonlyArray<{ item: TrayMenuItem; enabled: boolean }> {
    const available = status?.daemon === 'running';
    const busy = status === null || status.activity === 'processing';
    return [
      { item: 'ready', enabled: false },
      { item: 'pause', enabled: available && !busy && !status.paused },
      { item: 'profile', enabled: available },
      { item: 'mic', enabled: available },
      { item: 'route', enabled: available },
      { item: 'settings', enabled: true },
      { item: 'diagnostics', enabled: true },
      { item: 'quit', enabled: true }
    ];
  }

  private async call(method: TrayMethod): Promise<TrayResponse<unknown>> {
    const id = `tray_${String(++this.requestNumber).padStart(4, '0')}`;
    return this.transport.send(createRequest(id, method));
  }
}
