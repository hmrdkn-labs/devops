import type { APIRoute } from 'astro';
import { unitsById } from '@/lib/content/catalog';
import { json, unauthorized } from '@/lib/server/api';
import { database } from '@/lib/server/runtime';

interface PrivateAnswerRow {
  unit_revision: number;
  question_id: string;
  answer_markdown: string;
  created_at: number;
}

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return unauthorized();
  const unitId = url.searchParams.get('unitId');
  if (!unitId || !unitsById.has(unitId)) return json({ error: 'unknown_unit' }, { status: 400 });

  const rows = await database().prepare(`SELECT unit_revision, question_id, answer_markdown, created_at
    FROM private_answer
    WHERE user_id = ? AND unit_id = ?
    ORDER BY created_at DESC
    LIMIT 50`).bind(locals.user.id, unitId).all<PrivateAnswerRow>();

  return json({
    unitId,
    answers: rows.results.map((row) => ({
      unitRevision: row.unit_revision,
      questionId: row.question_id,
      answerMarkdown: row.answer_markdown,
      createdAt: row.created_at,
    })),
  });
};
