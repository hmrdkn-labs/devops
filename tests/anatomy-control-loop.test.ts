import { describe, expect, it } from 'vitest';
import {
  converged, deletePodObject, dropHints, editReplicas, initialState, manifestOf, pass, readyOf, reportReady, statusCurrent,
  tiltOf, type LoopState,
} from '../src/components/anatomy/control-loop/model';

/** The facts a pass may change. Change reports and hint counts are presentation, not state. */
const facts = (state: LoopState) => ({
  desired: state.desired,
  generation: state.generation,
  status: state.status,
  pods: state.pods,
  nextId: state.nextId,
  retired: state.retired,
});

/** Node side and controller alternate until nothing is left: the fixture's own convergence path. */
function settle(state: LoopState): LoopState {
  let next = state;
  for (let step = 0; step < 40 && !converged(next); step++) {
    next = next.pods.some((pod) => !pod.ready) ? reportReady(next) : pass(next);
  }
  expect(converged(next)).toBe(true);
  return next;
}

describe('control loop semantic boundaries', () => {
  it('starts converged: observed equals desired, every Pod is Ready, and stored status matches', () => {
    const start = initialState();
    expect(converged(start)).toBe(true);
    expect(statusCurrent(start)).toBe(true);
    expect(tiltOf(start)).toBe(0);
  });

  it('a spec edit bumps the generation and changes no Pod object or stored status', () => {
    const start = initialState();
    const edited = editReplicas(start, 4);
    expect(edited.desired).toBe(4);
    expect(edited.generation).toBe(2);
    expect(edited.pods).toBe(start.pods);
    expect(edited.status).toBe(start.status);
    expect(converged(edited)).toBe(false);
  });

  it('rejects counts outside the fixture range and no-op edits', () => {
    const start = initialState();
    for (const bad of [-1, 5, 2.5, Number.NaN]) expect(editReplicas(start, bad)).toBe(start);
    expect(editReplicas(start, start.desired)).toBe(start);
  });

  it('a pass creates exactly one Pod, as Created and never Ready', () => {
    const state = pass(editReplicas(initialState(), 4));
    expect(state.pods).toHaveLength(4);
    expect(state.pods[3]).toMatchObject({ ready: false, slot: 3 });
    expect(readyOf(state)).toBe(3);
    expect(state.nextId).toBe(5);
    expect(converged(state)).toBe(false);
  });

  it('a pass removes the newest Pod when every Pod is Ready', () => {
    const after = pass(editReplicas(initialState(), 2));
    expect(after.pods.map((pod) => pod.id)).toEqual([1, 2]);
    expect(after.retired).toEqual([initialState().pods[2]!.name]);
  });

  it('a pass removes a not-Ready Pod it created when the spec drops again', () => {
    const created = pass(editReplicas(initialState(), 4));
    const removed = pass(editReplicas(created, 3));
    expect(removed.pods.map((pod) => pod.id)).toEqual([1, 2, 3]);
    expect(removed.retired).toEqual([created.pods[3]!.name]);
  });

  it('a status write changes only the stored report, never a Pod object', () => {
    const converging = pass(reportReady(pass(editReplicas(initialState(), 4))));
    expect(converging.lastRequest).toBe('status');
    expect(converging.pods).toHaveLength(4);
    expect(converged(converging)).toBe(true);
    expect(converging.status).toEqual({ observedGeneration: 2, replicas: 4, readyReplicas: 4 });
  });

  it('reports the readiness it observed without setting it: a Pod stays Not Ready until the node side acts', () => {
    const created = pass(editReplicas(initialState(), 4));
    const reported = pass(created);
    expect(reported.lastRequest).toBe('status');
    expect(reported.status.readyReplicas).toBe(3);
    const waiting = pass(reported);
    expect(waiting.lastRequest).toBe('none');
    expect(waiting.pods.some((pod) => !pod.ready)).toBe(true);
    expect(converged(waiting)).toBe(false);
  });

  it('is idempotent: a pass on converged state changes no fact and sends no request', () => {
    const start = initialState();
    const once = pass(start);
    expect(facts(once)).toEqual(facts(start));
    expect(once.lastRequest).toBe('none');
    expect(facts(pass(once))).toEqual(facts(once));
  });

  it('after drift, a replacement gets a new name in the freed socket and the old name never returns', () => {
    const start = initialState();
    const drifted = deletePodObject(start, 2);
    expect(drifted.pods.map((pod) => pod.id)).toEqual([1, 3]);
    expect(drifted.desired).toBe(3);
    expect(drifted.generation).toBe(start.generation);
    const replaced = pass(drifted);
    const created = replaced.pods.find((pod) => pod.id === 4);
    expect(created).toMatchObject({ ready: false, slot: 1 });
    expect(created!.name).not.toBe(start.pods[1]!.name);
    expect(replaced.retired).toEqual([start.pods[1]!.name]);
    expect(converged(settle(replaced))).toBe(true);
  });

  it('repairs a deleted Pod only while observed stays below desired', () => {
    const shortOne = pass(deletePodObject(initialState(), 1));
    expect(shortOne.pods).toHaveLength(3);
    const surplus = deletePodObject(editReplicas(initialState(), 2), 1);
    expect(pass(surplus).pods).toHaveLength(2);
    expect(pass(surplus).nextId).toBe(initialState().nextId);
  });

  it('coalesces a spec edit that went up and back down before a pass, without creating a Pod', () => {
    const start = initialState();
    const back = editReplicas(editReplicas(start, 4), 2);
    expect(back.generation).toBe(3);
    const after = pass(back);
    expect(after.nextId).toBe(start.nextId);
    expect(after.pods).toHaveLength(2);
  });

  it('converges to the same spec and Pod facts whether or not the watch hints were dropped', () => {
    const edited = editReplicas(initialState(), 4);
    const dropped = dropHints(edited);
    expect(dropped.hints).toBe(0);
    expect(facts(settle(dropped))).toEqual(facts(settle(edited)));
  });

  it('never reuses a Pod name or shares a live slot across edits, drift and readiness', () => {
    let state = initialState();
    const everNamed = new Set(state.pods.map((pod) => pod.name));
    const script: Array<(s: LoopState) => LoopState> = [
      (s) => editReplicas(s, 4), pass, reportReady, pass,
      (s) => deletePodObject(s, s.pods[0]!.id), pass,
      (s) => editReplicas(s, 0), pass, pass,
      (s) => editReplicas(s, 4), pass, reportReady, reportReady, pass, pass,
    ];
    for (const step of script) {
      state = step(state);
      expect(state.pods.length).toBeLessThanOrEqual(4);
      expect(new Set(state.pods.map((pod) => pod.slot)).size).toBe(state.pods.length);
      for (const pod of state.pods) everNamed.add(pod.name);
    }
    expect(everNamed.size).toBe(state.nextId - 1);
    expect(converged(settle(state))).toBe(true);
  });

  it('marks the spec or status fields a step read, so the manifest highlights them', () => {
    expect(editReplicas(initialState(), 4).change.reads).toEqual(['replicas', 'generation']);
    const created = pass(editReplicas(initialState(), 4));
    expect(created.change.reads).toEqual(['replicas']);
    expect(reportReady(created).change.reads).toEqual([]);
    const reported = pass(reportReady(created));
    expect(reported.change.reads).toEqual(['observedGeneration', 'statusReplicas', 'statusReady']);
    expect(manifestOf(reported).some((line) => line.field === 'observedGeneration')).toBe(true);
  });
});
