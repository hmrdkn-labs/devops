import { For, Show, createMemo, createSignal } from 'solid-js';
import { focusTask } from '@/lib/task-focus';

type Checkpoint = 'fundamentals' | 'resources' | 'cluster-behavior' | 'cloud-native';

interface Option {
  id: string;
  text: string;
  rationale: string;
  code: boolean;
}

interface Question {
  id: string;
  checkpoint: Checkpoint;
  category: 'concept' | 'kubectl' | 'scenario';
  select: 'single' | 'multiple';
  prompt: string;
  options: Option[];
  answer_ids: string[];
  explanation: string;
  sourceUnits: Array<{ href: string; title: string }>;
}

interface Props {
  questions: Question[];
}

const checkpointOrder: Checkpoint[] = ['fundamentals', 'resources', 'cluster-behavior', 'cloud-native'];
const checkpointLabels: Record<Checkpoint, string> = {
  fundamentals: 'Fundamentals',
  resources: 'Resources',
  'cluster-behavior': 'Cluster behavior',
  'cloud-native': 'Cloud native',
};

function quickMix(questions: Question[], offset: number) {
  const grouped = new Map<Checkpoint, Question[]>(checkpointOrder.map((checkpoint) => [
    checkpoint,
    questions.filter((question) => question.checkpoint === checkpoint),
  ]));
  return checkpointOrder.flatMap((checkpoint) => {
    const pool = grouped.get(checkpoint) ?? [];
    if (!pool.length) return [];
    const start = (offset * 3) % pool.length;
    return Array.from({ length: Math.min(3, pool.length) }, (_, index) => pool[(start + index) % pool.length]!);
  });
}

