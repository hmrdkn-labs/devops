import { For, Show, createMemo, createResource, createSignal, onMount, onCleanup } from 'solid-js';
import LessonVisualGuide from '@/components/LessonVisualGuide';
import { focusTask } from '@/lib/task-focus';

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

function ReferenceMarkdown(props: { html: string }) {
  let body: HTMLDivElement | undefined;
  onMount(() => {
    for (const table of body?.querySelectorAll<HTMLTableElement>('table') ?? []) {
      const columns = Math.max(...Array.from(table.rows, (row) => row.cells.length));
      table.dataset.columns = String(columns);
      if (columns <= 2) continue;
      const scroll = document.createElement('div');
      scroll.className = 'reference-table-scroll';
      scroll.dataset.testid = 'reference-table-scroll';
      scroll.tabIndex = 0;
      scroll.setAttribute('role', 'region');
      const headings = Array.from(table.querySelectorAll('th'), (cell) => cell.textContent?.trim()).filter(Boolean).join(', ');
      scroll.setAttribute('aria-label', `Reference table${headings ? `: ${headings}` : ''}. Scroll horizontally to see all columns.`);
      table.parentNode?.insertBefore(scroll, table);
      scroll.appendChild(table);
      const hint = document.createElement('p');
      hint.className = 'reference-table-hint';
      hint.textContent = 'More columns → Swipe sideways, or focus the table and use arrow keys.';
      scroll.parentNode?.insertBefore(hint, scroll);
    }
  });
  return <div ref={body} class="markdown-body" innerHTML={props.html} />;
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

interface PrivateAnswerHistoryMetadataEntry {
  unitRevision: number;
  questionId: string;
  createdAt: number;
}

interface AnswerHistoryMetadataResponse {
  unitId: string;
  answers: PrivateAnswerHistoryMetadataEntry[];
}

type ContextPanel = 'history' | 'reference' | 'notes';

export default function StudyFlow(props: Props) {
  const [hydrated, setHydrated] = createSignal(false);
  const [contextPanel, setContextPanel] = createSignal<ContextPanel | null>(null);
  const [questionIndex, setQuestionIndex] = createSignal(0);
  const [answer, setAnswer] = createSignal('');
  const [revealed, setRevealed] = createSignal(false);
  const [rated, setRated] = createSignal(false);
  const [rating, setRating] = createSignal<'again' | 'hard' | 'good' | 'easy' | null>(null);
  const [finished, setFinished] = createSignal(false);
  const [showHint, setShowHint] = createSignal(false);
  const [reflection, setReflection] = createSignal('');
  const [saveMessage, setSaveMessage] = createSignal('');
  const [checked, setChecked] = createSignal<string[]>([]);
  const [note, setNote] = createSignal('');
  const [noteLoaded, setNoteLoaded] = createSignal(false);
  const [noteLoading, setNoteLoading] = createSignal(false);
  const [noteSaving, setNoteSaving] = createSignal(false);
  const [noteError, setNoteError] = createSignal('');
  const [noteDirty, setNoteDirty] = createSignal(false);
  const [correctionPending, setCorrectionPending] = createSignal(false);
  const [failedCorrection, setFailedCorrection] = createSignal('');
  const [metadataError, setMetadataError] = createSignal(false);
  const [historyError, setHistoryError] = createSignal(false);
  const [progressError, setProgressError] = createSignal(false);
  const [authError, setAuthError] = createSignal(false);
  const [noteMessage, setNoteMessage] = createSignal('');
  const [taskSaving, setTaskSaving] = createSignal<string | null>(null);
  const [taskMessage, setTaskMessage] = createSignal('');
  const [guestLessonCompleted, setGuestLessonCompleted] = createSignal(false);
  const [guestPracticesCompleted, setGuestPracticesCompleted] = createSignal<string[]>([]);
  let saveSequence = 0;
  let noteMutationSequence = 0;
  let taskHeading: HTMLHeadingElement | undefined;
  let lessonHeading: HTMLDivElement | undefined;
  let contextElement: HTMLElement | undefined;
  let contextOpener: HTMLElement | undefined;
  const [me, { refetch: refetchMe }] = createResource(() => typeof window !== 'undefined', async () => {
    setAuthError(false);
    try {
      const response = await fetch('/api/me', { credentials: 'include' });
      if (!response.ok) throw new Error('identity unavailable');
      return await response.json() as Me;
    } catch {
      setAuthError(true);
      return null;
    }
  });
  const [learningProgress, { refetch: refetchLearningProgress }] = createResource(
    () => Boolean(me()?.authenticated),
    async () => {
      setProgressError(false);
      try {
        const response = await fetch('/api/progress', { credentials: 'include' });
        if (!response.ok) throw new Error('progress unavailable');
        return await response.json() as ProgressResponse;
      } catch { setProgressError(true); return null; }
    },
  );
  const [answerHistoryMetadata, { refetch: refetchAnswerHistoryMetadata }] = createResource(
    () => me()?.authenticated ? props.unit.id : null,
    async (unitId) => {
      setMetadataError(false);
      try {
        const response = await fetch('/api/answers?unitId=' + encodeURIComponent(unitId) + '&view=metadata', { credentials: 'include' });
        if (!response.ok) throw new Error('history unavailable');
        return await response.json() as AnswerHistoryMetadataResponse;
      } catch { setMetadataError(true); return null; }
    },
  );
  const [answerHistory, { refetch: refetchAnswerHistory }] = createResource(
    () => me()?.authenticated && (revealed() || contextPanel() === 'history' || finished()) ? props.unit.id : null,
    async (unitId) => {
      setHistoryError(false);
      try {
        const response = await fetch('/api/answers?unitId=' + encodeURIComponent(unitId), { credentials: 'include' });
        if (!response.ok) throw new Error('history unavailable');
        return await response.json() as AnswerHistoryResponse;
      } catch { setHistoryError(true); return null; }
    },
  );
  const question = createMemo(() => props.unit.questions[questionIndex()]);
  const progress = createMemo(() => ((questionIndex() + (finished() ? 1 : 0)) / props.unit.questions.length) * 100);
  const unitLearningProgress = createMemo(() => learningProgress()?.units.find((unit) => unit.id === props.unit.id));
  const currentQuestionHistory = createMemo(() => answerHistory()?.answers.filter((entry) => entry.questionId === question().id) ?? []);
  const currentQuestionHistoryMetadata = createMemo(() => answerHistoryMetadata()?.answers.filter((entry) => entry.questionId === question().id) ?? []);
  const answerHistoryByQuestion = createMemo(() => {
    const entries = answerHistory()?.answers ?? [];
    const knownQuestionIds = new Set(props.unit.questions.map((item) => item.id));
    const current = props.unit.questions.flatMap((item) => {
      const matches = entries.filter((entry) => entry.questionId === item.id);
      return matches.length > 0 ? [{ question: item, entries: matches }] : [];
    });
    const retired = entries.filter((entry) => !knownQuestionIds.has(entry.questionId));
    return { current, retired };
  });

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'reference' || params.get('context') === 'reference') setContextPanel('reference');
    setHydrated(true);
    const escapeContext = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && contextPanel() !== null) {
        event.preventDefault();
        closeContext();
      }
    };
    document.addEventListener('keydown', escapeContext);
    onCleanup(() => document.removeEventListener('keydown', escapeContext));
  });

  function closeContext() {
    setContextPanel(null);
    contextOpener?.focus({ preventScroll: true });
  }

  function openContext(panel: ContextPanel, opener?: HTMLElement, loadNotes = true) {
    if (opener && !contextElement?.contains(opener)) contextOpener = opener;
    setContextPanel(panel);
    if (panel === 'notes' && loadNotes) void loadNote();
    if (window.matchMedia('(max-width: 1240px)').matches) {
      queueMicrotask(() => contextElement?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true }));
    }
  }

  function contextKey(event: KeyboardEvent) {
    const tabs = Array.from(contextElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
    const index = tabs.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    tabs[next]?.click();
    tabs[next]?.focus({ preventScroll: true });
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
    openContext('reference', document.activeElement as HTMLElement);
    setShowHint(false);
    setSaveMessage(me()?.authenticated
      ? 'Reference opened. Marked as encountered only; no recall credit was created.'
      : 'Reference opened. Guest mode keeps this encounter on this page only.');
    if (!me()?.authenticated) return;
    try {
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
    } catch { setSaveMessage('Reference opened; encounter evidence could not be saved.'); }
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
        void refetchAnswerHistoryMetadata();
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
    let ratingSaved = false;
    const questionId = question().id;
    const questionPrompt = question().prompt;
    const correction = reflectionMarkdown ? `### Correction — ${questionPrompt}\n\n${reflectionMarkdown}` : '';
    const preferredType = question().kind === 'scenario' ? 'scenario' : 'prompt';
    const card = props.unit.cards.find((candidate) =>
      candidate.type === preferredType &&
      candidate.objective_ids.some((id) => question().objective_ids.includes(id)),
    ) ?? props.unit.cards.find((candidate) => candidate.type === preferredType) ?? props.unit.cards[0];
    if (!card) {
      if (question().id === questionId && saveSequence === sequence) setSaveMessage('Rating kept in memory; no review card is configured.');
      if (correction) {
        setFailedCorrection(correction);
        setCorrectionPending(false);
      }
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
      const scheduled = response.ok;
      ratingSaved = scheduled;
      if (!scheduled) {
        if (question().id === questionId && saveSequence === sequence) setSaveMessage('Rating kept in memory; scheduling failed.');
      } else {
        if (question().id === questionId && saveSequence === sequence) setSaveMessage('Rating scheduled.');
        void refetchLearningProgress();
      }
      if (reflectionMarkdown) {
        setCorrectionPending(true);
        noteMutationSequence += 1;
        const noteResponse = await fetch('/api/notes', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            unitId: props.unit.id,
            markdown: correction,
          }),
        });
        if (noteResponse.ok) {
          noteMutationSequence += 1;
          if (noteLoaded()) {
            if (noteDirty()) setNote((current) => `${current.trimEnd()}\n\n${correction}`.trim());
            else {
              setNoteLoaded(false);
              await loadNote(true);
            }
          }
          if (question().id === questionId && saveSequence === sequence) {
            setSaveMessage(`${scheduled ? 'Rating scheduled.' : 'Rating scheduling failed.'} Correction appended to your private notes.`);
          }
        } else if (question().id === questionId && saveSequence === sequence) {
          setFailedCorrection(correction);
          setSaveMessage(`${scheduled ? 'Rating scheduled.' : 'Rating scheduling failed.'} Correction could not be saved. Move the preserved correction to your Notes draft before continuing.`);
        }
      }
    } catch {
      if (correction) setFailedCorrection(correction);
      if (question().id === questionId && saveSequence === sequence) setSaveMessage(ratingSaved
        ? 'Rating scheduled. Correction save was not confirmed; the correction is preserved below.'
        : `Rating scheduling failed.${correction ? ' Your correction is preserved below.' : ''}`);
    } finally {
      if (correction) setCorrectionPending(false);
    }
  }

  function rate(value: 'again' | 'hard' | 'good' | 'easy') {
    if (noteSaving() || correctionPending() || failedCorrection() || rated()) return;
    const reflectionSnapshot = reflection().trim();
    setRating(value);
    setRated(true);
    if (!me()?.authenticated) return;
    const sequence = ++saveSequence;
    setSaveMessage('Scheduling review…');
    if (reflectionSnapshot) setCorrectionPending(true);
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
    try {
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
    } catch { setTaskMessage('Could not save progress. Your completion was not confirmed; try again.'); }
    finally { setTaskSaving(null); }
  }

  function next() {
    if (correctionPending() || failedCorrection()) return;
    if (questionIndex() + 1 < props.unit.questions.length) {
      setQuestionIndex((value) => value + 1);
      setAnswer('');
      setRevealed(false);
      setRated(false);
      setRating(null);
      setChecked([]);
      setReflection('');
      setShowHint(false);
      setSaveMessage('');
      focusTask(taskHeading);
    } else {
      setFinished(true);
      focusTask(() => lessonHeading);
    }
  }

  async function loadNote(refresh = false) {
    if (!me()?.authenticated || (noteLoaded() && !refresh) || noteLoading()) return;
    const sequence = noteMutationSequence;
    setNoteLoading(true);
    setNoteError('');
    try {
    const response = await fetch('/api/notes?unitId=' + encodeURIComponent(props.unit.id), {
      credentials: 'include',
    });
    if (!response.ok) throw new Error('notes unavailable');
    const data = await response.json() as { markdown: string };
    if (sequence === noteMutationSequence && !noteDirty()) {
      setNote(data.markdown);
      setNoteLoaded(true);
    }
    } catch { setNoteError('Could not load your notes. Your existing notes have not been replaced.'); }
    finally {
      setNoteLoading(false);
      if (sequence !== noteMutationSequence && !noteLoaded() && contextPanel() === 'notes') void loadNote();
    }
  }

  async function moveFailedCorrection(opener: HTMLElement) {
    const correction = failedCorrection();
    if (!correction || correctionPending() || noteSaving() || noteLoading()) return;
    setCorrectionPending(true);
    openContext('notes', opener, false);
    // The notes append endpoint has no idempotency contract. Recover into an
    // editable draft instead of repeating an uncertain POST and duplicating it.
    try {
      await loadNote();
      if (!noteLoaded()) {
        setSaveMessage('Your correction is preserved. Retry moving it after Notes can be loaded.');
        return;
      }
      if (!note().includes(correction)) setNote((current) => `${current.trimEnd()}\n\n${correction}`.trim());
      setNoteDirty(true);
      setNoteMessage('Correction recovered into this draft. Save note to persist it.');
      setSaveMessage('Correction preserved in your Notes draft. Save note to persist it.');
      setFailedCorrection('');
    } finally { setCorrectionPending(false); }
  }

  async function saveNote() {
    if (!me()?.authenticated || !noteLoaded() || noteLoading() || noteSaving() || correctionPending()) return;
    setNoteSaving(true);
    setNoteMessage('Saving…');
    try {
    const response = await fetch('/api/notes', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unitId: props.unit.id, markdown: note() }),
    });
    setNoteMessage(response.ok ? 'Saved privately.' : 'Could not save.');
    if (response.ok) setNoteDirty(false);
    } catch { setNoteMessage('Could not save. Your draft is still here; try again.'); }
    finally { setNoteSaving(false); }
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
        <div class="study-workspace-bar">
          <strong>Study workspace</strong>
          <div class="study-context-actions" role="group" aria-label="Learning context">
            <For each={['history', 'reference', 'notes'] as ContextPanel[]}>{(panel) => (
              <button type="button" aria-controls="learning-context-panel" aria-expanded={contextPanel() === panel} aria-pressed={contextPanel() === panel} onClick={(event) => openContext(panel, event.currentTarget)}>{panel[0]!.toUpperCase() + panel.slice(1)}</button>
            )}</For>
          </div>
          <span>Retrieval first. Context opens beside your work without leaving the question.</span>
        </div>
      </header>

      <div class="study-layout shell">
        <aside class="study-rail" aria-label="Unit context">
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
          <Show when={authError()}>
            <p class="workspace-message" role="status">Could not verify sign-in. This attempt stays in memory. <button type="button" class="text-button" onClick={() => void refetchMe()}>Retry sign-in check</button></p>
          </Show>
          <div class="learning-status-slot" data-testid="learning-status-slot" aria-busy={me.loading || learningProgress.loading}>
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
          <Show when={!unitLearningProgress() && !me.loading && !learningProgress.loading && !progressError()}>
            <section class="unit-learning-status" aria-label="Session progress">
              <div><span>This session</span><strong>{finished() ? 'Questions complete' : `Question ${questionIndex() + 1} of ${props.unit.questions.length}`}</strong><small>Your explanation stays in this workspace.</small></div>
              <div><span>Learning record</span><strong>{me()?.authenticated ? 'No saved progress yet' : 'Memory only'}</strong><small>{me()?.authenticated ? 'Saved evidence appears here after your attempt.' : 'Guest activity stays on this page and does not change mastery.'}</small></div>
            </section>
          </Show>
          <Show when={me.loading || learningProgress.loading}><p class="workspace-message" role="status">Loading learning progress…</p></Show>
          <Show when={progressError()}><p class="workspace-message" role="status">Progress is unavailable. <button type="button" class="text-button" onClick={() => void refetchLearningProgress()}>Retry progress</button></p></Show>
          </div>
          <div class="study-surface" data-testid="study-surface">
            <Show when={!finished()}>
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
            <h2 ref={taskHeading} tabindex="-1" id="question-title">{question().prompt}</h2>
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
              <aside class="answer-history-cue" data-testid="answer-history-cue" aria-label="Previous answer history">
                <Show when={hydrated() && !me.loading && !answerHistoryMetadata.loading} fallback={
                  <div class="history-status-loading" aria-live="polite">
                    <strong>Checking your recall history…</strong>
                    <span>The workspace reserves this space so loading does not move the answer controls.</span>
                  </div>
                }>
                  <Show when={me()?.authenticated} fallback={
                    <div>
                      <strong>Guest study</strong>
                      <span>Previous answers are available only to the signed-in owner.</span>
                    </div>
                  }>
                    <Show when={!metadataError()} fallback={<div><strong>History unavailable</strong><button type="button" class="text-button" onClick={() => void refetchAnswerHistoryMetadata()}>Retry recall history</button></div>}>
                    <Show when={currentQuestionHistoryMetadata().length > 0} fallback={
                      <div>
                        <strong>Fresh recall</strong>
                        <span>No previous saved attempt for this question.</span>
                      </div>
                    }>
                      <div>
                        <strong>Answered before</strong>
                        <span>
                          {currentQuestionHistoryMetadata().length} saved {currentQuestionHistoryMetadata().length === 1 ? 'attempt' : 'attempts'}
                          {' · '}latest {new Date(currentQuestionHistoryMetadata()[0]!.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <button type="button" class="text-button" onClick={(event) => openContext('history', event.currentTarget)}>Review previous answers</button>
                    </Show>
                    </Show>
                  </Show>
                </Show>
                <small>Previous wording stays hidden until you explicitly open History.</small>
              </aside>
              <div class="stage-actions">
                <button class="button primary" disabled={!hydrated() || me.loading || !answer().trim()} onClick={reveal}>
                  {me()?.authenticated ? 'Save privately & reveal' : 'Reveal & compare'}
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
                      disabled={rated()}
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
                  disabled={rated()}
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
                  <Show when={failedCorrection()}>
                    <div class="workspace-message" data-testid="correction-recovery">
                      <p>Your correction is still preserved in the explanation above. Move it into Notes before continuing.</p>
                      <button class="button" type="button" data-testid="correction-move-to-notes" disabled={correctionPending() || noteLoading() || noteSaving()} onClick={(event) => void moveFailedCorrection(event.currentTarget)}>Move correction to Notes</button>
                    </div>
                  </Show>
                  <div class="stage-actions">
                    <button class="button primary" disabled={correctionPending() || Boolean(failedCorrection())} onClick={next}>
                      {questionIndex() + 1 < props.unit.questions.length ? 'Next question' : 'Open the lesson'}
                    </button>
                    <span class="save-status" role="status">{saveMessage()}</span>
                  </div>
                </>
              }>
                <div class="rating-block">
                  <p>How effortful was accurate recall?</p>
                  <div class="rating-buttons" role="group" aria-label="Recall rating">
                    <button disabled={noteSaving()} onClick={() => rate('again')}>Again</button>
                    <button disabled={noteSaving()} onClick={() => rate('hard')}>Hard</button>
                    <button disabled={noteSaving()} onClick={() => rate('good')}>Good</button>
                    <button disabled={noteSaving()} onClick={() => rate('easy')}>Easy</button>
                  </div>
                  <span class="save-status" role="status">{saveMessage()}</span>
                </div>
              </Show>
            </Show>
            </section>
            </Show>

            <Show when={finished()}>
              <article class="lesson">
              <div ref={lessonHeading} tabindex="-1" class="lesson-divider"><span>Lesson revealed</span></div>
              <ReferenceVisuals visuals={props.unit.visuals} />
              <div class="markdown-body" innerHTML={props.unit.lessonHtml} />
              <div class="completion-action">
                <button
                  type="button"
                  class="completion-toggle"
                  aria-pressed={taskIsCompleted('lesson', 'lesson')}
                  disabled={taskSaving() !== null || learningProgress.loading || progressError()}
                  onClick={() => setTaskCompleted('lesson', 'lesson', !taskIsCompleted('lesson', 'lesson'))}
                >
                  {taskIsCompleted('lesson', 'lesson') ? 'Lesson read ✓' : 'Mark lesson read'}
                </button>
                <span>{taskMessage()}</span>
              </div>
            </article>

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
                      disabled={taskSaving() !== null || learningProgress.loading || progressError()}
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

        <aside
          ref={contextElement}
          id="learning-context-panel"
          class="learning-context"
          classList={{ 'is-open': contextPanel() !== null }}
          aria-label="Learning context"
          data-testid="learning-context"
        >
          <div class="learning-context-head">
            <div>
              <span class="section-kicker">Learning context</span>
              <strong>
                {contextPanel() === 'history' ? 'Previous answers'
                  : contextPanel() === 'reference' ? 'Reference'
                    : contextPanel() === 'notes' ? 'Private notes'
                      : 'Stay on the question'}
              </strong>
            </div>
            <button
              type="button"
              class="context-close"
              aria-label="Close learning context"
              disabled={contextPanel() === null}
              onClick={closeContext}
            >×</button>
          </div>
          <div class="learning-context-tabs" role="tablist" aria-label="Context tools" onKeyDown={contextKey}>
            <For each={['history', 'reference', 'notes'] as ContextPanel[]}>{(panel) => (
              <button type="button" role="tab" id={`context-tab-${panel}`} aria-controls={`context-${panel}`} tabindex={contextPanel() === panel || (contextPanel() === null && panel === 'history') ? 0 : -1} aria-selected={contextPanel() === panel} onClick={() => openContext(panel)}>{panel[0]!.toUpperCase() + panel.slice(1)}</button>
            )}</For>
          </div>
          <div class="learning-context-body">
            <Show when={contextPanel() !== null} fallback={
              <div class="context-empty">
                <p>Open context only when you need it. The question and your draft stay exactly where they are.</p>
                <small>History is intentionally closed during fresh recall so previous wording does not leak into the attempt.</small>
              </div>
            }>
              <Show when={contextPanel() === 'history'}>
                <section role="tabpanel" id="context-history" aria-labelledby="context-tab-history">
                  <h2 id="context-history-title">Your explanations</h2>
                  <p class="answer-history-intro">Every saved attempt for this unit, newest first. Opening this panel is explicit and does not change your Study state.</p>
                  <Show when={me()?.authenticated} fallback={
                    <p class="guest-note">Sign in as the allowlisted owner to access private answer history.</p>
                  }>
                    <Show when={!answerHistory.loading} fallback={<p class="guest-note">Loading saved explanations…</p>}>
                      <Show when={!historyError()} fallback={<div data-testid="history-error"><p role="status">Saved explanations are unavailable.</p><button type="button" class="button" onClick={() => void refetchAnswerHistory()}>Retry saved explanations</button></div>}>
                      <Show when={answerHistoryByQuestion().current.length > 0 || answerHistoryByQuestion().retired.length > 0} fallback={
                        <p class="guest-note">No saved explanations for this unit yet.</p>
                      }>
                        <div class="answer-history-question-list">
                          <For each={answerHistoryByQuestion().current}>{({ question: item, entries }) => (
                            <section class="answer-history-question">
                              <div class="answer-history-question-head">
                                <strong>{item.prompt}</strong>
                                <small>{entries.length} saved {entries.length === 1 ? 'attempt' : 'attempts'}</small>
                              </div>
                              <div class="answer-history-list">
                                <For each={entries}>{(entry, index) => (
                                  <article>
                                    <div>
                                      <span>{index() === 0 ? 'Latest' : `Previous ${index()}`}</span>
                                      <small>{new Date(entry.createdAt).toLocaleString()} · revision {entry.unitRevision}</small>
                                    </div>
                                    <p class="preserve-lines">{entry.answerMarkdown}</p>
                                  </article>
                                )}</For>
                              </div>
                            </section>
                          )}</For>
                          <Show when={answerHistoryByQuestion().retired.length > 0}>
                            <section class="answer-history-question">
                              <div class="answer-history-question-head">
                                <strong>Earlier content revisions</strong>
                                <small>{answerHistoryByQuestion().retired.length} saved {answerHistoryByQuestion().retired.length === 1 ? 'attempt' : 'attempts'}</small>
                              </div>
                              <p class="answer-history-intro">Preserved answers whose question IDs are no longer in the current revision.</p>
                              <div class="answer-history-list">
                                <For each={answerHistoryByQuestion().retired}>{(entry) => (
                                  <article>
                                    <div>
                                      <span>{entry.questionId}</span>
                                      <small>{new Date(entry.createdAt).toLocaleString()} · revision {entry.unitRevision}</small>
                                    </div>
                                    <p class="preserve-lines">{entry.answerMarkdown}</p>
                                  </article>
                                )}</For>
                              </div>
                            </section>
                          </Show>
                        </div>
                      </Show>
                      </Show>
                    </Show>
                  </Show>
                </section>
              </Show>

              <Show when={contextPanel() === 'reference'}>
                <section role="tabpanel" id="context-reference" class="context-reference" aria-labelledby="context-tab-reference">
                  <div class="context-reference-intro">
                    <h2 id="context-reference-title">Build or inspect the model</h2>
                    <p>Use this without leaving the current question. Reading here creates no recall evidence.</p>
                  </div>
                  <details class="feedback-depth reference-models" data-testid="reference-models">
                    <summary>Visual models ({props.unit.visuals.length})</summary>
                    <ReferenceVisuals visuals={props.unit.visuals} />
                  </details>
                  <ReferenceMarkdown html={props.unit.lessonHtml} />
                </section>
              </Show>

              <Show when={contextPanel() === 'notes'}>
                <section role="tabpanel" id="context-notes" class="context-notes" aria-labelledby="context-tab-notes">
                  <h2 id="context-notes-title">What changed in your mental model?</h2>
                  <Show when={me()?.authenticated} fallback={
                    <p class="guest-note">Sign in as the allowlisted owner to keep per-unit Markdown notes.</p>
                  }>
                    <Show when={noteLoading()}><p role="status" data-testid="notes-loading">Loading your private notes…</p></Show>
                    <Show when={noteError()}><div data-testid="notes-error"><p role="status">{noteError()}</p><button type="button" class="button" disabled={noteLoading()} onClick={() => void loadNote()}>Retry loading notes</button></div></Show>
                    <label class="answer-label" for="private-unit-note">Private unit notes</label>
                    <textarea
                      id="private-unit-note"
                      disabled={!noteLoaded() || noteLoading() || noteSaving() || correctionPending()}
                      rows={10}
                      value={note()}
                      onInput={(event) => { setNote(event.currentTarget.value); setNoteDirty(true); }}
                      placeholder="Write a correction, connection, or question in Markdown."
                    />
                    <div class="stage-actions">
                      <button class="button primary" disabled={!noteLoaded() || noteLoading() || noteSaving() || correctionPending()} onClick={saveNote}>Save note</button>
                      <span role="status">{noteMessage()}</span>
                    </div>
                  </Show>
                </section>
              </Show>
            </Show>
          </div>
        </aside>
      </div>
    </div>
  );
}
