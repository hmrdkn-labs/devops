import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  lessonSchema,
  practiceSetSchema,
  unitMetadataSchema,
  type LearningPath,
  type LearningUnit,
  type Lesson,
} from '../src/lib/content/schema';
import { validateGraph, validateLessons } from '../tools/content/build';

function unit(
  id = 'fpp:test',
  slug = 'test',
  prerequisites: string[] = [],
): LearningUnit {
  const objective = `${id}.objective`;
  return {
    metadata: {
      schema_version: 1,
      id,
      slug,
      title: `Unit ${slug}`,
      summary: 'A deliberately complete unit fixture for validating graph invariants.',
      revision: 1,
      revision_impact: 'mastery_affecting',
      status: 'published',
      layer: 'linux',
      estimated_minutes: 10,
      aliases: [],
      applicable_versions: [{ product: 'Linux', range: 'current' }],
      prerequisites,
      objectives: [{ id: objective, title: 'Explain this test objective', critical: false }],
      certification_mappings: [{ certification: 'cncf:kcna', domains: ['test'], advisory: true }],
      authors: ['hmrdkn-labs'],
      reviewers: ['hmrdkn-labs'],
      verified_at: '2026-08-27',
    },
    markdown: '# Fixture',
    questions: [{
      id: `${id}.question`,
      kind: 'explain',
      prompt: 'Explain the fixture in enough detail to validate it.',
      model_answer: 'The fixture exists to exercise content graph validation.',
      critical_points: ['It is deterministic.'],
      objective_ids: [objective],
    }],
    cards: [
      ...Array.from({ length: 3 }, (_, index) => ({
        id: `${id}.short${index}`,
        type: 'short' as const,
        front: `Short ${index}`,
        back: 'A concise answer.',
        critical_points: [],
        objective_ids: [objective],
      })),
      {
        id: `${id}.prompt`, type: 'prompt', front: 'Explain this fixture.', back: 'Explain its contract.',
        critical_points: [], objective_ids: [objective],
      },
      {
        id: `${id}.scenario`, type: 'scenario', front: 'Troubleshoot this fixture.', back: 'Inspect its invariants.',
        critical_points: [], objective_ids: [objective],
      },
    ],
    sources: [{
      id: `${id}.source`, title: 'Fixture documentation', url: 'https://example.com/docs',
      publisher: 'Example', type: 'documentation', verified_at: '2026-08-27', note: 'Fixture only.',
    }],
    practices: [],
    visuals: [{
      id: `${id}.visual`,
      kind: 'flow',
      eyebrow: 'Fixture model',
      title: 'Trace the fixture contract',
      lines: ['source → validation → published unit'],
      teaching_point: 'The visual fixture exists so published units always carry a portable mental model.',
    }],
  };
}

function pathFor(units: LearningUnit[]): LearningPath {
  return {
    schema_version: 1,
    id: 'path:test',
    slug: 'test-path',
    title: 'Test path',
    summary: 'A complete path fixture used to validate graph relationships.',
    revision: 1,
    status: 'published',
    units: units.map((item) => ({ unit_id: item.metadata.id, weight: 1 as const })),
  };
}

function lessonFor(source: LearningUnit = unit()): Lesson {
  const objectiveId = source.metadata.objectives[0]!.id;
  return lessonSchema.parse({
    schema_version: 1,
    id: 'lesson:test',
    slug: 'test-lesson',
    title: 'Test interactive lesson',
    summary: 'A complete portable lesson fixture used to validate interaction contracts.',
    revision: 1,
    certification: 'cncf:kcna',
    checkpoint: 'test',
    estimated_minutes: 10,
    verified_at: '2026-09-12',
    source_unit_ids: [source.metadata.id],
    exercises: [{
      id: 'lesson:test/choose',
      kind: 'choose',
      unit_id: source.metadata.id,
      objective_ids: [objectiveId],
      evidence: 'recall',
      prompt: 'Which option satisfies this deterministic lesson fixture?',
      options: [
        { id: 'right', text: 'The valid option', rationale: 'This option is correct for the deterministic fixture.' },
        { id: 'wrong', text: 'The distractor', rationale: 'This option is deliberately wrong for the deterministic fixture.' },
      ],
      answer_ids: ['right'],
      hint: 'Choose the option described as valid.',
      learn_first: {
        title: 'Fixture concept',
        body: 'This small concept exists only to exercise the portable learn-first contract.',
        visual: ['input → reasoning → answer'],
        variant_prompt: 'Which fixture option remains valid after seeing the concept?',
      },
      feedback: {
        title: 'The fixture is deterministic',
        explanation: 'The answer and distractor are deliberately stable so validation remains deterministic.',
        points: ['Feedback explains why the answer is valid.'],
        visual: ['right ✓', 'wrong ✗'],
      },
    }],
  });
}

