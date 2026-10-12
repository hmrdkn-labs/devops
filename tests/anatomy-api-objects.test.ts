import { describe, expect, it } from 'vitest';
import {
  apply, cardMatchesStored, deleteObject, editCard, gateOf, initialState, observationCurrent, podsBecomeReady, readyPods, reset, RS_PREFIX,
  sync, cardStatus, type ApiState, type Transition,
} from '../src/components/anatomy/api-objects/model';

const names = (state: ApiState) => state.pods.map((pod) => pod.name);
const settle = (state: ApiState): ApiState => sync(state).state;

describe('API object acceptance and the card boundary', () => {
  it('editing the local card changes neither the stored object nor its Pods', () => {
    const start = initialState();
    const edited = editCard(start, 'replicas', 4).state;
    expect(edited.stored).toEqual(start.stored);
    expect(edited.pods).toEqual(start.pods);
    expect(cardMatchesStored(edited)).toBe(false);
  });

  it.each([true, false])('rejects a selector that does not match the template (object exists: %s) without persisting', (exists) => {
    const base = exists ? initialState() : deleteObject(initialState()).state;
    const result = apply(editCard(base, 'selector', 'api').state);
    expect(result.state.clock).toBe(base.clock);
    expect(result.state.stored).toEqual(base.stored);
    expect(result.state.pods).toEqual(base.pods);
  });

  it('applying an unchanged spec keeps generation and Pods', () => {
    const start = initialState();
    const result = apply(start).state;
    expect(result.stored).toEqual(start.stored);
    expect(result.pods).toEqual(start.pods);
  });

  it('a spec change advances generation once while status keeps the previous generation', () => {
    const start = initialState();
    const changed = apply(editCard(start, 'replicas', 3).state).state;
    expect(changed.stored!.generation).toBe(2);
    expect(changed.stored!.observedGeneration).toBe(1);
    expect(changed.stored!.replicas).toBe(3);
    expect(names(changed)).toEqual(names(start));
    expect(observationCurrent(changed)).toBe(false);
  });

  it('sync observes the new generation and creates Pods that are not Ready yet', () => {
    const applied = apply(editCard(initialState(), 'replicas', 4).state).state;
    const synced = sync(applied).state;
    expect(synced.stored!.observedGeneration).toBe(synced.stored!.generation);
    expect(synced.pods).toHaveLength(4);
    const created = synced.pods.filter((pod) => !applied.pods.some((old) => old.name === pod.name));
    expect(created).toHaveLength(2);
    expect(created.every((pod) => !pod.ready)).toBe(true);
    expect(synced.stored!.statusReady).toBe(2);
  });

  it('Pods becoming Ready leave status unchanged until the controller syncs again', () => {
    const pending = settle(apply(editCard(initialState(), 'replicas', 3).state).state);
    expect(pending.pods.some((pod) => !pod.ready)).toBe(true);
    const ready = podsBecomeReady(pending).state;
    expect(readyPods(ready)).toBe(3);
    expect(ready.stored!.statusReady).toBe(pending.stored!.statusReady);
    expect(observationCurrent(ready)).toBe(false);
    const reported = sync(ready).state;
    expect(reported.stored!.statusReady).toBe(3);
    expect(observationCurrent(reported)).toBe(true);
  });

  it('scale-down removes the highest slot; a later scale-up never reuses a retired Pod name', () => {
    const start = names(initialState());
    const scaled = settle(apply(editCard(initialState(), 'replicas', 1).state).state);
    expect(names(scaled)).toEqual([start[0]]);
    const grown = names(settle(apply(editCard(scaled, 'replicas', 3).state).state));
    expect(grown).toHaveLength(3);
    expect(new Set(grown).size).toBe(3);
    expect(grown).not.toContain(start[1]);
  });
});

describe('API object identity across delete and recreate', () => {
  it('re-applying after delete creates a new UID at generation 1 with an empty status', () => {
    const deleted = deleteObject(initialState());
    expect(deleted.state.stored).toBeNull();
    expect(deleted.state.pods).toEqual([]);
    const created = apply(deleted.state).state;
    expect(created.stored!.uid).not.toBe('u1');
    expect(created.stored!.generation).toBe(1);
    expect(created.stored!.observedGeneration).toBe(0);
    expect(created.stored!.statusReplicas).toBe(0);
    expect(created.pods).toEqual([]);
  });

  it('gives recreated Pods names that were never used before the delete', () => {
    const before = new Set(names(initialState()));
    const recreated = names(settle(apply(deleteObject(initialState()).state).state));
    expect(recreated).toHaveLength(2);
    for (const name of recreated) expect(before.has(name)).toBe(false);
  });

  it('deleting removes the object and its Pods at once; deleting again changes nothing', () => {
    const once = deleteObject(initialState()).state;
    expect(once.stored).toBeNull();
    expect(once.pods).toEqual([]);
    expect(deleteObject(once).state).toEqual(once);
  });
});

