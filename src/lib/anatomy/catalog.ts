import { parse } from 'yaml';
import { z } from 'zod';
import type { AnatomyPage } from './types';

/** High-level → detailed teaching map. Order here is the learner's reading order. */
export const anatomySections = [
  { id: 'big-picture', title: 'Big picture and the API', summary: 'Who owns what, how a declaration becomes stored intent, and where API scope ends.' },
  { id: 'workloads', title: 'Workloads', summary: 'Pods, their lifecycle and health, and the controllers that keep replacing them.' },
  { id: 'scheduling', title: 'Scheduling', summary: 'How one unassigned Pod becomes assigned to a node—and what that does not prove.' },
  { id: 'networking', title: 'Networking', summary: 'How traffic finds changing Pods: Services, endpoints, DNS, ingress, and policy.' },
  { id: 'config-storage', title: 'Configuration and storage', summary: 'How Pods receive settings, secrets, and durable data without baking them into images.' },
  { id: 'security-scaling', title: 'Security and scaling', summary: 'Who may change what, and how the cluster adjusts capacity to load.' },
  { id: 'operations', title: 'Operating and troubleshooting', summary: 'How you observe a running cluster, localize a failure, and restrict what workloads may do.' },
] as const;
export type AnatomySectionId = (typeof anatomySections)[number]['id'];

const schema = z.object({
  schema_version: z.literal(1),
  slug: z.string().regex(/^[a-z][a-z0-9-]*$/),
  title: z.string().min(1),
  summary: z.string().min(1),
  module: z.string().min(1),
  section: z.enum(anatomySections.map((section) => section.id) as [AnatomySectionId, ...AnatomySectionId[]]),
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
    slug: data.slug, title: data.title, summary: data.summary, module: data.module, section: data.section,
    order: data.order, revision: data.revision, verifiedAt: data.verified_at,
    unitIds: data.unit_ids, objectiveIds: data.objective_ids, sources: data.sources,
  };
}).sort((a, b) => anatomySections.findIndex((section) => section.id === a.section) - anatomySections.findIndex((section) => section.id === b.section) || a.order - b.order);
export const anatomyPagesBySlug = new Map(anatomyPages.map((page) => [page.slug, page]));
