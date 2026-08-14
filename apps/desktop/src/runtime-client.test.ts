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

  it('turns a daemon Error response into an error result', async () => {
    const client = new RuntimeClient(transport({ Error: { code: 'validation', detail: 'invalid vocabulary' } }));
    const result = await client.setResource('vocabulary', []);
    expect(result.error).toBeTruthy();
    expect(result.source).toBe('unavailable');
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