describe('gate readout', () => {
  it('a rejected apply sets the gate, and a later sync leaves that last apply result in place', () => {
    const rejected = apply(editCard(initialState(), 'selector', 'api').state);
    expect(gateOf(rejected.event)).toMatchObject({ result: 'rejected' });
    expect(gateOf(sync(rejected.state).event)).toBeNull();
  });

  it('an accepted apply sets the gate to accepted', () => {
    const accepted = apply(editCard(initialState(), 'replicas', 3).state);
    expect(gateOf(accepted.event)).toMatchObject({ result: 'accepted' });
  });
});

describe('card status across edit, apply and delete', () => {
  it('edited -> rejected -> edited: a rejected apply stays rejected until the card is edited again', () => {
    const edited = editCard(initialState(), 'selector', 'api').state;
    expect(cardStatus(edited)).toBe('edited');
    const rejected = apply(edited).state;
    expect(cardStatus(rejected)).toBe('rejected');
    const reEdited = editCard(rejected, 'replicas', 3).state;
    expect(cardStatus(reEdited)).toBe('edited');
  });

  it('an accepted apply makes the card equal to the stored spec', () => {
    const applied = apply(editCard(initialState(), 'replicas', 3).state).state;
    expect(cardStatus(applied)).toBe('equal');
  });

  it('editing back to the stored value makes the card equal again', () => {
    const back = editCard(editCard(initialState(), 'replicas', 3).state, 'replicas', 2).state;
    expect(cardStatus(back)).toBe('equal');
  });

  it('deleting the object after an accepted apply reads as deleted, not as an edit', () => {
    expect(cardStatus(deleteObject(initialState()).state)).toBe('deleted');
  });
});

describe('API object invariants over deterministic action sequences', () => {
  const sequences: Array<Array<(s: ApiState) => Transition>> = [
    [
      (s) => editCard(s, 'replicas', 4),
      apply, sync, podsBecomeReady, sync,
      (s) => editCard(s, 'replicas', 1), apply, sync,
      (s) => editCard(s, 'selector', 'api'), apply,
      (s) => editCard(s, 'selector', 'web'), deleteObject, apply, sync, podsBecomeReady, sync,
    ],
    [
      (s) => editCard(s, 'replicas', 3), apply, podsBecomeReady, apply, sync,
      (s) => editCard(s, 'replicas', 2), apply, sync, sync,
    ],
  ];

  it.each(sequences.map((steps, index) => [index, steps] as const))('sequence %i keeps counters, Pod names and generations consistent', (_, steps) => {
    let state = initialState();
    let lastGeneration = state.stored!.generation;
    let lastResourceVersion = state.stored!.resourceVersion;
    let lastUid = state.stored!.uid;
    let previous = new Set(names(state));
    const everNamed = new Set(previous);
    for (const step of steps) {
      state = step(state).state;
      const now = new Set(names(state));
      for (const name of now) {
        expect(name.startsWith(RS_PREFIX)).toBe(true);
        // A Pod name absent before this step must be new, never a retired name.
        if (!previous.has(name)) expect(everNamed.has(name)).toBe(false);
        everNamed.add(name);
      }
      previous = now;
      if (state.stored) {
        expect(state.stored.statusReady).toBeLessThanOrEqual(state.stored.statusReplicas);
        expect(readyPods(state)).toBeLessThanOrEqual(state.pods.length);
        expect(new Set(state.pods.map((pod) => pod.slot)).size).toBe(state.pods.length);
        expect(state.stored.observedGeneration).toBeLessThanOrEqual(state.stored.generation);
        if (state.stored.uid === lastUid) {
          expect(state.stored.generation).toBeGreaterThanOrEqual(lastGeneration);
          expect(state.stored.resourceVersion).toBeGreaterThanOrEqual(lastResourceVersion);
        }
        lastGeneration = state.stored.generation;
        lastResourceVersion = state.stored.resourceVersion;
        lastUid = state.stored.uid;
      }
    }
  });

  it('sync on a converged object changes nothing', () => {
    const converged = settle(initialState());
    expect(sync(converged).state).toEqual(converged);
  });

  it('reset restores the fixture starting state', () => {
    expect(reset().state).toEqual(initialState());
  });
});
