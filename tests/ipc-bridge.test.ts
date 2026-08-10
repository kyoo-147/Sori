import { describe, expect, it } from 'vitest';
import { mapDaemonStatus, mapDoctor, mapRecentTranscripts, mapRouteModelSummary, MockRuntimeClient } from '../src/frontend/ipc-bridge.js';

describe('frontend IPC view-model mapping', () => {
  it('maps both tray and sori-ipc status payloads', () => {
    expect(mapDaemonStatus({ daemon: 'running', activity: 'listening', paused: true, profile: 'Coding', privacy: 'LocalOnly', protocol_version: 1 })).toMatchObject({ daemon: 'running', activity: 'listening', paused: true });
    expect(mapDaemonStatus({ Status: { running: true, daemon_version: '0.1', profile: 'Basic', privacy: 'LocalOnly' } })).toMatchObject({ daemon: 'running', version: '0.1' });
  });

  it('maps diagnostics, config summary, and transcript events', () => {
    expect(mapDoctor({ Doctor: { checks: [{ name: 'pipe', ok: true, detail: 'ok' }, { name: 'model', ok: false, detail: 'missing' }] } })).toEqual({ checks: [{ name: 'pipe', ok: true, detail: 'ok' }, { name: 'model', ok: false, detail: 'missing' }], ok: false });
    expect(mapRouteModelSummary({ ConfigSummary: { profile: 'Coding', privacy: 'LocalOnly', history_enabled: true, route: 'local-first', model: 'parakeet-v2' } })).toMatchObject({ route: 'local-first', model: 'parakeet-v2', historyEnabled: true });
    expect(mapRecentTranscripts({ RecentEvents: { events: [{ id: '1', at: '2026-01-01', kind: 'TranscriptFinal', payload: { text: 'hello', model: 'tiny' } }] } })).toEqual([{ id: '1', at: '2026-01-01', text: 'hello', model: 'tiny', status: 'final' }]);
  });

  it('provides deterministic preview data without sorid', async () => {
    const client = new MockRuntimeClient();
    expect((await client.status()).data.profile).toBe('Coding');
    expect((await client.pause()).data.paused).toBe(true);
    expect((await client.resume()).data.paused).toBe(false);
  });
});
