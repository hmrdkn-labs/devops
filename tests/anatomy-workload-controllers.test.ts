import { describe, expect, it } from 'vitest';
import {
  BACKOFF_LIMIT, CRON_HISTORY, POOL, SHELF_SLOTS, SOCKETS, TRAY_SLOTS, activeJob, apply, boundOn, chooseKind, deletePod, fail, finish,
  initialState, kinds, livePods, manifestLines, nextStep, nodeIds, placeOf, readyCount, setReplicas, step, tick, toggleNode,
  type Pod, type Stage, type WorkloadState,
} from '../src/components/anatomy/workload-controllers/model';

const ORDER: Record<Stage, number> = { unassigned: 0, assigned: 1, running: 2, ready: 3, succeeded: 4, failed: 4 };
const bound = (pod: Pod) => pod.stage === 'assigned' || pod.stage === 'running' || pod.stage === 'ready';
const terminal = (pod: Pod) => pod.stage === 'succeeded' || pod.stage === 'failed';

/** Apply the controllers' pending events until none remain. */
function settle(s: WorkloadState, limit = 200): WorkloadState {
  let next = s;
  for (let i = 0; i < limit && nextStep(next); i++) next = step(next);
  expect(nextStep(next)).toBeNull();
  return next;
}

/** Fail running Job Pods until the Job is no longer active (Failed or complete). */
function failJob(s: WorkloadState): WorkloadState {
  let next = s;
  for (let i = 0; i < 10 && activeJob(next); i++) next = settle(fail(settle(next)));
  return next;
}

function expectInvariants(s: WorkloadState) {
  for (const pod of s.pods) {
    if (pod.stage === 'unassigned') expect(pod.node).toBeNull();
    if (bound(pod)) {
      expect(pod.node).not.toBeNull();
      expect(s.nodes[pod.node!]).toBe(true);
    }
  }
  expect(new Set(s.pods.map((pod) => pod.el)).size).toBe(s.pods.length);
  expect(s.pods.every((pod) => pod.el < POOL)).toBe(true);
  for (const node of nodeIds) expect(boundOn(s, node)).toBeLessThanOrEqual(SOCKETS);
  expect(s.pods.filter((pod) => pod.stage === 'unassigned').length).toBeLessThanOrEqual(TRAY_SLOTS);
  expect(s.pods.filter(terminal).length).toBeLessThanOrEqual(SHELF_SLOTS);
  const manifestKeys = new Set(manifestLines(s).map((line) => line.key));
  for (const key of s.event.highlight) expect(manifestKeys.has(key)).toBe(true);
}

/** A Pod that survives a transition only moves forward: unassigned → assigned → running → ready → terminal. */
function expectForwardTransitions(before: WorkloadState, after: WorkloadState) {
  for (const pod of after.pods) {
    const earlier = before.pods.find((candidate) => candidate.uid === pod.uid);
    if (earlier) expect(ORDER[pod.stage]).toBeGreaterThanOrEqual(ORDER[earlier.stage]);
  }
}

describe('controller workload fixture', () => {
  it('keeps every kind inside its invariants through a full lifecycle', () => {
    for (const kind of kinds) {
      let s = kind === 'CronJob' ? tick(apply(initialState(kind))) : apply(initialState(kind));
      expectInvariants(s);
      for (let i = 0; i < 80 && nextStep(s); i++) {
        const next = step(s);
        expectForwardTransitions(s, next);
        expectInvariants(next);
        s = next;
      }
    }
  });

  it('does nothing before apply, and an applied kind cannot be swapped under its controller', () => {
    const draft = initialState('Job');
    expect(nextStep(draft)).toBeNull();
    expect(step(draft)).toBe(draft);
    const applied = apply(draft);
    expect(chooseKind(applied, 'Deployment')).toBe(applied);
    expect(apply(applied)).toBe(applied);
  });

  it('keeps Assigned, Running and Ready as three different stages', () => {
    let s = setReplicas(apply(initialState('Deployment')), 1);
    s = step(s);
    expect(s.pods[0]!.stage).toBe('unassigned');
    expect(placeOf(s, s.pods[0]!)).toEqual({ where: 'tray', index: 0 });
    s = step(s);
    expect(s.pods[0]!.stage).toBe('assigned');
    expect(placeOf(s, s.pods[0]!)).toMatchObject({ where: 'bay', seated: false });
    expect(readyCount(s)).toBe(0);
    s = step(s);
    expect(s.pods[0]!.stage).toBe('running');
    expect(placeOf(s, s.pods[0]!)).toMatchObject({ where: 'bay', seated: true });
    expect(readyCount(s)).toBe(0);
    s = step(s);
    expect(s.pods[0]!.stage).toBe('ready');
    expect(readyCount(s)).toBe(1);
  });

  it('keeps Pods unassigned and not Ready when no present node has a free socket', () => {
    let s = apply(initialState('Deployment'));
    for (const node of nodeIds) if (s.nodes[node]) s = toggleNode(s, node);
    for (let i = 0; i < 6; i++) s = step(s);
    expect(livePods(s).length).toBe(3);
    expect(livePods(s).every((pod) => pod.stage === 'unassigned' && pod.node === null)).toBe(true);
    expect(readyCount(s)).toBe(0);
    expectInvariants(s);
  });
});

