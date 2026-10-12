import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import { translateAlong } from '@/lib/anatomy/vendor/iso-kit';
import ChangeReport from '@/components/anatomy/shared/ChangeReport';
import ManifestPanel, { type ManifestLine as PanelLine } from '@/components/anatomy/shared/ManifestPanel';
import StateBadge from '@/components/anatomy/shared/StateBadge';
import * as G from './geometry';
import { labelsOf } from './labels';
import * as M from './model';
import './figure.css';

type Channel = 'cellLift' | 'bladeLift' | 'puckX' | 'sledZ';
const CHANNELS: Channel[] = ['cellLift', 'bladeLift', 'puckX', 'sledZ'];

/** Where each moving part belongs for a state. Opacity-only facts are reactive attributes, not eased. */
function targetsOf(next: M.LadderState): Record<Channel, number> {
  const facts = M.factsOf(next);
  return {
    cellLift: facts.container.state === 'running' ? 0 : G.CELL_LIFT,
    bladeLift: M.selectorOf(next) === M.POD_LABEL ? G.BLADE_LIFT : 0,
    puckX: M.listedOf(next, facts) ? G.puckInTrayX : G.puckRestX,
    sledZ: (G.RUNG_Z[next.probe] ?? G.RUNG_Z[0]) - 3,
  };
}

