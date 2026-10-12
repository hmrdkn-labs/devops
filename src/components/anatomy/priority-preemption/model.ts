// Pure, deterministic fixture for Pod priority and preemption. It is not a cluster,
// a scheduler trace or a mastery record. Simplifications are named on the page.

export type NodeName = 'node-a' | 'node-b';
export const nodeNames: readonly NodeName[] = ['node-a', 'node-b'];
export const allocatableM = 1000;

export type SchedulerName = 'default-scheduler' | 'batch-scheduler';
export type Policy = 'PreemptLowerPriority' | 'Never';
export type ClassId = 'platform-critical' | 'platform-critical-nonpreempting' | 'reporting' | 'none' | 'incident-high';

/** PriorityClass objects this fixture knows. `none` means no priorityClassName, which resolves to 0. */
export const priorityClasses: Record<Exclude<ClassId, 'none'>, { value: number; preemptionPolicy: Policy }> = {
  'platform-critical': { value: 100000, preemptionPolicy: 'PreemptLowerPriority' },
  'platform-critical-nonpreempting': { value: 100000, preemptionPolicy: 'Never' },
  reporting: { value: 100, preemptionPolicy: 'PreemptLowerPriority' },
  'incident-high': { value: 1000000, preemptionPolicy: 'PreemptLowerPriority' },
};

/** Classes a learner can choose for api-pod. incident-high is the rival, which arrives later. */
export const preemptorClasses: readonly ClassId[] = ['platform-critical', 'platform-critical-nonpreempting', 'reporting', 'none'];

export function valueOf(cls: ClassId): number {
  return cls === 'none' ? 0 : priorityClasses[cls].value;
}

export function policyOf(cls: ClassId): Policy {
  return cls === 'none' ? 'PreemptLowerPriority' : priorityClasses[cls].preemptionPolicy;
}

export interface Config {
  cls: ClassId;
  schedulerName: SchedulerName;
  /** A PodDisruptionBudget allows no disruption of batch-2 (one of its Pods, minAvailable 1). */
  pdbBatch2: boolean;
  /** A PodDisruptionBudget allows no disruption of reports-1. */
  pdbReports: boolean;
  /** incident-high (value 1000000) is created when the grace period ends. */
  rival: boolean;
}

export const initialConfig: Config = {
  cls: 'platform-critical',
  schedulerName: 'default-scheduler',
  pdbBatch2: false,
  pdbReports: false,
  rival: false,
};

export type Phase = 'Running' | 'Assigned' | 'Terminating' | 'Pending' | 'Gone';
/** Phases whose requests count against a node. A Terminating Pod still holds its requests. */
const OCCUPYING: Record<Phase, boolean> = { Running: true, Assigned: true, Terminating: true, Pending: false, Gone: false };

export interface PodState {
  name: string;
  /** Creation order: tie-break in the queue and bottom-to-top order on a node. */
  order: number;
  cls: ClassId;
  priority: number;
  requestM: number;
  /** Pending means no spec.nodeName yet. Assigned means spec.nodeName is set but the Pod is not Running. */
  phase: Phase;
  /** spec.nodeName, set only by binding. Kept after a Pod is Gone, for the record. */
  node?: NodeName;
  /** status.nominatedNodeName, a reservation and a hint, not a placement. */
  nominatedNode?: NodeName;
  /** A PodDisruptionBudget allows no disruption of this Pod (fixture simplification). */
  pdb: boolean;
  schedulerName: SchedulerName;
  disruption?: 'PreemptionByScheduler';
}

export interface Cluster {
  pods: PodState[];
  rivalAdded: boolean;
}

/** Fixture Pods. Batch Pods carry no priorityClassName; reports-1 uses the reporting class. */
export function initialCluster(config: Config): Cluster {
  return {
    rivalAdded: false,
    pods: [
      { name: 'batch-1', order: 1, cls: 'none', priority: 0, requestM: 400, phase: 'Running', node: 'node-a', pdb: false, schedulerName: 'default-scheduler' },
      { name: 'batch-2', order: 2, cls: 'none', priority: 0, requestM: 400, phase: 'Running', node: 'node-a', pdb: config.pdbBatch2, schedulerName: 'default-scheduler' },
      { name: 'reports-1', order: 3, cls: 'reporting', priority: valueOf('reporting'), requestM: 800, phase: 'Running', node: 'node-b', pdb: config.pdbReports, schedulerName: 'default-scheduler' },
      { name: 'batch-3', order: 4, cls: 'none', priority: 0, requestM: 900, phase: 'Pending', pdb: false, schedulerName: 'default-scheduler' },
      { name: 'api-pod', order: 5, cls: config.cls, priority: valueOf(config.cls), requestM: 600, phase: 'Pending', pdb: false, schedulerName: config.schedulerName },
    ],
  };
}

