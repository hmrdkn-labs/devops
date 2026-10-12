import { describe, expect, it } from 'vitest';
import {
  assigned, configure, evaluate, initialState, newestAssigned, outcomeOf, pendingPod, place, podYaml, removeNewest, runMarkIds, scaleUp, shownPod,
  type Constraint, type Evaluation, type Row, type TopologyKey,
} from '../src/components/anatomy/topology-spread/model';

const withConstraint = (patch: Partial<Constraint>) => configure(initialState(), patch);
const byNode = (ev: Evaluation, node: string): Row => ev.rows.find((row) => row.node === node)!;

describe('DoNotSchedule filters on skew, counting the pending Pod', () => {
  it('rejects a zone whose count plus the pending Pod exceeds the global minimum by more than maxSkew', () => {
    const ev = evaluate(initialState());
    expect(ev.min).toBe(1);
    expect(byNode(ev, 'node-a1')).toMatchObject({ matching: 2, ifPlaced: 3, skew: 2, pass: false });
    expect(byNode(ev, 'node-b1')).toMatchObject({ matching: 1, ifPlaced: 2, skew: 1, pass: true });
    expect(ev.selected).toBe('node-b1');
  });

  it('admits the more loaded zone once maxSkew covers its gap, and then the first passing name wins', () => {
    const ev = evaluate(withConstraint({ maxSkew: 2 }));
    expect(byNode(ev, 'node-a1').pass).toBe(true);
    expect(ev.selected).toBe('node-a1');
  });

  it('treats the global minimum as 0 when eligible domains are fewer than minDomains, so no candidate passes', () => {
    const ev = evaluate(withConstraint({ minDomains: true }));
    expect(ev).toMatchObject({ domains: 2, min: 0, minDomainsApplied: true, selected: null });
    expect(ev.rows.every((row) => !row.pass)).toBe(true);
  });

  it('has no effect from minDomains when the domains already meet it', () => {
    const plain = evaluate(withConstraint({ topologyKey: 'hostname' }));
    const withMin = evaluate(withConstraint({ topologyKey: 'hostname', minDomains: true }));
    expect(withMin).toMatchObject({ domains: 4, min: plain.min, minDomainsApplied: false, selected: plain.selected });
  });

  it('keeps the current skew as max minus min over domains, separate from the filter minimum', () => {
    const ev = evaluate(withConstraint({ minDomains: true }));
    expect(ev.currentSkew).toBe(1);
    expect(ev.min).toBe(0);
  });
});

describe('ScheduleAnyway ranks and never rejects', () => {
  it('rejects no candidate and prefers the domain with fewer matching Pods', () => {
    const ev = evaluate(withConstraint({ whenUnsatisfiable: 'ScheduleAnyway' }));
    expect(ev.rows.every((row) => row.pass)).toBe(true);
    expect(ev.selected).toBe('node-b1');
  });

  it('ranks by the matching count on the chosen key, so the empty hostname wins', () => {
    const ev = evaluate(withConstraint({ whenUnsatisfiable: 'ScheduleAnyway', topologyKey: 'hostname' }));
    expect(ev.selected).toBe('node-a2');
  });
});

describe('outcomes after a run', () => {
  it('classifies each DoNotSchedule candidate as rejected, selected or passing', () => {
    const ev = evaluate(initialState());
    const policy = 'DoNotSchedule';
    expect(outcomeOf(byNode(ev, 'node-a1'), ev, policy)).toBe('rejected');
    expect(outcomeOf(byNode(ev, 'node-b1'), ev, policy)).toBe('selected');
    expect(outcomeOf(byNode(ev, 'node-b2'), ev, policy)).toBe('passes');
  });

  it('classifies ScheduleAnyway candidates as ranked-out or tied-out against the selected node', () => {
    const ev = evaluate(withConstraint({ whenUnsatisfiable: 'ScheduleAnyway' }));
    const policy = 'ScheduleAnyway';
    expect(outcomeOf(byNode(ev, 'node-a1'), ev, policy)).toBe('ranked-out');
    expect(outcomeOf(byNode(ev, 'node-b2'), ev, policy)).toBe('tied-out');
    expect(outcomeOf(byNode(ev, 'node-b1'), ev, policy)).toBe('selected');
  });
});

describe('placement and edits', () => {
  it('binds the pending Pod to the selected node and leaves no Pod pending', () => {
    const { state, evaluation } = place(initialState());
    expect(evaluation.selected).toBe('node-b1');
    expect(pendingPod(state)).toBeUndefined();
    expect(assigned(state)).toContainEqual({ id: 4, node: 'node-b1' });
    expect(state.ran).toBe(false);
  });

  it('keeps an unschedulable Pod pending with its identity, marked as run', () => {
    const { state } = place(withConstraint({ minDomains: true }));
    expect(pendingPod(state)).toMatchObject({ id: 4, node: null });
    expect(state.ran).toBe(true);
  });

  it('an edit before a run changes the pending Pod in place and clears a previous run result', () => {
    const ran = place(withConstraint({ minDomains: true })).state;
    const edited = configure(ran, { minDomains: false });
    expect(pendingPod(edited)).toMatchObject({ id: 4, node: null });
    expect(edited.ran).toBe(false);
  });

  it('an edit with no pending Pod changes no Pod object and no assigned node', () => {
    const placed = place(initialState()).state;
    const edited = configure(placed, { topologyKey: 'hostname' });
    expect(edited.pods).toEqual(placed.pods);
  });

  it('clears minDomains when ScheduleAnyway is chosen, because the field is valid only with DoNotSchedule', () => {
    const state = configure(withConstraint({ minDomains: true }), { whenUnsatisfiable: 'ScheduleAnyway' });
    expect(state.constraint).toMatchObject({ whenUnsatisfiable: 'ScheduleAnyway', minDomains: false });
  });

  it('keeps ran true only while a Pod is still pending', () => {
    const states = [
      place(withConstraint({ minDomains: true })).state,
      place(initialState()).state,
      removeNewest(place(withConstraint({ minDomains: true })).state),
    ];
    for (const state of states) expect(state.ran && pendingPod(state) === undefined).toBe(false);
  });
});

