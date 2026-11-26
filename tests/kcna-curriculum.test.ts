import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { curriculumSchema, pathSchema } from '../src/lib/content/schema';

const curriculum = curriculumSchema.parse(parse(readFileSync('content/curricula/kcna-domains.yaml', 'utf8')));
const path = pathSchema.parse(parse(readFileSync('content/paths/kcna.yaml', 'utf8')));

describe('KCNA exam-domain curriculum', () => {
  it('follows the four official exam domains and weights', () => {
    expect(curriculum.modules.map((module) => [module.slug, module.exam_weight])).toEqual([
      ['kubernetes-fundamentals', 44],
      ['container-orchestration', 28],
      ['cloud-native-application-delivery', 16],
      ['cloud-native-architecture', 12],
    ]);
    expect(curriculum.modules.reduce((total, module) => total + module.exam_weight!, 0)).toBe(100);
    expect(curriculum.reference.url).toBe('https://training.linuxfoundation.org/certification/kubernetes-cloud-native-associate/');
    expect(curriculum.reference.publisher).toBe('The Linux Foundation');
  });

  it('maps every KCNA path unit exactly once without introducing material outside the path', () => {
    const mapped = curriculum.modules.flatMap((module) => module.steps.flatMap((step) => step.unit_ids));
    expect(new Set(mapped).size).toBe(mapped.length);
    expect([...mapped].sort()).toEqual(path.units.map((entry) => entry.unit_id).sort());
  });

  it('ends every domain with a practice-question step', () => {
    for (const module of curriculum.modules) {
      expect(module.steps.at(-1)?.kind, module.slug).toBe('quiz');
      expect(module.steps.filter((step) => step.kind === 'quiz'), module.slug).toHaveLength(1);
    }
  });
});