export function rivalPod(order: number): PodState {
  return { name: 'incident-high', order, cls: 'incident-high', priority: valueOf('incident-high'), requestM: 600, phase: 'Pending', pdb: false, schedulerName: 'default-scheduler' };
}

export function pod(c: Cluster, name: string): PodState | undefined {
  return c.pods.find((p) => p.name === name);
}

/** Free CPU on a node for `subject`: allocatable minus occupying requests minus reservations of higher or equal nominations. */
export function freeM(c: Cluster, node: NodeName, subject: PodState, removed: ReadonlySet<string> = new Set()): number {
  const used = c.pods
    .filter((p) => p.node === node && OCCUPYING[p.phase] && !removed.has(p.name))
    .reduce((sum, p) => sum + p.requestM, 0);
  const reserved = c.pods
    .filter((p) => p.phase === 'Pending' && p.nominatedNode === node && p.name !== subject.name && p.priority >= subject.priority)
    .reduce((sum, p) => sum + p.requestM, 0);
  return allocatableM - used - reserved;
}

/** Pods that hold a node's attention now: bound and occupying, or nominated to it and still pending. */
export function residentsOn(c: Cluster, node: NodeName): PodState[] {
  return c.pods.filter((p) => (p.node === node && OCCUPYING[p.phase]) || (p.phase === 'Pending' && p.nominatedNode === node));
}

/** Requests that occupy a node right now, including Terminating victims. */
export function usedOn(c: Cluster, node: NodeName): number {
  return c.pods.filter((p) => p.node === node && OCCUPYING[p.phase]).reduce((sum, p) => sum + p.requestM, 0);
}

/** Pods bound to a node and still occupying it, bottom (earliest) to top. */
export function stackOn(c: Cluster, node: NodeName): PodState[] {
  return c.pods.filter((p) => p.node === node && OCCUPYING[p.phase]).sort((a, b) => a.order - b.order);
}

/** The scheduling queue: highest priority first, then earliest created. */
export function queueOf(c: Cluster): PodState[] {
  return c.pods
    .filter((p) => p.phase === 'Pending')
    .sort((a, b) => b.priority - a.priority || a.order - b.order);
}

export interface Candidate {
  node: NodeName;
  victims: string[];
  pdbViolations: number;
  highestVictimPriority: number;
}

export type Decision =
  | { kind: 'skip' }
  | { kind: 'bind'; node: NodeName; via: 'nominated' | 'free'; freeBefore: number }
  | { kind: 'preempt'; node: NodeName; victims: string[]; pdbViolations: number; highestVictimPriority: number; considered: Candidate[] }
  | { kind: 'pending'; reason: 'non-preempting' | 'no-lower-priority' | 'no-candidate' };

/**
 * One scheduling decision for `subject`.
 * 1. Bind if a node has room now. The nominated node is tried first.
 * 2. Otherwise, if policy allows, find nodes where removing lower-priority Pods makes room.
 *    Victims are reprieved in creation order while the request still fits.
 *    Fewest PDB violations first, then lowest highest-victim priority (fixture ordering).
 */
