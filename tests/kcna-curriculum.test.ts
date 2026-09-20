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
    expect(curriculum.revision).toBe(2);
    expect(curriculum.verified_at).toBe('2026-09-21');
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

  it('targets relevant canonical sections for broad repeated course modules', () => {
    const targetedModules = new Set([
      'scheduling', 'security', 'cloud-native-observability', 'cloud-native-application-delivery',
    ]);
    const teachingKinds = new Set(['lesson', 'demo']);
    for (const module of curriculum.modules.filter((entry) => targetedModules.has(entry.slug))) {
      for (const step of module.steps.filter((entry) => teachingKinds.has(entry.kind))) {
        expect(step.material, step.id).toBeDefined();
        expect(step.unit_ids, step.id).toContain(step.material!.unit_id);
        expect(step.material!.objective_ids.length, step.id).toBeGreaterThan(0);
      }
    }
  });

  it('uses detailed scheduling sections without replacing the original unit mappings', () => {
    const scheduling = curriculum.modules.find((module) => module.slug === 'scheduling')!;
    const expectedSections = new Map([
      ['manual-scheduling', '2-direct-assignment-is-different-from-scheduler-policy'],
      ['taints-tolerations', '4-taints-and-tolerations-repel-versus-allow'],
      ['node-selectors', '3-labels-selectors-nodeselector-and-affinity'],
      ['node-affinity', '3-labels-selectors-nodeselector-and-affinity'],
      ['taints-vs-affinity', '4-taints-and-tolerations-repel-versus-allow'],
    ]);
    for (const [suffix, section] of expectedSections) {
      const step = scheduling.steps.find((entry) => entry.id.endsWith(`/${suffix}`))!;
      expect(step.unit_ids).toContain('fpp:kubernetes-scheduling-placement');
      expect(step.unit_ids).toContain('fpp:kcna-scheduling-review');
      expect(step.material?.section).toBe(section);
    }
  });
});
