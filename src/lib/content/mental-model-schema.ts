import { z } from 'zod';

const id = z.string().regex(/^[a-z0-9]+(?:[.:/-][a-z0-9]+)*$/);
const optionSchema = z.object({
  id,
  text: z.string().min(3),
  rationale: z.string().min(12),
});
const componentLocationSchema = z.enum(['client', 'control-plane', 'worker-node', 'data-plane', 'cluster-addon', 'external']);

const guidedChoiceSchema = z.object({
  id,
  text: z.string().min(3),
  rationale: z.string().min(12),
}).strict();

const guidedCardSchema = z.object({
  id,
  title: z.string().min(2),
  eyebrow: z.string().min(2),
  facts: z.array(z.object({ label: z.string().min(2), value: z.string().min(1) }).strict()).min(2).max(5),
}).strict();

const guidedScenarioSchema = z.object({
  title: z.string().min(3),
  setup: z.string().min(20),
  cards: z.array(guidedCardSchema).min(2).max(4),
  prompt: z.string().min(10),
  choices: z.array(guidedChoiceSchema).min(2).max(4),
  answer_id: id,
  correct_explanation: z.string().min(20),
}).strict();

const guidedSequenceSchema = z.object({
  goal: z.string().min(20),
  prerequisite: z.string().min(10),
  assumptions: z.array(z.string().min(15)).min(2),
  read: z.object({
    title: z.string().min(3),
    worked_example: z.string().min(20),
    body: z.array(z.string().min(20)).min(2),
    start_label: z.string().min(3),
  }).strict(),
  initial: guidedScenarioSchema,
  change: guidedScenarioSchema.extend({ changed_condition: z.string().min(15) }).strict(),
  explain: z.object({
    title: z.string().min(3),
    intro: z.string().min(20),
    actors: z.array(z.object({
      id,
      name: z.string().min(2),
      location: componentLocationSchema,
      responsibility: z.string().min(15),
      observable: z.string().min(15),
    }).strict()).min(3),
    tracks: z.array(z.object({
      kind: z.enum(['control', 'execution']),
      title: z.string().min(3),
      steps: z.array(z.string().min(10)).min(2),
    }).strict()).length(2),
    proof: z.object({
      command: z.string().min(3),
      expected: z.string().min(12),
      proves: z.string().min(12),
      limitation: z.string().min(12),
    }).strict(),
  }).strict(),
  transfer: guidedScenarioSchema.extend({
    explain_prompt: z.string().min(10),
    checklist: z.array(z.string().min(10)).min(3),
    model_answer: z.string().min(30),
  }).strict(),
  next_links: z.array(z.object({
    label: z.string().min(3),
    description: z.string().min(10),
    href: z.string().regex(/^\/learn\/[a-z0-9-]+\/?(?:\?mode=reference)?$|^\/(?:practice|lesson|models)(?:\/[a-z0-9-]+)*\/?$|^\/review(?:\?[a-z0-9=&_-]+)?$/),
  }).strict()).min(1).max(3),
}).superRefine((sequence, context) => {
  for (const scenarioName of ['initial', 'change', 'transfer'] as const) {
    const scenario = sequence[scenarioName];
    const choiceIds = new Set(scenario.choices.map((choice) => choice.id));
    if (choiceIds.size !== scenario.choices.length || !choiceIds.has(scenario.answer_id)) {
      context.addIssue({ code: 'custom', path: [scenarioName, 'choices'], message: 'choices must be unique and include the answer' });
    }
    const cardIds = new Set(scenario.cards.map((card) => card.id));
    if (cardIds.size !== scenario.cards.length) context.addIssue({ code: 'custom', path: [scenarioName, 'cards'], message: 'card IDs must be unique' });
  }
  const actorIds = new Set(sequence.explain.actors.map((actor) => actor.id));
  if (actorIds.size !== sequence.explain.actors.length) context.addIssue({ code: 'custom', path: ['explain', 'actors'], message: 'actor IDs must be unique' });
  const trackKinds = new Set(sequence.explain.tracks.map((track) => track.kind));
  if (trackKinds.size !== 2) context.addIssue({ code: 'custom', path: ['explain', 'tracks'], message: 'one control and one execution track are required' });
}).strict();

const schedulingTaintSchema = z.object({
  key: id,
  value: z.string().min(1),
  effect: z.literal('NoSchedule'),
});

const schedulingTolerationSchema = z.object({
  key: id,
  value: z.string().min(1),
  effect: z.literal('NoSchedule'),
});

const schedulingPodSchema = z.object({
  name: id,
  cpu_m: z.number().int().positive(),
  memory_mi: z.number().int().positive(),
  required_labels: z.record(z.string(), z.string().min(1)),
  preferred_labels: z.record(z.string(), z.string().min(1)).default({}),
  tolerations: z.array(schedulingTolerationSchema),
});

