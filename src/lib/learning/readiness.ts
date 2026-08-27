export interface EvidenceProjection {
  encounteredAt: number | null;
  recalledAt: number | null;
  recallScore: number;
  appliedAt: number | null;
  applicationScore: number;
  retainedAt: number | null;
  retentionScore: number;
  revalidationRequired?: boolean;
}

export type MasteryState = 'Not started' | 'Encountered' | 'Recalled' | 'Applied' | 'Retained';

const DAY = 86_400_000;

function currentEvidence(score: number, at: number | null, halfLifeDays: number, now: number) {
  if (!at || score <= 0) return 0;
  const ageDays = Math.max(0, (now - at) / DAY);
  return Math.max(0, Math.min(1, score * Math.pow(0.5, ageDays / halfLifeDays)));
}

export function readinessV1(evidence: EvidenceProjection, now = Date.now()) {
  const encountered = evidence.encounteredAt ? 1 : 0;
  const recall = currentEvidence(evidence.recallScore, evidence.recalledAt, 60, now);
  const application = currentEvidence(evidence.applicationScore, evidence.appliedAt, 120, now);
  const retention = currentEvidence(evidence.retentionScore, evidence.retainedAt, 365, now);
  const score = 0.15 * encountered + 0.3 * recall + 0.3 * application + 0.25 * retention;
  return Math.max(0, Math.min(1, evidence.revalidationRequired ? score * 0.7 : score));
}

export function masteryState(evidence: EvidenceProjection, now = Date.now()): MasteryState {
  const score = readinessV1(evidence, now);
  if (evidence.retainedAt && currentEvidence(evidence.retentionScore, evidence.retainedAt, 365, now) >= 0.6) return 'Retained';
  if (evidence.appliedAt && currentEvidence(evidence.applicationScore, evidence.appliedAt, 120, now) >= 0.6) return 'Applied';
  if (evidence.recalledAt && currentEvidence(evidence.recallScore, evidence.recalledAt, 60, now) >= 0.6) return 'Recalled';
  if (evidence.encounteredAt || score > 0) return 'Encountered';
  return 'Not started';
}

export function weightedPathReadiness(units: Array<{ score: number; weight: 1 | 2 }>) {
  const totalWeight = units.reduce((sum, unit) => sum + unit.weight, 0);
  if (totalWeight === 0) return 0;
  return units.reduce((sum, unit) => sum + unit.score * unit.weight, 0) / totalWeight;
}
