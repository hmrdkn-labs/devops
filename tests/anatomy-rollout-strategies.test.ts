import { describe, expect, it } from 'vitest';
import {
  advance, chooseStrategy, deadlinePasses, deployGreen, DESIRED, endpointsOf, initialState, isWaiting, manifestOf,
  readyOf, resetState, rolloutStatus, setCanary, setDefect, settled, shipTemplate, switchService, trafficOf, undoRollout,
  type Defect, type ReleaseState,
} from '../src/components/anatomy/rollout-strategies/model';

/** Step until the controllers settle, or until they cannot move. */
function stepUntilSettled(state: ReleaseState, limit = 60): ReleaseState {
  for (let step = 0; step < limit && !settled(state) && !isWaiting(state); step++) state = advance(state);
  return state;
}

/** Step a bounded number of times, asserting the invariant after every event. */
function stepChecked(state: ReleaseState, limit = 60): ReleaseState {
  for (let step = 0; step < limit && !settled(state) && !isWaiting(state); step++) {
    state = advance(state);
    expect(state.pods.length).toBeLessThanOrEqual(DESIRED + 1);
    expect(state.pods.every((pod) => state.pods.filter((other) => other.lane === pod.lane && other.slot === pod.slot).length === 1)).toBe(true);
  }
  return state;
}

function rolledOut(defect: Defect = 'healthy'): ReleaseState {
  return stepUntilSettled(shipTemplate(initialState('rolling', defect)));
}

describe('rolling update: revisions, surge and availability', () => {
  it('keeps Ready at or above desired in every event of a healthy rollout', () => {
    let state = shipTemplate(initialState());
    for (let step = 0; step < 60 && !settled(state); step++) {
      state = advance(state);
      expect(readyOf(state)).toBeGreaterThanOrEqual(DESIRED);
      expect(state.pods.length).toBeLessThanOrEqual(DESIRED + 1);
    }
    expect(settled(state)).toBe(true);
    expect(state.pods.every((pod) => pod.lane === 1 && pod.ready)).toBe(true);
    expect(state.lanes[0].target).toBe(0);
    expect(state.lanes[1].target).toBe(DESIRED);
  });

  it('never reuses a retired identity and never gives two Pods the same slot', () => {
    const state = rolledOut();
    const retired = new Set(state.retired);
    expect(state.pods.some((pod) => retired.has(pod.id))).toBe(false);
    expect(new Set(state.retired).size).toBe(state.retired.length);
    expect(state.pods.every((pod) => pod.slot >= 0 && pod.slot < 4)).toBe(true);
  });

  it('gives a reused ReplicaSet the next revision, and a new one its own', () => {
    const first = shipTemplate(initialState());
    expect(first.lanes[1].revision).toBe(2);
    const undone = undoRollout(stepUntilSettled(first));
    expect(undone.lanes[0].revision).toBe(3);
    const shipped = shipTemplate(stepUntilSettled(undone));
    expect(shipped.lanes[1].revision).toBe(4);
    expect(shipped.revisions).toBe(4);
  });

  it('refuses a template change while a rollout is moving, and an undo before any ship', () => {
    const moving = shipTemplate(initialState());
    expect(shipTemplate(moving)).toBe(moving);
    const start = initialState();
    expect(undoRollout(start)).toBe(start);
  });
});

