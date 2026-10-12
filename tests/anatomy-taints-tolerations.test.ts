import { describe, expect, it } from 'vitest';
import {
  compareTaint, evaluate, initialConfig, nextSerial, nodeYaml, podYaml, profiles, runMarkIds, type Config, type Profile,
} from '../src/components/anatomy/taints-tolerations/model';

const profileIds = Object.keys(profiles) as Profile[];
const tolerated = (profile: Profile, overrides: Partial<Config> = {}) => evaluate({ ...initialConfig, ...overrides, profile });

describe('field-by-field taint matching', () => {
  it('matches Equal only when key, value and effect all agree', () => {
    expect(compareTaint(true, profiles.equal.toleration).passes).toBe(true);
    expect(compareTaint(true, profiles['wrong-key'].toleration).passes).toBe(false);
    expect(compareTaint(true, profiles['wrong-value'].toleration).passes).toBe(false);
    expect(compareTaint(true, profiles['wrong-effect'].toleration).passes).toBe(false);
  });

  it('reports the failing field instead of collapsing the comparison into one boolean', () => {
    const rows = compareTaint(true, profiles['wrong-effect'].toleration).rows;
    expect(rows.find((row) => row.field === 'effect')?.verdict).toBe('mismatch');
    expect(rows.find((row) => row.field === 'key')?.verdict).toBe('match');
    expect(rows.find((row) => row.field === 'value')?.verdict).toBe('match');
  });

  it('does not test the value for Exists, and still needs the key and effect', () => {
    const rows = compareTaint(true, profiles.exists.toleration).rows;
    expect(rows.find((row) => row.field === 'value')?.verdict).toBe('not-tested');
    expect(compareTaint(true, profiles.exists.toleration).passes).toBe(true);
    expect(compareTaint(true, { key: 'dedicated', operator: 'Exists', effect: 'NoExecute' }).passes).toBe(false);
  });

  it('accepts an empty effect for any effect, but an empty key only with Exists and NoSchedule', () => {
    expect(compareTaint(true, profiles['any-effect'].toleration).passes).toBe(true);
    expect(compareTaint(true, profiles['all-keys'].toleration).passes).toBe(true);
    expect(compareTaint(true, { key: '', operator: 'Exists', effect: 'NoExecute' }).passes).toBe(false);
  });

  it('rejects an absent toleration on a tainted node and needs no toleration on an untainted node', () => {
    expect(compareTaint(true, undefined).passes).toBe(false);
    expect(compareTaint(false, undefined).passes).toBe(true);
  });
});

describe('independent feasibility and placement', () => {
  it('keeps the capacity verdict identical whatever the toleration says', () => {
    for (const profile of profileIds) {
      expect(tolerated(profile, { cpuFits: false }).capacityPass).toBe(false);
      expect(tolerated(profile, { cpuFits: true }).capacityPass).toBe(true);
    }
  });

  it('never lets a matching toleration make an insufficient node eligible', () => {
    expect(tolerated('all-keys', { cpuFits: false })).toMatchObject({ taintPass: true, eligibleA: false, selected: null });
  });

  it('stops the cartridge at the first closed gate, but still reports the capacity gate on its own', () => {
    expect(tolerated('absent')).toMatchObject({ taintPass: false, capacityPass: true, cartStop: 'taint' });
    expect(tolerated('equal', { cpuFits: false })).toMatchObject({ taintPass: true, capacityPass: false, cartStop: 'capacity' });
    expect(tolerated('equal')).toMatchObject({ cartStop: 'end', selected: 'node-a' });
  });

  it('gives a tolerated candidate no score bonus over an untainted candidate', () => {
    const withoutToleration = evaluate({ ...initialConfig, tainted: false, profile: 'absent', nodeB: true });
    const withToleration = evaluate({ ...initialConfig, tainted: false, profile: 'equal', nodeB: true });
    expect(withToleration.selected).toBe(withoutToleration.selected);
    expect(withToleration.selected).toBe('node-b');
  });

  it('selects node-a only when it is the sole eligible candidate, and nothing without an eligible node', () => {
    expect(evaluate({ ...initialConfig, profile: 'equal' })).toMatchObject({ selected: 'node-a' });
    expect(evaluate(initialConfig).selected).toBeNull();
    expect(evaluate({ ...initialConfig, profile: 'equal', cpuFits: false }).selected).toBeNull();
  });

  it('selects node-b whenever it is present, because it is always eligible in this fixture', () => {
    for (const profile of profileIds) {
      expect(tolerated(profile, { nodeB: true }).selected).toBe('node-b');
    }
  });

  it('keeps selected empty exactly when neither candidate is eligible', () => {
    for (const profile of profileIds) {
      for (const cpuFits of [true, false]) {
        for (const tainted of [true, false]) {
          for (const nodeB of [true, false]) {
            const r = evaluate({ profile, cpuFits, tainted, nodeB });
            expect(r.selected === null).toBe(!r.eligibleA && !r.eligibleB);
          }
        }
      }
    }
  });
});

