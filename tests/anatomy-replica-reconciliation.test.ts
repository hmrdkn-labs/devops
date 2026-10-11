import { describe, expect, it } from 'vitest';
import { advance, changeTemplate, converged, deletePod, initialState, readyOf, scale, type ReplicaState } from '../src/components/anatomy/replica-reconciliation/model';

function finish(state: ReplicaState): ReplicaState {
  for (let step = 0; step < 80 && !converged(state); step++) state = advance(state);
  expect(converged(state)).toBe(true);
  return state;
}

describe('replica apparatus semantic boundaries', () => {
  it('replaces a deleted UID without changing template, target or surviving identities', () => {
    const deleted = deletePod(initialState(), 2);
    expect(deleted.desired).toBe(3);
    expect(deleted.targets).toEqual([3, 0]);
    expect(deleted.pods.map((pod) => pod.id)).toEqual([1, 3]);
    const created = advance(deleted);
    expect(created.pods.find((pod) => pod.id === 4)).toMatchObject({ revision: 1, ready: false });
    expect(readyOf(created)).toBe(2);
    const restored = finish(created);
    expect(restored.pods.map((pod) => pod.id)).toEqual([1, 3, 4]);
    expect(restored.revision).toBe(1);
    expect(restored.retired).toEqual([2]);
  });

  it('scales to zero and back with fresh UIDs, not a new revision', () => {
    const empty = finish(scale(initialState(), 0));
    expect(empty.pods).toEqual([]);
    expect(empty.targets).toEqual([0, 0]);
    const grown = finish(scale(empty, 4));
    expect(grown.revision).toBe(1);
    expect(grown.targets).toEqual([4, 0]);
    expect(grown.pods.map((pod) => pod.id)).toEqual([4, 5, 6, 7]);
  });

  it.each([1, 2, 3, 4])('keeps Ready capacity and bounds surge during a %i-replica rollout', (desired) => {
    let state = changeTemplate(finish(scale(initialState(), desired)));
    const oldIds = new Set(state.pods.map((pod) => pod.id));
    let sawSurge = false;
    for (let step = 0; step < 80 && !converged(state); step++) {
      state = advance(state);
      expect(state.pods.length).toBeLessThanOrEqual(desired + 1);
      expect(readyOf(state)).toBeGreaterThanOrEqual(desired);
      expect(state.targets[0] + state.targets[1]).toBeLessThanOrEqual(desired + 1);
      for (const pod of state.pods) expect(pod.revision).toBe(oldIds.has(pod.id) ? 1 : 2);
      sawSurge ||= state.pods.length === desired + 1;
    }
    expect(converged(state)).toBe(true);
    expect(sawSurge).toBe(true);
    expect(state.targets).toEqual([0, desired]);
    expect(state.pods.every((pod) => !oldIds.has(pod.id) && pod.revision === 2 && pod.ready)).toBe(true);
  });

  it('does not count Pod creation as readiness or accept a conflicting intent during repair', () => {
    const missing = deletePod(initialState(), 1);
    expect(scale(missing, 4)).toBe(missing);
    expect(changeTemplate(missing)).toBe(missing);
    expect(deletePod(missing, 2)).toBe(missing);
    const created = advance(missing);
    expect(created.pods.length).toBe(3);
    expect(readyOf(created)).toBe(2);
    expect(converged(created)).toBe(false);
    expect(readyOf(advance(created))).toBe(3);
  });

  it('changes a zero-replica template without inventing a Pod', () => {
    const empty = finish(scale(initialState(), 0));
    const changed = changeTemplate(empty);
    expect(changed.revision).toBe(2);
    expect(changed.pods).toEqual([]);
    expect(converged(changed)).toBe(true);
    const grown = finish(scale(changed, 1));
    expect(grown.pods).toEqual([{ id: 4, revision: 2, slot: 0, ready: true }]);
  });
});
