import { describe, expect, it } from 'vitest';
import {
  advance, deleteApi, initialState, manifestOf, probe, setEnforcing, setKubeProxy, setPlugin, setPolicy, type NetState,
} from '../src/components/anatomy/pod-networking-cni/model';

function runSteps(state: NetState, count: number): NetState {
  let next = state;
  for (let step = 0; step < count; step++) next = advance(next);
  return next;
}

/** The probe a request records; a request is a fixture check, so the cluster state is unchanged. */
function sent(state: NetState, route: 'direct' | 'service') {
  const recorded = probe(state, route).probe;
  if (!recorded) throw new Error('the request did not record a probe');
  return recorded;
}

describe('Pod networking semantic boundaries', () => {
  it('moves the replacement one owner-boundary per step and assigns its address only at networking', () => {
    let state = deleteApi(initialState());
    const seen: Array<{ stage: string; ip: string | null }> = [];
    for (let step = 0; step < 6; step++) {
      state = advance(state);
      seen.push({ stage: state.api!.stage, ip: state.api!.ip });
    }
    expect(seen.map((item) => item.stage)).toEqual(['created', 'bound', 'sandbox', 'networked', 'running', 'ready']);
    expect(seen.slice(0, 3).every((item) => item.ip === null)).toBe(true);
    expect(seen.slice(3).every((item) => item.ip === '10.244.2.8')).toBe(true);
  });

  it('never gives a released address to a new Pod in this fixture', () => {
    let state = initialState();
    const issued = ['10.244.2.7'];
    for (let round = 0; round < 2; round++) {
      state = runSteps(deleteApi(state), 6);
      issued.push(state.api!.ip!);
    }
    expect(new Set(issued).size).toBe(issued.length);
    expect(state.released.map((gone) => gone.ip)).toEqual(['10.244.2.7', '10.244.2.8']);
  });

  it('keeps a Pod in sandbox without an address when the node has no CNI plugin, then wires it after install', () => {
    let state = runSteps(deleteApi(initialState()), 3);
    expect(state.api?.stage).toBe('sandbox');
    state = setPlugin(state, 'node-b', false);
    const blocked = advance(state);
    expect(blocked.api).toMatchObject({ stage: 'sandbox', ip: null });
    expect(blocked.nodes['node-b'].nextHost).toBe(8);
    const wired = advance(setPlugin(blocked, 'node-b', true));
    expect(wired.api).toMatchObject({ stage: 'networked', ip: '10.244.2.8' });
  });

  it('lets a Running Pod receive direct traffic while it stays out of the Service path until Ready', () => {
    const running = runSteps(deleteApi(initialState()), 5);
    expect(running.api?.stage).toBe('running');
    const direct = sent(running, 'direct');
    expect(direct.stopAt).toBeNull();
    expect(direct.hops.every((hop) => hop.verdict === 'pass')).toBe(true);
    const service = sent(running, 'service');
    expect(service.hops.find((hop) => hop.id === 'endpoints')?.verdict).toBe('stop');
    expect(service.hops.find((hop) => hop.id === 'listener')?.verdict).toBe('skip');
  });

  it('stops Service traffic on node-a when kube-proxy is stopped, and leaves Pod-IP traffic untouched', () => {
    const stopped = setKubeProxy(initialState(), false);
    expect(sent(stopped, 'direct').stopAt).toBeNull();
    expect(sent(stopped, 'service').hops.find((hop) => hop.id === 'kube-proxy')?.verdict).toBe('stop');
  });

  it('drops a request only when the policy exists and the installed CNI enforces it', () => {
    const enforced = setPolicy(initialState(), true);
    const dropped = sent(enforced, 'direct');
    expect(dropped.stopAt).toBe('gate');
    expect(dropped.hops.find((hop) => hop.id === 'listener')?.verdict).toBe('skip');
    expect(sent(setEnforcing(enforced, false), 'direct').stopAt).toBeNull();
    expect(sent(setPolicy(setEnforcing(initialState(), false), true), 'direct').stopAt).toBeNull();
  });

  it('stops at the address hop when no Pod holds an address yet', () => {
    const noAddress = sent(advance(deleteApi(initialState())), 'direct');
    expect(noAddress.hops[0]).toMatchObject({ id: 'address', verdict: 'stop' });
    expect(noAddress.trail).toEqual(['start']);
  });

  it('records a probe without changing the cluster state it reads', () => {
    const before = initialState();
    const after = probe(before, 'service');
    expect(after.probe).not.toBeNull();
    expect(after.api).toEqual(before.api);
    expect(after.nodes).toEqual(before.nodes);
    expect(before.probe).toBeNull();
  });

  it('refuses to delete a Pod that is not Ready', () => {
    const running = runSteps(deleteApi(initialState()), 5);
    expect(deleteApi(running)).toBe(running);
  });

  it('ends the packet trail at the failing hop, or at the destination when delivered', () => {
    expect(sent(initialState(), 'direct').trail.at(-1)).toBe('api');
    expect(sent(setPolicy(initialState(), true), 'direct').trail.at(-1)).toBe('gate');
  });

  it('shows the Pod IP only after networking, and the policy document only while it exists', () => {
    const sandboxed = runSteps(deleteApi(initialState()), 3);
    expect(manifestOf(sandboxed).find((row) => row.field === 'podIP')?.text.trimStart().startsWith('#')).toBe(true);
    const networked = advance(sandboxed);
    expect(networked.reads).toContain('podIP');
    expect(manifestOf(networked).find((row) => row.field === 'podIP')?.text).toBe('  podIP: 10.244.2.8');
    expect(manifestOf(initialState()).some((row) => row.text === 'kind: NetworkPolicy')).toBe(false);
    expect(manifestOf(setPolicy(initialState(), true)).some((row) => row.text === 'kind: NetworkPolicy')).toBe(true);
  });
});
