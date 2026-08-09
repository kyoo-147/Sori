import { describe, expect, it } from 'vitest';
import { createInMemoryRepositories } from '../src/adapters/storage/memory.js';
import { LocalRunWorker } from '../src/workers/run-worker.js';

describe('run repository', () => {
  it('records durable events for a run lifecycle', async () => {
    const repositories = createInMemoryRepositories();
    const project = await repositories.projects.create({ name: 'Pilot interviews', description: 'Customer discovery' });
    const run = await repositories.runs.create({ projectId: project.id, goal: 'Generate interview brief' });
    const worker = new LocalRunWorker(repositories.runs);

    await worker.start(run.id);
    await worker.complete(run.id, { briefArtifactId: 'art_example' });

    const updated = await repositories.runs.get(run.id);
    const events = await repositories.runs.events(run.id);

    expect(updated?.state).toBe('completed');
    expect(events.map((event) => event.type)).toEqual(['run.queued', 'run.running', 'run.completed']);
  });
});
