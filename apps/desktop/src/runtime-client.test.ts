import { describe, expect, it } from 'vitest';
import { RuntimeClient, type IpcTransport } from './runtime-client';

const transport = (response: unknown): IpcTransport => ({
  source: 'backend',
  request: async () => response,
});

describe('RuntimeClient resource persistence', () => {
  it('returns the daemon resource payload after an accepted write', async () => {
    const client = new RuntimeClient(transport({ Resource: { resource: 'vocabulary', value: [{ id: 'daemon-1', term: 'Sori' }] } }));
    const result = await client.setResource('vocabulary', [{ id: 'daemon-1', term: 'Sori' }]);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ id: 'daemon-1', term: 'Sori' }]);
  });

  it('serializes writes for one resource so rapid UI edits cannot reorder SQLite state', async () => {
    const operations: string[] = [];
    let releaseFirst!: () => void;
    const first = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const client = new RuntimeClient({ source: 'backend', request: async (_name, values) => {
      const value = JSON.stringify(values?.value);
      operations.push(value);
      if (operations.length === 1) await first;
      return { Resource: { resource: 'settings', value: values?.value } };
    } });
    const firstWrite = client.setResource('settings', { hotkey: 'Alt+Space' });
    const secondWrite = client.setResource('settings', { hotkey: 'Ctrl+Space' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(operations).toEqual([JSON.stringify({ hotkey: 'Alt+Space' })]);
    releaseFirst();
    await Promise.all([firstWrite, secondWrite]);
    expect(operations).toEqual([JSON.stringify({ hotkey: 'Alt+Space' }), JSON.stringify({ hotkey: 'Ctrl+Space' })]);
  });

  it('turns a daemon Error response into an error result', async () => {
    const client = new RuntimeClient(transport({ Error: { code: 'validation', detail: 'invalid vocabulary' } }));
    const result = await client.setResource('vocabulary', []);
    expect(result.error).toBeTruthy();
    expect(result.source).toBe('unavailable');
  });
});


describe('RuntimeClient profile settings', () => {
  it('persists tray profile changes through canonical config IPC', async () => {
    let operation = ''; let params: Record<string, unknown> | undefined;
    const client = new RuntimeClient({ source: 'backend', request: async (name, values) => { operation = name; params = values; return { Control: { accepted: true, detail: 'profile saved in SQLite' } }; } });
    const result = await client.setConfig('profile.mode', 'Coding');
    expect(operation).toBe('set_config');
    expect(params).toEqual({ key: 'profile.mode', value: 'Coding' });
    expect(result.data.accepted).toBe(true);
    expect(result.error).toBeNull();
  });
});

describe('RuntimeClient transcript deletion', () => {
  it('sends the canonical transcript id and returns accepted control state', async () => {
    let operation = ''; let params: Record<string, unknown> | undefined;
    const client = new RuntimeClient({ source: 'backend', request: async (name, values) => { operation = name; params = values; return { Control: { accepted: true, detail: 'history entry deleted from SQLite' } }; } });
    const result = await client.deleteHistory('entry-1');
    expect(operation).toBe('delete_history');
    expect(params).toEqual({ id: 'entry-1' });
    expect(result.data.accepted).toBe(true);
    expect(result.error).toBeNull();
  });

  it('surfaces daemon deletion errors instead of reporting success', async () => {
    const client = new RuntimeClient(transport({ Error: { code: 'transport', detail: 'history entry not found' } }));
    const result = await client.deleteHistory('missing');
    expect(result.error).toContain('history entry not found');
    expect(result.data.accepted).toBe(false);
  });
});

describe('RuntimeClient model routing', () => {
  it('writes the canonical activeModelId route field', async () => {
    let operation = ''; let params: Record<string, unknown> | undefined;
    const client = new RuntimeClient({ source: 'backend', request: async (name, values) => { operation = name; params = values; return { Resource: { resource: 'route', value: { activeModelId: 'daemon-model' } } }; } });
    const result = await client.setActiveModel('daemon-model');
    expect(operation).toBe('resource_set');
    expect(params).toEqual({ resource: 'route', value: { activeModelId: 'daemon-model' } });
    expect(result.data).toEqual({ activeModelId: 'daemon-model' });
    expect(result.error).toBeNull();
  });
});

