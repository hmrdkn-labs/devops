import type { APIRoute } from 'astro';
import { strToU8, zipSync } from 'fflate';
import manifest from '@/generated/content-manifest.json';
import { unauthorized } from '@/lib/server/api';
import { database } from '@/lib/server/runtime';

type Row = Record<string, unknown>;

const csvCell = (value: unknown) => {
  const text = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  return `"${text.replaceAll('"', '""')}"`;
};

function toCsv(rows: Row[]) {
  if (!rows.length) return '';
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [
    headers.map(csvCell).join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
    '',
  ].join('\n');
}

async function learnerData(userId: string) {
  const db = database();
  const results = await db.batch([
    db.prepare('SELECT id, name, email, image, createdAt, updatedAt FROM user WHERE id = ?').bind(userId),
    db.prepare('SELECT * FROM learner_profile WHERE user_id = ?').bind(userId),
    db.prepare('SELECT * FROM attempt WHERE user_id = ? ORDER BY submitted_at').bind(userId),
    db.prepare('SELECT * FROM review_event WHERE user_id = ? ORDER BY reviewed_at').bind(userId),
    db.prepare('SELECT * FROM fsrs_card WHERE user_id = ? ORDER BY card_id').bind(userId),
    db.prepare('SELECT * FROM unit_evidence WHERE user_id = ? ORDER BY unit_id, objective_id').bind(userId),
    db.prepare('SELECT * FROM private_answer WHERE user_id = ? ORDER BY created_at').bind(userId),
    db.prepare('SELECT * FROM note WHERE user_id = ? ORDER BY unit_id').bind(userId),
    db.prepare('SELECT * FROM content_acknowledgement WHERE user_id = ? ORDER BY unit_id, revision').bind(userId),
  ]);
  const rows = results.map((result) => result.results as Row[]);
  return {
    user: rows[0][0] ?? null,
    profile: rows[1][0] ?? null,
    attempts: rows[2],
    reviewEvents: rows[3],
    fsrsCards: rows[4],
    unitEvidence: rows[5],
    privateAnswers: rows[6],
    notes: rows[7],
    contentAcknowledgements: rows[8],
  };
}

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return unauthorized();
  const data = await learnerData(locals.user.id);
  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    content: {
      version: manifest.content_version,
      manifestSha256: manifest.manifest_sha256,
    },
    data,
  };
  if (url.searchParams.get('format') === 'json') {
    return new Response(`${JSON.stringify(payload, null, 2)}\n`, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="devops-learner-export-v1.json"',
        'Cache-Control': 'no-store',
      },
    });
  }

  const summary = [
    '# DevOps by hmrdkn-labs — learner export',
    '',
    `Exported: ${payload.exportedAt}`,
    `Content version: ${manifest.content_version}`,
    `Attempts: ${data.attempts.length}`,
    `Review events: ${data.reviewEvents.length}`,
    `Scheduled cards: ${data.fsrsCards.length}`,
    `Notes: ${data.notes.length}`,
    '',
    'This summary is portable Markdown. The JSON file is the lossless source for a future validated restore.',
    '',
  ].join('\n');
  const files: Record<string, Uint8Array> = {
    'learner-export-v1.json': strToU8(`${JSON.stringify(payload, null, 2)}\n`),
    'summary.md': strToU8(summary),
    'profile.csv': strToU8(toCsv(data.profile ? [data.profile] : [])),
    'attempts.csv': strToU8(toCsv(data.attempts)),
    'review-events.csv': strToU8(toCsv(data.reviewEvents)),
    'fsrs-cards.csv': strToU8(toCsv(data.fsrsCards)),
    'unit-evidence.csv': strToU8(toCsv(data.unitEvidence)),
    'private-answers.csv': strToU8(toCsv(data.privateAnswers)),
    'notes.csv': strToU8(toCsv(data.notes)),
    'content-acknowledgements.csv': strToU8(toCsv(data.contentAcknowledgements)),
  };
  const archive = zipSync(files, { level: 6 });
  const body = new Uint8Array(archive.byteLength);
  body.set(archive);
  return new Response(body, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="devops-learner-export-v1.zip"',
      'Cache-Control': 'no-store',
    },
  });
};
