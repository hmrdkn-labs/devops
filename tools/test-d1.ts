import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const temporary = await mkdtemp(path.join(os.tmpdir(), 'hmrdkn-devops-d1-'));
const config = path.join(temporary, 'wrangler.test.json');
const persistence = path.join(temporary, 'state');
const wrangler = path.join(root, 'node_modules', '.bin', 'wrangler');

const run = (...arguments_: string[]) => execFileSync(wrangler, arguments_, {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, NO_COLOR: '1' },
});

try {
  await writeFile(config, JSON.stringify({
    name: 'hmrdkn-devops-d1-test',
    compatibility_date: '2026-08-27',
    d1_databases: [{
      binding: 'DB',
      database_name: 'hmrdkn-devops-d1-test',
      database_id: '00000000-0000-0000-0000-000000000000',
      migrations_dir: path.join(root, 'drizzle'),
    }],
  }));

  run('d1', 'migrations', 'apply', 'DB', '--local', '--config', config, '--persist-to', persistence);
  const indexes = run('d1', 'execute', 'DB', '--local', '--config', config, '--persist-to', persistence,
    '--command', "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_fsrs_due','idx_review_user_idempotency','idx_attempt_user_idempotency') ORDER BY name;");
  for (const expected of ['idx_fsrs_due', 'idx_review_user_idempotency', 'idx_attempt_user_idempotency']) {
    if (!indexes.includes(expected)) throw new Error(`Missing D1 index ${expected}`);
  }

  const queryPlan = run('d1', 'execute', 'DB', '--local', '--config', config, '--persist-to', persistence,
    '--command', "EXPLAIN QUERY PLAN SELECT card_id FROM fsrs_card WHERE user_id='owner' AND due_at <= 1 ORDER BY due_at LIMIT 20;");
  if (!queryPlan.includes('idx_fsrs_due')) throw new Error('Due-card query does not use idx_fsrs_due');

  const idempotency = run('d1', 'execute', 'DB', '--local', '--config', config, '--persist-to', persistence,
    '--command', `INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES ('owner','Owner','owner@example.test',1,1,1);
      INSERT OR IGNORE INTO review_event (id,user_id,idempotency_key,card_id,unit_id,unit_revision,objective_ids_json,card_type,rating,reviewed_at,scheduled_days,elapsed_days,state_before,state_after)
      VALUES ('review:1','owner','same-request','card:1','fpp:test',1,'[]','short',3,1,1,1,0,1);
      INSERT OR IGNORE INTO review_event (id,user_id,idempotency_key,card_id,unit_id,unit_revision,objective_ids_json,card_type,rating,reviewed_at,scheduled_days,elapsed_days,state_before,state_after)
      VALUES ('review:2','owner','same-request','card:1','fpp:test',1,'[]','short',3,2,1,1,1,2);
      SELECT COUNT(*) AS event_count FROM review_event WHERE user_id='owner' AND idempotency_key='same-request';`);
  if (!idempotency.match(/event_count[\s\S]*?1/)) throw new Error('Review idempotency constraint did not suppress a duplicate');

  console.log('D1 migration, due index, and idempotency checks passed.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
