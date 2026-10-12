import { describe, expect, it } from 'vitest';
import { initialSpec, initialWorld, rollOut, setStored, stage, startPod, syncVolumes, type Spec, type World } from '../src/components/anatomy/config-secrets/model';

const volume: Spec = { ...initialSpec, delivery: 'volume' };
const subpath: Spec = { ...initialSpec, delivery: 'subpath' };
const secretEnv: Spec = { ...initialSpec, source: 'secret' };

function withSpec(spec: Spec): World {
  const world = initialWorld();
  return rollOut({ ...world, spec });
}

describe('delivery paths and Pod-owned values', () => {
  it('keeps an environment value fixed after its container started, however the object changes', () => {
    const started = withSpec(initialSpec);
    const edited = setStored(started, 'configmap', 1);
    expect(syncVolumes(edited).pod.seen).toBe(0);
    expect(syncVolumes(edited)).toBe(edited);
  });

  it('updates a mounted volume only at kubelet sync, never before', () => {
    const started = withSpec(volume);
    const edited = setStored(started, 'configmap', 1);
    expect(edited.pod.seen).toBe(0);
    expect(syncVolumes(edited).pod.seen).toBe(1);
  });

  it('follows a Secret update in a mounted volume only at sync', () => {
    const started = withSpec({ ...initialSpec, source: 'secret', delivery: 'volume' });
    const edited = setStored(started, 'secret', 1);
    expect(edited.pod.seen).toBe(0);
    expect(syncVolumes(edited).pod.seen).toBe(1);
  });

  it('never updates a subPath copy, even after a sync', () => {
    const started = withSpec(subpath);
    const edited = setStored(started, 'configmap', 1);
    expect(syncVolumes(edited).pod.seen).toBe(0);
  });

  it('ignores writes to the object a Pod does not reference', () => {
    const started = withSpec(secretEnv);
    const edited = setStored(started, 'configmap', 1);
    expect(edited.pod.seen).toBe(0);
    expect(edited.pod).toBe(started.pod);
  });

  it('leaves a running Pod untouched when only the staged template changes', () => {
    const running = withSpec(initialSpec);
    const staged = stage(running, { delivery: 'volume', optional: true });
    expect(staged.pod).toBe(running.pod);
    expect(staged.pod.spec.delivery).toBe('env');
  });
});

describe('missing references and container start', () => {
  it('blocks a container whose required key is missing, without retiring the running Pod', () => {
    const running = initialWorld();
    const broken = rollOut(stage(running, { misspelledKey: true }));
    expect(broken.pod).toBe(running.pod);
    expect(broken.blocked).toMatchObject({ phase: 'blocked', seen: null });
  });

  it('starts an optional missing key with no value rather than blocking', () => {
    const pod = startPod({ ...initialSpec, misspelledKey: true, optional: true }, { configmap: 0, secret: 0 }, 1);
    expect(pod).toMatchObject({ phase: 'running', seen: null });
  });

  it('clears the blocked replacement once a later rollout starts', () => {
    const blocked = rollOut(stage(initialWorld(), { misspelledKey: true }));
    const fixed = rollOut(stage(blocked, { misspelledKey: false }));
    expect(fixed.blocked).toBeNull();
    expect(fixed.pod.phase).toBe('running');
  });

  it('does not let a volume sync repair a missing key or create a file for it', () => {
    const broken = rollOut(stage(initialWorld(), { delivery: 'volume', misspelledKey: true, optional: true }));
    const edited = setStored(broken, 'configmap', 1);
    expect(syncVolumes(edited)).toBe(edited);
    expect(syncVolumes(edited).pod.seen).toBeNull();
  });
});

describe('Pod identity and replacement', () => {
  it('gives every rollout a fresh Pod name and reads the stored value at its start', () => {
    const first = initialWorld();
    const second = rollOut(setStored(first, 'configmap', 1));
    expect(second.pod.name).not.toBe(first.pod.name);
    expect(second.pod.seen).toBe(1);
  });
});
