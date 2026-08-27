import { describe, expect, it } from 'vitest';
import {
  changedObjectives,
  classifyChange,
  compareRevisionManifests,
  type RevisionEntry,
} from '../src/lib/content/revision';

const before: RevisionEntry = {
  id: 'fpp:test',
  revision: 1,
  revision_impact: 'editorial',
  mastery_hash: 'm1',
  enrichment_hash: 'e1',
  editorial_hash: 'd1',
  objective_hashes: { 'objective:a': 'a1', 'objective:b': 'b1' },
};

describe('revision classification', () => {
  it('distinguishes editorial, enrichment, and mastery changes', () => {
    expect(classifyChange(before, { ...before, editorial_hash: 'd2' })).toBe('editorial');
    expect(classifyChange(before, { ...before, enrichment_hash: 'e2' })).toBe('enrichment');
    expect(classifyChange(before, { ...before, mastery_hash: 'm2' })).toBe('mastery_affecting');
  });

  it('rejects a changed unit without a revision increment or correct impact', () => {
    const errors = compareRevisionManifests(
      { units: [before] },
      { units: [{ ...before, mastery_hash: 'm2', revision_impact: 'editorial' }] },
    );
    expect(errors).toHaveLength(2);
  });

  it('identifies only objectives whose learning evidence changed', () => {
    const after = { ...before, objective_hashes: { 'objective:a': 'a2', 'objective:b': 'b1' } };
    expect(changedObjectives(before, after)).toEqual(['objective:a']);
  });

  it('requires retired IDs to remain addressable', () => {
    expect(compareRevisionManifests({ units: [before] }, { units: [] })[0]).toContain('retired IDs');
  });
});
