import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import ChangeReport, { type Change } from '@/components/anatomy/shared/ChangeReport';
import ManifestPanel from '@/components/anatomy/shared/ManifestPanel';
import StateBadge, { type BadgeTone } from '@/components/anatomy/shared/StateBadge';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import {
  backPostSvg, benchSvg, CARTRIDGE_H, cartridgeSvg, cellSvg, frontPostSvg, HEIGHT, hangerPath, LID_LIFT, lidSvg, move, PORT_TAG,
  podLabels, railSvg, rimSvg, rulerSvg, stationX, stopMarkSvg, towerSvg, trolleySvg, VIEW,
} from './geometry';
import {
  appliedGate, evaluate, flows, hatchesOf, hatchOfGate, HATCHES, initialConfig, manifestFor, NAMESPACE, pods, PODS, policiesSelecting,
  postureOf, tagsForChange, tagsForVerdict, type Check, type Config, type Gate, type Hatch, type PodId, type Posture, type Probe, type Verdict,
} from './model';
import { passingHatches, routeFor, type RouteKey } from './route';
import {
  changeForConfig, changeForProbe, gateName, gatePolicy, probeName, probeRunningChange, probeSelectedChange, readyChange, resetChange,
} from './report';
import './figure.css';

const LID_SPEED = 30;
const CAR_SPEED = 220;
const DROP_SPEED = 120;
/** Seconds the cartridge rests at each station before the next keyframe. */
const DWELL = 0.3;

const approach = (at: number, to: number, max: number) => (Math.abs(to - at) <= max ? to : at + Math.sign(to - at) * max);

const dialled: Record<Probe, string> = { 'client-web': '80', 'web-db': '5432', 'client-db': '5432' };
const podName: Record<PodId, string> = { client: 'client', 'web-a': 'web-7c9d4-x2kq8', 'web-b': 'web-7c9d4-m8vz3', db: 'db' };
const podTitle: Record<PodId, string> = { client: 'client', 'web-a': 'web-a · web-7c9d4-x2kq8', 'web-b': 'web-b · web-7c9d4-m8vz3', db: 'db' };

// Static parts are built once; only transforms, visibility and the port label change during motion.
const cellMarkup: Record<PodId, string> = { client: cellSvg('client'), 'web-a': cellSvg('web-a'), 'web-b': cellSvg('web-b'), db: cellSvg('db') };
const rimMarkup = Object.fromEntries(HATCHES.map((hatch) => [hatch, rimSvg(hatch)])) as Record<Hatch, string>;
const lidMarkup = Object.fromEntries(HATCHES.map((hatch) => [hatch, lidSvg(hatch)])) as Record<Hatch, string>;
const stopMarkup = Object.fromEntries(HATCHES.map((hatch) => [hatch, stopMarkSvg(hatch)])) as Record<Hatch, string>;

function liftFor(hatch: Hatch, c: Config, passing: readonly Hatch[]): number {
  const checking = postureOf(c)[hatch] === 'armed' && !passing.includes(hatch);
  return checking ? 0 : LID_LIFT;
}

function postureBadge(posture: Posture, direction: string): { tone: BadgeTone; label: string } {
  if (posture === 'armed') return { tone: 'selected', label: `${direction}: isolated, gate checks` };
  if (posture === 'stored') return { tone: 'info', label: `${direction}: stored, not enforced` };
  return { tone: 'info', label: `${direction}: non-isolated` };
}

function checkBadge(gate: Gate, check: Check | null, c: Config): { tone: BadgeTone; label: string } {
  switch (check) {
    case null: return { tone: 'wait', label: 'not run yet' };
    case 'pass': return { tone: 'pass', label: 'admitted' };
    case 'block': return { tone: 'fail', label: 'dropped here' };
    case 'not-reached': return { tone: 'wait', label: 'not reached' };
    case 'not-armed': return { tone: 'info', label: appliedGate(gate, c) ? 'stored, not enforced' : 'no policy applies' };
  }
}

