import { describe, expect, it } from 'vitest';
import { view } from '../src/components/anatomy/persistent-storage/geometry';
import { gateText, overlappingTags, stageTags, tagBox } from '../src/components/anatomy/persistent-storage/layout';
import {
  activeVolume, emptyState, fixtureOffers, initialConfig, ledger, manifestLines, pendingCause, planSteps,
  sceneOf, transition, volumeName, type Action, type Config, type State,
} from '../src/components/anatomy/persistent-storage/model';

const run = (state: State, ...actions: Action[]) => actions.reduce((current, action) => transition(current, action).state, state);
const withConfig = (patch: Partial<Config>) => ({ ...initialConfig, ...patch });

/** Invariants every reachable state must keep. */
function expectInvariants(state: State) {
  const active = state.volumes.filter((volume) => !volume.released);
  expect(active.length).toBeLessThanOrEqual(1);
  expect(state.claim?.bound ?? null).toBe(active[0]?.name ?? null);
  if (state.claim?.terminating) expect(state.pod).not.toBeNull();
  if (state.pod?.node) {
    expect(state.pod.mounted).toBe(true);
    expect(active[0]?.zone).toBe(state.pod.node === 'node-a' ? 'a' : 'b');
  }
  expect(new Set(state.volumes.map((volume) => volume.name)).size).toBe(state.volumes.length);
}

describe('volume identity and class feasibility', () => {
  it('derives unique, deterministic volume names', () => {
    expect(volumeName(0)).toBe('pvc-4f2a');
    expect(new Set(Array.from({ length: 5000 }, (_, i) => volumeName(i))).size).toBe(5000);
  });

  it('supports ReadWriteOnce only, a fixture simplification', () => {
    expect(fixtureOffers('ReadWriteOnce')).toBe(true);
    expect(fixtureOffers('ReadWriteMany')).toBe(false);
  });
});

describe('claim binding', () => {
  it('provisions and binds immediately in zone a under Immediate, with no rows yet', () => {
    const state = run(emptyState(), { type: 'submit' });
    expect(state.claim).toMatchObject({ bound: 'pvc-4f2a', terminating: false });
    expect(state.volumes).toEqual([{ name: 'pvc-4f2a', zone: 'a', reclaim: 'Delete', released: false, rows: 0 }]);
    expectInvariants(state);
  });

  it('keeps the claim Pending and creates no volume under WaitForFirstConsumer', () => {
    const state = run(emptyState(withConfig({ binding: 'WaitForFirstConsumer' })), { type: 'submit' });
    expect(state.claim).toMatchObject({ bound: null });
    expect(state.volumes).toHaveLength(0);
  });

  it('keeps a ReadWriteMany claim Pending under either binding mode', () => {
    for (const binding of ['Immediate', 'WaitForFirstConsumer'] as const) {
      const state = run(emptyState(withConfig({ binding, access: 'ReadWriteMany' })), { type: 'submit' });
      expect(state.claim).toMatchObject({ bound: null, access: 'ReadWriteMany' });
      expect(state.volumes).toHaveLength(0);
    }
  });

  it('refuses a second claim until the first is removed', () => {
    const state = run(emptyState(), { type: 'submit' });
    expect(transition(state, { type: 'submit' }).state).toBe(state);
  });
});

describe('WaitForFirstConsumer placement', () => {
  it('takes the zone from the node the Pod is scheduled to, and mounts with no rows written yet', () => {
    const before = run(emptyState(withConfig({ binding: 'WaitForFirstConsumer', podNode: 'node-b' })), { type: 'submit' });
    const state = run(before, { type: 'start' });
    expect(state.volumes).toEqual([{ name: 'pvc-4f2a', zone: 'b', reclaim: 'Delete', released: false, rows: 0 }]);
    expect(state.pod).toMatchObject({ name: 'ledger-writer-1', node: 'node-b', mounted: true });
    expectInvariants(state);
  });

  it('orders the Pod assignment before provisioning in the motion plan', () => {
    const before = run(emptyState(withConfig({ binding: 'WaitForFirstConsumer' })), { type: 'submit' });
    const after = transition(before, { type: 'start' }).state;
    expect(planSteps(before, after).map((step) => step.kind)).toEqual(['cartIn', 'stamp']);
  });
});

describe('Immediate placement and the zone boundary', () => {
  it('leaves a Pod Pending when its only node is outside the volume zone', () => {
    const state = run(emptyState(), { type: 'submit' }, { type: 'setPodNode', node: 'node-b' }, { type: 'start' });
    expect(state.pod).toMatchObject({ node: null, mounted: false });
    expect(state.volumes[0]?.rows).toBe(0);
    expect(pendingCause(state)).toBe('zone');
    expect(sceneOf(state).pod?.place).toBe('gate');
    expectInvariants(state);
  });

  it('closes only the gate of zones that cannot reach the bound volume', () => {
    const scene = sceneOf(run(emptyState(), { type: 'submit' }));
    expect(scene.gateOpen).toEqual({ a: true, b: false });
  });
});

