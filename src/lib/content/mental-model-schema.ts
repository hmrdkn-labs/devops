import { z } from 'zod';

const id = z.string().regex(/^[a-z0-9]+(?:[.:/-][a-z0-9]+)*$/);
const optionSchema = z.object({
  id,
  text: z.string().min(3),
  rationale: z.string().min(12),
});

/** Portable deterministic teaching fixtures; no provisioning or runtime claims. */
export const mentalModelSchema = z.object({
  schema_version: z.literal(1),
  id,
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(3),
  summary: z.string().min(20),
  revision: z.number().int().positive(),
  unit_ids: z.array(id).min(1),
  objective_ids: z.array(id).min(1),
  estimated_minutes: z.number().int().min(2).max(30),
  verified_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  evidence_mode: z.literal('authored-fixture'),
  scenario: z.string().min(20),
  assumptions: z.array(z.string().min(10)).min(1),
  components: z.array(z.object({
    id,
    name: z.string().min(2),
    location: z.enum(['client', 'control-plane', 'worker-node', 'data-plane', 'cluster-addon', 'external']),
    responsibility: z.string().min(12),
  })).min(2),
  steps: z.array(z.object({
    id,
    title: z.string().min(3),
    actor_id: id,
    layer: z.enum(['intent', 'control', 'execution', 'workload', 'proof']),
    before: z.array(z.string().min(3)).min(1),
    prediction: z.object({
      prompt: z.string().min(10),
      options: z.array(optionSchema).min(2).max(4),
      answer_id: id,
    }),
    action: z.string().min(20),
    after: z.array(z.string().min(3)).min(1),
    active_component_ids: z.array(id).min(1),
    edges: z.array(z.object({ from: id, to: id, label: z.string().min(3) })).default([]),
    proof: z.object({
      command: z.string().min(3),
      expected: z.string().min(12),
      proves: z.string().min(12),
      limitation: z.string().min(12),
    }),
    failure: z.object({
      condition: z.string().min(10),
      consequence: z.string().min(12),
      next_check: z.string().min(10),
    }),
  })).min(3),
  transfer_questions: z.array(z.object({ prompt: z.string().min(10), answer: z.string().min(20) })).min(2),
  sources: z.array(z.object({ title: z.string().min(3), url: z.url() })).min(1),
}).superRefine((model, context) => {
  const components = new Set(model.components.map((component) => component.id));
  const steps = new Set(model.steps.map((step) => step.id));
  const unitIds = new Set(model.unit_ids);
  const objectiveIds = new Set(model.objective_ids);
  if (components.size !== model.components.length) context.addIssue({ code: 'custom', path: ['components'], message: 'duplicate component IDs' });
  if (steps.size !== model.steps.length) context.addIssue({ code: 'custom', path: ['steps'], message: 'duplicate step IDs' });
  if (unitIds.size !== model.unit_ids.length) context.addIssue({ code: 'custom', path: ['unit_ids'], message: 'duplicate canonical unit IDs' });
  if (objectiveIds.size !== model.objective_ids.length) context.addIssue({ code: 'custom', path: ['objective_ids'], message: 'duplicate canonical objective IDs' });
  model.steps.forEach((step, index) => {
    const options = new Set(step.prediction.options.map((option) => option.id));
    if (options.size !== step.prediction.options.length || !options.has(step.prediction.answer_id)) {
      context.addIssue({ code: 'custom', path: ['steps', index, 'prediction'], message: 'prediction requires unique options and a known answer' });
    }
    if (!step.active_component_ids.includes(step.actor_id)) {
      context.addIssue({ code: 'custom', path: ['steps', index, 'active_component_ids'], message: 'step actor must be active in the step' });
    }
    for (const component of [step.actor_id, ...step.active_component_ids, ...step.edges.flatMap((edge) => [edge.from, edge.to])]) {
      if (!components.has(component)) context.addIssue({ code: 'custom', path: ['steps', index], message: `unknown component ${component}` });
    }
  });
});

export type MentalModel = z.infer<typeof mentalModelSchema>;
