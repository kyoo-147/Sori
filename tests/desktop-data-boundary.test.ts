import { describe, expect, it } from 'vitest';
import { createMockRepositories } from '../apps/desktop/src/data/mock-adapter.js';
import { createApiRepositories } from '../apps/desktop/src/data/api-adapter.js';

describe('desktop data boundary', () => {
  it('supports explicit mock loading, empty, error, and ugly-data modes', async () => {
    const repositories = createMockRepositories();
    expect((await repositories.transcripts.list({ mode: 'loading', delayMs: 0 })).status).toBe('ready');
    expect((await repositories.transcripts.list({ mode: 'empty' })).status).toBe('empty');
    expect((await repositories.transcripts.list({ mode: 'error' })).error?.code).toBe('offline');
    const ugly = await repositories.transcripts.list({ mode: 'ugly-data' });
    expect(ugly.status === 'ready' && ugly.data[0].appName.length).toBeGreaterThan(100);
  });

  it('returns backend failures rather than fabricating API success', async () => {
    const repositories = createApiRepositories(async () => new Response('', { status: 503 }));
    const result = await repositories.status.get();
    expect(result.status).toBe('error');
    expect(result.source).toBe('api');
  });

  it('keeps unsupported IPC operations explicit', async () => {
    const repositories = createMockRepositories();
    const result = await repositories.models.select('missing');
    expect(result.status).toBe('ready');
    const api = createApiRepositories(async () => new Response('{}', { status: 200 }));
    const unsupported = await api.models.select('model');
    expect(unsupported.status).toBe('error');
    expect(unsupported.error?.code).toBe('unsupported');
  });
});
