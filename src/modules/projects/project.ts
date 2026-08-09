import { z } from 'zod';

export const projectSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().default(''),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type Project = z.infer<typeof projectSchema>;

export interface ProjectRepository {
  create(input: Pick<Project, 'name' | 'description'>): Promise<Project>;
  list(): Promise<Project[]>;
  get(id: string): Promise<Project | undefined>;
}