describe('stalled rollout: waiting is not rollback', () => {
  it('keeps the old Ready Pods serving while the new Pod is Not Ready, and never removes a Ready Pod below desired', () => {
    const stalled = stepChecked(shipTemplate(initialState('rolling', 'notReady')));
    expect(isWaiting(stalled)).toBe(true);
    expect(stalled.pods.filter((pod) => pod.lane === 0).map((pod) => pod.id)).toEqual([1, 2, 3]);
    expect(stalled.pods.filter((pod) => pod.lane === 1).every((pod) => !pod.ready)).toBe(true);
    expect(readyOf(stalled)).toBe(DESIRED);
    expect(endpointsOf(stalled).map((pod) => pod.id)).toEqual([1, 2, 3]);
    expect(trafficOf(stalled).newShare).toBe(0);
  });

  it('reports ProgressDeadlineExceeded after the deadline without changing any Pod', () => {
    const stalled = stepChecked(shipTemplate(initialState('rolling', 'notReady')));
    const expired = deadlinePasses(stalled);
    expect(rolloutStatus(expired)).toBe('stalled');
    expect(expired.pods).toEqual(stalled.pods);
    expect(expired.retired).toEqual(stalled.retired);
    expect(expired.lanes).toEqual(stalled.lanes);
  });

  it('lets the deadline pass only while the controllers cannot move', () => {
    const moving = shipTemplate(initialState('rolling', 'healthy'));
    expect(isWaiting(moving)).toBe(false);
    expect(deadlinePasses(moving)).toBe(moving);
    expect(rolloutStatus(moving)).toBe('progressing');
    const stalled = deadlinePasses(stepChecked(shipTemplate(initialState('rolling', 'notReady'))));
    expect(advance(stalled).pods).toEqual(stalled.pods);
  });

  it('undo keeps the surviving old Pods, creates no Pod and removes only the Not Ready new Pod', () => {
    const stalled = deadlinePasses(stepChecked(shipTemplate(initialState('rolling', 'notReady'))));
    const undone = undoRollout(stalled);
    expect(undone.lanes[0].revision).toBe(3);
    expect(undone.nextId).toBe(stalled.nextId);
    const removed = advance(undone);
    expect(removed.retired).toEqual([4]);
    expect(removed.pods.map((pod) => pod.id)).toEqual([1, 2, 3]);
    expect(readyOf(removed)).toBe(DESIRED);
    expect(settled(removed)).toBe(true);
    expect(rolloutStatus(removed)).toBe('complete');
  });
});

describe('undo after a completed rollout', () => {
  it('creates Pods with new identities, not the retired ones', () => {
    const completed = rolledOut();
    const highest = Math.max(...completed.pods.map((pod) => pod.id), ...completed.retired);
    const undone = undoRollout(completed);
    expect(undone.lanes[0].target).toBe(0);
    expect(undone.pods.every((pod) => pod.lane === 1)).toBe(true);
    const rolledBack = stepUntilSettled(undone);
    const created = rolledBack.pods.filter((pod) => pod.lane === 0);
    expect(created).toHaveLength(DESIRED);
    expect(created.every((pod) => pod.id > highest)).toBe(true);
    expect(rolledBack.lanes[0].target).toBe(DESIRED);
    expect(rolledBack.lanes[1].target).toBe(0);
  });
});

describe('blue-green: the selector decides who receives traffic', () => {
  it('leaves Ready green Pods out of the Service until the selector switches', () => {
    let state = deployGreen(initialState('blueGreen'));
    state = stepUntilSettled(state);
    expect(readyOf(state, 1)).toBe(DESIRED);
    expect(endpointsOf(state).every((pod) => pod.lane === 0)).toBe(true);
    expect(trafficOf(state).newShare).toBe(0);
  });

  it('switches all traffic to green, and back to blue without touching either Deployment', () => {
    const blue = initialState('blueGreen');
    const green = stepUntilSettled(deployGreen(blue));
    const switched = switchService(green, 'new');
    expect(trafficOf(switched)).toMatchObject({ newShare: 1, failShare: 0 });
    const restored = switchService(switched, 'old');
    expect(restored.pods).toEqual(green.pods);
    expect(trafficOf(restored).newShare).toBe(0);
  });

  it('leaves no endpoints when the selector points at a green lane that is not Ready yet', () => {
    const creating = deployGreen(initialState('blueGreen', 'notReady'));
    const switched = switchService(creating, 'new');
    expect(endpointsOf(switched)).toHaveLength(0);
    expect(trafficOf(switched).endpoints).toBe(0);
  });

  it('sends every request to a failing build once the selector points at it', () => {
    const green = stepUntilSettled(deployGreen(initialState('blueGreen', 'silentErrors')));
    expect(trafficOf(switchService(green, 'new'))).toMatchObject({ newShare: 1, failShare: 1 });
  });

  it('refuses a switch to a lane that does not exist', () => {
    const blue = initialState('blueGreen');
    expect(switchService(blue, 'new')).toBe(blue);
  });
});

