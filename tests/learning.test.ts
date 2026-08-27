import { describe, expect, it } from 'vitest';
import { mixedReviewQueue } from '../src/lib/learning/queue';
import { masteryState, readinessV1, weightedPathReadiness } from '../src/lib/learning/readiness';
import { applyReview, normalizeRating, ratingEvidence } from '../src/lib/server/scheduler';

describe('readiness-v1', () => {
  const now = Date.parse('2026-08-27T00:00:00Z');
  const complete = {
    encounteredAt: now,
    recalledAt: now,
    recallScore: 1,
    appliedAt: now,
    applicationScore: 1,
    retainedAt: now,
    retentionScore: 1,
  };

  it('implements the documented 15/30/30/25 weights', () => {
    expect(readinessV1(complete, now)).toBe(1);
    expect(masteryState(complete, now)).toBe('Retained');
  });

  it('allows readiness to regress as evidence becomes stale', () => {
    const fresh = readinessV1(complete, now);
    const stale = readinessV1(complete, now + 400 * 86_400_000);
    expect(stale).toBeLessThan(fresh);
  });

  it('weights critical path units twice', () => {
    expect(weightedPathReadiness([{ score: 1, weight: 2 }, { score: 0, weight: 1 }])).toBeCloseTo(2 / 3);
  });

  it('penalizes an objective awaiting revalidation', () => {
    expect(readinessV1({ ...complete, revalidationRequired: true }, now)).toBeCloseTo(0.7);
  });
});

describe('review scheduling', () => {
  it('builds a 60/20/20 queue while keeping oldest cards first within each type', () => {
    const items = [
      ...Array.from({ length: 20 }, (_, dueAt) => ({ id: `s${dueAt}`, cardType: 'short' as const, dueAt })),
      ...Array.from({ length: 20 }, (_, dueAt) => ({ id: `p${dueAt}`, cardType: 'prompt' as const, dueAt })),
      ...Array.from({ length: 20 }, (_, dueAt) => ({ id: `x${dueAt}`, cardType: 'scenario' as const, dueAt })),
    ];
    const queue = mixedReviewQueue(items, 20);
    expect(queue.filter((item) => item.cardType === 'short')).toHaveLength(12);
    expect(queue.filter((item) => item.cardType === 'prompt')).toHaveLength(4);
    expect(queue.filter((item) => item.cardType === 'scenario')).toHaveLength(4);
    expect(queue.filter((item) => item.cardType === 'short').map((item) => item.dueAt)).toEqual([...Array(12).keys()]);
  });

  it('matches the initial FSRS golden cases at 90% retention', () => {
    const now = new Date('2026-08-27T00:00:00Z');
    expect(applyReview(null, normalizeRating('again'), 0.9, now).card.due.toISOString()).toBe('2026-08-27T00:01:00.000Z');
    expect(applyReview(null, normalizeRating('hard'), 0.9, now).card.due.toISOString()).toBe('2026-08-27T00:06:00.000Z');
    expect(applyReview(null, normalizeRating('good'), 0.9, now).card.due.toISOString()).toBe('2026-08-27T00:10:00.000Z');
    expect(applyReview(null, normalizeRating('easy'), 0.9, now).card.due.toISOString()).toBe('2026-09-06T00:00:00.000Z');
    expect(ratingEvidence(normalizeRating('good'))).toBe(0.8);
  });

  it('rejects unknown ratings and clamps requested retention', () => {
    expect(() => normalizeRating('perfect')).toThrow();
    const low = applyReview(null, normalizeRating('easy'), 0.01, new Date('2026-08-27T00:00:00Z'));
    const minimum = applyReview(null, normalizeRating('easy'), 0.85, new Date('2026-08-27T00:00:00Z'));
    expect(low.card.due).toEqual(minimum.card.due);
  });
});
