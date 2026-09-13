import { For, Show, createMemo, createResource, createSignal, onMount } from 'solid-js';
import type { Lesson, LessonExercise } from '@/lib/content/schema';

interface Props {
  lesson: Lesson;
}

interface Me {
  authenticated: boolean;
  authConfigured: boolean;
}

type Rating = 'again' | 'hard' | 'good' | 'easy';
type ChoiceExercise = Extract<LessonExercise, { kind: 'choose' | 'predict_state' | 'spot_bug' | 'terminal_inspect' }>;
type OrderedExercise = Extract<LessonExercise, { kind: 'arrange' | 'trace' | 'command_builder' }>;
type ConnectExercise = Extract<LessonExercise, { kind: 'connect' }>;
type ManifestExercise = Extract<LessonExercise, { kind: 'manifest_fill' }>;
type ExplainExercise = Extract<LessonExercise, { kind: 'explain' }>;

const orderedKinds = new Set(['arrange', 'trace', 'command_builder']);
const choiceKinds = new Set(['choose', 'predict_state', 'spot_bug', 'terminal_inspect']);

function rotatedOrder(exercise: LessonExercise) {
  if (!orderedKinds.has(exercise.kind) || !('items' in exercise)) return [];
  const ids = exercise.items.map((item) => item.id);
  return ids.length > 1 ? [...ids.slice(1), ids[0]!] : ids;
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function choiceState(current: ChoiceExercise) {
  return current.kind === 'predict_state' ? current.state : [];
}

function choiceCode(current: ChoiceExercise) {
  return current.kind === 'spot_bug' ? current.code : '';
}

function choiceTerminal(current: ChoiceExercise) {
  return current.kind === 'terminal_inspect' ? current.terminal : [];
}

export default function LessonPlayer(props: Props) {
  const [hydrated, setHydrated] = createSignal(false);
  const [step, setStep] = createSignal(0);
  const [finished, setFinished] = createSignal(false);
  const [selected, setSelected] = createSignal<string[]>([]);
  const [order, setOrder] = createSignal<string[]>(rotatedOrder(props.lesson.exercises[0]!));
  const [connections, setConnections] = createSignal<Record<string, string>>({});
  const [blankAnswers, setBlankAnswers] = createSignal<Record<string, string>>({});
  const [answer, setAnswer] = createSignal('');
  const [checkedPoints, setCheckedPoints] = createSignal<string[]>([]);
  const [revealed, setRevealed] = createSignal(false);
  const [correct, setCorrect] = createSignal<boolean | null>(null);
  const [rated, setRated] = createSignal(false);
  const [assisted, setAssisted] = createSignal(false);
  const [showHint, setShowHint] = createSignal(false);
  const [learnFirst, setLearnFirst] = createSignal(false);
  const [variant, setVariant] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [status, setStatus] = createSignal('');

  const [me] = createResource(() => typeof window !== 'undefined', async () => {
    const response = await fetch('/api/me', { credentials: 'include' });
    return response.json() as Promise<Me>;
  });
  const exercise = createMemo(() => props.lesson.exercises[step()]!);
  const progress = createMemo(() => ((finished() ? props.lesson.exercises.length : step() + 1) / props.lesson.exercises.length) * 100);
  const prompt = createMemo(() => variant() && exercise().learn_first
    ? exercise().learn_first!.variant_prompt
    : exercise().prompt);
  const choiceExercise = createMemo<ChoiceExercise | null>(() => {
    const current = exercise();
    return choiceKinds.has(current.kind) && 'options' in current ? current as ChoiceExercise : null;
  });
  const orderedExercise = createMemo<OrderedExercise | null>(() => {
    const current = exercise();
    return orderedKinds.has(current.kind) && 'items' in current ? current as OrderedExercise : null;
  });
  const connectExercise = createMemo<ConnectExercise | null>(() => exercise().kind === 'connect' ? exercise() as ConnectExercise : null);
  const manifestExercise = createMemo<ManifestExercise | null>(() => exercise().kind === 'manifest_fill' ? exercise() as ManifestExercise : null);
  const explainExercise = createMemo<ExplainExercise | null>(() => exercise().kind === 'explain' ? exercise() as ExplainExercise : null);

  onMount(() => setHydrated(true));

  function resetInteraction(nextExercise = exercise()) {
    setSelected([]);
    setOrder(rotatedOrder(nextExercise));
    setConnections({});
    setBlankAnswers({});
    setAnswer('');
    setCheckedPoints([]);
    setRevealed(false);
    setCorrect(null);
    setRated(false);
    setAssisted(false);
    setShowHint(false);
    setLearnFirst(false);
    setVariant(false);
    setSaving(false);
    setStatus('');
  }

  async function persistEvent(isCorrect: boolean, responseMarkdown?: string, completed = false) {
    if (!me()?.authenticated) {
      setStatus('Guest mode: this session stays in memory and does not change mastery.');
      return;
    }
    setSaving(true);
    const response = await fetch('/api/lesson-event', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lessonId: props.lesson.id,
        lessonRevision: props.lesson.revision,
        exerciseId: exercise().id,
        assisted: assisted(),
        correct: isCorrect,
        completed,
        responseMarkdown,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    if (response.ok) {
      const result = await response.json() as { evidence?: string };
      setStatus(result.evidence === 'encounter'
        ? 'Saved as encounter only.'
        : `Saved as ${result.evidence} evidence. Retention still requires a later review.`);
    } else {
      setStatus('Result kept in this session; persistence failed.');
    }
    setSaving(false);
  }

  function moveItem(index: number, direction: -1 | 1) {
    const next = [...order()];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setOrder(next);
  }

  function computeCorrect(current: LessonExercise) {
    if (choiceKinds.has(current.kind) && 'answer_ids' in current) {
      return arraysEqual([...selected()].sort(), [...current.answer_ids].sort());
    }
    if (orderedKinds.has(current.kind) && 'correct_order' in current) {
      return arraysEqual(order(), current.correct_order);
    }
    if (current.kind === 'connect') {
      return current.matches.every((match) => connections()[match.left_id] === match.right_id);
    }
    if (current.kind === 'manifest_fill') {
      return current.blanks.every((blank) => blankAnswers()[blank.id] === blank.answer_id);
    }
    return false;
  }

  function canCheck(current: LessonExercise) {
    if (current.kind === 'explain') return answer().trim().length > 0;
    if (choiceKinds.has(current.kind)) return selected().length > 0;
    if (orderedKinds.has(current.kind)) return order().length > 0;
    if (current.kind === 'connect') return current.left.every((item) => Boolean(connections()[item.id]));
    if (current.kind === 'manifest_fill') return current.blanks.every((blank) => Boolean(blankAnswers()[blank.id]));
    return false;
  }

  async function checkAnswer() {
    const current = exercise();
    if (!canCheck(current)) return;
    if (current.kind === 'explain') {
      setRevealed(true);
      setCorrect(null);
      await persistEvent(false, answer().trim());
      queueMicrotask(() => document.querySelector<HTMLElement>('.lesson-feedback')?.scrollIntoView({ block: 'nearest' }));
      return;
    }
    const result = computeCorrect(current);
    setCorrect(result);
    setRevealed(true);
    await persistEvent(result, undefined, true);
    queueMicrotask(() => document.querySelector<HTMLElement>('.lesson-feedback')?.scrollIntoView({ block: 'nearest' }));
  }

  async function rateExplanation(rating: Rating) {
    const current = exercise();
    if (current.kind !== 'explain') return;
    const covered = checkedPoints().length === current.critical_points.length;
    const cleanRecall = (rating === 'good' || rating === 'easy') && covered;
    setCorrect(cleanRecall);
    setRated(true);
    await persistEvent(cleanRecall, undefined, true);
  }

  async function startLearnFirst() {
    setAssisted(true);
    setShowHint(false);
    setLearnFirst(true);
    await persistEvent(false);
  }

  function useHint() {
    setAssisted(true);
    setShowHint(true);
  }

  function tryVariant() {
    setLearnFirst(false);
    setVariant(true);
    setRevealed(false);
    setCorrect(null);
    setSelected([]);
    setOrder(rotatedOrder(exercise()));
    setConnections({});
    setBlankAnswers({});
    setAnswer('');
    setCheckedPoints([]);
    queueMicrotask(() => document.querySelector<HTMLElement>('[data-lesson-task]')?.focus());
  }

  function continueLesson() {
    if (step() + 1 >= props.lesson.exercises.length) {
      setFinished(true);
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    const nextIndex = step() + 1;
    setStep(nextIndex);
    resetInteraction(props.lesson.exercises[nextIndex]!);
    window.scrollTo({ top: 0, behavior: 'auto' });
    queueMicrotask(() => document.querySelector<HTMLElement>('[data-lesson-task]')?.focus());
  }

  function kindLabel(kind: LessonExercise['kind']) {
    return ({
      choose: 'Choose',
      arrange: 'Arrange',
      connect: 'Connect',
      command_builder: 'Build command',
      terminal_inspect: 'Inspect terminal',
      manifest_fill: 'Fill manifest',
      trace: 'Trace',
      predict_state: 'Predict state',
      spot_bug: 'Spot the bug',
      explain: 'Explain',
    })[kind];
  }

  return (
    <div class="lesson-player" data-testid="lesson-player" aria-busy={!hydrated()}>
      <header class="lesson-player-topbar">
        <a class="lesson-exit" href="/kcna#resources">← Exit</a>
        <div class="lesson-player-title">
          <strong>KCNA</strong>
          <span>Kubernetes Resources</span>
        </div>
        <span class="lesson-step-count">{step() + 1} / {props.lesson.exercises.length}</span>
        <div
          class="lesson-player-progress"
          role="progressbar"
          aria-label="Lesson progress"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={Math.round(progress())}
        >
          <span style={{ width: `${progress()}%` }} />
        </div>
      </header>

      <main class="lesson-player-main">
        <Show when={!finished()} fallback={
          <section class="lesson-complete" data-testid="lesson-complete">
            <p class="lesson-kicker">Vertical slice complete</p>
            <h1>You traced the Kubernetes resource model end to end.</h1>
            <p>Completion is separate from mastery. Retention still comes from later scheduled review.</p>
            <a class="lesson-primary" href="/kcna#resources">Back to KCNA Resources</a>
          </section>
        }>
          <section class="lesson-task-card" data-lesson-task data-testid="lesson-active-task" tabindex="-1">
            <p class="lesson-kicker">{kindLabel(exercise().kind)} · {assisted() ? 'assisted' : 'retrieval first'}</p>
            <h1>{prompt()}</h1>
            <Show when={learnFirst() && exercise().learn_first}>
              {(concept) => (
                <div class="lesson-learn-first" data-testid="learn-first-panel">
                  <p class="lesson-kicker">Learn first · encounter only</p>
                  <h2>{concept().title}</h2>
                  <p>{concept().body}</p>
                  <pre class="lesson-visual"><code>{concept().visual.join('\n')}</code></pre>
                  <button class="lesson-primary" type="button" onClick={tryVariant}>Try a new variant</button>
                </div>
              )}
            </Show>

            <Show when={!learnFirst()}>
              <div class="lesson-interaction" data-testid="lesson-interaction">
                <Show when={choiceExercise()}>
                  {(current) => (
                    <div class="lesson-choice-stack">
                      <Show when={choiceState(current()).length > 0}>
                        <div class="lesson-state-strip" aria-label="Current state">
                          <For each={choiceState(current())}>{(line) => <code>{line}</code>}</For>
                        </div>
                      </Show>
                      <Show when={choiceCode(current())}>
                        <pre class="lesson-code-block"><code>{choiceCode(current())}</code></pre>
                      </Show>
                      <Show when={choiceTerminal(current()).length > 0}>
                        <pre class="lesson-terminal" aria-label="Terminal output"><code>{choiceTerminal(current()).join('\n')}</code></pre>
                      </Show>
                      <div class="lesson-options" role="group" aria-label="Answer choices">
                        <For each={current().options}>{(option, index) => (
                          <button
                            type="button"
                            class="lesson-option"
                            classList={{ selected: selected().includes(option.id) }}
                            aria-pressed={selected().includes(option.id)}
                            disabled={!hydrated() || revealed()}
                            onClick={() => setSelected([option.id])}
                          >
                            <span>{String.fromCharCode(65 + index())}</span>
                            <strong>{option.text}</strong>
                          </button>
                        )}</For>
                      </div>
                    </div>
                  )}
                </Show>
                <Show when={orderedExercise()}>
                  {(current) => (
                    <div class="lesson-order" classList={{ command: current().kind === 'command_builder' }}>
                      <For each={order()}>{(itemId, index) => {
                        const item = () => current().items.find((candidate) => candidate.id === itemId)!;
                        return (
                          <div class="lesson-order-item">
                            <span class="lesson-order-index">{index() + 1}</span>
                            <code classList={{ 'plain-label': current().kind !== 'command_builder' }}>{item().text}</code>
                            <div class="lesson-order-controls" aria-label={`Move ${item().text}`}>
                              <button type="button" aria-label={`Move ${item().text} up`} disabled={!hydrated() || revealed() || index() === 0} onClick={() => moveItem(index(), -1)}>↑</button>
                              <button type="button" aria-label={`Move ${item().text} down`} disabled={!hydrated() || revealed() || index() === order().length - 1} onClick={() => moveItem(index(), 1)}>↓</button>
                            </div>
                          </div>
                        );
                      }}</For>
                    </div>
                  )}
                </Show>
                <Show when={connectExercise()}>
                  {(current) => (
                    <div class="lesson-connect-grid">
                      <For each={current().left}>{(left) => (
                        <label class="lesson-connect-row">
                          <strong>{left.text}</strong>
                          <span aria-hidden="true">→</span>
                          <select
                            aria-label={`Responsibility for ${left.text}`}
                            disabled={!hydrated() || revealed()}
                            value={connections()[left.id] ?? ''}
                            onInput={(event) => setConnections((value) => ({ ...value, [left.id]: event.currentTarget.value }))}
                          >
                            <option value="">Choose responsibility</option>
                            <For each={current().right}>{(right) => <option value={right.id}>{right.text}</option>}</For>
                          </select>
                        </label>
                      )}</For>
                    </div>
                  )}
                </Show>
                <Show when={manifestExercise()}>
                  {(current) => (
                    <div class="lesson-manifest-fill">
                      <pre class="lesson-code-block"><code>{current().manifest}</code></pre>
                      <div class="lesson-blank-grid">
                        <For each={current().blanks}>{(blank) => (
                          <label>
                            <span>{blank.label}</span>
                            <select
                              disabled={!hydrated() || revealed()}
                              value={blankAnswers()[blank.id] ?? ''}
                              onInput={(event) => setBlankAnswers((value) => ({ ...value, [blank.id]: event.currentTarget.value }))}
                            >
                              <option value="">Choose value</option>
                              <For each={blank.options}>{(option) => <option value={option.id}>{option.text}</option>}</For>
                            </select>
                          </label>
                        )}</For>
                      </div>
                    </div>
                  )}
                </Show>
                <Show when={explainExercise()}>
                  <label class="lesson-explain-input">
                    <span>Your explanation</span>
                    <textarea
                      rows={7}
                      disabled={!hydrated() || revealed()}
                      value={answer()}
                      onInput={(event) => setAnswer(event.currentTarget.value)}
                      placeholder="Explain the mechanism in your own words before comparing it with the model."
                    />
                  </label>
                </Show>
              </div>
              <Show when={!revealed()}>
                <Show when={showHint()}>
                  <aside class="lesson-hint" role="note">
                    <strong>Hint</strong>
                    <p>{exercise().hint}</p>
                  </aside>
                </Show>
              </Show>
              <Show when={revealed()}>
                <section class="lesson-feedback" aria-live="polite" data-testid="lesson-feedback">
                  <p class="lesson-feedback-result">
                    {correct() === true ? '✓ Correct model' : correct() === false ? 'Review the model' : 'Compare your model'}
                  </p>
                  <h2>{exercise().feedback.title}</h2>
                  <Show when={explainExercise()}>
                    {(current) => (
                      <div class="lesson-explain-compare">
                        <div>
                          <span>Your answer</span>
                          <p>{answer()}</p>
                        </div>
                        <div>
                          <span>Concise model</span>
                          <p>{current().model_answer}</p>
                        </div>
                      </div>
                    )}
                  </Show>
                  <pre class="lesson-visual"><code>{exercise().feedback.visual.join('\n')}</code></pre>
                  <p>{exercise().feedback.explanation}</p>
                  <ul><For each={exercise().feedback.points}>{(point) => <li>{point}</li>}</For></ul>
                  <Show when={choiceExercise()}>
                    {(current) => (
                      <div class="lesson-rationales">
                        <h3>Why each option behaves this way</h3>
                        <For each={current().options}>{(option) => (
                          <div class="lesson-rationale" classList={{ selected: selected().includes(option.id) }}>
                            <strong>{option.text}</strong>
                            <p>{option.rationale}</p>
                          </div>
                        )}</For>
                      </div>
                    )}
                  </Show>
                  <Show when={explainExercise()}>
                    {(current) => (
                      <fieldset class="lesson-critical-check">
                        <legend>Critical-point self-check</legend>
                        <For each={current().critical_points}>{(point) => (
                          <label>
                            <input
                              type="checkbox"
                              checked={checkedPoints().includes(point)}
                              onChange={(event) => setCheckedPoints((items) => event.currentTarget.checked
                                ? [...items, point]
                                : items.filter((item) => item !== point))}
                            />
                            <span>{point}</span>
                          </label>
                        )}</For>
                      </fieldset>
                    )}
                  </Show>
                </section>
              </Show>
              <div class="lesson-actionbar">
                <Show when={!revealed()}>
                  <div class="lesson-assist-actions" aria-label="Learning assistance">
                    <Show when={exercise().hint}>
                      <button type="button" disabled={!hydrated()} onClick={useHint}>Hint</button>
                    </Show>
                    <Show when={exercise().learn_first}>
                      <button type="button" disabled={!hydrated()} onClick={startLearnFirst}>Learn first</button>
                    </Show>
                  </div>
                </Show>
                <span class="lesson-save-status" role="status">{status()}</span>
                <Show when={!revealed()}>
                  <button
                    class="lesson-primary"
                    type="button"
                    data-testid="lesson-check"
                    disabled={!hydrated() || !canCheck(exercise()) || saving()}
                    onClick={checkAnswer}
                  >
                    {saving() ? 'Saving…' : 'Check'}
                  </button>
                </Show>
                <Show when={revealed() && explainExercise() && !rated()}>
                  <div class="lesson-rating" role="group" aria-label="Recall rating">
                    <span>How effortful was accurate recall?</span>
                    <div>
                      <button type="button" disabled={saving()} onClick={() => rateExplanation('again')}>Again</button>
                      <button type="button" disabled={saving()} onClick={() => rateExplanation('hard')}>Hard</button>
                      <button type="button" disabled={saving()} onClick={() => rateExplanation('good')}>Good</button>
                      <button type="button" disabled={saving()} onClick={() => rateExplanation('easy')}>Easy</button>
                    </div>
                  </div>
                </Show>
                <Show when={revealed() && (!explainExercise() || rated())}>
                  <button class="lesson-primary" type="button" data-testid="lesson-continue" onClick={continueLesson}>
                    {step() + 1 < props.lesson.exercises.length ? 'Continue' : 'Finish lesson'}
                  </button>
                </Show>
              </div>
            </Show>
          </section>
        </Show>
      </main>
    </div>
  );
}
