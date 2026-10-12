// Pure, deterministic model of one workload's web Pods on four Nodes in two zones, under one topology spread constraint.
// Modelled scope: the spread filter (DoNotSchedule) and the spread preference (ScheduleAnyway) only. Not modelled: resources,
// taints, affinity, priority, namespaces, Running or Ready, descheduling, cluster default constraints, or ties beyond name order.

export type NodeName = 'node-a1' | 'node-a2' | 'node-b1' | 'node-b2';
export type Zone = 'zone-a' | 'zone-b';
export type TopologyKey = 'zone' | 'hostname';
export type Policy = 'DoNotSchedule' | 'ScheduleAnyway';
export interface Constraint { topologyKey: TopologyKey; maxSkew: 1 | 2; whenUnsatisfiable: Policy; minDomains: boolean }
/** A web Pod object. node is null until the scheduler binds it. A removed Pod keeps its id, which is never reused. */
export interface WebPod { id: number; node: NodeName | null; removed: boolean }
export interface SpreadState { constraint: Constraint; pods: WebPod[]; nextId: number; ran: boolean }
export type EditKey = keyof Constraint;

/** Nodes in fixed name order. The order is also the fixture's tie-break: the first passing or first tied node wins. */
export const nodes: ReadonlyArray<{ name: NodeName; zone: Zone }> = [
  { name: 'node-a1', zone: 'zone-a' },
  { name: 'node-a2', zone: 'zone-a' },
  { name: 'node-b1', zone: 'zone-b' },
  { name: 'node-b2', zone: 'zone-b' },
];
export const labelKeys: Record<TopologyKey, string> = { zone: 'topology.kubernetes.io/zone', hostname: 'kubernetes.io/hostname' };
export const MIN_DOMAINS = 3;

export const initialConstraint: Constraint = { topologyKey: 'zone', maxSkew: 1, whenUnsatisfiable: 'DoNotSchedule', minDomains: false };

export function initialState(): SpreadState {
  return {
    constraint: { ...initialConstraint },
    pods: [
      { id: 1, node: 'node-a1', removed: false },
      { id: 2, node: 'node-a1', removed: false },
      { id: 3, node: 'node-b1', removed: false },
      { id: 4, node: null, removed: false },
    ],
    nextId: 5,
    ran: false,
  };
}

export const podName = (id: number) => `web-${id}`;
export const zoneOf = (node: NodeName): Zone => nodes.find((n) => n.name === node)!.zone;
/** The domain a node belongs to for one topologyKey. Every fixture Node carries both labels. */
export const domainOf = (node: NodeName, key: TopologyKey): string => (key === 'zone' ? zoneOf(node) : node);

/** Pods the scheduler counts: assigned and not removed. The pending Pod is not counted until it is bound. */
export function assigned(state: SpreadState): Array<{ id: number; node: NodeName }> {
  return state.pods.flatMap((pod) => (pod.node !== null && !pod.removed ? [{ id: pod.id, node: pod.node }] : []));
}
export function pendingPod(state: SpreadState): WebPod | undefined {
  return state.pods.find((pod) => pod.node === null && !pod.removed);
}
/** The assigned Pod a delete removes: the highest id, so the most recently created one. */
export function newestAssigned(state: SpreadState): { id: number; node: NodeName } | undefined {
  const counted = assigned(state);
  return counted.length ? counted.reduce((latest, pod) => (pod.id > latest.id ? pod : latest)) : undefined;
}

/**
 * The Pod the manifest is about: the pending Pod when one exists; otherwise the Pod the last run bound; otherwise null,
 * which means the next Pod the template would create.
 */
export function shownPod(state: SpreadState, lastRun: number | null): WebPod | null {
  const pending = pendingPod(state);
  if (pending) return pending;
  if (lastRun === null) return null;
  return state.pods.find((pod) => pod.id === lastRun && pod.node !== null && !pod.removed) ?? null;
}

