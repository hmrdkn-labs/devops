import type { APIRoute } from 'astro';
import manifest from '@/generated/content-manifest.json';
import { paths, unitsById } from '@/lib/content/catalog';
import { unitCompletion, type CompletionMark } from '@/lib/learning/completion';
import {
  masteryState,
  readinessBreakdownV1,
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

interface ReviewEventRow {
  objective_ids_json: string;
  rating: number;
}

interface RecentRow {
  unit_id: string;
  happened_at: number;
}

interface AttemptProgressRow {
  unit_id: string;
  question_id: string;
  completed_at: number;
}

interface TaskProgressRow {
  unit_id: string;
  task_type: 'lesson' | 'practice';
  task_id: string;
  completed_at: number;
}

const averageBreakdown = (items: Array<ReturnType<typeof readinessBreakdownV1>>) => {
  if (!items.length) return { encountered: 0, recall: 0, application: 0, retention: 0 };
  return {
    encountered: items.reduce((sum, item) => sum + item.encountered, 0) / items.length,
    recall: items.reduce((sum, item) => sum + item.recall, 0) / items.length,
    application: items.reduce((sum, item) => sum + item.application, 0) / items.length,
    retention: items.reduce((sum, item) => sum + item.retention, 0) / items.length,
  };
};

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return unauthorized();
  const db = database();
  const [
    evidenceResult,
    reviewResult,
    attemptProgressResult,
    taskProgressResult,
    recentAttemptResult,
    recentReviewResult,
    recentTaskResult,
  ] = await db.batch([
    db.prepare(`SELECT unit_id, objective_id, objective_hash,
      encountered_at, recalled_at, recall_score, applied_at, application_score,
      retained_at, retention_score, revalidation_required
      FROM unit_evidence WHERE user_id = ?`).bind(locals.user.id),
    db.prepare(`SELECT objective_ids_json, rating FROM review_event
      WHERE user_id = ? ORDER BY reviewed_at DESC LIMIT 500`).bind(locals.user.id),
    db.prepare(`SELECT unit_id, question_id, MAX(submitted_at) AS completed_at
      FROM attempt WHERE user_id = ?
      GROUP BY unit_id, question_id`).bind(locals.user.id),
    db.prepare(`SELECT unit_id, task_type, task_id, completed_at
      FROM unit_task_progress WHERE user_id = ?`).bind(locals.user.id),
    db.prepare(`SELECT unit_id, submitted_at AS happened_at FROM attempt
      WHERE user_id = ? ORDER BY submitted_at DESC LIMIT 1`).bind(locals.user.id),
    db.prepare(`SELECT unit_id, reviewed_at AS happened_at FROM review_event
      WHERE user_id = ? ORDER BY reviewed_at DESC LIMIT 1`).bind(locals.user.id),
    db.prepare(`SELECT unit_id, updated_at AS happened_at FROM unit_task_progress
      WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1`).bind(locals.user.id),
  ]);
  const rows = { results: evidenceResult.results as unknown as EvidenceRow[] };
  const struggleCounts = new Map<string, number>();
  for (const event of reviewResult.results as unknown as ReviewEventRow[]) {
    if (event.rating > 2) continue;
    try {
      for (const objectiveId of JSON.parse(event.objective_ids_json) as string[]) {
        struggleCounts.set(objectiveId, (struggleCounts.get(objectiveId) ?? 0) + 1);
      }
    } catch {
      // Historical rows with malformed objective metadata should not break progress.
    }
  }
  const byObjective = new Map(rows.results.map((row) => [row.objective_id, row]));
  const answeredByUnit = new Map<string, CompletionMark[]>();
  for (const row of attemptProgressResult.results as unknown as AttemptProgressRow[]) {
    const items = answeredByUnit.get(row.unit_id) ?? [];
    items.push({ id: row.question_id, completedAt: row.completed_at });
    answeredByUnit.set(row.unit_id, items);
  }
  const tasksByUnit = new Map<string, TaskProgressRow[]>();
  for (const row of taskProgressResult.results as unknown as TaskProgressRow[]) {
    const items = tasksByUnit.get(row.unit_id) ?? [];
    items.push(row);
    tasksByUnit.set(row.unit_id, items);
  }
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
      const breakdown = readinessBreakdownV1(projection);
      return {
        id: objective.id,
        title: objective.title,
        critical: objective.critical,
        score: readinessV1(projection),
        state: masteryState(projection),
        breakdown,
        struggleCount: struggleCounts.get(objective.id) ?? 0,
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
    const taskRows = tasksByUnit.get(entry.id) ?? [];
    const completion = unitCompletion({
      questionIds: unit?.questions.map((question) => question.id) ?? [],
      answeredQuestions: answeredByUnit.get(entry.id) ?? [],
      lessonCompletedAt: taskRows.find((task) => task.task_type === 'lesson' && task.task_id === 'lesson')?.completed_at ?? null,
      practiceIds: unit?.practices.map((practice) => practice.id) ?? [],
      completedPractices: taskRows
        .filter((task) => task.task_type === 'practice')
        .map((task) => ({ id: task.task_id, completedAt: task.completed_at })),
    });
    const needsRefresh = projections.some((objective) => objective.revalidationRequired);
    const understandingState = needsRefresh ? 'Needs refresh'
      : state === 'Retained' ? 'Strong / retained'
        : state === 'Applied' ? 'Can apply'
          : state === 'Recalled' ? 'Understands basics'
            : state === 'Encountered' ? 'Introduced'
              : 'No evidence';
    return {
      id: entry.id,
      slug: entry.slug,
      title: entry.title,
      score,
      state,
      completion,
      understanding: {
        state: understandingState,
        evidenceState: state,
        score,
        needsRefresh,
      },
      breakdown: averageBreakdown(projections.map((objective) => objective.breakdown)),
      objectives: projections,
    };
  });
  const byUnit = new Map(unitResults.map((unit) => [unit.id, unit]));
  const pathResults = paths.map((path) => {
    const weighted = path.units.map((entry) => ({
      weight: entry.weight,
      score: byUnit.get(entry.unit_id)?.score ?? 0,
    }));
    const totalWeight = path.units.reduce((sum, entry) => sum + entry.weight, 0);
    const breakdown = path.units.reduce((acc, entry) => {
      const unit = byUnit.get(entry.unit_id);
      if (!unit) return acc;
      acc.encountered += unit.breakdown.encountered * entry.weight;
      acc.recall += unit.breakdown.recall * entry.weight;
      acc.application += unit.breakdown.application * entry.weight;
      acc.retention += unit.breakdown.retention * entry.weight;
      return acc;
    }, { encountered: 0, recall: 0, application: 0, retention: 0 });
    if (totalWeight) {
      breakdown.encountered /= totalWeight;
      breakdown.recall /= totalWeight;
      breakdown.application /= totalWeight;
      breakdown.retention /= totalWeight;
    }
    return {
      id: path.id,
      slug: path.slug,
      title: path.title,
      readiness: weightedPathReadiness(weighted),
      breakdown,
    };
  });
  const recentCandidates = [
    recentAttemptResult.results[0] as unknown as RecentRow | undefined,
    recentReviewResult.results[0] as unknown as RecentRow | undefined,
    recentTaskResult.results[0] as unknown as RecentRow | undefined,
  ].filter((row): row is RecentRow => Boolean(row));
  recentCandidates.sort((a, b) => b.happened_at - a.happened_at);
  return json({
    readinessVersion: 'readiness-v1',
    units: unitResults,
    paths: pathResults,
    recentUnitId: recentCandidates[0]?.unit_id ?? null,
  });
};
