export type Phase = 'created' | 'filtered' | 'selected' | 'assigned' | 'running';
export type Budget = { cpu: number; memory: number };
export type NodeBudget = { id: string; allocatable: Budget; existing: Budget };
export type Fixture = 'mixed' | 'equal';
export type Placement = { fixture: Fixture; request: Budget; phase: Phase; selected: string | null };
/** The control that produced the last committed transition; decides which manifest lines it read or changed. */
export type Interaction = 'configure' | 'filter' | 'score' | 'assign' | 'execute' | 'replay' | 'reset';
export interface ManifestLine { text: string; highlight: boolean }
export interface ResourceCheck { free: number; requested: number; pass: boolean; margin: number }
export interface Evaluation {
  node: NodeBudget;
  available: Budget;
  cpu: ResourceCheck;
  memory: ResourceCheck;
  eligible: boolean;
  score: number | null;
}

export const INITIAL: Placement = { fixture: 'mixed', request: { cpu: 600, memory: 1024 }, phase: 'created', selected: null };
export const NODES: Record<Fixture, readonly NodeBudget[]> = {
  mixed: [
    { id: 'node-a', allocatable: { cpu: 2000, memory: 4096 }, existing: { cpu: 1700, memory: 2048 } },
    { id: 'node-b', allocatable: { cpu: 2000, memory: 4096 }, existing: { cpu: 800, memory: 3584 } },
    { id: 'node-c', allocatable: { cpu: 2000, memory: 4096 }, existing: { cpu: 1000, memory: 2048 } },
  ],
  equal: ['node-a', 'node-b', 'node-c'].map((id) => ({ id, allocatable: { cpu: 2000, memory: 4096 }, existing: { cpu: 1000, memory: 2048 } })),
};

/** Filter: each resource is checked independently; equality fits. Score exists only for feasible docks. */
export function evaluate(node: NodeBudget, request: Budget): Evaluation {
  const available = { cpu: node.allocatable.cpu - node.existing.cpu, memory: node.allocatable.memory - node.existing.memory };
  const cpu: ResourceCheck = { free: available.cpu, requested: request.cpu, pass: request.cpu <= available.cpu, margin: available.cpu - request.cpu };
  const memory: ResourceCheck = { free: available.memory, requested: request.memory, pass: request.memory <= available.memory, margin: available.memory - request.memory };
  const eligible = cpu.pass && memory.pass;
  // Authored illustrative policy: average normalized slack AFTER placement. Not kube-scheduler's default scoring.
  const score = eligible ? 50 * (cpu.margin / node.allocatable.cpu + memory.margin / node.allocatable.memory) : null;
  return { node, available, cpu, memory, eligible, score };
}

export function candidates(state: Placement): Evaluation[] {
  return NODES[state.fixture].map((node) => evaluate(node, state.request));
}

/** Feasible docks, highest score first. Exact ties go to the lexicographically smaller name. */
export function ranking(state: Placement): Evaluation[] {
  return candidates(state)
    .filter((candidate) => candidate.eligible)
    .sort((a, b) => b.score! - a.score! || (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0));
}

export function choose(state: Placement): string | null {
  return ranking(state)[0]?.node.id ?? null;
}

export function tiedAtTop(state: Placement): boolean {
  const [first, second] = ranking(state);
  return !!second && first!.score === second.score;
}

/** A feasible dock has no visible score until the Score transition has committed. */
export function visibleScore(state: Placement, evaluation: Evaluation): number | null {
  return state.phase === 'created' || state.phase === 'filtered' ? null : evaluation.score;
}

export function advance(state: Placement): Placement {
  switch (state.phase) {
    case 'created': return { ...state, phase: 'filtered' };
    case 'filtered': {
      const selected = choose(state);
      return selected ? { ...state, selected, phase: 'selected' } : state;
    }
    case 'selected': return { ...state, phase: 'assigned' };
    case 'assigned': return { ...state, phase: 'running' };
    case 'running': return state;
  }
}

export function describe(state: Placement): string {
  const feasible = candidates(state).filter((candidate) => candidate.eligible).length;
  switch (state.phase) {
    case 'created': return 'Created · unassigned · spec.nodeName empty · containers not started';
    case 'filtered': return feasible > 0
      ? `Filtered · ${feasible} feasible · not scored · spec.nodeName empty`
      : 'Unscheduled · no feasible dock · spec.nodeName empty · containers not started';
    case 'selected': return `Scored · ${state.selected} selected · not assigned · spec.nodeName still empty`;
    case 'assigned': return `Assigned · spec.nodeName ${state.selected} · phase Pending · containers not started`;
    case 'running': return `Running on ${state.selected} · fixture step · readiness not modeled`;
  }
}

export const actionLabel = (phase: Phase) => ({
  created: '1 · Filter budgets',
  filtered: '2 · Score eligible nodes',
  selected: '3 · Record assignment',
  assigned: '4 · Simulate node execution',
  running: 'Execution complete',
})[phase];

/**
 * Pod manifest derived from the committed state. spec.nodeName is set only by the binding (assigned or later).
 * A highlight marks what the last committed interaction read (filter, score, configure, reset) or changed.
 */
export function manifestLines(state: Placement, last: Interaction | null): ManifestLine[] {
  const bound = state.phase === 'assigned' || state.phase === 'running';
  const unschedulable = state.phase === 'filtered' && choose(state) === null;
  const requestRead = last === 'configure' || last === 'reset' || last === 'filter' || last === 'score';
  const nodeChanged = last === 'assign' || last === 'replay';
  const conditionChanged = last === 'filter' || last === 'assign' || last === 'replay';
  const phaseChanged = last === 'execute' || last === 'replay';
  const line = (text: string, highlight = false): ManifestLine => ({ text, highlight });
  const lines: ManifestLine[] = [
    line('apiVersion: v1'),
    line('kind: Pod'),
    line('metadata:'),
    line('  name: report-worker'),
    line('  namespace: reports'),
    line('spec:'),
    line(`  nodeName: ${bound && state.selected ? state.selected : '""'}`, nodeChanged),
    line('  containers:'),
    line('    - name: worker'),
    line('      image: registry.example.com/report-worker:1.4.2'),
    line('      resources:'),
    line('        requests:'),
    line(`          cpu: ${state.request.cpu}m`, requestRead),
    line(`          memory: ${state.request.memory}Mi`, requestRead),
    line('        limits:'),
    line('          cpu: "2"'),
    line('          memory: 4Gi'),
    line('status:'),
    line(`  phase: ${state.phase === 'running' ? 'Running' : 'Pending'}`, phaseChanged),
  ];
  if (bound || unschedulable) {
    lines.push(line('  conditions:', conditionChanged), line('    - type: PodScheduled', conditionChanged), line(`      status: "${bound ? 'True' : 'False'}"`, conditionChanged));
    if (unschedulable) lines.push(line('      reason: Unschedulable', conditionChanged));
  }
  return lines;
}
