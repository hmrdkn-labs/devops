// Pure, deterministic model of one NoSchedule taint on node-a, one Pod toleration and two hard filters.
// Modelled scope: NoSchedule only (no NoExecute eviction, no PreferNoSchedule scoring, no Gt/Lt operators).

export type Profile = 'absent' | 'equal' | 'wrong-value' | 'wrong-key' | 'wrong-effect' | 'exists' | 'any-effect' | 'all-keys';
export type Effect = 'NoSchedule' | 'NoExecute' | '';
export interface Toleration { key: string; operator: 'Equal' | 'Exists'; value?: string; effect: Effect }
export interface Config { profile: Profile; tainted: boolean; cpuFits: boolean; nodeB: boolean }

export const initialConfig: Config = { profile: 'absent', tainted: true, cpuFits: true, nodeB: false };
export const nodeTaint = { key: 'dedicated', value: 'batch', effect: 'NoSchedule' } as const;
export const podCpuRequest = 600;
export const nodeBCpuFree = 1000;
/** node-a's free CPU for new requests: allocatable minus requests already committed by other Pods. */
export const nodeACpuFree = (config: Config) => (config.cpuFits ? 800 : 400);
/** A changed fixture creates a new unassigned Pod; the name carries a serial so identity changes visibly. */
export const podName = (serial: number) => `report-batch-${serial}`;
/** A change made before any run edits the pending Pod; a change after a run creates the next Pod with the next name. */
export const nextSerial = (serial: number, ran: boolean) => (ran ? serial + 1 : serial);

export const profiles: Record<Profile, { label: string; group: 'basic' | 'operator' | 'advanced'; toleration?: Toleration }> = {
  absent: { label: 'No toleration', group: 'basic' },
  equal: { label: 'Equal: dedicated=batch, NoSchedule', group: 'basic', toleration: { key: 'dedicated', operator: 'Equal', value: 'batch', effect: 'NoSchedule' } },
  'wrong-value': { label: 'Wrong value: dedicated=web', group: 'basic', toleration: { key: 'dedicated', operator: 'Equal', value: 'web', effect: 'NoSchedule' } },
  'wrong-key': { label: 'Wrong key: team=batch', group: 'basic', toleration: { key: 'team', operator: 'Equal', value: 'batch', effect: 'NoSchedule' } },
  'wrong-effect': { label: 'Wrong effect: NoExecute', group: 'basic', toleration: { key: 'dedicated', operator: 'Equal', value: 'batch', effect: 'NoExecute' } },
  exists: { label: 'Exists on dedicated, NoSchedule', group: 'operator', toleration: { key: 'dedicated', operator: 'Exists', effect: 'NoSchedule' } },
  'any-effect': { label: 'Empty effect for dedicated=batch', group: 'advanced', toleration: { key: 'dedicated', operator: 'Equal', value: 'batch', effect: '' } },
  'all-keys': { label: 'Empty key with Exists, NoSchedule', group: 'advanced', toleration: { key: '', operator: 'Exists', effect: 'NoSchedule' } },
};

export type Verdict = 'match' | 'mismatch' | 'wildcard' | 'not-tested' | 'absent' | 'info' | 'no-taint';
export type FieldName = 'key' | 'operator' | 'value' | 'effect';
export interface FieldRow { field: FieldName; pod: string; node: string; verdict: Verdict }

const fields: FieldName[] = ['key', 'operator', 'value', 'effect'];

function podCell(t: Toleration | undefined, field: FieldName): string {
  if (!t) return 'none';
  if (field === 'key') return t.key === '' ? '"" (any key)' : t.key;
  if (field === 'operator') return t.operator;
  if (field === 'value') return t.operator === 'Exists' ? '(must be empty)' : (t.value ?? '(none)');
  return t.effect === '' ? '"" (any effect)' : t.effect;
}

function nodeCell(field: FieldName): string {
  if (field === 'key') return nodeTaint.key;
  if (field === 'operator') return '—';
  if (field === 'value') return nodeTaint.value;
  return nodeTaint.effect;
}

/**
 * Field-by-field comparison of one toleration with node-a's taint (Kubernetes matching rules):
 * key must equal the taint key, or be empty (only with Exists); Equal compares the value, Exists does not;
 * effect must equal the taint effect, or be empty (any effect). The taint is tolerated only when no field mismatches.
 */
export function compareTaint(tainted: boolean, t: Toleration | undefined): { rows: FieldRow[]; passes: boolean } {
  if (!tainted) {
    return { passes: true, rows: fields.map((field) => ({ field, pod: podCell(t, field), node: 'no taint', verdict: 'no-taint' })) };
  }
  if (!t) {
    return { passes: false, rows: fields.map((field) => ({ field, pod: 'none', node: nodeCell(field), verdict: 'absent' })) };
  }
  const verdict: Record<FieldName, Verdict> = {
    key: t.key === nodeTaint.key ? 'match' : t.key === '' && t.operator === 'Exists' ? 'wildcard' : 'mismatch',
    operator: 'info',
    value: t.operator === 'Exists' ? 'not-tested' : t.value === nodeTaint.value ? 'match' : 'mismatch',
    effect: t.effect === '' ? 'wildcard' : t.effect === nodeTaint.effect ? 'match' : 'mismatch',
  };
  const rows = fields.map((field) => ({ field, pod: podCell(t, field), node: nodeCell(field), verdict: verdict[field] }));
  return { passes: rows.every((row) => row.verdict !== 'mismatch'), rows };
}

