import { createMemo, createSignal, For, onMount } from 'solid-js';
import ChangeReport, { type Change } from '@/components/anatomy/shared/ChangeReport';
import ManifestPanel, { type ManifestLine } from '@/components/anatomy/shared/ManifestPanel';
import StateBadge, { type BadgeTone } from '@/components/anatomy/shared/StateBadge';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import * as k from '@/lib/anatomy/vendor/iso-kit';
import {
  baseBack, binBack, binFront, binSlot, blockSvgs, CRADLE_Z, move, P, podPaint, QUEUE_Y, QUEUE_Z, queueSlotX, rackAt,
  rackParts, trayBack, trayFront, VIEW, viewBox,
} from './geometry';
import {
  allocatableM, budgetYaml, canFinish, canRun, classYaml, finishGrace, freeM, initialCluster, initialConfig, nodeNames, pod,
  podYaml, policyOf, preemptorClasses, queueOf, residentsOn, schedulingCycle, stackOn, usedOn, valueOf, victimYaml,
  type ClassId, type Cluster, type CycleEvent, type Config, type Decision, type NodeName, type PodState, type SchedulerName,
} from './model';
import './figure.css';

const backLayer = baseBack + rackParts('node-a').back + rackParts('node-b').back + trayBack + binBack;
const frontLayer = rackParts('node-a').front + rackParts('node-b').front + trayFront + binFront;

interface Entry {
  el?: SVGGElement;
  tag?: HTMLSpanElement;
  at?: [number, number, number];
}
interface Report {
  change: Change;
  marks: string[];
}
interface Commit extends Report {
  cluster: Cluster;
  ran: boolean;
}

const classLabel: Record<ClassId, string> = {
  'platform-critical': 'platform-critical · 100000 · preempts lower',
  'platform-critical-nonpreempting': 'platform-critical-nonpreempting · 100000 · Never',
  reporting: 'reporting · 100 · preempts lower',
  none: 'no priorityClassName · 0',
  'incident-high': 'incident-high · 1000000',
};

const EASE_SECONDS = 0.16;
const ease = (from: number, to: number, dt: number) => {
  const next = from + (to - from) * (1 - Math.exp(-dt / EASE_SECONDS));
  return Math.abs(next - to) < 0.05 ? to : next;
};

/** Where a Pod's block belongs. Pending Pods queue, or hover on a nominated node's cradle. Gone Pods stand in the bin. */
function targetOf(c: Cluster, p: PodState): [number, number, number] {
  if (p.phase === 'Gone') {
    const slot = binSlot(c.pods.filter((q) => q.phase === 'Gone').indexOf(p));
    return [slot.x, slot.y, slot.z];
  }
  if (p.phase === 'Pending') {
    if (p.nominatedNode) return [rackAt[p.nominatedNode].x, rackAt[p.nominatedNode].y, CRADLE_Z];
    const index = queueOf(c).findIndex((q) => q.name === p.name);
    return [queueSlotX[Math.max(0, index)] ?? queueSlotX[queueSlotX.length - 1] ?? 0, QUEUE_Y, QUEUE_Z];
  }
  if (!p.node) return [0, 0, 0];
  let below = 0;
  for (const q of stackOn(c, p.node)) {
    if (q.name === p.name) break;
    below += q.requestM / 10;
  }
  return [rackAt[p.node].x, rackAt[p.node].y, 4 + below];
}

/** Screen position as a percentage of the drawn canvas, for HTML labels that sit next to world-space objects. */
function screenAt(x: number, y: number, z: number) {
  const [sx, sy] = k.iso([x, y, z], P);
  return { left: `${((sx - VIEW.x) / VIEW.w) * 100}%`, top: `${((sy - VIEW.y) / VIEW.h) * 100}%` };
}

function stateOf(p: PodState): string {
  if (p.phase === 'Pending') return p.nominatedNode ? 'nominated' : 'queued';
  if (p.phase === 'Assigned') return 'assigned';
  return p.phase.toLowerCase();
}

