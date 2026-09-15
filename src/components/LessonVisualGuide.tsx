import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';

interface Props {
  lines: string[];
  title?: string;
  eyebrow?: string;
  components?: Array<{
    name: string;
    location: 'client' | 'control-plane' | 'worker-node' | 'cluster-addon' | 'data-plane' | 'external';
    responsibility: string;
    acts_on: string;
    proof?: string;
  }>;
}

const arrows = new Set(['→', '↓', '←', '↔', '⇒', '⇢']);

function segments(line: string) {
  return line
    .split(/\s*(→|↓|←|↔|⇒|⇢)\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function presentationFrames(lines: string[]) {
  const cleaned = lines.map((line) => line.trim()).filter(Boolean);
  if (cleaned.length !== 1) return cleaned;

  const flow = segments(cleaned[0]!);
  const nodeIndexes = flow.flatMap((part, index) => arrows.has(part) ? [] : [index]);
  if (nodeIndexes.length > 1) {
    return nodeIndexes.map((endIndex) => flow.slice(0, endIndex + 1).join(' '));
  }

  const comparisons = cleaned[0]!.split(/\s+\|\s+/u).map((part) => part.trim()).filter(Boolean);
  return comparisons.length > 1 ? comparisons : cleaned;
}

export default function LessonVisualGuide(props: Props) {
  const frames = createMemo(() => presentationFrames(props.lines));
  const [frame, setFrame] = createSignal(0);
  const [playing, setPlaying] = createSignal(false);
  const [reducedMotion, setReducedMotion] = createSignal(false);
  let timer: number | undefined;
  let stage: HTMLDivElement | undefined;

  const activeLine = createMemo(() => frames()[frame()] ?? '');
  const activeSegments = createMemo(() => segments(activeLine()));

  function stop() {
    if (timer !== undefined && typeof window !== 'undefined') window.clearInterval(timer);
    timer = undefined;
    setPlaying(false);
  }

  function select(index: number) {
    stop();
    setFrame(Math.max(0, Math.min(index, frames().length - 1)));
  }

  function replay() {
    stop();
    setFrame(0);
  }

  function togglePlay() {
    if (playing()) {
      stop();
      return;
    }
    if (typeof window === 'undefined' || frames().length <= 1) return;
    if (frame() >= frames().length - 1) setFrame(0);
    setPlaying(true);
    timer = window.setInterval(() => {
      setFrame((current) => {
        if (current + 1 >= frames().length) {
          stop();
          return current;
        }
        return current + 1;
      });
    }, reducedMotion() ? 1800 : 1250);
  }

  onMount(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(media.matches);
    const update = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    media.addEventListener('change', update);
    onCleanup(() => media.removeEventListener('change', update));
  });

  createEffect(() => {
    props.lines;
    stop();
    setFrame(0);
  });

  createEffect(() => {
    frame();
    if (!stage || reducedMotion()) return;
    stage.animate(
      [
        { opacity: 0.35, transform: 'translateY(5px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
  });

  onCleanup(stop);

  return (
    <section class="lesson-visual-guide" data-testid="lesson-visual-guide" aria-label={props.title ?? 'Visual walkthrough'}>
      <div class="lesson-visual-guide-head">
        <div>
          <span>{props.eyebrow ?? 'Visual walkthrough'}</span>
          <strong>{props.title ?? 'Follow the state change'}</strong>
        </div>
        <span class="lesson-visual-counter">{Math.min(frame() + 1, frames().length)} / {frames().length}</span>
      </div>

      <div ref={stage} class="lesson-visual-stage" data-step={frame()} aria-live="polite">
        <span class="lesson-visual-stage-label">Step {String(frame() + 1).padStart(2, '0')}</span>
        <div class="lesson-visual-flow">
          <For each={activeSegments()}>{(part) => (
            <Show when={arrows.has(part)} fallback={<code class="lesson-visual-node">{part}</code>}>
              <span class="lesson-visual-arrow" aria-hidden="true">{part}</span>
            </Show>
          )}</For>
        </div>
      </div>

      <Show when={(props.components?.length ?? 0) > 0}>
        <section class="lesson-component-map" aria-label="Component responsibility map">
          <div class="lesson-component-map-head">
            <span>Where the work happens</span>
            <small>Location · owner · responsibility · target</small>
          </div>
          <div class="lesson-component-grid">
            <For each={props.components ?? []}>{(component) => (
              <article class="lesson-component-card" data-location={component.location}>
                <span class="lesson-component-location">{component.location.replace('-', ' ')}</span>
                <strong>{component.name}</strong>
                <p>{component.responsibility}</p>
                <dl>
                  <div>
                    <dt>Works on</dt>
                    <dd>{component.acts_on}</dd>
                  </div>
                  <Show when={component.proof}>
                    {(proof) => (
                      <div>
                        <dt>Proof</dt>
                        <dd><code>{proof()}</code></dd>
                      </div>
                    )}
                  </Show>
                </dl>
              </article>
            )}</For>
          </div>
        </section>
      </Show>

      <ol class="lesson-visual-rail" aria-label="Visual model steps">
        <For each={frames()}>{(line, index) => (
          <li data-state={index() < frame() ? 'past' : index() === frame() ? 'current' : 'future'}>
            <button
              type="button"
              aria-current={index() === frame() ? 'step' : undefined}
              onClick={() => select(index())}
            >
              <span>{String(index() + 1).padStart(2, '0')}</span>
              <span>{line}</span>
            </button>
          </li>
        )}</For>
      </ol>

      <div class="lesson-visual-controls" aria-label="Visual walkthrough controls">
        <button type="button" onClick={() => select(frame() - 1)} disabled={frame() === 0}>← Back</button>
        <button type="button" onClick={togglePlay} disabled={frames().length <= 1} aria-pressed={playing()}>
          {playing() ? 'Pause' : 'Play'}
        </button>
        <button type="button" onClick={() => select(frame() + 1)} disabled={frame() >= frames().length - 1}>Next →</button>
        <button type="button" onClick={replay} disabled={frame() === 0 && !playing()}>Replay</button>
      </div>
    </section>
  );
}
