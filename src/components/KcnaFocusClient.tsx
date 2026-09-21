import { For, Show, createEffect, createMemo, createResource, createSignal, onMount, onCleanup } from 'solid-js';
import '@/styles/path-guidance.css';

interface UnitSpec {
  id: string;
  slug: string;
  title: string;
  estimatedMinutes: number;
  checkpointId: string;
}

interface CheckpointSpec {
  id: string;
  title: string;
  unitIds: string[];
}

interface Breakdown {
  encountered: number;
  recall: number;
  application: number;
  retention: number;
}

interface ObjectiveProgress {
  id: string;
  title: string;
  score: number;
  state: string;
  struggleCount: number;
  revalidationRequired: boolean;
}

interface UnitProgress {
  id: string;
  slug: string;
  title: string;
  score: number;
  state: string;
  completion: {
    state: 'Not started' | 'In progress' | 'Learned' | 'Completed';
    percent: number;
    questionsCompleted: number;
    questionsTotal: number;
    lessonCompleted: boolean;
    practicesCompleted: number;
    practicesTotal: number;
  };
  understanding: {
    state: string;
    evidenceState: string;
    score: number;
    needsRefresh: boolean;
  };
  breakdown: Breakdown;
  objectives: ObjectiveProgress[];
}

interface ProgressResponse {
  paths: Array<{ id: string; title: string; readiness: number; breakdown: Breakdown }>;
  units: UnitProgress[];
  recentUnitId: string | null;
}

interface ReviewResponse {
  dueCount: number;
}

