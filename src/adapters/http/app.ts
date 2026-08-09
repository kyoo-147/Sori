import cors from '@fastify/cors';
import Fastify from 'fastify';
import { z } from 'zod';
import type { SoriRepositories } from '../storage/memory.js';

export function buildApp(repositories: SoriRepositories) {
  const app = Fastify({ logger: true });

  void app.register(cors, { origin: true });

  app.get('/health', async () => ({ ok: true, service: 'sori' }));

  app.get('/projects', async () => repositories.projects.list());

  app.post('/projects', async (request, reply) => {
    const body = z.object({ name: z.string().min(1), description: z.string().default('') }).parse(request.body);
    const project = await repositories.projects.create(body);
    return reply.code(201).send(project);
  });

  app.get('/projects/:projectId/artifacts', async (request) => {
    const { projectId } = z.object({ projectId: z.string() }).parse(request.params);
    return repositories.artifacts.listByProject(projectId);
  });

  app.post('/projects/:projectId/artifacts', async (request, reply) => {
    const { projectId } = z.object({ projectId: z.string() }).parse(request.params);
    const body = z.object({
      kind: z.enum(['audio', 'transcript', 'brief', 'export', 'other']),
      title: z.string().min(1),
      uri: z.string().min(1),
      contentType: z.string().optional(),
      sha256: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).default({})
    }).parse(request.body);
    const artifact = await repositories.artifacts.create({ ...body, projectId });
    return reply.code(201).send(artifact);
  });

  app.get('/projects/:projectId/runs', async (request) => {
    const { projectId } = z.object({ projectId: z.string() }).parse(request.params);
    return repositories.runs.listByProject(projectId);
  });

  app.post('/projects/:projectId/runs', async (request, reply) => {
    const { projectId } = z.object({ projectId: z.string() }).parse(request.params);
    const body = z.object({ goal: z.string().min(1) }).parse(request.body);
    const run = await repositories.runs.create({ projectId, goal: body.goal });
    return reply.code(201).send(run);
  });

  app.get('/runs/:runId/events', async (request) => {
    const { runId } = z.object({ runId: z.string() }).parse(request.params);
    return repositories.runs.events(runId);
  });

  return app;
}
