import { createMemo, createSignal, For, onMount } from 'solid-js';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import ChangeReport, { type Change } from '../shared/ChangeReport';
import ManifestPanel from '../shared/ManifestPanel';
import StateBadge, { type BadgeTone } from '../shared/StateBadge';
import {
  baySvg, base, bladeSvg, boxSvg, cableSvg, cartSvg, desk, floorSvg, gateFrame, headSvg, HEAD, LIFT, move,
  PLACE_X, platformSvg, postSvg, shelfItemSvg, shelfSvg, slip, switchSvg, viewBox, zonePlate,
} from './geometry';
import { podPoint, stageTags, tagPosition } from './layout';
import {
  activeVolume, CLAIM_NAME, emptyState, ledger, manifestLines, pendingCause, planSteps, sceneOf, summary, transition,
  type AccessMode, type Action, type BindingMode, type Field, type NodeName, type ReclaimPolicy, type Scene, type State,
  type Step, type Zone,
} from './model';
import './figure.css';

/**
 * Discrete state (text, badges, YAML) follows the model immediately. The SVG plays the
 * planned order of changes (Pod first, then provisioning, then removal) and settles gates,
 * cable and shelves to the final model scene. Reduced motion completes the queue at once.
 */
interface Visual {
  cart: { zone: Zone | null; x: number; to: number };
  head: Record<Zone, { z: number; toZ: number }>;
  blade: Record<Zone, { at: number; to: number }>;
  box: Record<Zone, boolean>;
  shelf: Record<Zone, number>;
  cable: Zone | null;
}

interface Row { kind: string; name: string; tone: BadgeTone; text: string }

const zones: Zone[] = ['a', 'b'];
const shelfSlots = [0, 1, 2, 3];
const BINDINGS: BindingMode[] = ['Immediate', 'WaitForFirstConsumer'];
const RECLAIMS: ReclaimPolicy[] = ['Delete', 'Retain'];
const ACCESS: AccessMode[] = ['ReadWriteOnce', 'ReadWriteMany'];
const NODES: NodeName[] = ['node-a', 'node-b'];
const START: Change = {
  title: 'Nothing requested yet',
  changed: 'No PVC, PV or Pod exists in this fixture.',
  actor: 'You (fixture setup)',
  reason: 'A claim is the workload\u2019s request for storage. The StorageClass and its provisioner decide how the volume is provided.',
  notYet: 'No volume exists until a claim is created. With WaitForFirstConsumer it also waits for a Pod.',
};

// Exponential approach with a fixed time constant; snaps when the remaining distance is invisible.
const pull = (at: number, to: number, dt: number) =>
  (Math.abs(to - at) < 0.025 ? to : at + (to - at) * (1 - Math.exp(-dt / 0.18)));

function visualOf(next: State): Visual {
  const scene = sceneOf(next);
  const pod = scene.pod;
  const blade = (zone: Zone) => {
    const at = scene.gateOpen[zone] ? LIFT : 0;
    return { at, to: at };
  };
  const x = pod ? PLACE_X[pod.place] : PLACE_X.parking;
  return {
    cart: { zone: pod?.zone ?? null, x, to: x },
    head: { a: { z: HEAD.rest, toZ: HEAD.rest }, b: { z: HEAD.rest, toZ: HEAD.rest } },
    blade: { a: blade('a'), b: blade('b') },
    box: { a: scene.bay.a !== null, b: scene.bay.b !== null },
    shelf: { ...scene.shelf },
    cable: scene.cable,
  };
}

