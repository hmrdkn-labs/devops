import { createMemo, createSignal, For, onMount } from 'solid-js';
import ChangeReport, { type Change } from '@/components/anatomy/shared/ChangeReport';
import ManifestPanel from '@/components/anatomy/shared/ManifestPanel';
import StateBadge from '@/components/anatomy/shared/StateBadge';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import * as k from '@/lib/anatomy/vendor/iso-kit';
import { actionLabel, advance, candidates, describe, INITIAL, manifestLines, NODES, type Fixture, type Interaction, type Phase, type Placement } from './model';
import { checkStatus, filterStatus, idleReport, pendingReport, placementStatus, scoreText, settledReport } from './report';
import { CARTRIDGE, CARRIAGE, CENTERS, EXECUTION_LATCH, FLAGS, GAUGE_Y, INITIAL_X, jawOffset, P, REQUEST_JAWS, STATIC, TRACK_LENGTH } from './geometry';
import './figure.css';

const VIEW = { width: 760, height: 440 };
// Dock names sit on the rear support, directly above each dock's back ruler, so identity is adjacent to the object.
const DOCKS = NODES.mixed.map((node, index) => {
  const [x, y] = k.iso([CENTERS[index]!, -100, 9], P);
  return { id: node.id, left: `${(x / VIEW.width) * 100}%`, top: `${(y / VIEW.height) * 100}%` };
});
const KIND: Partial<Record<Phase, Interaction>> = { created: 'filter', filtered: 'score', selected: 'assign', assigned: 'execute' };