interface Props {
  units: UnitSpec[];
  checkpoints: CheckpointSpec[];
  compact?: boolean;
  showProgress?: boolean;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

export default function KcnaFocusClient(props: Props) {
  const [autoOpened, setAutoOpened] = createSignal(false);
  const [progressResult, { refetch: retryProgress }] = createResource(() => typeof window !== 'undefined', async () => {
    try {
      const response = await fetch('/api/progress', { credentials: 'include' });
      if (response.status === 401) return { state: 'guest' as const };
      if (!response.ok) return { state: 'error' as const };
      return { state: 'owner' as const, data: await response.json() as ProgressResponse };
    } catch { return { state: 'error' as const }; }
  });
  const progress = () => { const result = progressResult(); return result?.state === 'owner' ? result.data : undefined; };
  const [review, { refetch: retryReview }] = createResource(() => typeof window !== 'undefined', async () => {
    try {
      const response = await fetch('/api/review?path=kcna&limit=1', { credentials: 'include' });
      if (response.status === 401) return { state: 'guest' as const, dueCount: 0 };
      if (!response.ok) return { state: 'error' as const, dueCount: 0 };
      const data = await response.json() as ReviewResponse;
      return { state: 'owner' as const, dueCount: data.dueCount };
    } catch { return { state: 'error' as const, dueCount: 0 }; }
  });
  const [checkpointTouched, setCheckpointTouched] = createSignal(false);
  onMount(() => {
    const hashTarget = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
    if (hashTarget instanceof HTMLDetailsElement && hashTarget.matches('[data-checkpoint]')) hashTarget.open = true;
    const preserveChoice = (event: Event) => {
      if ((event.target as HTMLElement)?.closest('details[data-checkpoint] summary')) setCheckpointTouched(true);
    };
    document.addEventListener('click', preserveChoice, true);
    onCleanup(() => document.removeEventListener('click', preserveChoice, true));
  });

  const progressByUnit = createMemo(() => new Map((progress()?.units ?? []).map((unit) => [unit.id, unit])));
  const pathProgress = createMemo(() => progress()?.paths.find((path) => path.id === 'path:kcna'));

  const nextUnit = createMemo(() => {
    const byUnit = progressByUnit();
    const recent = progress()?.recentUnitId;
    if (recent) {
      const recentSpec = props.units.find((unit) => unit.id === recent);
      const recentProgress = byUnit.get(recent);
      if (recentSpec && (!recentProgress || ['Not started', 'In progress'].includes(recentProgress.completion.state))) {
        return recentSpec;
      }
    }
    const unfinishedCore = props.units.find((unit) => {
      const unitProgress = byUnit.get(unit.id);
      return !unitProgress || ['Not started', 'In progress'].includes(unitProgress.completion.state);
    });
    if (unfinishedCore) return unfinishedCore;
    return [...props.units].sort((a, b) => (byUnit.get(a.id)?.score ?? 0) - (byUnit.get(b.id)?.score ?? 0))[0];
  });

  const checkpointStates = createMemo(() => {
    const byUnit = progressByUnit();
    return new Map(props.checkpoints.map((checkpoint) => {
      const units = checkpoint.unitIds.map((id) => byUnit.get(id));
      const anyStarted = units.some((unit) => unit && unit.completion.state !== 'Not started');
      const allLearned = units.every((unit) => unit && ['Learned', 'Completed'].includes(unit.completion.state));
      const allApplied = units.every((unit) => unit && ['Applied', 'Retained'].includes(unit.understanding.evidenceState));
      const state = allLearned && allApplied ? 'Passed'
        : allLearned ? 'Learned'
          : anyStarted ? 'In progress'
            : 'Not started';
      return [checkpoint.id, state] as const;
    }));
  });

  const weakSpots = createMemo(() => {
    const pathIds = new Set(props.units.map((unit) => unit.id));
    return (progress()?.units ?? [])
      .filter((unit) => pathIds.has(unit.id))
      .flatMap((unit) => unit.objectives.map((objective) => ({ ...objective, unit })))
      .filter((entry) => entry.state !== 'Not started')
      .sort((a, b) => b.struggleCount - a.struggleCount || a.score - b.score)
      .slice(0, 3);
  });

  const completionSummary = createMemo(() => {
    const units = props.units.map((unit) => progressByUnit().get(unit.id));
    return {
      completed: units.filter((unit) => unit?.completion.state === 'Completed').length,
      learned: units.filter((unit) => unit?.completion.state === 'Learned').length,
      inProgress: units.filter((unit) => unit?.completion.state === 'In progress').length,
      total: props.units.length,
    };
  });

  const learnedProgress = createMemo(() => {
    const summary = completionSummary();
    if (!summary.total) return 0;
    return (summary.completed + summary.learned) / summary.total;
  });

  const understandingSummary = createMemo(() => {
    const units = props.units.map((unit) => progressByUnit().get(unit.id));
    return {
      introduced: units.filter((unit) => unit?.understanding.state === 'Introduced').length,
      basics: units.filter((unit) => unit?.understanding.state === 'Understands basics').length,
      applied: units.filter((unit) => unit?.understanding.state === 'Can apply').length,
      retained: units.filter((unit) => unit?.understanding.state === 'Strong / retained').length,
      refresh: units.filter((unit) => unit?.understanding.needsRefresh).length,
    };
  });

  createEffect(() => {
    const result = progressResult();
    const data = progress();
    const fallback = progressResult.loading || !result ? 'Loading…'
      : result.state === 'guest' ? 'Not saved'
        : result.state === 'error' ? 'Unavailable' : null;
    const byUnit = progressByUnit();
    document.querySelectorAll<HTMLElement>('[data-unit-evidence]').forEach((element) => {
      const unit = byUnit.get(element.dataset.unitEvidence ?? '');
      const state = fallback ?? unit?.completion.state ?? 'Not started';
      element.textContent = fallback ?? (state === 'Not started'
        ? 'No prior unit practice'
        : `Prior unit practice · ${unit?.understanding.state ?? 'evidence available'}`);
      element.dataset.state = state.toLowerCase().replaceAll(/\s|\//g, '-');
    });
    const states = checkpointStates();
    document.querySelectorAll<HTMLElement>('[data-checkpoint-progress]').forEach((element) => {
      const state = fallback ?? states.get(element.dataset.checkpointProgress ?? '') ?? 'Not started';
      element.textContent = state;
      element.dataset.state = state.toLowerCase().replaceAll(' ', '-');
    });
    if (data && !autoOpened() && !checkpointTouched() && !window.location.hash) {
      const activeCheckpoint = nextUnit()?.checkpointId;
      document.querySelectorAll<HTMLDetailsElement>('details[data-checkpoint]').forEach((element) => {
        element.open = element.dataset.checkpoint === activeCheckpoint;
      });
      setAutoOpened(true);
    }
  });

  const dueCount = () => review()?.dueCount ?? 0;
  const hasStarted = () => (progress()?.units ?? []).some((unit) => props.units.some((spec) => spec.id === unit.id) && (unit.completion.state !== 'Not started' || unit.understanding.state !== 'No evidence'));
  const learningHref = createMemo(() => {
    const unit = nextUnit();
    if (!unit) return '/kcna';
    return `/learn/${unit.slug}${progressByUnit().get(unit.id)?.completion.lessonCompleted ? '' : '?mode=reference'}`;
  });
  const sessionHref = createMemo(() => {
    const unit = nextUnit();
    if (!unit) return '/kcna';
    if (dueCount() > 0 && progressResult()?.state === 'owner') return `/review?path=kcna&next=${encodeURIComponent(unit.slug)}`;
    return learningHref();
  });

  return (
    <section class="kcna-today path-session" classList={{ 'path-session-compact': props.compact === true }} aria-labelledby="kcna-today-title" data-path-session>
      <div class="kcna-today-main">
        <div class="kcna-session-label">
          <span class="kcna-session-orb" aria-hidden="true">→</span>
          <p class="section-kicker">Your next step</p>
        </div>
        <Show when={nextUnit()} fallback={<h2 id="kcna-today-title">KCNA path complete.</h2>}>
          {(unit) => (
            <>
              <h2 id="kcna-today-title">{unit().title}</h2>
              <p>
                {unit().estimatedMinutes} min · explanation, recall, and guided practice.
              </p>
            </>
          )}
        </Show>
        <div class="kcna-session-actions">
          <a class="button primary" data-session-action href={sessionHref()}>{dueCount() > 0 && progressResult()?.state === 'owner' ? `Review ${dueCount()} due cards` : hasStarted() ? 'Continue learning' : 'Start learning'} →</a>
          <Show when={dueCount() > 0 && progressResult()?.state === 'owner'}>
            <a class="button" href={learningHref()}>Continue learning</a>
          </Show>
        </div>
        <div class="path-session-status" aria-live="polite">
          <Show when={progressResult.loading || !progressResult()}><p>Loading saved progress… You can start learning while it loads.</p></Show>
          <Show when={!progressResult.loading && progressResult()?.state === 'guest'}><p>Guest learning · answers stay only on the current learning page and disappear when you leave it. Sign in as owner to save them.</p></Show>
          <Show when={!progressResult.loading && progressResult()?.state === 'error'}><p>Saved progress could not load. <button type="button" onClick={() => void retryProgress()}>Retry progress</button></p></Show>
          <Show when={!progressResult.loading && progressResult()?.state === 'owner' && !hasStarted()}><p>No KCNA learning progress yet. Start with the first unit.</p></Show>
          <Show when={progressResult()?.state === 'owner' && review.loading}><p>Checking due reviews… You can continue learning while the recommendation updates.</p></Show>
          <Show when={progressResult()?.state === 'owner' && review()?.state === 'error'}><p>Due reviews could not load. <button type="button" onClick={() => void retryReview()}>Retry reviews</button> · <a href="/review?path=kcna">Open Review</a></p></Show>
        </div>
      </div>

      <Show when={props.showProgress !== false && pathProgress()}>
        {(path) => (
          <details class="path-progress-details">
            <summary>Progress details · {completionSummary().completed + completionSummary().learned}/{completionSummary().total} learned · {understandingSummary().retained} retained</summary>
            <p>Learning completion and retained understanding are separate. Reviews supply later recall evidence.</p>
            <div class="kcna-evidence-panel">
            <div class="kcna-path-meter">
              <div>
                <span>Learning path</span>
                <strong>{Math.round(learnedProgress() * 100)}%</strong>
              </div>
              <div class="kcna-path-meter-track" role="progressbar" aria-label="KCNA learned progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(learnedProgress() * 100)}>
                <span style={{ width: `${learnedProgress() * 100}%` }} />
              </div>
            </div>
            <dl class="kcna-progress-summary" aria-label="KCNA learning progress">
              <div><dt>Completed</dt><dd>{completionSummary().completed}/{completionSummary().total}</dd></div>
              <div><dt>Learned</dt><dd>{completionSummary().learned}</dd></div>
              <div><dt>In progress</dt><dd>{completionSummary().inProgress}</dd></div>
              <div><dt>Needs refresh</dt><dd>{understandingSummary().refresh}</dd></div>
            </dl>
            <div class="kcna-readiness-total">
              <span>Understanding evidence</span>
              <strong>{percent(path().readiness)}</strong>
            </div>
            <dl class="kcna-readiness-breakdown">
              <div><dt>Encountered</dt><dd>{percent(path().breakdown.encountered)}</dd></div>
              <div><dt>Recall</dt><dd>{percent(path().breakdown.recall)}</dd></div>
              <div><dt>Applied</dt><dd>{percent(path().breakdown.application)}</dd></div>
              <div><dt>Retained</dt><dd>{percent(path().breakdown.retention)}</dd></div>
            </dl>
            <dl class="kcna-understanding-summary" aria-label="Current understanding states">
              <div><dt>Introduced</dt><dd>{understandingSummary().introduced}</dd></div>
              <div><dt>Basics</dt><dd>{understandingSummary().basics}</dd></div>
              <div><dt>Can apply</dt><dd>{understandingSummary().applied}</dd></div>
              <div><dt>Retained</dt><dd>{understandingSummary().retained}</dd></div>
            </dl>
            <div class="kcna-weak-spots">
              <span class="section-kicker">Weak spots</span>
              <Show when={weakSpots().length} fallback={<p>No weak spots yet. Study a unit to create evidence.</p>}>
                <ol>
                  <For each={weakSpots()}>{(spot) => (
                    <li>
                      <a href={`/learn/${spot.unit.slug}`}>{spot.title}</a>
                      <span>{spot.struggleCount ? `${spot.struggleCount} hard/again · ` : ''}{percent(spot.score)}</span>
                    </li>
                  )}</For>
                </ol>
              </Show>
            </div>
            <a href="/dashboard">Open full progress →</a>
          </div></details>
        )}
      </Show>
    </section>
  );
}
