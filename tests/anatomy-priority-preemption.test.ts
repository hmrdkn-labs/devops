import { describe, expect, it } from 'vitest';
import {
  canFinish, canRun, decide, finishGrace, freeM, initialCluster, initialConfig, podYaml, pod, queueOf, schedulingCycle,
  type ClassId, type Cluster, type Config, type SchedulerName,
} from '../src/components/anatomy/priority-preemption/model';

const classes: ClassId[] = ['platform-critical', 'platform-critical-nonpreempting', 'reporting', 'none'];
const schedulers: SchedulerName[] = ['default-scheduler', 'batch-scheduler'];

function configs(): Config[] {
  const out: Config[] = [];
  for (const cls of classes) for (const schedulerName of schedulers) for (const pdbBatch2 of [false, true]) for (const pdbReports of [false, true]) for (const rival of [false, true]) {
    out.push({ cls, schedulerName, pdbBatch2, pdbReports, rival });
  }
  return out;
}

/** Run a cycle, then end each grace period, as the figure's buttons do. */
function playOut(config: Config): Cluster[] {
  const steps: Cluster[] = [];
  let state = initialCluster(config);
  const first = schedulingCycle(state);
  state = first.cluster;
  steps.push(state);
  for (let i = 0; i < 3 && canFinish(state); i++) {
    state = finishGrace(state, config).cluster;
    steps.push(state);
  }
  return steps;
}

describe('queue order', () => {
  it('puts higher priority first and breaks ties by creation order', () => {
    const queue = queueOf(initialCluster({ ...initialConfig, cls: 'platform-critical' })).map((p) => p.name);
    expect(queue).toEqual(['api-pod', 'batch-3']);
  });

  it('keeps creation order for equal priority, so an earlier Pod is considered first', () => {
    const queue = queueOf(initialCluster({ ...initialConfig, cls: 'none' })).map((p) => p.name);
    expect(queue).toEqual(['batch-3', 'api-pod']);
  });
});

describe('feasibility is separate from priority', () => {
  it('binds to a node that has room without evicting anything', () => {
    const base = initialCluster(initialConfig);
    const freed: Cluster = { ...base, pods: base.pods.map((p) => (p.name === 'batch-2' ? { ...p, phase: 'Gone' as const } : p)) };
    const api = pod(freed, 'api-pod')!;
    expect(decide(freed, api)).toMatchObject({ kind: 'bind', node: 'node-a', via: 'free' });
  });

  it('never makes an infeasible request feasible by priority alone', () => {
    const base = initialCluster(initialConfig);
    const oversized: Cluster = { ...base, pods: base.pods.map((p) => (p.name === 'api-pod' ? { ...p, requestM: 1200 } : p)) };
    expect(decide(oversized, pod(oversized, 'api-pod')!)).toEqual({ kind: 'pending', reason: 'no-candidate' });
  });

  it('skips a Pod whose schedulerName another scheduler owns, and nominates nothing', () => {
    const config = { ...initialConfig, schedulerName: 'batch-scheduler' as const };
    const result = schedulingCycle(initialCluster(config));
    expect(result.events.find((e) => e.pod === 'api-pod')?.decision.kind).toBe('skip');
    expect(pod(result.cluster, 'api-pod')?.nominatedNode).toBeUndefined();
    expect(result.cluster.pods.some((p) => p.phase === 'Terminating')).toBe(false);
  });
});

describe('victim selection', () => {
  it('evicts only strictly lower-priority Pods and keeps the batch Pod that still lets the request fit', () => {
    const result = schedulingCycle(initialCluster(initialConfig));
    const decision = result.events.find((e) => e.pod === 'api-pod')?.decision;
    expect(decision).toMatchObject({ kind: 'preempt', node: 'node-a', victims: ['batch-2'] });
  });

  it('never picks a victim whose priority equals the preemptor priority', () => {
    const result = schedulingCycle(initialCluster({ ...initialConfig, cls: 'reporting' }));
    const decision = result.events.find((e) => e.pod === 'api-pod')?.decision;
    expect(decision).toMatchObject({ kind: 'preempt', node: 'node-a', victims: ['batch-2'] });
    expect(result.cluster.pods.find((p) => p.name === 'reports-1')?.phase).toBe('Running');
  });

  it('treats a Pod with no priority class as priority 0, and nothing is lower, so it waits', () => {
    const result = schedulingCycle(initialCluster({ ...initialConfig, cls: 'none' }));
    expect(result.events.find((e) => e.pod === 'api-pod')?.decision).toEqual({ kind: 'pending', reason: 'no-lower-priority' });
    expect(result.cluster.pods.some((p) => p.phase === 'Terminating')).toBe(false);
  });

  it('does not evict at all when preemptionPolicy is Never', () => {
    const result = schedulingCycle(initialCluster({ ...initialConfig, cls: 'platform-critical-nonpreempting' }));
    expect(result.cluster.pods.some((p) => p.phase === 'Terminating')).toBe(false);
    expect(pod(result.cluster, 'api-pod')?.nominatedNode).toBeUndefined();
  });

  it('prefers the node without a budget violation, even when its victim has a higher priority', () => {
    const result = schedulingCycle(initialCluster({ ...initialConfig, pdbBatch2: true }));
    expect(result.events.find((e) => e.pod === 'api-pod')?.decision).toMatchObject({ kind: 'preempt', node: 'node-b', victims: ['reports-1'], pdbViolations: 0 });
  });

  it('still preempts when every candidate violates a budget, since the budget is best-effort', () => {
    const result = schedulingCycle(initialCluster({ ...initialConfig, pdbBatch2: true, pdbReports: true }));
    expect(result.events.find((e) => e.pod === 'api-pod')?.decision).toMatchObject({ kind: 'preempt', node: 'node-a', victims: ['batch-2'], pdbViolations: 1 });
  });
});

