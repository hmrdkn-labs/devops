import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import ChangeReport, { type Change } from '@/components/anatomy/shared/ChangeReport';
import ManifestPanel, { type ManifestLine } from '@/components/anatomy/shared/ManifestPanel';
import StateBadge, { type BadgeTone } from '@/components/anatomy/shared/StateBadge';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import * as k from '@/lib/anatomy/vendor/iso-kit';
import { base, blade, cartridge, frame, laneFloor, laneY, move, P } from './geometry';
import {
  evaluate, initialConfig, nextSerial, nodeACpuFree, nodeYaml, podCpuRequest, podName, podYaml, profiles, runMarkIds,
  type Config, type Evaluation, type FieldName, type FieldRow, type Profile, type Verdict,
} from './model';
import './figure.css';

// Geometry is built once; only carriage and lift transforms change during motion.
const lanes = laneY.map((y) => ({ floor: laneFloor(y), car: cartridge(y),
  gates: [-40, 36].map((x) => ({ back: frame(y, x, false), blade: blade(y, x), front: frame(y, x, true) })) }));

const START = -108;
const STOP = { taint: -68, capacity: 8, end: 96 } as const;
const OPEN = 38;
const CART_Z = 44;
// The Pod label floats above the cartridge so it clears the lane's node label at narrow widths.
const POD_TAG_Z = CART_Z + 34;

type Result = Evaluation;
type Edit = 'create' | 'profile' | 'taint' | 'cpu' | 'nodeB' | 'reset';
type Badge = { tone: BadgeTone; label: string };

const groups = [['basic', 'Basic match'], ['operator', 'Operator Exists'], ['advanced', 'Advanced: empty effect or key']] as const;
// Manifest ids an edit changes. After a run, runMarkIds names the fields the outcome depends on.
const editMarks: Record<Edit, string[]> = {
  create: [],
  reset: [],
  nodeB: [],
  profile: ['pod.key', 'pod.operator', 'pod.value', 'pod.effect'],
  taint: ['node.taints', 'node.key', 'node.value', 'node.effect'],
  cpu: ['node.cpu'],
};
const verdictNote: Record<Verdict, string | undefined> = {
  match: '✓ same as node-a taint',
  wildcard: '✓ empty matches any',
  mismatch: '✕ differs from node-a taint',
  'not-tested': '· value not compared (Exists)',
  absent: '✕ no toleration',
  info: undefined,
  'no-taint': undefined,
};

/** Screen position, as percent of the 720×430 figure, for HTML labels that sit next to world-space objects. */
function screenAt(x: number, y: number, z: number) {
  const [sx, sy] = k.iso([x, y, z], P);
  return { left: `${sx / 7.2}%`, top: `${sy / 4.3}%` };
}

function podNote(id: string, r: Result): string | undefined {
  if (id === 'pod.cpu') return r.capacityPass ? `✓ fits ${r.cpuFree}m free` : `✕ only ${r.cpuFree}m free`;
  const field = id.slice(4) as FieldName;
  const verdict = r.rows.find((row) => row.field === field)?.verdict;
  return verdict ? verdictNote[verdict] : undefined;
}

function rejectReason(rows: FieldRow[]): string {
  if (rows.some((row) => row.verdict === 'absent')) return 'the Pod has no toleration for dedicated=batch:NoSchedule';
  return rows.filter((row) => row.verdict === 'mismatch').map((row) => `${row.field}: Pod tolerates ${row.pod}, node-a taint is ${row.node}`).join('; ');
}

