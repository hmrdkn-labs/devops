import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  advance, candidates, changeRunningLabels, evaluate, feelers, initialState, lifecycle, manifest, plungerRise, reduce,
  replay, setSetting, winner, type Evaluation, type FixtureNode, type NodeId, type Phase, type RequiredRule, type SelectorRule, type State,
} from '../src/components/anatomy/node-affinity/model';

const runTo = (state: State, phase: Phase): State => {
  let next = state;
  while (next.phase !== phase && next.phase !== 'running' && next.phase !== 'unscheduled') next = advance(next);
  return next;
};
const node = (id: NodeId, disk: FixtureNode['disk'], zone: FixtureNode['zone'], capacity = true): FixtureNode =>
  ({ id, disk, zone, capacity });
const byId = (rows: Evaluation[], id: string) => rows.find((row) => row.node.id === id)!;

describe('node-affinity hard predicates', () => {
  it('ANDs the nodeSelector with required affinity, so a selector failure is not rescued by an OR term', () => {
    const state = initialState();
    expect(candidates(state).filter((row) => row.eligible).map((row) => row.node.id)).toEqual(['node-a', 'node-b']);
    const westHdd = node('node-c', 'hdd', 'west');
    expect(evaluate(westHdd, state.settings)).toMatchObject({ eligible: false, score: null });
    expect(evaluate(westHdd, { ...state.settings, selector: 'any' }).eligible).toBe(true);
  });

  it('ORs required terms but ANDs the expressions inside one term', () => {
    const settings = initialState().settings;
    const westSsd = node('node-b', 'ssd', 'west');
    expect(evaluate(westSsd, { ...settings, selector: 'any', required: 'east-ssd-or-west' }).required.pass).toBe(true);
    expect(evaluate(westSsd, { ...settings, selector: 'any', required: 'east-ssd' }).required.pass).toBe(false);
    const eastHdd = evaluate(node('node-c', 'hdd', 'east'), { ...settings, selector: 'any', required: 'east-ssd' });
    expect(eastHdd.terms[0]!.expressions.map((item) => item.pass)).toEqual([true, false]);
    expect(eastHdd.required.pass).toBe(false);
  });

  it('keeps request capacity as a hard predicate that no preference can override', () => {
    const state = initialState();
    state.settings = { ...state.settings, selector: 'hdd', required: 'none', preferredZone: 'west' };
    expect(winner(state)).toBe('node-c');
    expect(candidates(state)[2]).toMatchObject({ eligible: true, score: 0 });
    const noCapacity = setSetting(state, 'capacityC', false);
    expect(winner(noCapacity)).toBeNull();
  });

  it('gives an eligible node with no preference match a zero score rather than rejecting it', () => {
    const state = setSetting(initialState(), 'required', 'none');
    const cs = setSetting(setSetting(state, 'selector', 'hdd'), 'preferredZone', 'west');
    const row = byId(candidates(cs), 'node-c');
    expect(row).toMatchObject({ eligible: true, score: 0, preference: { match: false } });
    expect(plungerRise(row, true)).toBeGreaterThan(0);
  });

  it('does not let maximum preference rescue a contradictory hard predicate', () => {
    let state = setSetting(initialState(), 'selector', 'hdd');
    state = setSetting(state, 'required', 'east-ssd');
    state = setSetting(state, 'preferredZone', 'east');
    state = setSetting(state, 'weight', 100);
    expect(winner(state)).toBeNull();
    const filtered = advance(state);
    expect(advance(filtered)).toMatchObject({ phase: 'unscheduled', bound: null });
    expect(advance(state)).toMatchObject({ phase: 'unscheduled', bound: null });
  });

  it('breaks equal scores by alphabetically first node id', () => {
    let state = setSetting(initialState(), 'selector', 'any');
    state = setSetting(state, 'required', 'none');
    state = setSetting(state, 'preferredZone', 'east');
    const rows = candidates(state);
    expect(byId(rows, 'node-a').score).toBe(byId(rows, 'node-c').score);
    expect(winner(state)).toBe('node-a');
  });
});

describe('feeler indicators reflect one predicate each', () => {
  it('keeps label feelers lifted when only request capacity fails', () => {
    const state = setSetting(initialState(), 'capacityC', true);
    const failing = evaluate(node('node-a', 'ssd', 'east', false), state.settings);
    expect(feelers(failing, true)).toEqual({ selector: true, required: true, capacity: false });
  });

  it('keeps every feeler down before evaluation', () => {
    const rows = candidates(initialState());
    expect(rows.map((row) => feelers(row, false))).toEqual(rows.map(() => ({ selector: false, required: false, capacity: false })));
  });

  it('keeps a feeler down for a check that does not apply', () => {
    let state = setSetting(initialState(), 'required', 'none');
    state = setSetting(state, 'selector', 'any');
    expect(feelers(byId(candidates(state), 'node-a'), true)).toMatchObject({ selector: false, required: false, capacity: true });
  });
});

