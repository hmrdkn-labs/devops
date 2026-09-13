export type LessonEvidence = 'encounter' | 'recall' | 'application';

export const LESSON_INTERACTION_SCORE = 0.7;

export function classifyLessonEvidence(input: {
  assisted: boolean;
  correct: boolean;
  intendedEvidence: LessonEvidence;
}): LessonEvidence {
  if (input.assisted || !input.correct) return 'encounter';
  return input.intendedEvidence;
}
