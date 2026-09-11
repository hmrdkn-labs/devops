import { describe, expect, it } from 'vitest';
import { unitCompletion } from '../src/lib/learning/completion';

const base = {
  questionIds: ['q1', 'q2'],
  answeredQuestions: [],
  lessonCompletedAt: null,
  practiceIds: ['p1'],
  completedPractices: [],
};

describe('unit completion', () => {
  it('keeps completion separate from understanding evidence', () => {
    expect(unitCompletion(base)).toMatchObject({ state: 'Not started', percent: 0 });
    expect(unitCompletion({
      ...base,
      answeredQuestions: [{ id: 'q1', completedAt: 10 }],
    })).toMatchObject({ state: 'In progress', questionsCompleted: 1, percent: 0.25 });
  });

  it('marks the core learned before optional application work is completed', () => {
    expect(unitCompletion({
      ...base,
      answeredQuestions: [{ id: 'q1', completedAt: 10 }, { id: 'q2', completedAt: 20 }],
      lessonCompletedAt: 30,
    })).toMatchObject({ state: 'Learned', learnedAt: 30, completedAt: null, percent: 0.75 });
  });

  it('requires all guided practices for completed status', () => {
    expect(unitCompletion({
      ...base,
      answeredQuestions: [{ id: 'q1', completedAt: 10 }, { id: 'q2', completedAt: 20 }],
      lessonCompletedAt: 30,
      completedPractices: [{ id: 'p1', completedAt: 40 }],
    })).toMatchObject({ state: 'Completed', completedAt: 40, percent: 1 });
  });

  it('ignores stale or unknown task ids', () => {
    expect(unitCompletion({
      ...base,
      answeredQuestions: [{ id: 'old-question', completedAt: 10 }],
      completedPractices: [{ id: 'old-practice', completedAt: 10 }],
    })).toMatchObject({ state: 'Not started', questionsCompleted: 0, practicesCompleted: 0 });
  });
});