export interface Row {
  node: NodeName;
  zone: Zone;
  domain: string;
  /** Assigned matching Pods in this candidate's domain before the pending Pod is placed. */
  matching: number;
  /** Matching Pods in the domain if the pending Pod lands here: the pending Pod matches its own selector. */
  ifPlaced: number;
  /** ifPlaced minus the global minimum. DoNotSchedule rejects when this exceeds maxSkew. */
  skew: number;
  pass: boolean;
}
export interface Evaluation {
  rows: Row[];
  /** Distinct eligible domains for the chosen topologyKey. */
  domains: number;
  /** Global minimum used by the filter: the lowest domain count, or 0 when domains are fewer than minDomains. */
  min: number;
  minDomainsApplied: boolean;
  /** Spread of the existing Pods: max − min over domains. A readout only; the filter never uses it. */
  currentSkew: number;
  selected: NodeName | null;
}

/**
 * Evaluate where the pending Pod could go. Counts never include the pending Pod; each candidate adds the pending Pod once.
 * DoNotSchedule keeps a candidate only when its skew is at most maxSkew, then picks the first passing node by name.
 * ScheduleAnyway keeps every candidate, then picks the one with the fewest matching Pods (ties go to the earlier name).
 */
export function evaluate(state: SpreadState): Evaluation {
  const { topologyKey: key, maxSkew, whenUnsatisfiable: policy, minDomains } = state.constraint;
  const domainNames = [...new Set(nodes.map((node) => domainOf(node.name, key)))];
  const matchingBy = new Map<string, number>(domainNames.map((domain) => [domain, 0] as const));
  for (const pod of assigned(state)) {
    const domain = domainOf(pod.node, key);
    matchingBy.set(domain, matchingBy.get(domain)! + 1);
  }
  const counts = domainNames.map((domain) => matchingBy.get(domain)!);
  const minDomainsApplied = policy === 'DoNotSchedule' && minDomains && domainNames.length < MIN_DOMAINS;
  const min = minDomainsApplied ? 0 : Math.min(...counts);
  const rows: Row[] = nodes.map(({ name, zone }) => {
    const domain = domainOf(name, key);
    const matching = matchingBy.get(domain)!;
    const skew = matching + 1 - min;
    return { node: name, zone, domain, matching, ifPlaced: matching + 1, skew, pass: policy === 'ScheduleAnyway' || skew <= maxSkew };
  });
  let selected: Row | undefined;
  for (const row of rows) {
    if (!row.pass) continue;
    if (!selected || (policy === 'ScheduleAnyway' && row.matching < selected.matching)) selected = row;
  }
  return {
    rows,
    domains: domainNames.length,
    min,
    minDomainsApplied,
    currentSkew: Math.max(...counts) - Math.min(...counts),
    selected: selected?.node ?? null,
  };
}

export type Outcome = 'rejected' | 'selected' | 'passes' | 'ranked-out' | 'tied-out';
/** What a run did to one candidate. Only meaningful after a run; the figure shows no outcome before one. */
export function outcomeOf(row: Row, evaluation: Evaluation, policy: Policy): Outcome {
  if (!row.pass) return 'rejected';
  if (row.node === evaluation.selected) return 'selected';
  if (policy === 'DoNotSchedule') return 'passes';
  const chosen = evaluation.rows.find((candidate) => candidate.node === evaluation.selected);
  return chosen && row.matching > chosen.matching ? 'ranked-out' : 'tied-out';
}

/** A template edit. With a pending Pod, it edits that Pod in place; with none, the next Pod created reads the new constraint. */
export function configure(state: SpreadState, patch: Partial<Constraint>): SpreadState {
  const next: Constraint = { ...state.constraint, ...patch };
  // minDomains is valid only with DoNotSchedule, so choosing ScheduleAnyway clears it.
  const constraint = next.whenUnsatisfiable === 'ScheduleAnyway' ? { ...next, minDomains: false } : next;
  return { ...state, constraint, ran: false };
}

/** ReplicaSet-style create: a new unassigned web Pod with the next id. Does nothing while one is already pending. */
export function scaleUp(state: SpreadState): SpreadState {
  if (pendingPod(state)) return state;
  return { ...state, pods: [...state.pods, { id: state.nextId, node: null, removed: false }], nextId: state.nextId + 1, ran: false };
}

/** One placement run. Binds the pending Pod to the selected node, or leaves it unassigned (ran = true). */
export function place(state: SpreadState): { state: SpreadState; evaluation: Evaluation } {
  const evaluation = evaluate(state);
  const pending = pendingPod(state);
  if (!pending) return { state, evaluation };
  const pods = state.pods.map((pod) => (pod === pending ? { ...pod, node: evaluation.selected } : pod));
  return { state: { ...state, pods, ran: evaluation.selected === null }, evaluation };
}

