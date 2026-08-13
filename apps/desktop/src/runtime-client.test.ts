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
