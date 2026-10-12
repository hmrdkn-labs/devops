import { describe, expect, it } from 'vitest';
import {
  advance, bedOf, changeTemplate, converged, deletePod, initialState, manifestOf, podAt, readyOf, scale, select, type ReplicaState,
} from '../src/components/anatomy/replica-reconciliation/model';

function finish(state: ReplicaState): ReplicaState {
  for (let step = 0; step < 80 && !converged(state); step++) state = advance(state);
  expect(converged(state)).toBe(true);
  return state;
}

describe('replica apparatus semantic boundaries', () => {
  it('replaces a deleted UID in the reused slot without changing intent or surviving identities', () => {
    const deleted = deletePod(initialState(), 2);
    expect(deleted.desired).toBe(3);
    expect(deleted.targets).toEqual([3, 0]);
    expect(deleted.pods.map((pod) => pod.id)).toEqual([1, 3]);
    const created = advance(deleted);
    expect(podAt(created, 1, 1)).toMatchObject({ id: 4, revision: 1, ready: false });
    expect(readyOf(created)).toBe(2);
    const restored = finish(created);
    expect(restored.pods.map((pod) => pod.id)).toEqual([1, 3, 4]);
    expect(restored.revision).toBe(1);
    expect(restored.retired).toEqual([2]);
  });

  it('reports per-ReplicaSet counts at first v2 creation as 3/3/3/0 and 1/1/0/1', () => {
    let state = changeTemplate(initialState());
    expect(bedOf(state, 2)).toMatchObject({ exists: true, target: 0, current: 0 });
    state = advance(state);
    state = advance(state);
    expect(bedOf(state, 1)).toEqual({ revision: 1, exists: true, target: 3, current: 3, ready: 3, notReady: 0 });
    expect(bedOf(state, 2)).toEqual({ revision: 2, exists: true, target: 1, current: 1, ready: 0, notReady: 1 });
  });

  it('has no RS-v2 bed before a template change', () => {
    expect(bedOf(initialState(), 2).exists).toBe(false);
  });

  it('keeps selection on the chosen Pod and never moves it to another Pod', () => {
    const state = initialState();
    expect(select(state, 99)).toBe(state);
    const chosen = select(state, 3);
    expect(chosen.selected).toBe(3);
    expect(deletePod(chosen, 3).selected).toBeNull();
    const scaledDown = advance(scale(chosen, 1));
    expect(scaledDown.pods.map((pod) => pod.id)).toEqual([1, 2]);
    expect(scaledDown.selected).toBeNull();
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

  it('names the Deployment field that drove each step, and the manifest follows the template revision', () => {
    expect(scale(initialState(), 2).change.reads).toEqual(['replicas']);
    const changed = changeTemplate(initialState());
    expect(changed.change.reads).toEqual(['image']);
    expect(manifestOf(changed).find((line) => line.field === 'image')?.text).toContain('app:v2');
    const raised = advance(changed);
    expect(raised.change.reads).toEqual(['maxSurge']);
    const rolled = finish(changed).targets;
    expect(rolled).toEqual([0, 3]);
  });

  it('a reset state has three Ready RS-v1 Pods, no selection and no RS-v2 bed', () => {
    const start = initialState();
    expect(start.pods.map((pod) => [pod.id, pod.revision, pod.ready])).toEqual([[1, 1, true], [2, 1, true], [3, 1, true]]);
    expect(start.selected).toBeNull();
    expect(bedOf(start, 2).exists).toBe(false);
  });
});