/** One beat per planned step, then a settle beat that matches the final model scene. */
function beatsFor(steps: Step[], final: Scene, visual: Visual): Array<() => void> {
  const beats: Array<() => void> = [];
  for (const step of steps) {
    if (step.kind === 'cartIn') {
      const { zone, to } = step;
      beats.push(() => { visual.cart = { zone, x: PLACE_X.parking, to: PLACE_X[to] }; });
    } else if (step.kind === 'cartOut') {
      beats.push(() => { visual.cart.to = PLACE_X.parking; });
      beats.push(() => { visual.cart = { zone: null, x: PLACE_X.parking, to: PLACE_X.parking }; });
    } else {
      const { zone } = step;
      const present = step.kind === 'stamp';
      beats.push(
        () => { visual.head[zone].toZ = HEAD.low; },
        () => { visual.box[zone] = present; },
        () => { visual.head[zone].toZ = HEAD.rest; },
      );
    }
  }
  beats.push(() => {
    visual.box = { a: final.bay.a !== null, b: final.bay.b !== null };
    visual.shelf = { ...final.shelf };
    visual.cable = final.cable;
    for (const zone of zones) visual.blade[zone].to = final.gateOpen[zone] ? LIFT : 0;
  });
  return beats;
}

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [state, setState] = createSignal<State>(emptyState());
  const [touched, setTouched] = createSignal<Field[]>([]);
  const [report, setReport] = createSignal<Change>(START);
  let root: HTMLDivElement | undefined;
  let keyEl: HTMLDetailsElement | undefined;
  let podTagEl: HTMLSpanElement | undefined;
  const carts: Partial<Record<Zone, SVGGElement>> = {};
  const heads: Partial<Record<Zone, SVGGElement>> = {};
  const boxes: Partial<Record<Zone, SVGGElement>> = {};
  const blades: Partial<Record<Zone, SVGGElement>> = {};
  const cables: Partial<Record<Zone, SVGGElement>> = {};
  const shelfItems: Record<Zone, Array<SVGGElement | undefined>> = { a: [], b: [] };
  const visual: Visual = visualOf(emptyState());
  let queue: Array<() => void> = [];

  const scene = createMemo(() => sceneOf(state()));
  const manifest = createMemo(() => manifestLines(state(), touched()));
  const readout = createMemo(() => summary(state()));
  const counts = createMemo(() => ledger(state()));
  const tags = createMemo(() => stageTags(state()));
  const podTag = createMemo(() => tags().find((tag) => tag.id === 'pod'));
  const otherTags = createMemo(() => tags().filter((tag) => tag.id !== 'pod'));

  const rows = createMemo<Row[]>(() => {
    const s = state();
    const claim = s.claim;
    const volume = activeVolume(s);
    const pod = s.pod;
    const count = counts();
    const claimRow: Row = !claim
      ? { kind: 'PVC', name: CLAIM_NAME, tone: 'info', text: 'Not created' }
      : claim.terminating
        ? { kind: 'PVC', name: CLAIM_NAME, tone: 'wait', text: 'Terminating: waits until no Pod uses it' }
        : claim.bound
          ? { kind: 'PVC', name: CLAIM_NAME, tone: 'pass', text: `Bound to ${claim.bound}` }
          : { kind: 'PVC', name: CLAIM_NAME, tone: 'wait', text: 'Pending: no volume yet' };
    const volumeRow: Row = volume
      ? { kind: 'PV', name: volume.name, tone: 'pass', text: `Bound · zone ${volume.zone} · reclaim ${volume.reclaim} · ${volume.rows} ${volume.rows === 1 ? 'row' : 'rows'}` }
      : { kind: 'PV', name: 'none', tone: 'info', text: count.released ? `${count.released} Released, not Available` : 'No bound volume' };
    const podRow: Row = !pod
      ? { kind: 'Pod', name: 'none', tone: 'info', text: 'No writer Pod' }
      : pod.node
        ? { kind: 'Pod', name: pod.name, tone: 'pass', text: `Assigned to ${pod.node} · volume mounted · not Running` }
        : { kind: 'Pod', name: pod.name, tone: 'wait', text: pendingCause(s) === 'zone'
          ? `Pending: volume in zone ${volume?.zone} excludes ${pod.target}`
          : 'Pending: the claim has no bound volume' };
    return [claimRow, volumeRow, podRow];
  });

  function paint() {
    const c = visual.cart;
    for (const zone of zones) {
      const car = carts[zone];
      if (car) {
        car.setAttribute('transform', move(c.x));
        car.style.display = c.zone === zone ? '' : 'none';
      }
      heads[zone]?.setAttribute('transform', move(0, 0, visual.head[zone].z));
      const box = boxes[zone];
      if (box) box.style.display = visual.box[zone] ? '' : 'none';
      blades[zone]?.setAttribute('transform', move(0, 0, visual.blade[zone].at));
      const cable = cables[zone];
      if (cable) cable.style.display = visual.cable === zone ? '' : 'none';
      shelfItems[zone].forEach((item, index) => {
        if (item) item.style.display = index < visual.shelf[zone] ? '' : 'none';
      });
    }
    if (podTagEl && c.zone) {
      const position = tagPosition(podPoint(c.x, c.zone));
      podTagEl.style.left = position.left;
      podTagEl.style.top = position.top;
    }
  }

  function animate(dt: number): boolean {
    const c = visual.cart;
    c.x = pull(c.x, c.to, dt);
    let moving = c.x !== c.to;
    for (const zone of zones) {
      const head = visual.head[zone];
      head.z = pull(head.z, head.toZ, dt);
      if (head.z !== head.toZ) moving = true;
      const blade = visual.blade[zone];
      blade.at = pull(blade.at, blade.to, dt);
      if (blade.at !== blade.to) moving = true;
    }
    return moving;
  }

  function settleValues() {
    visual.cart.x = visual.cart.to;
    for (const zone of zones) {
      visual.head[zone].z = visual.head[zone].toZ;
      visual.blade[zone].at = visual.blade[zone].to;
    }
  }

  function drain() {
    while (queue.length) {
      queue.shift()!();
      settleValues();
    }
    settleValues();
    paint();
    setBusy(false);
  }

  const wake = createAnatomyMotion(() => root, (dt, reduced) => {
    if (reduced) {
      drain();
      return false;
    }
    let moving = animate(dt);
    if (!moving && queue.length) {
      queue.shift()!();
      moving = true;
    }
    paint();
    if (!moving) setBusy(false);
    return moving;
  });

  function act(action: Action) {
    if (busy()) return;
    const previous = state();
    const outcome = transition(previous, action);
    setState(outcome.state);
    setTouched(outcome.touched);
    setReport(outcome.change);
    // A class setting or reset starts a fresh scenario: nothing animates from the old one.
    if (outcome.state !== previous && (action.type === 'setConfig' || action.type === 'reset')) {
      queue = [];
      Object.assign(visual, visualOf(outcome.state));
      paint();
      return;
    }
    queue = beatsFor(planSteps(previous, outcome.state), sceneOf(outcome.state), visual);
    setBusy(true);
    wake();
  }

  onMount(() => {
    Object.assign(visual, visualOf(state()));
    paint();
    // The key is open on wide screens and folded on phones, where the stage and report must fit one screen.
    if (keyEl && window.matchMedia('(min-width: 721px)').matches) keyEl.open = true;
    setHydrated(true);
  });

  const idle = () => !hydrated() || busy();

  return <div ref={root} class="anatomy-figure pv-figure" aria-label="Claim-backed storage bench" aria-busy={!hydrated()}>
    <div class="anatomy-figure-header"><span>Fig 01 · Claim bench</span><span>The claim asks. The volume outlives the Pod.</span></div>
    <p class="pv-purpose">A workload asks for storage with a claim. The StorageClass and its provisioner decide where the volume is created. The Pod only mounts the volume its claim is bound to.</p>
    <div class="anatomy-bench">
    <div class="anatomy-bench-object">
    <div class="pv-stage">
      <svg class="iso-svg" viewBox={viewBox} role="img" aria-labelledby="pv-title pv-desc">
        <title id="pv-title">Claim bench: a PVC slip, a provisioner over two zone bays, and a writer Pod</title>
        <desc id="pv-desc">A claim slip on the desk asks for storage. A provisioner head for each zone bay lowers a strongbox into that bay. The writer Pod cart moves along its node lane and passes a lift gate only when the bound volume is in that zone. A cable joins the volume to its node once mounted.</desc>
        <g innerHTML={base} />
        <g innerHTML={desk} />
        <g style={{ display: state().claim ? undefined : 'none' }} innerHTML={slip} />
        <For each={zones}>{(zone) => <g>
          <g innerHTML={zonePlate(zone)} />
          <g innerHTML={floorSvg(zone)} />
          <g innerHTML={gateFrame(zone)} />
          <g innerHTML={baySvg(zone)} />
          <g innerHTML={shelfSvg(zone)} />
          {shelfSlots.map((index) => <g ref={(el) => { shelfItems[zone][index] = el; }} style={{ display: 'none' }} innerHTML={shelfItemSvg(zone, index)} />)}
          <g innerHTML={postSvg(zone)} />
          <g ref={(el) => { boxes[zone] = el; }} style={{ display: 'none' }}>
            <g innerHTML={boxSvg(zone)} />
            <g innerHTML={switchSvg(zone, state().config.reclaim)} />
          </g>
          <g ref={(el) => { heads[zone] = el; }} innerHTML={headSvg(zone)} />
          <g innerHTML={platformSvg(zone)} />
          <g ref={(el) => { cables[zone] = el; }} style={{ display: 'none' }} innerHTML={cableSvg(zone)} />
          <g ref={(el) => { blades[zone] = el; }} innerHTML={bladeSvg(zone)} />
          <g ref={(el) => { carts[zone] = el; }} style={{ display: 'none' }} innerHTML={cartSvg(zone)} />
        </g>}</For>
      </svg>
      <div class="pv-tags" aria-hidden="true">
        <For each={otherTags()}>{(tag) => <span class="pv-tag" data-tag={tag.id} data-align={tag.align} style={tagPosition(tag.point)}>{tag.text}</span>}</For>
        <span ref={(el) => { podTagEl = el; }} class="pv-tag" data-tag="pod" data-align="center" style={{ display: podTag() ? undefined : 'none' }}>{podTag()?.text ?? ''}</span>
      </div>
    </div>
    <ul class="pv-identity" aria-label="Stage identities">
      <For each={tags()}>{(tag) => <li>{tag.text.replace('\n', ' · ')}</li>}</For>
    </ul>
    <details class="pv-key" ref={(el) => { keyEl = el; }}>
      <summary>Key to the apparatus</summary>
      <ul class="anatomy-legend">
        <li>Slip on the desk = PVC ledger</li>
        <li>Strongbox in a zone bay = PV, with its row count</li>
        <li>Cart = writer Pod</li>
        <li>Post and head = provisioner for that zone's bay</li>
        <li>Gate open while no volume is bound or the volume is in that zone; closed to a zone the volume is not in</li>
        <li>Cable = volume mounted on that node</li>
      </ul>
    </details>
    </div>
    <div class="anatomy-bench-panel">
    <div class="anatomy-controls">
      <button type="button" data-anatomy-primary disabled={idle()} onClick={() => act({ type: 'submit' })}>Create claim</button>
      <button type="button" disabled={idle()} onClick={() => act({ type: 'start' })}>Create writer Pod</button>
      <button type="button" disabled={idle() || !scene().pod?.mounted} onClick={() => act({ type: 'append' })}>Writer appends a row</button>
      <button type="button" disabled={idle()} onClick={() => act({ type: 'deletePod' })}>Delete writer Pod</button>
      <button type="button" disabled={idle()} onClick={() => act({ type: 'deleteClaim' })}>Delete claim</button>
      <button type="button" disabled={idle()} onClick={() => act({ type: 'reset' })}>Reset fixture</button>
    </div>
    <ChangeReport change={report()} busy={busy()} />
    <section class="pv-status" data-anatomy-status>
      <h3 class="anatomy-panel-heading">Objects</h3>
      <ul class="anatomy-status-list pv-objects" aria-label="Object status">
        <For each={rows()}>{(row) => <li>
          <span>{row.kind} <code>{row.name}</code></span>
          <StateBadge tone={row.tone} label={row.text} />
        </li>}</For>
      </ul>
      <p class="pv-ledger">Volumes: {counts().bound} Bound · {counts().released} Released (data kept, not Available)</p>
      <p class="anatomy-readout" data-readout>{readout()}</p>
    </section>
    <div class="pv-settings">
      <label>Volume binding mode
        <select value={state().config.binding} disabled={idle()} onChange={(e) => act({ type: 'setConfig', key: 'binding', value: e.currentTarget.value })}>
          <For each={BINDINGS}>{(mode) => <option value={mode} selected={state().config.binding === mode}>{mode}</option>}</For>
        </select>
      </label>
      <label>Reclaim policy
        <select value={state().config.reclaim} disabled={idle()} onChange={(e) => act({ type: 'setConfig', key: 'reclaim', value: e.currentTarget.value })}>
          <For each={RECLAIMS}>{(policy) => <option value={policy} selected={state().config.reclaim === policy}>{policy}</option>}</For>
        </select>
      </label>
      <label>Claim access mode
        <select value={state().config.access} disabled={idle()} onChange={(e) => act({ type: 'setConfig', key: 'access', value: e.currentTarget.value })}>
          <For each={ACCESS}>{(mode) => <option value={mode} selected={state().config.access === mode}>{mode}</option>}</For>
        </select>
      </label>
      <label>Next Pod node
        <select value={state().config.podNode} disabled={idle() || state().pod !== null} onChange={(e) => act({ type: 'setPodNode', node: e.currentTarget.value as NodeName })}>
          <For each={NODES}>{(node) => <option value={node} selected={state().config.podNode === node}>{node} (zone {node === 'node-a' ? 'a' : 'b'})</option>}</For>
        </select>
      </label>
    </div>
    </div>
    </div>
    <p class="pv-caption">Class settings start a fresh scenario. Appending a row is the application writing; Kubernetes never writes rows. The cart is a Pod assignment and mount, not a running container.</p>
    <ManifestPanel title="Live manifests from the fixture state" lines={manifest()} note="Highlighted lines were read or changed by the last interaction. Application rows are data on the volume, not manifest fields." />
  </div>;
}