function phaseText(p: PodState): string {
  switch (p.phase) {
    case 'Running': return 'Running';
    case 'Assigned': return 'Assigned · not Running';
    case 'Terminating': return 'Terminating · grace period';
    case 'Gone': return 'Gone';
    case 'Pending': return p.nominatedNode ? `Pending · nominated to ${p.nominatedNode}` : 'Pending · queued';
  }
}

/** One Pod's line in a node card: name · request · state. */
function residentText(p: PodState): string {
  switch (p.phase) {
    case 'Running': return `${p.name} · ${p.requestM}m · running`;
    case 'Assigned': return `${p.name} · ${p.requestM}m · assigned, not Running`;
    case 'Terminating': return `${p.name} · ${p.requestM}m · terminating`;
    default: return `${p.name} · ${p.requestM}m · nominated, not bound`;
  }
}

function usageLabel(c: Cluster, node: NodeName): string {
  const used = usedOn(c, node);
  return `${used}m of ${allocatableM}m requested · ${allocatableM - used}m free`;
}

/** Singular or plural for the victims a Pod still waits on, so the grammar matches the count. */
function holds(names: string[]): string {
  return names.length === 1
    ? `${names[0]} still holds its request`
    : `${names.join(' and ')} still hold their requests`;
}

type PreemptDecision = Extract<Decision, { kind: 'preempt' }>;

function candidatesText(decision: PreemptDecision): string {
  return decision.considered
    .map((c) => `${c.node} would evict ${c.victims.join(', ')} (priority ${c.highestVictimPriority}, PDB violations ${c.pdbViolations})`)
    .join('; ');
}

type EditKind = 'cls' | 'scheduler' | 'pdbBatch2' | 'pdbReports' | 'rival' | 'reset';

function initialReport(): Change {
  return {
    title: 'Initial state · nothing has run',
    changed: 'batch-1 and batch-2 run on node-a; reports-1 runs on node-b; batch-3 and api-pod wait in the queue.',
    actor: 'Fixture setup. No scheduler has acted yet.',
    reason: 'api-pod needs 600m, and each node has only 200m free, so it cannot be bound without an eviction.',
    notYet: 'Run scheduling pass to see what the scheduler does with api-pod.',
  };
}

function editReport(kind: EditKind, config: Config): Report {
  const notYet = 'Nothing has run. api-pod is queued with no nomination, and no victim is chosen.';
  switch (kind) {
    case 'cls': {
      const policy = policyOf(config.cls);
      const changed = config.cls === 'none'
        ? 'api-pod has no priorityClassName, so its priority is 0 and no PriorityClass is read.'
        : `api-pod names ${config.cls}: value ${valueOf(config.cls)}, preemptionPolicy ${policy}.`;
      return {
        change: {
          title: 'api-pod · priority class changed',
          changed,
          actor: 'Workload author, who sets priorityClassName in the Pod template. The cluster administrator owns the PriorityClass and its value.',
          reason: policy === 'Never'
            ? 'Priority still sorts api-pod ahead of lower-priority work in the queue, but Never forbids it from evicting anything.'
            : 'Admission resolves the name to a number on the Pod. The scheduler orders the queue and picks victims by that number.',
          notYet,
        },
        marks: config.cls === 'none' ? ['pod.priorityClassName'] : ['pc.value', 'pc.preemptionPolicy', 'pod.priorityClassName'],
      };
    }
    case 'scheduler':
      return {
        change: {
          title: `api-pod · schedulerName ${config.schedulerName}`,
          changed: config.schedulerName === 'default-scheduler'
            ? 'default-scheduler is named and will consider api-pod.'
            : 'batch-scheduler is named. This fixture runs no batch-scheduler, so default-scheduler leaves api-pod alone.',
          actor: 'Workload author, through spec.schedulerName. A scheduler profile of that name must be running for it to act.',
          reason: 'A scheduler only processes the Pods whose schedulerName matches its profile. Preemption runs inside the scheduler that owns the Pod.',
          notYet,
        },
        marks: ['pod.schedulerName'],
      };
    case 'pdbBatch2':
      return {
        change: {
          title: `PodDisruptionBudget on batch-2 ${config.pdbBatch2 ? 'added' : 'removed'}`,
          changed: config.pdbBatch2 ? 'batch-2-budget allows no disruption of batch-2.' : 'No budget covers batch-2.',
          actor: 'Application owner, who creates the PodDisruptionBudget. Preemption reads it but does not own it.',
          reason: 'Preemption respects a budget on a best-effort basis: it prefers candidates that violate none, but still preempts when every candidate violates one.',
          notYet,
        },
        marks: ['pdb.spec'],
      };
    case 'pdbReports':
      return {
        change: {
          title: `PodDisruptionBudget on reports-1 ${config.pdbReports ? 'added' : 'removed'}`,
          changed: config.pdbReports ? 'reports-budget allows no disruption of reports-1.' : 'No budget covers reports-1.',
          actor: 'Application owner, who creates the PodDisruptionBudget. Preemption reads it but does not own it.',
          reason: 'A violation is a reason to prefer another node, not a veto. Every candidate can still be disrupted.',
          notYet,
        },
        marks: ['pdb.spec'],
      };
    case 'rival':
      return {
        change: {
          title: config.rival ? 'incident-high will arrive with the grace period end' : 'No rival Pod arrives',
          changed: config.rival
            ? 'incident-high (value 1000000) is created when the grace period ends, and then a scheduling pass runs.'
            : 'The fixture has only the initial Pods.',
          actor: 'Another workload owner, who creates a Pod with a higher priority class.',
          reason: 'A higher-priority Pod can take capacity that a lower-priority nomination was waiting for. The scheduler then clears that nomination.',
          notYet,
        },
        marks: [],
      };
    case 'reset':
      return {
        change: {
          title: 'Fixture reset',
          changed: 'Initial Pods restored: batch-1, batch-2 and reports-1 Running; batch-3 and api-pod queued.',
          actor: 'You, using Reset. No Kubernetes object is changed.',
          reason: 'Earlier runs are discarded. This fixture resets instead of migrating Pods, so no victim comes back.',
          notYet,
        },
        marks: [],
      };
  }
}

