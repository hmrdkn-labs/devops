import { For, Show, createEffect, createMemo, createResource, createSignal } from 'solid-js';

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
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

export default function KcnaFocusClient(props: Props) {
  const [autoOpened, setAutoOpened] = createSignal(false);
  const [progress] = createResource(() => typeof window !== 'undefined', async () => {
    const response = await fetch('/api/progress', { credentials: 'include' });
    if (!response.ok) return null;
    return response.json() as Promise<ProgressResponse>;
  });
  const [review] = createResource(() => typeof window !== 'undefined', async () => {
    const response = await fetch('/api/review?path=kcna&limit=50', { credentials: 'include' });
    if (!response.ok) return null;
    return response.json() as Promise<ReviewResponse>;
  });

  const progressByUnit = createMemo(() => new Map((progress()?.units ?? []).map((unit) => [unit.id, unit])));
  const pathProgress = createMemo(() => progress()?.paths.find((path) => path.id === 'path:kcna'));

  const nextUnit = createMemo(() => {
    const byUnit = progressByUnit();
    const recent = progress()?.recentUnitId;
    if (recent) {
      const recentSpec = props.units.find((unit) => unit.id === recent);
      const recentProgress = byUnit.get(recent);
      if (recentSpec && (!recentProgress || recentProgress.objectives.some((objective) => objective.state === 'Not started'))) {
        return recentSpec;
      }
    }
    const unencountered = props.units.find((unit) => {
      const unitProgress = byUnit.get(unit.id);
      return !unitProgress || unitProgress.objectives.some((objective) => objective.state === 'Not started');
    });
    if (unencountered) return unencountered;
    return [...props.units].sort((a, b) => (byUnit.get(a.id)?.score ?? 0) - (byUnit.get(b.id)?.score ?? 0))[0];
  });

  const checkpointStates = createMemo(() => {
    const byUnit = progressByUnit();
    return new Map(props.checkpoints.map((checkpoint) => {
      const units = checkpoint.unitIds.map((id) => byUnit.get(id));
      const anyStarted = units.some((unit) => unit && unit.objectives.some((objective) => objective.state !== 'Not started'));
      const allEncountered = units.every((unit) => unit && unit.objectives.every((objective) => objective.state !== 'Not started'));
      const allApplied = units.every((unit) => unit && ['Applied', 'Retained'].includes(unit.state));
      const average = units.reduce((sum, unit) => sum + (unit?.score ?? 0), 0) / Math.max(1, units.length);
      const state = allApplied ? 'Passed'
        : allEncountered && average >= 0.38 ? 'Ready for checkpoint'
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

  createEffect(() => {
    const data = progress();
    if (!data) return;
    const byUnit = progressByUnit();
    document.querySelectorAll<HTMLElement>('[data-unit-progress]').forEach((element) => {
      const unit = byUnit.get(element.dataset.unitProgress ?? '');
      element.textContent = unit?.state ?? 'Not started';
      element.dataset.state = (unit?.state ?? 'Not started').toLowerCase().replaceAll(' ', '-');
    });
    const states = checkpointStates();
    document.querySelectorAll<HTMLElement>('[data-checkpoint-progress]').forEach((element) => {
      const state = states.get(element.dataset.checkpointProgress ?? '') ?? 'Not started';
      element.textContent = state;
      element.dataset.state = state.toLowerCase().replaceAll(' ', '-');
    });
    if (!autoOpened()) {
      const activeCheckpoint = nextUnit()?.checkpointId;
      document.querySelectorAll<HTMLDetailsElement>('details[data-checkpoint]').forEach((element) => {
        element.open = element.dataset.checkpoint === activeCheckpoint;
      });
      setAutoOpened(true);
    }
  });

  const dueCount = () => review()?.dueCount ?? 0;
  const sessionHref = createMemo(() => {
    const unit = nextUnit();
    if (!unit) return '/kcna';
    if (dueCount() > 0) return `/review?path=kcna&next=${encodeURIComponent(unit.slug)}`;
    return `/learn/${unit.slug}`;
  });

  return (
    <section class="kcna-today" aria-labelledby="kcna-today-title">
      <div class="kcna-today-main">
        <p class="section-kicker">Today's session</p>
        <Show when={nextUnit()} fallback={<h2 id="kcna-today-title">KCNA path complete.</h2>}>
          {(unit) => (
            <>
              <h2 id="kcna-today-title">Continue: {unit().title}</h2>
              <p>
                {dueCount() > 0 ? `${dueCount()} KCNA reviews due first · ` : ''}
                {unit().estimatedMinutes} min learning unit · guided practice after the explanation.
              </p>
            </>
          )}
        </Show>
        <div class="kcna-session-actions">
          <a class="button primary" href={sessionHref()}>Start focused session →</a>
          <a class="button" href="/review?path=kcna">Review KCNA only</a>
        </div>
      </div>

      <Show when={pathProgress()} fallback={
        <div class="kcna-session-guest">
          <strong>Guest mode</strong>
          <p>Start anywhere. Sign in as owner when you want resume, weak-spot, and readiness evidence.</p>
        </div>
      }>
        {(path) => (
          <div class="kcna-evidence-panel">
            <div class="kcna-readiness-total">
              <span>readiness-v1</span>
              <strong>{percent(path().readiness)}</strong>
            </div>
            <dl class="kcna-readiness-breakdown">
              <div><dt>Encountered</dt><dd>{percent(path().breakdown.encountered)}</dd></div>
              <div><dt>Recall</dt><dd>{percent(path().breakdown.recall)}</dd></div>
              <div><dt>Applied</dt><dd>{percent(path().breakdown.application)}</dd></div>
              <div><dt>Retained</dt><dd>{percent(path().breakdown.retention)}</dd></div>
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
          </div>
        )}
      </Show>
    </section>
  );
}
