import { describe, expect, it } from 'vitest';
import {
  advance, decide, initialCluster, isSettled, placementOf, planNext, roomOn, setAutoscaler, setMaxReplicas, setTraffic, setWindow, sync,
  type Cluster, type Pod,
} from '../src/components/anatomy/autoscaling/model';

function settle(cluster: Cluster, limit = 60): Cluster {
  let state = cluster;
  for (let step = 0; step < limit; step++) {
    const next = advance(state);
    if (!next) break;
    state = next.next;
  }
  return state;
}

const withPods = (cluster: Cluster, pods: Pod[], replicas = pods.length): Cluster => ({ ...cluster, pods, replicas, nextPod: 10 });

describe('HPA decision boundaries', () => {
  it('scales up by ceil(current × utilization / target) and writes spec.replicas at once', () => {
    const loaded = setTraffic(initialCluster(250), 400);
    const result = sync(loaded);
    expect(result?.decision).toMatchObject({ status: 'scale-up', utilization: 80, raw: 4, recommendation: 4, desired: 4 });
    expect(result?.next.replicas).toBe(4);
  });

  it('does nothing inside the ±10% tolerance, with a margin for float noise', () => {
    const edge = sync(setTraffic(initialCluster(250), 270));
    expect(edge?.decision.status).toBe('no-change');
    expect(edge?.next.replicas).toBe(2);
  });

  it('never acts on CPU when the container declares no CPU request', () => {
    const none = initialCluster(null);
    expect(sync(setTraffic(none, 1000))?.decision).toMatchObject({ status: 'no-metric', utilization: null });
    expect(sync(setTraffic(none, 1000))?.next.replicas).toBe(2);
  });

  it('clamps a larger recommendation to maxReplicas and records the unclamped value', () => {
    const result = sync(setTraffic(initialCluster(250), 1000));
    expect(result?.decision).toMatchObject({ raw: 8, recommendation: 6, desired: 6, status: 'scale-up' });
    expect(result?.next.replicas).toBe(6);
  });

  it('holds scale-down until the window has seen the lower recommendation for a full window', () => {
    const pods: Pod[] = [1, 2, 3, 4, 5, 6].map((id) => ({ id, node: id % 2 ? 1 : 2, ready: true }));
    let state = setTraffic(withPods({ ...initialCluster(250), hpa: { status: 'no-change', utilization: 50, recommendation: 6, desired: 6, window: [6] } }, pods, 6), 300);
    const statuses: string[] = [];
    for (let step = 0; step < 3; step++) {
      const result = sync(state)!;
      statuses.push(result.decision.status);
      state = result.next;
    }
    expect(statuses).toEqual(['held', 'held', 'scale-down']);
    expect(state.replicas).toBe(3);
  });

  it('scales down at the first sync when the window is zero', () => {
    const pods: Pod[] = [1, 2, 3, 4, 5, 6].map((id) => ({ id, node: id % 2 ? 1 : 2, ready: true }));
    const state = setWindow(setTraffic(withPods(initialCluster(250), pods, 6), 300), 0);
    expect(sync(state)?.decision).toMatchObject({ status: 'scale-down', desired: 3 });
  });

  it('counts Pods that are not Ready as 0% when scaling up, so pending Pods dampen the result', () => {
    const pods: Pod[] = [
      { id: 1, node: 1, ready: true }, { id: 2, node: 2, ready: true },
      { id: 3, node: 1, ready: true }, { id: 4, node: 2, ready: true },
      { id: 5, node: null, ready: false }, { id: 6, node: null, ready: false },
    ];
    const state = setTraffic(withPods(initialCluster(250), pods, 6), 800);
    expect(decide(state)).toMatchObject({ status: 'no-change', setAside: 2, recommendation: 6 });
  });

  it('counts Pods that are not Ready as the target when scaling down', () => {
    const pods: Pod[] = [
      { id: 1, node: 1, ready: true }, { id: 2, node: 2, ready: true },
      { id: 3, node: 1, ready: true }, { id: 4, node: 2, ready: true },
      { id: 5, node: null, ready: false }, { id: 6, node: null, ready: false },
    ];
    const state = setTraffic(withPods(initialCluster(250), pods, 6), 200);
    expect(decide(state)).toMatchObject({ status: 'scale-down', setAside: 2, raw: 4, desired: 4 });
  });

  it('will not sync while the ReplicaSet has not produced every Pod it was asked for', () => {
    const scaling = { ...initialCluster(250), replicas: 4 };
    expect(sync(scaling)).toBeNull();
  });

  it('a lower maxReplicas bounds scale-down immediately, without waiting for the window', () => {
    const pods: Pod[] = [1, 2, 3, 4, 5, 6].map((id) => ({ id, node: id % 2 ? 1 : 2, ready: true }));
    const state = setMaxReplicas(setTraffic(withPods({ ...initialCluster(250), hpa: { status: 'no-change', utilization: 50, recommendation: 6, desired: 6, window: [6] } }, pods, 6), 300), 3);
    expect(sync(state)?.decision).toMatchObject({ recommendation: 3, desired: 3, status: 'scale-down' });
  });
});

