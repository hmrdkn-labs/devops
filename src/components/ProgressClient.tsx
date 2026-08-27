import { For, Show, createResource } from 'solid-js';

interface Progress {
  paths: Array<{ id: string; title: string; readiness: number }>;
  units: Array<{
    id: string;
    slug: string;
    title: string;
    score: number;
    state: string;
    objectives: Array<{ revalidationRequired?: boolean }>;
  }>;
}

export default function ProgressClient(props: { compact?: boolean }) {
  const [progress] = createResource(() => typeof window !== 'undefined', async () => {
    const response = await fetch('/api/progress', { credentials: 'include' });
    if (!response.ok) return null;
    return response.json() as Promise<Progress>;
  });

  return (
    <Show when={progress()} fallback={
      <div class="guest-progress">
        <span class="status-dot" />
        Guest progress is memory-only. Sign in as owner to build readiness evidence.
      </div>
    }>
      {(data) => (
        <div class={props.compact ? 'progress-compact' : 'progress-dashboard'}>
          <For each={data().paths}>{(path) => (
            <section class="readiness-hero">
              <div>
                <p class="section-kicker">readiness-v1</p>
                <h2>{path.title}</h2>
              </div>
              <strong>{Math.round(path.readiness * 100)}%</strong>
              <div class="readiness-bar" aria-label={'Path readiness ' + Math.round(path.readiness * 100) + '%'}>
                <span style={{ width: path.readiness * 100 + '%' }} />
              </div>
            </section>
          )}</For>
          <Show when={!props.compact}>
            <div class="progress-units">
              <For each={data().units}>{(unit) => (
                <a href={'/learn/' + unit.slug} class="progress-unit">
                  <div>
                    <span>{unit.state}</span>
                    <h3>{unit.title}</h3>
                  </div>
                  <strong>{Math.round(unit.score * 100)}%</strong>
                  <Show when={unit.objectives.some((objective) => objective.revalidationRequired)}>
                    <small>Revalidation due</small>
                  </Show>
                </a>
              )}</For>
            </div>
          </Show>
        </div>
      )}
    </Show>
  );
}
