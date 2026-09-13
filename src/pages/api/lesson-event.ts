import type { APIRoute } from 'astro';
import { z } from 'zod';
import manifest from '@/generated/content-manifest.json';
import { lessonsById, unitsById } from '@/lib/content/catalog';
import { classifyLessonEvidence, LESSON_INTERACTION_SCORE } from '@/lib/learning/lesson-evidence';
import { json, requestJson, unauthorized, validIdempotencyKey } from '@/lib/server/api';
import { database } from '@/lib/server/runtime';

const bodySchema = z.object({
  lessonId: z.string(),
  lessonRevision: z.number().int().positive(),
  exerciseId: z.string(),
  assisted: z.boolean(),
  correct: z.boolean(),
  completed: z.boolean(),
  responseMarkdown: z.string().max(20_000).optional(),
  idempotencyKey: z.string(),
});

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return unauthorized();
  try {
    const body = bodySchema.parse(await requestJson(request));
    if (!validIdempotencyKey(body.idempotencyKey)) {
      return json({ error: 'invalid_idempotency_key' }, { status: 400 });
    }
    const lesson = lessonsById.get(body.lessonId);
    const exercise = lesson?.exercises.find((candidate) => candidate.id === body.exerciseId);
    const unit = exercise ? unitsById.get(exercise.unit_id) : null;
    const entry = exercise ? manifest.units.find((candidate) => candidate.id === exercise.unit_id) : null;
    if (!lesson || !exercise || !unit || !entry) return json({ error: 'unknown_content' }, { status: 404 });
    if (lesson.revision !== body.lessonRevision) {
      return json({ error: 'content_revision_changed', currentRevision: lesson.revision }, { status: 409 });
    }

    const db = database();
    const prior = await db.prepare(`SELECT id FROM attempt
      WHERE user_id = ? AND idempotency_key = ?`).bind(
        locals.user.id,
        body.idempotencyKey,
      ).first<{ id: string }>();
    if (prior) return json({ persisted: true, duplicate: true });
    const now = Date.now();
    const evidence = classifyLessonEvidence({
      assisted: body.assisted,
      correct: body.correct,
      intendedEvidence: exercise.evidence,
    });
    const responseText = body.responseMarkdown?.trim() ?? '';
    const statements: D1PreparedStatement[] = [];
    statements.push(db.prepare(`INSERT OR IGNORE INTO learner_profile
      (user_id, active_path_id, timezone, requested_retention, created_at, updated_at)
      VALUES (?, 'path:kcna', 'UTC', 0.9, ?, ?)`).bind(locals.user.id, now, now));
    statements.push(db.prepare(`INSERT OR IGNORE INTO attempt
      (id, user_id, idempotency_key, unit_id, unit_revision, question_id, objective_ids_json,
       answer_markdown, critical_points_json, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', ?)`).bind(
        `attempt:${body.idempotencyKey}`,
        locals.user.id,
        body.idempotencyKey,
        exercise.unit_id,
        unit.metadata.revision,
        exercise.id,
        JSON.stringify(exercise.objective_ids),
        responseText || `Lesson interaction: ${body.correct ? 'correct' : 'not correct'}; ${body.assisted ? 'assisted' : 'unassisted'}.`,
        now,
      ));

    if (body.completed) {
      statements.push(db.prepare(`INSERT OR IGNORE INTO unit_task_progress
        (user_id, unit_id, unit_revision, task_type, task_id, completed_at, updated_at)
        VALUES (?, ?, ?, 'lesson-exercise', ?, ?, ?)`)
        .bind(locals.user.id, exercise.unit_id, unit.metadata.revision, exercise.id, now, now));
    }

    if (responseText.length > 0) {
      statements.push(db.prepare(`INSERT OR IGNORE INTO private_answer
        (id, user_id, unit_id, unit_revision, question_id, answer_markdown, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(`answer:${body.idempotencyKey}`, locals.user.id, exercise.unit_id, unit.metadata.revision, exercise.id, responseText, now));
    }
    statements.push(db.prepare(`INSERT OR IGNORE INTO content_acknowledgement
      (user_id, unit_id, revision, content_hash, acknowledged_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(locals.user.id, exercise.unit_id, unit.metadata.revision, entry.content_hash, now));
    for (const objectiveId of exercise.objective_ids) {
      const objectiveHash = entry.objective_hashes[objectiveId as keyof typeof entry.objective_hashes];
      statements.push(db.prepare(`INSERT INTO unit_evidence
        (user_id, unit_id, objective_id, objective_hash, encountered_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, unit_id, objective_id) DO UPDATE SET
          objective_hash = excluded.objective_hash,
          encountered_at = CASE WHEN unit_evidence.objective_hash <> excluded.objective_hash THEN excluded.encountered_at ELSE COALESCE(unit_evidence.encountered_at, excluded.encountered_at) END,
          recalled_at = CASE WHEN unit_evidence.objective_hash <> excluded.objective_hash THEN NULL ELSE unit_evidence.recalled_at END,
          recall_score = CASE WHEN unit_evidence.objective_hash <> excluded.objective_hash THEN 0 ELSE unit_evidence.recall_score END,
          applied_at = CASE WHEN unit_evidence.objective_hash <> excluded.objective_hash THEN NULL ELSE unit_evidence.applied_at END,
          application_score = CASE WHEN unit_evidence.objective_hash <> excluded.objective_hash THEN 0 ELSE unit_evidence.application_score END,
          retained_at = CASE WHEN unit_evidence.objective_hash <> excluded.objective_hash THEN NULL ELSE unit_evidence.retained_at END,
          retention_score = CASE WHEN unit_evidence.objective_hash <> excluded.objective_hash THEN 0 ELSE unit_evidence.retention_score END,
          revalidation_required = CASE WHEN unit_evidence.objective_hash <> excluded.objective_hash THEN 1 ELSE unit_evidence.revalidation_required END,
          updated_at = excluded.updated_at`)
        .bind(locals.user.id, exercise.unit_id, objectiveId, objectiveHash, now, now));
      if (evidence === 'recall') {
        statements.push(db.prepare(`UPDATE unit_evidence
          SET recalled_at = ?, recall_score = MAX(recall_score, ?), revalidation_required = 0, updated_at = ?
          WHERE user_id = ? AND unit_id = ? AND objective_id = ?`)
          .bind(now, LESSON_INTERACTION_SCORE, now, locals.user.id, exercise.unit_id, objectiveId));
      }
      if (evidence === 'application') {
        statements.push(db.prepare(`UPDATE unit_evidence
          SET applied_at = ?, application_score = MAX(application_score, ?), revalidation_required = 0, updated_at = ?
          WHERE user_id = ? AND unit_id = ? AND objective_id = ?`)
          .bind(now, LESSON_INTERACTION_SCORE, now, locals.user.id, exercise.unit_id, objectiveId));
      }
    }
    await db.batch(statements);
    return json({ persisted: true, evidence, completion: body.completed, scheduled: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_request';
    return json({ error: message }, { status: message === 'request_too_large' ? 413 : 400 });
  }
};