export function decide(c: Cluster, subject: PodState): Decision {
  if (subject.schedulerName !== 'default-scheduler') return { kind: 'skip' };

  const nominated = subject.nominatedNode;
  const ordered: NodeName[] = nominated
    ? [nominated, ...nodeNames.filter((n) => n !== nominated)]
    : [...nodeNames].sort((a, b) => freeM(c, b, subject) - freeM(c, a, subject) || a.localeCompare(b));
  const fit = ordered.find((node) => freeM(c, node, subject) >= subject.requestM);
  if (fit) return { kind: 'bind', node: fit, via: fit === nominated ? 'nominated' : 'free', freeBefore: freeM(c, fit, subject) };

  if (policyOf(subject.cls) === 'Never') return { kind: 'pending', reason: 'non-preempting' };

  const candidates: Candidate[] = [];
  let anyLower = false;
  for (const node of nodeNames) {
    const lower = c.pods
      .filter((p) => p.node === node && p.phase !== 'Terminating' && OCCUPYING[p.phase] && p.priority < subject.priority)
      .sort((a, b) => a.order - b.order);
    if (lower.length === 0) continue;
    anyLower = true;
    if (freeM(c, node, subject, new Set(lower.map((p) => p.name))) < subject.requestM) continue;

    let victims = [...lower];
    for (const keep of lower) {
      const trial = victims.filter((v) => v.name !== keep.name);
      if (freeM(c, node, subject, new Set(trial.map((v) => v.name))) >= subject.requestM) victims = trial;
    }
    if (victims.length === 0) continue;
    candidates.push({
      node,
      victims: victims.map((v) => v.name),
      pdbViolations: victims.filter((v) => v.pdb).length,
      highestVictimPriority: Math.max(...victims.map((v) => v.priority)),
    });
  }

  if (candidates.length === 0) return { kind: 'pending', reason: anyLower ? 'no-candidate' : 'no-lower-priority' };
  candidates.sort((a, b) => a.pdbViolations - b.pdbViolations || a.highestVictimPriority - b.highestVictimPriority || a.node.localeCompare(b.node));
  const best = candidates[0]!;
  return { kind: 'preempt', node: best.node, victims: best.victims, pdbViolations: best.pdbViolations, highestVictimPriority: best.highestVictimPriority, considered: candidates };
}

export interface CycleEvent {
  pod: string;
  decision: Decision;
}

function apply(c: Cluster, name: string, decision: Decision): Cluster {
  return {
    ...c,
    pods: c.pods.map((p) => {
      if (p.name === name) {
        // Binding sets spec.nodeName. The nomination is left as it is: kubernetes.io documents clearing it only when a higher-priority Pod takes the node.
        if (decision.kind === 'bind') return { ...p, phase: 'Assigned', node: decision.node };
        if (decision.kind === 'preempt') return { ...p, nominatedNode: decision.node };
        return p;
      }
      if (decision.kind === 'preempt' && decision.victims.includes(p.name)) {
        return { ...p, phase: 'Terminating', disruption: 'PreemptionByScheduler' };
      }
      return p;
    }),
  };
}

/** One pass over the queue in queue order. Each Pending Pod is decided once. */
export function schedulingCycle(c: Cluster): { cluster: Cluster; events: CycleEvent[] } {
  let state = c;
  const events: CycleEvent[] = [];
  for (const { name } of queueOf(c)) {
    const subject = pod(state, name);
    if (!subject || subject.phase !== 'Pending') continue;
    const decision = decide(state, subject);
    events.push({ pod: name, decision });
    state = apply(state, name, decision);
  }
  return { cluster: state, events };
}

/** Grace period ends: Terminating Pods are removed; a rival is created if chosen; then one scheduling pass. */
export function finishGrace(c: Cluster, config: Config): { cluster: Cluster; events: CycleEvent[]; removed: string[]; rivalArrived: boolean } {
  const removed = c.pods.filter((p) => p.phase === 'Terminating').map((p) => p.name);
  let state: Cluster = {
    ...c,
    pods: c.pods.map((p) => (p.phase === 'Terminating' ? { ...p, phase: 'Gone' as const } : p)),
  };
  let rivalArrived = false;
  if (config.rival && !state.rivalAdded) {
    state = { rivalAdded: true, pods: [...state.pods, rivalPod(Math.max(...state.pods.map((p) => p.order)) + 1)] };
    rivalArrived = true;
  }
  const cycle = schedulingCycle(state);
  return { cluster: cycle.cluster, events: cycle.events, removed, rivalArrived };
}

export const canRun = (c: Cluster) => queueOf(c).length > 0 && !c.pods.some((p) => p.phase === 'Terminating');
export const canFinish = (c: Cluster) => c.pods.some((p) => p.phase === 'Terminating');

export interface YamlLine {
  text: string;
  id?: string;
}