describe('transitions keep assignment, running and the Pod identity separate', () => {
  it('assigns on the scored step and runs only on the later start step', () => {
    let state = initialState();
    state = advance(state);
    expect(state).toMatchObject({ phase: 'filtered', bound: null });
    state = advance(state);
    expect(state).toMatchObject({ phase: 'scored', bound: null });
    state = advance(state);
    expect(state).toMatchObject({ phase: 'assigned', bound: 'node-b' });
    expect(lifecycle(state)).toEqual({ assignedTo: 'node-b', running: false, unscheduled: false });
    state = advance(state);
    expect(lifecycle(state)).toEqual({ assignedTo: 'node-b', running: true, unscheduled: false });
  });

  it('ends unscheduled at the filter step when no node is eligible', () => {
    const state = setSetting(setSetting(initialState(), 'selector', 'hdd'), 'required', 'east-ssd');
    expect(advance(state)).toMatchObject({ phase: 'unscheduled', bound: null });
  });

  it('keeps the bound node when labels change, while the next Pod is placed under the current rules', () => {
    let state = runTo(initialState(), 'running');
    state = changeRunningLabels(state);
    expect(state).toMatchObject({ phase: 'running', bound: 'node-b', relabeled: true });
    expect(byId(candidates(state), 'node-b')).toMatchObject({ eligible: false, score: null });
    expect(winner(state)).toBe('node-a');
    expect(advance(state).bound).toBe('node-b');
  });

  it('only relabels a running Pod, and only once', () => {
    const early = initialState();
    expect(changeRunningLabels(early)).toBe(early);
    const running = runTo(initialState(), 'running');
    expect(changeRunningLabels(changeRunningLabels(running))).toEqual(changeRunningLabels(running));
  });

  it('freezes rules once a node is bound', () => {
    const assigned = runTo(initialState(), 'assigned');
    expect(setSetting(assigned, 'selector', 'hdd')).toBe(assigned);
  });

  it('restarts evaluation for the same Pod when a rule changes before binding', () => {
    const scored = runTo(initialState(), 'scored');
    const next = setSetting(scored, 'weight', 80);
    expect(next).toMatchObject({ phase: 'created', bound: null, serial: scored.serial });
  });

  it('clamps the preference weight to the 1-100 range', () => {
    expect(setSetting(initialState(), 'weight', 0).settings.weight).toBe(1);
    expect(setSetting(initialState(), 'weight', 500).settings.weight).toBe(100);
  });

  it('replays as a new Pod identity with the same rules, and reset returns the defaults', () => {
    let state = setSetting(initialState(), 'selector', 'hdd');
    state = runTo(state, 'running');
    const replayed = replay(state);
    expect(replayed).toMatchObject({ phase: 'created', bound: null, relabeled: false, serial: 2 });
    expect(replayed.settings.selector).toBe('hdd');
    expect(reduce(replayed, { kind: 'reset' })).toMatchObject({ serial: 1, bound: null });
    expect(reduce(replayed, { kind: 'reset' }).settings.selector).toBe('ssd');
  });
});

describe('invariants over every rule combination and step count', () => {
  const selectors: SelectorRule[] = ['any', 'ssd', 'hdd'];
  const requireds: RequiredRule[] = ['none', 'east-ssd', 'east-ssd-or-west'];
  it('binds a node exactly when the phase is assigned or running, and never relabels before running', () => {
    for (const selector of selectors) for (const required of requireds) for (const capacityC of [true, false]) {
      let state = initialState();
      state = setSetting(state, 'selector', selector);
      state = setSetting(state, 'required', required);
      state = setSetting(state, 'capacityC', capacityC);
      for (let step = 0; step < 6; step++) {
        const bound = state.bound !== null;
        expect(bound).toBe(state.phase === 'assigned' || state.phase === 'running');
        if (state.phase !== 'running') expect(state.relabeled).toBe(false);
        state = advance(state);
      }
    }
  });

  it('generates Pod YAML that parses and carries the rule terms the model evaluates', () => {
    for (const selector of selectors) for (const required of requireds) {
      let state = setSetting(initialState(), 'selector', selector);
      state = setSetting(state, 'required', required);
      const text = manifest(state).map((line) => line.text).join('\n');
      const doc = parse(text) as { spec: { nodeSelector?: unknown; affinity: { nodeAffinity: Record<string, unknown> } } };
      expect(doc.spec.nodeSelector !== undefined).toBe(selector !== 'any');
      const terms = doc.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution as
        { nodeSelectorTerms: unknown[] } | undefined;
      expect(terms?.nodeSelectorTerms.length ?? 0).toBe(required === 'none' ? 0 : required === 'east-ssd' ? 1 : 2);
    }
  });

  it('highlights only the YAML groups the last interaction depends on', () => {
    const none = manifest(initialState());
    expect(none.some((line) => line.highlight)).toBe(false);
    const filtered = manifest(advance(initialState()));
    expect(filtered.find((line) => line.text.includes('disk: ssd'))?.highlight).toBe(true);
    expect(filtered.find((line) => line.text.includes('weight:'))?.highlight).toBe(false);
  });
});

describe('ManifestPanel marks the fields each interaction read', () => {
  const marked = (state: State) => manifest(state).filter((line) => line.highlight).map((line) => line.text);
  const has = (lines: string[], fragment: string) => lines.some((line) => line.includes(fragment));

  it('marks the request line once capacity is evaluated, and not the preferred block', () => {
    const lit = marked(advance(initialState()));
    expect(has(lit, 'cpu: 500m')).toBe(true);
    expect(has(lit, 'disk: ssd')).toBe(true);
    expect(has(lit, 'weight:')).toBe(false);
  });

  it('marks the preferred block only after the score step', () => {
    const evaluated = advance(initialState());
    expect(has(marked(evaluated), 'weight:')).toBe(false);
    expect(has(marked(advance(evaluated)), 'weight:')).toBe(true);
  });

  it('marks only the request line when just node-c capacity is switched', () => {
    const lit = marked(setSetting(initialState(), 'capacityC', false));
    expect(has(lit, 'cpu: 500m')).toBe(true);
    expect(has(lit, 'disk: ssd')).toBe(false);
  });

  it('marks the bound node after assignment, and not the rules', () => {
    const lit = marked(advance(advance(advance(initialState()))));
    expect(has(lit, 'nodeName: node-b')).toBe(true);
    expect(has(lit, 'disk: ssd')).toBe(false);
  });
});
