import type { APIRoute } from 'astro';
import { z } from 'zod';
import { unitsById } from '@/lib/content/catalog';
import { json, requestJson, unauthorized } from '@/lib/server/api';
import { database } from '@/lib/server/runtime';

const updateSchema = z.object({
  unitId: z.string(),
  markdown: z.string().max(100_000),
});

const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return unauthorized();
  const unitId = url.searchParams.get('unitId');
  const query = url.searchParams.get('q')?.trim();
  const db = database();
  if (query) {
    const rows = await db.prepare(`SELECT unit_id, markdown, updated_at FROM note
      WHERE user_id = ? AND markdown LIKE ? ESCAPE '\\'
      ORDER BY updated_at DESC LIMIT 50`).bind(
        locals.user.id,
        `%${escapeLike(query)}%`,
      ).all<{ unit_id: string; markdown: string; updated_at: number }>();
    return json({ notes: rows.results.map((row) => ({
      unitId: row.unit_id,
      markdown: row.markdown,
      updatedAt: row.updated_at,
    })) });
  }
  if (!unitId || !unitsById.has(unitId)) return json({ error: 'unknown_unit' }, { status: 400 });
  const row = await db.prepare(`SELECT markdown, created_at, updated_at FROM note
    WHERE user_id = ? AND unit_id = ?`).bind(locals.user.id, unitId).first<{
      markdown: string;
      created_at: number;
      updated_at: number;
    }>();
  return json({
    unitId,
    markdown: row?.markdown ?? '',
    createdAt: row?.created_at ?? null,
    updatedAt: row?.updated_at ?? null,
  });
};

export const PUT: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return unauthorized();
  try {
    const body = updateSchema.parse(await requestJson(request, 120_000));
    if (!unitsById.has(body.unitId)) return json({ error: 'unknown_unit' }, { status: 400 });
    const now = Date.now();
    await database().prepare(`INSERT INTO note (user_id, unit_id, markdown, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, unit_id) DO UPDATE SET
        markdown = excluded.markdown,
        updated_at = excluded.updated_at`).bind(
          locals.user.id,
          body.unitId,
          body.markdown,
          now,
          now,
        ).run();
    return json({ saved: true, updatedAt: now });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_request';
    return json({ error: message }, { status: message === 'request_too_large' ? 413 : 400 });
  }
};
