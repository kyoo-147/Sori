import { newId, nowIso } from '../../core/ids.js';
import type { Artifact, ArtifactRepository } from '../../modules/artifacts/artifact.js';
import type { Project, ProjectRepository } from '../../modules/projects/project.js';
import type { Run, RunEvent, RunRepository, RunState } from '../../modules/runs/run.js';

export class InMemoryProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, Project>();

  async create(input: Pick<Project, 'name' | 'description'>): Promise<Project> {
    const at = nowIso();
    const project: Project = { id: newId('proj'), name: input.name, description: input.description, createdAt: at, updatedAt: at };
    this.projects.set(project.id, project);
    return project;
  }

  async list(): Promise<Project[]> {
    return [...this.projects.values()];
  }

  async get(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }
}

export class InMemoryArtifactRepository implements ArtifactRepository {
  private readonly artifacts = new Map<string, Artifact>();

  async create(input: Omit<Artifact, 'id' | 'createdAt'>): Promise<Artifact> {
    const artifact: Artifact = { ...input, id: newId('art'), createdAt: nowIso() };
    this.artifacts.set(artifact.id, artifact);
    return artifact;
  }

  async listByProject(projectId: string): Promise<Artifact[]> {
    return [...this.artifacts.values()].filter((artifact) => artifact.projectId === projectId);
  }

  async get(id: string): Promise<Artifact | undefined> {
    return this.artifacts.get(id);
  }
}

export class InMemoryRunRepository implements RunRepository {
  private readonly runs = new Map<string, Run>();
  private readonly runEvents = new Map<string, RunEvent[]>();

  async create(input: Pick<Run, 'projectId' | 'goal'>): Promise<Run> {
    const at = nowIso();
    const run: Run = { id: newId('run'), projectId: input.projectId, goal: input.goal, state: 'queued', createdAt: at, updatedAt: at };
    this.runs.set(run.id, run);
    await this.appendEvent(run.id, { type: 'run.queued', actor: 'system', payload: { goal: input.goal } });
    return run;
  }

  async get(id: string): Promise<Run | undefined> {
    return this.runs.get(id);
  }

  async listByProject(projectId: string): Promise<Run[]> {
    return [...this.runs.values()].filter((run) => run.projectId === projectId);
  }

  async appendEvent(runId: string, input: Omit<RunEvent, 'id' | 'runId' | 'at'>): Promise<RunEvent> {
    if (!this.runs.has(runId)) throw new Error(`Run not found: ${runId}`);
    const event: RunEvent = { id: newId('evt'), runId, at: nowIso(), ...input };
    const events = this.runEvents.get(runId) ?? [];
    events.push(event);
    this.runEvents.set(runId, events);
    return event;
  }

  async transition(runId: string, state: RunState, actor: string, payload: Record<string, unknown> = {}): Promise<Run> {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    const updated: Run = { ...run, state, updatedAt: nowIso() };
    this.runs.set(runId, updated);
    await this.appendEvent(runId, { type: `run.${state}`, actor, payload });
    return updated;
  }

  async events(runId: string): Promise<RunEvent[]> {
    return [...(this.runEvents.get(runId) ?? [])];
  }
}

export interface SoriRepositories {
  projects: ProjectRepository;
  artifacts: ArtifactRepository;
  runs: RunRepository;
}

export function createInMemoryRepositories(): SoriRepositories {
  return {
    projects: new InMemoryProjectRepository(),
    artifacts: new InMemoryArtifactRepository(),
    runs: new InMemoryRunRepository()
  };
}