function runReport(before: Cluster, events: CycleEvent[]): Report {
  const api = events.find((e) => e.pod === 'api-pod');
  const batch = events.find((e) => e.pod === 'batch-3');
  const batchNote = batch?.decision.kind === 'pending'
    ? ` batch-3 (900m, priority 0) is attempted next and stays Pending, because ${batch.decision.reason === 'no-lower-priority' ? 'it has no lower-priority victim' : 'no node can take it'}.`
    : '';
  const apiPod = pod(before, 'api-pod');
  const request = apiPod?.requestM ?? 600;
  const priority = apiPod?.priority ?? 0;
  const d = api?.decision;
  if (!apiPod || !d || d.kind === 'skip') {
    return {
      change: {
        title: 'api-pod is not handled by default-scheduler',
        changed: `No decision, no nomination and no victim.${batchNote}`,
        actor: `The scheduler named in spec.schedulerName (${apiPod?.schedulerName ?? 'batch-scheduler'}), which this fixture does not run.`,
        reason: 'default-scheduler only processes Pods whose schedulerName matches its profile, so it does not try api-pod.',
        notYet: 'Nothing is bound. In this fixture no other scheduler runs, so api-pod has no owner.',
      },
      marks: ['pod.schedulerName'],
    };
  }
  if (d.kind === 'bind') {
    return {
      change: {
        title: `api-pod assigned to ${d.node} · not Running`,
        changed: `spec.nodeName is ${d.node}. Phase is still Pending.${batchNote}`,
        actor: d.via === 'nominated' ? 'kube-scheduler, which tried the nominated node first.' : 'kube-scheduler, which found a node with room.',
        reason: `The ${request}m request fits ${d.freeBefore}m free on ${d.node}.`,
        notYet: `Assigned is not Running: the kubelet on ${d.node} has not started api-pod’s container, and Ready is not evaluated.`,
      },
      marks: ['pod.requests', 'spec.nodeName', 'status.phase'],
    };
  }
  if (d.kind === 'preempt') {
    const considersPdb = d.considered.some((c) => c.pdbViolations > 0);
    return {
      change: {
        title: `api-pod nominated to ${d.node}; ${d.victims.join(' and ')} terminating`,
        changed: `status.nominatedNodeName is ${d.node}. ${d.victims.join(' and ')} marked for deletion with DisruptionTarget (PreemptionByScheduler). spec.nodeName is still unset.${batchNote}`,
        actor: 'kube-scheduler during preemption: it records the nomination and asks the API server to delete the victims. The kubelet then stops them.',
        reason: `api-pod (priority ${priority}) fits no node as things stand. ${candidatesText(d)}. Fixture order: fewest PDB violations, then lowest highest-victim priority.`,
        notYet: `api-pod is not bound. ${holds(d.victims)} until the grace period ends (30 s by default). The nomination is not a guarantee: a higher-priority Pod or a free node can take the space first.`,
      },
      marks: ['pc.value', 'pod.priorityClassName', 'status.nominatedNodeName', 'victim.conditions', ...(considersPdb ? ['pdb.spec'] : [])],
    };
  }
  if (d.reason === 'non-preempting') {
    const free = nodeNames.map((n) => `${n} ${freeM(before, n, apiPod)}m`).join(', ');
    return {
      change: {
        title: 'api-pod stays Pending · non-preempting',
        changed: `Queue position first (priority ${priority}). No victim is deleted; nominatedNodeName stays unset.${batchNote}`,
        actor: 'kube-scheduler, which reads preemptionPolicy: Never from platform-critical-nonpreempting.',
        reason: `Priority sorts api-pod first, but Never forbids preemption. Free CPU: ${free}, and 600m is needed.`,
        notYet: 'It waits for capacity to free by itself. Higher-priority Pods can still preempt it.',
      },
      marks: ['pc.preemptionPolicy', 'pod.priorityClassName'],
    };
  }
  return {
    change: {
      title: 'api-pod stays Pending',
      changed: `No victim is deleted and no nomination is set.${batchNote}`,
      actor: 'kube-scheduler, which searched for victims.',
      reason: d.reason === 'no-lower-priority'
        ? `Nothing on either node has priority below ${priority}. Preemption needs a strictly lower-priority victim, so equal priority waits.`
        : `Removing every lower-priority Pod still leaves no node with ${request}m free.`,
      notYet: 'It stays queued until capacity frees by itself.',
    },
    marks: ['pc.value', 'pod.priorityClassName'],
  };
}