function transformOf(channel: Channel, value: number): string {
  return channel === 'puckX' ? translateAlong(G.P, [value - G.puckRestX, 0, 0]) : translateAlong(G.P, [0, 0, value]);
}

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  onMount(() => {
    setHydrated(true);
    if (stage) {
      observer = new ResizeObserver(([entry]) => setNarrow((entry?.contentRect.width ?? 999) < 560));
      observer.observe(stage);
    }
  });
  onCleanup(() => observer?.disconnect());
  let stage: HTMLDivElement | undefined;
  let observer: ResizeObserver | undefined;
  const [narrow, setNarrow] = createSignal(false);
  const frame = createMemo(() => (narrow() ? G.FRAME_NARROW : G.FRAME));
  const viewBox = () => `${frame().x} ${frame().y} ${frame().w} ${frame().h}`;
  const [state, setState] = createSignal<M.LadderState>(M.initialState());
  const [moving, setMoving] = createSignal(false);
  const facts = createMemo(() => M.factsOf(state()));
  const listed = createMemo(() => M.listedOf(state(), facts()));
  const fix = createMemo(() => M.canApplyFix(state()));
  const scenario = createMemo(() => M.SCENARIOS[state().scenario]);
  const podLabel = createMemo(() => M.podName(state()));
  const manifestLines = createMemo<PanelLine[]>(() => M.manifestOf(state()).map((line) => ({
    text: line.text,
    highlight: M.isHighlighted(state(), line),
  })));

  const first = targetsOf(M.initialState());
  const values: Record<Channel, number> = { ...first };
  const goal: Record<Channel, number> = { ...first };
  const parts: Partial<Record<Channel, SVGGElement>> = {};
  let root: HTMLDivElement | undefined;

  const wake = createAnatomyMotion(() => root, (seconds, reduced) => {
    const blend = reduced ? 1 : 1 - Math.exp(-seconds / .16);
    let remains = false;
    for (const channel of CHANNELS) {
      values[channel] += (goal[channel] - values[channel]) * blend;
      if (Math.abs(goal[channel] - values[channel]) < .05) values[channel] = goal[channel];
      remains ||= values[channel] !== goal[channel];
      parts[channel]?.setAttribute('transform', transformOf(channel, values[channel]));
    }
    if (!remains && moving()) setMoving(false);
    return remains;
  });

  /** Every control stays enabled after hydration. A new target retargets the eased poses mid-flight, so a quick press is never swallowed. */
  function apply(next: M.LadderState) {
    if (next === state()) return;
    setState(next);
    Object.assign(goal, targetsOf(next));
    setMoving(CHANNELS.some((channel) => values[channel] !== goal[channel]));
    wake();
  }

  const rungBadge = (index: number) => {
    if (!state().read[index]) return <StateBadge tone="wait" label="unread" />;
    if (index === scenario().diagnosis) return <StateBadge tone="selected" label="cause" />;
    return <StateBadge tone="info" label="read" />;
  };

  return (
    <div ref={root} class="anatomy-figure ladder-figure" aria-busy={!hydrated()}>
      <div class="anatomy-figure-header"><span>FIG 05 · EVIDENCE LADDER</span><span>Read first, change last</span></div>
      <p class="ladder-purpose">
        A Service call fails and the Pod list shows a status word. Each word is a summary written by one owner.
        Climb the ladder from the symptom to the owner that wrote the fact, then change only the object that owns the fault.
      </p>
      <div class="anatomy-bench">
      <div class="anatomy-bench-object">
      <div ref={stage} class="ladder-stage">
        <svg class="iso-svg" viewBox={viewBox()} role="img" aria-labelledby="ladder-title ladder-description">
          <title id="ladder-title">Evidence ladder over a Pod housing, a gate and a Service tray</title>
          <desc id="ladder-description">A six-rung ladder stands at the back left, with a probe carriage that rides to the last rung read. In the centre a Pod housing holds a container cell: seated when the container is running, raised when it is not. A socket in front shows a seated connector when a node is assigned. A lamp on the housing post is lit when the Pod is Ready. A gate between the housing and a Service tray lifts when the Service selector matches the Pod labels, and an endpoint puck enters the tray only when the EndpointSlice lists the Pod.</desc>
          <g innerHTML={G.haloArt} />
          <g innerHTML={G.benchArt} />
          <g innerHTML={G.ladderArt} />
          <g ref={(el) => { parts.sledZ = el; }} transform={transformOf('sledZ', first.sledZ)}><g innerHTML={G.sledArt} /></g>
          <For each={G.rungLamps}>{(point, index) => <g>
            <circle cx={point[0]} cy={point[1]} r={1.7} class="ladder-lamp-ring" />
            <circle cx={point[0]} cy={point[1]} r={1.1} class="ladder-lamp-fill" opacity={state().read[index()] ? 1 : 0} />
          </g>}</For>
          <g innerHTML={G.housingBackArt} />
          <g innerHTML={G.socketArt} />
          <g class="ladder-connector" opacity={facts().node ? 1 : 0}><g innerHTML={G.connectorArt} /></g>
          <g ref={(el) => { parts.cellLift = el; }} transform={transformOf('cellLift', first.cellLift)} opacity={facts().container.state === 'none' ? 0 : 1}>
            <g innerHTML={G.cellArt} />
          </g>
          <g innerHTML={G.housingFrontArt} />
          <circle cx={G.readyLampAt[0]} cy={G.readyLampAt[1]} r={2.6} class="ladder-ready" opacity={facts().ready ? 1 : 0} />
          <g innerHTML={G.trayFloorArt} />
          <g innerHTML={G.trayBackArt} />
          <g ref={(el) => { parts.puckX = el; }} transform={transformOf('puckX', first.puckX)}><g innerHTML={G.puckArt} /></g>
          <g innerHTML={G.gatePostsArt} />
          <g ref={(el) => { parts.bladeLift = el; }} transform={transformOf('bladeLift', first.bladeLift)}><g innerHTML={G.bladeArt} /></g>
          <g innerHTML={G.trayFrontArt} />
          <g innerHTML={G.leaderArt} />
        </svg>
        <For each={labelsOf(state())}>{(label) => <span
          class={`ladder-tag ladder-${label.kind}`}
          data-read={label.kind === 'rung' ? (label.read ? 'true' : 'false') : undefined}
          style={G.screenAt(label.anchor, frame())}>
          <span class="ladder-long"><For each={label.long}>{(line) => <span>{line}</span>}</For></span>
          <span class="ladder-short">{label.short}</span>
        </span>}</For>
      </div>
      <div class="anatomy-controls ladder-picker">
        <label for="ladder-symptom">Symptom fixture
          <select id="ladder-symptom" value={state().scenario} disabled={!hydrated()}
            onChange={(event) => apply(M.initialState(event.currentTarget.value as M.ScenarioId))}>
            <For each={M.SCENARIO_IDS}>{(id) => <option value={id} selected={state().scenario === id}>{M.SCENARIOS[id].label}</option>}</For>
          </select>
        </label>
      </div>
      <ul class="anatomy-legend ladder-legend">
        <li>Lamp on a rung: read on this object</li>
        <li>Cell seated: container running. Raised: not running</li>
        <li>Connector seated: spec.nodeName set</li>
        <li>Lit lamp: Pod Ready, which is not the same as running</li>
        <li>Gate blade up: the Service object selects the Pod labels</li>
        <li>Puck in tray: EndpointSlice lists the Pod (controller has run, and the Pod is Ready)</li>
      </ul>
      </div>
      <div class="anatomy-bench-panel">
      <fieldset class="ladder-rungs">
        <legend>Read-only rungs in reading order · cause = this rung names the cause</legend>
        <ol>
          <For each={M.RUNGS}>{(rung, index) => <li>
            <button type="button" data-anatomy-primary={index() === 0 ? '' : undefined} disabled={!hydrated()} onClick={() => apply(M.readRung(state(), index()))}>{index() + 1} {rung.title}</button>
            {rungBadge(index())}
          </li>}</For>
        </ol>
      </fieldset>
      <ChangeReport busy={moving()} change={state().change} />
      <div class="ladder-state" data-anatomy-status>
      <div class="ladder-status">
        <StateBadge tone={facts().ready ? 'pass' : 'wait'} label={facts().ready ? 'Ready' : 'Not Ready'} />
        <StateBadge tone={listed() ? 'pass' : 'wait'} label={listed() ? 'Listed in endpoints' : 'Not listed'} />
        <StateBadge tone={M.causeNamed(state()) ? 'selected' : 'info'} label={M.causeNamed(state()) ? 'Cause named' : 'Cause not named'} />
        <StateBadge tone={state().stage === 'settled' ? 'info' : 'wait'} label={M.STAGE_TEXT[state().stage]} />
        <Show when={moving()}><StateBadge tone="info" label="apparatus settling" /></Show>
        <p>STATUS {facts().status} · phase {facts().phase} · RESTARTS {facts().restarts} · node {facts().node ?? '<none>'}</p>
      </div>
        <section class="ladder-objects" aria-label="Pod and Service objects">
          <article class="ladder-object" aria-label="Pod">
            <h3>Pod <code>{podLabel()}</code></h3>
            <dl class="ladder-counts">
              <div><dt>UID</dt><dd>p-{state().generation}</dd></div>
              <div><dt>Node</dt><dd>{facts().node ?? 'unassigned'}</dd></div>
              <div><dt>Ready</dt><dd>{facts().ready ? '1/1' : '0/1'}</dd></div>
              <div><dt>Restarts</dt><dd>{facts().restarts}</dd></div>
            </dl>
            <Show when={state().retired !== null}>
              <p class="ladder-retired">Still listed until its replacement is Ready: {M.nameOf(false, state().retired ?? 1)} (p-{state().retired}).</p>
            </Show>
          </article>
          <article class="ladder-object" aria-label="Service">
            <h3>Service <code>orders-api</code></h3>
            <dl class="ladder-counts">
              <div><dt>Selector</dt><dd>app={M.selectorOf(state())}</dd></div>
              <div><dt>Endpoints</dt><dd>{listed() ? 1 : 0}</dd></div>
            </dl>
          </article>
          <article class="ladder-object" aria-label="Owners">
            <h3>Owners</h3>
            <ul class="ladder-owners">
              <For each={M.ownersOf(state())}>{(row) => <li>{row}</li>}</For>
            </ul>
          </article>
        </section>
      </div>
      <div class="ladder-actions">
        <div class="ladder-action">
          <button type="button" disabled={!hydrated() || !fix().ok} aria-describedby="ladder-fix-desc" onClick={() => apply(M.applyFix(state()))}>Apply fix</button>
          <p id="ladder-fix-desc" class="ladder-note">{scenario().fix.label}</p>
        </div>
        <div class="ladder-action">
          <button type="button" disabled={!hydrated()} aria-describedby="ladder-delete-desc" onClick={() => apply(M.deletePod(state()))}>Delete Pod</button>
          <p id="ladder-delete-desc" class="ladder-note">Destroys this Pod’s events, logs and last container state; the replacement keeps the same spec.</p>
        </div>
        <div class="ladder-action">
          <button type="button" disabled={!hydrated()} onClick={() => apply(M.reconcile(state()))}>Let owners reconcile once</button>
        </div>
        <p class="ladder-lock">{fix().reason} Reading never changes the object; deleting and applying a fix do.</p>
      </div>
      </div>
      </div>
      <ManifestPanel title="Pod and Service YAML (fixture)" lines={manifestLines()}
        note="Highlighted fields are the ones the last action read or changed. Status fields are written by the kubelet and scheduler, not by you." />
      <section class="ladder-ledger" aria-label="Evidence ledger">
        <h3>Evidence ledger <span class="ladder-note">snapshots taken when each rung was read</span></h3>
        <ol>
          <For each={M.RUNGS}>{(rung, index) => <li>
            <strong>{index() + 1}. {rung.title}</strong>
            <code>{rung.command(podLabel())}</code>
            <Show when={state().read[index()]} fallback={<span class="ladder-note">not read on this object</span>}>
              <ul>
                <For each={state().snapshots[index()]?.lines ?? []}>{(line) => <li>{line}</li>}</For>
              </ul>
              <Show when={M.isStale(state(), index())}>
                <StateBadge tone="wait" label="read before the last change" />
              </Show>
            </Show>
          </li>}</For>
        </ol>
      </section>
      <p class="ladder-hint">
        This is an authored fixture, not a live cluster. Reading a rung never changes the Pod. Apply fix unlocks after the rung that names the cause; the owners then act on the changed object.
      </p>
    </div>
  );
}
