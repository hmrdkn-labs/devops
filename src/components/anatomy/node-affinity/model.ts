import type { Change } from '@/components/anatomy/shared/ChangeReport';
import type { ManifestLine } from '@/components/anatomy/shared/ManifestPanel';

export const NODE_IDS = ['node-a', 'node-b', 'node-c'] as const;
export type NodeId = (typeof NODE_IDS)[number];
export type SelectorRule = 'any' | 'ssd' | 'hdd';
export type RequiredRule = 'none' | 'east-ssd' | 'east-ssd-or-west';
export type Zone = 'east' | 'west';
export type Phase = 'created' | 'filtered' | 'scored' | 'assigned' | 'running' | 'unscheduled';
/** The YAML field group the last interaction read or changed. */
export type Focus = 'none' | 'selector' | 'required' | 'preferred' | 'capacity' | 'filter' | 'score' | 'binding' | 'status' | 'labels';
export interface Settings { selector: SelectorRule; required: RequiredRule; preferredZone: Zone; weight: number; capacityC: boolean }
export type Setting = keyof Settings;
export interface FixtureNode { id: NodeId; disk: 'ssd' | 'hdd' | 'archive'; zone: Zone | 'retired'; capacity: boolean }
export interface State {
  settings: Settings;
  phase: Phase;
  /** Node the Pod is assigned to. Non-null exactly in the assigned and running phases. */
  bound: NodeId | null;
  /** The bound node's labels were changed after the Pod started. */
  relabeled: boolean;
  /** Pod instance number; a replay creates a new Pod with the next number. */
  serial: number;
  focus: Focus;
}
export type Action =
  | { kind: 'setting'; key: Setting; value: Settings[Setting] }
  | { kind: 'step' }
  | { kind: 'labels' }
  | { kind: 'replay' }
  | { kind: 'reset' };

export const defaults: Settings = { selector: 'ssd', required: 'east-ssd-or-west', preferredZone: 'west', weight: 60, capacityC: true };
export const WEIGHT_MIN = 1;
export const WEIGHT_MAX = 100;
/** Visual rise of an eligible plunger: a base lift shows eligibility, the score adds height. */
const PLUNGER_BASE = 4;
const PLUNGER_PER_POINT = 1 / 5;

const fixture: FixtureNode[] = [
  { id: 'node-a', disk: 'ssd', zone: 'east', capacity: true },
  { id: 'node-b', disk: 'ssd', zone: 'west', capacity: true },
  { id: 'node-c', disk: 'hdd', zone: 'east', capacity: true },
];

export function initialState(serial = 1): State {
  return { settings: { ...defaults }, phase: 'created', bound: null, relabeled: false, serial, focus: 'none' };
}
export const podName = (state: State) => `sorter-${state.serial}`;

/** Node labels as the scheduler sees them now. Only the bound node can be relabelled. */
export function nodesFor(state: State): FixtureNode[] {
  return fixture.map((node) => {
    const capacity = node.id === 'node-c' ? state.settings.capacityC : node.capacity;
    return state.relabeled && node.id === state.bound
      ? { ...node, capacity, disk: 'archive', zone: 'retired' }
      : { ...node, capacity };
  });
}

export interface Expression { key: 'zone' | 'disk'; wanted: string; actual: string; pass: boolean }
export interface Term { name: 'east AND ssd' | 'west'; expressions: Expression[]; pass: boolean }
export interface Evaluation {
  node: FixtureNode;
  selector: { wanted: string | null; actual: string; pass: boolean };
  /** Required-affinity terms that apply under the current rule. Empty when required affinity is absent. */
  terms: Term[];
  required: { applies: boolean; pass: boolean };
  capacity: { pass: boolean };
  preference: { match: boolean; weight: number };
  eligible: boolean;
  reasons: string[];
  /** Raw preferred-rule contribution for eligible nodes; null when the node is not eligible. */
  score: number | null;
}

