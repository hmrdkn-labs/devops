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
    '--command', "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_fsrs_due','idx_review_user_idempotency','idx_attempt_user_idempotency','idx_unit_task_progress_user_unit') ORDER BY name;");
  for (const expected of ['idx_fsrs_due', 'idx_review_user_idempotency', 'idx_attempt_user_idempotency', 'idx_unit_task_progress_user_unit']) {
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

  const revisionCarry = run('d1', 'execute', 'DB', '--local', '--config', config, '--persist-to', persistence,
    '--command', `INSERT INTO unit_task_progress (user_id,unit_id,unit_revision,task_type,task_id,completed_at,updated_at)
      VALUES ('owner','fpp:test',1,'practice','practice:one',10,10);
      INSERT INTO unit_task_progress (user_id,unit_id,unit_revision,task_type,task_id,completed_at,updated_at)
      VALUES ('owner','fpp:test',2,'practice','practice:one',20,20)
      ON CONFLICT(user_id,unit_id,task_type,task_id) DO UPDATE SET
        unit_revision=excluded.unit_revision,
        completed_at=unit_task_progress.completed_at,
        updated_at=excluded.updated_at;
      SELECT COUNT(*) AS task_count, MAX(unit_revision) AS current_revision, MIN(completed_at) AS original_completion
      FROM unit_task_progress WHERE user_id='owner' AND unit_id='fpp:test' AND task_id='practice:one';`);
  if (!revisionCarry.match(/task_count[\s\S]*?1/) || !revisionCarry.match(/current_revision[\s\S]*?2/) || !revisionCarry.match(/original_completion[\s\S]*?10/)) {
    throw new Error('Stable task completion did not carry across content revisions');
  }

  console.log('D1 migration, due index, and idempotency checks passed.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