describe('writes and data outliving the Pod', () => {
  it('mounting does not write a row', () => {
    const state = run(emptyState(), { type: 'submit' }, { type: 'start' });
    expect(state.volumes[0]?.rows).toBe(0);
  });

  it('appends a row only from a Pod that is assigned and mounted', () => {
    const none = run(emptyState(), { type: 'submit' });
    expect(transition(none, { type: 'append' }).state).toBe(none);
    const pending = run(emptyState(), { type: 'submit' }, { type: 'setPodNode', node: 'node-b' }, { type: 'start' });
    expect(transition(pending, { type: 'append' }).state).toBe(pending);
  });

  it('an append adds one row, touches no manifest field, and names the application as the actor', () => {
    const mounted = run(emptyState(), { type: 'submit' }, { type: 'start' });
    const outcome = transition(mounted, { type: 'append' });
    expect(outcome.state.volumes[0]?.rows).toBe(1);
    expect(outcome.touched).toEqual([]);
    expect(outcome.change.actor).toContain('not Kubernetes');
    expect(outcome.change.notYet).toContain('did not copy');
    expectInvariants(outcome.state);
  });

  it('keeps rows across Pod replacement and gives the replacement a fresh name', () => {
    const first = run(emptyState(), { type: 'submit' }, { type: 'start' }, { type: 'append' }, { type: 'deletePod' });
    expect(first.pod).toBeNull();
    expect(first.claim?.bound).toBe('pvc-4f2a');
    expect(first.volumes[0]?.rows).toBe(1);
    const second = run(first, { type: 'start' });
    expect(second.pod?.name).toBe('ledger-writer-2');
    expect(second.volumes[0]?.rows).toBe(1);
    expectInvariants(second);
  });

  it('removes a Pod without touching the claim when nothing is terminating', () => {
    const state = run(emptyState(), { type: 'submit' }, { type: 'start' });
    const after = transition(state, { type: 'deletePod' }).state;
    expect(after.claim).toEqual(state.claim);
    expect(after.volumes).toEqual(state.volumes);
  });
});

describe('claim removal and reclaim policy', () => {
  it('defers claim removal while a Pod references it', () => {
    const state = run(emptyState(), { type: 'submit' }, { type: 'start' }, { type: 'append' }, { type: 'deleteClaim' });
    expect(state.claim?.terminating).toBe(true);
    expect(state.volumes[0]?.rows).toBe(1);
    expectInvariants(state);
  });

  it('deletes the volume and its rows when the deferred claim is finalized under Delete', () => {
    const state = run(emptyState(), { type: 'submit' }, { type: 'start' }, { type: 'deleteClaim' }, { type: 'deletePod' });
    expect(state.claim).toBeNull();
    expect(state.volumes).toHaveLength(0);
  });

  it('keeps a Released volume with its rows under Retain and does not bind it to a new claim', () => {
    const released = run(emptyState(withConfig({ reclaim: 'Retain' })), { type: 'submit' }, { type: 'start' }, { type: 'append' }, { type: 'deletePod' }, { type: 'deleteClaim' });
    expect(released.claim).toBeNull();
    expect(released.volumes).toEqual([{ name: 'pvc-4f2a', zone: 'a', reclaim: 'Retain', released: true, rows: 1 }]);
    expect(activeVolume(released)).toBeNull();
    const next = run(released, { type: 'submit' });
    expect(next.claim?.bound).toBe(volumeName(1));
    expect(next.volumes.find((volume) => volume.name === 'pvc-4f2a')).toMatchObject({ released: true, rows: 1 });
    expect(next.volumes.find((volume) => volume.name === volumeName(1))).toMatchObject({ released: false, rows: 0 });
    expectInvariants(next);
  });

  it('plans Pod removal before the reclaim drop', () => {
    const before = run(emptyState(), { type: 'submit' }, { type: 'start' }, { type: 'deleteClaim' });
    const after = transition(before, { type: 'deletePod' }).state;
    expect(planSteps(before, after).map((step) => step.kind)).toEqual(['cartOut', 'drop']);
  });
});

describe('configuration and fixture boundaries', () => {
  it('starts a fresh scenario when a class setting changes', () => {
    const state = run(emptyState(), { type: 'submit' }, { type: 'start' });
    const after = transition(state, { type: 'setConfig', key: 'reclaim', value: 'Retain' }).state;
    expect(after).toEqual(emptyState(withConfig({ reclaim: 'Retain' })));
  });

  it('returns the same state when a setting does not change', () => {
    const state = emptyState();
    expect(transition(state, { type: 'setConfig', key: 'binding', value: 'Immediate' }).state).toBe(state);
  });

  it('changes the next Pod target without resetting existing objects', () => {
    const state = run(emptyState(), { type: 'submit' });
    const after = transition(state, { type: 'setPodNode', node: 'node-b' }).state;
    expect(after.volumes).toEqual(state.volumes);
    expect(after.config.podNode).toBe('node-b');
  });

  it('fixes the Pod target while a Pod exists', () => {
    const state = run(emptyState(), { type: 'submit' }, { type: 'start' });
    expect(transition(state, { type: 'setPodNode', node: 'node-b' }).state).toBe(state);
  });

  it('keeps a Pending Pod pending when the claim cannot bind', () => {
    const state = run(emptyState(withConfig({ access: 'ReadWriteMany' })), { type: 'submit' }, { type: 'start' });
    expect(state.pod).toMatchObject({ node: null, mounted: false });
    expect(pendingCause(state)).toBe('claim');
    expectInvariants(state);
  });
});

