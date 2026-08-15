import { describe, expect, it } from 'vitest';
import { DesktopIpcTransport, NativeIpcTransport, RuntimeClient, mapHistory, mapStatus, requestShape } from '../apps/desktop/src/runtime-client.js';
import { responsePayload, type IpcResponse } from '../apps/desktop/src/ipc-contract.js';
import { readBenchmarkFixture } from '../apps/desktop/src/benchmark-fixture.js';

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
      { Status: { protocol_version: 1, daemon_version: 'test', running: true, activity: 'Idle', paused: false, hotkey: 'Alt+Space', route: { prefer_local: true, allow_cloud: true, prefer_warm_runtime: false, optimize_battery: false }, profile: 'Basic', privacy: 'LocalOnly' } },
      { Doctor: { status: { protocol_version: 1, daemon_version: 'test', running: true, activity: 'Paused', paused: true, hotkey: 'Alt+Space', route: { prefer_local: true, allow_cloud: true, prefer_warm_runtime: false, optimize_battery: false }, profile: 'Basic', privacy: 'LocalOnly' }, checks: [] } },
      { ConfigSummary: { profile: 'Basic', privacy: 'LocalOnly', history_enabled: false, history_retention_limit: 20, hotkey: 'Alt+Space', route: { prefer_local: true, allow_cloud: true, prefer_warm_runtime: false, optimize_battery: false } } },
      { RecentEvents: { events: [] } },
      { Control: { accepted: true, detail: 'accepted' } }
    ];
    expect(responses.map((response) => Object.keys(response)[0])).toEqual(['Status', 'Doctor', 'ConfigSummary', 'RecentEvents', 'Control']);
    expect(responsePayload(responses[4], 'Control')).toEqual({ accepted: true, detail: 'accepted' });
  });

  it('maps persisted history details without inventing audio or latency', () => {
    expect(mapHistory({ RecentHistory: { entries: [{ id: 'h1', at: '2026-08-12T00:00:00Z', active_app: null, transcript: { text: 'hello', segments: [] }, intent: null, route: null, inserted_text: null }] } })).toEqual([{ id: 'h1', at: '2026-08-12T00:00:00Z', active_app: null, transcript: { text: 'hello', segments: [] }, intent: null, route: null, inserted_text: null }]);
  });

  it('maps paused activity without claiming dictation activity', () => {
    expect(mapStatus({ Status: { protocol_version: 1, daemon_version: '0.1', running: true, activity: 'Paused', paused: true, hotkey: 'Alt+Space', route: { prefer_local: true, allow_cloud: true, prefer_warm_runtime: false, optimize_battery: false }, profile: 'Coding', privacy: 'LocalOnly' } })).toMatchObject({ daemon: 'running', activity: 'paused', paused: true, hotkey: 'Alt+Space' });
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
    expect(calls).toEqual([['sori_ipc', { request: 'Status', request_id: 'ui-1' }]]);
  });

  it('does not hide a native daemon error behind a sequential HTTP retry', async () => {
    const native = new NativeIpcTransport(async () => { throw new Error('daemon unavailable'); }, () => true);
    const http = { source: 'backend' as const, request: async () => ({ Status: { running: true } }) };
    const transport = new DesktopIpcTransport(native, http);
    await expect(transport.request('status')).rejects.toThrow('daemon unavailable');
  });

  it('uses HTTP directly when the native runtime is absent', async () => {
    const native = new NativeIpcTransport(async <T>() => ({ Status: { running: true } } as T), () => false);
    const http = { source: 'backend' as const, request: async () => ({ Status: { running: true } }) };
    const transport = new DesktopIpcTransport(native, http);
    expect(await transport.request('status')).toEqual({ Status: { running: true } });
    expect(transport.source).toBe('backend');
  });
  it('routes destructive privacy mutations through canonical IPC and preserves errors', async () => {
    const requests: Array<{ operation: string; params?: Record<string, unknown> }> = [];
    const transport = { source: 'backend' as const, request: async (operation: string, params?: Record<string, unknown>) => { requests.push({ operation, params }); if (operation === 'purge_history') return { Control: { accepted: true, detail: 'history purged from SQLite' } }; return { Control: { accepted: false, detail: 'history store unavailable' } }; } };
    const client = new RuntimeClient(transport);
    expect((await client.purgeHistory()).data.accepted).toBe(true);
    expect((await client.setConfig('history.enabled', false)).data.accepted).toBe(false);
    expect(requests).toEqual([{ operation: 'purge_history' }, { operation: 'set_config', params: { key: 'history.enabled', value: false } }]);
  });
});
  it('exposes canonical model registry and route mutations', async () => {
    const requests: Array<{ operation: string; params?: Record<string, unknown> }> = [];
    const transport = { source: 'backend' as const, request: async (operation: string, params?: Record<string, unknown>) => { requests.push({ operation, params }); return { Resource: { resource: String(params?.resource), value: params?.resource === 'models' ? [] : { activeModelId: 'local-whisper', policy: 'LocalFirst', fallbackModelIds: [] } } }; } };
    const client = new RuntimeClient(transport);
    await client.models();
    await client.setActiveModel('local-whisper');
    await client.setRoutePolicy('NeverCloud');
    expect(requests).toEqual([
      { operation: 'models', params: undefined },
      { operation: 'resource_set', params: { resource: 'route', value: { activeModelId: 'local-whisper' } } },
      { operation: 'set_config', params: { key: 'route.policy', value: 'NeverCloud' } },
    ]);
  });

