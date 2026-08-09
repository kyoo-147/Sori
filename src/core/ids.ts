import { randomUUID } from 'node:crypto';

export type EntityId = string;

export function newId(prefix: string): EntityId {
  return `${prefix}_${randomUUID()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
