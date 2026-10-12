import { describe, expect, it } from 'vitest';
import {
  clampStage, completionOf, manifest, objectRow, ownerRow, snapshot, stages, witnessDrawer, witnessState, witnesses,
  type WitnessId,
} from '../src/components/anatomy/cluster-responsibilities/model';

const ids = witnesses.map((witness) => witness.id) as WitnessId[];
const last = stages.length - 1;
const highlighted = (stage: number) => manifest(stage).filter((line) => line.highlight).map((line) => line.text);

describe('checkpoint boundaries', () => {
  it('clamps out-of-range checkpoints to the draft and the final checkpoint', () => {
    expect(clampStage(-3)).toBe(0);
    expect(clampStage(99)).toBe(last);
    expect(snapshot(-1).index).toBe(0);
    expect(snapshot(99).index).toBe(last);
  });

  it('gives every owner one completion checkpoint, after the draft, and no earlier acting state', () => {
    for (const id of ids) {
      const completion = completionOf(id);
      expect(completion).toBeGreaterThan(0);
      expect(witnessState(completion - 1, id)).toBe('not-yet');
      expect(witnessState(completion, id)).toBe('acting');
    }
  });

  it('maps every owner onto a physical drawer', () => {
    for (const id of ids) expect(witnessDrawer(id)).toMatch(/^(api|store|controllers|scheduler|kubelet|runtime)$/);
  });
});

describe('separate Deployment and ReplicaSet witnesses', () => {
  it('shifts the Deployment controller at the ReplicaSet checkpoint, not at the Pod checkpoint', () => {
    expect(witnessState(2, 'deployment')).toBe('not-yet');
    expect(witnessState(3, 'deployment')).toBe('acting');
    expect(witnessState(4, 'deployment')).toBe('acted');
    expect(witnessState(3, 'replicaset')).toBe('not-yet');
    expect(witnessState(4, 'replicaset')).toBe('acting');
    expect(witnessState(7, 'replicaset')).toBe('acted');
  });

  it('keeps owner states monotonic: an owner never returns to not-yet once it has started', () => {
    for (const id of ids) {
      const states = stages.map((_, index) => witnessState(index, id));
      const firstAct = states.findIndex((state) => state !== 'not-yet');
      expect(firstAct).toBeGreaterThan(-1);
      expect(states.slice(firstAct).every((state) => state !== 'not-yet')).toBe(true);
    }
  });
});

describe('causal invariants of the object chain', () => {
  it('never shows a child before its owner exists, and never runs without a node', () => {
    for (let index = 0; index <= last; index++) {
      const s = snapshot(index);
      expect(s.replicaSets <= s.deployments).toBe(true);
      expect(s.pods <= s.replicaSets).toBe(true);
      if (s.phase === 'Running') expect(s.node).not.toBeNull();
      if (s.node !== null) expect(s.pods).toBe(1);
      if (s.runningContainers) expect(s.node).not.toBeNull();
    }
  });

  it('keeps counts monotonic across checkpoints', () => {
    for (let index = 1; index <= last; index++) {
      const before = snapshot(index - 1);
      const after = snapshot(index);
      expect(after.deployments).toBeGreaterThanOrEqual(before.deployments);
      expect(after.replicaSets).toBeGreaterThanOrEqual(before.replicaSets);
      expect(after.pods).toBeGreaterThanOrEqual(before.pods);
      expect(after.runningContainers).toBeGreaterThanOrEqual(before.runningContainers);
    }
  });

  it('assigns a node only from the scheduler checkpoint, and runs a container only at the final checkpoint', () => {
    expect(snapshot(4).node).toBeNull();
    expect(snapshot(5).node).toBe('node-a');
    expect(snapshot(6).runningContainers).toBe(0);
    expect(snapshot(last).runningContainers).toBe(1);
  });

  it('keeps Pending and Running as distinct phases; Running appears only after the container starts', () => {
    expect(snapshot(3).phase).toBeNull();
    expect(snapshot(4).phase).toBe('Pending');
    expect(snapshot(6).phase).toBe('Pending');
    expect(snapshot(last).phase).toBe('Running');
  });
});

describe('per-object and per-owner indicators', () => {
  it('reports Running only as a phase, and only at the final checkpoint', () => {
    for (let index = 0; index < last; index++) expect(objectRow(index, 'phase').label).not.toMatch(/Running/);
    expect(objectRow(last, 'phase')).toMatchObject({ tone: 'pass' });
  });

  it('counts each owner’s own work, starting at the checkpoint where it acts', () => {
    expect(ownerRow(2, 'deployment').count).toBe(0);
    expect(ownerRow(3, 'deployment').count).toBe(1);
    expect(ownerRow(3, 'replicaset').count).toBe(0);
    expect(ownerRow(4, 'replicaset').count).toBe(1);
    expect(ownerRow(5, 'scheduler').count).toBe(1);
    expect(ownerRow(5, 'kubelet').count).toBe(0);
    expect(ownerRow(6, 'kubelet').count).toBe(1);
  });

  it('marks only the checkpoint actor as acting now', () => {
    expect(ownerRow(4, 'replicaset').tone).toBe('info');
    expect(ownerRow(4, 'deployment').tone).toBe('pass');
    expect(ownerRow(2, 'replicaset').tone).toBe('wait');
  });
});

describe('manifest lines follow the object chain', () => {
  it('shows the nodeName field only after the scheduler binds the Pod', () => {
    const nodeLine = (stage: number) => manifest(stage).some((line) => line.text.trim() === 'nodeName: node-a');
    expect(nodeLine(4)).toBe(false);
    expect(nodeLine(5)).toBe(true);
    expect(nodeLine(last)).toBe(true);
  });

  it('shows the Pod document only from the ReplicaSet controller checkpoint onward', () => {
    const podDocument = (stage: number) => manifest(stage).some((line) => line.text === 'kind: Pod');
    expect(podDocument(3)).toBe(false);
    expect(podDocument(4)).toBe(true);
  });

  it('highlights something at every checkpoint after the draft, and nothing in the draft', () => {
    expect(highlighted(0)).toHaveLength(0);
    for (let index = 1; index <= last; index++) expect(highlighted(index).length).toBeGreaterThan(0);
  });

  it('highlights the Pod phase line only when the phase is produced', () => {
    expect(highlighted(4).some((text) => text.includes('phase: Pending'))).toBe(true);
    expect(highlighted(6).some((text) => text.includes('phase:'))).toBe(false);
    expect(highlighted(last).some((text) => text.includes('phase: Running'))).toBe(true);
  });
});
