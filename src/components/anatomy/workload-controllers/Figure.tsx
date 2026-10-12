import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import ChangeReport from '../shared/ChangeReport';
import ManifestPanel from '../shared/ManifestPanel';
import StateBadge from '../shared/StateBadge';
import { DRAWER_X, bay, bayAt, chassis, claim, cartridgeArt, drawers, move, pointers, shelfAt, tray, trayAt, } from './geometry';
import {
  BACKOFF_LIMIT, MAX_REPLICAS, POOL, SOCKETS, apply, boundOn, boundPods, chooseKind, controllerOf, deletePod, fail, finish,
  initialState, kinds, livePods, manifestLines, needLabels, nextStep, nodeIds, ownerBadges, placeOf, runningJobPod, setReplicas,
  stageView, step, tick, toggleNode, type Kind, type Place, type Pod, type WorkloadState,
} from './model';
import './figure.css';

const cartridgeSlots = Array.from({ length: POOL }, (_, index) => index);
const replicaChoices = Array.from({ length: MAX_REPLICAS + 1 }, (_, index) => index);

/** Ease toward a target and snap once within a fraction of a unit, so motion ends on an exact pose. */
function ease(value: number, target: number, blend: number) {
  const next = value + (target - value) * blend;
  return Math.abs(target - next) < 0.02 ? target : next;
}

/** Selecting a Pod changes nothing in the cluster; the report says which Pod Delete will act on. */
function selectionReport(s: WorkloadState, uid: number | null): WorkloadState['event'] {
  const actor = 'You (selection only; no request is sent)';
  const pod = uid === null ? undefined : s.pods.find((candidate) => candidate.uid === uid);
  if (uid === null || !pod) {
    return {
      title: 'No Pod selected',
      changed: 'Selection cleared. Nothing changed in the cluster.',
      actor,
      reason: 'Delete selected Pod stays disabled until you choose a Pod.',
      notYet: 'No Pod is deleted.',
      highlight: [],
    };
  }
  return {
    title: `p${uid} selected`,
    changed: `Nothing changed. p${uid} is ${stageView[pod.stage].label}${pod.node ? ` on ${pod.node}` : ' with no node'}.`,
    actor,
    reason: `Delete selected Pod will act on p${uid} only.`,
    notYet: 'Nothing is deleted until you press Delete selected Pod.',
    highlight: [],
  };
}

