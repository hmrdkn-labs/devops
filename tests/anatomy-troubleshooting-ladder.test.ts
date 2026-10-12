import { describe, expect, it } from 'vitest';
import {
  RUNGS, SCENARIOS, SCENARIO_IDS, applyFix, canApplyFix, deletePod, factsOf, initialState, isHighlighted, isStale,
  listedOf, manifestOf, noteOf, podName, readRung, reconcile, selectorOf, specOf, type LadderState, type ScenarioId,
} from '../src/components/anatomy/troubleshooting-ladder/model';
import { FRESH, HEALTHY, NOTES, STALE } from '../src/components/anatomy/troubleshooting-ladder/messages';
import { labelsOf } from '../src/components/anatomy/troubleshooting-ladder/labels';

/** Owner passes until the object settles. */
function settle(state: LadderState, cap = 8): LadderState {
  let next = state;
  for (let pass = 0; pass < cap && next.stage !== 'settled'; pass++) next = reconcile(next);
  return next;
}

/** The only sequence that edits an object: read the rung that names the cause, then apply the fix. */
function fixed(id: ScenarioId): LadderState {
  return applyFix(readRung(initialState(id), SCENARIOS[id].diagnosis));
}

describe('reading is read-only', () => {
  it.each(SCENARIO_IDS)('reading every rung of %s changes evidence, not the object', (id) => {
    const start = initialState(id);
    for (let rung = 0; rung < RUNGS.length; rung++) {
      const next = readRung(start, rung);
      expect(next.generation).toBe(start.generation);
      expect(next.templateFixed).toBe(start.templateFixed);
      expect(next.external).toBe(start.external);
      expect(next.stage).toBe(start.stage);
      expect(next.attempts).toBe(start.attempts);
      expect(next.version).toBe(start.version);
      expect(factsOf(next)).toEqual(factsOf(start));
    }
  });
});

describe('fixes are gated by the rung that names the cause', () => {
  it.each(SCENARIO_IDS)('%s: Apply fix stays locked until its diagnosis rung is read', (id) => {
    const diagnosis = SCENARIOS[id].diagnosis;
    let state = initialState(id);
    for (let rung = 0; rung < RUNGS.length; rung++) {
      if (rung === diagnosis) continue;
      state = readRung(state, rung);
      expect(canApplyFix(state).ok).toBe(false);
    }
    expect(canApplyFix(readRung(initialState(id), diagnosis)).ok).toBe(true);
  });

  it('a locked fix returns the same state, so an early press changes nothing', () => {
    const state = initialState('pending-cpu');
    expect(applyFix(state)).toBe(state);
  });
});

describe('a template fix replaces the Pod; an outside fix changes objects in place', () => {
  it('creates a new Pod and keeps the old one listed until the replacement is Ready', () => {
    const before = initialState('pull-tag');
    const applied = applyFix(readRung(before, SCENARIOS['pull-tag'].diagnosis));
    expect(applied.generation).toBe(before.generation + 1);
    expect(podName(applied)).not.toBe(podName(before));
    expect(applied.retired).toBe(before.generation);
    expect(listedOf(applied)).toBe(false);
    const done = reconcile(applied);
    expect(done.retired).toBeNull();
    expect(specOf(done).image).toBe('registry.example.com/orders-api:1.4.2');
    expect(listedOf(done)).toBe(true);
  });

  it('keeps the Pod name and UID for an outside fix, and the endpoint list follows only after the owner runs', () => {
    const start = readRung(initialState('no-endpoints'), SCENARIOS['no-endpoints'].diagnosis);
    const applied = applyFix(start);
    expect(applied.generation).toBe(start.generation);
    expect(podName(applied)).toBe(podName(start));
    expect(selectorOf(applied)).toBe('orders-api');
    expect(listedOf(applied)).toBe(false);
    expect(listedOf(reconcile(applied))).toBe(true);
  });
});

describe('deleting a Pod keeps the fault and discards the evidence', () => {
  it('a replacement from the same template reproduces the fault with no evidence', () => {
    const start = readRung(initialState('pull-tag'), SCENARIOS['pull-tag'].diagnosis);
    const replacement = reconcile(deletePod(start));
    expect(replacement.generation).toBe(start.generation + 1);
    expect(replacement.read.some(Boolean)).toBe(false);
    expect(specOf(replacement).image).toBe(specOf(start).image);
    expect(factsOf(replacement).status).toBe('ImagePullBackOff');
  });
});