/** Scale-down or eviction stand-in: removes the newest assigned Pod. Nothing else moves, and nothing is placed. */
export function removeNewest(state: SpreadState): SpreadState {
  const victim = newestAssigned(state);
  if (!victim) return state;
  return { ...state, pods: state.pods.map((pod) => (pod.id === victim.id ? { ...pod, removed: true } : pod)), ran: false };
}

export interface YamlLine { text: string; id?: string }

/** Node labels the spread reads, one block per Node. Both label keys are shown; a run reads only the chosen key. */
export function nodeYaml(): YamlLine[] {
  return [
    { text: '# fixture view: labels of the four Node objects' },
    ...nodes.flatMap(({ name, zone }) => [
      { text: `- name: ${name}` },
      { text: '  labels:' },
      { text: `    ${labelKeys.zone}: ${zone}`, id: `node.${name}.zone` },
      { text: `    ${labelKeys.hostname}: ${name}`, id: `node.${name}.hostname` },
    ]),
  ];
}

/**
 * The manifest of the Pod in `shown`. A pending Pod has no spec.nodeName; a bound Pod shows it between spec and the
 * constraint, as the API does. With no shown Pod, the manifest is the next Pod the template would create.
 */
export function podYaml(state: SpreadState, shown: WebPod | null): YamlLine[] {
  const { topologyKey, maxSkew, whenUnsatisfiable, minDomains } = state.constraint;
  const name = shown ? podName(shown.id) : podName(state.nextId);
  return [
    { text: 'apiVersion: v1' },
    { text: 'kind: Pod' },
    { text: 'metadata:' },
    { text: `  name: ${name}${shown ? '' : '  # next Pod created from this template'}`, id: 'pod.name' },
    { text: '  labels:', id: 'pod.label' },
    { text: '    app: web', id: 'pod.label' },
    { text: 'spec:' },
    ...(shown?.node ? [{ text: `  nodeName: ${shown.node}`, id: 'pod.nodeName' }] : []),
    { text: '  topologySpreadConstraints:' },
    { text: `  - maxSkew: ${maxSkew}`, id: 'pod.maxSkew' },
    { text: `    topologyKey: ${labelKeys[topologyKey]}`, id: 'pod.topologyKey' },
    { text: `    whenUnsatisfiable: ${whenUnsatisfiable}`, id: 'pod.whenUnsatisfiable' },
    ...(minDomains ? [{ text: `    minDomains: ${MIN_DOMAINS}`, id: 'pod.minDomains' }] : []),
    { text: '    labelSelector:', id: 'pod.selector' },
    { text: '      matchLabels:', id: 'pod.selector' },
    { text: '        app: web', id: 'pod.selector' },
    { text: '  containers:' },
    { text: '  - name: web' },
    { text: '    image: registry.example.com/web:1.0' },
  ];
}

/**
 * Lines a run reads: the constraint fields, the Pod's own labels and selector, and each Node's label in the chosen key.
 * A bind also changed spec.nodeName, so that line is included when the run bound the Pod.
 */
export function runMarkIds(state: SpreadState, bound: boolean): string[] {
  const { topologyKey, minDomains } = state.constraint;
  return [
    'pod.label',
    'pod.selector',
    'pod.maxSkew',
    'pod.topologyKey',
    'pod.whenUnsatisfiable',
    ...(minDomains ? ['pod.minDomains'] : []),
    ...nodes.map((node) => `node.${node.name}.${topologyKey}`),
    ...(bound ? ['pod.nodeName'] : []),
  ];
}

/** Lines an edit changed. Scale-up and removal change Pod objects, not the manifest lines shown here. */
export function editMarkIds(edit: EditKey | 'scale' | 'remove' | 'reset'): string[] {
  switch (edit) {
    case 'topologyKey': return ['pod.topologyKey'];
    case 'maxSkew': return ['pod.maxSkew'];
    case 'whenUnsatisfiable': return ['pod.whenUnsatisfiable', 'pod.minDomains'];
    case 'minDomains': return ['pod.minDomains'];
    default: return [];
  }
}
