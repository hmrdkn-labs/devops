import { describe, expect, it } from 'vitest';
import { evaluate, initialConfig, matches, profiles } from '../src/components/anatomy/taints-tolerations/model';

describe('NoSchedule gate model', () => {
  it('does not confuse a matching key/value with a matching effect', () => {
    expect(matches(profiles['wrong-effect'].toleration)).toBe(false);
    expect(matches(profiles['wrong-key'].toleration)).toBe(false);
    expect(matches(profiles['wrong-value'].toleration)).toBe(false);
    expect(matches(profiles.equal.toleration)).toBe(true);
  });

  it('preserves effect matching for an empty-key Exists toleration', () => {
    expect(matches({ key: '', operator: 'Exists', effect: 'NoExecute' })).toBe(false);
    expect(matches({ key: '', operator: 'Exists', effect: 'NoSchedule' })).toBe(true);
    expect(matches({ key: 'team', operator: 'Exists', effect: '' })).toBe(false);
    expect(matches(profiles['any-effect'].toleration)).toBe(true);
    expect(matches(profiles.exists.toleration)).toBe(true);
  });

  it('never lets taint permission rescue insufficient requested CPU', () => {
    expect(evaluate({ ...initialConfig, profile: 'equal', cpuFits: false })).toMatchObject({
      taintPass: true, capacityPass: false, eligibleA: false, selected: null, stopA: 8,
    });
    expect(evaluate({ ...initialConfig, tainted: false, cpuFits: false })).toMatchObject({
      taintPass: true, capacityPass: false, selected: null,
    });
  });

  it('does not give a tolerated node a placement bonus over another eligible candidate', () => {
    expect(evaluate({ ...initialConfig, profile: 'equal', alternate: true })).toMatchObject({
      eligibleA: true, selected: 'node-b',
    });
    expect(evaluate({ ...initialConfig, alternate: true })).toMatchObject({
      eligibleA: false, selected: 'node-b',
    });
    expect(evaluate(initialConfig)).toMatchObject({ selected: null, stopA: -68 });
  });
});