describe('desktop benchmark input contract', () => {
  it('accepts only a real mono PCM16 WAV and preserves its samples', async () => {
    const bytes = new Uint8Array(48);
    const view = new DataView(bytes.buffer);
    bytes.set([...Buffer.from('RIFF'), 40, 0, 0, 0, ...Buffer.from('WAVE')]);
    bytes.set([...Buffer.from('fmt '), 16, 0, 0, 0], 12);
    view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16_000, true); view.setUint16(34, 16, true);
    bytes.set([...Buffer.from('data'), 4, 0, 0, 0], 36); view.setInt16(44, 16_384, true); view.setInt16(46, -16_384, true);
    const fixture = await readBenchmarkFixture({ name: 'sample.wav', arrayBuffer: async () => bytes.buffer }, 'hello');
    expect(fixture.audio[0].format).toMatchObject({ sample_rate_hz: 16_000, channels: 1, sample_format: 'F32' });
    expect(fixture.audio[0].samples).toEqual([16_384 / 32_767, -16_384 / 32_767]);
    expect(fixture.reference).toBe('hello');
  });

  it('applies a benchmark recommendation from the Resource route response', async () => {
    const requests: Array<{ operation: string; params?: Record<string, unknown> }> = [];
    const transport = { source: 'backend' as const, request: async (operation: string, params?: Record<string, unknown>) => { requests.push({ operation, params }); return { Resource: { resource: 'route', value: { activeModelId: 'whisper.cpp/ready', provider: 'whisper.cpp', policy: 'LocalFirst', fallbackModelIds: [] } } }; } };
    const client = new RuntimeClient(transport);
    const result = await client.applyBenchmarkRecommendation();
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ activeModelId: 'whisper.cpp/ready', provider: 'whisper.cpp' });
    expect(requests).toEqual([{ operation: 'apply_benchmark_recommendation', params: undefined }]);
  });

  it('routes a real fixture and reference through canonical benchmark IPC', async () => {
    const requests: Array<{ operation: string; params?: Record<string, unknown> }> = [];
    const transport = { source: 'backend' as const, request: async (operation: string, params?: Record<string, unknown>) => { requests.push({ operation, params }); return { Benchmark: { model: 'local-whisper' } }; } };
    const client = new RuntimeClient(transport);
    await client.runBenchmark('local-whisper', [{ captured_at: 'now', format: { sample_rate_hz: 16_000, channels: 1, sample_format: 'F32' }, samples: [0, 0.5] }], 'hello', 3);
    expect(requests).toEqual([{ operation: 'run_benchmark', params: { model: 'local-whisper', audio: [{ captured_at: 'now', format: { sample_rate_hz: 16_000, channels: 1, sample_format: 'F32' }, samples: [0, 0.5] }], reference: 'hello', iterations: 3 } }]);
    expect(JSON.stringify(requestShape('run_benchmark', requests[0].params))).toContain('"RunBenchmark"');
  });
});
