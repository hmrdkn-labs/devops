import { createMemo, createSignal, For, onMount } from 'solid-js';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import * as k from '@/lib/anatomy/vendor/iso-kit';
import ChangeReport, { type Change } from '../shared/ChangeReport';
import ManifestPanel, { type ManifestLine } from '../shared/ManifestPanel';
import StateBadge, { type BadgeTone } from '../shared/StateBadge';
import {
  BAY_OFF, BAY_Y, BAY_Z, LAMP, P, RACK_X, TRAY_SLOT_X, TRAY_Y, TRAY_Z, VIEW_BOX, bedSvg, carriageBody, housingSvg, loadLevel, loadSvg,
  loadTag, minStop, needleD, pivotSvg, podBody, railSvg, rackBack, rackFront, rackGhost, rackTag, stopBody, trayBack, trayFront, trayTag,
} from './geometry';
import {
  MAX_REPLICA_CHOICES, REQUEST_CHOICES, TARGET_PERCENT, TRAFFIC_CHOICES, WINDOW_CHOICES, advance, initialCluster, onNode, readyCount,
  roomOn, setAutoscaler, setMaxReplicas, setTraffic, setWindow, stageOf, sync, utilizationOf, type Cluster, type ClusterEvent, type HpaStatus, type Pod, type Stage,
} from './model';
import {
  eventReport, inputReport, nothingDueReport, runStartReport, runSummaryReport, startReport, syncReport, type RunStep,
} from './report';
import './figure.css';

/** Manifest keys an interaction reads or writes, used to highlight the YAML panel. */
type ManifestKey = 'request' | 'max' | 'target' | 'window' | 'replicas';
interface PodView { el: SVGGElement; base: k.Point3; from: k.Point3; to: k.Point3; t: number }

const stageTone = { unassigned: 'wait', assigned: 'info', ready: 'pass' } satisfies Record<Stage, BadgeTone>;
const stageLabel = { unassigned: 'unassigned · Pending', assigned: 'assigned · not Ready', ready: 'Ready' } satisfies Record<Stage, string>;
const hpaTone = { 'no-metric': 'wait', 'no-change': 'info', held: 'wait', 'scale-up': 'selected', 'scale-down': 'selected' } satisfies Record<HpaStatus, BadgeTone>;
const RUN_LIMIT = 40;