export type Selected = 'node-a' | 'node-b' | null;
export type CartStop = 'taint' | 'capacity' | 'end';

export interface Evaluation {
  rows: FieldRow[];
  taintPass: boolean;
  cpuFree: number;
  capacityPass: boolean;
  eligibleA: boolean;
  eligibleB: boolean;
  selected: Selected;
  cartStop: CartStop;
}

/**
 * Two independent hard filters per candidate (taint, capacity). Both are always computed, even when the
 * other fails. Node-b is an untainted candidate with 1000m free; when eligible it wins the fixed fixture score.
 * No toleration adds score.
 */
export function evaluate(config: Config): Evaluation {
  const toleration = profiles[config.profile].toleration;
  const taint = compareTaint(config.tainted, toleration);
  const cpuFree = nodeACpuFree(config);
  const capacityPass = cpuFree >= podCpuRequest;
  const eligibleA = taint.passes && capacityPass;
  const eligibleB = config.nodeB && nodeBCpuFree >= podCpuRequest;
  const selected: Selected = eligibleB ? 'node-b' : eligibleA ? 'node-a' : null;
  // The cartridge stops at the first closed node-a gate; the capacity verdict is still computed when the taint fails.
  const cartStop: CartStop = !taint.passes ? 'taint' : !capacityPass ? 'capacity' : 'end';
  return { rows: taint.rows, taintPass: taint.passes, cpuFree, capacityPass, eligibleA, eligibleB, selected, cartStop };
}

/**
 * Manifest lines a run depends on. A failed check highlights its own fields: the mismatched taint fields, the whole
 * taint block when the toleration is absent, or the free and requested CPU when capacity fails. A passing check's
 * fields are not highlighted while another check fails. When every check passes, all compared fields are highlighted.
 */
export function runMarkIds(config: Config, r: Evaluation): string[] {
  const cpu = ['node.cpu', 'pod.cpu'];
  const taintFailed = r.rows.some((row) => row.verdict === 'absent')
    ? ['node.taints', 'node.key', 'node.value', 'node.effect', 'pod.key']
    : r.rows.filter((row) => row.verdict === 'mismatch').flatMap((row) => [`node.${row.field}`, `pod.${row.field}`]);
  const taintPassed = config.tainted
    ? ['node.taints', 'node.key', 'node.value', 'node.effect', 'pod.key', 'pod.operator', 'pod.value', 'pod.effect']
    : ['node.taints'];
  const failed = [...(r.taintPass ? [] : taintFailed), ...(r.capacityPass ? [] : cpu)];
  return failed.length > 0 ? failed : [...taintPassed, ...cpu];
}

export interface YamlLine { text: string; id?: string }

/** Node manifest; ids name the fields a run or edit depends on (node.key/value/effect are the taint, node.cpu the free CPU). */
export function nodeYaml(config: Config): YamlLine[] {
  const taints: YamlLine[] = config.tainted
    ? [
      { text: '  taints:', id: 'node.taints' },
      { text: '  - key: dedicated', id: 'node.key' },
      { text: '    value: batch', id: 'node.value' },
      { text: '    effect: NoSchedule', id: 'node.effect' },
    ]
    : [{ text: '  taints: []', id: 'node.taints' }];
  return [
    { text: 'apiVersion: v1' },
    { text: 'kind: Node' },
    { text: 'metadata:' },
    { text: '  name: node-a' },
    { text: 'spec:' },
    ...taints,
    { text: 'status:' },
    { text: '  allocatable:' },
    { text: '    cpu: 2000m' },
    { text: `  # fixture only: other Pods request ${config.cpuFits ? 1200 : 1600}m of the 2000m`, id: 'node.cpu' },
  ];
}

/** Pod manifest for the current toleration; Exists carries no value field, as the API requires. */
export function podYaml(config: Config, serial: number): YamlLine[] {
  const t = profiles[config.profile].toleration;
  const tolerations: YamlLine[] = !t
    ? [{ text: '  tolerations: []', id: 'pod.key' }]
    : [
      { text: '  tolerations:' },
      { text: `  - key: ${t.key || '""'}`, id: 'pod.key' },
      { text: `    operator: ${t.operator}`, id: 'pod.operator' },
      ...(t.operator === 'Equal' ? [{ text: `    value: ${t.value}`, id: 'pod.value' }] : []),
      { text: `    effect: ${t.effect || '""'}`, id: 'pod.effect' },
    ];
  return [
    { text: 'apiVersion: v1' },
    { text: 'kind: Pod' },
    { text: 'metadata:' },
    { text: `  name: ${podName(serial)}` },
    { text: 'spec:' },
    ...tolerations,
    { text: '  containers:' },
    { text: '  - name: report' },
    { text: '    image: registry.example.com/report:1.4' },
    { text: '    resources:' },
    { text: '      requests:' },
    { text: `        cpu: ${podCpuRequest}m`, id: 'pod.cpu' },
    { text: '        memory: 256Mi' },
  ];
}
