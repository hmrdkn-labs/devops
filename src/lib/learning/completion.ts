export type CompletionState = 'Not started' | 'In progress' | 'Learned' | 'Completed';

export interface CompletionMark {
  id: string;
  completedAt: number;
}

export interface UnitCompletionInput {
  questionIds: string[];
  answeredQuestions: CompletionMark[];
  lessonCompletedAt: number | null;
  practiceIds: string[];
  completedPractices: CompletionMark[];
}

export interface UnitCompletion {
  state: CompletionState;
  percent: number;
  answeredQuestionIds: string[];
  questionsCompleted: number;
  questionsTotal: number;
  lessonCompleted: boolean;
  completedPracticeIds: string[];
  practicesCompleted: number;
  practicesTotal: number;
  learnedAt: number | null;
  completedAt: number | null;
}

function matchingMarks(expectedIds: string[], marks: CompletionMark[]) {
  const expected = new Set(expectedIds);
  const latest = new Map<string, number>();
  for (const mark of marks) {
    if (!expected.has(mark.id)) continue;
    latest.set(mark.id, Math.max(latest.get(mark.id) ?? 0, mark.completedAt));
  }
  return latest;
}

export function unitCompletion(input: UnitCompletionInput): UnitCompletion {
  const questionIds = [...new Set(input.questionIds)];
  const practiceIds = [...new Set(input.practiceIds)];
  const questions = matchingMarks(questionIds, input.answeredQuestions);
  const practices = matchingMarks(practiceIds, input.completedPractices);
  const questionsCompleted = questions.size;
  const practicesCompleted = practices.size;
  const lessonCompleted = Boolean(input.lessonCompletedAt);
  const questionsDone = questionsCompleted === questionIds.length;
  const practicesDone = practicesCompleted === practiceIds.length;
  const learned = questionsDone && lessonCompleted;
  const completed = learned && practicesDone;
  const anyProgress = questionsCompleted > 0 || lessonCompleted || practicesCompleted > 0;
  const totalTasks = questionIds.length + practiceIds.length + 1;
  const completedTasks = questionsCompleted + practicesCompleted + Number(lessonCompleted);
  const questionTimes = [...questions.values()];
  const practiceTimes = [...practices.values()];
  const learnedAt = learned
    ? Math.max(input.lessonCompletedAt ?? 0, ...questionTimes, 0)
    : null;
  const completedAt = completed
    ? Math.max(learnedAt ?? 0, ...practiceTimes, 0)
    : null;

  return {
    state: completed ? 'Completed' : learned ? 'Learned' : anyProgress ? 'In progress' : 'Not started',
    percent: totalTasks ? completedTasks / totalTasks : 0,
    answeredQuestionIds: [...questions.keys()],
    questionsCompleted,
    questionsTotal: questionIds.length,
    lessonCompleted,
    completedPracticeIds: [...practices.keys()],
    practicesCompleted,
    practicesTotal: practiceIds.length,
    learnedAt,
    completedAt,
  };
}
