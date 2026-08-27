import type { APIRoute } from 'astro';
import { z } from 'zod';
import manifest from '@/generated/content-manifest.json';
import { unitsById } from '@/lib/content/catalog';
import { json, requestJson, unauthorized, validIdempotencyKey } from '@/lib/server/api';
import { database } from '@/lib/server/runtime';
import { emptyCard } from '@/lib/server/scheduler';

const bodySchema = z.object({
  unitId: z.string(),
  unitRevision: z.number().int().positive(),
  questionId: z.string(),
  answerMarkdown: z.string().min(1).max(20_000),
  idempotencyKey: z.string(),
});

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return unauthorized();
  try {
    const body = bodySchema.parse(await requestJson(request));
    if (!validIdempotencyKey(body.idempotencyKey)) {
      return json({ error: 'invalid_idempotency_key' }, { status: 400 });
    }
    const unit = unitsById.get(body.unitId);
    const entry = manifest.units.find((candidate) => candidate.id === body.unitId);
    const question = unit?.questions.find((candidate) => candidate.id === body.questionId);
    if (!unit || !entry || !question) return json({ error: 'unknown_content' }, { status: 404 });
    if (unit.metadata.revision !== body.unitRevision) {
      return json({ error: 'content_revision_changed', currentRevision: unit.metadata.revision }, { status: 409 });
    }

    const db = database();
    const now = Date.now();
    const statements: D1PreparedStatement[] = [
      db.prepare(`INSERT OR IGNORE INTO attempt
        (id, user_id, idempotency_key, unit_id, unit_revision, question_id, objective_ids_json, answer_markdown, critical_points_json, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', ?)`).bind(
          `attempt:${body.idempotencyKey}`,
          locals.user.id,
          body.idempotencyKey,
          body.unitId,
          body.unitRevision,
          body.questionId,
          JSON.stringify(question.objective_ids),
          body.answerMarkdown,
          now,
        ),
      db.prepare(`INSERT OR IGNORE INTO private_answer
        (id, user_id, unit_id, unit_revision, question_id, answer_markdown, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
          `answer:${body.idempotencyKey}`,
          locals.user.id,
          body.unitId,
          body.unitRevision,
          body.questionId,
          body.answerMarkdown,
          now,
        ),
      db.prepare(`INSERT OR IGNORE INTO learner_profile
        (user_id, active_path_id, timezone, requested_retention, created_at, updated_at)
        VALUES (?, 'path:from-process-to-pod', 'UTC', 0.9, ?, ?)`).bind(locals.user.id, now, now),
    ];

    for (const objectiveId of question.objective_ids) {
      statements.push(db.prepare(`INSERT INTO unit_evidence
        (user_id, unit_id, objective_id, objective_hash, encountered_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, unit_id, objective_id) DO UPDATE SET
          objective_hash = excluded.objective_hash,
          encountered_at = COALESCE(unit_evidence.encountered_at, excluded.encountered_at),
          recalled_at = CASE WHEN unit_evidence.objective_hash <> excluded.objective_hash THEN NULL ELSE unit_evidence.recalled_at END,
          recall_score = CASE WHEN unit_evidence.objective_hash <> excluded.objective_hash THEN 0 ELSE unit_evidence.recall_score END,
          applied_at = CASE WHEN unit_evidence.objective_hash <> excluded.objective_hash THEN NULL ELSE unit_evidence.applied_at END,
          application_score = CASE WHEN unit_evidence.objective_hash <> excluded.objective_hash THEN 0 ELSE unit_evidence.application_score END,
          retained_at = CASE WHEN unit_evidence.objective_hash <> excluded.objective_hash THEN NULL ELSE unit_evidence.retained_at END,
          retention_score = CASE WHEN unit_evidence.objective_hash <> excluded.objective_hash THEN 0 ELSE unit_evidence.retention_score END,
          revalidation_required = CASE WHEN unit_evidence.objective_hash <> excluded.objective_hash THEN 1 ELSE unit_evidence.revalidation_required END,
          updated_at = excluded.updated_at`).bind(
            locals.user.id,
            body.unitId,
            objectiveId,
            entry.objective_hashes[objectiveId as keyof typeof entry.objective_hashes],
            now,
            now,
          ));
    }

    const initialCard = JSON.stringify(emptyCard(new Date(now)));
    for (const card of unit.cards) {
      statements.push(db.prepare(`INSERT OR IGNORE INTO fsrs_card
        (user_id, card_id, unit_id, unit_revision, card_type, card_json, due_at, last_review_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`).bind(
          locals.user.id,
          card.id,
          body.unitId,
          body.unitRevision,
          card.type,
          initialCard,
          now,
          now,
        ));
    }
    await db.batch(statements);
    return json({ persisted: true, attemptId: `attempt:${body.idempotencyKey}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_request';
    return json({ error: message }, { status: message === 'request_too_large' ? 413 : 400 });
  }
};