export default function KcnaMcqPractice(props: Props) {
  const [mode, setMode] = createSignal<'quick' | 'all'>('quick');
  const [mixOffset, setMixOffset] = createSignal(0);
  const [questionIndex, setQuestionIndex] = createSignal(0);
  const [selected, setSelected] = createSignal<string[]>([]);
  const [checked, setChecked] = createSignal(false);
  const [score, setScore] = createSignal(0);
  const [finished, setFinished] = createSignal(false);
  const [firstAttemptCorrect, setFirstAttemptCorrect] = createSignal<boolean | null>(null);
  let questionHeading: HTMLHeadingElement | undefined;
  let resultHeading: HTMLHeadingElement | undefined;

  const sessionQuestions = createMemo(() => mode() === 'all' ? props.questions : quickMix(props.questions, mixOffset()));
  const question = createMemo(() => sessionQuestions()[questionIndex()]);
  const progress = createMemo(() => {
    if (finished()) return 100;
    return ((questionIndex() + (checked() ? 1 : 0)) / sessionQuestions().length) * 100;
  });

  function animateQuestionCard() {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    queueMicrotask(() => {
      questionHeading?.animate(
        [
          { opacity: 0, transform: 'translateY(8px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
    });
  }

  function resetSession(nextMode = mode(), nextOffset = mixOffset()) {
    setMode(nextMode);
    setMixOffset(nextOffset);
    setQuestionIndex(0);
    setSelected([]);
    setChecked(false);
    setScore(0);
    setFinished(false);
    setFirstAttemptCorrect(null);
    animateQuestionCard();
    focusTask(() => questionHeading);
  }

  function choose(optionId: string) {
    if (checked()) return;
    if (question().select === 'single') {
      setSelected([optionId]);
      return;
    }
    setSelected((current) => current.includes(optionId)
      ? current.filter((id) => id !== optionId)
      : [...current, optionId]);
  }

  function answerIsCorrect() {
    const expected = question().answer_ids;
    const actual = selected();
    return actual.length === expected.length && expected.every((id) => actual.includes(id));
  }

  function checkAnswer(event: SubmitEvent) {
    event.preventDefault();
    if (!selected().length || checked()) return;
    const result = answerIsCorrect();
    if (firstAttemptCorrect() === null) {
      setFirstAttemptCorrect(result);
      if (result) setScore((value) => value + 1);
    }
    setChecked(true);
  }

  function retryAnswer() {
    setSelected([]);
    setChecked(false);
    focusTask(() => questionHeading);
  }

  function nextQuestion() {
    if (questionIndex() >= sessionQuestions().length - 1) {
      setFinished(true);
      focusTask(() => resultHeading);
      return;
    }
    setQuestionIndex((value) => value + 1);
    setSelected([]);
    setChecked(false);
    setFirstAttemptCorrect(null);
    animateQuestionCard();
    focusTask(() => questionHeading);
  }

  function optionState(optionId: string) {
    if (!checked()) return selected().includes(optionId) ? 'selected' : 'idle';
    const correct = question().answer_ids.includes(optionId);
    const chosen = selected().includes(optionId);
    if (correct && chosen) return 'correct-selected';
    if (correct) return 'correct-missed';
    if (chosen) return 'wrong-selected';
    return 'neutral';
  }

  function answerText(ids: string[]) {
    return ids.map((id) => question().options.find((option) => option.id === id)?.text ?? id).join(', ');
  }

  function feedbackDetail() {
    if (answerIsCorrect()) {
      return firstAttemptCorrect() === false
        ? 'You corrected the answer. The session score still reflects your first attempt.'
        : 'Your answer includes the complete expected set.';
    }
    if (question().select === 'single') {
      return `Your answer: ${answerText(selected())}. Correct answer: ${answerText(question().answer_ids)}.`;
    }
    const correctSelections = selected().filter((id) => question().answer_ids.includes(id)).length;
    const incorrectSelections = selected().length - correctSelections;
    return `${correctSelections} of ${question().answer_ids.length} correct choices selected; ${incorrectSelections} incorrect. Expected: ${answerText(question().answer_ids)}.`;
  }

  return (
    <section class="mcq-practice" aria-live="polite">
      <Show when={!finished()} fallback={
        <section class="mcq-result" aria-labelledby="mcq-result-title">
          <p class="section-kicker">Session complete</p>
          <h2 ref={resultHeading} tabindex="-1" id="mcq-result-title">{score()} / {sessionQuestions().length} correct</h2>
          <p>{score() === sessionQuestions().length
            ? 'Clean run. Use a new mix later so recall has to survive a different question order.'
            : 'Use the option rationales you missed as the next review targets, then run another mix.'}</p>
          <div class="hero-actions">
            <button class="button" type="button" onClick={() => resetSession(mode(), mixOffset() + (mode() === 'quick' ? 1 : 0))}>Practice again</button>
            <a class="quiet-link" href="/kcna">Back to KCNA focus</a>
          </div>
        </section>
      }>
        <div class="mcq-progress-row">
          <div>
            <span>Question {questionIndex() + 1} / {sessionQuestions().length}</span>
            <strong>{score()} correct</strong>
          </div>
          <div class="mcq-progress-track" role="progressbar" aria-label="MCQ session progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress())}>
            <span style={{ width: `${progress()}%` }} />
          </div>
        </div>

        <article class="mcq-question-card" tabindex="-1">
          <div class="mcq-question-meta">
            <span>{checkpointLabels[question().checkpoint]}</span>
            <span>{question().category === 'kubectl' ? 'kubectl' : question().category}</span>
            <span>{question().select === 'multiple' ? 'Select all that apply' : 'Select one'}</span>
          </div>
          <h2 ref={questionHeading} tabindex="-1" id="mcq-question-title">{question().prompt}</h2>

          <form onSubmit={checkAnswer}>
            <fieldset aria-labelledby="mcq-question-title">
              <legend class="sr-only">Answer options</legend>
              <div class="mcq-options">
                <For each={question().options}>{(option) => {
                  const state = () => optionState(option.id);
                  return (
                    <label class="mcq-option" data-state={state()}>
                      <input
                        type={question().select === 'single' ? 'radio' : 'checkbox'}
                        name="mcq-answer"
                        value={option.id}
                        checked={selected().includes(option.id)}
                        disabled={checked()}
                        onChange={() => choose(option.id)}
                      />
                      <span class="mcq-option-letter">{option.id.toUpperCase()}</span>
                      <span class="mcq-option-copy">
                        <Show when={option.code} fallback={<strong>{option.text}</strong>}>
                          <code>{option.text}</code>
                        </Show>
                        <Show when={checked() && state() !== 'neutral'}>
                          <span class="mcq-option-result">
                            {state() === 'correct-selected'
                              ? 'Your answer · Correct'
                              : state() === 'correct-missed'
                                ? 'Correct answer'
                                : 'Your answer · Incorrect'}
                          </span>
                        </Show>
                      </span>
                    </label>
                  );
                }}</For>
              </div>
            </fieldset>

            <Show when={!checked()}>
              <Show when={firstAttemptCorrect() === false}>
                <p class="mcq-correction-note" role="status">Correction attempt · your first answer remains the scored attempt.</p>
              </Show>
              <button class="button mcq-check" type="submit" disabled={!selected().length}>Check answer</button>
            </Show>

            <Show when={checked()}>
              <div class="mcq-feedback" data-correct={answerIsCorrect() ? 'true' : 'false'}>
                <strong>{answerIsCorrect() ? firstAttemptCorrect() === false ? 'Corrected' : 'Correct' : 'Not quite'}</strong>
                <p class="mcq-feedback-detail">{feedbackDetail()}</p>
                <p>{question().explanation}</p>
                <details class="feedback-depth" data-testid="mcq-rationales">
                  <summary>Why each option behaves this way</summary>
                  <For each={question().options}>{(option) => <div class="lesson-rationale"><strong>{option.text}</strong><p>{option.rationale}</p></div>}</For>
                </details>
                <div class="mcq-source-links">
                  <span>Review:</span>
                  <For each={question().sourceUnits}>{(unit) => <a href={unit.href}>{unit.title}</a>}</For>
                </div>
              </div>
              <Show when={!answerIsCorrect()}>
                <button class="quiet-button mcq-retry" type="button" onClick={retryAnswer}>Try again</button>
              </Show>
              <button class="button mcq-next" type="button" onClick={nextQuestion}>
                {questionIndex() === sessionQuestions().length - 1 ? 'See result' : 'Next question'} →
              </button>
            </Show>
          </form>
        </article>
      </Show>
      <details class="feedback-depth mcq-session-options">
        <summary>Session options</summary>
        <p>Changing the length or mix starts a new session and resets this score.</p>
        <div class="mcq-session-controls" aria-label="Practice session length">
          <div class="mcq-mode-switch">
            <button type="button" class={mode() === 'quick' ? 'is-active' : ''} aria-pressed={mode() === 'quick'} onClick={() => resetSession('quick', mixOffset())}>Quick 12</button>
            <button type="button" class={mode() === 'all' ? 'is-active' : ''} aria-pressed={mode() === 'all'} onClick={() => resetSession('all', mixOffset())}>All {props.questions.length}</button>
          </div>
          <Show when={mode() === 'quick'}>
            <button class="quiet-button mcq-new-mix" type="button" onClick={() => resetSession('quick', mixOffset() + 1)}>New mix</button>
          </Show>
        </div>
      </details>
    </section>
  );
}
