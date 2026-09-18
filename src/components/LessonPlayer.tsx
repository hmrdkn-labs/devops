import { For, Show, batch, createMemo, createResource, createSignal, onMount } from 'solid-js';
import type { Lesson, LessonExercise } from '@/lib/content/schema';
import LessonVisualGuide from '@/components/LessonVisualGuide';
import type { MentalModelLink } from '@/components/MentalModelLinks';
import { focusTask } from '@/lib/task-focus';
import '@/styles/task-focus.css';

interface Props {
  lesson: Lesson;
  mentalModels?: MentalModelLink[];
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
  const [status, setStatus] = createSignal('');
  const [draggedItem, setDraggedItem] = createSignal<string | null>(null);
  const [dragTarget, setDragTarget] = createSignal<string | null>(null);
  const [reorderStatus, setReorderStatus] = createSignal('');
  const [authError, setAuthError] = createSignal(false);
  let persistSequence = 0;
  let pointerDragItem: string | null = null;
  let pointerDragId: number | null = null;
  let taskHeading: HTMLHeadingElement | undefined;
  let completeHeading: HTMLHeadingElement | undefined;
  let feedbackVerdict: HTMLDivElement | undefined;

  const checkpointLabel = createMemo(() => ({
    fundamentals: 'Kubernetes Fundamentals',
    resources: 'Kubernetes Resources',
    'cluster-behavior': 'Cluster Behavior',
    'cloud-native': 'Cloud-Native Context',
  })[props.lesson.checkpoint] ?? props.lesson.title.replace(/^KCNA\s+/, ''));
  const checkpointHref = createMemo(() => `/kcna#${({
    fundamentals: 'kubernetes-fundamentals',
    resources: 'kubernetes-resources',
    'cluster-behavior': 'scheduling',
    'cloud-native': 'cloud-native-architecture',
  })[props.lesson.checkpoint] ?? props.lesson.checkpoint}`);

