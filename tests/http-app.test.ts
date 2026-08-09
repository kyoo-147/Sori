import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/adapters/http/app.js';
import { createInMemoryRepositories } from '../src/adapters/storage/memory.js';

describe('http app', () => {
  it('creates a project and a run', async () => {
    const app = buildApp(createInMemoryRepositories());

    const projectResponse = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'Sori pilot', description: 'Voice workflow prototype' }
    });
    expect(projectResponse.statusCode).toBe(201);
    const project = projectResponse.json<{ id: string }>();

    const runResponse = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/runs`,
      payload: { goal: 'Create a verified brief' }
    });
    expect(runResponse.statusCode).toBe(201);

    const eventsResponse = await app.inject({ method: 'GET', url: `/runs/${runResponse.json<{ id: string }>().id}/events` });
    expect(eventsResponse.json<Array<{ type: string }>>()).toHaveLength(1);
  });
});
