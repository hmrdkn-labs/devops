import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  classifyLessonEvidence,
  LESSON_INTERACTION_SCORE,
} from '../src/lib/learning/lesson-evidence';

interface BoundStatement {
  sql: string;
  values: unknown[];
  bind(...values: unknown[]): BoundStatement;
  first<T>(): Promise<T | null>;
}

class FakeStatement implements BoundStatement {
  values: unknown[] = [];

  constructor(public sql: string, private readonly prior: () => unknown) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T>() {
    return (this.sql.includes('FROM attempt') ? this.prior() : null) as T | null;
  }
}

class FakeDatabase {
  prepared: FakeStatement[] = [];
  batches: FakeStatement[][] = [];
  priorAttempt: unknown = null;

  prepare(sql: string) {
    const statement = new FakeStatement(sql, () => this.priorAttempt);
    this.prepared.push(statement);
    return statement;
  }

  async batch(statements: FakeStatement[]) {
    this.batches.push(statements);
    return [];
  }
}

const runtime = vi.hoisted(() => ({ database: null as FakeDatabase | null }));
vi.mock('@/lib/server/runtime', () => ({ database: () => runtime.database }));

import { POST } from '../src/pages/api/lesson-event';

const baseBody = {
  lessonId: 'lesson:kcna-kubernetes-resources',
  lessonRevision: 4,
  exerciseId: 'lesson:kcna-kubernetes-resources/predict-replacement',
  assisted: false,
  correct: true,
  completed: true,
  idempotencyKey: '00000000-0000-4000-8000-000000000001',
};

async function post(body: Record<string, unknown>, authenticated = true) {
  const request = new Request('http://localhost/api/lesson-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const response = await POST({
    request,
    locals: authenticated ? { user: { id: 'owner' } } : { user: null },
  } as never);
  return { response, json: await response.json() as Record<string, unknown> };
}

function batchSql() {
  return runtime.database!.batches.flat().map((statement) => statement.sql).join('\n');
}

describe('lesson evidence classification', () => {
  it('keeps assisted and incorrect interactions at encounter only', () => {
    expect(classifyLessonEvidence({ assisted: true, correct: true, intendedEvidence: 'recall' })).toBe('encounter');
    expect(classifyLessonEvidence({ assisted: false, correct: false, intendedEvidence: 'application' })).toBe('encounter');
    expect(classifyLessonEvidence({ assisted: false, correct: true, intendedEvidence: 'encounter' })).toBe('encounter');
  });

  it('allows clean recall/application without granting mastery or retention', () => {
    expect(classifyLessonEvidence({ assisted: false, correct: true, intendedEvidence: 'recall' })).toBe('recall');
    expect(classifyLessonEvidence({ assisted: false, correct: true, intendedEvidence: 'application' })).toBe('application');
    expect(LESSON_INTERACTION_SCORE).toBe(0.7);
    expect(LESSON_INTERACTION_SCORE).toBeLessThan(1);
  });
});

describe('lesson event API', () => {
  beforeEach(() => {
    runtime.database = new FakeDatabase();
  });

  it('does not persist guest activity', async () => {
    const { response } = await post(baseBody, false);
    expect(response.status).toBe(401);
    expect(runtime.database!.prepared).toHaveLength(0);
    expect(runtime.database!.batches).toHaveLength(0);
  });

  it('records Learn-first as an encounter without completion, mastery, retention, or FSRS', async () => {
    const { response, json } = await post({ ...baseBody, assisted: true, correct: false, completed: false });
    expect(response.status).toBe(200);
    expect(json).toMatchObject({ evidence: 'encounter', completion: false, scheduled: false });
    const sql = batchSql();
    expect(sql).toContain('INSERT OR IGNORE INTO attempt');
    expect(sql).toContain('INSERT INTO unit_evidence');
    expect(sql).not.toContain('INSERT OR IGNORE INTO unit_task_progress');
    expect(sql).not.toContain('SET recalled_at');
    expect(sql).not.toContain('SET applied_at');
    expect(sql).not.toContain('fsrs_card');
    expect(sql).not.toContain('retained_at = ?');
  });

  it('stores assisted completion separately while withholding clean evidence', async () => {
    const { json } = await post({ ...baseBody, assisted: true });
    expect(json).toMatchObject({ evidence: 'encounter', completion: true, scheduled: false });
    const sql = batchSql();
    expect(sql).toContain('INSERT OR IGNORE INTO unit_task_progress');
    expect(sql).not.toContain('SET applied_at');
    expect(sql).not.toContain('SET recalled_at');
  });

  it('records clean application and recall at 0.7 without scheduling or retention', async () => {
    const application = await post(baseBody);
    expect(application.json).toMatchObject({ evidence: 'application', completion: true, scheduled: false });
    expect(batchSql()).toContain('SET applied_at');
    expect(runtime.database!.batches.flat().some((statement) => statement.values.includes(LESSON_INTERACTION_SCORE))).toBe(true);
    expect(batchSql()).not.toContain('fsrs_card');

    runtime.database = new FakeDatabase();
    const recall = await post({
      ...baseBody,
      exerciseId: 'lesson:kcna-kubernetes-resources/choose-pod-owner',
      idempotencyKey: '00000000-0000-4000-8000-000000000002',
    });
    expect(recall.json).toMatchObject({ evidence: 'recall', completion: true, scheduled: false });
    expect(batchSql()).toContain('SET recalled_at');
    expect(batchSql()).not.toContain('SET retained_at');
  });

  it('stores free-response text privately and preserves objective-hash revalidation SQL', async () => {
    await post({
      ...baseBody,
      exerciseId: 'lesson:kcna-kubernetes-resources/explain-replacement',
      correct: false,
      completed: false,
      responseMarkdown: 'Desired state remains three while observed state falls to two.',
      idempotencyKey: '00000000-0000-4000-8000-000000000003',
    });
    const sql = batchSql();
    expect(sql).toContain('INSERT OR IGNORE INTO private_answer');
    expect(sql).toContain('unit_evidence.objective_hash <> excluded.objective_hash');
    expect(sql).toContain('revalidation_required');
  });

  it('deduplicates the same request key but permits a later clean attempt', async () => {
    runtime.database!.priorAttempt = { id: 'attempt:existing' };
    const duplicate = await post(baseBody);
    expect(duplicate.json).toMatchObject({ persisted: true, duplicate: true });
    expect(runtime.database!.batches).toHaveLength(0);

    runtime.database = new FakeDatabase();
    const laterClean = await post({ ...baseBody, idempotencyKey: '00000000-0000-4000-8000-000000000004' });
    expect(laterClean.json).toMatchObject({ evidence: 'application' });
    expect(batchSql()).toContain('SET applied_at');
  });
});
