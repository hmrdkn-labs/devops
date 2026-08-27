import { z } from 'zod';

const id = z.string().regex(/^[a-z0-9]+(?:[.:/-][a-z0-9]+)*$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const objectiveSchema = z.object({
  id,
  title: z.string().min(3),
  critical: z.boolean().default(false),
});

export const unitMetadataSchema = z.object({
  schema_version: z.literal(1),
  id: id.refine((value) => value.startsWith('fpp:'), 'unit IDs must be namespaced'),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(3),
  summary: z.string().min(20),
  revision: z.number().int().positive(),
  revision_impact: z.enum(['editorial', 'enrichment', 'mastery_affecting']),
  status: z.enum(['draft', 'review', 'published', 'retired']),
  layer: z.enum(['architecture', 'linux', 'networking', 'containers', 'delivery', 'kubernetes', 'operations']),
  estimated_minutes: z.number().int().min(3).max(90),
  aliases: z.array(id).default([]),
  applicable_versions: z.array(z.object({
    product: z.string().min(1),
    range: z.string().min(1),
  })).min(1),
  prerequisites: z.array(id).default([]),
  objectives: z.array(objectiveSchema).min(1),
  certification_mappings: z.array(z.object({
    certification: id,
    domains: z.array(z.string().min(1)).min(1),
    advisory: z.boolean().default(true),
  })).default([]),
  authors: z.array(z.string().min(1)).min(1),
  reviewers: z.array(z.string().min(1)).min(1),
  verified_at: isoDate,
});

export const questionFileSchema = z.object({
  schema_version: z.literal(1),
  unit_id: id,
  revision: z.number().int().positive(),
  questions: z.array(z.object({
    id,
    kind: z.enum(['explain', 'predict', 'objective', 'scenario']),
    prompt: z.string().min(10),
    model_answer: z.string().min(20),
    critical_points: z.array(z.string().min(3)).min(1),
    objective_ids: z.array(id).min(1),
  })).min(1),
});

export const cardFileSchema = z.object({
  schema_version: z.literal(1),
  unit_id: id,
  revision: z.number().int().positive(),
  cards: z.array(z.object({
    id,
    type: z.enum(['short', 'prompt', 'scenario']),
    front: z.string().min(3),
    back: z.string().min(3),
    critical_points: z.array(z.string().min(3)).default([]),
    objective_ids: z.array(id).min(1),
  })).min(1),
});

export const sourceFileSchema = z.object({
  schema_version: z.literal(1),
  unit_id: id,
  sources: z.array(z.object({
    id,
    title: z.string().min(3),
    url: z.url(),
    publisher: z.string().min(2),
    type: z.enum(['documentation', 'standard', 'manual', 'specification', 'reference']),
    verified_at: isoDate,
    note: z.string().min(3),
  })).min(1),
});

export const practiceFileSchema = z.object({
  schema_version: z.literal(1),
  unit_id: id,
  practices: z.array(z.object({
    id,
    title: z.string().min(3),
    mode: z.literal('guided_markdown'),
    prompt: z.string().min(10),
    steps: z.array(z.string().min(3)).min(1),
    success_checks: z.array(z.string().min(3)).min(1),
    safety: z.array(z.string().min(3)).default([]),
  })).default([]),
});

export const pathSchema = z.object({
  schema_version: z.literal(1),
  id,
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(3),
  summary: z.string().min(20),
  revision: z.number().int().positive(),
  status: z.enum(['draft', 'published']),
  units: z.array(z.object({
    unit_id: id,
    weight: z.union([z.literal(1), z.literal(2)]),
  })).min(1),
});

export const certificationRegistrySchema = z.object({
  schema_version: z.literal(1),
  verified_at: isoDate,
  certifications: z.array(z.object({
    id,
    title: z.string().min(2),
    organization: z.string().min(2),
    url: z.url(),
    status: z.enum(['advisory', 'target']),
    sequence: z.number().int().positive(),
  })).min(1),
});

export type UnitMetadata = z.infer<typeof unitMetadataSchema>;
export type QuestionFile = z.infer<typeof questionFileSchema>;
export type CardFile = z.infer<typeof cardFileSchema>;
export type SourceFile = z.infer<typeof sourceFileSchema>;
export type PracticeFile = z.infer<typeof practiceFileSchema>;
export type LearningPath = z.infer<typeof pathSchema>;
export type CertificationRegistry = z.infer<typeof certificationRegistrySchema>;

export interface LearningUnit {
  metadata: UnitMetadata;
  markdown: string;
  questions: QuestionFile['questions'];
  cards: CardFile['cards'];
  sources: SourceFile['sources'];
  practices: PracticeFile['practices'];
}