describe('Deployment: a deleted Pod is replaced, never returned', () => {
  it('replaces a deleted Pod with a new UID and leaves desired state alone', () => {
    const ready = settle(apply(initialState('Deployment')));
    expect(readyCount(ready)).toBe(3);
    const deleted = deletePod(ready, 2);
    expect(livePods(deleted).map((pod) => pod.uid)).toEqual([1, 3]);
    expect(deleted.replicas).toBe(3);
    const settled = settle(deleted);
    expect(livePods(settled).map((pod) => pod.uid)).toEqual([1, 3, 4]);
    expect(readyCount(settled)).toBe(3);
    expectInvariants(settled);
  });

  it('removes the newest Pod first when scaling down, and scaling to zero leaves no live Pod', () => {
    const three = settle(apply(initialState('Deployment')));
    const one = settle(setReplicas(three, 1));
    expect(livePods(one).map((pod) => pod.uid)).toEqual([1]);
    const empty = settle(setReplicas(one, 0));
    expect(livePods(empty)).toEqual([]);
    expect(empty.replicas).toBe(0);
  });

  it('never lets a controller step change the desired replica count or the kind', () => {
    let s = apply(initialState('Deployment'));
    for (let i = 0; i < 40 && nextStep(s); i++) {
      s = step(s);
      expect(s.replicas).toBe(3);
      expect(s.kind).toBe('Deployment');
    }
  });
});

describe('StatefulSet: stable ordinals, ordered start, retained claims', () => {
  it('creates a higher ordinal only after every lower ordinal is Ready', () => {
    let s = apply(initialState('StatefulSet'));
    for (let i = 0; i < 80 && nextStep(s); i++) {
      s = step(s);
      for (const pod of s.pods.filter((candidate) => (candidate.ordinal ?? 0) > 0)) {
        const lower = s.pods.filter((candidate) => (candidate.ordinal ?? 0) < (pod.ordinal ?? 0));
        expect(lower.every((candidate) => candidate.stage === 'ready')).toBe(true);
      }
    }
    expect(readyCount(s)).toBe(3);
  });

  it('gives a deleted ordinal a new UID under the same name and reattaches its claim', () => {
    const ready = settle(apply(initialState('StatefulSet')));
    const old = ready.pods.find((pod) => pod.ordinal === 1)!;
    const back = settle(deletePod(ready, old.uid));
    const replacement = back.pods.find((pod) => pod.ordinal === 1)!;
    expect(replacement.uid).toBeGreaterThan(old.uid);
    expect(back.claims).toEqual([0, 1, 2]);
    expect(readyCount(back)).toBe(3);
    expectInvariants(back);
  });

  it('scales down the highest ordinal first and keeps its claim for a later scale-up', () => {
    const ready = settle(apply(initialState('StatefulSet')));
    const shrunk = step(setReplicas(ready, 2));
    expect(shrunk.pods.some((pod) => pod.ordinal === 2)).toBe(false);
    expect(shrunk.claims).toEqual([0, 1, 2]);
    const grown = settle(setReplicas(settle(shrunk), 3));
    expect(grown.pods.find((pod) => pod.ordinal === 2)!.uid).toBeGreaterThan(ready.nextUid - 1);
    expect(grown.claims).toEqual([0, 1, 2]);
    expect(readyCount(grown)).toBe(3);
  });
});

