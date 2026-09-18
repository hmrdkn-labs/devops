import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { curriculumSchema, pathSchema } from '../src/lib/content/schema';

const curriculum = curriculumSchema.parse(parse(readFileSync('content/curricula/kcna-kodekloud.yaml', 'utf8')));
const path = pathSchema.parse(parse(readFileSync('content/paths/kcna.yaml', 'utf8')));

describe('verified KCNA course sequence', () => {
  it('preserves the reviewed 13-module, 116-step progression', () => {
    expect(curriculum.modules.map((module) => module.slug)).toEqual([
      'introduction', 'kubernetes-fundamentals', 'kubernetes-resources', 'scheduling',
      'security', 'networking', 'service-mesh', 'storage', 'cloud-native-architecture',
      'cloud-native-observability', 'cloud-native-application-delivery', 'mock-exams', 'conclusion',
    ]);
    expect(curriculum.modules.reduce((count, module) => count + module.steps.length, 0)).toBe(116);
    expect(new URL(curriculum.reference.url).hostname).toBe('kodekloud.com');
    expect(curriculum.reference.publisher).toBe('KodeKloud');
  });

  it('separates learner steps from source-only community and feedback entries', () => {
    const learnerKinds = new Set(['lesson', 'demo', 'quiz', 'mock-exam', 'conclusion']);
    const steps = curriculum.modules.flatMap((module) => module.steps);
    expect(steps.filter((step) => learnerKinds.has(step.kind))).toHaveLength(105);
    expect(steps.filter((step) => step.kind === 'community' || step.kind === 'feedback')).toHaveLength(11);
  });

  it('maps every KCNA path unit without introducing material outside the path', () => {
    const mapped = new Set(curriculum.modules.flatMap((module) => module.steps.flatMap((step) => step.unit_ids)));
    expect([...mapped].sort()).toEqual(path.units.map((entry) => entry.unit_id).sort());
  });

  it('ends each teaching module with a quiz after its teaching steps', () => {
    const teachingModules = curriculum.modules.filter((module) => module.steps.some((step) => step.kind === 'quiz'));
    expect(teachingModules).toHaveLength(10);
    for (const module of teachingModules) {
      const quizIndex = module.steps.findIndex((step) => step.kind === 'quiz');
      expect(quizIndex, module.slug).toBeGreaterThan(0);
      expect(module.steps.slice(quizIndex + 1).every((step) => step.kind === 'feedback'), module.slug).toBe(true);
    }
  });
});
