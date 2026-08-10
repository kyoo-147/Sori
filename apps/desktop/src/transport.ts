export type DaemonStatus = 'connected' | 'offline';

export interface DaemonInfo {
  status: DaemonStatus;
  version: string;
  endpoint: string;
}

/** Stable UI boundary. Replace this implementation with Tauri invoke/IPC later. */
export interface DaemonTransport {
  getInfo(): Promise<DaemonInfo>;
}

export class MockTransport implements DaemonTransport {
  async getInfo(): Promise<DaemonInfo> {
    return { status: 'offline', version: 'mock', endpoint: 'mock://sorid' };
  }
}

export function createTransport(): DaemonTransport {
  // Native transport is deliberately opt-in until the daemon protocol is wired.
  return new MockTransport();
}