function editChange(edit: Edit, config: Config, name: string, replaced?: string): Change {
  const label = profiles[config.profile].label;
  const notYet = 'No filter has run. No node is assigned. No container exists.';
  const earlier = replaced
    ? `The earlier Pod ${replaced} is left as it was; a bound Pod is never moved by this fixture.`
    : `Nothing has run on ${name} yet, so it is edited in place and keeps its name.`;
  switch (edit) {
    case 'create':
      return { title: `${name} created · unassigned`, changed: `spec.nodeName is unset. Requests ${podCpuRequest}m CPU and 256Mi memory. Toleration: ${label}. node-a ${config.tainted ? 'carries dedicated=batch:NoSchedule' : 'has no taint'}.`, actor: 'Workload author for the Pod spec; cluster administrator for the node taint.', reason: 'The scheduler reads node taints and Pod tolerations only when it filters an unassigned Pod.', notYet };
    case 'profile':
      return { title: `${name} · toleration changed`, changed: `Toleration is now ${label}.`, actor: 'You, standing in for the workload author who writes the Pod template toleration.', reason: `Tolerations are read only when filters run on an unassigned Pod. ${earlier}`, notYet };
    case 'taint':
      return { title: `${name} · node-a taint changed`, changed: `node-a ${config.tainted ? 'now carries dedicated=batch:NoSchedule' : 'now has no taint'}. Toleration unchanged: ${label}.`, actor: 'Cluster administrator, who taints the Node object.', reason: 'A taint applies to every Pod scheduled to node-a, so it belongs to the node, not to one Pod.', notYet: 'No Pod on node-a is evicted: NoSchedule only affects new placements, and this fixture models no running Pod.' };
    case 'cpu':
      return { title: `${name} · node-a free CPU changed`, changed: `node-a has ${nodeACpuFree(config)}m CPU free for new requests. The Pod still requests ${podCpuRequest}m.`, actor: 'Cluster state: requests already committed by other Pods on node-a, not a setting on this Pod.', reason: 'The capacity filter compares the request with free allocatable CPU, not with live usage.', notYet: 'Capacity has not been checked. The taint check is independent and has not run.' };
    case 'nodeB':
      return { title: `${name} · node-b ${config.nodeB ? 'present' : 'absent'}`, changed: config.nodeB ? 'node-b is untainted with 1000m CPU free, so it can take the 600m request.' : 'node-b is not in this fixture.', actor: 'Cluster state: node-b’s taints and free CPU.', reason: 'With both nodes eligible, the fixture’s fixed score picks node-b. No toleration adds score.', notYet };
    case 'reset':
      return { title: `${name} · reset`, changed: 'Restored: no toleration, node-a tainted, 800m free, node-b absent.', actor: 'You, using Reset.', reason: `Reset is a change like any other. ${earlier}`, notYet };
  }
}