describe('derived views', () => {
  it('omits absent objects from the manifest and highlights only touched fields', () => {
    expect(manifestLines(emptyState()).some((line) => line.text.includes('PersistentVolumeClaim'))).toBe(false);
    const state = run(emptyState(), { type: 'submit' });
    const lines = manifestLines(state, ['volumeName']);
    expect(lines.filter((line) => line.highlight).map((line) => line.text.trim())).toEqual(['volumeName: pvc-4f2a']);
  });

  it('highlights the placement request, and nodeName only after assignment', () => {
    const pending = transition(run(emptyState(), { type: 'submit' }), { type: 'setPodNode', node: 'node-b' }).state;
    const blocked = transition(pending, { type: 'start' });
    const blockedLines = manifestLines(blocked.state, blocked.touched);
    expect(blockedLines.filter((line) => line.highlight).map((line) => line.text.trim())).toContain('kubernetes.io/hostname: node-b');
    expect(blockedLines.some((line) => line.text.trim().startsWith('nodeName:'))).toBe(false);
    const assigned = transition(run(emptyState(), { type: 'submit' }), { type: 'start' });
    expect(manifestLines(assigned.state, assigned.touched).some((line) => line.highlight && line.text.trim().startsWith('nodeName:'))).toBe(true);
  });

  it('counts volumes per owner class without double-counting released ones', () => {
    const state = run(emptyState(withConfig({ reclaim: 'Retain' })), { type: 'submit' }, { type: 'start' }, { type: 'deletePod' }, { type: 'deleteClaim' }, { type: 'submit' });
    expect(ledger(state)).toMatchObject({ bound: 1, released: 1 });
  });
});

describe('gate state names its rule', () => {
  const bound = run(emptyState(), { type: 'submit' });

  it('is open while no volume is bound', () => {
    expect(gateText('b', emptyState())).toMatch(/open/);
  });

  it('is closed to a zone the bound volume is not in, and names that zone', () => {
    expect(gateText('b', bound)).toMatch(/closed/);
    expect(gateText('b', bound)).toContain('zone a');
  });

  it('stays open in the zone the bound volume is in', () => {
    expect(gateText('a', bound)).toMatch(/open/);
  });
});

describe('stage tags', () => {
  const stage = 640;
  const height = (stage * view.h) / view.w;
  const reachable: Array<[string, State]> = [
    ['empty', emptyState()],
    ['bound, no Pod', run(emptyState(), { type: 'submit' })],
    ['Pod pending in the wrong zone', run(emptyState(), { type: 'submit' }, { type: 'setPodNode', node: 'node-b' }, { type: 'start' })],
    ['Pod assigned and mounted', run(emptyState(), { type: 'submit' }, { type: 'start' })],
    ['WaitForFirstConsumer Pod assigned to zone b', run(emptyState(withConfig({ binding: 'WaitForFirstConsumer', podNode: 'node-b' })), { type: 'submit' }, { type: 'start' })],
    ['claim Terminating with its Pod', run(emptyState(), { type: 'submit' }, { type: 'start' }, { type: 'deleteClaim' })],
    ['Released volume after Retain', run(emptyState(withConfig({ reclaim: 'Retain' })), { type: 'submit' }, { type: 'start' }, { type: 'deletePod' }, { type: 'deleteClaim' })],
    ['Pod pending on an unbound claim', run(emptyState(withConfig({ access: 'ReadWriteMany' })), { type: 'submit' }, { type: 'start' })],
    ['WaitForFirstConsumer claim pending', run(emptyState(withConfig({ binding: 'WaitForFirstConsumer' })), { type: 'submit' })],
  ];

  for (const [name, state] of reachable) {
    it(`keeps tags apart and inside the stage: ${name}`, () => {
      expect(overlappingTags(state, stage)).toEqual([]);
      for (const tag of stageTags(state)) {
        const box = tagBox(tag, stage);
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(stage);
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.bottom).toBeLessThanOrEqual(height);
      }
    });
  }

  it('shows a Pod and a volume tag only when those objects exist', () => {
    const ids = (state: State) => stageTags(state).map((tag) => tag.id);
    expect(ids(emptyState())).not.toContain('pod');
    expect(ids(emptyState())).not.toContain('volume');
    expect(ids(run(emptyState(), { type: 'submit' }, { type: 'start' }))).toEqual(expect.arrayContaining(['pod', 'volume', 'claim']));
  });
});