const schedulingNodeSchema = z.object({
  id,
  name: z.string().min(2),
  cpu_available_m: z.number().int().nonnegative(),
  memory_available_mi: z.number().int().nonnegative(),
  labels: z.record(z.string(), z.string().min(1)),
  taints: z.array(schedulingTaintSchema),
});

const schedulingChoiceSchema = z.object({
  id,
  text: z.string().min(3),
  rationale: z.string().min(12),
});

const schedulingScenarioSchema = z.object({
  pod: schedulingPodSchema,
  nodes: z.array(schedulingNodeSchema).length(3),
  eligible_node_ids: z.array(id),
  prompt: z.string().min(10),
  choices: z.array(schedulingChoiceSchema).min(2).max(4),
  answer_id: id,
  correct_explanation: z.string().min(20),
});

const schedulingPrototypeSchema = z.object({
  goal: z.string().min(20),
  prerequisite: z.string().min(10),
  assumptions: z.array(z.string().min(15)).min(3),
  read: z.object({
    title: z.string().min(3),
    body: z.array(z.string().min(20)).min(2),
    start_label: z.string().min(3),
  }),
  base: schedulingScenarioSchema,
  change: z.object({
    title: z.string().min(3),
    description: z.string().min(15),
    pod: schedulingPodSchema,
    eligible_node_ids: z.array(id),
    prompt: z.string().min(10),
    choices: z.array(schedulingChoiceSchema).min(2).max(4),
    answer_id: id,
    correct_explanation: z.string().min(20),
  }),
  concepts: z.array(z.object({
    term: z.string().min(3),
    explanation: z.string().min(20),
  })).min(3),
  lifecycle: z.object({
    title: z.string().min(3),
    stages: z.array(z.object({
      actor: z.string().min(3),
      action: z.string().min(15),
      observable: z.string().min(15),
    })).min(3),
    proof: z.object({
      command: z.string().min(3),
      expected: z.string().min(12),
      proves: z.string().min(12),
      limitation: z.string().min(12),
    }),
  }),
  transfer: schedulingScenarioSchema.extend({
    explain_prompt: z.string().min(10),
    checklist: z.array(z.string().min(10)).min(3),
    model_answer: z.string().min(30),
  }),
}).superRefine((prototype, context) => {
  for (const [scenarioName, scenario] of [['base', prototype.base], ['transfer', prototype.transfer]] as const) {
    const nodeIds = new Set(scenario.nodes.map((node) => node.id));
    if (nodeIds.size !== scenario.nodes.length) context.addIssue({ code: 'custom', path: [scenarioName, 'nodes'], message: 'node IDs must be unique' });
    const optionIds = new Set(scenario.choices.map((choice) => choice.id));
    if (optionIds.size !== scenario.choices.length || !optionIds.has(scenario.answer_id)) {
      context.addIssue({ code: 'custom', path: [scenarioName, 'choices'], message: 'choices must be unique and include the answer' });
    }
    const eligibleIds = new Set(scenario.eligible_node_ids);
    if (eligibleIds.size !== scenario.eligible_node_ids.length || scenario.eligible_node_ids.some((nodeId) => !nodeIds.has(nodeId))) {
      context.addIssue({ code: 'custom', path: [scenarioName, 'eligible_node_ids'], message: 'eligible node IDs must be unique known nodes' });
    }
  }
  const changeOptionIds = new Set(prototype.change.choices.map((choice) => choice.id));
  if (changeOptionIds.size !== prototype.change.choices.length || !changeOptionIds.has(prototype.change.answer_id)) {
    context.addIssue({ code: 'custom', path: ['change', 'choices'], message: 'choices must be unique and include the answer' });
  }
  const baseNodeIds = new Set(prototype.base.nodes.map((node) => node.id));
  const changedEligibleIds = new Set(prototype.change.eligible_node_ids);
  if (changedEligibleIds.size !== prototype.change.eligible_node_ids.length || prototype.change.eligible_node_ids.some((nodeId) => !baseNodeIds.has(nodeId))) {
    context.addIssue({ code: 'custom', path: ['change', 'eligible_node_ids'], message: 'eligible node IDs must be unique nodes from the base scenario' });
  }
}).strict();

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
    location: componentLocationSchema,
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
  scheduling_prototype: schedulingPrototypeSchema.optional(),
  guided_sequence: guidedSequenceSchema.optional(),
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
export type SchedulingPrototype = NonNullable<MentalModel['scheduling_prototype']>;
export type SchedulingPod = SchedulingPrototype['base']['pod'];
export type SchedulingNode = SchedulingPrototype['base']['nodes'][number];
export type GuidedSequence = NonNullable<MentalModel['guided_sequence']>;
