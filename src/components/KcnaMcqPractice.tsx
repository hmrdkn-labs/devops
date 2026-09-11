import { For, Show, createMemo, createSignal } from 'solid-js';

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

  const sessionQuestions = createMemo(() => mode() === 'all' ? props.questions : quickMix(props.questions, mixOffset()));
  const question = createMemo(() => sessionQuestions()[questionIndex()]);
  const progress = createMemo(() => {
    if (finished()) return 100;
    return ((questionIndex() + (checked() ? 1 : 0)) / sessionQuestions().length) * 100;
  });

  function resetSession(nextMode = mode(), nextOffset = mixOffset()) {
    setMode(nextMode);
    setMixOffset(nextOffset);
    setQuestionIndex(0);
    setSelected([]);
    setChecked(false);
    setScore(0);
    setFinished(false);
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
    if (answerIsCorrect()) setScore((value) => value + 1);
    setChecked(true);
  }

  function nextQuestion() {
    if (questionIndex() >= sessionQuestions().length - 1) {
      setFinished(true);
      return;
    }
    setQuestionIndex((value) => value + 1);
    setSelected([]);
    setChecked(false);
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

  return (
    <section class="mcq-practice" aria-live="polite">
      <div class="mcq-session-controls" aria-label="Practice session length">
        <div class="mcq-mode-switch">
          <button type="button" class={mode() === 'quick' ? 'is-active' : ''} aria-pressed={mode() === 'quick'} onClick={() => resetSession('quick', mixOffset())}>Quick 12</button>
          <button type="button" class={mode() === 'all' ? 'is-active' : ''} aria-pressed={mode() === 'all'} onClick={() => resetSession('all', mixOffset())}>All {props.questions.length}</button>
        </div>
        <Show when={mode() === 'quick'}>
          <button class="quiet-button mcq-new-mix" type="button" onClick={() => resetSession('quick', mixOffset() + 1)}>New mix</button>
        </Show>
      </div>

      <Show when={!finished()} fallback={
        <section class="mcq-result" aria-labelledby="mcq-result-title">
          <p class="section-kicker">Session complete</p>
          <h2 id="mcq-result-title">{score()} / {sessionQuestions().length} correct</h2>
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

        <article class="mcq-question-card">
          <div class="mcq-question-meta">
            <span>{checkpointLabels[question().checkpoint]}</span>
            <span>{question().category === 'kubectl' ? 'kubectl' : question().category}</span>
            <span>{question().select === 'multiple' ? 'Select all that apply' : 'Select one'}</span>
          </div>
          <h2 id="mcq-question-title">{question().prompt}</h2>

          <form onSubmit={checkAnswer}>
            <fieldset aria-labelledby="mcq-question-title">
              <legend class="sr-only">Answer options</legend>
              <div class="mcq-options">
                <For each={question().options}>{(option) => (
                  <label class="mcq-option" data-state={optionState(option.id)}>
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
                      <Show when={checked()}>
                        <small>{option.rationale}</small>
                      </Show>
                    </span>
                  </label>
                )}</For>
              </div>
            </fieldset>

            <Show when={!checked()}>
              <button class="button mcq-check" type="submit" disabled={!selected().length}>Check answer</button>
            </Show>

            <Show when={checked()}>
              <div class="mcq-feedback" data-correct={answerIsCorrect() ? 'true' : 'false'}>
                <strong>{answerIsCorrect() ? 'Correct' : 'Not quite'}</strong>
                <p>{question().explanation}</p>
                <div class="mcq-source-links">
                  <span>Review:</span>
                  <For each={question().sourceUnits}>{(unit) => <a href={unit.href}>{unit.title}</a>}</For>
                </div>
              </div>
              <button class="button mcq-next" type="button" onClick={nextQuestion}>
                {questionIndex() === sessionQuestions().length - 1 ? 'See result' : 'Next question'} →
              </button>
            </Show>
          </form>
        </article>
      </Show>
    </section>
  );
}
