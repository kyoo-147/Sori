import { describe, expect, it } from 'vitest';
import { TrayClient, type TrayTransport } from '../src/tray/client.js';
import { TRAY_PROTOCOL_VERSION, type DaemonStatus, type TrayResponse } from '../src/tray/protocol.js';

const running: DaemonStatus = {
  daemon: 'running',
  activity: 'idle',
  paused: false,
  profile: 'basic',
  privacy: 'local_only',
  protocol_version: TRAY_PROTOCOL_VERSION
};

class FakeTransport implements TrayTransport {
  public requests: string[] = [];
  public status = running;

  public async send(request: Parameters<TrayTransport['send']>[0]): Promise<TrayResponse<unknown>> {
    this.requests.push(request.method);
    if (request.method === 'pause' || request.method === 'resume') {
      this.status = { ...this.status, paused: request.method === 'pause' };
    }
    return { id: request.id, version: TRAY_PROTOCOL_VERSION, ok: true, result: this.status };
  }
}

describe('tray shell contract', () => {
  it('loads daemon status and exposes the agreed menu contract', async () => {
    const transport = new FakeTransport();
    const client = new TrayClient(transport);

    expect(await client.refresh()).toEqual(running);
    expect(client.menu().map(({ item }) => item)).toEqual([
      'ready', 'pause', 'profile', 'mic', 'route', 'settings', 'diagnostics', 'quit'
    ]);
    expect(client.menu().find(({ item }) => item === 'pause')?.enabled).toBe(true);
  });

  it('uses idempotent pause/resume commands and replaces local status', async () => {
    const transport = new FakeTransport();
    const client = new TrayClient(transport);

    await client.refresh();
    expect((await client.setPaused(true))?.paused).toBe(true);
    expect((await client.setPaused(false))?.paused).toBe(false);
    expect(transport.requests).toEqual(['status', 'pause', 'resume']);
  });
});
