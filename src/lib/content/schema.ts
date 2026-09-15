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

export const referenceVisualFileSchema = z.object({
  schema_version: z.literal(1),
  unit_id: id,
  revision: z.number().int().positive(),
  visuals: z.array(z.object({
    id,
    kind: z.enum(['flow', 'state', 'ownership', 'comparison', 'lifecycle', 'evidence']),
    eyebrow: z.string().min(2),
    title: z.string().min(3),
    lines: z.array(z.string().min(1)).min(1).max(8),
    teaching_point: z.string().min(12),
  })).min(1),
});

const mcqOptionSchema = z.object({
  id,
  text: z.string().min(2),
  rationale: z.string().min(10),
  code: z.boolean().default(false),
});

const lessonFeedbackSchema = z.object({
  title: z.string().min(3),
  explanation: z.string().min(20),
  points: z.array(z.string().min(3)).default([]),
  visual: z.array(z.string().min(1)).default([]),
});

const lessonLearnFirstSchema = z.object({
  title: z.string().min(3),
  body: z.string().min(20),
  visual: z.array(z.string().min(1)).default([]),
  variant_prompt: z.string().min(10),
});

const lessonExerciseBase = z.object({
  id,
  unit_id: id,
  objective_ids: z.array(id).min(1),
  evidence: z.enum(['encounter', 'recall', 'application']),
  prompt: z.string().min(10),
  hint: z.string().min(5).optional(),
  learn_first: lessonLearnFirstSchema.optional(),
  feedback: lessonFeedbackSchema,
});

const lessonChoiceOptionSchema = z.object({
  id,
  text: z.string().min(1),
  rationale: z.string().min(10),
});

const lessonChoiceFields = {
  options: z.array(lessonChoiceOptionSchema).min(2).max(8),
  answer_ids: z.array(id).min(1),
};

const validateChoiceAnswers = (
  exercise: { options: Array<{ id: string }>; answer_ids: string[] },
  context: z.RefinementCtx,
) => {
  const optionIds = new Set(exercise.options.map((option) => option.id));
  if (optionIds.size !== exercise.options.length) {
    context.addIssue({ code: 'custom', path: ['options'], message: 'option IDs must be unique' });
  }
  if (new Set(exercise.answer_ids).size !== exercise.answer_ids.length) {
    context.addIssue({ code: 'custom', path: ['answer_ids'], message: 'answer IDs must be unique' });
  }
  for (const answerId of exercise.answer_ids) {
    if (!optionIds.has(answerId)) {
      context.addIssue({ code: 'custom', path: ['answer_ids'], message: `unknown answer option ${answerId}` });
    }
  }
};

const chooseExerciseSchema = lessonExerciseBase.extend({
  kind: z.literal('choose'),
  ...lessonChoiceFields,
}).superRefine(validateChoiceAnswers);

const predictStateExerciseSchema = lessonExerciseBase.extend({
  kind: z.literal('predict_state'),
  state: z.array(z.string().min(1)).min(1),
  ...lessonChoiceFields,
}).superRefine(validateChoiceAnswers);

const spotBugExerciseSchema = lessonExerciseBase.extend({
  kind: z.literal('spot_bug'),
  code: z.string().min(10),
  ...lessonChoiceFields,
}).superRefine(validateChoiceAnswers);

const terminalInspectExerciseSchema = lessonExerciseBase.extend({
  kind: z.literal('terminal_inspect'),
  terminal: z.array(z.string().min(1)).min(1),
  ...lessonChoiceFields,
}).superRefine(validateChoiceAnswers);

const orderedItemSchema = z.object({ id, text: z.string().min(1) });
const orderedExerciseFields = {
  items: z.array(orderedItemSchema).min(2).max(10),
  correct_order: z.array(id).min(2),
};
const validateOrder = (
  exercise: { items: Array<{ id: string }>; correct_order: string[] },
  context: z.RefinementCtx,
) => {
  const itemIds = exercise.items.map((item) => item.id);
  if (new Set(itemIds).size !== itemIds.length) {
    context.addIssue({ code: 'custom', path: ['items'], message: 'item IDs must be unique' });
  }
  if (exercise.correct_order.length !== itemIds.length ||
      new Set(exercise.correct_order).size !== exercise.correct_order.length ||
      exercise.correct_order.some((itemId) => !itemIds.includes(itemId))) {
    context.addIssue({ code: 'custom', path: ['correct_order'], message: 'correct_order must contain every item exactly once' });
  }
};

const arrangeExerciseSchema = lessonExerciseBase.extend({
  kind: z.literal('arrange'),
  ...orderedExerciseFields,
}).superRefine(validateOrder);

const traceExerciseSchema = lessonExerciseBase.extend({
  kind: z.literal('trace'),
  ...orderedExerciseFields,
}).superRefine(validateOrder);

const commandBuilderExerciseSchema = lessonExerciseBase.extend({
  kind: z.literal('command_builder'),
  ...orderedExerciseFields,
}).superRefine(validateOrder);

const connectExerciseSchema = lessonExerciseBase.extend({
  kind: z.literal('connect'),
  left: z.array(orderedItemSchema).min(2).max(8),
  right: z.array(orderedItemSchema).min(2).max(8),
  matches: z.array(z.object({ left_id: id, right_id: id })).min(2),
}).superRefine((exercise, context) => {
  const leftIds = new Set(exercise.left.map((item) => item.id));
  const rightIds = new Set(exercise.right.map((item) => item.id));
  const matchedLeftIds = new Set(exercise.matches.map((match) => match.left_id));
  if (leftIds.size !== exercise.left.length || rightIds.size !== exercise.right.length) {
    context.addIssue({ code: 'custom', path: ['matches'], message: 'connect item IDs must be unique' });
  }
  if (exercise.matches.length !== exercise.left.length ||
      matchedLeftIds.size !== exercise.left.length ||
      exercise.matches.some((match) => !leftIds.has(match.left_id) || !rightIds.has(match.right_id))) {
    context.addIssue({ code: 'custom', path: ['matches'], message: 'matches must map every left item to a known right item' });
  }
});

