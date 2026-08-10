import { TrayClient, type TrayTransport } from './client.js';
import { TRAY_PROTOCOL_VERSION, type DaemonStatus, type TrayResponse } from './protocol.js';

/** Development-only stand-in until sorid exposes the local IPC adapter. */
class MockDaemonTransport implements TrayTransport {
  private status: DaemonStatus = {
    daemon: 'running',
    activity: 'idle',
    paused: false,
    profile: 'basic',
    privacy: 'local_only',
    protocol_version: TRAY_PROTOCOL_VERSION
  };

  public async send(request: Parameters<TrayTransport['send']>[0]): Promise<TrayResponse<unknown>> {
    if (request.method === 'pause' || request.method === 'resume') {
      this.status = { ...this.status, paused: request.method === 'pause' };
    }
    return { id: request.id, version: TRAY_PROTOCOL_VERSION, ok: true, result: this.status };
  }
}

const client = new TrayClient(new MockDaemonTransport());
const status = await client.refresh();
console.log(JSON.stringify({ status, menu: client.menu() }, null, 2));
