import { describe, expect, it } from 'vitest';
import { eventText, mapDoctor, mapRecentEvents, mapStatus, requestShape, RuntimeClient, type IpcTransport } from './runtime-client';

const transport = (responses: Record<string, unknown>): IpcTransport => ({
  source: 'backend',
  request: async (operation) => responses[operation],
});

describe('canonical IPC runtime boundary', () => {
  it('serializes requests using the Rust externally-tagged contract', () => {
    expect(requestShape('status')).toBe('Status');
    expect(requestShape('recent_events', { limit: 3 })).toEqual({ RecentEvents: { limit: 3 } });
  });

  it('maps tagged status and doctor responses without preview defaults', () => {
    expect(mapStatus({ Status: { running: true, activity: 'Idle', paused: false, hotkey: 'Alt+Space', route: { prefer_local: true, allow_cloud: false }, profile: 'Coding', privacy: 'LocalOnly', daemon_version: 'dev' } }).daemon).toBe('running');
    expect(mapDoctor({ Doctor: { checks: [{ name: 'ipc', ok: true, detail: 'bound' }] } })).toEqual([{ name: 'ipc', ok: true, detail: 'bound' }]);
  });

  it('returns an explicit unavailable result when IPC cannot be reached', async () => {
    const client = new RuntimeClient({ request: async () => { throw new Error('offline'); }, source: 'backend' });
    const result = await client.status();
    expect(result.data).toBeNull();
    expect(result.source).toBe('unavailable');
    expect(result.error).toContain('offline');
  });

  it('accepts only typed recent event rows', () => {
    const events = mapRecentEvents({ RecentEvents: { events: [{ id: '1', at: 'now', kind: 'TranscriptFinal', payload: { String: 'hello' } }, { bad: true }] } });
    expect(events).toHaveLength(1);
    expect(eventText(events[0])).toBe('hello');
  });
});