function PodChip(props: { pod: Pod; selected: boolean }) {
  return (
    <li class="wc-chip" data-selected={props.selected ? 'true' : 'false'}>
      <strong>p{props.pod.uid}</strong>
      <StateBadge tone={stageView[props.pod.stage].tone} label={stageView[props.pod.stage].label} />
      <Show when={props.selected}><StateBadge tone="selected" label="Selected" /></Show>
    </li>
  );
}

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  onMount(() => setHydrated(true));
  const [state, setState] = createSignal<WorkloadState>(initialState());
  const [picked, setPicked] = createSignal<number | null>(null);
  let root: HTMLDivElement | undefined;

  // Per cartridge element: where it is, where it is going, and which Pod identity it currently shows.
  // A new Pod on a reused element snaps into its place and fades in: it never travels as the old Pod.
  const groups: Array<SVGGElement | undefined> = [];
  const pose = cartridgeSlots.map(() => ({ x: 0, y: 0, z: 0, alpha: 0, tx: 0, ty: 0, tz: 0, talpha: 0, uid: -1 }));
  const wake = createAnatomyMotion(() => root, (seconds, reduced) => {
    const blend = reduced ? 1 : 1 - Math.exp(-seconds / 0.16);
    let remains = false;
    pose.forEach((p, el) => {
      p.x = ease(p.x, p.tx, blend);
      p.y = ease(p.y, p.ty, blend);
      p.z = ease(p.z, p.tz, blend);
      p.alpha = ease(p.alpha, p.talpha, blend);
      remains ||= p.x !== p.tx || p.y !== p.ty || p.z !== p.tz || p.alpha !== p.talpha;
      groups[el]?.setAttribute('transform', move(p.x, p.y, p.z));
      groups[el]?.setAttribute('opacity', String(p.alpha));
    });
    return remains;
  });

  function retarget(next: WorkloadState, fresh: boolean) {
    pose.forEach((p, el) => {
      const pod = next.pods.find((candidate) => candidate.el === el);
      if (fresh) p.uid = -1;
      if (!pod) {
        p.talpha = 0;
        return;
      }
      const place: Place = placeOf(next, pod);
      const [x, y, z] = place.where === 'tray'
        ? trayAt(place.index)
        : place.where === 'bay' ? bayAt(place.node, place.socket, place.seated) : shelfAt(place.index);
      if (p.uid !== pod.uid) {
        p.uid = pod.uid;
        p.x = x;
        p.y = y;
        p.z = z;
        p.alpha = 0;
      }
      p.tx = x;
      p.ty = y;
      p.tz = z;
      p.talpha = 1;
    });
    wake();
  }

  /** Every cluster change goes through here. A selected Pod that leaves the live set clears the selection, and the report says so. */
  function commit(next: WorkloadState, fresh = false) {
    const kept = picked();
    let result = next;
    if (kept !== null && !livePods(next).some((pod) => pod.uid === kept)) {
      setPicked(null);
      result = { ...next, event: { ...next.event, changed: `${next.event.changed} Selection cleared: p${kept} is no longer live.` } };
    }
    setState(result);
    retarget(result, fresh);
  }

  function choose(uid: number | null) {
    setPicked(uid);
    setState({ ...state(), event: selectionReport(state(), uid) });
  }

  const pending = createMemo(() => nextStep(state()) !== null);
  const jobPod = createMemo(() => runningJobPod(state()));
  const liveUids = createMemo(() => livePods(state()).map((pod) => pod.uid));
  const selected = createMemo(() => {
    const uid = picked();
    return uid !== null && liveUids().includes(uid) ? uid : null;
  });
  const unassignedPods = createMemo(() => state().pods.filter((pod) => pod.stage === 'unassigned'));
  const terminalPods = createMemo(() => state().pods.filter((pod) => pod.stage === 'succeeded' || pod.stage === 'failed'));
  const manifest = createMemo(() => {
    const s = state();
    return manifestLines(s).map((line) => ({ text: line.text, highlight: line.key !== undefined && s.event.highlight.includes(line.key) }));
  });
  const manifestNote = createMemo(() => (state().kind === 'Job' || state().kind === 'CronJob')
    ? `Fixture backoffLimit ${BACKOFF_LIMIT}; the Kubernetes default is 6. Failed Pods above ${BACKOFF_LIMIT} fail the Job. The retry delay is omitted.`
    : undefined);
  const usesReplicas = createMemo(() => state().kind === 'Deployment' || state().kind === 'StatefulSet');
  const usesJobRun = createMemo(() => state().kind === 'Job' || state().kind === 'CronJob');

  return (
    <div ref={root} class="anatomy-figure wc-figure" aria-busy={!hydrated()}>
      <div class="anatomy-figure-header"><span>FIG 02 · CONTROLLER BENCH</span><span>Kind chooses the owner</span></div>
      <div class="anatomy-bench">
      <div class="anatomy-bench-object">
      <svg class="iso-svg" viewBox="0 0 760 470" role="img" aria-labelledby="wc-title wc-description">
        <title id="wc-title">Controller bench with node bays, a Pod tray, a finished shelf and claim drawers</title>
        <desc id="wc-description">The console knob points at the controller that owns the applied kind. Cartridges are Pod objects: unassigned ones wait in the tray, bound ones sit in node sockets (partly inserted when Assigned, seated when Running), and terminal ones move to the shelf. A lit lamp means Ready. A claim block in a drawer is a PVC that outlives its Pod.</desc>
        <g innerHTML={chassis} />
        <For each={pointers}>{(pointer, index) => <g opacity={kinds.indexOf(state().kind) === index() ? 1 : 0} innerHTML={pointer} />}</For>
        <g innerHTML={tray} />
        <For each={nodeIds}>{(node) => <g opacity={state().nodes[node] ? 1 : 0.3} innerHTML={bay(node)} />}</For>
        <For each={drawers}>{(drawer, index) => <g>
          <g innerHTML={drawer} />
          <g opacity={state().claims.includes(index()) ? 1 : 0} innerHTML={claim(DRAWER_X[index()] ?? 0)} />
        </g>}</For>
        <For each={cartridgeSlots}>{(el) => {
          const pod = createMemo(() => state().pods.find((candidate) => candidate.el === el));
          const art = createMemo(() => cartridgeArt(pod()?.uid ?? 0, pod()?.stage === 'ready'));
          return <g ref={(element) => { groups[el] = element; }} opacity="0" innerHTML={art()} />;
        }}</For>
      </svg>

      <ul class="anatomy-legend">
        <li>Tray: Unassigned, no node</li>
        <li>Socket, partly in: Assigned</li>
        <li>Socket, seated: Running</li>
        <li>Lit lamp: Ready</li>
        <li>Shelf: Succeeded or Failed</li>
        <li>Claim block: retained PVC</li>
        <li>Dimmed bay: node absent</li>
        <li>Knob pointer: owning controller</li>
      </ul>
      <fieldset class="wc-secondary">
        <legend>Nodes and Pods</legend>
        <div class="anatomy-controls">
          <For each={nodeIds}>{(node) => <button type="button" disabled={!hydrated()} onClick={() => commit(toggleNode(state(), node))}>{state().nodes[node] ? `Remove ${node}` : `Add ${node}`}</button>}</For>
          <Show when={state().applied}>
            <label for="wc-pod">Pod to delete
              <select id="wc-pod" value={selected() === null ? '' : String(selected())} disabled={!hydrated() || liveUids().length === 0} onChange={(event) => {
                const value = event.currentTarget.value;
                choose(value === '' ? null : Number(value));
              }}>
                <option value="" selected={selected() === null}>None selected</option>
                <For each={livePods(state())}>{(pod) => <option value={pod.uid} selected={selected() === pod.uid}>{`p${pod.uid} · ${pod.owner}${pod.ordinal !== null ? ` · name web-${pod.ordinal}` : ''} · ${stageView[pod.stage].label}`}</option>}</For>
              </select>
            </label>
            <button type="button" disabled={!hydrated() || selected() === null} onClick={() => {
              const uid = selected();
              if (uid !== null) commit(deletePod(state(), uid));
            }}>Delete selected Pod</button>
          </Show>
        </div>
      </fieldset>
      </div>
      <div class="anatomy-bench-panel">
      <div class="anatomy-controls wc-primary">
        <label for="wc-kind">Workload kind
          <select id="wc-kind" value={state().kind} disabled={!hydrated() || state().applied} onChange={(event) => commit(chooseKind(state(), event.currentTarget.value as Kind))}>
            <For each={kinds}>{(kind) => <option value={kind} selected={state().kind === kind}>{needLabels[kind]}</option>}</For>
          </select>
        </label>
        <Show when={usesReplicas()}>
          <label for="wc-replicas">Desired replicas
            <select id="wc-replicas" value={String(state().replicas)} disabled={!hydrated() || !state().applied} onChange={(event) => commit(setReplicas(state(), Number(event.currentTarget.value)))}>
              <For each={replicaChoices}>{(count) => <option value={count} selected={state().replicas === count}>{count}</option>}</For>
            </select>
          </label>
        </Show>
        <button type="button" data-anatomy-primary disabled={!hydrated() || state().applied} onClick={() => commit(apply(state()))}>Apply manifest</button>
        <button type="button" class="wc-run" disabled={!hydrated() || !pending()} onClick={() => commit(step(state()))}>{pending() ? 'Run next event' : 'No event pending'}</button>
        <Show when={usesJobRun()}>
          <button type="button" disabled={!hydrated() || !jobPod()} onClick={() => commit(finish(state()))}>Pod exits 0 (Succeeded)</button>
          <button type="button" disabled={!hydrated() || !jobPod()} onClick={() => commit(fail(state()))}>Pod exits non-zero (Failed)</button>
        </Show>
        <Show when={state().kind === 'CronJob'}>
          <button type="button" disabled={!hydrated() || !state().applied} onClick={() => commit(tick(state()))}>Schedule fires</button>
        </Show>
        <button type="button" disabled={!hydrated()} onClick={() => commit(initialState(state().kind), true)}>Reset to draft</button>
      </div>

      <ChangeReport change={state().event} />
      <div class="wc-state" data-anatomy-status>
      <section class="wc-status" aria-label="Owner status">
        <p class="wc-owner"><strong>{controllerOf[state().kind]}</strong></p>
        <ul class="wc-badges"><For each={ownerBadges(state())}>{(badge) => <li><StateBadge tone={badge.tone} label={badge.label} /></li>}</For></ul>
      </section>
      <div class="wc-bench">
        <For each={nodeIds}>{(node) => <section class="wc-card" data-present={state().nodes[node] ? 'true' : 'false'} aria-label={node}>
          <h4>{node}</h4>
          <p>{state().nodes[node] ? 'present' : 'absent'} · bound {boundOn(state(), node)} of {SOCKETS} sockets</p>
          <ul class="wc-chips"><For each={boundPods(state(), node)}>{(pod) => <PodChip pod={pod} selected={selected() === pod.uid} />}</For></ul>
        </section>}</For>
        <section class="wc-card" aria-label="Tray">
          <h4>Tray</h4>
          <p>{unassignedPods().length} Unassigned · no node</p>
          <ul class="wc-chips"><For each={unassignedPods()}>{(pod) => <PodChip pod={pod} selected={selected() === pod.uid} />}</For></ul>
        </section>
        <section class="wc-card" aria-label="Shelf">
          <h4>Shelf</h4>
          <p>{terminalPods().length} Succeeded or Failed</p>
          <ul class="wc-chips"><For each={terminalPods()}>{(pod) => <PodChip pod={pod} selected={selected() === pod.uid} />}</For></ul>
        </section>
      </div>
      <p class="wc-counts">Claims retained: {state().claims.length ? state().claims.map((ordinal) => `data-web-${ordinal}`).join(', ') : 'none'}</p>
      </div>
      </div>
      </div>

      <ManifestPanel title={`Manifest · ${state().kind} (model state)`} lines={manifest()} note={manifestNote()} />

      <section class="wc-ledger" aria-label="Pod identity ledger">
        <h3>Pod identity ledger</h3>
        <Show when={state().pods.length > 0} fallback={<p>No Pod objects exist.</p>}>
          <ul><For each={state().pods}>{(pod) => <li>
            <strong>p{pod.uid}</strong>
            <span>{pod.owner}{pod.ordinal !== null ? ` · name web-${pod.ordinal}` : ''}</span>
            <span>{pod.node ?? 'no node yet'}{pod.pinned ? ' · pinned by nodeAffinity' : ''}</span>
            <StateBadge tone={stageView[pod.stage].tone} label={stageView[pod.stage].label} />
            <Show when={selected() === pod.uid}><StateBadge tone="selected" label="Selected" /></Show>
          </li>}</For></ul>
        </Show>
      </section>
      <p class="wc-hint">Apply one kind, then run events one at a time. Each event names its actor and what has not happened yet. Pod names p1, p2 … are fixture UIDs: a replacement always gets a new one. Placement shows ownership and state, not scheduler internals.</p>
    </div>
  );
}