describe('owner passes move the counters the fault actually moves', () => {
  it('a readiness failure never restarts the container and never lists the Pod', () => {
    let state = initialState('notready-probe');
    for (let pass = 0; pass < 3; pass++) state = reconcile(state);
    expect(factsOf(state)).toMatchObject({ ready: false, restarts: 0 });
    expect(listedOf(state)).toBe(false);
  });

  it('a crash loop restarts exactly once per owner pass until its cause is fixed', () => {
    const start = initialState('crash-oom');
    const next = reconcile(start);
    expect(factsOf(next).restarts).toBe(factsOf(start).restarts + 1);
    expect(factsOf(next).status).toBe('CrashLoopBackOff');
  });

  it('reconciling a settled, fixed object changes no observable fact', () => {
    const done = settle(fixed('pending-cpu'));
    const again = reconcile(done);
    expect(factsOf(again)).toEqual(factsOf(done));
    expect(podName(again)).toBe(podName(done));
  });
});

describe('every fault is broken before its fix and healthy after it', () => {
  it.each(SCENARIO_IDS)('%s is not listed before its fix', (id) => {
    const start = initialState(id);
    expect(listedOf(start)).toBe(false);
    expect(factsOf(start).ready).toBe(id === 'no-endpoints');
  });

  it.each(SCENARIO_IDS)('%s is Ready and listed once its fix has settled', (id) => {
    const done = settle(fixed(id));
    expect(factsOf(done).ready).toBe(true);
    expect(listedOf(done)).toBe(true);
  });
});

describe('observable facts stay consistent across reachable states', () => {
  it.each(SCENARIO_IDS)('%s: phase, container, readiness and endpoints agree', (id) => {
    const start = initialState(id);
    const sequence = [start, reconcile(start), deletePod(start), fixed(id), reconcile(fixed(id))];
    for (const state of sequence) {
      const facts = factsOf(state);
      if (facts.phase === 'Running') {
        expect(facts.node).not.toBeNull();
        expect(facts.container.state).not.toBe('none');
      }
      if (facts.ready) {
        expect(facts.scheduled).toBe(true);
        expect(facts.container.state).toBe('running');
      }
      if (listedOf(state)) expect(facts.ready).toBe(true);
    }
  });
});

describe('evidence staleness', () => {
  it('a snapshot is stale once an owner has run after it was read', () => {
    let state = readRung(initialState('crash-oom'), 0);
    expect(isStale(state, 0)).toBe(false);
    state = reconcile(state);
    expect(isStale(state, 0)).toBe(true);
    state = readRung(state, 0);
    expect(isStale(state, 0)).toBe(false);
  });
});

describe('the manifest highlights what the last interaction read or changed', () => {
  it('reading Events highlights only the field the cause depends on', () => {
    const state = readRung(initialState('pending-cpu'), SCENARIOS['pending-cpu'].diagnosis);
    const highlighted = manifestOf(state).filter((line) => isHighlighted(state, line));
    expect(highlighted.length).toBeGreaterThan(0);
    expect(highlighted.every((line) => line.field === 'cpu')).toBe(true);
  });

  it('after a template fix the manifest shows the corrected image', () => {
    const image = manifestOf(fixed('pull-tag')).find((line) => line.field === 'image');
    expect(image?.text).toContain(':1.4.2');
  });
});

describe('names identify objects, not spec', () => {
  it('each new Pod object gets a new name, and a template fix moves it to the new ReplicaSet', () => {
    const start = initialState('pull-tag');
    const deleted = deletePod(start);
    const applied = applyFix(readRung(deleted, SCENARIOS['pull-tag'].diagnosis));
    const names = new Set([podName(start), podName(deleted), podName(applied)]);
    expect(names.size).toBe(3);
    expect(podName(applied)).toMatch(/^orders-api-5c9f6-/);
  });
});