/** What the last probe did at one Pod's own gates. Only Pods on the probe's path can report a gate. */
function probeLine(pod: PodId, v: Verdict): { tone: BadgeTone; label: string } {
  const flow = flows[v.probe];
  if (pod !== flow.src && pod !== flow.dst) return { tone: 'info', label: 'not on this probe path' };
  const stoppedAt = v.stopped ? hatchOfGate[v.stopped] : null;
  if (stoppedAt !== null && stoppedAt === hatchesOf[pod].out) return { tone: 'fail', label: 'dropped at this Pod’s egress gate' };
  if (stoppedAt !== null && stoppedAt === hatchesOf[pod].in) return { tone: 'fail', label: 'dropped at this Pod’s ingress gate' };
  if (pod === flow.src) return { tone: 'pass', label: 'probe left this Pod' };
  return v.delivered ? { tone: 'pass', label: 'probe arrived here' } : { tone: 'wait', label: 'probe did not arrive' };
}

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  const [config, setConfig] = createSignal<Config>({ ...initialConfig });
  const [probe, setProbe] = createSignal<Probe>('client-web');
  const [verdict, setVerdict] = createSignal<Verdict | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [report, setReport] = createSignal<Change>(readyChange());
  const [activeTags, setActiveTags] = createSignal<readonly string[]>([]);
  const [portLabel, setPortLabel] = createSignal(dialled['client-web']);

  let root: HTMLDivElement | undefined;
  let carrier: SVGGElement | undefined;
  let cartridge: SVGGElement | undefined;
  let hanger: SVGPathElement | undefined;
  const lids: Array<SVGGElement | undefined> = [];

  // Motion state lives outside signals: it changes every frame and only drives SVG attributes.
  let carX = stationX('client-out');
  let carZ: number = HEIGHT.hover;
  let carHidden = false;
  let lidNow: number[] = HATCHES.map(() => LID_LIFT);
  let lidTarget: number[] = [...lidNow];
  let current: { keys: RouteKey[]; index: number; dwell: number; done: () => void } | null = null;

  function drawCar() {
    carrier?.setAttribute('transform', move(carX));
    cartridge?.setAttribute('transform', move(0, 0, carZ));
    cartridge?.setAttribute('visibility', carHidden ? 'hidden' : 'visible');
    hanger?.setAttribute('d', hangerPath(carZ + CARTRIDGE_H));
    hanger?.setAttribute('visibility', carHidden ? 'hidden' : 'visible');
  }

  function drawLids() {
    HATCHES.forEach((_, i) => lids[i]?.setAttribute('transform', move(0, 0, lidNow[i]!)));
  }

  /** Finishes the current run at its final keyframe and reports the result once. */
  function completeRun() {
    const run = current;
    if (!run) return;
    current = null;
    const last = run.keys[run.keys.length - 1]!;
    for (const key of run.keys) if (key.label) setPortLabel(key.label);
    carX = stationX(last.at);
    carZ = HEIGHT[last.height];
    carHidden = Boolean(last.hide);
    lidNow = [...lidTarget];
    drawCar();
    drawLids();
    setBusy(false);
    run.done();
  }

  const wake = createAnatomyMotion(() => root, (dt, reduced) => {
    if (reduced) {
      completeRun();
      lidNow = [...lidTarget];
      drawLids();
      return false;
    }
    let moving = false;
    lidNow = lidNow.map((at, i) => {
      const to = lidTarget[i]!;
      if (at === to) return at;
      moving = true;
      return approach(at, to, LID_SPEED * dt);
    });
    drawLids();
    if (current) {
      moving = true;
      const key = current.keys[current.index]!;
      const tx = stationX(key.at);
      const tz = HEIGHT[key.height];
      carX = approach(carX, tx, CAR_SPEED * dt);
      carZ = approach(carZ, tz, DROP_SPEED * dt);
      if (carX === tx && carZ === tz) {
        if (key.label) setPortLabel(key.label);
        if (key.hide) carHidden = true;
        current.dwell += dt;
        if (current.dwell >= DWELL) {
          current.index += 1;
          current.dwell = 0;
          if (current.index >= current.keys.length) completeRun();
        }
      }
      drawCar();
    }
    return moving;
  });

  function run(keys: RouteKey[], passing: readonly Hatch[], done: () => void) {
    const c = config();
    lidTarget = HATCHES.map((hatch) => liftFor(hatch, c, passing));
    if (carHidden) {
      // A cartridge that entered a Pod re-appears at its source rather than travelling back from the destination.
      carX = stationX(keys[0]!.at);
      carZ = HEIGHT[keys[0]!.height];
      carHidden = false;
    }
    current = { keys, index: 0, dwell: 0, done };
    setBusy(true);
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      completeRun();
      return;
    }
    wake();
  }

  function park(p: Probe, done: () => void = () => {}) {
    setPortLabel(dialled[p]);
    run([{ at: flows[p].from, height: 'hover' }], [], done);
  }

  function sendProbe() {
    if (busy() || !hydrated()) return;
    const c = config();
    const p = probe();
    const v = evaluate(c, p);
    setVerdict(null);
    setActiveTags([]);
    setPortLabel(dialled[p]);
    setReport(probeRunningChange(p));
    run([{ at: flows[p].from, height: 'hover' }, ...routeFor(v)], passingHatches(v), () => {
      setVerdict(v);
      setReport(changeForProbe(c, v));
      setActiveTags(tagsForVerdict(v));
    });
  }

  function configure(patch: Partial<Config>) {
    if (busy() || !hydrated()) return;
    const prev = config();
    const next = { ...prev, ...patch };
    setConfig(next);
    setVerdict(null);
    setActiveTags(tagsForChange(Object.keys(patch)[0] as keyof Config));
    setReport(changeForConfig(prev, next));
    park(probe());
  }

  function selectProbe(p: Probe) {
    if (busy() || !hydrated()) return;
    setProbe(p);
    setVerdict(null);
    setActiveTags([]);
    setReport(probeSelectedChange(p));
    park(p);
  }

  function reset() {
    if (busy() || !hydrated()) return;
    setConfig({ ...initialConfig });
    setVerdict(null);
    setActiveTags([]);
    setReport(resetChange());
    park(probe());
  }

  onMount(() => setHydrated(true));

  const postures = createMemo(() => postureOf(config()));
  const stopHatch = createMemo<Hatch | null>(() => {
    const v = verdict();
    return v && v.stopped ? hatchOfGate[v.stopped] : null;
  });
  const manifest = createMemo(() => manifestFor(config()).map((line) => ({
    text: line.text,
    highlight: line.tags.some((tag) => activeTags().includes(tag)),
  })));
  const ledger = createMemo(() => flows[probe()].gates.map((gate) => ({ gate, check: verdict()?.checks[gate] ?? null })));

  return <div ref={root} class="anatomy-figure np-figure" aria-busy={!hydrated()}>
    <div class="anatomy-figure-header"><span>Fig · Networking</span><span>Isolation is per direction</span></div>
    <div class="anatomy-bench">
    <div class="anatomy-bench-object">
    <p class="np-identities">
      <span>Namespace <b>{NAMESPACE}</b></span>
      <span>Service <b>web</b> selects <b>app=web</b>, port 80 → targetPort 8080</span>
      <span>Pods <b>web-7c9d4-x2kq8</b>, <b>web-7c9d4-m8vz3</b></span>
      <span><b>client</b> role=frontend</span>
      <span><b>db</b> app=db</span>
    </p>
    <svg class="iso-svg np-svg" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`} role="img" aria-labelledby="np-title np-desc">
      <title id="np-title">Four Pods on a bench, each with an egress and an ingress gate</title>
      <desc id="np-desc">A cartridge carries one probe from the source's egress gate to the destination's ingress gate. A lowered, accent-edged lid is an applied policy checking traffic; a raised lid lets traffic pass, and a dashed edge marks a policy that is stored but not enforced. A red cross marks the gate where a probe stopped. The Service tower rewrites port 80 to 8080.</desc>
      <g innerHTML={benchSvg} />
      <For each={PODS}>{(pod) => <g innerHTML={cellMarkup[pod]} />}</For>
      <For each={PODS}>{(pod) => <text class="np-id" x={podLabels[pod][0]} y={podLabels[pod][1]} text-anchor="middle">{podName[pod]}</text>}</For>
      <For each={HATCHES}>{(hatch) => <g innerHTML={rimMarkup[hatch]} />}</For>
      <For each={HATCHES}>{(hatch, i) => <g ref={(el) => { lids[i()] = el; }} class="np-lid" data-hatch={hatch} data-posture={postures()[hatch]} transform={move(0, 0, LID_LIFT)} innerHTML={lidMarkup[hatch]} />}</For>
      <For each={HATCHES}>{(hatch) => <g class="np-stop" data-hatch={hatch} visibility={stopHatch() === hatch ? 'visible' : 'hidden'} innerHTML={stopMarkup[hatch]} />}</For>
      <g innerHTML={towerSvg} />
      <g innerHTML={backPostSvg} />
      <g innerHTML={frontPostSvg} />
      <g innerHTML={railSvg} />
      <g innerHTML={rulerSvg} />
      <g ref={carrier} transform={move(carX)}>
        <g innerHTML={trolleySvg} />
        <path ref={hanger} class="iso-line np-hanger" data-tone="lo" d={hangerPath(carZ + CARTRIDGE_H)} />
        <g ref={cartridge} class="np-cartridge" transform={move(0, 0, carZ)}>
          <g innerHTML={cartridgeSvg} />
          <g class="np-port-tag">
            <rect x={PORT_TAG.x} y={PORT_TAG.y} width={PORT_TAG.width} height={PORT_TAG.height} rx="3" />
            <text x={PORT_TAG.textX} y={PORT_TAG.textY} text-anchor="middle">{portLabel()}</text>
          </g>
        </g>
      </g>
    </svg>
    <fieldset class="anatomy-controls np-fields" disabled={!hydrated() || busy()}>
      <legend>Cluster and policy objects</legend>
      <label><input type="checkbox" checked={config().enforcing} onChange={(e) => configure({ enforcing: e.currentTarget.checked })} />CNI enforces NetworkPolicy</label>
      <label><input type="checkbox" checked={config().clientEgress} onChange={(e) => configure({ clientEgress: e.currentTarget.checked })} />Apply client-egress (selects role=frontend)</label>
      <label><input type="checkbox" checked={config().dnsAllowed} disabled={!config().clientEgress} onChange={(e) => configure({ dnsAllowed: e.currentTarget.checked })} />client-egress allows DNS to kube-dns (UDP and TCP 53)</label>
      <label><input type="checkbox" checked={config().webIngress} onChange={(e) => configure({ webIngress: e.currentTarget.checked })} />Apply web-ingress (selects app=web)</label>
      <label>web-ingress port
        <select value={String(config().webPort)} disabled={!config().webIngress} onChange={(e) => configure({ webPort: Number(e.currentTarget.value) as 80 | 8080 })}>
          <option value="8080" selected={config().webPort === 8080}>8080 · Pod port</option>
          <option value="80" selected={config().webPort === 80}>80 · Service port (mistake)</option>
        </select>
      </label>
      <label><input type="checkbox" checked={config().dbIngress} onChange={(e) => configure({ dbIngress: e.currentTarget.checked })} />Apply db-ingress (selects app=db)</label>
    </fieldset>
    <p class="np-hint">The port and DNS controls edit a rule that exists only after its policy is applied. Stored objects stay in the API even when the plugin does not enforce them.</p>
    <ul class="anatomy-legend">
      <li>Pod cell = one Pod</li>
      <li>Accent-edged closed lid = applied policy checking traffic</li>
      <li>Raised lid = open, or stored but not enforced</li>
      <li>Dashed lid edge = stored, not enforced</li>
      <li>Red cross = gate where the probe stopped</li>
      <li>Overhead cartridge = one probe</li>
      <li>Tower = Service web, port 80 to 8080</li>
    </ul>
    </div>
    <div class="anatomy-bench-panel">
    <div class="anatomy-controls np-probe-controls">
      <label>Probe
        <select value={probe()} disabled={!hydrated() || busy()} onChange={(e) => selectProbe(e.currentTarget.value as Probe)}>
          <For each={Object.keys(flows) as Probe[]}>{(p) => <option value={p} selected={probe() === p}>{`${probeName[p]} (port ${dialled[p]})`}</option>}</For>
        </select>
      </label>
      <button type="button" data-anatomy-primary disabled={!hydrated() || busy()} onClick={sendProbe}>Send probe</button>
      <button type="button" disabled={!hydrated() || busy()} onClick={reset}>Reset fixture</button>
    </div>
    <ChangeReport change={report()} busy={busy()} />
    <div class="np-status" data-anatomy-status>
      <h3 class="anatomy-panel-heading">Pods: egress gate · ingress gate · last probe</h3>
      <ul class="anatomy-status-list np-cards">
        <For each={PODS}>{(pod) => {
          const out = hatchesOf[pod].out;
          const inbound = hatchesOf[pod].in;
          return <li class="np-card" data-pod={pod}>
            <span class="np-pod">
              <strong>{podTitle[pod]}</strong>
              <span class="np-labels">{Object.entries(pods[pod].labels).map(([k, v]) => `${k}=${v}`).join(', ')}</span>
              <span class="np-selected">Selected by: {policiesSelecting(pod, config()).join(', ') || 'no policy'}</span>
            </span>
            <StateBadge tone={postureBadge(postures()[out], 'egress').tone} label={postureBadge(postures()[out], 'egress').label} />
            <StateBadge tone={postureBadge(postures()[inbound], 'ingress').tone} label={postureBadge(postures()[inbound], 'ingress').label} />
            <Show when={verdict()}>
              <StateBadge tone={probeLine(pod, verdict()!).tone} label={probeLine(pod, verdict()!).label} />
            </Show>
          </li>;
        }}</For>
      </ul>
      <section class="np-ledger-wrap" aria-label="Gate ledger for the selected probe">
        <h3 class="anatomy-panel-heading">Gate ledger · {probeName[probe()]}</h3>
        <Show when={verdict()} fallback={<p class="np-hint">Gates run in order when the probe is sent; a result appears only after the cartridge stops or is seated.</p>}>
          <p class="np-hint">{verdict()!.delivered ? 'Every armed gate on this path admitted the probe.' : `Stopped at ${gateName[verdict()!.stopped!]}; later gates were not reached.`}</p>
        </Show>
        <ol class="anatomy-status-list np-ledger">
          <For each={ledger()}>{(row) => {
            const badge = () => checkBadge(row.gate, verdict()?.checks[row.gate] ?? null, config());
            return <li>
              <span><span class="np-gate">{gateName[row.gate]}</span> <span class="np-muted">{gatePolicy[row.gate]}</span></span>
              <StateBadge tone={badge().tone} label={badge().label} />
            </li>;
          }}</For>
        </ol>
      </section>
    </div>
    </div>
    </div>
    <ManifestPanel title={`Objects in namespace ${NAMESPACE}`} lines={manifest()} note="Highlighted lines are what the last change or probe read. Stored objects stay in the API even when the plugin does not enforce them." />
  </div>;
}
