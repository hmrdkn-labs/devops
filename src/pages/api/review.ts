import type { APIRoute } from 'astro';
import { z } from 'zod';
import manifest from '@/generated/content-manifest.json';
import { units, unitsById } from '@/lib/content/catalog';
import { mixedReviewQueue } from '@/lib/learning/queue';
import { json, requestJson, unauthorized, validIdempotencyKey } from '@/lib/server/api';
import { database } from '@/lib/server/runtime';
import { applyReview, normalizeRating, ratingEvidence } from '@/lib/server/scheduler';

interface DueRow {
  card_id: string;
  unit_id: string;
  unit_revision: number;
  card_type: 'short' | 'prompt' | 'scenario';
  due_at: number;
}

const bodySchema = z.object({
  cardId: z.string(),
  unitId: z.string(),
  unitRevision: z.number().int().positive(),
  rating: z.union([z.number(), z.string()]),
  idempotencyKey: z.string(),
});

const contentCards = new Map(units.flatMap((unit) =>
  unit.cards.map((card) => [card.id, { ...card, unit }] as const)));

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return unauthorized();
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit') ?? 20)));
  const rows = await database().prepare(`SELECT card_id, unit_id, unit_revision, card_type, due_at
    FROM fsrs_card WHERE user_id = ? AND due_at <= ?
    ORDER BY due_at ASC LIMIT 200`).bind(locals.user.id, Date.now()).all<DueRow>();
  const queue = mixedReviewQueue(
    rows.results.map((row) => ({ ...row, cardType: row.card_type, dueAt: row.due_at })),
    limit,
  ).flatMap((row) => {
    const content = contentCards.get(row.card_id);
    return content ? [{
      cardId: row.card_id,
      unitId: row.unit_id,
      unitRevision: row.unit_revision,
      type: row.card_type,
      dueAt: row.due_at,
      front: content.front,
      back: content.back,
      criticalPoints: content.critical_points,
      unitTitle: content.unit.metadata.title,
    }] : [];
  });
  return json({ queue, mix: { short: 0.6, prompt: 0.2, scenario: 0.2 } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return unauthorized();
  try {
    const body = bodySchema.parse(await requestJson(request));
    if (!validIdempotencyKey(body.idempotencyKey)) {
      return json({ error: 'invalid_idempotency_key' }, { status: 400 });
    }
    const unit = unitsById.get(body.unitId);
    const card = contentCards.get(body.cardId);
    const entry = manifest.units.find((candidate) => candidate.id === body.unitId);
    if (!unit || !card || !entry || card.unit.metadata.id !== body.unitId) {
      return json({ error: 'unknown_content' }, { status: 404 });
    }
    if (unit.metadata.revision !== body.unitRevision) {
      return json({ error: 'content_revision_changed', currentRevision: unit.metadata.revision }, { status: 409 });
    }
    const grade = normalizeRating(body.rating);
    const db = database();
    const priorEvent = await db.prepare(`SELECT id FROM review_event
      WHERE user_id = ? AND idempotency_key = ?`).bind(
        locals.user.id,
        body.idempotencyKey,
      ).first<{ id: string }>();
    if (priorEvent) return json({ persisted: true, duplicate: true });

    const [projection, profile] = await db.batch([
      db.prepare(`SELECT card_json FROM fsrs_card WHERE user_id = ? AND card_id = ?`).bind(
        locals.user.id,
        body.cardId,
      ),
      db.prepare(`SELECT requested_retention FROM learner_profile WHERE user_id = ?`).bind(locals.user.id),
    ]);
    const persisted = (projection.results[0] as { card_json?: string } | undefined)?.card_json ?? null;
    const retention = Number((profile.results[0] as { requested_retention?: number } | undefined)?.requested_retention ?? 0.9);
    const now = new Date();
    const scheduled = applyReview(persisted, grade, retention, now);
    const score = ratingEvidence(grade);
    const laterSuccess = scheduled.elapsedDays >= 1 && grade >= 3;
    const statements: D1PreparedStatement[] = [
      db.prepare(`INSERT OR IGNORE INTO review_event
        (id, user_id, idempotency_key, card_id, unit_id, unit_revision, objective_ids_json, card_type, rating,
         reviewed_at, scheduled_days, elapsed_days, state_before, state_after)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
          `review:${body.idempotencyKey}`,
          locals.user.id,
          body.idempotencyKey,
          body.cardId,
          body.unitId,
          body.unitRevision,
          JSON.stringify(card.objective_ids),
          card.type,
          grade,
          now.getTime(),
          scheduled.log.scheduled_days,
          scheduled.elapsedDays,
          scheduled.beforeState,
          scheduled.card.state,
        ),
      db.prepare(`INSERT INTO fsrs_card
        (user_id, card_id, unit_id, unit_revision, card_type, card_json, due_at, last_review_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, card_id) DO UPDATE SET
          unit_revision = excluded.unit_revision,
          card_type = excluded.card_type,
          card_json = excluded.card_json,
          due_at = excluded.due_at,
          last_review_at = excluded.last_review_at,
          updated_at = excluded.updated_at`).bind(
            locals.user.id,
            body.cardId,
            body.unitId,
            body.unitRevision,
            card.type,
            scheduled.cardJson,
            scheduled.card.due.getTime(),
            now.getTime(),
            now.getTime(),
          ),
      db.prepare(`INSERT OR IGNORE INTO content_acknowledgement
        (user_id, unit_id, revision, content_hash, acknowledged_at)
        VALUES (?, ?, ?, ?, ?)`).bind(
          locals.user.id,
          body.unitId,
          body.unitRevision,
          entry.content_hash,
          now.getTime(),
        ),
    ];

    for (const objectiveId of card.objective_ids) {
      const isApplication = card.type === 'scenario';
      statements.push(db.prepare(`INSERT INTO unit_evidence
        (user_id, unit_id, objective_id, objective_hash, encountered_at,
         recalled_at, recall_score, applied_at, application_score,
         retained_at, retention_score, revalidation_required, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
        ON CONFLICT(user_id, unit_id, objective_id) DO UPDATE SET
          objective_hash = excluded.objective_hash,
          encountered_at = COALESCE(unit_evidence.encountered_at, excluded.encountered_at),
          recalled_at = CASE WHEN unit_evidence.objective_hash <> excluded.objective_hash THEN excluded.recalled_at ELSE COALESCE(excluded.recalled_at, unit_evidence.recalled_at) END,
          recall_score = CASE WHEN unit_evidence.objective_hash <> excluded.objective_hash THEN excluded.recall_score WHEN excluded.recalled_at IS NULL THEN unit_evidence.recall_score ELSE excluded.recall_score END,
          applied_at = CASE WHEN unit_evidence.objective_hash <> excluded.objective_hash THEN excluded.applied_at ELSE COALESCE(excluded.applied_at, unit_evidence.applied_at) END,
          application_score = CASE WHEN unit_evidence.objective_hash <> excluded.objective_hash THEN excluded.application_score WHEN excluded.applied_at IS NULL THEN unit_evidence.application_score ELSE excluded.application_score END,
          retained_at = CASE WHEN unit_evidence.objective_hash <> excluded.objective_hash THEN excluded.retained_at ELSE COALESCE(excluded.retained_at, unit_evidence.retained_at) END,
          retention_score = CASE WHEN unit_evidence.objective_hash <> excluded.objective_hash THEN excluded.retention_score WHEN excluded.retained_at IS NULL THEN unit_evidence.retention_score ELSE excluded.retention_score END,
          revalidation_required = 0,
          updated_at = excluded.updated_at`).bind(
            locals.user.id,
            body.unitId,
            objectiveId,
            entry.objective_hashes[objectiveId as keyof typeof entry.objective_hashes],
            now.getTime(),
            isApplication ? null : now.getTime(),
            isApplication ? 0 : score,
            isApplication ? now.getTime() : null,
            isApplication ? score : 0,
            laterSuccess ? now.getTime() : null,
            laterSuccess ? score : 0,
            now.getTime(),
          ));
    }
    await db.batch(statements);
    return json({
      persisted: true,
      nextDueAt: scheduled.card.due.toISOString(),
      scheduledDays: scheduled.card.scheduled_days,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_request';
    return json({ error: message }, { status: message === 'request_too_large' ? 413 : 400 });
  }
};
