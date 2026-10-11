import { describe, expect, it } from 'vitest';
import { advance, candidates, choose, evaluate, INITIAL, NODES, type Placement } from '../src/components/anatomy/scheduling-placement/model';

describe('capacity placement bench semantics', () => {
  it('accepts equality in both dimensions but rejects a shortfall in either', () => {
    const node = NODES.mixed[0]!;
    expect(evaluate(node, { cpu: 300, memory: 2048 }).eligible).toBe(true);
    expect(evaluate(node, { cpu: 301, memory: 2048 })).toMatchObject({ eligible: false, score: null });
    expect(evaluate(node, { cpu: 300, memory: 2049 })).toMatchObject({ eligible: false, score: null });
  });

  it('does not select or assign when all nodes fail even one requested dimension', () => {
    const state: Placement = { ...INITIAL, request: { cpu: 1500, memory: 512 } };
    const filtered = advance(state);
    expect(candidates(filtered).every((candidate) => !candidate.eligible)).toBe(true);
    expect(choose(filtered)).toBeNull();
    expect(advance(filtered)).toEqual({ ...state, phase: 'filtered', selected: null });
  });

  it('breaks exact illustrative ties deterministically only within the feasible set', () => {
    const equal: Placement = { ...INITIAL, fixture: 'equal', phase: 'filtered' };
    expect(choose(equal)).toBe('node-a');
    expect(choose({ ...INITIAL, request: { cpu: 600, memory: 1024 } })).toBe('node-c');
  });

  it('keeps selection, assignment, and node execution as distinct transitions', () => {
    const filtered = advance(INITIAL);
    const selected = advance(filtered);
    expect(selected).toMatchObject({ phase: 'selected', selected: 'node-c' });
    const assigned = advance(selected);
    expect(assigned.phase).toBe('assigned');
    const running = advance(assigned);
    expect(running.phase).toBe('running');
    expect(advance(running)).toEqual(running);
  });
});
