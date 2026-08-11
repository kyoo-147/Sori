import { describe, expect, it } from 'vitest';
import { mapStatus, requestShape } from '../apps/desktop/src/runtime-client.js';

describe('desktop runtime IPC boundary', () => {
  it('creates canonical serde externally tagged requests', () => {
    expect(requestShape('status')).toBe('Status');
    expect(requestShape('doctor')).toBe('Doctor');
    expect(requestShape('recent_events', { limit: 3 })).toEqual({ RecentEvents: { limit: 3 } });
  });

  it('maps backend status and tolerates unavailable fields', () => {
    expect(mapStatus({ Status: { protocol_version: 1, daemon_version: '0.1', running: true, profile: 'Coding', privacy: 'LocalOnly' } })).toMatchObject({ daemon: 'running', version: '0.1', profile: 'Coding' });
    expect(mapStatus({ Status: { running: false } })).toMatchObject({ daemon: 'unavailable', paused: false });
  });
});
