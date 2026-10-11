import { createMemo, createSignal, For, onMount } from 'solid-js';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import * as k from '@/lib/anatomy/vendor/iso-kit';
import { actionLabel, advance, candidates, describe, INITIAL, NODES, type Placement } from './model';
import { CARTRIDGE, CARRIAGE, CENTERS, EXECUTION_LATCH, FLAGS, GAUGE_Y, INITIAL_X, P, REQUEST_JAWS, STATIC, TRACK_LENGTH } from './geometry';
import './figure.css';

// Geometry is constructed at module load. The one loop writes only group transforms.
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
  const [busy, setBusy] = createSignal(false);
  const [transition, setTransition] = createSignal('');
  const [announcement, setAnnouncement] = createSignal('');
  let target = state();
  let targetCandidates = candidates(target);
  let x = 0;
  let y = 0;
  let z = 0;
  const jawPositions = NODES.mixed.map((node) => [TRACK_LENGTH * (1 - INITIAL.request.cpu / node.allocatable.cpu), TRACK_LENGTH * (1 - INITIAL.request.memory / node.allocatable.memory)]);
  const flagPositions = [0, 0, 0];
  const results = createMemo(() => candidates(state()));
  const wake = createAnatomyMotion(() => root, (seconds, reduced) => {
    const nodes = NODES[target.fixture];
    const selectedIndex = nodes.findIndex((node) => node.id === target.selected);
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
      for (let resource = 0; resource < 2; resource++) {
        const fraction = resource === 0 ? target.request.cpu / candidate.node.allocatable.cpu : target.request.memory / candidate.node.allocatable.memory;
        jawPositions[index]![resource] = follow(jawPositions[index]![resource]!, TRACK_LENGTH * (1 - fraction));
        jawRefs[index]![resource]?.setAttribute('transform', k.translateAlong(P, [jawPositions[index]![resource]!, 0, 0]));
      }
      flagPositions[index] = follow(flagPositions[index]!, target.phase !== 'created' && candidate.eligible ? 12 : 0);
      flagRefs[index]?.setAttribute('transform', k.translateAlong(P, [0, 0, flagPositions[index]!]));
    }
    if (!moving && busy()) {
      setState(target);
      setBusy(false);
      setAnnouncement(describe(target));
    }
    return moving;
  });

  function move(next: Placement, message: string) {
    if (busy()) return;
    target = next;
    targetCandidates = candidates(target);
    setTransition(message);
    setBusy(true);
    setAnnouncement(message);
    wake();
  }

  function configure(cpu: number, memory: number, fixture = state().fixture) {
    move({ fixture, request: { cpu, memory }, phase: 'created', selected: null }, 'Preparing a fresh unassigned Pod fixture');
  }

  return <div class="anatomy-figure capacity-bench" ref={root} aria-label="Resource capacity placement bench" aria-busy={!hydrated()}>
    <header class="anatomy-figure-header"><span>FIG 03 / SCHEDULING</span><span>Capacity placement bench</span></header>
    <svg class="iso-svg" viewBox="0 0 760 440" role="img" aria-labelledby="capacity-title capacity-description">
      <title id="capacity-title">Three-dock resource comparator bench</title>
      <desc id="capacity-description">Each dock has a CPU ruler at the back and memory ruler in front. Occupied shoes measure existing requests. Request jaws measure backward from allocatable capacity. A raised flag means both resources fit. The highlighted cartridge moves to a selected dock; a separate raised latch represents node execution, not scheduler work.</desc>
      <g innerHTML={STATIC} />
      <For each={results()}>{(candidate, index) => <g>
        <For each={GAUGE_Y}>{(gaugeY, resource) => {
          const fraction = resource() === 0 ? candidate.node.existing.cpu / candidate.node.allocatable.cpu : candidate.node.existing.memory / candidate.node.allocatable.memory;
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
    <ul class="anatomy-legend"><li>Docks left → right: node-a / node-b / node-c</li><li>Back ruler: CPU · front ruler: memory</li><li>Raised flag: feasible · accent cartridge: incoming Pod</li></ul>
    <div class="anatomy-controls">
      <label>CPU request <select aria-label="CPU request" value={state().request.cpu} disabled={!hydrated() || busy()} onChange={(event) => configure(Number(event.currentTarget.value), state().request.memory)}><For each={[300, 600, 1000, 1500]}>{(value) => <option value={value} selected={state().request.cpu === value}>{value}m</option>}</For></select></label>
      <label>Memory request <select aria-label="Memory request" value={state().request.memory} disabled={!hydrated() || busy()} onChange={(event) => configure(state().request.cpu, Number(event.currentTarget.value))}><For each={[512, 1024, 2048, 3072]}>{(value) => <option value={value} selected={state().request.memory === value}>{value}Mi</option>}</For></select></label>
      <label>Node budgets <select aria-label="Node budgets" value={state().fixture} disabled={!hydrated() || busy()} onChange={(event) => configure(state().request.cpu, state().request.memory, event.currentTarget.value as Placement['fixture'])}><option value="mixed" selected={state().fixture === 'mixed'}>Mixed bottlenecks</option><option value="equal" selected={state().fixture === 'equal'}>Equal budgets / tie</option></select></label>
    </div>
    <div class="anatomy-controls">
      <button type="button" disabled={!hydrated() || busy() || state().phase === 'running' || (state().phase === 'filtered' && !results().some((candidate) => candidate.eligible))} onClick={() => {
        const next = advance(state());
        const message = next.phase === 'assigned' ? 'Recording assignment · nodeName still empty until complete' : next.phase === 'running' ? 'Node kubelet/runtime starting containers · assignment already recorded' : next.phase === 'selected' ? 'Scoring eligible docks · not assigned yet' : 'Comparing both requested resources';
        move(next, message);
      }}>{actionLabel(state().phase)}</button>
      <button type="button" disabled={!hydrated() || busy()} onClick={() => move({ ...state(), phase: 'created', selected: null }, 'Replaying · returning the cartridge to the unassigned queue')}>Replay current requests</button>
      <button type="button" disabled={!hydrated() || busy()} onClick={() => move({ ...INITIAL, request: { ...INITIAL.request } }, 'Resetting to 600m CPU / 1024Mi memory')}>Reset</button>
    </div>
    <p class="anatomy-readout" data-phase={busy() ? 'transition' : state().phase} aria-busy={busy()}>{busy() ? transition() : describe(state())}</p>
    <span class="capacity-sr-only" aria-live="polite" aria-atomic="true">{announcement()}</span>
    <div class="capacity-results" aria-label="Node resource calculations">
      <For each={results()}>{(candidate) => <section class="capacity-node">
        <h3>{candidate.node.id}</h3>
        <dl><dt>Allocatable</dt><dd>{candidate.node.allocatable.cpu}m / {candidate.node.allocatable.memory}Mi</dd><dt>Existing requests</dt><dd>{candidate.node.existing.cpu}m / {candidate.node.existing.memory}Mi</dd><dt>Available budget</dt><dd>{candidate.available.cpu}m / {candidate.available.memory}Mi</dd><dt>Incoming request</dt><dd>{state().request.cpu}m / {state().request.memory}Mi</dd></dl>
        <p>{state().phase === 'created' ? 'Awaiting filter' : candidate.eligible ? `Eligible · illustrative score ${candidate.score!.toFixed(2)}` : candidate.reasons.join('; ')}</p>
        {state().selected === candidate.node.id && <p><strong>{state().phase === 'selected' ? 'Selected, not assigned' : 'Assignment recorded'}</strong></p>}
      </section>}</For>
    </div>
    <p class="anatomy-fixture-note">Policy: highest average normalized resource slack after placement; exact ties choose node-a before node-b before node-c. This is not the default Kubernetes scoring or random tie policy. Changing a control creates a fresh fixture, never migrates a running Pod.</p>
    <p class="anatomy-fixture-note">Each ruler spans allocatable. The dark shoe consumes existing requests; the request jaw measures backward from the far end. A jaw overlapping the shoe rejects that resource. Assignment records ownership only; the execution latch requires a separate step.</p>
  </div>;
}