describe('nomination is a reservation, not a placement', () => {
  it('leaves the preemptor unbound after a nomination', () => {
    const api = pod(schedulingCycle(initialCluster(initialConfig)).cluster, 'api-pod')!;
    expect(api.phase).toBe('Pending');
    expect(api.node).toBeUndefined();
    expect(api.nominatedNode).toBe('node-a');
  });

  it('keeps the victim counted against the node until its grace period ends', () => {
    const nominated = schedulingCycle(initialCluster(initialConfig)).cluster;
    // 1000m allocatable - batch-1 400m - batch-2 400m still terminating = 200m.
    expect(freeM(nominated, 'node-a', pod(nominated, 'api-pod')!)).toBe(200);
    expect(canRun(nominated)).toBe(false);
    expect(canFinish(nominated)).toBe(true);
  });

  it('binds the nominated Pod once the victim is gone and nothing else takes the room', () => {
    const [, done] = playOut(initialConfig);
    expect(pod(done!, 'api-pod')).toMatchObject({ phase: 'Assigned', node: 'node-a' });
  });

  it('lets a higher-priority rival take the node, clears the old nomination, and re-nominates the preemptor', () => {
    const config = { ...initialConfig, rival: true };
    const [, afterRival] = playOut(config);
    expect(pod(afterRival!, 'incident-high')).toMatchObject({ phase: 'Assigned', node: 'node-a' });
    expect(pod(afterRival!, 'api-pod')).toMatchObject({ phase: 'Pending', nominatedNode: 'node-b' });
    expect(pod(afterRival!, 'api-pod')?.node).toBeUndefined();
  });

  it('adds the rival only once', () => {
    const config = { ...initialConfig, rival: true };
    const first = finishGrace(schedulingCycle(initialCluster(config)).cluster, config);
    const second = finishGrace(first.cluster, config);
    expect(first.rivalArrived).toBe(true);
    expect(second.rivalArrived).toBe(false);
    expect(second.cluster.pods.filter((p) => p.name === 'incident-high')).toHaveLength(1);
  });
});

describe('grace period', () => {
  it('removes the victims when it ends and binds the nominated Pod to the node it was nominated to', () => {
    const nominated = schedulingCycle(initialCluster(initialConfig)).cluster;
    const done = finishGrace(nominated, initialConfig);
    expect(pod(done.cluster, 'batch-2')?.phase).toBe('Gone');
    expect(done.removed).toEqual(['batch-2']);
    expect(pod(done.cluster, 'api-pod')?.phase).toBe('Assigned');
  });
});

describe('invariants across every configuration', () => {
  it('never lets a node exceed its allocatable CPU, across cycles and grace periods', () => {
    for (const config of configs()) {
      for (const cluster of playOut(config)) {
        for (const node of ['node-a', 'node-b'] as const) {
          const used = cluster.pods
            .filter((p) => p.node === node && (p.phase === 'Running' || p.phase === 'Assigned' || p.phase === 'Terminating'))
            .reduce((sum, p) => sum + p.requestM, 0);
          expect(used).toBeLessThanOrEqual(1000);
        }
      }
    }
  });

  it('only ever evicts Pods of strictly lower priority than the Pod that nominated them', () => {
    for (const config of configs()) {
      const cluster = schedulingCycle(initialCluster(config)).cluster;
      const nominator = pod(cluster, 'api-pod')!;
      for (const victim of cluster.pods.filter((p) => p.phase === 'Terminating')) {
        expect(victim.priority).toBeLessThan(nominator.priority);
      }
    }
  });

  it('never binds a Pod with no spec.nodeName and never marks a Running Pod as Pending', () => {
    for (const config of configs()) {
      for (const cluster of playOut(config)) {
        for (const p of cluster.pods) {
          if (p.phase === 'Assigned') expect(p.node).toBeDefined();
          if (p.phase === 'Pending') expect(p.node).toBeUndefined();
        }
      }
    }
  });

});

describe('manifest boundaries', () => {
  it('shows nodeName only after binding, and nominatedNodeName only while nominated', () => {
    const unbound = podYaml(initialCluster(initialConfig), initialConfig).map((line) => line.id);
    expect(unbound).not.toContain('spec.nodeName');
    expect(unbound).not.toContain('status.nominatedNodeName');
    const nominated = podYaml(schedulingCycle(initialCluster(initialConfig)).cluster, initialConfig).map((line) => line.id);
    expect(nominated).toContain('status.nominatedNodeName');
    expect(nominated).not.toContain('spec.nodeName');
  });

  it('keeps status.phase Pending after binding, because assignment is not Running', () => {
    const bound = finishGrace(schedulingCycle(initialCluster(initialConfig)).cluster, initialConfig).cluster;
    const lines = podYaml(bound, initialConfig);
    expect(lines.some((line) => line.id === 'spec.nodeName')).toBe(true);
    expect(lines.find((line) => line.id === 'status.phase')?.text).toMatch(/phase: Pending/);
  });
});

describe('canRun and canFinish', () => {
  it('lets a pass run only when something is pending and nothing is terminating', () => {
    const initial = initialCluster(initialConfig);
    expect(canRun(initial)).toBe(true);
    expect(canFinish(initial)).toBe(false);
    const nominated = schedulingCycle(initial).cluster;
    expect(canRun(nominated)).toBe(false);
    expect(canFinish(nominated)).toBe(true);
  });
});
