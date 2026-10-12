import { createSignal, For, onMount } from 'solid-js';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import { axisVector } from '@/lib/anatomy/vendor/iso-kit';
import ChangeReport, { type Change } from '../shared/ChangeReport';
import ManifestPanel from '../shared/ManifestPanel';
import StateBadge from '../shared/StateBadge';
import {
  actorNames, actors, checkpointReport, completionOf, inspectionReport, LATCH_TRAVEL, manifest,
  objectIds, objectRow, ownerRow, resetReport, stages, witnessDrawer, witnesses, witnessState,
  type ActorId, type WitnessId,
} from './model';
import { assemblies, consoleFront, foundation, indexShoe, projection } from './geometry';
import './figure.css';

/** Exponential follow toward a goal; snaps to it once within epsilon. */
function follow(at: number, goal: number, blend: number, epsilon: number) {
  const next = at + (goal - at) * blend;
  return Math.abs(goal - next) < epsilon ? goal : next;
}

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  onMount(() => setHydrated(true));
  let root: HTMLDivElement | undefined;
  let shoe: SVGGElement | undefined;
  let cartridge: SVGGElement | undefined;
  const drawers: Partial<Record<ActorId, SVGGElement>> = {};
  const latches: Partial<Record<WitnessId, SVGGElement>> = {};
  // `stage` is the settled checkpoint; `selected` is the inspected actor. They never share a signal.
  const [stage, setStage] = createSignal(0);
  const [selected, setSelected] = createSignal<ActorId>('api');
  const [open, setOpen] = createSignal(false);
  const [moving, setMoving] = createSignal(false);
  const [report, setReport] = createSignal<Change>(checkpointReport(0));
  // `target` drives the carriage and latches while moving; `pending` is the final report, shown when it settles.
  let target = 0;
  let pending: Change | undefined;
  let indexPosition = 0;
  const drawerPositions = actors.map(() => 0);
  const latchPositions = witnesses.map(() => 0);
  const alongX = axisVector(projection, [1, 0, 0]);
  const alongY = axisVector(projection, [0, 1, 0]);
  const inspected = () => actors.find((actor) => actor.id === selected())!;
  const actingDrawers = () => stages[stage()]!.actors.map(witnessDrawer);

  const wake = createAnatomyMotion(() => root, (seconds, reduced) => {
    const blend = reduced ? 1 : 1 - Math.exp(-seconds / .16);
    let unsettled = false;
    const settle = (at: number, goal: number, epsilon: number) => {
      const value = follow(at, goal, blend, epsilon);
      if (value !== goal) unsettled = true;
      return value;
    };
    const indexTarget = target * 30;
    indexPosition = settle(indexPosition, indexTarget, .06);
    shoe?.setAttribute('transform', `translate(${alongX[0] * indexPosition} ${alongX[1] * indexPosition})`);
    actors.forEach((actor, i) => {
      drawerPositions[i] = settle(drawerPositions[i]!, open() && selected() === actor.id ? 20 : 0, .03);
      drawers[actor.id]?.setAttribute('transform', `translate(${alongY[0] * drawerPositions[i]!} ${alongY[1] * drawerPositions[i]!})`);
    });
    witnesses.forEach((witness, i) => {
      latchPositions[i] = settle(latchPositions[i]!, target >= completionOf(witness.id) ? LATCH_TRAVEL : 0, .03);
      latches[witness.id]?.setAttribute('transform', `translate(${alongX[0] * latchPositions[i]!} ${alongX[1] * latchPositions[i]!})`);
      if (witness.id === 'runtime') {
        const extension = 12 * (1 - latchPositions[i]! / LATCH_TRAVEL);
        cartridge?.setAttribute('transform', `translate(${alongY[0] * extension} ${alongY[1] * extension})`);
      }
    });
    if (!unsettled) {
      setStage(target);
      if (pending) setReport(pending);
      pending = undefined;
      setMoving(false);
    }
    return unsettled;
  });

  onMount(() => {
    cartridge = root?.querySelector<SVGGElement>('[data-runtime-cartridge]') ?? undefined;
    wake();
  });

  function begin(final: Change) {
    // Reduced motion resolves synchronously inside wake(), so the final report replaces this at once.
    pending = final;
    setReport({ ...final, title: `Moving · ${final.title}` });
    setMoving(true);
    wake();
  }
  function next() {
    if (moving() || stage() === stages.length - 1) return;
    target = stage() + 1;
    begin(checkpointReport(target));
  }
  function reset() {
    target = 0;
    begin(resetReport());
  }
  function inspect(id: ActorId) {
    setSelected(id);
    setOpen(false);
    begin(inspectionReport(id, 'select'));
  }
  function toggleDrawer() {
    const opening = !open();
    setOpen(opening);
    begin(inspectionReport(selected(), opening ? 'open' : 'close'));
  }

  return (
    <div class="anatomy-figure cluster-console" ref={root} aria-busy={!hydrated()}>
      <div class="anatomy-figure-header"><span>FIG 01 · RESPONSIBILITY CONSOLE</span><span>One Deployment · one replica · node-a</span></div>
      <p class="cc-purpose">A declared Deployment becomes running containers only through a chain of owners. Each checkpoint names who acted, what they wrote and what has not happened yet.</p>
      <div class="anatomy-bench">
      <div class="anatomy-bench-object">
      <svg class="iso-svg" viewBox="0 0 760 490" role="img" aria-labelledby="cluster-console-title cluster-console-desc">
        <title id="cluster-console-title">Kubernetes cluster responsibility console</title>
        <desc id="cluster-console-desc">An open four-drawer control-plane rack beside a two-tray node chassis. The tinted drawer is the checkpoint actor and a heavier outline marks the inspected actor. Each owner has its own witness latch: a latch shifts when that owner has acted, and the Deployment and ReplicaSet controllers have separate latches on one tray. The ruler carriage shows the checkpoint index. The drawing is an analogy, not the real software topology.</desc>
        <g innerHTML={foundation} />
        <For each={assemblies}>{(assembly) => <>
          <g innerHTML={assembly.shelf} />
          <g class="cc-assembly" data-assembly={assembly.id}
            data-acting={actingDrawers().includes(assembly.id) ? 'true' : 'false'}
            data-inspected={selected() === assembly.id ? 'true' : 'false'}
            ref={(element) => { drawers[assembly.id] = element; }}>
            <g innerHTML={assembly.tray} />
            <For each={assembly.latches}>{(latch) => <g class="cc-witness" data-witness={latch.id}
              data-state={witnessState(stage(), latch.id)}
              ref={(element) => { latches[latch.id] = element; }} innerHTML={latch.svg} />}</For>
          </g>
        </>}</For>
        <g innerHTML={consoleFront} />
        <g ref={shoe} innerHTML={indexShoe} />
      </svg>
      <div class="anatomy-controls cc-inspect">
        <label for="cluster-actor">Inspect actor
          <select id="cluster-actor" value={selected()} disabled={!hydrated() || moving()} onChange={(event) => inspect(event.currentTarget.value as ActorId)}>
            <For each={actors}>{(actor) => <option value={actor.id} selected={selected() === actor.id}>{actor.name}</option>}</For>
          </select>
        </label>
        <button type="button" disabled={!hydrated() || moving()} onClick={toggleDrawer}>{open() ? 'Close inspection drawer' : 'Open inspection drawer'}</button>
      </div>
      <div class="cc-inspection">
        <p><strong>{inspected().name}</strong> · {inspected().location} · <span class="cc-muted">view only, not the checkpoint actor</span></p>
        <p>{inspected().role}</p>
      </div>
      <ul class="anatomy-legend">
        <li>Tinted drawer: checkpoint actor (acting now)</li>
        <li>Accent latch: owner acting now</li>
        <li>Shifted latch: that owner has acted</li>
        <li>Heavy outline: inspected actor (view only)</li>
        <li>Ruler shoe: checkpoint index, not traffic</li>
      </ul>
      </div>
      <div class="anatomy-bench-panel">
      <div class="anatomy-controls">
        <button type="button" data-anatomy-primary onClick={next} disabled={!hydrated() || moving() || stage() === stages.length - 1}>Next checkpoint</button>
        <button type="button" onClick={reset} disabled={!hydrated()}>Reset to draft</button>
        <span class="cc-muted cc-progress">Checkpoint {stage()} of {stages.length - 1} · actor: <strong>{actorNames(stage())}</strong></span>
      </div>
      <ChangeReport change={report()} busy={moving()} />
      <div class="anatomy-status-columns" data-anatomy-status>
      <section class="cc-objects" aria-label="API objects and their state at this checkpoint">
        <h3 class="anatomy-panel-heading">Objects</h3>
        <ul class="anatomy-status-list">
          <For each={[...objectIds]}>{(id) => <li data-object={id}>
            <span class="cc-identity">{objectRow(stage(), id).identity}</span>
            <StateBadge tone={objectRow(stage(), id).tone} label={objectRow(stage(), id).label} />
          </li>}</For>
        </ul>
      </section>
      <section class="cc-owners-section" aria-label="Owners, what each acted on and how many it has done">
        <h3 class="anatomy-panel-heading">Owners</h3>
        <ul class="anatomy-status-list cc-owners">
          <For each={witnesses.map((witness) => witness.id)}>{(id) => <li data-witness={id} data-state={witnessState(stage(), id)}>
            <strong>{ownerRow(stage(), id).name}</strong>
            <StateBadge tone={ownerRow(stage(), id).tone} label={ownerRow(stage(), id).label} />
            <span class="anatomy-status-detail">acts on <span class="cc-identity">{ownerRow(stage(), id).identity}</span> · {ownerRow(stage(), id).countLabel}: <strong>{ownerRow(stage(), id).count}</strong></span>
          </li>}</For>
        </ul>
      </section>
      </div>
      </div>
      </div>
      <p class="cc-hint">Next checkpoint advances one step and waits for you. Inspection pulls one drawer for reading only.</p>
      <ManifestPanel
        title="Deployment demo and the objects it produced"
        lines={manifest(stage())}
        note="Highlighted lines are read or produced at the settled checkpoint. Lines starting with # are comments: fields not yet set, or objects not yet created."
      />
      <p class="cc-caption">Fixture assumptions: an accepted request, one replica, node-a eligible, successful image, network and storage setup, and no retries, time scale or application-readiness check. Inspection and Reset change only this view.</p>
      <noscript><p>The object is visible without JavaScript. Enable JavaScript for drawer inspection and checkpoint controls; the complete responsibility trace is explained below.</p></noscript>
    </div>
  );
}