describe('controller event boundaries', () => {
  it('binds a fitting Pod before creating another, and never binds without room', () => {
    let state = { ...initialCluster(250), replicas: 4 };
    expect(planNext(state)).toEqual({ kind: 'create', pod: 3 });
    state = advance(state)!.next;
    expect(planNext(state)).toEqual({ kind: 'bind', pod: 3, node: 1 });
    state = advance(state)!.next;
    expect(planNext(state)).toEqual({ kind: 'create', pod: 4 });
    state = advance(state)!.next;
    expect(planNext(state)).toEqual({ kind: 'bind', pod: 4, node: 2 });
    state = advance(state)!.next;
    expect(state.pods.find((pod) => pod.id === 4)?.node).toBe(2);
    expect(state.pods.every((pod) => pod.node !== null)).toBe(true);
  });

  it('keeps a Pending Pod pending with autoscaler off and only provisions for it when enabled', () => {
    const full = withPods({ ...initialCluster(250), autoscaler: false }, [
      { id: 1, node: 1, ready: true }, { id: 2, node: 2, ready: true },
      { id: 3, node: 1, ready: true }, { id: 4, node: 2, ready: true },
      { id: 5, node: null, ready: false },
    ], 5);
    expect(planNext(full)).toBeNull();
    expect(isSettled(full)).toBe(false);
    const provisioned = setAutoscaler(full, true);
    expect(planNext(provisioned)).toEqual({ kind: 'provision', node: 3 });
    const bound = settle(provisioned);
    expect(bound.pods.find((pod) => pod.id === 5)?.node).toBe(3);
    expect(isSettled(bound)).toBe(true);
  });

  it('keeps an unassigned Pod unready until its node is bound and its readiness event happens', () => {
    const created = advance({ ...initialCluster(250), replicas: 3 })!.next;
    expect(created.pods.find((pod) => pod.id === 3)).toMatchObject({ node: null, ready: false });
    const bound = advance(created)!.next;
    expect(bound.pods.find((pod) => pod.id === 3)).toMatchObject({ node: 1, ready: false });
    const ready = advance(bound)!.next;
    expect(ready.pods.find((pod) => pod.id === 3)).toMatchObject({ node: 1, ready: true });
  });

  it('removes Pending Pods first, then Pods on the busier node, then the newest', () => {
    const pending = withPods(initialCluster(250), [
      { id: 1, node: 1, ready: true }, { id: 2, node: 2, ready: true },
      { id: 3, node: null, ready: false },
    ], 2);
    expect(planNext(pending)).toMatchObject({ kind: 'delete', pod: 3, pending: true });
    const busier = withPods(initialCluster(250), [
      { id: 1, node: 1, ready: true }, { id: 2, node: 2, ready: true }, { id: 3, node: 1, ready: true },
    ], 2);
    expect(planNext(busier)).toMatchObject({ kind: 'delete', pod: 3, node: 1 });
  });

  it('uses fresh identities for replacements and never reuses a deleted Pod id', () => {
    const removed = withPods(initialCluster(250), [{ id: 1, node: 1, ready: true }, { id: 2, node: 2, ready: true }], 1);
    const settled = settle(removed);
    expect(settled.pods.map((pod) => pod.id)).toEqual([1]);
    const grown = settle({ ...settled, replicas: 2 });
    expect(grown.pods.map((pod) => pod.id)).toEqual([1, 10]);
  });

  it('places Pods with no CPU request by fewest web Pods, never leaving them pending', () => {
    const none = { ...initialCluster(null), replicas: 4 };
    expect(placementOf(none)).toBe(1);
    const settled = settle(none);
    expect(isSettled(settled)).toBe(true);
    expect(settled.nodes).toEqual([1, 2]);
  });

  it('keeps every node within its bay count and room for requests at every step', () => {
    let state = setTraffic({ ...initialCluster(250), autoscaler: true }, 800);
    for (let step = 0; step < 80; step++) {
      const result = sync(state);
      if (result) state = result.next;
      const next = advance(state);
      if (!next) break;
      state = next.next;
      for (const node of state.nodes) {
        const count = state.pods.filter((pod) => pod.node === node).length;
        expect(count).toBeLessThanOrEqual(4);
        expect(count * 250).toBeLessThanOrEqual(1000 - (node <= 2 ? 500 : 0));
      }
      for (const pod of state.pods) expect(pod.ready && pod.node === null).toBe(false);
    }
    expect(isSettled(state)).toBe(true);
    expect(state.pods).toHaveLength(6);
    expect(state.nodes).toContain(3);
    expect(state.pods.every((pod) => pod.node !== null)).toBe(true);
  });

  it('traffic changes alone never change spec.replicas', () => {
    const quiet = setTraffic(initialCluster(250), 800);
    expect(quiet.replicas).toBe(2);
    expect(settle(quiet).replicas).toBe(2);
  });
});

describe('room on nodes', () => {
  it('counts whole requests that fit beside other load, capped by free bays', () => {
    expect(roomOn(initialCluster(250), 1)).toBe(1);
    expect(roomOn(initialCluster(500), 1)).toBe(0);
    expect(roomOn(initialCluster(null), 1)).toBe(3);
    expect(roomOn(initialCluster(250), 3)).toBe(4);
  });
});
