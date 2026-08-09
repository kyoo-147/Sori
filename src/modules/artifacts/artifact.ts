import { z } from 'zod';

export const artifactKindSchema = z.enum(['audio', 'transcript', 'brief', 'export', 'other']);
export type ArtifactKind = z.infer<typeof artifactKindSchema>;

export const artifactSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  kind: artifactKindSchema,
  title: z.string().min(1),
  uri: z.string().min(1),
  contentType: z.string().optional(),
  sha256: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime()
});

export type Artifact = z.infer<typeof artifactSchema>;

export interface ArtifactRepository {
  create(input: Omit<Artifact, 'id' | 'createdAt'>): Promise<Artifact>;
  listByProject(projectId: string): Promise<Artifact[]>;
  get(id: string): Promise<Artifact | undefined>;
}