function runChange(config: Config, r: Result, name: string): Change {
  const taintPart = !config.tainted
    ? 'node-a has no taint, so the taint check passes without a toleration.'
    : r.taintPass ? 'Every compared field matches node-a’s taint.' : `Taint rejects: ${rejectReason(r.rows)}.`;
  const capacityPart = r.capacityPass
    ? `CPU fits: ${podCpuRequest}m requested, ${r.cpuFree}m free.`
    : `CPU short: ${podCpuRequest}m requested, only ${r.cpuFree}m free.`;
  const selectionPart = r.selected === 'node-b'
    ? (r.eligibleA ? 'node-b is eligible and wins the fixed fixture score (20 vs 10); the toleration adds nothing.' : 'node-b is the only eligible node.')
    : r.selected === 'node-a' ? 'node-a is the only eligible node.' : 'No node is eligible, so the scheduler does not force a placement.';
  return {
    title: r.selected ? `${name} assigned to ${r.selected}` : `${name} unscheduled`,
    changed: `${r.selected ? `spec.nodeName set to ${r.selected} by binding` : 'Pod stays unassigned (Pending)'}. node-a taint ${r.taintPass ? 'permits' : 'rejects'}; node-a CPU ${r.capacityPass ? 'fits' : 'is short'}; node-b ${config.nodeB ? 'eligible' : 'not in fixture'}.`,
    actor: 'kube-scheduler: runs the filters, scores eligible nodes, then binds the winner.',
    reason: `${taintPart} ${capacityPart} ${selectionPart}`,
    notYet: r.selected
      ? `Assigned is not Running: ${r.selected}’s kubelet has not started the container, and Ready is not evaluated.`
      : 'Nothing is bound and no container runs. This fixture does not retry the Pod.',
  };
}

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  onMount(() => {
    setHydrated(true);
    placePodTag();
  });
  let root: HTMLDivElement | undefined;
  let podTag: HTMLSpanElement | undefined;
  const cars: Array<SVGGElement | undefined> = [];
  const gates: Array<SVGGElement | undefined> = [];
  const [config, setConfig] = createSignal<Config>({ ...initialConfig });
  const [serial, setSerial] = createSignal(1);
  const [ran, setRan] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [marks, setMarks] = createSignal<string[]>([]);
  const [change, setChange] = createSignal<Change>(editChange('create', initialConfig, podName(1)));
  const result = createMemo(() => evaluate(config()));
  let carX = START;
  let targetX = START;
  const lift = [0, 0, 0, 0];
  let targetLift = [0, 0, 0, 0];

  const wake = createAnatomyMotion(() => root, (dt, reduced) => {
    const follow = (at: number, target: number) => {
      const next = reduced ? target : at + (target - at) * (1 - Math.exp(-dt / .18));
      return Math.abs(next - target) < .025 ? target : next;
    };
    carX = follow(carX, targetX);
    cars.forEach((car) => car?.setAttribute('transform', move(carX)));
    placePodTag();
    lift.forEach((at, i) => {
      lift[i] = follow(at, targetLift[i]!);
      gates[i]?.setAttribute('transform', move(0, 0, lift[i]!));
    });
    const moving = carX !== targetX || lift.some((at, i) => at !== targetLift[i]);
    if (!moving && busy()) {
      setBusy(false);
      setRan(true);
      setChange(runChange(config(), result(), podName(serial())));
      setMarks(runMarkIds(config(), result()));
    }
    return moving;
  });

  function placePodTag() {
    if (!podTag) return;
    const [sx, sy] = k.iso([carX, laneY[config().nodeB ? 1 : 0]!, POD_TAG_Z], P);
    podTag.style.left = `${sx / 7.2}%`;
    podTag.style.top = `${sy / 4.3}%`;
  }

  // A change before any run edits the pending Pod in place. After a run, the bound Pod is left as it was and the change creates the next Pod.
  function configure(next: Config, edit: Edit) {
    if (busy()) return;
    const replaced = ran() ? podName(serial()) : undefined;
    setConfig(next);
    setSerial(nextSerial(serial(), ran()));
    setRan(false);
    setChange(editChange(edit, next, podName(serial()), replaced));
    setMarks(editMarks[edit]);
    carX = targetX = START;
    targetLift = [0, 0, 0, 0];
    cars.forEach((car) => car?.setAttribute('transform', move(carX)));
    placePodTag();
    wake();
  }

  function run() {
    if (busy()) return;
    const r = result();
    const c = config();
    carX = START;
    cars.forEach((car) => car?.setAttribute('transform', move(carX)));
    targetX = r.selected ? STOP.end : STOP[r.cartStop];
    // Each blade follows its own verdict; the capacity blade lifts even when the taint blade stops the Pod.
    targetLift = [r.taintPass ? OPEN : 0, r.capacityPass ? OPEN : 0, c.nodeB ? OPEN : 0, c.nodeB ? OPEN : 0];
    setBusy(true);
    setMarks([]);
    wake();
  }

  const nodeLines = createMemo<ManifestLine[]>(() => nodeYaml(config()).map((line) => ({
    text: line.text, highlight: !!line.id && marks().includes(line.id),
  })));
  const podLines = createMemo<ManifestLine[]>(() => podYaml(config(), serial()).map((line) => {
    const note = ran() && line.id ? podNote(line.id, result()) : undefined;
    return { text: note ? `${line.text}  # ${note}` : line.text, highlight: !!line.id && marks().includes(line.id) };
  }));

  const taintBadge = (): Badge => {
    if (!ran()) return { tone: 'wait', label: busy() ? 'taint: checking' : 'taint: not run' };
    if (!config().tainted) return { tone: 'pass', label: 'taint: no taint' };
    return result().taintPass ? { tone: 'pass', label: 'taint permits' } : { tone: 'fail', label: 'taint rejects' };
  };
  const capacityBadge = (): Badge => {
    if (!ran()) return { tone: 'wait', label: busy() ? 'CPU: checking' : 'CPU: not run' };
    const r = result();
    return r.capacityPass
      ? { tone: 'pass', label: `CPU fits ${podCpuRequest}m in ${r.cpuFree}m` }
      : { tone: 'fail', label: `CPU short: ${podCpuRequest}m > ${r.cpuFree}m` };
  };
  const placementA = (): Badge => {
    if (!ran()) return { tone: 'wait', label: busy() ? 'placement: checking' : 'placement: not run' };
    if (result().selected === 'node-a') return { tone: 'selected', label: 'placed here' };
    return result().eligibleA ? { tone: 'info', label: 'eligible · lost to node-b' } : { tone: 'fail', label: 'not eligible' };
  };
  const placementB = (): Badge => {
    if (!ran()) return { tone: 'wait', label: busy() ? 'placement: checking' : 'placement: not run' };
    return result().selected === 'node-b' ? { tone: 'selected', label: 'placed here' } : { tone: 'info', label: 'eligible · not chosen' };
  };
  const podBadge = (): Badge => {
    if (!ran()) return { tone: 'wait', label: busy() ? 'checking' : 'unassigned · not run' };
    const selected = result().selected;
    return selected ? { tone: 'selected', label: `assigned to ${selected} · not Running` } : { tone: 'fail', label: 'unscheduled · Pending' };
  };

  return <div ref={root} class="anatomy-figure tt-figure" aria-label="Taint and toleration placement inspection" aria-busy={!hydrated()}>
    <div class="anatomy-figure-header"><span>Fig 04 · Scheduling</span><span>Permission is not attraction</span></div>
    <p class="tt-purpose"><strong>Goal:</strong> keep ordinary Pods off node-a, the node reserved for batch work. The administrator taints node-a; the workload author adds a toleration to the Pod; the scheduler checks both, plus capacity.</p>
    <div class="anatomy-bench">
    <div class="anatomy-bench-object">
    <div class="tt-stage">
      <svg class="iso-svg" viewBox="0 0 720 430" role="img" aria-labelledby="tt-title tt-desc">
        <title id="tt-title">Two-lane placement inspection apparatus</title>
        <desc id="tt-desc">Rear lane: node-a, with a taint blade then an independent CPU blade. Front lane: node-b, an untainted alternate candidate. Blades rise only after a placement run, and only for a passing check. The highlighted cartridge is the Pod; it moves only through open gates.</desc>
        <g innerHTML={base} />
        <For each={lanes}>{(lane, laneIndex) => <g>
          <g innerHTML={lane.floor} />
          <For each={lane.gates}>{(gate) => <g innerHTML={gate.back} />}</For>
          <Show when={(config().nodeB ? 1 : 0) === laneIndex()}>
            <g ref={(el) => { cars[laneIndex()] = el; }} transform={move(START)} innerHTML={lane.car} />
          </Show>
          <For each={lane.gates}>{(gate, gateIndex) => <>
            <g ref={(el) => { gates[laneIndex() * 2 + gateIndex()] = el; }} transform={move(0, 0, lift[laneIndex() * 2 + gateIndex()]!)} innerHTML={gate.blade} />
            <g innerHTML={gate.front} />
          </>}</For>
        </g>}</For>
      </svg>
      <span class="tt-tag tt-node" style={screenAt(-118, -72, 14)} data-object="node-a">node-a · batch-reserved</span>
      <span class="tt-tag tt-node" style={screenAt(-118, 66, 14)} data-object="node-b" data-absent={config().nodeB ? undefined : ''}>{config().nodeB ? 'node-b · alternate' : 'node-b · not in fixture'}</span>
      <span ref={podTag} class="tt-tag tt-pod" data-object="pod">{podName(serial())}</span>
    </div>
    <div class="anatomy-controls tt-config">
      <label>Pod toleration
        <select value={config().profile} disabled={!hydrated() || busy()} onChange={(e) => configure({ ...config(), profile: e.currentTarget.value as Profile }, 'profile')}>
          <For each={groups}>{([group, title]) => <optgroup label={title}>
            <For each={Object.entries(profiles).filter(([, p]) => p.group === group)}>{([id, p]) => <option value={id} selected={config().profile === id}>{p.label}</option>}</For>
          </optgroup>}</For>
        </select>
      </label>
      <label><input type="checkbox" checked={config().tainted} disabled={!hydrated() || busy()} onChange={(e) => configure({ ...config(), tainted: e.currentTarget.checked }, 'taint')} />node-a taint: dedicated=batch:NoSchedule</label>
      <label><input type="checkbox" checked={config().cpuFits} disabled={!hydrated() || busy()} onChange={(e) => configure({ ...config(), cpuFits: e.currentTarget.checked }, 'cpu')} />node-a: enough free CPU (800m, not 400m)</label>
      <label><input type="checkbox" checked={config().nodeB} disabled={!hydrated() || busy()} onChange={(e) => configure({ ...config(), nodeB: e.currentTarget.checked }, 'nodeB')} />node-b present (untainted, 1000m free)</label>
    </div>
    </div>
    <div class="anatomy-bench-panel">
    <div class="anatomy-controls">
      <button type="button" data-anatomy-primary disabled={!hydrated() || busy()} onClick={run}>{ran() ? 'Replay placement' : 'Run placement'}</button>
      <button type="button" disabled={!hydrated() || busy()} onClick={() => configure({ ...initialConfig }, 'reset')}>Reset</button>
    </div>
    <ChangeReport change={change()} busy={busy()} />
    <div class="tt-cards" data-anatomy-status>
      <section class="tt-card" data-object="node-a">
        <p><strong>node-a</strong> · batch-reserved</p>
        <p class="tt-fact">Taint: {config().tainted ? 'dedicated=batch:NoSchedule' : 'none'}</p>
        <p class="tt-fact">Free CPU: {result().cpuFree}m · Pod requests {podCpuRequest}m</p>
        <div class="tt-badges"><StateBadge tone={taintBadge().tone} label={taintBadge().label} /><StateBadge tone={capacityBadge().tone} label={capacityBadge().label} /><StateBadge tone={placementA().tone} label={placementA().label} /></div>
      </section>
      <section class="tt-card" data-object="node-b" data-absent={config().nodeB ? undefined : ''}>
        <p><strong>node-b</strong> · {config().nodeB ? 'alternate' : 'not in this fixture'}</p>
        <p class="tt-fact">Taint: none · Free CPU: 1000m</p>
        <Show when={config().nodeB} fallback={<div class="tt-badges"><StateBadge tone="info" label="absent: no checks" /></div>}>
          <div class="tt-badges"><StateBadge tone={ran() ? 'pass' : 'wait'} label={ran() ? 'taint: no taint' : (busy() ? 'taint: checking' : 'taint: not run')} /><StateBadge tone={ran() ? 'pass' : 'wait'} label={ran() ? 'CPU fits in 1000m' : (busy() ? 'CPU: checking' : 'CPU: not run')} /><StateBadge tone={placementB().tone} label={placementB().label} /></div>
        </Show>
      </section>
      <section class="tt-card" data-object="pod">
        <p><strong>{podName(serial())}</strong> · Pod</p>
        <p class="tt-fact">Requests {podCpuRequest}m CPU · 256Mi memory</p>
        <p class="tt-fact">Toleration: {profiles[config().profile].label} · nodeName: {ran() ? (result().selected ?? 'unset') : 'unset'}</p>
        <div class="tt-badges"><StateBadge tone={podBadge().tone} label={podBadge().label} /></div>
      </section>
    </div>
    </div>
    </div>
    <div class="tt-match-scroll">
        <table class="tt-match">
          <caption>Field-by-field comparison with node-a’s taint</caption>
          <thead><tr><th scope="col">Field</th><th scope="col">Pod toleration</th><th scope="col">node-a taint</th><th scope="col">Result</th></tr></thead>
          <tbody>
            <For each={result().rows}>{(row) => <tr>
              <th scope="row">{row.field}</th>
              <td>{row.pod}</td>
              <td>{row.node}</td>
              <td>{ran() ? <RowBadge verdict={row.verdict} field={row.field} operator={profiles[config().profile].toleration?.operator} /> : <StateBadge tone="wait" label="not run" />}</td>
            </tr>}</For>
          </tbody>
        </table>
      </div>
    <div class="tt-ledger">
      <div class="anatomy-yaml-figure-grid">
        <ManifestPanel title="Node node-a · taint set by the administrator" lines={nodeLines()} />
        <ManifestPanel title={`Pod ${podName(serial())} · toleration set by the workload author`} lines={podLines()} note="Highlighted after a run: the fields of each failed check, or every compared field when all checks pass. After an edit: the toleration fields you changed. # comments give each Pod field's verdict after a run." />
      </div>
      <p class="tt-facts">Fixture facts: node-a has 2000m allocatable; other Pods request 1200m (800m free) or 1600m (400m free). node-b is untainted with 1000m free. Memory fits on both nodes (1024Mi free, 256Mi requested). The fixed fixture score is node-b 20, node-a 10; no toleration adds score.</p>
      <p class="tt-caption">Blades rise only after you run placement, and only for a passing check. Their left-to-right order is an analogy, not scheduler plugin order. Gates show eligibility, not container execution.</p>
    </div>
  </div>;
}

function RowBadge(props: { verdict: Verdict; field: FieldName; operator?: string }) {
  const badge: Record<Verdict, Badge> = {
    match: { tone: 'pass', label: 'match' },
    wildcard: { tone: 'pass', label: 'empty matches any' },
    mismatch: { tone: 'fail', label: 'mismatch' },
    'not-tested': { tone: 'info', label: 'not tested (Exists)' },
    absent: { tone: 'fail', label: 'no toleration' },
    info: { tone: 'info', label: `mode: ${props.operator ?? 'none'}` },
    'no-taint': { tone: 'info', label: 'no taint' },
  };
  return <StateBadge tone={badge[props.verdict].tone} label={badge[props.verdict].label} />;
}
