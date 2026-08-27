export type RevisionImpact = 'editorial' | 'enrichment' | 'mastery_affecting';

export interface RevisionEntry {
  id: string;
  revision: number;
  revision_impact: RevisionImpact;
  status?: string;
  mastery_hash: string;
  enrichment_hash: string;
  editorial_hash: string;
  objective_hashes?: Record<string, string>;
}

export function classifyChange(before: RevisionEntry, after: RevisionEntry): RevisionImpact | null {
  if (after.mastery_hash !== before.mastery_hash) return 'mastery_affecting';
  if (after.enrichment_hash !== before.enrichment_hash) return 'enrichment';
  if (after.editorial_hash !== before.editorial_hash) return 'editorial';
  return null;
}

export function changedObjectives(before: RevisionEntry, after: RevisionEntry) {
  const prior = before.objective_hashes ?? {};
  const current = after.objective_hashes ?? {};
  return [...new Set([...Object.keys(prior), ...Object.keys(current)])]
    .filter((id) => prior[id] !== current[id])
    .sort();
}

export function compareRevisionManifests(
  previous: { units: RevisionEntry[] },
  current: { units: RevisionEntry[] },
) {
  const previousById = new Map(previous.units.map((entry) => [entry.id, entry]));
  const errors: string[] = [];

  for (const entry of current.units) {
    const before = previousById.get(entry.id);
    if (!before) continue;
    const expected = classifyChange(before, entry);
    if (expected && entry.revision <= before.revision) {
      errors.push(`${entry.id}: changed content must increment revision above ${before.revision}`);
    }
    if (expected && entry.revision_impact !== expected) {
      errors.push(`${entry.id}: classified ${entry.revision_impact}, expected ${expected}`);
    }
  }

  for (const before of previous.units) {
    const after = current.units.find((entry) => entry.id === before.id);
    if (!after) {
      errors.push(`${before.id}: retired IDs must remain in the manifest with a retired status`);
    }
  }
  return errors;
}
