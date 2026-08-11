import { describe, expect, it } from 'vitest';
import { DesktopIpcTransport, NativeIpcTransport, mapStatus, requestShape } from '../apps/desktop/src/runtime-client.js';
import { responsePayload, type IpcResponse } from '../apps/desktop/src/ipc-contract.js';

describe('desktop runtime IPC boundary', () => {
  it('creates every canonical serde externally tagged request', () => {
    expect(JSON.stringify(requestShape('status'))).toBe('"Status"');
    expect(JSON.stringify(requestShape('doctor'))).toBe('"Doctor"');
    expect(JSON.stringify(requestShape('config_summary'))).toBe('"ConfigSummary"');
    expect(JSON.stringify(requestShape('recent_events', { limit: 3 }))).toBe('{"RecentEvents":{"limit":3}}');
    expect(JSON.stringify(requestShape('pause'))).toBe('"Pause"');
    expect(JSON.stringify(requestShape('resume'))).toBe('"Resume"');
  });

  it('recognizes and unwraps every current Rust response variant', () => {
    const responses: IpcResponse[] = [
      { Status: { protocol_version: 1, daemon_version: 'test', running: true, profile: 'Basic', privacy: 'LocalOnly' } },
      { Doctor: { checks: [] } },
      { ConfigSummary: { profile: 'Basic', privacy: 'LocalOnly', history_enabled: false } },
      { RecentEvents: { events: [] } },
      { Control: { accepted: true, detail: 'accepted' } }
    ];
    expect(responses.map((response) => Object.keys(response)[0])).toEqual(['Status', 'Doctor', 'ConfigSummary', 'RecentEvents', 'Control']);
    expect(responsePayload(responses[4], 'Control')).toEqual({ accepted: true, detail: 'accepted' });
  });

  it('maps backend status and tolerates unavailable fields', () => {
    expect(mapStatus({ Status: { protocol_version: 1, daemon_version: '0.1', running: true, profile: 'Coding', privacy: 'LocalOnly' } })).toMatchObject({ daemon: 'running', version: '0.1', profile: 'Coding' });
    expect(mapStatus({ Status: { running: false } })).toMatchObject({ daemon: 'unavailable', paused: false });
  });

  it('maps canonical requests through the native command', async () => {
    const calls: unknown[] = [];
    const transport = new NativeIpcTransport(async <T>(command: string, args: Record<string, unknown> | undefined) => {
      calls.push([command, args]);
      return { Status: { running: true } } as T;
    }, () => true);
    await transport.request('status');
    expect(calls).toEqual([['sori_ipc', { request: 'Status' }]]);
  });

  it('falls back from native to loopback HTTP', async () => {
    const native = new NativeIpcTransport(async () => { throw new Error('not native'); }, () => true);
    const http = { source: 'backend' as const, request: async () => ({ Status: { running: true } }) };
    const transport = new DesktopIpcTransport(native, http);
    expect(await transport.request('status')).toEqual({ Status: { running: true } });
    expect(transport.source).toBe('backend');
  });
});