function expression(key: Expression['key'], wanted: string, actual: string): Expression {
  return { key, wanted, actual, pass: actual === wanted };
}
function term(name: Term['name'], expressions: Expression[]): Term {
  return { name, expressions, pass: expressions.every((item) => item.pass) };
}

/** nodeSelectorTerms: terms are ORed; the expressions inside one term are ANDed. */
export function requiredTerms(rule: RequiredRule, node: FixtureNode): Term[] {
  if (rule === 'none') return [];
  const east = term('east AND ssd', [expression('zone', 'east', node.zone), expression('disk', 'ssd', node.disk)]);
  if (rule === 'east-ssd') return [east];
  return [east, term('west', [expression('zone', 'west', node.zone)])];
}

export function evaluate(node: FixtureNode, settings: Settings): Evaluation {
  const wanted = settings.selector === 'any' ? null : settings.selector;
  const selectorPass = wanted === null || node.disk === wanted;
  const terms = requiredTerms(settings.required, node);
  const requiredApplies = terms.length > 0;
  const requiredPass = !requiredApplies || terms.some((item) => item.pass);
  const capacityPass = node.capacity;
  const preferenceMatch = node.zone === settings.preferredZone;
  const reasons: string[] = [];
  if (!capacityPass) reasons.push('request capacity missing');
  if (!selectorPass) reasons.push(`nodeSelector needs disk=${wanted}, node has disk=${node.disk}`);
  if (!requiredPass) reasons.push('required affinity has no matching term');
  const eligible = reasons.length === 0;
  return {
    node,
    selector: { wanted, actual: node.disk, pass: selectorPass },
    terms,
    required: { applies: requiredApplies, pass: requiredPass },
    capacity: { pass: capacityPass },
    preference: { match: preferenceMatch, weight: settings.weight },
    eligible,
    reasons,
    // Raw preferred-rule contribution only; no normalization or other score plugins.
    score: eligible ? (preferenceMatch ? settings.weight : 0) : null,
  };
}

export function candidates(state: State): Evaluation[] {
  return nodesFor(state).map((node) => evaluate(node, state.settings));
}

/**
 * Feeler indicators. Each feeler reports one predicate: the selector and required-affinity
 * feelers reflect label matching only; capacity has its own feeler. A feeler is lifted only
 * after evaluation, when its check applies and passes.
 */
export interface Feelers { selector: boolean; required: boolean; capacity: boolean }
export function feelers(row: Evaluation, evaluated: boolean): Feelers {
  return {
    selector: evaluated && row.selector.wanted !== null && row.selector.pass,
    required: evaluated && row.required.applies && row.required.pass,
    capacity: evaluated && row.capacity.pass,
  };
}

/** Plunger rise: eligible and scored nodes rise; the height adds the preference score. */
export function plungerRise(row: Evaluation, scored: boolean): number {
  return scored && row.eligible ? PLUNGER_BASE + (row.score ?? 0) * PLUNGER_PER_POINT : 0;
}

export function winner(state: State): NodeId | null {
  const eligible = candidates(state).filter((row) => row.eligible);
  eligible.sort((a, b) => (b.score! - a.score!) || a.node.id.localeCompare(b.node.id));
  return eligible[0]?.node.id ?? null;
}

export function advance(state: State): State {
  switch (state.phase) {
    case 'created': {
      const anyEligible = candidates(state).some((row) => row.eligible);
      return { ...state, phase: anyEligible ? 'filtered' : 'unscheduled', focus: 'filter' };
    }
    case 'filtered':
      return { ...state, phase: winner(state) ? 'scored' : 'unscheduled', focus: 'score' };
    case 'scored': {
      const chosen = winner(state);
      return chosen ? { ...state, phase: 'assigned', bound: chosen, focus: 'binding' } : state;
    }
    case 'assigned':
      return { ...state, phase: 'running', focus: 'status' };
    default:
      return state;
  }
}

const focusFor: Record<Setting, Focus> = {
  selector: 'selector', required: 'required', preferredZone: 'preferred', weight: 'preferred', capacityC: 'capacity',
};