describe('content contract', () => {
  it('validates the complete checked-in corpus', () => {
    expect(() => execFileSync(process.execPath, [
      '--import', 'tsx', 'tools/content/build.ts', '--check',
    ], { cwd: process.cwd(), stdio: 'pipe' })).not.toThrow();
  });

  it('rejects malformed metadata before compilation', () => {
    expect(() => unitMetadataSchema.parse({ schema_version: 1, id: 'not-namespaced' })).toThrow();
  });

  it('rejects duplicate IDs and aliases that shadow active IDs', () => {
    const first = unit('fpp:first', 'first');
    const duplicate = unit('fpp:first', 'second');
    expect(() => validateGraph([first, duplicate], [pathFor([first])], new Set(['cncf:kcna']))).toThrow('Duplicate unit ID');

    const second = unit('fpp:second', 'second');
    first.metadata.aliases = ['fpp:second'];
    expect(() => validateGraph([first, second], [pathFor([first, second])], new Set(['cncf:kcna']))).toThrow('Duplicate or active alias');
  });

  it('rejects broken edges and prerequisite cycles', () => {
    const broken = unit('fpp:broken', 'broken', ['fpp:missing']);
    expect(() => validateGraph([broken], [pathFor([broken])], new Set(['cncf:kcna']))).toThrow('broken prerequisite');

    const first = unit('fpp:first', 'first', ['fpp:second']);
    const second = unit('fpp:second', 'second', ['fpp:first']);
    expect(() => validateGraph([first, second], [pathFor([first, second])], new Set(['cncf:kcna']))).toThrow('Prerequisite cycle');
  });

  it('requires sources and valid certification mappings', () => {
    const noSource = unit();
    noSource.sources = [];
    expect(() => validateGraph([noSource], [pathFor([noSource])], new Set(['cncf:kcna']))).toThrow('at least one source');

    const unknownCertification = unit();
    unknownCertification.metadata.certification_mappings[0]!.certification = 'cncf:unknown';
    expect(() => validateGraph([unknownCertification], [pathFor([unknownCertification])], new Set(['cncf:kcna']))).toThrow('unknown certification');
  });

  it('requires a portable reference visual for published units', () => {
    const noVisual = unit();
    noVisual.visuals = [];
    expect(() => validateGraph([noVisual], [pathFor([noVisual])], new Set(['cncf:kcna']))).toThrow('reference visual');
  });

  it('validates MCQ answer contracts', () => {
    const valid = {
      schema_version: 1 as const,
      id: 'practice:test',
      slug: 'test-mcq',
      title: 'Test MCQ practice',
      summary: 'A complete MCQ practice fixture for validating answer and option invariants.',
      revision: 1,
      certification: 'cncf:kcna',
      verified_at: '2026-09-11',
      questions: [{
        id: 'practice:test/q-one',
        checkpoint: 'fundamentals' as const,
        category: 'concept' as const,
        select: 'multiple' as const,
        prompt: 'Which options are deliberately marked as correct in this fixture?',
        options: [
          { id: 'a', text: 'Option A', rationale: 'Option A is correct for the deterministic fixture.', code: false },
          { id: 'b', text: 'Option B', rationale: 'Option B is also correct for the deterministic fixture.', code: false },
          { id: 'c', text: 'Option C', rationale: 'Option C is deliberately incorrect for this fixture.', code: false },
        ],
        answer_ids: ['a', 'b'],
        explanation: 'The fixture needs two valid answers so the multi-select invariant is exercised.',
        unit_ids: ['fpp:test'],
      }],
    };
    expect(() => practiceSetSchema.parse(valid)).not.toThrow();
    expect(() => practiceSetSchema.parse({
      ...valid,
      questions: [{ ...valid.questions[0], answer_ids: ['a', 'missing'] }],
    })).toThrow('unknown answer option');
  });

  it('validates lesson graph ownership, certifications, and globally immutable IDs', () => {
    const source = unit();
    const valid = lessonFor(source);
    expect(() => validateLessons([valid], [source], new Set(['cncf:kcna']))).not.toThrow();

    const duplicateId = structuredClone(valid);
    duplicateId.slug = 'second-lesson';
    expect(() => validateLessons([valid, duplicateId], [source], new Set(['cncf:kcna']))).toThrow('Duplicate lesson ID');

    const duplicateSlug = structuredClone(valid);
    duplicateSlug.id = 'lesson:second';
    expect(() => validateLessons([valid, duplicateSlug], [source], new Set(['cncf:kcna']))).toThrow('Duplicate lesson slug');

    const duplicateExercise = structuredClone(valid);
    duplicateExercise.id = 'lesson:second';
    duplicateExercise.slug = 'second-lesson';
    expect(() => validateLessons([valid, duplicateExercise], [source], new Set(['cncf:kcna']))).toThrow('Duplicate lesson exercise ID');

    const unknownSource = structuredClone(valid);
    unknownSource.source_unit_ids = ['fpp:missing'];
    expect(() => validateLessons([unknownSource], [source], new Set(['cncf:kcna']))).toThrow('unknown source unit');

    const wrongObjective = structuredClone(valid);
    wrongObjective.exercises[0]!.objective_ids = ['fpp:missing/objective'];
    expect(() => validateLessons([wrongObjective], [source], new Set(['cncf:kcna']))).toThrow('unknown objective');

    const wrongCertification = structuredClone(valid);
    wrongCertification.certification = 'cncf:missing';
    expect(() => validateLessons([wrongCertification], [source], new Set(['cncf:kcna']))).toThrow('unknown certification');

    const missingLearnVisual = structuredClone(valid);
    missingLearnVisual.exercises[0]!.learn_first!.visual = [];
    expect(() => validateLessons([missingLearnVisual], [source], new Set(['cncf:kcna']))).toThrow('learn-first visual walkthrough');

    const missingFeedbackVisual = structuredClone(valid);
    missingFeedbackVisual.exercises[0]!.feedback.visual = [];
    expect(() => validateLessons([missingFeedbackVisual], [source], new Set(['cncf:kcna']))).toThrow('feedback visual walkthrough');
  });

  it('rejects malformed lesson answer, order, match, and blank contracts', () => {
    const valid = lessonFor();
    const invalidAnswer = structuredClone(valid);
    (invalidAnswer.exercises[0] as Extract<Lesson['exercises'][number], { kind: 'choose' }>).answer_ids = ['missing'];
    expect(() => lessonSchema.parse(invalidAnswer)).toThrow('unknown answer option');

    const duplicateAnswer = structuredClone(valid);
    (duplicateAnswer.exercises[0] as Extract<Lesson['exercises'][number], { kind: 'choose' }>).answer_ids = ['right', 'right'];
    expect(() => lessonSchema.parse(duplicateAnswer)).toThrow('answer IDs must be unique');

    const base = valid.exercises[0]!;
    const invalidOrder = structuredClone(valid) as unknown as Record<string, unknown>;
    invalidOrder.exercises = [{
      ...base,
      kind: 'arrange',
      items: [{ id: 'one', text: 'One' }, { id: 'two', text: 'Two' }, { id: 'three', text: 'Three' }],
      correct_order: ['one', 'one', 'two'],
    }];
    expect(() => lessonSchema.parse(invalidOrder)).toThrow('correct_order must contain every item exactly once');

    const invalidMatch = structuredClone(valid) as unknown as Record<string, unknown>;
    invalidMatch.exercises = [{
      ...base,
      kind: 'connect',
      left: [{ id: 'one', text: 'One' }, { id: 'two', text: 'Two' }],
      right: [{ id: 'first', text: 'First' }, { id: 'second', text: 'Second' }],
      matches: [{ left_id: 'one', right_id: 'first' }, { left_id: 'one', right_id: 'second' }],
    }];
    expect(() => lessonSchema.parse(invalidMatch)).toThrow('matches must map every left item');

    const invalidBlank = structuredClone(valid) as unknown as Record<string, unknown>;
    invalidBlank.exercises = [{
      ...base,
      kind: 'manifest_fill',
      manifest: 'apiVersion: apps/v1\nkind: Deployment\nspec: {}',
      blanks: [{
        id: 'replicas',
        label: 'Replica count',
        options: [{ id: 'two', text: '2' }, { id: 'three', text: '3' }],
        answer_id: 'missing',
      }],
    }];
    expect(() => lessonSchema.parse(invalidBlank)).toThrow('answer_id must reference a blank option');

    expect(() => lessonSchema.parse({ ...valid, exercises: [{ kind: 'choose' }] })).toThrow();
  });
});