/**
 * The grace period ends. The kubelet finishes stopping the victims and they leave the API. Only then does
 * kube-scheduler, in its next pass, bind or re-nominate the Pods that were waiting.
 */
function finishReport(before: Cluster, removed: string[], rivalArrived: boolean, events: CycleEvent[]): Report {
  const api = events.find((e) => e.pod === 'api-pod');
  const rival = events.find((e) => e.pod === 'incident-high');
  const d = api?.decision;
  const boundRival = rival?.decision.kind === 'bind' ? rival.decision : undefined;
  const victimNode = removed.map((name) => pod(before, name)?.node).find((node) => node !== undefined);
  const gone = removed.length
    ? `${removed.join(' and ')} ${removed.length === 1 ? 'was' : 'were'} removed from the API after the grace period. `
    : '';
  const rivalSentence = boundRival ? `incident-high assigned to ${boundRival.node}. ` : '';
  const apiSentence = d?.kind === 'bind'
    ? `api-pod assigned to ${d.node}. Phase is still Pending.`
    : d?.kind === 'preempt'
      ? `api-pod re-nominated to ${d.node}; ${d.victims.join(' and ')} terminating.`
      : 'api-pod stays Pending with no nomination.';
  const rivalBound = rivalArrived && boundRival !== undefined;
  const reason = rivalBound && boundRival
    ? `incident-high (1000000) sorts ahead of api-pod and fits the room freed on ${boundRival.node}. A higher-priority Pod can take a node that a lower nomination was waiting for, and the scheduler then clears that nomination (kubernetes.io). api-pod is re-evaluated and may preempt elsewhere.`
    : d?.kind === 'bind' && d.via === 'nominated'
      ? `${d.node} is the nominated node and now has ${d.freeBefore}m free, so the scheduler tries it first and binds api-pod.`
      : d?.kind === 'preempt'
        ? `${d.node} is now the only node where removing lower-priority Pods makes room for 600m.`
        : 'The scheduler found no node and no victim this pass.';
  const notYet = d?.kind === 'bind'
    ? `Not Running: ${d.node}’s kubelet still has to start api-pod. Ready is not evaluated.`
    : d?.kind === 'preempt'
      ? `api-pod is not bound. ${holds(d.victims)} until its grace period ends.`
      : 'api-pod is not bound and no node is nominated.';
  const title = boundRival
    ? `incident-high took ${boundRival.node}; api-pod ${d?.kind === 'preempt' ? `re-nominated to ${d.node}` : 'waits'}`
    : d?.kind === 'bind'
      ? `api-pod assigned to ${d.node} · not Running`
      : d?.kind === 'preempt'
        ? `api-pod re-nominated to ${d.node}`
        : 'Grace period ended';
  const marks = [
    ...(d?.kind === 'bind' ? ['spec.nodeName', 'status.phase'] : []),
    ...(d?.kind === 'preempt' ? ['status.nominatedNodeName', 'victim.conditions'] : []),
    ...(rivalBound ? ['status.nominatedNodeName'] : []),
  ];
  const kubeletPart = removed.length && victimNode
    ? `The kubelet on ${victimNode} finished stopping ${removed.join(' and ')}. `
    : '';
  return {
    change: {
      title,
      changed: `${gone}${rivalSentence}${apiSentence}`,
      actor: `${kubeletPart}Then kube-scheduler, in its next pass over the queue (highest priority first).${rivalArrived ? ' incident-high was created as the grace period ended.' : ''}`,
      reason,
      notYet,
    },
    marks,
  };
}