// Geometry is constructed at module load. The one loop writes only group and jaw transforms.
export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  onMount(() => setHydrated(true));
  let root: HTMLDivElement | undefined;
  let carriage: SVGGElement | undefined;
  let cartridge: SVGGElement | undefined;
  let latch: SVGGElement | undefined;
  const jawRefs: SVGGElement[][] = [[], [], []];
  const flagRefs: SVGGElement[] = [];
  const [state, setState] = createSignal<Placement>({ ...INITIAL, request: { ...INITIAL.request } });
  const [last, setLast] = createSignal<Interaction | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [report, setReport] = createSignal<Change>(idleReport(INITIAL));
  const results = createMemo(() => candidates(state()));
  // Every per-node status is derived from the committed state, so nothing is shown before its control has committed it.
  const statuses = createMemo(() => results().map((evaluation) => ({
    evaluation,
    filter: filterStatus(state(), evaluation),
    placed: placementStatus(state(), evaluation),
    cpu: checkStatus(state(), evaluation.cpu, 'm'),
    memory: checkStatus(state(), evaluation.memory, 'Mi'),
    score: scoreText(state(), evaluation),
  })));
  // Exactly one transition is in flight. The committed state, report and manifest change only when its motion settles.
  let target = state();
  let targetCandidates = candidates(target);
  let targetKind: Interaction | null = null;
  let targetReport: Change = report();
  let focusReturn: HTMLButtonElement | HTMLSelectElement | undefined;
  let x = 0;
  let y = 0;
  let z = 0;
  const jawPositions = NODES.mixed.map((node) => [jawOffset(INITIAL.request.cpu / node.allocatable.cpu), jawOffset(INITIAL.request.memory / node.allocatable.memory)]);
  const flagPositions = [0, 0, 0];
  const wake = createAnatomyMotion(() => root, (seconds, reduced) => {
    const selectedIndex = NODES[target.fixture].findIndex((node) => node.id === target.selected);
    const tx = selectedIndex < 0 ? 0 : CENTERS[selectedIndex]! - INITIAL_X;
    const ty = target.phase === 'assigned' || target.phase === 'running' ? -45 : 0;
    const tz = target.phase === 'running' ? 9 : 0;
    const amount = reduced ? 1 : 1 - Math.exp(-seconds / .18);
    let moving = false;
    const follow = (value: number, goal: number) => {
      const next = value + (goal - value) * amount;
      if (Math.abs(next - goal) < .04) return goal;
      moving = true;
      return next;
    };
    x = follow(x, tx);
    y = follow(y, ty);
    z = follow(z, tz);
    carriage?.setAttribute('transform', k.translateAlong(P, [x, 0, 0]));
    cartridge?.setAttribute('transform', k.translateAlong(P, [x, y, 0]));
    latch?.setAttribute('transform', k.translateAlong(P, [x, y, z]));
    for (let index = 0; index < targetCandidates.length; index++) {
      const candidate = targetCandidates[index]!;
      const fractions = [target.request.cpu / candidate.node.allocatable.cpu, target.request.memory / candidate.node.allocatable.memory];
      for (let resource = 0; resource < 2; resource++) {
        jawPositions[index]![resource] = follow(jawPositions[index]![resource]!, jawOffset(fractions[resource]!));
        jawRefs[index]![resource]?.setAttribute('transform', k.translateAlong(P, [jawPositions[index]![resource]!, 0, 0]));
      }
      flagPositions[index] = follow(flagPositions[index]!, target.phase !== 'created' && candidate.eligible ? 12 : 0);
      flagRefs[index]?.setAttribute('transform', k.translateAlong(P, [0, 0, flagPositions[index]!]));
    }
    if (!moving && busy()) {
      setState(target);
      setLast(targetKind);
      setReport(targetReport);
      setBusy(false);
      // A pressed control is disabled while motion runs; return focus to it unless the reader has moved elsewhere.
      const active = document.activeElement;
      if (focusReturn?.isConnected && (!active || active === document.body)) focusReturn.focus({ preventScroll: true });
      focusReturn = undefined;
    }
    return moving;
  });

  function move(next: Placement, kind: Interaction, control?: HTMLButtonElement | HTMLSelectElement) {
    if (busy()) return;
    target = next;
    targetCandidates = candidates(next);
    targetKind = kind;
    targetReport = settledReport(kind, next);
    focusReturn = control;
    setReport(pendingReport(kind));
    setBusy(true);
    wake();
  }

  return <div class="anatomy-figure capacity-bench" ref={root} aria-label="Resource capacity placement bench" aria-busy={!hydrated()}>
    <header class="anatomy-figure-header"><span>FIG 03 / SCHEDULING</span><span>Pod reports/report-worker</span></header>
    <div class="capacity-stage">
      <svg class="iso-svg" viewBox="0 0 760 440" role="img" aria-labelledby="capacity-title capacity-description">
        <title id="capacity-title">Three-dock resource comparator bench</title>
        <desc id="capacity-description">Each dock has a CPU ruler at the back and a memory ruler in front. Occupied shoes measure existing requests. Request jaws measure backward from each dock's far end. A raised flag means CPU and memory both fit. The dock names sit above the docks. The highlighted cartridge moves to the chosen dock only on assignment; the raised latch is a separate node-execution step.</desc>
        <g innerHTML={STATIC} />
        <For each={results()}>{(evaluation, index) => <g>
          <For each={GAUGE_Y}>{(gaugeY, resource) => {
            const fraction = resource() === 0 ? evaluation.node.existing.cpu / evaluation.node.allocatable.cpu : evaluation.node.existing.memory / evaluation.node.allocatable.memory;
            const plan = { x: CENTERS[index()]! - 31, y: gaugeY + 6, w: TRACK_LENGTH * fraction, d: 5, r: .5 };
            return <g innerHTML={k.solidSvg(k.slabOf(plan, 10, 3, P, 3), { tone: 'lo' })} />;
          }}</For>
        </g>}</For>
        <For each={REQUEST_JAWS}>{(nodeJaws, index) => <g>
          <For each={nodeJaws}>{(markup, resource) => <g ref={(element) => { jawRefs[index()]![resource()] = element; }} transform={k.translateAlong(P, [jawPositions[index()]![resource()]!, 0, 0])} innerHTML={markup} />}</For>
          <g ref={(element) => { flagRefs[index()] = element; }} innerHTML={FLAGS[index()]} />
        </g>}</For>
        <g ref={carriage} innerHTML={CARRIAGE} />
        <g ref={cartridge} innerHTML={CARTRIDGE} />
        <g ref={latch} innerHTML={EXECUTION_LATCH} />
      </svg>
      <For each={DOCKS}>{(dock, index) => <span class="capacity-dock" data-dock={dock.id} data-placed={statuses()[index()]!.placed ? 'true' : undefined} style={{ left: dock.left, top: dock.top }}>
        <b>{dock.id}</b><i aria-hidden="true">{statuses()[index()]!.filter.tone === 'pass' ? '✓' : statuses()[index()]!.filter.tone === 'fail' ? '✕' : '…'}{statuses()[index()]!.placed ? ' ◆' : ''}</i>
      </span>}</For>
    </div>
    <ul class="anatomy-legend"><li>Back ruler: CPU · front ruler: memory</li><li>Raised flag: CPU and memory both fit</li><li>Accent cartridge: the Pod</li></ul>
    <div class="anatomy-controls capacity-inputs">
      <label>CPU request <select aria-label="CPU request" value={state().request.cpu} disabled={!hydrated() || busy()} onChange={(event) => move({ fixture: state().fixture, request: { cpu: Number(event.currentTarget.value), memory: state().request.memory }, phase: 'created', selected: null }, 'configure', event.currentTarget)}><For each={[300, 600, 1000, 1500]}>{(value) => <option value={value} selected={state().request.cpu === value}>{value}m</option>}</For></select></label>
      <label>Memory request <select aria-label="Memory request" value={state().request.memory} disabled={!hydrated() || busy()} onChange={(event) => move({ fixture: state().fixture, request: { cpu: state().request.cpu, memory: Number(event.currentTarget.value) }, phase: 'created', selected: null }, 'configure', event.currentTarget)}><For each={[512, 1024, 2048, 3072]}>{(value) => <option value={value} selected={state().request.memory === value}>{value}Mi</option>}</For></select></label>
      <label>Node budgets <select aria-label="Node budgets" value={state().fixture} disabled={!hydrated() || busy()} onChange={(event) => move({ fixture: event.currentTarget.value as Fixture, request: state().request, phase: 'created', selected: null }, 'configure', event.currentTarget)}><option value="mixed" selected={state().fixture === 'mixed'}>Mixed bottlenecks</option><option value="equal" selected={state().fixture === 'equal'}>Equal budgets / tie</option></select></label>
    </div>
    <div class="anatomy-controls capacity-steps">
      <button type="button" disabled={!hydrated() || busy() || state().phase === 'running' || (state().phase === 'filtered' && !results().some((evaluation) => evaluation.eligible))} onClick={(event) => {
        const current = state();
        const next = advance(current);
        const kind = KIND[current.phase];
        if (kind && next !== current) move(next, kind, event.currentTarget);
      }}>{actionLabel(state().phase)}</button>
      <button type="button" disabled={!hydrated() || busy()} onClick={(event) => move({ ...state(), phase: 'created', selected: null }, 'replay', event.currentTarget)}>Replay current requests</button>
      <button type="button" disabled={!hydrated() || busy()} onClick={(event) => move({ ...INITIAL, request: { ...INITIAL.request } }, 'reset', event.currentTarget)}>Reset</button>
    </div>
    <p class="anatomy-readout" data-phase={busy() ? 'transition' : state().phase}>{busy() ? report().title : describe(state())}</p>
    <ChangeReport change={report()} busy={busy()} />
    <div class="capacity-results" aria-label="Node resource calculations">
      <For each={statuses()}>{(status) => <section class="capacity-node" data-node={status.evaluation.node.id}>
        <header class="capacity-node-head"><h3>{status.evaluation.node.id}</h3><StateBadge tone={status.filter.tone} label={status.filter.label} />{status.placed && <StateBadge tone={status.placed.tone} label={status.placed.label} />}</header>
        <ul class="capacity-checks">
          <li data-resource="cpu"><span class="capacity-check-name">CPU</span><span class="capacity-check-numbers">{status.evaluation.cpu.free}m free · {status.evaluation.cpu.requested}m requested</span><StateBadge tone={status.cpu.tone} label={status.cpu.label} /></li>
          <li data-resource="memory"><span class="capacity-check-name">Memory</span><span class="capacity-check-numbers">{status.evaluation.memory.free}Mi free · {status.evaluation.memory.requested}Mi requested</span><StateBadge tone={status.memory.tone} label={status.memory.label} /></li>
        </ul>
        <p class="capacity-score">{status.score}</p>
        <dl><dt>Allocatable</dt><dd>{status.evaluation.node.allocatable.cpu}m / {status.evaluation.node.allocatable.memory}Mi</dd><dt>Existing requests</dt><dd>{status.evaluation.node.existing.cpu}m / {status.evaluation.node.existing.memory}Mi</dd><dt>Available budget</dt><dd>{status.evaluation.available.cpu}m / {status.evaluation.available.memory}Mi</dd></dl>
      </section>}</For>
    </div>
    <ManifestPanel title="Pod manifest · reports/report-worker" lines={manifestLines(state(), last())} note="Highlighted lines are what the last committed action read or changed. status and conditions are written by the control plane." />
    <p class="anatomy-fixture-note">Score policy: average normalized slack after placement. Its arithmetic matches LeastAllocated with equal CPU and memory weight, but this bench shows that one term only. Exact ties choose node-a, then node-b, then node-c; kube-scheduler picks randomly among equal top scores. Changing a control creates a fresh fixture, never migrates a running Pod.</p>
    <p class="anatomy-fixture-note">Each ruler spans allocatable. The dark shoe consumes existing requests; the request jaw measures backward from the far end. A jaw overlapping the shoe rejects that resource. Assignment records ownership only; the execution latch requires a separate step.</p>
  </div>;
}
