import { z } from 'zod';

export const runStateSchema = z.enum([
  'queued',
  'running',
  'waiting_approval',
  'completed',
  'failed',
  'cancelled'
]);
export type RunState = z.infer<typeof runStateSchema>;

export const runSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  goal: z.string().min(1),
  state: runStateSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type Run = z.infer<typeof runSchema>;

export const runEventSchema = z.object({
  id: z.string(),
  runId: z.string(),
  type: z.string().min(1),
  actor: z.string().min(1),
  at: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()).default({})
});

export type RunEvent = z.infer<typeof runEventSchema>;

export interface RunRepository {
  create(input: Pick<Run, 'projectId' | 'goal'>): Promise<Run>;
  get(id: string): Promise<Run | undefined>;
  listByProject(projectId: string): Promise<Run[]>;
  appendEvent(runId: string, input: Omit<RunEvent, 'id' | 'runId' | 'at'>): Promise<RunEvent>;
  transition(runId: string, state: RunState, actor: string, payload?: Record<string, unknown>): Promise<Run>;
  events(runId: string): Promise<RunEvent[]>;
}
