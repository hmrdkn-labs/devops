import { parse } from 'yaml';
import { z } from 'zod';
import type { AnatomyPage } from './types';

const schema = z.object({
  schema_version: z.literal(1),
  slug: z.string().regex(/^[a-z][a-z0-9-]*$/),
  title: z.string().min(1),
  summary: z.string().min(1),
  module: z.string().min(1),
  order: z.number().int().positive(),
  revision: z.number().int().positive(),
  verified_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  unit_ids: z.array(z.string()).min(1),
  objective_ids: z.array(z.string()).min(1),
  sources: z.array(z.object({ title: z.string().min(1), url: z.url() }).strict()).min(1),
}).strict();
const files = import.meta.glob<string>('../../../content/anatomy/*.yaml', {
  eager: true, query: '?raw', import: 'default',
});
export const anatomyPages: AnatomyPage[] = Object.entries(files).map(([file, text]) => {
  const data = schema.parse(parse(text));
  if (!file.endsWith(`/${data.slug}.yaml`)) throw new Error(`Anatomy slug does not match ${file}`);
  return {
    slug: data.slug, title: data.title, summary: data.summary, module: data.module,
    order: data.order, revision: data.revision, verifiedAt: data.verified_at,
    unitIds: data.unit_ids, objectiveIds: data.objective_ids, sources: data.sources,
  };
}).sort((a, b) => a.order - b.order);
export const anatomyPagesBySlug = new Map(anatomyPages.map((page) => [page.slug, page]));