/** Rules are frozen once the Pod is assigned; a change restarts this same Pod's evaluation. */
export function setSetting<K extends Setting>(state: State, key: K, value: Settings[K]): State {
  if (state.bound !== null) return state;
  const clamped = key === 'weight' ? Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, Math.round(Number(value)))) : value;
  return {
    ...state,
    settings: { ...state.settings, [key]: clamped },
    phase: 'created', bound: null, relabeled: false, focus: focusFor[key],
  };
}

export function changeRunningLabels(state: State): State {
  if (state.phase !== 'running' || state.bound === null || state.relabeled) return state;
  return { ...state, relabeled: true, focus: 'labels' };
}

export function replay(state: State): State {
  return { ...initialState(state.serial + 1), settings: { ...state.settings } };
}

export function reduce(state: State, action: Action): State {
  switch (action.kind) {
    case 'setting': return setSetting(state, action.key, action.value);
    case 'step': return advance(state);
    case 'labels': return changeRunningLabels(state);
    case 'replay': return replay(state);
    case 'reset': return initialState(1);
  }
}

/** Lifecycle facts kept separate: assignment is a binding, Running is a later kubelet step. */
export function lifecycle(state: State) {
  return { assignedTo: state.bound, running: state.phase === 'running', unscheduled: state.phase === 'unscheduled' };
}

export function readout(state: State): string {
  const pod = podName(state);
  const eligible = candidates(state).filter((row) => row.eligible).length;
  switch (state.phase) {
    case 'created': return `${pod} · Unassigned · no filter has run`;
    case 'filtered': return `${pod} · Unassigned · ${eligible} node(s) passed the filters`;
    case 'scored': return `${pod} · Unassigned · scores recorded, no assignment yet`;
    case 'unscheduled': return `${pod} · Unscheduled · zero eligible nodes`;
    case 'assigned': return `${pod} · Assigned to ${state.bound} · not Running`;
    default: return state.relabeled
      ? `${pod} · Running on ${state.bound} · node labels changed, Pod not evicted`
      : `${pod} · Running on ${state.bound} · simulated start`;
  }
}

type Group = 'selector' | 'required' | 'preferred' | 'resources' | 'binding' | 'status';
const groupsOf: Record<Focus, Group[]> = {
  none: [],
  selector: ['selector'],
  required: ['required'],
  preferred: ['preferred'],
  capacity: ['resources'],
  filter: ['selector', 'required', 'resources'],
  score: ['preferred'],
  binding: ['binding'],
  status: ['status'],
  labels: ['selector', 'required'],
};

/** The Pod spec as YAML, generated from the same state the figure uses. */
export function manifest(state: State): ManifestLine[] {
  const s = state.settings;
  const lit = new Set(groupsOf[state.focus]);
  const rows: Array<[string, Group | null]> = [];
  const push = (text: string, group: Group | null = null) => rows.push([text, group]);
  push('apiVersion: v1');
  push('kind: Pod');
  push('metadata:');
  push(`  name: ${podName(state)}`);
  push('spec:');
  if (s.selector === 'any') push('  # no nodeSelector: any node disk is acceptable', 'selector');
  else {
    push('  nodeSelector:', 'selector');
    push(`    disk: ${s.selector}`, 'selector');
  }
  push('  affinity:');
  push('    nodeAffinity:');
  if (s.required === 'none') push('      # no requiredDuringScheduling section: no hard affinity term', 'required');
  else {
    push('      requiredDuringSchedulingIgnoredDuringExecution:', 'required');
    push('        nodeSelectorTerms:', 'required');
    push('          - matchExpressions:   # term 1: its expressions are ANDed', 'required');
    push('              - key: zone', 'required');
    push('                operator: In', 'required');
    push('                values: [east]', 'required');
    push('              - key: disk', 'required');
    push('                operator: In', 'required');
    push('                values: [ssd]', 'required');
    if (s.required === 'east-ssd-or-west') {
      push('          - matchExpressions:   # term 2: ORed with term 1', 'required');
      push('              - key: zone', 'required');
      push('                operator: In', 'required');
      push('                values: [west]', 'required');
    }
  }
  push('      preferredDuringSchedulingIgnoredDuringExecution:', 'preferred');
  push(`        - weight: ${s.weight}   # 1-100, added when a node matches`, 'preferred');
  push('          preference:', 'preferred');
  push('            matchExpressions:', 'preferred');
  push('              - key: zone', 'preferred');
  push('                operator: In', 'preferred');
  push(`                values: [${s.preferredZone}]`, 'preferred');
  push('  containers:');
  push('    - name: sorter');
  push('      image: registry.example.com/sorter:1.0');
  push('      resources:');
  push('        requests:');
  push('          cpu: 500m   # the node must have this much free CPU', 'resources');
  if (state.bound) push(`  nodeName: ${state.bound}   # written by the scheduler binding`, 'binding');
  if (state.phase === 'assigned' || state.phase === 'running' || state.phase === 'unscheduled') {
    const phase = state.phase === 'running' ? 'Running   # simulated kubelet start'
      : state.phase === 'assigned' ? 'Pending   # assigned; containers not started'
      : 'Pending   # no node passed the filters';
    push('status:', 'status');
    push(`  phase: ${phase}`, 'status');
  }
  return rows.map(([text, group]) => ({ text, highlight: group !== null && lit.has(group) }));
}