describe('canary: the split follows Ready Pod counts', () => {
  it.each([
    [1, 0.25],
    [2, 0.4],
    [3, 0.5],
  ])('gives the canary %i Ready Pod(s) beside three stable Pods a share of %s', (replicas, share) => {
    const canary = stepUntilSettled(setCanary(initialState('canary'), replicas));
    expect(trafficOf(canary).newShare).toBeCloseTo(share, 10);
  });

  it('keeps a canary that is Not Ready out of the split and reports the wait', () => {
    const canary = stepChecked(setCanary(initialState('canary', 'notReady'), 1));
    expect(isWaiting(canary)).toBe(true);
    expect(trafficOf(canary)).toMatchObject({ endpoints: 3, newShare: 0 });
  });

  it('returns the canary to zero Pods when its replicas are set to zero', () => {
    const canary = stepUntilSettled(setCanary(initialState('canary'), 2));
    const aborted = stepUntilSettled(setCanary(canary, 0));
    expect(aborted.pods.every((pod) => pod.lane === 0)).toBe(true);
    expect(trafficOf(aborted).newShare).toBe(0);
  });

  it('refuses replica counts outside the fixture range', () => {
    const canary = initialState('canary');
    expect(setCanary(canary, -1)).toBe(canary);
    expect(setCanary(canary, 4)).toBe(canary);
    expect(setCanary(canary, 1.5)).toBe(canary);
  });
});

describe('controls and invariants', () => {
  it('locks the build behaviour once a v2 object exists', () => {
    const started = shipTemplate(initialState('rolling', 'healthy'));
    expect(setDefect(started, 'notReady')).toBe(started);
    const fresh = initialState('rolling', 'healthy');
    expect(setDefect(fresh, 'silentErrors').defect).toBe('silentErrors');
  });

  it('keeps the chosen build across a reset, and a new strategy starts from its own start state', () => {
    const failing = shipTemplate(initialState('rolling', 'silentErrors'));
    expect(resetState(stepUntilSettled(failing)).defect).toBe('silentErrors');
    expect(chooseStrategy(failing, 'blueGreen').strategy).toBe('blueGreen');
    expect(chooseStrategy(failing, 'blueGreen').pods.map((pod) => pod.lane)).toEqual([0, 0, 0]);
  });

  it('settled states do not move, and each manifest highlight names a field that is in the manifest', () => {
    const settledStart = initialState();
    expect(advance(settledStart)).toBe(settledStart);
    const states = [
      shipTemplate(initialState('rolling', 'notReady')),
      deadlinePasses(stepChecked(shipTemplate(initialState('rolling', 'notReady')))),
      undoRollout(stepChecked(shipTemplate(initialState('rolling', 'notReady')))),
      switchService(stepUntilSettled(deployGreen(initialState('blueGreen'))), 'new'),
      setCanary(initialState('canary'), 2),
    ];
    for (const state of states) {
      const fields = new Set(manifestOf(state).map((line) => line.field).filter(Boolean));
      for (const field of state.change.reads) expect(fields.has(field)).toBe(true);
    }
  });

  it('reports the same status for a settled rollout and an initial bench', () => {
    expect(rolloutStatus(initialState())).toBe('complete');
    expect(rolloutStatus(initialState('canary'))).toBe('none');
  });
});