describe('RuntimeClient canonical model registry', () => {
  it('maps the Rust Models response to provider-qualified activeModelId keys', async () => {
    let operation = '';
    const client = new RuntimeClient({ source: 'backend', request: async (name) => { operation = name; return { Models: { provider: 'whisper.cpp', available: true, error: null, models: [{ manifest: { id: 'ggml-base.en', display_name: 'Base English', language: 'en', backend: 'whisper.cpp', quantization: null, disk_size_bytes: null, ram_bytes: null, license: { name: 'MIT', url: null, attribution: null } }, status: { model: 'ggml-base.en', installed: true, loaded: false, warm: false, memory_bytes: null, backend: 'whisper.cpp' } }] } }; } });
    const result = await client.models();
    expect(operation).toBe('models');
    expect(result.error).toBeNull();
    expect(result.data[0]).toMatchObject({ id: 'whisper.cpp/ggml-base.en', available: true });
  });

  it('surfaces an unavailable provider without inventing preview models', async () => {
    const client = new RuntimeClient(transport({ Models: { provider: null, available: false, models: [], error: 'whisper.cpp is not configured' } }));
    const result = await client.models();
    expect(result.data).toEqual([]);
    expect(result.source).toBe('unavailable');
    expect(result.error).toContain('not configured');
  });
});

describe('RuntimeClient query errors', () => {
  it('surfaces daemon Error responses for status and does not map them as unavailable success', async () => {
    const client = new RuntimeClient(transport({ Error: { code: 'daemon', detail: 'status unavailable' } }));
    const result = await client.status();
    expect(result.data.daemon).toBe('unavailable');
    expect(result.source).toBe('unavailable');
    expect(result.error).toContain('status unavailable');
  });

  it('surfaces daemon Error responses for history queries', async () => {
    const client = new RuntimeClient(transport({ Error: { code: 'storage', detail: 'SQLite is locked' } }));
    const result = await client.history();
    expect(result.data).toEqual([]);
    expect(result.error).toContain('SQLite is locked');
  });
});

describe('RuntimeClient microphone readiness', () => {
  it('returns daemon readiness without treating signal as verified speech', async () => {
    let operation = '';
    const client = new RuntimeClient({ source: 'backend', request: async (name) => { operation = name; return { AudioReadiness: { state: 'Ready', configured: true, detail: 'device is discoverable', signal: 'UNVERIFIED' } }; } });
    const result = await client.audioReadiness();
    expect(operation).toBe('audio_readiness');
    expect(result.data).toMatchObject({ state: 'Ready', configured: true, signal: 'UNVERIFIED' });
    expect(result.error).toBeNull();
  });

  it('preserves permission guidance from the daemon', async () => {
    const client = new RuntimeClient(transport({ AudioReadiness: { state: 'PermissionRequired', configured: true, detail: 'allow Sori in Windows microphone settings', signal: 'UNVERIFIED' } }));
    const result = await client.audioReadiness();
    expect(result.data.state).toBe('PermissionRequired');
    expect(result.data.detail).toContain('Windows microphone');
  });
});

describe('RuntimeClient fail-closed control responses', () => {
  it('does not treat an accepted-less pause as a successful status refresh', async () => {
    const client = new RuntimeClient(transport({ Control: { accepted: false, detail: 'daemon is stopping' } }));
    const result = await client.pause();
    expect(result.source).toBe('unavailable');
    expect(result.error).toBe('daemon is stopping');
  });

  it('rejects a dictation stop response without transcript text', async () => {
    const client = new RuntimeClient(transport({ Control: { accepted: false, detail: 'no transcript was produced' } }));
    const result = await client.dictationStop();
    expect(result.source).toBe('unavailable');
    expect(result.error).toContain('daemon returned no transcript');
  });
});
