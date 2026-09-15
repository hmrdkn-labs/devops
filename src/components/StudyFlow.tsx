import { For, Show, createMemo, createResource, createSignal, onMount } from 'solid-js';
import LessonVisualGuide from '@/components/LessonVisualGuide';

interface Question {
  id: string;
  kind: 'explain' | 'predict' | 'objective' | 'scenario';
  prompt: string;
  model_answer: string;
  critical_points: string[];
  objective_ids: string[];
}

interface Card {
  id: string;
  type: 'short' | 'prompt' | 'scenario';
  front: string;
  back: string;
  critical_points: string[];
  objective_ids: string[];
}

interface Practice {
  id: string;
  title: string;
  prompt: string;
  steps: string[];
  success_checks: string[];
  safety: string[];
}

interface Source {
  id: string;
  title: string;
  url: string;
  publisher: string;
  note: string;
}

interface ReferenceVisual {
  id: string;
  kind: 'flow' | 'state' | 'ownership' | 'comparison' | 'lifecycle' | 'evidence';
  eyebrow: string;
  title: string;
  lines: string[];
  teaching_point: string;
  components: Array<{
    name: string;
    location: 'client' | 'control-plane' | 'worker-node' | 'cluster-addon' | 'data-plane' | 'external';
    responsibility: string;
    acts_on: string;
    proof?: string;
  }>;
}

interface Props {
  focus?: {
    href: string;
    label: string;
  };
  nextUnit?: {
    href: string;
    title: string;
  };
  unit: {
    id: string;
    revision: number;
    title: string;
    summary: string;
    layer: string;
    estimatedMinutes: number;
    questions: Question[];
    cards: Card[];
    practices: Practice[];
    sources: Source[];
    visuals: ReferenceVisual[];
    lessonHtml: string;
  };
}

function ReferenceVisuals(props: { visuals: ReferenceVisual[] }) {
  return (
    <section class="reference-visuals" data-testid="reference-visuals" aria-label="Reference visual models">
      <div class="reference-visuals-heading">
        <span>Visual models</span>
        <p>Step through the causal model before reading the details.</p>
      </div>
      <div class="reference-visual-stack">
        <For each={props.visuals}>{(visual) => (
          <div class="reference-visual-item" data-visual-kind={visual.kind}>
            <LessonVisualGuide
              lines={visual.lines}
              title={visual.title}
              eyebrow={visual.eyebrow}
              components={visual.components}
            />
            <p class="reference-visual-teaching-point">{visual.teaching_point}</p>
          </div>
        )}</For>
      </div>
    </section>
  );
}

interface Me {
  authenticated: boolean;
  authConfigured: boolean;
}

interface UnitCompletionProgress {
  state: 'Not started' | 'In progress' | 'Learned' | 'Completed';
  percent: number;
  answeredQuestionIds: string[];
  questionsCompleted: number;
  questionsTotal: number;
  lessonCompleted: boolean;
  completedPracticeIds: string[];
  practicesCompleted: number;
  practicesTotal: number;
  completedAt: number | null;
}

interface UnitLearningProgress {
  id: string;
  completion: UnitCompletionProgress;
  understanding: {
    state: string;
    score: number;
    needsRefresh: boolean;
  };
}

interface ProgressResponse {
  units: UnitLearningProgress[];
}

interface PrivateAnswerHistoryEntry {
  unitRevision: number;
  questionId: string;
  answerMarkdown: string;
  createdAt: number;
}

interface AnswerHistoryResponse {
  unitId: string;
  answers: PrivateAnswerHistoryEntry[];
}

type LearningTransitionDirection = 'forward' | 'back' | 'crossfade';

interface ViewTransitionLike {
  finished: Promise<void>;
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => ViewTransitionLike;
};

