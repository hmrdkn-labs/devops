import {
  Rating,
  createEmptyCard,
  fsrs,
  type Card,
  type CardInput,
  type Grade,
} from 'ts-fsrs';

export const ratings = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
} as const;

export function normalizeRating(value: unknown): Grade {
  const numeric = typeof value === 'string'
    ? ratings[value.toLowerCase() as keyof typeof ratings]
    : Number(value);
  if (![Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].includes(numeric as Grade)) {
    throw new Error('Rating must be Again, Hard, Good, or Easy.');
  }
  return numeric as Grade;
}

export function emptyCard(now = new Date()) {
  return createEmptyCard(now);
}

export function applyReview(
  persisted: string | null,
  grade: Grade,
  requestedRetention: number,
  now = new Date(),
) {
  const card = persisted ? JSON.parse(persisted) as CardInput : createEmptyCard(now);
  const beforeState = typeof card.state === 'number' ? card.state : 0;
  const lastReview = card.last_review ? new Date(card.last_review).getTime() : null;
  const elapsedDays = lastReview === null ? 0 : Math.max(0, (now.getTime() - lastReview) / 86_400_000);
  const result = fsrs({
    request_retention: Math.min(0.95, Math.max(0.85, requestedRetention)),
    enable_fuzz: true,
  }).next(card, now, grade);
  return {
    card: result.card,
    cardJson: JSON.stringify(result.card),
    log: result.log,
    elapsedDays,
    beforeState,
  };
}

export function ratingEvidence(grade: Grade) {
  return ({ 1: 0, 2: 0.5, 3: 0.8, 4: 1 } as Record<number, number>)[grade] ?? 0;
}

export function reviveCard(value: string): Card {
  const parsed = JSON.parse(value) as CardInput;
  return {
    ...parsed,
    due: new Date(parsed.due),
    last_review: parsed.last_review ? new Date(parsed.last_review) : undefined,
  } as Card;
}
