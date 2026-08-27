import type { APIRoute } from 'astro';
import { z } from 'zod';
import { paths } from '@/lib/content/catalog';
import { json, requestJson, unauthorized } from '@/lib/server/api';
import { database } from '@/lib/server/runtime';

const updateSchema = z.object({
  activePathId: z.string().optional(),
  timezone: z.string().min(1).max(80).optional(),
  requestedRetention: z.number().min(0.85).max(0.95).optional(),
});

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

async function readProfile(userId: string) {
  const row = await database().prepare(`SELECT active_path_id, timezone, requested_retention
    FROM learner_profile WHERE user_id = ?`).bind(userId).first<{
      active_path_id: string;
      timezone: string;
      requested_retention: number;
    }>();
  return row ?? {
    active_path_id: 'path:from-process-to-pod',
    timezone: 'UTC',
    requested_retention: 0.9,
  };
}

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return unauthorized();
  const profile = await readProfile(locals.user.id);
  return json({
    activePathId: profile.active_path_id,
    timezone: profile.timezone,
    requestedRetention: profile.requested_retention,
  });
};

export const PUT: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return unauthorized();
  try {
    const update = updateSchema.parse(await requestJson(request));
    const current = await readProfile(locals.user.id);
    const activePathId = update.activePathId ?? current.active_path_id;
    const timezone = update.timezone ?? current.timezone;
    const retention = update.requestedRetention ?? current.requested_retention;
    if (!paths.some((path) => path.id === activePathId)) {
      return json({ error: 'unknown_path' }, { status: 400 });
    }
    if (!validTimezone(timezone)) {
      return json({ error: 'invalid_timezone' }, { status: 400 });
    }
    const now = Date.now();
    await database().prepare(`INSERT INTO learner_profile
      (user_id, active_path_id, timezone, requested_retention, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        active_path_id = excluded.active_path_id,
        timezone = excluded.timezone,
        requested_retention = excluded.requested_retention,
        updated_at = excluded.updated_at`).bind(
          locals.user.id,
          activePathId,
          timezone,
          retention,
          now,
          now,
        ).run();
    return json({ saved: true, activePathId, timezone, requestedRetention: retention });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'invalid_request' }, { status: 400 });
  }
};