const tagFor = (c: Cluster, name: string): { label: string; state: string } => {
  const p = pod(c, name);
  return p ? { label: `${p.name} · ${stateOf(p)}`, state: stateOf(p) } : { label: name, state: 'absent' };
};

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  const [config, setConfig] = createSignal<Config>({ ...initialConfig });
  const [cluster, setCluster] = createSignal<Cluster>(initialCluster(initialConfig));
  const [busy, setBusy] = createSignal(false);
  const [ran, setRan] = createSignal(false);
  const [marks, setMarks] = createSignal<string[]>([]);
  const [change, setChange] = createSignal<Change>(initialReport());
  const ready = () => hydrated() && !busy();

  let root: HTMLDivElement | undefined;
  const entries = new Map<string, Entry>(podPaint.map((name) => [name, {}]));
  // The geometry follows the model's next state at once. The committed signals change once the blocks settle.
  let geo: Cluster = initialCluster(initialConfig);
  let pending: Commit | undefined;
  let snap = false;

  /** Moves each block toward its target and places its identity label beside it. Returns true while anything still moves. */
  function layout(dt: number, instant: boolean): boolean {
    let moving = false;
    for (const name of podPaint) {
      const entry = entries.get(name);
      const p = pod(geo, name);
      if (!entry?.el) continue;
      if (!p) {
        entry.el.style.display = 'none';
        if (entry.tag) entry.tag.style.display = 'none';
        entry.at = undefined;
        continue;
      }
      entry.el.style.display = '';
      if (entry.tag) entry.tag.style.display = '';
      const to = targetOf(geo, p);
      const from = entry.at ?? to;
      const next: [number, number, number] = instant
        ? to
        : [ease(from[0], to[0], dt), ease(from[1], to[1], dt), ease(from[2], to[2], dt)];
      entry.at = next;
      if (next.some((v, i) => v !== to[i])) moving = true;
      entry.el.setAttribute('transform', move(next[0], next[1], next[2]));
      if (entry.tag) {
        const h = p.requestM / 10;
        // A Pod on a rack gets a label on its right face, so stacked labels stay apart. Others get a label above.
        const onRack = p.phase !== 'Pending' && p.phase !== 'Gone';
        const at = onRack
          ? screenAt(next[0] + 10, next[1], next[2] + h / 2)
          : screenAt(next[0], next[1], next[2] + h + 3);
        entry.tag.setAttribute('data-anchor', onRack ? 'side' : 'top');
        entry.tag.style.left = at.left;
        entry.tag.style.top = at.top;
      }
    }
    return moving;
  }

  const wake = createAnatomyMotion(() => root, (dt, reduced) => {
    const moving = layout(dt, reduced || snap);
    snap = false;
    if (!moving && pending) {
      const commit = pending;
      pending = undefined;
      setCluster(commit.cluster);
      setChange(commit.change);
      setMarks(commit.marks);
      setRan(commit.ran);
      setBusy(false);
    }
    return moving;
  });

  onMount(() => {
    setHydrated(true);
    layout(0, true);
    wake();
  });

  function settleNow(next: Cluster, report: Report) {
    geo = next;
    snap = true;
    setCluster(next);
    setChange(report.change);
    setMarks(report.marks);
    setRan(false);
    wake();
  }

  function configure(next: Config, kind: EditKind) {
    if (!ready()) return;
    setConfig(next);
    settleNow(initialCluster(next), editReport(kind, next));
  }

  function run() {
    if (!ready() || !canRun(cluster())) return;
    const before = geo;
    const result = schedulingCycle(before);
    pending = { cluster: result.cluster, ran: true, ...runReport(before, result.events) };
    geo = result.cluster;
    setBusy(true);
    setMarks([]);
    wake();
  }

  function finish() {
    if (!ready() || !canFinish(cluster())) return;
    const before = geo;
    const result = finishGrace(before, config());
    pending = { cluster: result.cluster, ran: true, ...finishReport(before, result.removed, result.rivalArrived, result.events) };
    geo = result.cluster;
    setBusy(true);
    setMarks([]);
    wake();
  }

  const lineMarks = (lines: { text: string; id?: string }[]): ManifestLine[] =>
    lines.map((line) => ({ text: line.text, highlight: !!line.id && marks().includes(line.id) }));
  const classLines = createMemo(() => lineMarks(classYaml(config().cls)));
  const podLines = createMemo(() => lineMarks(podYaml(cluster(), config())));
  const budgetLines = createMemo(() => lineMarks([...budgetYaml(config()), ...victimYaml(cluster())]));

  const apiBadge = (): { tone: BadgeTone; label: string } => {
    const api = pod(cluster(), 'api-pod');
    if (!api) return { tone: 'info', label: 'api-pod absent' };
    if (api.schedulerName !== 'default-scheduler') return { tone: 'info', label: 'not handled by default-scheduler' };
    if (api.phase === 'Assigned') return { tone: 'selected', label: `assigned to ${api.node} · not Running` };
    if (api.nominatedNode) return { tone: 'selected', label: `nominated to ${api.nominatedNode} · not bound` };
    if (busy()) return { tone: 'wait', label: 'checking' };
    if (!ran()) return { tone: 'wait', label: 'queued · not attempted' };
    return { tone: 'fail', label: 'Pending · no node' };
  };

  const nodeBadges = (node: NodeName): { tone: BadgeTone; label: string }[] => {
    const c = cluster();
    const out: { tone: BadgeTone; label: string }[] = [{ tone: 'info', label: usageLabel(c, node) }];
    const terminating = c.pods.filter((p) => p.node === node && p.phase === 'Terminating');
    if (terminating.length) out.push({ tone: 'wait', label: `${terminating.length} terminating` });
    const nominated = c.pods.filter((p) => p.phase === 'Pending' && p.nominatedNode === node);
    if (nominated.length) out.push({ tone: 'selected', label: `nominated: ${nominated.map((p) => p.name).join(', ')}` });
    return out;
  };

  return <div ref={root} class="anatomy-figure pp-figure" aria-label="Pod priority and preemption inspection" aria-busy={!hydrated()}>
    <div class="anatomy-figure-header"><span>Fig 05 · Scheduling</span><span>Priority orders the queue; preemption makes room</span></div>
    <p class="pp-purpose"><strong>Goal:</strong> api-pod needs 600m and no node has it. Its priority decides where it sits in the queue and whether it may evict lower-priority Pods. The scheduler picks victims and nominates a node, but binds the Pod only after the victims are gone, and only if nothing better takes the room.</p>
    <div class="anatomy-bench">
    <div class="anatomy-bench-object">
    <div class="pp-stage">
      <svg class="iso-svg" viewBox={viewBox} role="img" aria-labelledby="pp-title pp-desc">
        <title id="pp-title">Two-rack priority and preemption apparatus</title>
        <desc id="pp-desc">Two open racks stand apart, one per node. Each block is a Pod whose height is its CPU request, under a 1000m rim. The queue tray on the front-left holds pending Pods in scheduling order. A nominated Pod hovers over its node's cradle. Removed Pods stand in the bin on the front-right.</desc>
        <g innerHTML={backLayer} />
        <For each={podPaint}>{(name) => <g
          ref={(el) => { const entry = entries.get(name); if (entry) entry.el = el; }}
          transform={startTransform(name)}
          innerHTML={blockSvgs[name]}
        />}</For>
        <g innerHTML={frontLayer} />
      </svg>
      <For each={podPaint}>{(name) => <span
        ref={(el) => { const entry = entries.get(name); if (entry) entry.tag = el; }}
        class="pp-tag"
        data-pod={name}
        data-state={tagFor(cluster(), name).state}
      >{tagFor(cluster(), name).label}</span>}</For>
      <span class="pp-tag pp-fixed pp-node" data-object="node-a" style={screenAt(rackAt['node-a'].x, rackAt['node-a'].y + 24, 0)}><b>node-a</b><br />{allocatableM - usedOn(cluster(), 'node-a')}m free<br />{usedOn(cluster(), 'node-a')}m of {allocatableM}m requested</span>
      <span class="pp-tag pp-fixed pp-node" data-object="node-b" style={screenAt(rackAt['node-b'].x, rackAt['node-b'].y + 24, 0)}><b>node-b</b><br />{allocatableM - usedOn(cluster(), 'node-b')}m free<br />{usedOn(cluster(), 'node-b')}m of {allocatableM}m requested</span>
      <span class="pp-tag pp-fixed pp-queue" style={screenAt(-100, 94, 0)}>queue, head first</span>
      <span class="pp-tag pp-fixed pp-bin" style={screenAt(104, 84, 0)}>removed</span>
    </div>
    <fieldset class="pp-config" disabled={!ready()}>
      <legend>Configure api-pod</legend>
      <label>priority class
        <select value={config().cls} onChange={(e) => configure({ ...config(), cls: e.currentTarget.value as ClassId }, 'cls')}>
          <For each={preemptorClasses}>{(cls) => <option value={cls} selected={config().cls === cls}>{classLabel[cls]}</option>}</For>
        </select>
      </label>
      <label>schedulerName
        <select value={config().schedulerName} onChange={(e) => configure({ ...config(), schedulerName: e.currentTarget.value as SchedulerName }, 'scheduler')}>
          <option value="default-scheduler" selected={config().schedulerName === 'default-scheduler'}>default-scheduler</option>
          <option value="batch-scheduler" selected={config().schedulerName === 'batch-scheduler'}>batch-scheduler (not running here)</option>
        </select>
      </label>
      <label><input type="checkbox" checked={config().pdbBatch2} onChange={(e) => configure({ ...config(), pdbBatch2: e.currentTarget.checked }, 'pdbBatch2')} />PodDisruptionBudget: batch-2 allows no disruption</label>
      <label><input type="checkbox" checked={config().pdbReports} onChange={(e) => configure({ ...config(), pdbReports: e.currentTarget.checked }, 'pdbReports')} />PodDisruptionBudget: reports-1 allows no disruption</label>
      <label><input type="checkbox" checked={config().rival} onChange={(e) => configure({ ...config(), rival: e.currentTarget.checked }, 'rival')} />incident-high (1000000) arrives when the grace period ends</label>
    </fieldset>
    </div>
    <div class="anatomy-bench-panel">
    <div class="anatomy-controls pp-actions">
      <button type="button" data-anatomy-primary disabled={!ready() || !canRun(cluster())} onClick={run}>Run scheduling pass</button>
      <button type="button" disabled={!ready() || !canFinish(cluster())} onClick={finish}>End grace period</button>
      <button type="button" disabled={!ready()} onClick={() => configure({ ...initialConfig }, 'reset')}>Reset fixture</button>
    </div>
    <ChangeReport change={change()} busy={busy()} />
    <div class="pp-cards" data-anatomy-status>
      <section class="pp-card" data-object="node-a">
        <p><strong>node-a</strong> · allocatable {allocatableM}m</p>
        <div class="pp-badges"><For each={nodeBadges('node-a')}>{(b) => <StateBadge tone={b.tone} label={b.label} />}</For></div>
        <ul class="pp-residents"><For each={residentsOn(cluster(), 'node-a')} fallback={<li>no Pods</li>}>{(p) => <li data-pod={p.name}>{residentText(p)}</li>}</For></ul>
      </section>
      <section class="pp-card" data-object="node-b">
        <p><strong>node-b</strong> · allocatable {allocatableM}m</p>
        <div class="pp-badges"><For each={nodeBadges('node-b')}>{(b) => <StateBadge tone={b.tone} label={b.label} />}</For></div>
        <ul class="pp-residents"><For each={residentsOn(cluster(), 'node-b')} fallback={<li>no Pods</li>}>{(p) => <li data-pod={p.name}>{residentText(p)}</li>}</For></ul>
      </section>
      <section class="pp-card" data-object="api-pod">
        <p><strong>api-pod</strong> · 600m · priority {valueOf(config().cls)}</p>
        <div class="pp-badges"><StateBadge tone={apiBadge().tone} label={apiBadge().label} /></div>
      </section>
    </div>
    </div>
    </div>
    <div class="pp-match-scroll">
      <table class="pp-ledger">
        <caption>Every Pod in this fixture, with the fields the scheduler reads</caption>
        <thead><tr><th scope="col">Pod</th><th scope="col">Priority</th><th scope="col">Request</th><th scope="col">spec.nodeName</th><th scope="col">nominatedNodeName</th><th scope="col">Phase</th><th scope="col">PDB</th><th scope="col">Disruption</th></tr></thead>
        <tbody>
          <For each={cluster().pods}>{(p) => <tr data-pod={p.name}>
            <th scope="row">{p.name}</th>
            <td data-label="Priority">{p.priority}</td>
            <td data-label="Request">{p.requestM}m</td>
            <td data-label="spec.nodeName">{p.node ?? 'unset'}</td>
            <td data-label="nominatedNodeName">{p.nominatedNode ?? 'unset'}</td>
            <td data-label="Phase">{phaseText(p)}</td>
            <td data-label="PDB">{p.pdb ? 'no disruption allowed' : '·'}</td>
            <td data-label="Disruption">{p.disruption ?? '·'}</td>
          </tr>}</For>
        </tbody>
      </table>
    </div>
    <div class="pp-ledger-wrap">
      <div class="anatomy-yaml-figure-grid">
        <ManifestPanel title="PriorityClass · set by the cluster administrator" lines={classLines()} />
        <ManifestPanel title="Pod api-pod · written by the workload author; status from the scheduler" lines={podLines()} note="Highlighted lines are what the last action read or changed. The status shows only what the scheduler recorded: a nomination, or a binding that is not yet Running." />
        <ManifestPanel title="Disruption budgets and victim status" lines={budgetLines()} note="Budgets belong to applications. Preemption writes the DisruptionTarget condition on a victim, and nothing else." />
      </div>
      <p class="pp-facts">Fixture facts: node-a has 1000m allocatable with batch-1 (400m) and batch-2 (400m). node-b has 1000m with reports-1 (800m, priority 100). batch-3 (900m, priority 0) is queued behind api-pod. Blocks are drawn at 10 units per 100m, so a rack’s open space under the rim is its unrequested CPU.</p>
      <p class="pp-caption">Terminating victims still hold their requests, so the rack does not show them as free. A nomination reserves room; it does not bind. Priority values and budgets are fixture numbers; only the preemption and disruption rules come from kubernetes.io.</p>
    </div>
  </div>;
}

/** Initial transform: where the block belongs in the initial fixture, so the first paint is already in place. */
function startTransform(name: string): string {
  const initial = initialCluster(initialConfig);
  const p = pod(initial, name);
  if (!p) return move(0, 0, 0);
  const [x, y, z] = targetOf(initial, p);
  return move(x, y, z);
}