export function classYaml(cls: ClassId): YamlLine[] {
  if (cls === 'none') return [{ text: '# no priorityClassName on api-pod: priority resolves to 0 and no PriorityClass is read' }];
  const spec = priorityClasses[cls];
  return [
    { text: 'apiVersion: scheduling.k8s.io/v1' },
    { text: 'kind: PriorityClass' },
    { text: 'metadata:' },
    { text: `  name: ${cls}` },
    { text: `value: ${spec.value}`, id: 'pc.value' },
    { text: `preemptionPolicy: ${spec.preemptionPolicy}`, id: 'pc.preemptionPolicy' },
    { text: 'globalDefault: false' },
  ];
}

export function podYaml(c: Cluster, config: Config): YamlLine[] {
  const api = pod(c, 'api-pod');
  const lines: YamlLine[] = [
    { text: 'apiVersion: v1' },
    { text: 'kind: Pod' },
    { text: 'metadata:' },
    { text: '  name: api-pod' },
    { text: 'spec:' },
    config.cls === 'none'
      ? { text: '  # priorityClassName omitted', id: 'pod.priorityClassName' }
      : { text: `  priorityClassName: ${config.cls}`, id: 'pod.priorityClassName' },
    { text: `  schedulerName: ${config.schedulerName}`, id: 'pod.schedulerName' },
    { text: '  containers:' },
    { text: '  - name: api' },
    { text: '    image: registry.example.com/api:1.0' },
    { text: '    resources:' },
    { text: '      requests:' },
    { text: '        cpu: 600m', id: 'pod.requests' },
  ];
  if (api?.node) lines.push({ text: `  nodeName: ${api.node}   # set by binding`, id: 'spec.nodeName' });
  else lines.push({ text: '  # nodeName unset: only binding sets it' });
  lines.push({ text: 'status:' });
  lines.push({ text: '  phase: Pending   # Assigned is not Running; the kubelet starts containers', id: 'status.phase' });
  if (api?.nominatedNode) lines.push({ text: `  nominatedNodeName: ${api.nominatedNode}`, id: 'status.nominatedNodeName' });
  else lines.push({ text: '  # nominatedNodeName unset' });
  return lines;
}

export function victimYaml(c: Cluster): YamlLine[] {
  const victims = c.pods.filter((p) => p.disruption === 'PreemptionByScheduler' && p.phase === 'Terminating');
  if (victims.length === 0) return [{ text: '# no Pod is marked for preemption' }];
  const out: YamlLine[] = [];
  for (const v of victims) {
    out.push({ text: `# ${v.name}, priority ${v.priority}` });
    out.push({ text: 'status:' });
    out.push({ text: '  conditions:' });
    out.push({ text: '  - type: DisruptionTarget' });
    out.push({ text: '    status: "True"' });
    out.push({ text: '    reason: PreemptionByScheduler', id: 'victim.conditions' });
  }
  return out;
}

export function budgetYaml(config: Config): YamlLine[] {
  const out: YamlLine[] = [];
  if (config.pdbBatch2) {
    out.push(
      { text: '# PodDisruptionBudget over batch-2 (one Pod labelled shard: b)' },
      { text: 'apiVersion: policy/v1' },
      { text: 'kind: PodDisruptionBudget' },
      { text: 'metadata:' },
      { text: '  name: batch-2-budget' },
      { text: 'spec:' },
      { text: '  minAvailable: 1', id: 'pdb.spec' },
      { text: '  selector:' },
      { text: '    matchLabels:' },
      { text: '      shard: b' },
    );
  }
  if (config.pdbReports) {
    out.push(
      { text: '# PodDisruptionBudget over reports-1 (one Pod labelled app: reports)' },
      { text: 'apiVersion: policy/v1' },
      { text: 'kind: PodDisruptionBudget' },
      { text: 'metadata:' },
      { text: '  name: reports-budget' },
      { text: 'spec:' },
      { text: '  minAvailable: 1', id: 'pdb.spec' },
      { text: '  selector:' },
      { text: '    matchLabels:' },
      { text: '      app: reports' },
    );
  }
  if (out.length === 0) out.push({ text: '# no PodDisruptionBudget is enabled in this fixture' });
  return out;
}