  const [me, { refetch: refetchMe }] = createResource(() => typeof window !== 'undefined', async () => {
    setAuthError(false);
    try {
      const response = await fetch('/api/me', { credentials: 'include' });
      if (!response.ok) throw new Error('identity unavailable');
      return await response.json() as Me;
    } catch { setAuthError(true); return null; }
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
  const feedbackDetail = createMemo(() => {
    const choice = choiceExercise();
    if (choice) {
      const selectedText = selected().map((id) => choice.options.find((option) => option.id === id)?.text ?? id).join(', ');
      const expectedText = choice.answer_ids.map((id) => choice.options.find((option) => option.id === id)?.text ?? id).join(', ');
      return correct()
        ? `Your answer matches the expected answer: ${expectedText}.`
        : `Your answer — ${selectedText || 'No answer'} Expected answer — ${expectedText}`;
    }
    const ordered = orderedExercise();
    if (ordered) {
      const correctPositions = order().filter((id, index) => ordered.correct_order[index] === id).length;
      return correct()
        ? `All ${ordered.correct_order.length} steps are in the expected position.`
        : `${correctPositions} of ${ordered.correct_order.length} positions are correct. Compare the two sequences below.`;
    }
    const connect = connectExercise();
    if (connect) {
      const correctMatches = connect.matches.filter((match) => connections()[match.left_id] === match.right_id).length;
      return correct()
        ? `All ${connect.matches.length} responsibilities are matched correctly.`
        : `${correctMatches} of ${connect.matches.length} responsibilities are matched correctly. Check each marked row.`;
    }
    const manifest = manifestExercise();
    if (manifest) {
      const correctFields = manifest.blanks.filter((blank) => blankAnswers()[blank.id] === blank.answer_id).length;
      return correct()
        ? `All ${manifest.blanks.length} manifest fields are correct.`
        : `${correctFields} of ${manifest.blanks.length} manifest fields are correct. The expected value is shown beside each field.`;
    }
    return rated()
      ? correct()
        ? 'Your self-check supports a clean recall attempt.'
        : 'Use the critical points to identify what your explanation still needs.'
      : 'Compare your explanation with the model, check the critical points, then rate the quality of your recall.';
  });

  onMount(() => setHydrated(true));

  function resetInteraction(nextExercise = exercise()) {
    persistSequence += 1;
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
    setStatus('');
    clearDragState();
  }

  async function persistEvent(isCorrect: boolean, responseMarkdown?: string, completed = false) {
    if (!me()?.authenticated) {
      setStatus('Guest mode: this session stays in memory and does not change mastery.');
      return;
    }
    const payload = {
      lessonId: props.lesson.id,
      lessonRevision: props.lesson.revision,
      exerciseId: exercise().id,
      assisted: assisted(),
      correct: isCorrect,
      completed,
      responseMarkdown,
      idempotencyKey: crypto.randomUUID(),
    };
    const sequence = ++persistSequence;
    setStatus('Saving result…');
    try {
      const response = await fetch('/api/lesson-event', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        const result = await response.json() as { evidence?: string };
        if (exercise().id === payload.exerciseId && persistSequence === sequence) {
          setStatus(result.evidence === 'encounter'
            ? 'Saved as encounter only.'
            : `Saved as ${result.evidence} evidence. Retention still requires a later review.`);
        }
      } else if (exercise().id === payload.exerciseId && persistSequence === sequence) {
        setStatus('Result kept in this session; persistence failed.');
      }
    } catch {
      if (exercise().id === payload.exerciseId && persistSequence === sequence) {
        setStatus('Result kept in this session; persistence failed.');
      }
    }
  }

  function revealFeedback() {
    // On mobile the verdict can fit while its explanation sits behind the
    // sticky actions. Align the feedback start before handing focus to it.
    queueMicrotask(() => {
      if (window.matchMedia('(max-width: 640px)').matches) {
        feedbackVerdict?.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    });
    focusTask(() => feedbackVerdict);
  }

  function animateLessonTask() {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    queueMicrotask(() => {
      taskHeading?.animate(
        [
          { opacity: 0, transform: 'translateY(8px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
    });
  }

  function moveItem(index: number, direction: -1 | 1) {
    const next = [...order()];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setOrder(next);
    const movedId = next[target]!;
    const moved = orderedExercise()?.items.find((item) => item.id === movedId);
    setReorderStatus(`${moved?.text ?? 'Item'} moved to position ${target + 1}.`);
  }

  function clearDragState() {
    pointerDragItem = null;
    pointerDragId = null;
    setDraggedItem(null);
    setDragTarget(null);
  }

  function moveItemToIndex(itemId: string, targetIndex: number) {
    const next = [...order()];
    const sourceIndex = next.indexOf(itemId);
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= next.length || sourceIndex === targetIndex) return;
    next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, itemId);
    setOrder(next);
    const moved = orderedExercise()?.items.find((item) => item.id === itemId);
    setReorderStatus(`${moved?.text ?? 'Item'} moved to position ${targetIndex + 1}.`);
  }

  function startNativeDrag(event: DragEvent, itemId: string) {
    if (revealed()) return;
    event.dataTransfer?.setData('text/plain', itemId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    setDraggedItem(itemId);
  }

  function nativeDragOver(event: DragEvent, targetIndex: number, targetId: string) {
    if (revealed() || !draggedItem()) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    setDragTarget(targetId);
    moveItemToIndex(draggedItem()!, targetIndex);
  }

  function startPointerDrag(event: PointerEvent, itemId: string) {
    if (revealed() || event.pointerType === 'mouse') return;
    event.preventDefault();
    pointerDragItem = itemId;
    pointerDragId = event.pointerId;
    setDraggedItem(itemId);
    event.currentTarget instanceof HTMLElement && event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerDragMove(event: PointerEvent) {
    if (pointerDragId !== event.pointerId || !pointerDragItem) return;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-order-id]');
    const targetId = target?.dataset.orderId;
    if (!targetId) return;
    const targetIndex = order().indexOf(targetId);
    if (targetIndex < 0) return;
    setDragTarget(targetId);
    moveItemToIndex(pointerDragItem, targetIndex);
  }

  function endPointerDrag(event: PointerEvent) {
    if (pointerDragId !== event.pointerId) return;
    if (event.currentTarget instanceof HTMLElement && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    clearDragState();
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

  function checkAnswer() {
    const current = exercise();
    if (!canCheck(current)) return;
    if (current.kind === 'explain') {
      setRevealed(true);
      setCorrect(null);
      revealFeedback();
      void persistEvent(false, answer().trim());
      return;
    }
    const result = computeCorrect(current);
    setCorrect(result);
    setRevealed(true);
    revealFeedback();
    void persistEvent(result, undefined, true);
  }

  function rateExplanation(rating: Rating) {
    const current = exercise();
    if (current.kind !== 'explain') return;
    const covered = checkedPoints().length === current.critical_points.length;
    const cleanRecall = (rating === 'good' || rating === 'easy') && covered;
    setCorrect(cleanRecall);
    setRated(true);
    void persistEvent(cleanRecall, undefined, true);
  }

  function startLearnFirst() {
    setAssisted(true);
    setShowHint(false);
    setLearnFirst(true);
    void persistEvent(false);
  }

  function useHint() {
    setAssisted(true);
    setShowHint(true);
  }

  function tryVariant() {
    persistSequence += 1;
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
    focusTask(taskHeading);
  }

  function retryExercise() {
    persistSequence += 1;
    setAssisted(true);
    setRevealed(false);
    setCorrect(null);
    setRated(false);
    setCheckedPoints([]);
    setStatus('Correction attempt: feedback was revealed, so this remains encounter evidence.');
    if (choiceExercise()) setSelected([]);
    if (explainExercise()) setAnswer('');
    focusTask(taskHeading);
  }

  function continueLesson() {
    if (step() + 1 >= props.lesson.exercises.length) {
      setFinished(true);
      focusTask(() => completeHeading);
      return;
    }
    const nextIndex = step() + 1;
    // Exercise identity and its response state must become visible together.
    // Adjacent ordered tasks have different item IDs; rendering between these
    // updates would resolve the previous order against the next task's items.
    batch(() => {
      setStep(nextIndex);
      resetInteraction(props.lesson.exercises[nextIndex]!);
    });
    animateLessonTask();
    focusTask(taskHeading);
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
    <div class="lesson-player task-focused-lesson" data-testid="lesson-player" aria-busy={!hydrated()}>
      <header class="lesson-player-topbar">
        <a class="lesson-exit" href={checkpointHref()}>← Exit</a>
        <div class="lesson-player-title">
          <strong>KCNA</strong>
          <span>{checkpointLabel()}</span>
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

      <div class="lesson-player-main">
        <Show when={authError()}><p class="workspace-message" role="status">Could not verify sign-in. This session stays in memory. <button class="text-button" type="button" onClick={() => void refetchMe()}>Retry sign-in check</button></p></Show>
        <Show when={!finished()} fallback={
          <section class="lesson-complete" data-testid="lesson-complete">
            <p class="lesson-kicker">Checkpoint lesson complete</p>
            <h1 ref={completeHeading} tabindex="-1">You completed {checkpointLabel()}.</h1>
            <p>Completion is separate from mastery. Retention still comes from later scheduled review.</p>
            <a class="lesson-primary" href={checkpointHref()}>Back to {checkpointLabel()}</a>
          </section>
        }>
          <section class="lesson-task-card" data-lesson-task data-revealed={revealed() ? 'true' : 'false'} data-testid="lesson-active-task" tabindex="-1">
            <p class="lesson-kicker">{kindLabel(exercise().kind)} · {assisted() ? 'assisted' : 'retrieval first'}</p>
            <h1 ref={taskHeading} tabindex="-1">{prompt()}</h1>
            <Show when={learnFirst() && exercise().learn_first}>
              {(concept) => (
                <div class="lesson-learn-first" data-testid="learn-first-panel">
                  <p class="lesson-kicker">Learn first · encounter only</p>
                  <h2>{concept().title}</h2>
                  <p>{concept().body}</p>
                  <LessonVisualGuide
                    lines={concept().visual}
                    eyebrow="Learn visually"
                    title="Step through the mental model"
                    components={concept().components}
                  />
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
                        <For each={current().options}>{(option, index) => {
                          const chosen = () => selected().includes(option.id);
                          const expected = () => current().answer_ids.includes(option.id);
                          const state = () => {
                            if (!revealed()) return chosen() ? 'selected' : 'idle';
                            if (expected() && chosen()) return 'correct-selected';
                            if (expected()) return 'correct-missed';
                            if (chosen()) return 'wrong-selected';
                            return 'neutral';
                          };
                          return (
                            <button
                              type="button"
                              class="lesson-option"
                              data-state={state()}
                              aria-pressed={chosen()}
                              disabled={!hydrated() || revealed()}
                              onClick={() => setSelected([option.id])}
                            >
                              <span>{String.fromCharCode(65 + index())}</span>
                              <span class="lesson-option-copy">
                                <strong>{option.text}</strong>
                                <Show when={revealed() && state() !== 'neutral'}>
                                  <small class="lesson-row-result">
                                    {state() === 'correct-selected'
                                      ? 'Your answer · Correct'
                                      : state() === 'correct-missed'
                                        ? 'Expected answer'
                                        : 'Your answer · Incorrect'}
                                  </small>
                                </Show>
                              </span>
                            </button>
                          );
                        }}</For>
                      </div>
                    </div>
                  )}
                </Show>
                <Show when={orderedExercise()}>
                  {(current) => (
                    <div class="lesson-order" classList={{ command: current().kind === 'command_builder' }}>
                      <p class="sr-only" role="status" aria-live="polite">{reorderStatus()}</p>
                      <For each={order()}>{(itemId, index) => {
                        const item = () => current().items.find((candidate) => candidate.id === itemId)!;
                        const expectedPosition = () => current().correct_order.indexOf(itemId) + 1;
                        const positionIsCorrect = () => expectedPosition() === index() + 1;
                        return (
                          <div
                            class="lesson-order-item"
                            data-order-id={itemId}
                            data-dragging={draggedItem() === itemId ? 'true' : 'false'}
                            data-drag-target={dragTarget() === itemId ? 'true' : 'false'}
                            data-state={revealed() ? positionIsCorrect() ? 'correct' : 'incorrect' : 'idle'}
                            onDragOver={(event) => nativeDragOver(event, index(), itemId)}
                            onDrop={(event) => {
                              event.preventDefault();
                              clearDragState();
                            }}
                          >
                            <span class="lesson-order-index">{index() + 1}</span>
                            <code classList={{ 'plain-label': current().kind !== 'command_builder' }}>{item().text}</code>
                            <Show when={!revealed()} fallback={
                              <small class="lesson-row-result">
                                {positionIsCorrect() ? `✓ Position ${index() + 1}` : `Expected #${expectedPosition()}`}
                              </small>
                            }>
                              <div class="lesson-order-controls" aria-label={`Move ${item().text}`}>
                                <span
                                  class="lesson-drag-handle"
                                  draggable="true"
                                  aria-label={`Drag ${item().text} to reorder`}
                                  role="img"
                                  title="Drag to reorder"
                                  onDragStart={(event) => startNativeDrag(event, itemId)}
                                  onDragEnd={clearDragState}
                                  onPointerDown={(event) => startPointerDrag(event, itemId)}
                                  onPointerMove={pointerDragMove}
                                  onPointerUp={endPointerDrag}
                                  onPointerCancel={endPointerDrag}
                                >
                                  ⠿
                                </span>
                                <button type="button" aria-label={`Move ${item().text} up`} disabled={!hydrated() || index() === 0} onClick={() => moveItem(index(), -1)}>↑</button>
                                <button type="button" aria-label={`Move ${item().text} down`} disabled={!hydrated() || index() === order().length - 1} onClick={() => moveItem(index(), 1)}>↓</button>
                              </div>
                            </Show>
                          </div>
                        );
                      }}</For>
                    </div>
                  )}
                </Show>
                <Show when={connectExercise()}>
                  {(current) => (
                    <div class="lesson-connect-grid">
                      <For each={current().left}>{(left) => {
                        const expectedId = () => current().matches.find((match) => match.left_id === left.id)!.right_id;
                        const expectedText = () => current().right.find((right) => right.id === expectedId())!.text;
                        const rowIsCorrect = () => connections()[left.id] === expectedId();
                        return (
                          <label class="lesson-connect-row" data-state={revealed() ? rowIsCorrect() ? 'correct' : 'incorrect' : 'idle'}>
                            <strong>{left.text}</strong>
                            <span class="lesson-connect-arrow" aria-hidden="true">→</span>
                            <span class="lesson-field-response">
                              <select
                                aria-label={`Responsibility for ${left.text}`}
                                disabled={!hydrated() || revealed()}
                                value={connections()[left.id] ?? ''}
                                onInput={(event) => setConnections((value) => ({ ...value, [left.id]: event.currentTarget.value }))}
                              >
                                <option value="">Choose responsibility</option>
                                <For each={current().right}>{(right) => <option value={right.id}>{right.text}</option>}</For>
                              </select>
                              <Show when={connections()[left.id]}>
                                <small class="lesson-selected-response" data-testid="lesson-selected-response">Your selection: {current().right.find((right) => right.id === connections()[left.id])?.text}</small>
                              </Show>
                              <Show when={revealed()}>
                                <small class="lesson-row-result">{rowIsCorrect() ? '✓ Correct match' : `Expected: ${expectedText()}`}</small>
                              </Show>
                            </span>
                          </label>
                        );
                      }}</For>
                    </div>
                  )}
                </Show>
                <Show when={manifestExercise()}>
                  {(current) => (
                    <div class="lesson-manifest-fill">
                      <pre class="lesson-code-block"><code>{current().manifest}</code></pre>
                      <div class="lesson-blank-grid">
                        <For each={current().blanks}>{(blank) => {
                          const answerText = () => blank.options.find((option) => option.id === blank.answer_id)!.text;
                          const fieldIsCorrect = () => blankAnswers()[blank.id] === blank.answer_id;
                          return (
                            <label data-state={revealed() ? fieldIsCorrect() ? 'correct' : 'incorrect' : 'idle'}>
                              <span>{blank.label}</span>
                              <span class="lesson-field-response">
                                <select
                                  disabled={!hydrated() || revealed()}
                                  value={blankAnswers()[blank.id] ?? ''}
                                  onInput={(event) => setBlankAnswers((value) => ({ ...value, [blank.id]: event.currentTarget.value }))}
                                >
                                  <option value="">Choose value</option>
                                  <For each={blank.options}>{(option) => <option value={option.id}>{option.text}</option>}</For>
                                </select>
                                <Show when={revealed()}>
                                  <small class="lesson-row-result">{fieldIsCorrect() ? '✓ Correct value' : `Expected: ${answerText()}`}</small>
                                </Show>
                              </span>
                            </label>
                          );
                        }}</For>
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
                  <div ref={feedbackVerdict} tabindex="-1" class="lesson-verdict" data-result={correct() === true ? 'correct' : correct() === false ? 'incorrect' : 'compare'}>
                    <span class="lesson-verdict-icon" aria-hidden="true">{correct() === true ? '✓' : correct() === false ? '!' : '↔'}</span>
                    <div>
                      <strong>{correct() === true ? 'Correct' : correct() === false ? 'Not quite' : 'Compare your answer'}</strong>
                      <p>{feedbackDetail()}</p>
                    </div>
                  </div>
                  <Show when={orderedExercise()}>
                    {(current) => (
                      <Show when={correct() === false}>
                        <div class="lesson-answer-compare" aria-label="Your order compared with expected order">
                          <div>
                            <span>Your order</span>
                            <ol><For each={order()}>{(itemId) => <li>{current().items.find((item) => item.id === itemId)!.text}</li>}</For></ol>
                          </div>
                          <div>
                            <span>Expected order</span>
                            <ol><For each={current().correct_order}>{(itemId) => <li>{current().items.find((item) => item.id === itemId)!.text}</li>}</For></ol>
                          </div>
                        </div>
                      </Show>
                    )}
                  </Show>
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
                  <p>{exercise().feedback.explanation}</p>
                  <details class="feedback-depth" data-testid="lesson-feedback-depth">
                    <summary>Explore the causal model</summary>
                  <LessonVisualGuide
                    lines={exercise().feedback.visual}
                    eyebrow="See what changed"
                    title="Replay the causal model"
                    components={exercise().feedback.components}
                  />
                  <ul><For each={exercise().feedback.points}>{(point) => <li>{point}</li>}</For></ul>
                  </details>
                  <Show when={choiceExercise()}>
                    {(current) => (
                      <details class="lesson-rationales feedback-depth" data-testid="lesson-rationales">
                        <summary>Why each option behaves this way</summary>
                        <For each={current().options}>{(option) => (
                          <div class="lesson-rationale" classList={{ selected: selected().includes(option.id) }}>
                            <strong>{option.text}</strong>
                            <p>{option.rationale}</p>
                          </div>
                        )}</For>
                      </details>
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
                              disabled={rated()}
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
                    disabled={!hydrated() || me.loading || !canCheck(exercise())}
                    onClick={checkAnswer}
                  >
                    Check
                  </button>
                </Show>
                <Show when={revealed() && explainExercise() && !rated()}>
                  <div class="lesson-rating" role="group" aria-label="Recall rating">
                    <span>How effortful was accurate recall?</span>
                    <div>
                      <button type="button" onClick={() => rateExplanation('again')}>Again</button>
                      <button type="button" onClick={() => rateExplanation('hard')}>Hard</button>
                      <button type="button" onClick={() => rateExplanation('good')}>Good</button>
                      <button type="button" onClick={() => rateExplanation('easy')}>Easy</button>
                    </div>
                  </div>
                </Show>
                <Show when={revealed() && (!explainExercise() || rated())}>
                  <Show when={correct() === false}>
                    <button class="lesson-secondary" type="button" data-testid="lesson-retry" onClick={retryExercise}>Try again</button>
                  </Show>
                  <button class="lesson-primary" type="button" data-testid="lesson-continue" onClick={continueLesson}>
                    {step() + 1 < props.lesson.exercises.length ? 'Continue' : 'Finish lesson'}
                  </button>
                </Show>
              </div>
            </Show>
          </section>
        </Show>
        <Show when={props.mentalModels?.length}>
          <details class="feedback-depth task-concept-links" data-testid="mental-model-links">
            <summary>Explore this concept</summary>
            <p>Open an interactive model in a new tab. Your current task stays here.</p>
            <ul><For each={props.mentalModels}>{(model) => <li>
              <a href={`/models/${model.slug}/`} target="_blank" rel="noopener">{model.title} ↗</a>
              <p>{model.summary}</p>
            </li>}</For></ul>
          </details>
        </Show>
      </div>
    </div>
  );
}
