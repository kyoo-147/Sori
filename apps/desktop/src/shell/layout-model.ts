export type PanelRegion = 'sidebar' | 'main' | 'inspector' | 'bottom';

export interface PanelPlacement {
  panelId: string;
  region: PanelRegion;
  order: number;
  visible: boolean;
  size?: number;
}

export interface WorkspaceLayout {
  id: string;
  name: string;
  panels: PanelPlacement[];
}

export interface ShellLayout {
  version: 1;
  activeWorkspaceId: string;
  workspaces: WorkspaceLayout[];
}

export const defaultShellLayout: ShellLayout = {
  version: 1,
  activeWorkspaceId: 'default',
  workspaces: [
    {
      id: 'default',
      name: 'Default workspace',
      panels: [
        { panelId: 'navigation', region: 'sidebar', order: 0, visible: true, size: 240 },
        { panelId: 'workspace', region: 'main', order: 0, visible: true },
        { panelId: 'inspector', region: 'inspector', order: 0, visible: false, size: 320 },
      ],
    },
  ],
};

const regions = new Set<PanelRegion>(['sidebar', 'main', 'inspector', 'bottom']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]*$/i.test(value) && value.length <= 80;
}

function normalizePanel(value: unknown): PanelPlacement | undefined {
  if (!isRecord(value) || !validId(value.panelId) || !regions.has(value.region as PanelRegion)) return undefined;
  const size = typeof value.size === 'number' && Number.isFinite(value.size)
    ? Math.min(1200, Math.max(120, value.size))
    : undefined;
  return {
    panelId: value.panelId,
    region: value.region as PanelRegion,
    order: typeof value.order === 'number' && Number.isFinite(value.order) ? Math.max(0, Math.floor(value.order)) : 0,
    visible: value.visible !== false,
    ...(size === undefined ? {} : { size }),
  };
}

function normalizeWorkspace(value: unknown): WorkspaceLayout | undefined {
  if (!isRecord(value) || !validId(value.id) || typeof value.name !== 'string') return undefined;
  const panels = Array.isArray(value.panels) ? value.panels.map(normalizePanel).filter((panel): panel is PanelPlacement => Boolean(panel)) : [];
  return { id: value.id, name: value.name.slice(0, 80), panels };
}

export function normalizeShellLayout(value: unknown, fallback: ShellLayout = defaultShellLayout): ShellLayout {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.workspaces)) return cloneLayout(fallback);
  const workspaces = value.workspaces.map(normalizeWorkspace).filter((workspace): workspace is WorkspaceLayout => Boolean(workspace));
  if (workspaces.length === 0) return cloneLayout(fallback);
  const activeWorkspaceId = validId(value.activeWorkspaceId) && workspaces.some(({ id }) => id === value.activeWorkspaceId)
    ? value.activeWorkspaceId
    : workspaces[0].id;
  return { version: 1, activeWorkspaceId, workspaces };
}

function cloneLayout(layout: ShellLayout): ShellLayout {
  return JSON.parse(JSON.stringify(layout)) as ShellLayout;
}

export class WorkspaceLayoutModel {
  private layout: ShellLayout;

  constructor(layout: ShellLayout = defaultShellLayout) {
    this.layout = normalizeShellLayout(layout);
  }

  snapshot(): ShellLayout {
    return cloneLayout(this.layout);
  }

  get activeWorkspace(): WorkspaceLayout {
    return this.getWorkspace(this.layout.activeWorkspaceId);
  }

  setActiveWorkspace(workspaceId: string): boolean {
    if (!this.layout.workspaces.some(({ id }) => id === workspaceId)) return false;
    this.layout.activeWorkspaceId = workspaceId;
    return true;
  }

  addWorkspace(workspace: WorkspaceLayout): void {
    if (!validId(workspace.id)) throw new Error(`Invalid workspace id: ${workspace.id}`);
    if (this.layout.workspaces.some(({ id }) => id === workspace.id)) throw new Error(`Workspace already exists: ${workspace.id}`);
    this.layout.workspaces.push(normalizeWorkspace(workspace)!);
  }

  removeWorkspace(workspaceId: string): boolean {
    if (this.layout.workspaces.length === 1) return false;
    const index = this.layout.workspaces.findIndex(({ id }) => id === workspaceId);
    if (index < 0) return false;
    this.layout.workspaces.splice(index, 1);
    if (this.layout.activeWorkspaceId === workspaceId) this.layout.activeWorkspaceId = this.layout.workspaces[0].id;
    return true;
  }

  setPanelVisibility(panelId: string, visible: boolean, workspaceId = this.layout.activeWorkspaceId): boolean {
    const panel = this.findPanel(panelId, workspaceId);
    if (!panel) return false;
    panel.visible = visible;
    return true;
  }

  setPanelSize(panelId: string, size: number, workspaceId = this.layout.activeWorkspaceId): boolean {
    const panel = this.findPanel(panelId, workspaceId);
    if (!panel || !Number.isFinite(size)) return false;
    panel.size = Math.min(1200, Math.max(120, size));
    return true;
  }

  movePanel(panelId: string, region: PanelRegion, order: number, workspaceId = this.layout.activeWorkspaceId): boolean {
    const panel = this.findPanel(panelId, workspaceId);
    if (!panel || !regions.has(region)) return false;
    panel.region = region;
    panel.order = Math.max(0, Math.floor(order));
    return true;
  }

  registerPanel(panel: PanelPlacement, workspaceId?: string): void {
    if (!validId(panel.panelId) || !regions.has(panel.region)) throw new Error(`Invalid panel: ${panel.panelId}`);
    const targetWorkspace = this.getWorkspace(workspaceId ?? this.layout.activeWorkspaceId);
    if (targetWorkspace.panels.some(({ panelId }) => panelId === panel.panelId)) throw new Error(`Panel already exists: ${panel.panelId}`);
    targetWorkspace.panels.push(normalizePanel(panel)!);
  }

  private getWorkspace(workspaceId: string): WorkspaceLayout {
    const workspace = this.layout.workspaces.find(({ id }) => id === workspaceId);
    if (!workspace) throw new Error(`Unknown workspace: ${workspaceId}`);
    return workspace;
  }

  private findPanel(panelId: string, workspaceId: string): PanelPlacement | undefined {
    return this.getWorkspace(workspaceId).panels.find(({ panelId: candidate }) => candidate === panelId);
  }
}
