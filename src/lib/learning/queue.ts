export type ReviewCardType = 'short' | 'prompt' | 'scenario';

export interface QueueItem {
  cardType: ReviewCardType;
  dueAt: number;
}

export function mixedReviewQueue<T extends QueueItem>(items: T[], limit = 20): T[] {
  const ordered = [...items].sort((a, b) => a.dueAt - b.dueAt);
  const groups = {
    short: ordered.filter((item) => item.cardType === 'short'),
    prompt: ordered.filter((item) => item.cardType === 'prompt'),
    scenario: ordered.filter((item) => item.cardType === 'scenario'),
  };
  const targets = {
    short: Math.round(limit * 0.6),
    prompt: Math.round(limit * 0.2),
    scenario: limit - Math.round(limit * 0.6) - Math.round(limit * 0.2),
  };
  const selected: T[] = [];
  for (const type of ['short', 'prompt', 'scenario'] as const) {
    selected.push(...groups[type].splice(0, targets[type]));
  }
  const remaining = [...groups.short, ...groups.prompt, ...groups.scenario]
    .sort((a, b) => a.dueAt - b.dueAt);
  selected.push(...remaining.slice(0, Math.max(0, limit - selected.length)));
  return selected.slice(0, limit);
}