describe('scale-up, removal and identity', () => {
  it('creates one pending Pod with the next id and refuses a second while one is pending', () => {
    const once = scaleUp(place(initialState()).state);
    expect(pendingPod(once)).toMatchObject({ id: 5, node: null });
    expect(scaleUp(once)).toBe(once);
  });

  it('never reuses the id of a removed Pod', () => {
    const removed = removeNewest(place(initialState()).state);
    expect(removed.pods.find((pod) => pod.id === 4)?.removed).toBe(true);
    expect(pendingPod(scaleUp(removed))?.id).toBe(5);
  });

  it('removes the newest assigned Pod, never the pending one', () => {
    expect(newestAssigned(initialState())).toEqual({ id: 3, node: 'node-b1' });
    const after = removeNewest(initialState());
    expect(pendingPod(after)).toMatchObject({ id: 4, node: null });
  });
});

describe('deletion never rebalances', () => {
  it('lowers the counts and leaves every other Pod on its node, with the skew left above maxSkew', () => {
    const after = removeNewest(initialState());
    expect(assigned(after)).toEqual([{ id: 1, node: 'node-a1' }, { id: 2, node: 'node-a1' }]);
    expect(evaluate(after).currentSkew).toBe(2);
    expect(evaluate(after).selected).toBe('node-b1');
  });
});

describe('counting invariants', () => {
  it('counts only assigned, not removed Pods, under either topology key', () => {
    for (const topologyKey of ['zone', 'hostname'] as TopologyKey[]) {
      const state = configure(removeNewest(place(initialState()).state), { topologyKey });
      const perDomain = new Map<string, number>();
      for (const row of evaluate(state).rows) perDomain.set(row.domain, row.matching);
      const total = [...perDomain.values()].reduce((sum, count) => sum + count, 0);
      expect(total).toBe(assigned(state).length);
    }
  });
});

describe('the Pod the manifest shows', () => {
  it('shows the pending Pod first, then the Pod the last run bound, then the next template Pod', () => {
    const pending = initialState();
    expect(shownPod(pending, null)).toMatchObject({ id: 4, node: null });
    const bound = place(pending).state;
    expect(shownPod(bound, 4)).toMatchObject({ id: 4, node: 'node-b1' });
    expect(shownPod(bound, null)).toBeNull();
    expect(shownPod(removeNewest(bound), 4)).toBeNull();
  });

  it('a bound Pod shows spec.nodeName between spec and the constraint, and a pending Pod does not', () => {
    const bound = place(initialState()).state;
    const boundIds = podYaml(bound, shownPod(bound, 4)).map((line) => line.id);
    expect(boundIds.indexOf('pod.nodeName')).toBeGreaterThan(boundIds.indexOf('pod.name'));
    expect(boundIds.indexOf('pod.nodeName')).toBeLessThan(boundIds.indexOf('pod.maxSkew'));
    const pendingIds = podYaml(initialState(), shownPod(initialState(), null)).map((line) => line.id);
    expect(pendingIds).not.toContain('pod.nodeName');
  });

  it('marks spec.nodeName only when the run bound the Pod', () => {
    expect(runMarkIds(initialState(), true)).toContain('pod.nodeName');
    expect(runMarkIds(initialState(), false)).not.toContain('pod.nodeName');
  });
});

describe('manifest lines follow the constraint', () => {
  it('includes the minDomains line only for DoNotSchedule with minDomains set', () => {
    const withMin = withConstraint({ minDomains: true });
    expect(podYaml(withMin, shownPod(withMin, null)).some((line) => line.id === 'pod.minDomains')).toBe(true);
    const plain = initialState();
    expect(podYaml(plain, shownPod(plain, null)).some((line) => line.id === 'pod.minDomains')).toBe(false);
    const anyway = configure(withMin, { whenUnsatisfiable: 'ScheduleAnyway' });
    expect(podYaml(anyway, shownPod(anyway, null)).some((line) => line.id === 'pod.minDomains')).toBe(false);
  });

  it('marks only the Node labels of the key a run reads', () => {
    const zone = runMarkIds(initialState(), false);
    expect(zone).toContain('node.node-a1.zone');
    expect(zone).not.toContain('node.node-a1.hostname');
    const hostname = runMarkIds(withConstraint({ topologyKey: 'hostname' }), false);
    expect(hostname).toContain('node.node-b2.hostname');
    expect(hostname).not.toContain('node.node-b2.zone');
  });

  it('names the pending Pod, or the next Pod the template creates when none is shown', () => {
    const pending = initialState();
    const pendingName = podYaml(pending, shownPod(pending, null)).find((line) => line.id === 'pod.name')!.text;
    expect(pendingName).toContain('web-4');
    const removed = removeNewest(place(initialState()).state);
    const nextName = podYaml(removed, shownPod(removed, null)).find((line) => line.id === 'pod.name')!.text;
    expect(nextName).toContain('web-5');
  });
});
