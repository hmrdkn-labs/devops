import { describe, expect, it } from 'vitest';
import { advance, candidates, changeRunningLabels, evaluate, initialState, winner } from '../src/components/anatomy/node-affinity/model';

describe('node-affinity sorter semantics', () => {
  it('ANDs selector with required terms, while ORing the terms', () => {
    const state = initialState();
    expect(candidates(state).filter(row => row.eligible).map(row => row.node.id)).toEqual(['node-a', 'node-b']);
    const westHdd = { id: 'node-d', disk: 'hdd', zone: 'west', capacity: true };
    expect(evaluate(westHdd, state.settings)).toMatchObject({ required: true, selector: false, eligible: false, score: null });
    expect(evaluate(westHdd, { ...state.settings, selector: 'any' }).eligible).toBe(true);
  });

  it('does not let maximum preference rescue a contradictory hard predicate', () => {
    const state = initialState();
    state.settings = { ...state.settings, selector: 'hdd', required: 'east-ssd', preferredZone: 'east', weight: 100 };
    expect(winner(state)).toBeNull();
    const filtered = advance(state);
    expect(advance(filtered)).toMatchObject({ phase: 'unscheduled', bound: null });
  });

  it('allows a zero-preference match, but still rejects insufficient request capacity', () => {
    const state = initialState();
    state.settings = { ...state.settings, selector: 'hdd', required: 'none', preferredZone: 'west' };
    expect(winner(state)).toBe('node-c');
    expect(candidates(state)[2]).toMatchObject({ eligible: true, score: 0 });
    state.settings.capacityC = false;
    expect(winner(state)).toBeNull();
  });

  it('keeps assignment separate from execution and does not evict on label changes', () => {
    let state = initialState();
    state = advance(advance(advance(state)));
    expect(state).toMatchObject({ phase: 'assigned', bound: 'node-b' });
    expect(changeRunningLabels(state).labelsChanged).toBe(false);
    state = changeRunningLabels(advance(state));
    expect(state).toMatchObject({ phase: 'running', bound: 'node-b', labelsChanged: true });
    expect(candidates(state).find(row => row.node.id === 'node-b')).toMatchObject({ eligible: false, score: null });
    expect(winner(state)).toBe('node-a');
    expect(advance(state).bound).toBe('node-b');
  });
});
