import { describe, expect, it } from 'vitest';
import {
  evaluate, forward, initialState, manifestLines, replacePod, roleOf, setApp, setExposure, setReady, setSelector,
  type FixtureState,
} from '../src/components/anatomy/service-endpoints/model';

describe('EndpointSlice roles', () => {
  it('records a Pod as a ready endpoint only when its label matches the selector and it is Ready', () => {
    const base = initialState();
    for (const ready of [true, false]) {
      for (const app of ['web', 'web-canary'] as const) {
        const state = setApp(setReady(base, 0, ready), 0, app);
        const expected = app === 'web' ? (ready ? 'ready' : 'not-ready') : 'outside';
        expect(evaluate(state).roles[0]).toBe(expected);
        expect(evaluate(state).listed.includes(0)).toBe(ready && app === 'web');
      }
    }
  });

  it('keeps a matching NotReady Pod recorded but out of the ready endpoints', () => {
    const state = setReady(initialState(), 1, false);
    expect(roleOf(state.pods[1]!, state.selector)).toBe('not-ready');
    expect(evaluate(state).listed).toEqual([0, 2]);
  });

  it('leaves every Pod unrecorded when the selector matches no label, while all Pods stay Ready', () => {
    const state = setSelector(initialState(), 'web-next');
    expect(evaluate(state)).toEqual({ roles: ['outside', 'outside', 'outside'], listed: [] });
    expect(state.pods.every((pod) => pod.ready)).toBe(true);
  });

  it('changes readiness or label of one Pod without touching the others', () => {
    const base = initialState();
    const failing = setReady(base, 1, false);
    expect(evaluate(failing).listed).toEqual([0, 2]);
    expect(failing.pods[0]).toEqual(base.pods[0]);
    expect(failing.pods[2]).toEqual(base.pods[2]);
    const relabelled = setApp(base, 2, 'web-canary');
    expect(evaluate(relabelled).listed).toEqual([0, 1]);
    expect(relabelled.pods[1]).toEqual(base.pods[1]);
  });

  it('keeps exposure changes out of endpoint roles', () => {
    const base = setReady(initialState(), 0, false);
    for (const exposure of ['NodePort', 'LoadBalancer', 'ClusterIP'] as const) {
      expect(evaluate(setExposure(base, exposure))).toEqual(evaluate(base));
    }
  });
});

describe('Pod replacement', () => {
  it('gives the replacement a fresh name in the same booth and never reuses a live name', () => {
    let state: FixtureState = initialState();
    for (let step = 0; step < 20; step += 1) {
      const slot = step % 3;
      const deleted = state.pods[slot]!.name;
      state = replacePod(state, slot);
      expect(state.pods[slot]!.name).not.toBe(deleted);
      expect(state.pods[slot]!.ready).toBe(false);
      expect(new Set(state.pods.map((pod) => pod.name)).size).toBe(3);
    }
  });

  it('leaves the other booths untouched and does not list the replacement until it is Ready', () => {
    const base = initialState();
    const replaced = replacePod(base, 2);
    expect(replaced.pods[0]).toEqual(base.pods[0]);
    expect(replaced.pods[1]).toEqual(base.pods[1]);
    expect(evaluate(replaced).roles[2]).toBe('not-ready');
    expect(evaluate(replaced).listed).toEqual([0, 1]);
    expect(evaluate(setReady(replaced, 2, true)).listed).toEqual([0, 1, 2]);
  });
});

describe('forwarding through ready endpoints', () => {
  it('forwards nothing and keeps the cursor when no endpoint is ready', () => {
    const state = setSelector(initialState(), 'web-next');
    expect(forward(state)).toEqual({ slot: null, state });
  });

  it('only ever chooses ready endpoints and cycles through them', () => {
    let state = setReady(initialState(), 1, false);
    const chosen: Array<number | null> = [];
    for (let i = 0; i < 6; i += 1) {
      const result = forward(state);
      chosen.push(result.slot);
      state = result.state;
    }
    expect(chosen).toEqual([0, 2, 0, 2, 0, 2]);
  });

  it('returns a new state rather than advancing the caller\'s cursor', () => {
    const before = initialState();
    forward(before);
    expect(before.cursor).toBe(0);
  });
});

describe('manifest boundaries', () => {
  it('adds a nodePort field only for NodePort or LoadBalancer exposure', () => {
    const nodePortLines = (exposure: 'ClusterIP' | 'NodePort' | 'LoadBalancer') =>
      manifestLines(setExposure(initialState(), exposure), 0, {}).filter((line) => line.text.includes('nodePort'));
    expect(nodePortLines('ClusterIP')).toHaveLength(0);
    expect(nodePortLines('NodePort')).toHaveLength(1);
    expect(nodePortLines('LoadBalancer')).toHaveLength(1);
  });

  it('highlights nothing when no interaction marked a field', () => {
    expect(manifestLines(initialState(), 1, {}).some((line) => line.highlight)).toBe(false);
  });

  it('highlights exactly the two port lines a request reads', () => {
    const highlighted = manifestLines(initialState(), 1, { route: true }).filter((line) => line.highlight);
    expect(highlighted).toHaveLength(2);
  });
});