describe('manifest fields follow the matched state', () => {
  it('renders Exists without a value field, because the API forbids one', () => {
    const ids = podYaml({ ...initialConfig, profile: 'exists' }, 1).map((line) => line.id);
    expect(ids).not.toContain('pod.value');
    expect(podYaml({ ...initialConfig, profile: 'equal' }, 1).map((line) => line.id)).toContain('pod.value');
  });

  it('removes the taint fields from the node manifest when the taint is absent', () => {
    expect(nodeYaml({ ...initialConfig, tainted: false }).map((line) => line.id)).not.toContain('node.key');
    expect(nodeYaml(initialConfig).map((line) => line.id)).toEqual(expect.arrayContaining(['node.key', 'node.value', 'node.effect']));
  });
});

describe('manifest lines highlighted after a run', () => {
  const marks = (overrides: Partial<Config>) => {
    const config = { ...initialConfig, ...overrides };
    return runMarkIds(config, evaluate(config));
  };

  it('highlights only the mismatched taint fields when the taint rejects, not the matching key or value', () => {
    expect(marks({ profile: 'wrong-effect' })).toEqual(['node.effect', 'pod.effect']);
  });

  it('highlights the whole taint block when the toleration is absent, and no passing CPU line', () => {
    const ids = marks({ profile: 'absent' });
    expect(ids).toEqual(expect.arrayContaining(['node.key', 'node.value', 'node.effect', 'pod.key']));
    expect(ids).not.toContain('node.cpu');
  });

  it('highlights only the CPU lines when capacity alone fails', () => {
    expect(marks({ profile: 'equal', cpuFits: false })).toEqual(['node.cpu', 'pod.cpu']);
  });

  it('highlights every compared field when all checks pass', () => {
    expect(marks({ profile: 'equal' })).toEqual(expect.arrayContaining(['node.key', 'node.value', 'node.effect', 'pod.key', 'pod.value', 'pod.effect', 'node.cpu', 'pod.cpu']));
  });
});

describe('pod identity across changes', () => {
  it('edits the pending Pod in place until a run has happened', () => {
    expect(nextSerial(1, false)).toBe(1);
    expect(nextSerial(3, false)).toBe(3);
  });

  it('gives the next Pod the next name only after a run', () => {
    expect(nextSerial(1, true)).toBe(2);
  });

  it('advances once per change made after a run, and never for a change made before one', () => {
    let serial = 1;
    serial = nextSerial(serial, false);
    serial = nextSerial(serial, false);
    expect(serial).toBe(1);
    serial = nextSerial(serial, true);
    expect(serial).toBe(2);
    serial = nextSerial(serial, false);
    expect(serial).toBe(2);
    serial = nextSerial(serial, true);
    expect(serial).toBe(3);
  });
});