export function initialReport(): Change {
  return {
    title: `${podName(initialState())} created, unassigned`,
    changed: 'No filter or score has run. Node cards show labels only.',
    actor: 'The Pod author, through the Pod spec shown below',
    reason: 'The scheduler acts only on Pods that have no spec.nodeName yet',
    notYet: 'Not assigned, not scheduled and not Running',
  };
}

function ruleTitle(key: 'selector' | 'required', settings: Settings): string {
  if (key === 'selector') return `nodeSelector ${settings.selector === 'any' ? 'removed' : `set to disk=${settings.selector}`}`;
  return `required affinity ${settings.required === 'none' ? 'removed' : settings.required === 'east-ssd' ? 'set to east AND ssd' : 'set to (east AND ssd) OR west'}`;
}

function rejectionList(rows: Evaluation[]): string {
  return rows.filter((row) => !row.eligible).map((row) => `${row.node.id}: ${row.reasons.join('; ')}`).join(' | ');
}

/** The one-interaction report: what changed, who caused it, why, and what has not happened. */
export function describe(action: Action, before: State, after: State): Change {
  const pod = podName(before);
  if (action.kind === 'setting') {
    const restart = before.phase === 'created'
      ? `${pod} is still unassigned; no filter had run.`
      : `${pod} is unassigned again; its earlier filter and score results are cleared.`;
    if (action.key === 'capacityC') {
      return {
        title: `node-c request capacity ${action.value ? 'on' : 'off'}`,
        changed: restart,
        actor: 'Node capacity on node-c (fixture toggle, not a Pod field)',
        reason: 'The resource-fit filter compares the Pod request with the node\'s free CPU; labels are not involved.',
        notYet: 'Nothing is re-filtered until you press Evaluate node requirements.',
      };
    }
    if (action.key === 'weight' || action.key === 'preferredZone') {
      const pref = after.settings;
      return {
        title: `Preference: ${pref.preferredZone} zone, weight ${pref.weight}`,
        changed: restart,
        actor: 'You, editing the preferredDuringScheduling rule in the Pod spec',
        reason: 'Preferences only rank nodes that already passed every hard check; they cannot make a node eligible.',
        notYet: 'No score is computed until the scoring step.',
      };
    }
    const which = ruleTitle(action.key, after.settings);
    return {
      title: which,
      changed: restart,
      actor: 'You, editing the Pod spec before scheduling',
      reason: action.key === 'selector'
        ? 'The filter stage checks spec.nodeSelector on every node; the new rule changes which labels pass.'
        : 'The filter stage checks required affinity terms (ORed); the new rule changes which node labels match.',
      notYet: 'No node has been re-filtered yet. Press Evaluate node requirements.',
    };
  }
  if (action.kind === 'step') {
    if (before.phase === 'created') {
      const rows = candidates(after);
      const passing = rows.filter((row) => row.eligible).map((row) => row.node.id);
      if (after.phase === 'unscheduled') {
        return {
          title: 'Unscheduled: no node passed the filters',
          changed: `Every node was rejected before scoring. Rejections: ${rejectionList(rows)}`,
          actor: 'kube-scheduler filter plugins: NodeAffinity (nodeSelector and required affinity) and NodeResourcesFit (requests)',
          reason: 'Filtering is a hard gate; a preference is only applied to nodes that survive it',
          notYet: `${pod} stays Pending. Change a rule and evaluate again.`,
        };
      }
      return {
        title: `${passing.length} node(s) passed the filters`,
        changed: `Eligible: ${passing.join(', ')}. ${rejectionList(rows) ? `Rejected: ${rejectionList(rows)}` : 'All nodes passed.'}`,
        actor: 'kube-scheduler filter plugins: NodeAffinity (nodeSelector and required affinity) and NodeResourcesFit (requests)',
        reason: 'Each check is independent: a failed label check and a failed capacity check both exclude the node',
        notYet: 'No preference has been scored and no node is assigned.',
      };
    }
    if (before.phase === 'filtered') {
      const rows = candidates(after).filter((row) => row.eligible);
      const scores = rows.map((row) => `${row.node.id} ${row.score}${row.score === 0 ? ' (no preference match)' : ''}`).join(', ');
      return {
        title: `Scored ${rows.length} eligible node(s)`,
        changed: `Raw preferred-rule scores: ${scores}`,
        actor: 'kube-scheduler score plugins for node affinity preferences',
        reason: 'Only eligible nodes are scored; a zero score means eligible with no preference match, not rejected',
        notYet: 'No assignment is recorded yet. Real scores also include normalization and other plugins.',
      };
    }
    if (before.phase === 'scored') {
      return {
        title: `${pod} assigned to ${after.bound}`,
        changed: `spec.nodeName is now ${after.bound}. The Pod is Assigned, not Running.`,
        actor: 'kube-scheduler, through the binding API',
        reason: `${after.bound} had the highest eligible score in this fixture (ties go to the alphabetically first node)`,
        notYet: `Containers have not started. The kubelet on ${after.bound} has not acted.`,
      };
    }
    return {
      title: `${pod} is Running on ${after.bound} (simulated)`,
      changed: 'Pod phase is Running: containers started in this fixture.',
      actor: `kubelet and container runtime on ${after.bound} (simulated stand-in, not a real kubelet)`,
      reason: 'A kubelet runs only the Pods bound to its own node',
      notYet: 'Running is not Ready. No readiness probe, Service endpoint or traffic is modelled.',
    };
  }
  if (action.kind === 'labels') {
    return {
      title: `${after.bound} labels changed; ${pod} stays on ${after.bound}`,
      changed: `${after.bound} now has disk=archive and zone=retired. ${pod} is still Running there.`,
      actor: 'A node administrator, editing labels on the running node',
      reason: 'Affinity is IgnoredDuringExecution: a label change does not evict a Pod that is already scheduled.',
      notYet: `No eviction, migration or reschedule. A new Pod would be rejected from ${after.bound} under the current rules.`,
    };
  }
  if (action.kind === 'replay') {
    return {
      title: `${podName(after)} created unassigned, same rules`,
      changed: `A new Pod object with the same spec. Node labels are restored to the fixture values; ${pod} is no longer shown.`,
      actor: 'You, creating a new Pod object (no controller in this fixture)',
      reason: 'A replacement is a new scheduling attempt; the scheduler never moves a running Pod',
      notYet: `No filter or score has run for ${podName(after)}.`,
    };
  }
  return {
    title: 'Fixture reset: default rules, sorter-1 unassigned',
    changed: 'Rules, node labels and Pod identity return to the defaults.',
    actor: 'You, resetting the fixture',
    reason: 'Restores the three-node fixture used on this page',
    notYet: 'Nothing has been scheduled in the reset fixture.',
  };
}
