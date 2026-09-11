import type { APIRoute } from 'astro';
import { z } from 'zod';
import manifest from '@/generated/content-manifest.json';
import { unitsById } from '@/lib/content/catalog';
import { json, requestJson, unauthorized, validIdempotencyKey } from '@/lib/server/api';
import { database } from '@/lib/server/runtime';

const bodySchema = z.object({
  unitId: z.string(),
  unitRevision: z.number().int().positive(),
  questionId: z.string(),
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
      db.prepare(`INSERT OR IGNORE INTO learner_profile
        (user_id, active_path_id, timezone, requested_retention, created_at, updated_at)
        VALUES (?, 'path:kcna', 'UTC', 0.9, ?, ?)`).bind(locals.user.id, now, now),
      db.prepare(`INSERT OR IGNORE INTO content_acknowledgement
        (user_id, unit_id, revision, content_hash, acknowledged_at)
        VALUES (?, ?, ?, ?, ?)`).bind(
          locals.user.id,
          body.unitId,
          body.unitRevision,
          entry.content_hash,
          now,
        ),
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

    await db.batch(statements);
    return json({ persisted: true, evidence: 'encountered' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_request';
    return json({ error: message }, { status: message === 'request_too_large' ? 413 : 400 });
  }
};
