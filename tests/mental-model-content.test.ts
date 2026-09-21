import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { mentalModelSchema } from '../src/lib/content/mental-model-schema';
import { validateMentalModels } from '../tools/content/build';
import { unitMetadataSchema, type LearningUnit } from '../src/lib/content/schema';

const read = (relative: string) => parse(readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8'));
const model = mentalModelSchema.parse(read('content/mental-models/kubernetes-reconciliation.yaml'));

describe('portable mental models', () => {
  it('validates all authored fixtures and their real canonical unit/objective edges', () => {
    for (const slug of ['kubernetes-reconciliation', 'pod-scheduling', 'service-request-path']) {
      const fixture = mentalModelSchema.parse(read(`content/mental-models/${slug}.yaml`));
      const units = fixture.unit_ids.map((unitId) => ({
        metadata: unitMetadataSchema.parse(read(`content/units/${unitId.replace('fpp:', '')}/metadata.yaml`)),
      })) as LearningUnit[];
      expect(() => validateMentalModels([fixture], units)).not.toThrow();
    }
  });

  it('rejects a dangling diagram edge', () => {
    const changed = structuredClone(model);
    changed.steps[0].edges.push({ from: 'missing-component', to: 'api', label: 'invalid edge' });
    expect(mentalModelSchema.safeParse(changed).success).toBe(false);
  });

  it('rejects an answer that no prediction option supplies', () => {
    const changed = structuredClone(model);
    changed.steps[0].prediction.answer_id = 'missing-option';
    expect(mentalModelSchema.safeParse(changed).success).toBe(false);
  });

  it('requires the declared actor to participate in its step', () => {
    const changed = structuredClone(model);
    changed.steps[0].active_component_ids = changed.steps[0].active_component_ids.filter((id) => id !== changed.steps[0].actor_id);
    expect(mentalModelSchema.safeParse(changed).success).toBe(false);
  });

  it('rejects unknown canonical unit edges', () => {
    expect(() => validateMentalModels([model], [])).toThrow('unknown unit');
  });

  it('validates portable guided sequences and local continuation links', () => {
    for (const slug of ['kubernetes-reconciliation', 'service-request-path']) {
      const fixture = mentalModelSchema.parse(read(`content/mental-models/${slug}.yaml`));
      const guide = fixture.guided_sequence!;
      expect(guide.explain.tracks.map((track) => track.kind).sort()).toEqual(['control', 'execution']);
      expect(guide.transfer.answer_id).not.toBe(guide.initial.answer_id);
      const unitSlugs = fixture.unit_ids.map((unitId) => unitMetadataSchema.parse(read(`content/units/${unitId.replace('fpp:', '')}/metadata.yaml`)).slug);
      for (const link of guide.next_links.filter((item) => item.href.startsWith('/learn/'))) {
        expect(unitSlugs).toContain(link.href.split('/')[2]);
      }
    }
  });

  it('rejects protocol-relative continuation links in a guide', () => {
    const changed = structuredClone(model);
    changed.guided_sequence!.next_links[0]!.href = '//external.example/path';
    expect(mentalModelSchema.safeParse(changed).success).toBe(false);
  });

  it('allows only the reference-mode query on guided lesson links', () => {
    const changed = structuredClone(model);
    changed.guided_sequence!.next_links[0]!.href = '/learn/kubernetes-control-loop/?mode=practice';
    expect(mentalModelSchema.safeParse(changed).success).toBe(false);
    changed.guided_sequence!.next_links[0]!.href = '/learn/kubernetes-control-loop/?mode=reference';
    expect(mentalModelSchema.safeParse(changed).success).toBe(true);
  });
});
