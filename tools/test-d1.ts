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

  const lessonEvidence = run('d1', 'execute', 'DB', '--local', '--config', config, '--persist-to', persistence,
    '--command', `INSERT OR IGNORE INTO attempt
      (id,user_id,idempotency_key,unit_id,unit_revision,question_id,objective_ids_json,answer_markdown,critical_points_json,submitted_at)
      VALUES ('attempt:lesson-assisted','owner','lesson-assisted','fpp:test',1,'lesson:test/apply','["fpp:test.objective"]','assisted result','[]',20);
      INSERT OR IGNORE INTO attempt
      (id,user_id,idempotency_key,unit_id,unit_revision,question_id,objective_ids_json,answer_markdown,critical_points_json,submitted_at)
      VALUES ('attempt:lesson-assisted-duplicate','owner','lesson-assisted','fpp:test',1,'lesson:test/apply','["fpp:test.objective"]','duplicate','[]',21);
      INSERT OR IGNORE INTO unit_task_progress
      (user_id,unit_id,unit_revision,task_type,task_id,completed_at,updated_at)
      VALUES ('owner','fpp:test',1,'lesson-exercise','lesson:test/apply',20,20);
      INSERT OR IGNORE INTO private_answer
      (id,user_id,unit_id,unit_revision,question_id,answer_markdown,created_at)
      VALUES ('answer:lesson-explain','owner','fpp:test',1,'lesson:test/explain','private explanation',20);
      INSERT INTO unit_evidence
      (user_id,unit_id,objective_id,objective_hash,encountered_at,updated_at)
      VALUES ('owner','fpp:test','fpp:test.objective','hash-v1',20,20)
      ON CONFLICT(user_id,unit_id,objective_id) DO UPDATE SET
        objective_hash=excluded.objective_hash,
        encountered_at=COALESCE(unit_evidence.encountered_at,excluded.encountered_at),
        updated_at=excluded.updated_at;
      INSERT OR IGNORE INTO attempt
      (id,user_id,idempotency_key,unit_id,unit_revision,question_id,objective_ids_json,answer_markdown,critical_points_json,submitted_at)
      VALUES ('attempt:lesson-clean','owner','lesson-clean','fpp:test',1,'lesson:test/apply','["fpp:test.objective"]','clean result','[]',30);
      UPDATE unit_evidence SET applied_at=30,application_score=MAX(application_score,0.7),revalidation_required=0,updated_at=30
      WHERE user_id='owner' AND unit_id='fpp:test' AND objective_id='fpp:test.objective';
      SELECT
        (SELECT COUNT(*) FROM attempt WHERE user_id='owner' AND idempotency_key='lesson-assisted') AS lesson_attempt_count,
        (SELECT COUNT(*) FROM unit_task_progress WHERE user_id='owner' AND task_type='lesson-exercise') AS lesson_completion_count,
        (SELECT COUNT(*) FROM private_answer WHERE id='answer:lesson-explain') AS lesson_private_answer_count,
        (SELECT application_score FROM unit_evidence WHERE user_id='owner' AND unit_id='fpp:test' AND objective_id='fpp:test.objective') AS lesson_application_score,
        (SELECT retention_score FROM unit_evidence WHERE user_id='owner' AND unit_id='fpp:test' AND objective_id='fpp:test.objective') AS lesson_retention_score,
        (SELECT COUNT(*) FROM fsrs_card WHERE user_id='owner' AND card_id LIKE 'lesson:%') AS lesson_fsrs_count;`);
  for (const expected of [
    /lesson_attempt_count[\s\S]*?1/,
    /lesson_completion_count[\s\S]*?1/,
    /lesson_private_answer_count[\s\S]*?1/,
    /lesson_application_score[\s\S]*?0\.7/,
    /lesson_retention_score[\s\S]*?0/,
    /lesson_fsrs_count[\s\S]*?0/,
  ]) {
    if (!lessonEvidence.match(expected)) throw new Error(`Lesson evidence D1 invariant failed: ${expected}`);
  }

  const lessonRevalidation = run('d1', 'execute', 'DB', '--local', '--config', config, '--persist-to', persistence,
    '--command', `INSERT INTO unit_evidence
      (user_id,unit_id,objective_id,objective_hash,encountered_at,updated_at)
      VALUES ('owner','fpp:test','fpp:test.objective','hash-v2',40,40)
      ON CONFLICT(user_id,unit_id,objective_id) DO UPDATE SET
        objective_hash=excluded.objective_hash,
        encountered_at=excluded.encountered_at,
        recalled_at=NULL,
        recall_score=0,
        applied_at=NULL,
        application_score=0,
        retained_at=NULL,
        retention_score=0,
        revalidation_required=1,
        updated_at=excluded.updated_at;
      SELECT objective_hash,application_score,retention_score,revalidation_required
      FROM unit_evidence WHERE user_id='owner' AND unit_id='fpp:test' AND objective_id='fpp:test.objective';`);
  if (!lessonRevalidation.includes('hash-v2') ||
      !lessonRevalidation.match(/application_score[\s\S]*?0/) ||
      !lessonRevalidation.match(/retention_score[\s\S]*?0/) ||
      !lessonRevalidation.match(/revalidation_required[\s\S]*?1/)) {
    throw new Error('Lesson objective-hash revalidation did not reset affected evidence');
  }

  console.log('D1 migration, due index, idempotency, lesson evidence, and revalidation checks passed.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
