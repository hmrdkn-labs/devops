import type { APIRoute } from 'astro';
import manifest from '@/generated/content-manifest.json';
import { paths, unitsById } from '@/lib/content/catalog';
import {
  masteryState,
  readinessV1,
  weightedPathReadiness,
  type EvidenceProjection,
} from '@/lib/learning/readiness';
import { json, unauthorized } from '@/lib/server/api';
import { database } from '@/lib/server/runtime';

interface EvidenceRow {
  unit_id: string;
  objective_id: string;
  objective_hash: string;
  encountered_at: number | null;
  recalled_at: number | null;
  recall_score: number;
  applied_at: number | null;
  application_score: number;
  retained_at: number | null;
  retention_score: number;
  revalidation_required: number;
}

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return unauthorized();
  const rows = await database().prepare(`SELECT unit_id, objective_id, objective_hash,
    encountered_at, recalled_at, recall_score, applied_at, application_score,
    retained_at, retention_score, revalidation_required
    FROM unit_evidence WHERE user_id = ?`).bind(locals.user.id).all<EvidenceRow>();
  const byObjective = new Map(rows.results.map((row) => [row.objective_id, row]));
  const unitResults = manifest.units.map((entry) => {
    const unit = unitsById.get(entry.id);
    const projections = (unit?.metadata.objectives ?? []).map((objective) => {
      const row = byObjective.get(objective.id);
      const hashChanged = row ? row.objective_hash !== entry.objective_hashes[objective.id as keyof typeof entry.objective_hashes] : false;
      const projection: EvidenceProjection = {
        encounteredAt: row?.encountered_at ?? null,
        recalledAt: row?.recalled_at ?? null,
        recallScore: row?.recall_score ?? 0,
        appliedAt: row?.applied_at ?? null,
        applicationScore: row?.application_score ?? 0,
        retainedAt: row?.retained_at ?? null,
        retentionScore: row?.retention_score ?? 0,
        revalidationRequired: Boolean(row?.revalidation_required) || hashChanged,
      };
      return {
        id: objective.id,
        critical: objective.critical,
        score: readinessV1(projection),
        state: masteryState(projection),
        revalidationRequired: projection.revalidationRequired,
      };
    });
    const score = projections.length
      ? projections.reduce((sum, objective) => sum + objective.score, 0) / projections.length
      : 0;
    const state = score >= 0.82 ? 'Retained'
      : score >= 0.62 ? 'Applied'
        : score >= 0.38 ? 'Recalled'
          : score > 0 ? 'Encountered'
            : 'Not started';
    return {
      id: entry.id,
      slug: entry.slug,
      title: entry.title,
      score,
      state,
      objectives: projections,
    };
  });
  const byUnit = new Map(unitResults.map((unit) => [unit.id, unit]));
  const pathResults = paths.map((path) => {
    const weighted = path.units.map((entry) => ({
      weight: entry.weight,
      score: byUnit.get(entry.unit_id)?.score ?? 0,
    }));
    return {
      id: path.id,
      slug: path.slug,
      title: path.title,
      readiness: weightedPathReadiness(weighted),
    };
  });
  return json({ readinessVersion: 'readiness-v1', units: unitResults, paths: pathResults });
};
