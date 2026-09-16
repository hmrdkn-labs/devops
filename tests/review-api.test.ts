import { describe, expect, it, vi } from 'vitest';
import { unitsById } from '../src/lib/content/catalog';

interface DueRow {
  card_id: string;
  unit_id: string;
  unit_revision: number;
  card_type: 'short' | 'prompt' | 'scenario';
  due_at: number;
}

class FakeStatement {
  constructor(private readonly rows: DueRow[]) {}
  bind() { return this; }
  async all<T>() { return { results: this.rows as T[] }; }
}

class FakeDatabase {
  constructor(private readonly rows: DueRow[]) {}
  prepare() { return new FakeStatement(this.rows); }
}

const runtime = vi.hoisted(() => ({ rows: [] as DueRow[] }));
vi.mock('@/lib/server/runtime', () => ({ database: () => new FakeDatabase(runtime.rows) }));

import { GET } from '../src/pages/api/review';

describe('review queue API', () => {
  it('serves the current content revision for a still-valid card scheduled on an older revision', async () => {
    const unit = unitsById.get('fpp:container-lifecycle');
    expect(unit).toBeDefined();
    runtime.rows = [{
      card_id: 'fpp:container-lifecycle/c-logs',
      unit_id: 'fpp:container-lifecycle',
      unit_revision: 1,
      card_type: 'scenario',
      due_at: 1,
    }];

    const response = await GET({
      url: new URL('http://localhost/api/review?path=kcna&limit=20'),
      locals: { user: { id: 'owner' } },
    } as never);
    const body = await response.json() as {
      queue: Array<{ unitRevision: number; type: string; cardId: string }>;
      dueCount: number;
    };

    expect(response.status).toBe(200);
    expect(body.dueCount).toBe(1);
    expect(body.queue).toHaveLength(1);
    expect(body.queue[0]).toMatchObject({
      cardId: 'fpp:container-lifecycle/c-logs',
      unitRevision: unit!.metadata.revision,
      type: 'short',
    });
  });
});