describe('every read states what it shows and what is still open', () => {
  /** The object states a learner can read: broken, fresh replacement, outside fix not yet reconciled, and settled after the fix. */
  const statesOf = (id: ScenarioId): LadderState[] => {
    const start = initialState(id);
    const outside = SCENARIOS[id].fix.kind === 'external' ? [applyFix(readRung(start, SCENARIOS[id].diagnosis))] : [];
    return [start, deletePod(start), fixed(id), settle(fixed(id)), ...outside];
  };

  it.each(SCENARIO_IDS)('%s: every read in every object state reads as statements, not questions', (id) => {
    for (const state of statesOf(id)) {
      for (let rung = 0; rung < RUNGS.length; rung++) {
        const { change } = readRung(state, rung);
        for (const text of [change.changed, change.actor, change.reason, change.notYet]) {
          expect(text.endsWith('?')).toBe(false);
          expect(text.endsWith('.')).toBe(true);
        }
      }
    }
  });

  it.each(SCENARIO_IDS)('%s: only the rung that names the cause unlocks the fix', (id) => {
    const diagnosis = SCENARIOS[id].diagnosis;
    const start = initialState(id);
    for (let rung = 0; rung < RUNGS.length; rung++) {
      const unlocks = readRung(start, rung).change.notYet.includes('unlocked');
      expect(unlocks).toBe(rung === diagnosis);
    }
  });

  it.each(SCENARIO_IDS)('%s: a read after the fix is settled does not offer the fix again', (id) => {
    const healthy = settle(fixed(id));
    for (let rung = 0; rung < RUNGS.length; rung++) {
      expect(readRung(healthy, rung).change.notYet.includes('unlocked')).toBe(false);
    }
  });

  it.each(SCENARIO_IDS)('%s: each stage selects its own authored note for every rung', (id) => {
    const start = initialState(id);
    const outside = SCENARIOS[id].fix.kind === 'external' ? applyFix(readRung(start, SCENARIOS[id].diagnosis)) : start;
    for (let rung = 0; rung < RUNGS.length; rung++) {
      expect(noteOf(start, rung)).toBe(NOTES[id][rung]);
      expect(noteOf(deletePod(start), rung)).toBe(FRESH[rung]);
      expect(noteOf(outside, rung)).toBe(outside.stage === 'stale' ? STALE[rung] : NOTES[id][rung]);
      expect(noteOf(settle(fixed(id)), rung)).toBe(HEALTHY[rung]);
    }
  });

  it('a template reconcile names the old Pod it removes, and only after the replacement is Ready', () => {
    const applied = applyFix(readRung(initialState('pull-tag'), SCENARIOS['pull-tag'].diagnosis));
    expect(reconcile(applied).change.changed).toContain('orders-api-7d4b5-x2k4q');
    expect(reconcile(applied).change.notYet).toContain('before this pass both Pods existed');
  });

  it('a crash reconcile reports the restart count it reached, and the next pass continues from it', () => {
    const once = reconcile(initialState('crash-oom'));
    expect(once.change.changed).toContain('RESTARTS 4');
    expect(reconcile(once).change.changed).toContain('RESTARTS 5');
  });

  it('the fix change names the field it changed, and the replacement it created', () => {
    const applied = applyFix(readRung(initialState('crash-oom'), SCENARIOS['crash-oom'].diagnosis));
    expect(applied.change.changed).toContain('limits.memory 64Mi → 256Mi');
    expect(applied.change.changed).toContain('orders-api-5c9f6-q9wz1');
  });
});

describe('labels name the parts on the object and follow the state they describe', () => {
  it('each rung label reflects whether that rung has been read on this object', () => {
    const state = readRung(initialState('pending-cpu'), 2);
    const rungs = labelsOf(state).filter((label) => label.kind === 'rung');
    expect(rungs).toHaveLength(RUNGS.length);
    expect(rungs.map((label) => label.read)).toEqual(state.read);
  });

  it('the Pod label names the current Pod object, so identity sits on the object', () => {
    const label = labelsOf(fixed('pull-tag')).find((item) => item.kind === 'pod');
    expect(label?.long.join(' ')).toContain('orders-api-5c9f6-q9wz1');
    expect(label?.short).toBe('p-2');
  });

  it('the container label describes the container state of the current object', () => {
    const none = labelsOf(initialState('pending-cpu')).find((item) => item.kind === 'container');
    const waiting = labelsOf(initialState('crash-oom')).find((item) => item.kind === 'container');
    expect(none?.short).toBe('no container');
    expect(waiting?.short).toBe('waiting');
    expect(waiting?.long.join(' ')).toContain('OOMKilled');
  });

  it('the Service label shows the selector the Service currently has, not the one the Pod carries', () => {
    const before = labelsOf(initialState('no-endpoints')).find((item) => item.kind === 'service');
    const after = labelsOf(applyFix(readRung(initialState('no-endpoints'), SCENARIOS['no-endpoints'].diagnosis))).find((item) => item.kind === 'service');
    expect(before?.long.join(' ')).toContain('app=orders ');
    expect(after?.long.join(' ')).toContain('app=orders-api');
  });
});
