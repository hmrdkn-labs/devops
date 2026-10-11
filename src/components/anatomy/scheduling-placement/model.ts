export type Phase = 'created' | 'filtered' | 'selected' | 'assigned' | 'running';
export type Budget = { cpu: number; memory: number };
export type NodeBudget = { id: string; allocatable: Budget; existing: Budget };
export type Fixture = 'mixed' | 'equal';
export type Placement = { fixture: Fixture; request: Budget; phase: Phase; selected: string | null };

export const INITIAL: Placement = { fixture: 'mixed', request: { cpu: 600, memory: 1024 }, phase: 'created', selected: null };
export const NODES: Record<Fixture, readonly NodeBudget[]> = {
  mixed: [
    { id: 'node-a', allocatable: { cpu: 2000, memory: 4096 }, existing: { cpu: 1700, memory: 2048 } },
    { id: 'node-b', allocatable: { cpu: 2000, memory: 4096 }, existing: { cpu: 800, memory: 3584 } },
    { id: 'node-c', allocatable: { cpu: 2000, memory: 4096 }, existing: { cpu: 1000, memory: 2048 } },
  ],
  equal: ['node-a', 'node-b', 'node-c'].map((id) => ({ id, allocatable: { cpu: 2000, memory: 4096 }, existing: { cpu: 1000, memory: 2048 } })),
};

export function evaluate(node: NodeBudget, request: Budget) {
  const available = { cpu: node.allocatable.cpu - node.existing.cpu, memory: node.allocatable.memory - node.existing.memory };
  const reasons: string[] = [];
  if (request.cpu > available.cpu) reasons.push(`insufficient CPU: ${request.cpu - available.cpu}m short`);
  if (request.memory > available.memory) reasons.push(`insufficient memory: ${request.memory - available.memory}Mi short`);
  // Authored policy: average normalized slack AFTER placement, not kube-scheduler's default score.
  const score = reasons.length ? null : 50 * ((available.cpu - request.cpu) / node.allocatable.cpu + (available.memory - request.memory) / node.allocatable.memory);
  return { node, available, eligible: reasons.length === 0, reasons, score };
}

export function candidates(state: Placement) {
  return NODES[state.fixture].map((node) => evaluate(node, state.request));
}

export function choose(state: Placement): string | null {
  return candidates(state).filter((candidate) => candidate.eligible)
    .sort((a, b) => b.score! - a.score! || (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0))[0]?.node.id ?? null;
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
  switch (state.phase) {
    case 'created': return 'Created · nodeName empty · containers not started';
    case 'filtered': return candidates(state).some((candidate) => candidate.eligible)
      ? `Filtered · ${candidates(state).filter((candidate) => candidate.eligible).length} eligible · nodeName empty`
      : 'Unscheduled · no eligible nodes · nodeName empty · containers not started';
    case 'selected': return `Selected ${state.selected} · illustrative score · nodeName still empty`;
    case 'assigned': return `Assigned · nodeName ${state.selected} · containers not started`;
    case 'running': return `Running on ${state.selected} · separate kubelet/runtime fixture step · readiness not proven`;
  }
}

export const actionLabel = (phase: Phase) => ({ created: '1 · Filter budgets', filtered: '2 · Score eligible nodes', selected: '3 · Record assignment', assigned: '4 · Simulate node execution', running: 'Execution complete' })[phase];