export default function StudyFlow(props: Props) {
  const [hydrated, setHydrated] = createSignal(false);
  const [mode, setMode] = createSignal<'study' | 'reference'>('study');
  const [questionIndex, setQuestionIndex] = createSignal(0);
  const [answer, setAnswer] = createSignal('');
  const [revealed, setRevealed] = createSignal(false);
  const [rated, setRated] = createSignal(false);
  const [rating, setRating] = createSignal<'again' | 'hard' | 'good' | 'easy' | null>(null);
  const [finished, setFinished] = createSignal(false);
  const [showHint, setShowHint] = createSignal(false);
  const [learningFirst, setLearningFirst] = createSignal(false);
  const [reflection, setReflection] = createSignal('');
  const [saveMessage, setSaveMessage] = createSignal('');
  const [checked, setChecked] = createSignal<string[]>([]);
  const [note, setNote] = createSignal('');
  const [noteLoaded, setNoteLoaded] = createSignal(false);
  const [noteMessage, setNoteMessage] = createSignal('');
  const [taskSaving, setTaskSaving] = createSignal<string | null>(null);
  const [taskMessage, setTaskMessage] = createSignal('');
  const [guestLessonCompleted, setGuestLessonCompleted] = createSignal(false);
  const [guestPracticesCompleted, setGuestPracticesCompleted] = createSignal<string[]>([]);
  let saveSequence = 0;
  let transitionSequence = 0;
  const [me] = createResource(() => typeof window !== 'undefined', async () => {
    const response = await fetch('/api/me', { credentials: 'include' });
    return response.json() as Promise<Me>;
  });
  const [learningProgress, { refetch: refetchLearningProgress }] = createResource(
    () => Boolean(me()?.authenticated),
    async () => {
      const response = await fetch('/api/progress', { credentials: 'include' });
      if (!response.ok) return null;
      return response.json() as Promise<ProgressResponse>;
    },
  );
  const [answerHistory, { refetch: refetchAnswerHistory }] = createResource(
    () => me()?.authenticated && (revealed() || mode() === 'reference' || finished()) ? props.unit.id : null,
    async (unitId) => {
      const response = await fetch('/api/answers?unitId=' + encodeURIComponent(unitId), { credentials: 'include' });
      if (!response.ok) return null;
      return response.json() as Promise<AnswerHistoryResponse>;
    },
  );
  const question = createMemo(() => props.unit.questions[questionIndex()]);
  const progress = createMemo(() => ((questionIndex() + (finished() ? 1 : 0)) / props.unit.questions.length) * 100);
  const unitLearningProgress = createMemo(() => learningProgress()?.units.find((unit) => unit.id === props.unit.id));
  const currentQuestionHistory = createMemo(() => answerHistory()?.answers.filter((entry) => entry.questionId === question().id) ?? []);
  const latestAnswerByQuestion = createMemo(() => {
    const latest = new Map<string, PrivateAnswerHistoryEntry>();
    for (const entry of answerHistory()?.answers ?? []) {
      if (!latest.has(entry.questionId)) latest.set(entry.questionId, entry);
    }
    return props.unit.questions.flatMap((item) => {
      const entry = latest.get(item.id);
      return entry ? [{ question: item, entry }] : [];
    });
  });

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'reference') setMode('reference');
    setHydrated(true);
  });

  function transitionLearningState(
    update: () => void,
    options: {
      direction?: LearningTransitionDirection;
      focusSelector?: string;
      alignSurface?: boolean;
    } = {},
  ) {
    if (typeof window === 'undefined') {
      update();
      return;
    }

    const direction = options.direction ?? 'crossfade';
    const sequence = ++transitionSequence;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const finish = () => {
      if (sequence !== transitionSequence) return;
      delete document.documentElement.dataset.studyTransition;
      const target = options.focusSelector
        ? document.querySelector<HTMLElement>(options.focusSelector)
        : null;
      target?.focus({ preventScroll: true });
      if (options.alignSurface) {
        document.querySelector<HTMLElement>('.study-surface')?.scrollIntoView({
          behavior: reducedMotion ? 'auto' : 'smooth',
          block: 'start',
        });
      }
    };

    if (reducedMotion) {
      update();
      queueMicrotask(finish);
      return;
    }

    document.documentElement.dataset.studyTransition = direction;
    const transitionDocument = document as ViewTransitionDocument;
    if (transitionDocument.startViewTransition) {
      try {
        const transition = transitionDocument.startViewTransition(() => update());
        void transition.finished.then(finish, finish);
        return;
      } catch {
        // Fall through to the lightweight Web Animations fallback.
      }
    }

    const outgoing = document.querySelector<HTMLElement>('.study-surface');
    if (!outgoing) {
      update();
      queueMicrotask(finish);
      return;
    }

    const exitOffset = direction === 'back' ? 4 : direction === 'forward' ? -5 : -2;
    const enterOffset = direction === 'back' ? -6 : direction === 'forward' ? 8 : 3;
    let exitAnimation: Animation;
    try {
      exitAnimation = outgoing.animate(
        [
          { opacity: 1, transform: 'translateY(0) scale(1)' },
          { opacity: 0.12, transform: `translateY(${exitOffset}px) scale(.998)` },
        ],
        { duration: 80, easing: 'ease-out', fill: 'forwards' },
      );
    } catch {
      update();
      queueMicrotask(finish);
      return;
    }

    const swap = () => {
      if (sequence !== transitionSequence) return;
      update();
      queueMicrotask(() => {
        const incoming = document.querySelector<HTMLElement>('.study-surface');
        if (!incoming) {
          finish();
          return;
        }
        const enterAnimation = incoming.animate(
          [
            { opacity: 0.12, transform: `translateY(${enterOffset}px) scale(.998)` },
            { opacity: 1, transform: 'translateY(0) scale(1)' },
          ],
          { duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)' },
        );
        void enterAnimation.finished.then(finish, finish);
      });
    };

    void exitAnimation.finished.then(swap, swap);
  }

  function switchMode(nextMode: 'study' | 'reference') {
    if (mode() === nextMode) return;
    transitionLearningState(() => {
      setMode(nextMode);
      const url = new URL(window.location.href);
      if (nextMode === 'reference') url.searchParams.set('mode', 'reference');
      else url.searchParams.delete('mode');
      window.history.replaceState({}, '', url);
    }, { direction: nextMode === 'reference' ? 'forward' : 'back' });
  }

  function hintFor(kind: Question['kind']) {
    switch (kind) {
      case 'scenario':
        return 'Locate the failure layer first. Name the next observation that would prove or disprove your hypothesis.';
      case 'predict':
        return 'Name the rule or boundary that decides the outcome, then compare each value in the prompt against it.';
      case 'objective':
        return 'Identify the exact responsibility or relationship being tested before choosing the answer.';
      default:
        return 'Separate the components first: who owns the state, what changes, and what stays outside that component?';
    }
  }

  async function learnFirst() {
    transitionLearningState(() => {
      setLearningFirst(true);
      setShowHint(false);
      setSaveMessage(me()?.authenticated
        ? 'Marked as encountered only. No recall credit was created.'
        : 'Guest mode: learn-first state stays on this page only.');
    }, { direction: 'forward', alignSurface: true });
    if (!me()?.authenticated) return;
    const response = await fetch('/api/encounter', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        unitId: props.unit.id,
        unitRevision: props.unit.revision,
        questionId: question().id,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    if (!response.ok) setSaveMessage('Learn-first mode opened; encounter evidence could not be saved.');
    else void refetchLearningProgress();
  }

  async function persistAttempt(questionId: string, answerMarkdown: string, sequence: number) {
    try {
      const response = await fetch('/api/attempt', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitId: props.unit.id,
          unitRevision: props.unit.revision,
          questionId,
          answerMarkdown,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (question().id === questionId && saveSequence === sequence) {
        setSaveMessage(response.ok ? 'Private answer saved.' : 'Answer kept in memory; saving failed.');
      }
      if (response.ok) {
        void refetchLearningProgress();
        void refetchAnswerHistory();
      }
    } catch {
      if (question().id === questionId && saveSequence === sequence) setSaveMessage('Answer kept in memory; saving failed.');
    }
  }

  function reveal() {
    if (!answer().trim()) return;
    const questionIdSnapshot = question().id;
    const answerSnapshot = answer().trim();
    setRevealed(true);
    if (me()?.authenticated) {
      const sequence = ++saveSequence;
      setSaveMessage('Saving privately…');
      void persistAttempt(questionIdSnapshot, answerSnapshot, sequence);
    } else {
      setSaveMessage('Guest answer kept in memory for this page only.');
    }
  }

  async function persistRating(value: 'again' | 'hard' | 'good' | 'easy', reflectionMarkdown: string, sequence: number) {
    const questionId = question().id;
    const questionPrompt = question().prompt;
    const preferredType = question().kind === 'scenario' ? 'scenario' : 'prompt';
    const card = props.unit.cards.find((candidate) =>
      candidate.type === preferredType &&
      candidate.objective_ids.some((id) => question().objective_ids.includes(id)),
    ) ?? props.unit.cards.find((candidate) => candidate.type === preferredType) ?? props.unit.cards[0];
    if (!card) {
      if (question().id === questionId && saveSequence === sequence) setSaveMessage('Rating kept in memory; no review card is configured.');
      return;
    }
    try {
      const response = await fetch('/api/review', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: card.id,
          unitId: props.unit.id,
          unitRevision: props.unit.revision,
          rating: value,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!response.ok) {
        if (question().id === questionId && saveSequence === sequence) setSaveMessage('Rating kept in memory; scheduling failed.');
      } else {
        if (question().id === questionId && saveSequence === sequence) setSaveMessage('Rating scheduled.');
        void refetchLearningProgress();
      }
      if (reflectionMarkdown) {
        const noteResponse = await fetch('/api/notes', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            unitId: props.unit.id,
            markdown: `### Correction — ${questionPrompt}\n\n${reflectionMarkdown}`,
          }),
        });
        if (noteResponse.ok && question().id === questionId && saveSequence === sequence) {
          setSaveMessage('Rating scheduled. Correction appended to your private notes.');
        }
      }
    } catch {
      if (question().id === questionId && saveSequence === sequence) setSaveMessage('Rating kept in memory; scheduling failed.');
    }
  }

  function rate(value: 'again' | 'hard' | 'good' | 'easy') {
    const reflectionSnapshot = reflection().trim();
    setRating(value);
    setRated(true);
    if (!me()?.authenticated) return;
    const sequence = ++saveSequence;
    setSaveMessage('Scheduling review…');
    void persistRating(value, reflectionSnapshot, sequence);
  }

  function taskIsCompleted(taskType: 'lesson' | 'practice', taskId: string) {
    const persisted = unitLearningProgress()?.completion;
    if (me()?.authenticated && persisted) {
      return taskType === 'lesson'
        ? persisted.lessonCompleted
        : persisted.completedPracticeIds.includes(taskId);
    }
    return taskType === 'lesson'
      ? guestLessonCompleted()
      : guestPracticesCompleted().includes(taskId);
  }

  async function setTaskCompleted(taskType: 'lesson' | 'practice', taskId: string, completed: boolean) {
    const key = `${taskType}:${taskId}`;
    if (!me()?.authenticated) {
      if (taskType === 'lesson') setGuestLessonCompleted(completed);
      else setGuestPracticesCompleted((ids) => completed
        ? [...new Set([...ids, taskId])]
        : ids.filter((id) => id !== taskId));
      setTaskMessage('Guest mode: completion stays in memory for this page only.');
      return;
    }

    setTaskSaving(key);
    setTaskMessage('Saving progress…');
    const response = await fetch('/api/unit-progress', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        unitId: props.unit.id,
        unitRevision: props.unit.revision,
        taskType,
        taskId,
        completed,
      }),
    });
    if (response.ok) {
      await refetchLearningProgress();
      setTaskMessage(completed ? 'Progress saved.' : 'Completion cleared.');
    } else {
      setTaskMessage('Could not save progress.');
    }
    setTaskSaving(null);
  }

  function next() {
    if (questionIndex() + 1 < props.unit.questions.length) {
      transitionLearningState(() => {
        setQuestionIndex((value) => value + 1);
        setAnswer('');
        setRevealed(false);
        setRated(false);
        setRating(null);
        setChecked([]);
        setReflection('');
        setShowHint(false);
        setLearningFirst(false);
        setSaveMessage('');
      }, { direction: 'forward', focusSelector: '#private-answer', alignSurface: true });
    } else {
      transitionLearningState(() => setFinished(true), { direction: 'forward', alignSurface: true });
    }
  }

  async function loadNote() {
    if (!me()?.authenticated || noteLoaded()) return;
    const response = await fetch('/api/notes?unitId=' + encodeURIComponent(props.unit.id), {
      credentials: 'include',
    });
    if (response.ok) {
      const data = await response.json() as { markdown: string };
      setNote(data.markdown);
      setNoteLoaded(true);
    }
  }

  async function saveNote() {
    setNoteMessage('Saving…');
    const response = await fetch('/api/notes', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unitId: props.unit.id, markdown: note() }),
    });
    setNoteMessage(response.ok ? 'Saved privately.' : 'Could not save.');
  }

  return (
    <div class="study-flow">
      <header class="unit-heading shell narrow">
        <div class="unit-meta">
          <Show when={props.focus}>
            {(focus) => <a class="unit-focus-link" href={focus().href}>{focus().label}</a>}
          </Show>
          <span>{props.unit.layer}</span>
          <span>{props.unit.estimatedMinutes} min</span>
          <span>revision {props.unit.revision}</span>
        </div>
        <h1>{props.unit.title}</h1>
        <p>{props.unit.summary}</p>
        <div class="study-mode-switch" role="group" aria-label="Learning mode">
          <button type="button" aria-pressed={mode() === 'study'} onClick={() => switchMode('study')}>Study</button>
          <button type="button" aria-pressed={mode() === 'reference'} onClick={() => switchMode('reference')}>Reference</button>
          <span>{mode() === 'study' ? 'Retrieval first. Evidence is created only by your actions.' : 'Read directly. Reference mode creates no recall evidence.'}</span>
        </div>
      </header>

      <div class="study-layout shell" classList={{ 'is-reference': mode() === 'reference' }}>
        <aside class="study-rail" aria-label="Unit context" aria-hidden={mode() === 'reference'}>
          <div class="rail-card">
            <span class="section-kicker">Current unit</span>
            <strong>{props.unit.layer}</strong>
            <p>{props.unit.estimatedMinutes} min · revision {props.unit.revision}</p>
          </div>
          <ol class="rail-list" aria-label="Questions in this unit">
            <For each={props.unit.questions}>{(item, index) => (
              <li classList={{ 'is-active': index() === questionIndex() }}>
                <span>{String(index() + 1).padStart(2, '0')}</span>
                <span>{item.kind}</span>
              </li>
            )}</For>
          </ol>
        </aside>

        <div class="study-main">
          <Show when={unitLearningProgress()}>
            {(unitProgress) => (
              <section class="unit-learning-status" aria-label="Learning progress">
                <div>
                  <span>Learning</span>
                  <strong>{unitProgress().completion.state} · {Math.round(unitProgress().completion.percent * 100)}%</strong>
                  <small>
                    Questions {unitProgress().completion.questionsCompleted}/{unitProgress().completion.questionsTotal}
                    {' · '}Lesson {unitProgress().completion.lessonCompleted ? 'read' : 'open'}
                    {' · '}Practice {unitProgress().completion.practicesCompleted}/{unitProgress().completion.practicesTotal}
                  </small>
                </div>
                <div>
                  <span>Understanding</span>
                  <strong>{unitProgress().understanding.state} · {Math.round(unitProgress().understanding.score * 100)}%</strong>
                  <small>{unitProgress().understanding.needsRefresh ? 'Content changed; refresh evidence is needed.' : 'Derived from your recall, application, and later review evidence.'}</small>
                </div>
              </section>
            )}
          </Show>
          <div class="study-surface" data-testid="study-surface">
            <Show when={mode() === 'study' && !learningFirst()}>
            <section class="question-stage" aria-labelledby="question-title">
            <div
              class="stage-progress"
              role="progressbar"
              aria-label="Question progress"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={Math.round(progress())}
            >
              <span aria-hidden="true" style={{ width: progress() + '%' }} />
            </div>
            <div class="question-stage-label">
              <span class="question-stage-number" aria-hidden="true">{questionIndex() + 1}</span>
              <div>
                <p class="section-kicker">Think before the lesson</p>
                <small>{questionIndex() + 1} of {props.unit.questions.length} · {question().kind}</small>
              </div>
            </div>
            <h2 id="question-title">{question().prompt}</h2>
            <Show when={!revealed()}>
              <label class="answer-label" for="private-answer">Your explanation</label>
              <textarea
                id="private-answer"
                disabled={!hydrated()}
                value={answer()}
                onInput={(event) => setAnswer(event.currentTarget.value)}
                placeholder="Reason it through in your own words. Accuracy comes after retrieval."
                rows={8}
              />
              <div class="stage-actions">
                <button class="button primary" disabled={!hydrated() || !answer().trim()} onClick={reveal}>
                  Save privately & reveal
                </button>
                <span class="microcopy">No AI grading. You compare the reasoning yourself.</span>
              </div>
              <div class="learning-assist-actions" aria-label="Learning assistance">
                <button type="button" class="text-button" disabled={!hydrated()} onClick={() => setShowHint((value) => !value)}>
                  {showHint() ? 'Hide hint' : 'Give me a hint'}
                </button>
                <button type="button" class="text-button" disabled={!hydrated()} onClick={learnFirst}>I haven't learned this yet</button>
              </div>
              <Show when={showHint()}>
                <aside class="learning-hint" aria-live="polite">
                  <strong>Directional hint</strong>
                  <p>{hintFor(question().kind)}</p>
                </aside>
              </Show>
            </Show>

            <Show when={revealed()}>
              <div class="comparison">
                <div>
                  <p class="comparison-label">Your answer</p>
                  <p class="preserve-lines">{answer()}</p>
                </div>
                <div class="model-answer">
                  <p class="comparison-label">Concise model</p>
                  <p>{question().model_answer}</p>
                </div>
              </div>
              <Show when={me()?.authenticated && currentQuestionHistory().length > 0}>
                <details class="answer-history" data-testid="answer-history-current">
                  <summary>Saved explanations ({currentQuestionHistory().length})</summary>
                  <p class="answer-history-intro">Your private answer history appears only after you reveal the current attempt, so old wording does not leak into fresh retrieval.</p>
                  <div class="answer-history-list">
                    <For each={currentQuestionHistory()}>{(entry) => (
                      <article>
                        <div>
                          <span>{new Date(entry.createdAt).toLocaleString()}</span>
                          <small>revision {entry.unitRevision}</small>
                        </div>
                        <p class="preserve-lines">{entry.answerMarkdown}</p>
                      </article>
                    )}</For>
                  </div>
                </details>
              </Show>
              <fieldset class="critical-check">
                <legend>Critical-point self-check</legend>
                <For each={question().critical_points}>{(point) => (
                  <label>
                    <input
                      type="checkbox"
                      checked={checked().includes(point)}
                      onChange={(event) => setChecked((items) =>
                        event.currentTarget.checked ? [...items, point] : items.filter((item) => item !== point))}
                    />
                    <span>{point}</span>
                  </label>
                )}</For>
              </fieldset>
              <label class="reflection-prompt" for="model-correction">
                <span>What was missing or wrong in your model?</span>
                <textarea
                  id="model-correction"
                  rows={3}
                  value={reflection()}
                  onInput={(event) => setReflection(event.currentTarget.value)}
                  placeholder="Optional: write the correction you want your future self to remember."
                />
                <small>{me()?.authenticated ? 'Saved to your private unit notes when you rate this attempt.' : 'Guest mode keeps this correction only on this page.'}</small>
              </label>
              <Show when={!rated()} fallback={
                <>
                  <div
                    class="self-check-verdict"
                    data-result={checked().length === question().critical_points.length && (rating() === 'good' || rating() === 'easy') ? 'ready' : 'review'}
                    aria-live="polite"
                  >
                    <strong>{checked().length === question().critical_points.length && (rating() === 'good' || rating() === 'easy')
                      ? 'Self-check complete'
                      : 'Review needed'}</strong>
                    <p>{checked().length} of {question().critical_points.length} critical points were present. You rated this recall “{rating()}”.</p>
                    <Show when={checked().length < question().critical_points.length}>
                      <div>
                        <span>Add these missing ideas:</span>
                        <ul>
                          <For each={question().critical_points.filter((point) => !checked().includes(point))}>{(point) => <li>{point}</li>}</For>
                        </ul>
                      </div>
                    </Show>
                  </div>
                  <div class="stage-actions">
                    <button class="button primary" onClick={next}>
                      {questionIndex() + 1 < props.unit.questions.length ? 'Next question' : 'Open the lesson'}
                    </button>
                    <span class="save-status" role="status">{saveMessage()}</span>
                  </div>
                </>
              }>
                <div class="rating-block">
                  <p>How effortful was accurate recall?</p>
                  <div class="rating-buttons" role="group" aria-label="Recall rating">
                    <button onClick={() => rate('again')}>Again</button>
                    <button onClick={() => rate('hard')}>Hard</button>
                    <button onClick={() => rate('good')}>Good</button>
                    <button onClick={() => rate('easy')}>Easy</button>
                  </div>
                  <span class="save-status" role="status">{saveMessage()}</span>
                </div>
              </Show>
            </Show>
            </section>
            </Show>

            <Show when={mode() === 'study' && learningFirst()}>
              <section class="learn-first-panel" aria-labelledby="learn-first-title">
              <p class="section-kicker">New concept · learn before recall</p>
              <h2 id="learn-first-title">Build the model first.</h2>
              <p class="learn-first-intro">This path records an encounter, not a failed recall attempt. Read the lesson, then return to the same question and answer it from memory.</p>
              <ReferenceVisuals visuals={props.unit.visuals} />
              <div class="markdown-body" innerHTML={props.unit.lessonHtml} />
              <div class="stage-actions learn-first-return">
                <button class="button primary" type="button" onClick={() => {
                  transitionLearningState(() => {
                    setLearningFirst(false);
                    setAnswer('');
                    setSaveMessage('');
                  }, { direction: 'back', focusSelector: '#private-answer', alignSurface: true });
                }}>Try the question now</button>
                <span class="save-status" role="status">{saveMessage()}</span>
              </div>
              </section>
            </Show>

            <Show when={finished() || mode() === 'reference'}>
              <article class="lesson">
              <div class="lesson-divider"><span>{mode() === 'reference' ? 'Reference lesson' : 'Lesson revealed'}</span></div>
              <ReferenceVisuals visuals={props.unit.visuals} />
              <div class="markdown-body" innerHTML={props.unit.lessonHtml} />
              <div class="completion-action">
                <button
                  type="button"
                  class="completion-toggle"
                  aria-pressed={taskIsCompleted('lesson', 'lesson')}
                  disabled={taskSaving() === 'lesson:lesson'}
                  onClick={() => setTaskCompleted('lesson', 'lesson', !taskIsCompleted('lesson', 'lesson'))}
                >
                  {taskIsCompleted('lesson', 'lesson') ? 'Lesson read ✓' : 'Mark lesson read'}
                </button>
                <span>{taskMessage()}</span>
              </div>
            </article>

            <Show when={mode() === 'reference' && me()?.authenticated}>
              <section class="answer-history-panel" aria-labelledby="answer-history-title">
                <p class="section-kicker">Private recall history</p>
                <h2 id="answer-history-title">Your explanations</h2>
                <Show when={latestAnswerByQuestion().length > 0} fallback={
                  <p class="guest-note">No saved explanation for this unit yet. Your answers will appear here after you reveal them in Study mode.</p>
                }>
                  <div class="answer-history-list">
                    <For each={latestAnswerByQuestion()}>{({ question: item, entry }) => (
                      <article>
                        <div>
                          <strong>{item.prompt}</strong>
                          <small>{new Date(entry.createdAt).toLocaleString()} · revision {entry.unitRevision}</small>
                        </div>
                        <p class="preserve-lines">{entry.answerMarkdown}</p>
                      </article>
                    )}</For>
                  </div>
                </Show>
              </section>
            </Show>

            <section class="depth-grid" aria-labelledby="practice-title">
              <div>
                <p class="section-kicker">Guided practice</p>
                <h2 id="practice-title">Apply the model safely</h2>
              </div>
              <For each={props.unit.practices}>{(practice) => (
                <details class="depth-card">
                  <summary>{practice.title}</summary>
                  <p>{practice.prompt}</p>
                  <ol><For each={practice.steps}>{(step) => <li>{step}</li>}</For></ol>
                  <h3>Success checks</h3>
                  <ul><For each={practice.success_checks}>{(item) => <li>{item}</li>}</For></ul>
                  <Show when={practice.safety.length}>
                    <h3>Safety boundary</h3>
                    <ul><For each={practice.safety}>{(item) => <li>{item}</li>}</For></ul>
                  </Show>
                  <div class="completion-action practice-completion">
                    <button
                      type="button"
                      class="completion-toggle"
                      aria-pressed={taskIsCompleted('practice', practice.id)}
                      disabled={taskSaving() === `practice:${practice.id}`}
                      onClick={() => setTaskCompleted('practice', practice.id, !taskIsCompleted('practice', practice.id))}
                    >
                      {taskIsCompleted('practice', practice.id) ? 'Practice completed ✓' : 'Mark practice complete'}
                    </button>
                  </div>
                </details>
              )}</For>
            </section>

            <section class="card-preview" aria-labelledby="cards-title">
              <p class="section-kicker">Future recall</p>
              <h2 id="cards-title">Cards created by this unit</h2>
              <div class="mini-card-grid">
                <For each={props.unit.cards}>{(card) => (
                  <details class="mini-card">
                    <summary><span>{card.type}</span>{card.front}</summary>
                    <p>{card.back}</p>
                  </details>
                )}</For>
              </div>
            </section>

            <section class="notes-panel" aria-labelledby="notes-title">
              <div>
                <p class="section-kicker">Private notebook</p>
                <h2 id="notes-title">What changed in your mental model?</h2>
              </div>
              <Show when={me()?.authenticated} fallback={
                <p class="guest-note">Sign in as the allowlisted owner to keep per-unit Markdown notes.</p>
              }>
                <textarea
                  rows={7}
                  value={note()}
                  onFocus={loadNote}
                  onInput={(event) => setNote(event.currentTarget.value)}
                  placeholder="Write a correction, connection, or question in Markdown."
                />
                <div class="stage-actions">
                  <button class="button primary" onClick={saveNote}>Save note</button>
                  <span role="status">{noteMessage()}</span>
                </div>
              </Show>
            </section>

            <footer class="unit-sources">
              <h2>Primary references</h2>
              <ul><For each={props.unit.sources}>{(source) => (
                <li><a href={source.url} rel="noopener noreferrer">{source.title}</a> · {source.publisher}<small>{source.note}</small></li>
              )}</For></ul>
              <a class="raw-link" href={'/raw/v1/units/' + props.unit.id.split(':')[1] + '/unit.md'}>Open raw Markdown</a>
            </footer>

            <nav class="unit-next-actions" aria-label="Continue learning">
              <Show when={props.focus}>
                {(focus) => <a class="button" href={focus().href}>Back to {focus().label}</a>}
              </Show>
              <Show when={props.nextUnit}>
                {(next) => <a class="button primary" href={next().href}>Next: {next().title} →</a>}
              </Show>
              </nav>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}
