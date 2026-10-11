export type RequiredRule = 'none' | 'east-ssd' | 'east-ssd-or-west';
export type Phase = 'created' | 'filtered' | 'scored' | 'assigned' | 'running' | 'unscheduled';
export interface Settings {
  selector: 'any' | 'ssd' | 'hdd';
  required: RequiredRule;
  preferredZone: 'east' | 'west';
  weight: number;
  capacityC: boolean;
}
export interface FixtureNode { id: string; disk: string; zone: string; capacity: boolean }
export interface State { settings: Settings; phase: Phase; bound: string | null; labelsChanged: boolean }
export const defaults: Settings = { selector: 'ssd', required: 'east-ssd-or-west', preferredZone: 'west', weight: 60, capacityC: true };
export const initialState = (): State => ({ settings: { ...defaults }, phase: 'created', bound: null, labelsChanged: false });
export function nodesFor(state: State): FixtureNode[] {
  const nodes = [
    { id: 'node-a', disk: 'ssd', zone: 'east', capacity: true },
    { id: 'node-b', disk: 'ssd', zone: 'west', capacity: true },
    { id: 'node-c', disk: 'hdd', zone: 'east', capacity: state.settings.capacityC },
  ];
  return nodes.map(node => state.labelsChanged && node.id === state.bound ? { ...node, disk: 'archive', zone: 'retired' } : node);
}
export function evaluate(node: FixtureNode, settings: Settings) {
  const selector = settings.selector === 'any' || node.disk === settings.selector;
  const term1 = node.zone === 'east' && node.disk === 'ssd';
  const term2 = node.zone === 'west';
  const required = settings.required === 'none' || term1 || (settings.required === 'east-ssd-or-west' && term2);
  const reasons: string[] = [];
  if (!node.capacity) reasons.push('request capacity unavailable');
  if (!selector) reasons.push(`nodeSelector needs disk=${settings.selector}`);
  if (!required) reasons.push('required affinity has no matching term');
  const eligible = reasons.length === 0;
  // Raw preferred-rule contribution only; no scheduler normalization or other plugins.
  const score = eligible ? (node.zone === settings.preferredZone ? settings.weight : 0) : null;
  return { node, selector, required, term1, term2, eligible, reasons, score };
}
export function candidates(state: State) { return nodesFor(state).map(node => evaluate(node, state.settings)); }
export function winner(state: State): string | null {
  const eligible = candidates(state).filter(row => row.eligible);
  eligible.sort((a, b) => (b.score! - a.score!) || a.node.id.localeCompare(b.node.id));
  return eligible[0]?.node.id ?? null;
}
export function advance(state: State): State {
  switch (state.phase) {
    case 'created': return { ...state, phase: 'filtered' };
    case 'filtered': return { ...state, phase: winner(state) ? 'scored' : 'unscheduled' };
    case 'scored': return { ...state, phase: 'assigned', bound: winner(state) };
    case 'assigned': return { ...state, phase: 'running' };
    default: return state;
  }
}
export function changeRunningLabels(state: State): State {
  return state.phase === 'running' && state.bound ? { ...state, labelsChanged: true } : state;
}
export function readout(state: State): string {
  const count = candidates(state).filter(row => row.eligible).length;
  if (state.phase === 'created') return `Created, unassigned · ${count} feasible node(s) in preview · step to filter`;
  if (state.phase === 'filtered') return `Hard filters complete · ${count} eligible · only these can be scored`;
  if (state.phase === 'scored') return `Preference scored · fixture choice ${winner(state)} · not yet assigned`;
  if (state.phase === 'unscheduled') return 'Unscheduled · zero eligible nodes · preferences cannot rescue a failed requirement';
  if (state.phase === 'assigned') return `Assigned to ${state.bound} · containers have not started in this fixture`;
  return state.labelsChanged
    ? `Still running on ${state.bound} · labels changed · no eviction from IgnoredDuringExecution`
    : `Running on ${state.bound} · fixture kubelet/runtime step, not scheduler execution`;
}