/** Pod slot for its stage: the tray if unassigned, else its bay on its node. */
function slotOf(cluster: Cluster, pod: Pod): k.Point3 {
  const peers = cluster.pods.filter((candidate) => candidate.node === pod.node).sort((a, b) => a.id - b.id);
  const index = peers.findIndex((candidate) => candidate.id === pod.id);
  if (pod.node === null) return [TRAY_SLOT_X(Math.min(index, 5)), TRAY_Y, TRAY_Z];
  return [RACK_X[pod.node - 1]! + BAY_OFF[Math.min(index, 3)]!, BAY_Y, BAY_Z];
}

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  const [cluster, setCluster] = createSignal<Cluster>(initialCluster(250));
  const [report, setReport] = createSignal<Change>(startReport);
  const [busy, setBusy] = createSignal(false);
  const [touched, setTouched] = createSignal<ManifestKey[]>([]);
  let root: HTMLDivElement | undefined;
  let mounted = false;

  // Motion state: eased display values that chase the model. Only transforms and attributes change per frame.
  let carriageAt = cluster().replicas;
  let stopAt = cluster().maxReplicas;
  let needleAt = utilizationOf(cluster()) ?? 0;
  const rise: number[] = [0, 1, 2, 3].map((n) => (cluster().nodes.includes(n + 1) ? 0 : 60));
  const shown: number[] = [0, 1, 2, 3].map((n) => (cluster().nodes.includes(n + 1) ? 1 : 0));
  const views = new Map<number, PodView>();
  const ghostEls: Array<SVGGElement | undefined> = [];
  const backEls: Array<SVGGElement | undefined> = [];
  const frontEls: Array<SVGGElement | undefined> = [];
  let carriageEl: SVGGElement | undefined;
  let stopEl: SVGGElement | undefined;
  let needleEl: SVGPathElement | undefined;
  let runLeft = 0;
  let runLog: RunStep[] = [];

  function settleValue(at: number, target: number, dt: number, reduced: boolean, moving: { value: boolean }): number {
    if (reduced) return target;
    const next = at + (target - at) * (1 - Math.exp(-dt / 0.18));
    if (Math.abs(next - target) < 0.01) return target;
    moving.value = true;
    return next;
  }

  function animate(dt: number, reduced: boolean): boolean {
    const c = cluster();
    const moving = { value: false };
    carriageAt = settleValue(carriageAt, c.replicas, dt, reduced, moving);
    stopAt = settleValue(stopAt, c.maxReplicas, dt, reduced, moving);
    const live = utilizationOf(c);
    if (live !== null) needleAt = settleValue(needleAt, Math.min(200, live), dt, reduced, moving);
    carriageEl?.setAttribute('transform', k.translateAlong(P, [carriageAt * 10, 0, 0]));
    stopEl?.setAttribute('transform', k.translateAlong(P, [stopAt * 10, 0, 0]));
    needleEl?.setAttribute('d', live === null ? '' : needleD(needleAt));

    for (let n = 0; n < 4; n++) {
      const present = c.nodes.includes(n + 1);
      rise[n] = settleValue(rise[n]!, present ? 0 : 60, dt, reduced, moving);
      shown[n] = settleValue(shown[n]!, present ? 1 : 0, dt, reduced, moving);
      const lift = k.translateAlong(P, [0, 0, rise[n]!]);
      const opacity = String(shown[n]);
      backEls[n]?.setAttribute('transform', lift);
      backEls[n]?.setAttribute('opacity', opacity);
      frontEls[n]?.setAttribute('transform', lift);
      frontEls[n]?.setAttribute('opacity', opacity);
      ghostEls[n]?.setAttribute('opacity', String(1 - shown[n]!));
    }

    for (const [id, view] of views) {
      const pod = c.pods.find((candidate) => candidate.id === id);
      if (!pod) {
        views.delete(id);
        continue;
      }
      const to = slotOf(c, pod);
      if (to.some((value, index) => value !== view.to[index])) {
        view.from = [...view.base] as k.Point3;
        view.to = to;
        view.t = 0;
      }
      view.t = reduced ? 1 : Math.min(1, view.t + dt / 0.6);
      if (view.t < 1) moving.value = true;
      const e = view.t < 0.5 ? 2 * view.t * view.t : 1 - (-2 * view.t + 2) ** 2 / 2;
      const base = view.from.map((value, index) => value + (view.to[index]! - value) * e) as k.Point3;
      view.base = base;
      // A bay-to-bay or tray-to-bay move hops; a spawn only falls.
      const moves = view.from[0] !== view.to[0] || view.from[1] !== view.to[1];
      const hop = view.t < 1 && moves ? 22 * Math.sin(Math.PI * view.t) : 0;
      view.el.setAttribute('transform', k.translateAlong(P, [base[0], base[1], base[2] + hop]));
    }
    return moving.value;
  }

  function applyEvent(step: { next: Cluster; event: ClusterEvent }, before: Cluster) {
    setCluster(step.next);
    setReport(eventReport(step.event, before));
    setTouched(step.event.kind === 'create' || step.event.kind === 'delete' ? ['replicas'] : []);
  }

  /** Runs one queued controller step; returns false when the bounded run is finished. */
  function runOne(): boolean {
    const before = cluster();
    const step = runLeft > 0 ? advance(before) : null;
    if (!step) {
      const capped = runLeft === 0 && advance(before) !== null;
      runLeft = 0;
      setReport(runSummaryReport(runLog, before, capped));
      return false;
    }
    runLeft -= 1;
    runLog.push({ event: step.event, before });
    applyEvent(step, before);
    return true;
  }

  function frame(dt: number, reduced: boolean): boolean {
    if (animate(dt, reduced)) return true;
    if (runLeft > 0 && runOne()) return reduced ? frame(0, true) : true;
    setBusy(false);
    return false;
  }

  const wake = createAnatomyMotion(() => root, frame);
  onMount(() => {
    setHydrated(true);
    mounted = true;
  });

  function registerPod(id: number, el: SVGGElement | undefined) {
    const pod = cluster().pods.find((candidate) => candidate.id === id);
    if (!el || !pod) return;
    const to = slotOf(cluster(), pod);
    // A Pod created after mount falls onto its slot; initial Pods appear in place.
    const spawn: k.Point3 = mounted ? [to[0], to[1], to[2] + 30] : [...to];
    views.set(id, { el, base: spawn, from: spawn, to, t: mounted ? 0 : 1 });
    el.setAttribute('transform', k.translateAlong(P, spawn));
  }

  function commit(next: Cluster, change: Change, touch: ManifestKey[]) {
    setCluster(next);
    setReport(change);
    setTouched(touch);
    setBusy(true);
    wake();
  }

  const onTraffic = (traffic: number) => {
    if (busy()) return;
    const before = cluster();
    const after = setTraffic(before, traffic);
    commit(after, inputReport('traffic', before, after), []);
  };
  const onRequest = (request: number | null) => {
    if (busy()) return;
    const before = cluster();
    const after = { ...before, request };
    commit(after, inputReport('request', before, after), ['request', 'target']);
  };
  const onMax = (maxReplicas: number) => {
    if (busy()) return;
    const before = cluster();
    const after = setMaxReplicas(before, maxReplicas);
    commit(after, inputReport('maxReplicas', before, after), ['max']);
  };
  const onWindow = (windowSeconds: number) => {
    if (busy()) return;
    const before = cluster();
    const after = setWindow(before, windowSeconds);
    commit(after, inputReport('window', before, after), ['window']);
  };
  const onAutoscaler = (enabled: boolean) => {
    if (busy()) return;
    const before = cluster();
    const after = setAutoscaler(before, enabled);
    commit(after, inputReport('autoscaler', before, after), []);
  };
  const onSync = () => {
    if (busy()) return;
    const before = cluster();
    const result = sync(before);
    commit(result ? result.next : before, syncReport(before, result), result ? ['target', 'max', 'request', 'replicas'] : []);
  };
  const onStep = () => {
    if (busy()) return;
    const before = cluster();
    const step = advance(before);
    if (!step) {
      setReport(nothingDueReport(before));
      setTouched([]);
      return;
    }
    applyEvent(step, before);
    setBusy(true);
    wake();
  };
  const onRun = () => {
    if (busy()) return;
    const before = cluster();
    if (!advance(before)) {
      setReport(nothingDueReport(before));
      return;
    }
    runLeft = RUN_LIMIT;
    runLog = [];
    setReport(runStartReport);
    setTouched([]);
    setBusy(true);
    wake();
  };
  const onReset = () => {
    if (busy()) return;
    runLeft = 0;
    commit(initialCluster(250), startReport, []);
  };

  const podIds = createMemo(() => cluster().pods.map((pod) => pod.id).sort((a, b) => a - b));
  const pods = createMemo(() => [...cluster().pods].sort((a, b) => a.id - b.id));
  const pending = createMemo(() => cluster().pods.filter((pod) => pod.node === null).length);
  const nodeRows = createMemo(() => [1, 2, 3, 4].map((node) => ({
    node,
    present: cluster().nodes.includes(node),
    count: onNode(cluster(), node),
    room: roomOn(cluster(), node),
  })));
  const live = createMemo(() => {
    const c = cluster();
    const u = utilizationOf(c);
    const ready = readyCount(c);
    const measured = u === null
      ? 'Live: no CPU utilization (the container has no request, so no CPU target)'
      : `Live: ${Math.round(u)}% average CPU utilization (target ${TARGET_PERCENT}%) across ${ready} Ready Pod${ready === 1 ? '' : 's'}`;
    return `${measured} · Recorded at last sync: ${c.hpa.status}, desired ${c.hpa.desired}`;
  });
  const manifest = createMemo<ManifestLine[]>(() => {
    const c = cluster();
    const t = touched();
    const on = (key: ManifestKey) => t.includes(key);
    return [
      { text: 'apiVersion: apps/v1' },
      { text: 'kind: Deployment' },
      { text: 'metadata:' },
      { text: '  name: web' },
      { text: 'spec:' },
      { text: `  # live, written by the HPA (not in this file): spec.replicas: ${c.replicas}`, highlight: on('replicas') },
      { text: '  selector:' },
      { text: '    matchLabels:' },
      { text: '      app: web' },
      { text: '  template:' },
      { text: '    metadata:' },
      { text: '      labels:' },
      { text: '        app: web' },
      { text: '    spec:' },
      { text: '      containers:' },
      { text: '        - name: web' },
      { text: '          image: example.com/web:1.0' },
      { text: '          resources:' },
      { text: '            requests:' },
      c.request === null
        ? { text: '              # no cpu request: the HPA has no CPU target', highlight: on('request') }
        : { text: `              cpu: ${c.request}m`, highlight: on('request') },
      { text: '---' },
      { text: 'apiVersion: autoscaling/v2' },
      { text: 'kind: HorizontalPodAutoscaler' },
      { text: 'metadata:' },
      { text: '  name: web' },
      { text: 'spec:' },
      { text: '  scaleTargetRef:' },
      { text: '    apiVersion: apps/v1' },
      { text: '    kind: Deployment' },
      { text: '    name: web' },
      { text: '  minReplicas: 2' },
      { text: `  maxReplicas: ${c.maxReplicas}`, highlight: on('max') },
      { text: '  metrics:' },
      { text: '    - type: Resource' },
      { text: '      resource:' },
      { text: '        name: cpu' },
      { text: '        target:' },
      { text: '          type: Utilization' },
      { text: '          averageUtilization: 50', highlight: on('target') },
      { text: '  behavior:' },
      { text: '    scaleDown:' },
      { text: `      stabilizationWindowSeconds: ${c.windowSeconds}`, highlight: on('window') },
    ];
  });


  return <div ref={root} class="anatomy-figure as-figure" aria-label="Autoscaling bench controls" aria-busy={!hydrated()}>
    <div class="anatomy-figure-header"><span>Autoscaling · HPA</span><span>Metrics are not replicas</span></div>
    <svg class="iso-svg" viewBox={VIEW_BOX} role="img" aria-labelledby="as-title as-desc">
      <title id="as-title">Autoscaling bench: HPA dial, replica rail, node racks and Pending tray</title>
      <desc id="as-desc">A dial reads live CPU use against a 50% target. A carriage on the replica rail is spec.replicas and a stop is maxReplicas. Node racks hold Pods in bays; Pods on the tray are Pending and unassigned; a lit lamp means Ready. The tube at the front right is traffic outside the cluster.</desc>
      <g innerHTML={bedSvg} />
      <For each={[0, 1, 2, 3]}>{(n) => <>
        <g ref={(el) => { ghostEls[n] = el; }} innerHTML={rackGhost(RACK_X[n]!, n + 1)} />
        <g ref={(el) => { backEls[n] = el; }} innerHTML={rackBack(RACK_X[n]!)} />
      </>}</For>
      <g innerHTML={trayBack} />
      <g innerHTML={trayTag(pending())} />
      <For each={podIds()}>{(id) => <g class="as-pod" ref={(el) => registerPod(id, el)}>
        <g innerHTML={podBody(id)} />
        <circle class="as-lamp" cx={LAMP[0]} cy={LAMP[1]} r="1.2" data-ready={String(cluster().pods.find((pod) => pod.id === id)?.ready ?? false)} />
      </g>}</For>
      <For each={[0, 1, 2, 3]}>{(n) => <g ref={(el) => { frontEls[n] = el; }}>
        <g innerHTML={rackFront(RACK_X[n]!)} />
        <g innerHTML={rackTag(RACK_X[n]!, n + 1, nodeRows()[n]!.count)} />
      </g>}</For>
      <g innerHTML={trayFront} />
      <g innerHTML={housingSvg} />
      <path ref={(el) => { needleEl = el; }} class="iso-line" data-tone="lit" d="" />
      <g innerHTML={pivotSvg} />
      <g innerHTML={loadSvg} />
      <g innerHTML={loadLevel(cluster().traffic)} />
      <g innerHTML={loadTag(cluster().traffic)} />
      <g innerHTML={railSvg} />
      <g innerHTML={minStop} />
      <g ref={(el) => { stopEl = el; }} innerHTML={stopBody(cluster().maxReplicas)} />
      <g ref={(el) => { carriageEl = el; }} innerHTML={carriageBody(cluster().replicas)} />
    </svg>
    <ul class="anatomy-legend"><li>Dial = live CPU ÷ request against the 50% target</li><li>Carriage = spec.replicas</li><li>Stop = maxReplicas</li><li>Racks = nodes, bays hold Pods</li><li>Tray = Pending Pods</li><li>Lit lamp = Ready</li></ul>
    <div class="anatomy-controls as-controls">
      <label class="as-field"><span>Load on web Pods</span>
        <select aria-label="Load on web Pods (total CPU)" disabled={!hydrated() || busy()} onChange={(e) => onTraffic(Number(e.currentTarget.value))}>
          <For each={[...TRAFFIC_CHOICES]}>{(value) => <option value={String(value)} selected={cluster().traffic === value}>{`${value}m total`}</option>}</For>
        </select>
      </label>
      <label class="as-field"><span>Container CPU request</span>
        <select aria-label="Container CPU request" disabled={!hydrated() || busy()} onChange={(e) => onRequest(e.currentTarget.value === 'none' ? null : Number(e.currentTarget.value))}>
          <For each={[...REQUEST_CHOICES]}>{(value) => <option value={value === null ? 'none' : String(value)} selected={cluster().request === value}>{value === null ? 'no request' : `${value}m request`}</option>}</For>
        </select>
      </label>
      <label class="as-field"><span>HPA maxReplicas</span>
        <select aria-label="HPA maxReplicas" disabled={!hydrated() || busy()} onChange={(e) => onMax(Number(e.currentTarget.value))}>
          <For each={[...MAX_REPLICA_CHOICES]}>{(value) => <option value={String(value)} selected={cluster().maxReplicas === value}>{`max ${value}`}</option>}</For>
        </select>
      </label>
      <label class="as-field"><span>Scale-down window</span>
        <select aria-label="Scale-down stabilization window" disabled={!hydrated() || busy()} onChange={(e) => onWindow(Number(e.currentTarget.value))}>
          <For each={[...WINDOW_CHOICES]}>{(value) => <option value={String(value)} selected={cluster().windowSeconds === value}>{`${value} s (${value === 0 ? '1 sync' : '3 syncs'})`}</option>}</For>
        </select>
      </label>
      <label class="as-check"><input type="checkbox" checked={cluster().autoscaler} disabled={!hydrated() || busy()} onChange={(e) => onAutoscaler(e.currentTarget.checked)} /><span>Cluster Autoscaler may add nodes</span></label>
    </div>
    <div class="anatomy-controls as-actions">
      <button type="button" disabled={!hydrated() || busy()} onClick={onSync}>Run one HPA sync (15 s)</button>
      <button type="button" disabled={!hydrated() || busy()} onClick={onStep}>Next controller step</button>
      <button type="button" disabled={!hydrated() || busy()} onClick={onRun}>Run controllers to quiet</button>
      <button type="button" disabled={!hydrated() || busy()} onClick={onReset}>Reset</button>
    </div>
    <p class="anatomy-readout" data-readout>{live()}</p>
    <ChangeReport change={report()} busy={busy()} />
    <ul class="as-ledger" aria-label="Per-object status">
      <li><span class="as-name">HPA web</span> <StateBadge tone={hpaTone[cluster().hpa.status]} label={`${cluster().hpa.status} at last sync`} /> <span>spec.replicas {cluster().replicas} · maxReplicas {cluster().maxReplicas}</span></li>
      <For each={nodeRows()}>{(row) => <li>
        <span class="as-name">node-{row.node}</span> {row.present
          ? `${row.count} web Pod${row.count === 1 ? '' : 's'} · room for ${row.room} more`
          : 'not provisioned'}
      </li>}</For>
      <For each={pods()}>{(pod) => <li>
        <span class="as-name">web-{pod.id}</span> <StateBadge tone={stageTone[stageOf(pod)]} label={stageLabel[stageOf(pod)]} /> <span>{pod.node === null ? 'no node' : `node-${pod.node}`}</span>
      </li>}</For>
    </ul>
    <p class="as-caption">Fixture: one HPA sync per 15 s; Pods are removed at once; the stand-in scheduler picks the node with room and the fewest web Pods. The default scale-down window is 300 s; this page uses 0 or 45 s so the effect shows in a few syncs.</p>
    <ManifestPanel title="Live manifest from the model" lines={manifest()} note="Marked lines are what the last interaction read or changed. Traffic is not a manifest field." />
  </div>;
}
