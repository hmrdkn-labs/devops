import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { practiceSetSchema, unitMetadataSchema, type LearningPath, type LearningUnit } from '../src/lib/content/schema';
import { validateGraph } from '../tools/content/build';

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
});
