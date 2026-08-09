import type { RunRepository } from '../modules/runs/run.js';

export interface RunWorker {
  start(runId: string): Promise<void>;
  complete(runId: string, result: Record<string, unknown>): Promise<void>;
  fail(runId: string, error: Error): Promise<void>;
}

export class LocalRunWorker implements RunWorker {
  constructor(private readonly runs: RunRepository) {}

  async start(runId: string): Promise<void> {
    await this.runs.transition(runId, 'running', 'worker');
  }

  async complete(runId: string, result: Record<string, unknown>): Promise<void> {
    await this.runs.transition(runId, 'completed', 'worker', { result });
  }

  async fail(runId: string, error: Error): Promise<void> {
    await this.runs.transition(runId, 'failed', 'worker', { message: error.message });
  }
}