describe('DaemonSet: one Pod per present eligible node', () => {
  it('places one Pod on each present node, removes a removed node’s Pod, and adds one for a new node', () => {
    let s = settle(apply(initialState('DaemonSet')));
    const pinned = (state: WorkloadState) => livePods(state).map((pod) => pod.pinned).sort();
    expect(pinned(s)).toEqual(['node-a', 'node-b', 'node-c']);
    s = toggleNode(s, 'node-b');
    expect(livePods(s).some((pod) => pod.pinned === 'node-b')).toBe(false);
    s = settle(s);
    expect(pinned(s)).toEqual(['node-a', 'node-c']);
    s = settle(toggleNode(s, 'node-d'));
    expect(pinned(s)).toEqual(['node-a', 'node-c', 'node-d']);
    expectInvariants(s);
  });

  it('never places a DaemonSet Pod on a node that is absent', () => {
    const s = settle(apply(initialState('DaemonSet')));
    expect(livePods(s).every((pod) => pod.pinned !== 'node-d')).toBe(true);
  });
});

describe('Job: completions and parallelism bound the run', () => {
  it('never exceeds parallelism and creates exactly as many Pods as the completions need', () => {
    let s = settle(apply(initialState('Job')));
    expect(livePods(s).length).toBe(2);
    s = settle(finish(s));
    expect(livePods(s).length).toBeLessThanOrEqual(2);
    s = settle(finish(s));
    s = finish(s);
    expect(s.jobs[0]).toMatchObject({ succeeded: 3, status: 'complete' });
    expect(livePods(s)).toEqual([]);
    expect(nextStep(s)).toBeNull();
    expect(s.nextUid - 1).toBe(3);
    expectInvariants(s);
  });

  it('does not treat an unstarted Pod as finished', () => {
    const applied = apply(initialState('Job'));
    expect(finish(applied)).toBe(applied);
    expect(fail(applied)).toBe(applied);
  });

  it('replaces failed Pods while failures stay within backoffLimit, and fails the Job when they exceed it', () => {
    let s = settle(apply(initialState('Job')));
    s = fail(s);
    expect(s.jobs[0]).toMatchObject({ failed: 1, status: 'active' });
    s = settle(s);
    expect(livePods(s).length).toBe(2);
    s = fail(s);
    expect(s.jobs[0]).toMatchObject({ failed: BACKOFF_LIMIT, status: 'active' });
    s = settle(s);
    expect(livePods(s).length).toBe(2);
    s = fail(s);
    expect(s.jobs[0]).toMatchObject({ failed: BACKOFF_LIMIT + 1, status: 'failed' });
    expect(livePods(s)).toEqual([]);
    expect(nextStep(s)).toBeNull();
    expectInvariants(s);
  });
});

describe('CronJob: Forbid and history limits', () => {
  it('skips a scheduled run while the previous Job is still active', () => {
    let s = tick(apply(initialState('CronJob')));
    expect(s.jobs.map((job) => job.name)).toEqual(['report-1']);
    s = tick(s);
    expect(s.jobs.map((job) => job.name)).toEqual(['report-1']);
    s = finish(settle(s));
    s = tick(s);
    expect(s.jobs.map((job) => job.name)).toEqual(['report-1', 'report-2']);
  });

  it('keeps the newest successful and failed Jobs within the history limits, with their Pods', () => {
    let s = apply(initialState('CronJob'));
    for (let run = 0; run < CRON_HISTORY.successful + 1; run++) {
      s = finish(settle(tick(s)));
    }
    expect(s.jobs.filter((job) => job.status === 'complete').map((job) => job.name)).toEqual(['report-2', 'report-3', 'report-4']);
    expect(s.pods.some((pod) => pod.owner === 'job/report-1')).toBe(false);
    for (let run = 0; run < CRON_HISTORY.failed + 1; run++) {
      s = failJob(settle(tick(s)));
    }
    expect(s.jobs.filter((job) => job.status === 'failed').length).toBe(CRON_HISTORY.failed);
    expect(s.jobs.filter((job) => job.status === 'complete').length).toBe(CRON_HISTORY.successful);
    expectInvariants(s);
  });
});

describe('Node removal', () => {
  it('evicts live Pods from a removed node and creates no replacement in the same event', () => {
    const ready = settle(apply(initialState('Deployment')));
    const onA = livePods(ready).filter((pod) => pod.node === 'node-a').length;
    expect(onA).toBeGreaterThan(0);
    const removed = toggleNode(ready, 'node-a');
    expect(livePods(removed).length).toBe(3 - onA);
    expect(boundOn(removed, 'node-a')).toBe(0);
    expectInvariants(removed);
  });
});