const manifestFillExerciseSchema = lessonExerciseBase.extend({
  kind: z.literal('manifest_fill'),
  manifest: z.string().min(20),
  blanks: z.array(z.object({
    id,
    label: z.string().min(2),
    options: z.array(z.object({ id, text: z.string().min(1) })).min(2).max(8),
    answer_id: id,
  })).min(1).max(6),
}).superRefine((exercise, context) => {
  for (const [index, blank] of exercise.blanks.entries()) {
    const optionIds = new Set(blank.options.map((option) => option.id));
    if (optionIds.size !== blank.options.length) {
      context.addIssue({ code: 'custom', path: ['blanks', index, 'options'], message: 'blank option IDs must be unique' });
    }
    if (!optionIds.has(blank.answer_id)) {
      context.addIssue({ code: 'custom', path: ['blanks', index, 'answer_id'], message: 'answer_id must reference a blank option' });
    }
  }
});

const explainExerciseSchema = lessonExerciseBase.extend({
  kind: z.literal('explain'),
  model_answer: z.string().min(20),
  critical_points: z.array(z.string().min(3)).min(1),
});

export const lessonExerciseSchema = z.union([
  chooseExerciseSchema,
  arrangeExerciseSchema,
  connectExerciseSchema,
  commandBuilderExerciseSchema,
  terminalInspectExerciseSchema,
  manifestFillExerciseSchema,
  traceExerciseSchema,
  predictStateExerciseSchema,
  spotBugExerciseSchema,
  explainExerciseSchema,
]);

export const lessonSchema = z.object({
  schema_version: z.literal(1),
  id,
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(3),
  summary: z.string().min(20),
  revision: z.number().int().positive(),
  certification: id,
  checkpoint: z.string().min(2),
  estimated_minutes: z.number().int().min(3).max(90),
  verified_at: isoDate,
  source_unit_ids: z.array(id).min(1),
  exercises: z.array(lessonExerciseSchema).min(1),
}).superRefine((lesson, context) => {
  const exerciseIds = new Set<string>();
  for (const [index, exercise] of lesson.exercises.entries()) {
    if (exerciseIds.has(exercise.id)) {
      context.addIssue({ code: 'custom', path: ['exercises', index, 'id'], message: `duplicate exercise ID ${exercise.id}` });
    }
    exerciseIds.add(exercise.id);
  }
});

const mcqQuestionSchema = z.object({
  id,
  checkpoint: z.enum(['fundamentals', 'resources', 'cluster-behavior', 'cloud-native']),
  category: z.enum(['concept', 'kubectl', 'scenario']),
  select: z.enum(['single', 'multiple']),
  prompt: z.string().min(10),
  options: z.array(mcqOptionSchema).min(3).max(6),
  answer_ids: z.array(id).min(1),
  explanation: z.string().min(20),
  unit_ids: z.array(id).min(1),
}).superRefine((question, context) => {
  const optionIds = new Set(question.options.map((option) => option.id));
  if (optionIds.size !== question.options.length) {
    context.addIssue({ code: 'custom', path: ['options'], message: 'option IDs must be unique within a question' });
  }
  const answerIds = new Set(question.answer_ids);
  if (answerIds.size !== question.answer_ids.length) {
    context.addIssue({ code: 'custom', path: ['answer_ids'], message: 'answer IDs must be unique' });
  }
  for (const answerId of question.answer_ids) {
    if (!optionIds.has(answerId)) {
      context.addIssue({ code: 'custom', path: ['answer_ids'], message: `unknown answer option ${answerId}` });
    }
  }
  if (question.select === 'single' && question.answer_ids.length !== 1) {
    context.addIssue({ code: 'custom', path: ['answer_ids'], message: 'single-select questions require exactly one answer' });
  }
  if (question.select === 'multiple' && question.answer_ids.length < 2) {
    context.addIssue({ code: 'custom', path: ['answer_ids'], message: 'multi-select questions require at least two answers' });
  }
});

export const practiceSetSchema = z.object({
  schema_version: z.literal(1),
  id,
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(3),
  summary: z.string().min(20),
  revision: z.number().int().positive(),
  certification: id,
  verified_at: isoDate,
  questions: z.array(mcqQuestionSchema).min(1),
}).superRefine((set, context) => {
  const questionIds = new Set<string>();
  for (const [index, question] of set.questions.entries()) {
    if (questionIds.has(question.id)) {
      context.addIssue({ code: 'custom', path: ['questions', index, 'id'], message: `duplicate question ID ${question.id}` });
    }
    questionIds.add(question.id);
  }
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
export type ReferenceVisualFile = z.infer<typeof referenceVisualFileSchema>;
export type PracticeSet = z.infer<typeof practiceSetSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export type LessonExercise = z.infer<typeof lessonExerciseSchema>;
export type LearningPath = z.infer<typeof pathSchema>;
export type CertificationRegistry = z.infer<typeof certificationRegistrySchema>;

export interface LearningUnit {
  metadata: UnitMetadata;
  markdown: string;
  questions: QuestionFile['questions'];
  cards: CardFile['cards'];
  sources: SourceFile['sources'];
  practices: PracticeFile['practices'];
  visuals: ReferenceVisualFile['visuals'];
}
