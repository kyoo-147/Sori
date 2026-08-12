import type { PanelRegion } from './layout-model.js';

export type ExtensionContributionKind = 'panel' | 'status' | 'menu';

interface ExtensionContributionBase {
  id: string;
  extensionId: string;
  kind: ExtensionContributionKind;
  title: string;
  description?: string;
}

export interface ExtensionPanelContribution extends ExtensionContributionBase {
  kind: 'panel';
  region: Exclude<PanelRegion, 'main'>;
  order?: number;
}

export interface ExtensionStatusContribution extends ExtensionContributionBase {
  kind: 'status';
  tone?: 'neutral' | 'positive' | 'warning';
}

export interface ExtensionMenuContribution extends ExtensionContributionBase {
  kind: 'menu';
  commandId: string;
}

/**
 * Extension UI is intentionally declarative. Extensions provide metadata only;
 * the host owns rendering, commands, permissions, and all side effects.
 */
export type ExtensionUiContribution =
  | ExtensionPanelContribution
  | ExtensionStatusContribution
  | ExtensionMenuContribution;

const extensionIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const contributionIdPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const panelRegions = new Set<ExtensionPanelContribution['region']>(['sidebar', 'inspector', 'bottom']);

function assertText(value: unknown, field: string, maxLength: number): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    throw new Error(`Invalid extension contribution ${field}`);
  }
}

function assertExtensionId(extensionId: unknown): asserts extensionId is string {
  if (typeof extensionId !== 'string' || !extensionIdPattern.test(extensionId)) throw new Error(`Invalid extension id: ${String(extensionId)}`);
}

function validateContribution(extensionId: string, contribution: ExtensionUiContribution): ExtensionUiContribution {
  assertExtensionId(extensionId);
  if (!contribution || typeof contribution !== 'object') throw new Error('Extension contribution must be an object');
  assertText(contribution.id, 'id', 120);
  assertText(contribution.title, 'title', 100);
  if (!contributionIdPattern.test(contribution.id) || !contribution.id.startsWith(`${extensionId}.`)) {
    throw new Error(`Contribution id must be namespaced by ${extensionId}: ${contribution.id}`);
  }
  if (contribution.extensionId !== extensionId) throw new Error(`Contribution extension id mismatch: ${contribution.id}`);
  if (contribution.description !== undefined) assertText(contribution.description, 'description', 300);

  if (contribution.kind === 'panel') {
    if (!panelRegions.has(contribution.region)) throw new Error(`Invalid extension panel region: ${contribution.region}`);
    if (contribution.order !== undefined && (!Number.isInteger(contribution.order) || contribution.order < 0)) throw new Error(`Invalid extension panel order: ${contribution.id}`);
  } else if (contribution.kind === 'status') {
    if (contribution.tone !== undefined && !['neutral', 'positive', 'warning'].includes(contribution.tone)) throw new Error(`Invalid extension status tone: ${contribution.id}`);
  } else if (contribution.kind === 'menu') {
    assertText(contribution.commandId, 'commandId', 120);
    if (!contribution.commandId.startsWith(`${extensionId}.`)) throw new Error(`Extension menu command must be namespaced: ${contribution.id}`);
  } else {
    throw new Error('Unsupported extension contribution kind');
  }

  // JSON cloning is deliberate: functions, React elements, DOM nodes, and class instances cannot cross this boundary.
  return JSON.parse(JSON.stringify(contribution)) as ExtensionUiContribution;
}

export class ExtensionUiRegistry {
  private readonly contributions = new Map<string, ExtensionUiContribution>();

  register(extensionId: string, contributions: readonly ExtensionUiContribution[]): () => void {
    assertExtensionId(extensionId);
    const validated = contributions.map((contribution) => validateContribution(extensionId, contribution));
    const duplicate = validated.find((contribution) => this.contributions.has(contribution.id));
    if (duplicate) throw new Error(`Extension contribution already registered: ${duplicate.id}`);
    validated.forEach((contribution) => this.contributions.set(contribution.id, Object.freeze(contribution)));
    return () => validated.forEach((contribution) => this.contributions.delete(contribution.id));
  }

  unregisterExtension(extensionId: string): number {
    let removed = 0;
    for (const [id, contribution] of this.contributions) {
      if (contribution.extensionId === extensionId) {
        this.contributions.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  list(kind?: ExtensionContributionKind): ExtensionUiContribution[] {
    return [...this.contributions.values()]
      .filter((contribution) => !kind || contribution.kind === kind)
      .map((contribution) => JSON.parse(JSON.stringify(contribution)) as ExtensionUiContribution);
  }

  get(id: string): ExtensionUiContribution | undefined {
    const contribution = this.contributions.get(id);
    return contribution ? JSON.parse(JSON.stringify(contribution)) as ExtensionUiContribution : undefined;
  }

  clear(): void {
    this.contributions.clear();
  }
}
