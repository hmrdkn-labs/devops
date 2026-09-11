import type { APIRoute } from 'astro';
import { z } from 'zod';
import { unitsById } from '@/lib/content/catalog';
import { json, requestJson, unauthorized } from '@/lib/server/api';
import { database } from '@/lib/server/runtime';

const bodySchema = z.object({
  unitId: z.string(),
  unitRevision: z.number().int().positive(),
  taskType: z.enum(['lesson', 'practice']),
  taskId: z.string().min(1),
  completed: z.boolean(),
});

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return unauthorized();
  try {
    const body = bodySchema.parse(await requestJson(request));
    const unit = unitsById.get(body.unitId);
    if (!unit) return json({ error: 'unknown_content' }, { status: 404 });
    if (unit.metadata.revision !== body.unitRevision) {
      return json({ error: 'content_revision_changed', currentRevision: unit.metadata.revision }, { status: 409 });
    }
    if (body.taskType === 'lesson' && body.taskId !== 'lesson') {
      return json({ error: 'unknown_task' }, { status: 404 });
    }
    if (body.taskType === 'practice' && !unit.practices.some((practice) => practice.id === body.taskId)) {
      return json({ error: 'unknown_task' }, { status: 404 });
    }

    const db = database();
    const now = Date.now();
    if (body.completed) {
      await db.prepare(`INSERT INTO unit_task_progress
        (user_id, unit_id, unit_revision, task_type, task_id, completed_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, unit_id, task_type, task_id) DO UPDATE SET
          unit_revision = excluded.unit_revision,
          completed_at = unit_task_progress.completed_at,
          updated_at = excluded.updated_at`).bind(
            locals.user.id,
            body.unitId,
            body.unitRevision,
            body.taskType,
            body.taskId,
            now,
            now,
          ).run();
    } else {
      await db.prepare(`DELETE FROM unit_task_progress
        WHERE user_id = ? AND unit_id = ? AND task_type = ? AND task_id = ?`).bind(
          locals.user.id,
          body.unitId,
          body.taskType,
          body.taskId,
        ).run();
    }
    return json({ persisted: true, completed: body.completed });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_request';
    return json({ error: message }, { status: message === 'request_too_large' ? 413 : 400 });
  }
};
