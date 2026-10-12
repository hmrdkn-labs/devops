// Pure, deterministic model of one namespace (shop), one node (node-a), its resident Pods and one candidate Pod.
// Units: CPU in millicores (m), memory in Mi. Fixture numbers are simplifications named on the page.
// Modelled: API defaulting (limit copied into a missing request), LimitRange defaults and max on limits,
// ResourceQuota on requests, the scheduler's fit on requests, kubelet CPU throttling and memory OOM at the
// limit (restart in the same Pod), and node-pressure eviction ranked by memory use above request.
// Not modelled: in-place resize, Pod-level resources, CrashLoopBackOff delays, controllers that replace evicted
// Pods, readiness, several nodes, configurable soft or hard thresholds, and kernel OOM score ordering.

export type Profile = 'guaranteed' | 'burstable' | 'requests-only' | 'limits-only' | 'besteffort' | 'oversized' | 'large';
export type Load = 'idle' | 'busy' | 'spike';
export type Resource = 'cpu' | 'memory';
export type QoS = 'Guaranteed' | 'Burstable' | 'BestEffort';
export type Amount = Partial<Record<Resource, number>>;
export interface Spec { requests: Amount; limits: Amount }
export type Origin = 'author' | 'API default' | 'LimitRange default';
export type Field = `${'requests' | 'limits'}.${Resource}`;
export interface Provenance { field: Field; origin: Origin }
export interface Config { profile: Profile; limitRange: boolean; quota: boolean; load: Load; searchUse: 'within' | 'above' }

export const RESOURCES: Resource[] = ['cpu', 'memory'];
export const initialConfig: Config = { profile: 'burstable', limitRange: false, quota: false, load: 'busy', searchUse: 'within' };

export const node = { name: 'node-a', namespace: 'shop', cpu: 2000, memory: 2048 } as const;
/** Fixture threshold: pressure when memory.available drops below this. The kubelet default is 100Mi; 768Mi keeps pressure visible at this scale. */
export const evictionThreshold = 768;
export const limitRange = {
  defaultRequest: { cpu: 200, memory: 256 },
  defaultLimit: { cpu: 500, memory: 512 },
  max: { cpu: 1000, memory: 1024 },
} as const;
export const quotaHard = { cpu: 1000, memory: 1024 } as const;
export const loadDemand: Record<Load, { cpu: number; memory: number }> = {
  idle: { cpu: 100, memory: 128 },
  busy: { cpu: 400, memory: 384 },
  spike: { cpu: 900, memory: 900 },
};
/** Memory the restarted container uses after an OOM kill (fixture: restarts at idle). */
export const restartedMemory = 128;

export const podName = (serial: number) => `api-canary-${serial}`;

export const profiles: Record<Profile, { label: string; group: 'basic' | 'edge'; spec: Spec }> = {
  guaranteed: { label: 'Guaranteed: request = limit', group: 'basic', spec: { requests: { cpu: 500, memory: 512 }, limits: { cpu: 500, memory: 512 } } },
  burstable: { label: 'Burstable: request below limit', group: 'basic', spec: { requests: { cpu: 200, memory: 256 }, limits: { cpu: 500, memory: 512 } } },
  'requests-only': { label: 'Burstable: request, no limit', group: 'basic', spec: { requests: { cpu: 200, memory: 256 }, limits: {} } },
  'limits-only': { label: 'Limits only: request copied', group: 'basic', spec: { requests: {}, limits: { cpu: 500, memory: 512 } } },
  besteffort: { label: 'BestEffort: nothing set', group: 'basic', spec: { requests: {}, limits: {} } },
  oversized: { label: 'Memory limit 2Gi (over LR max)', group: 'edge', spec: { requests: { cpu: 200, memory: 256 }, limits: { cpu: 500, memory: 2048 } } },
  large: { label: 'CPU 1500m (over node-a free)', group: 'edge', spec: { requests: { cpu: 1500, memory: 512 }, limits: { cpu: 1500, memory: 512 } } },
};

/** Resident Pods already on node-a. They were admitted before this page's policies, so the policies do not touch them. */
export interface Resident { name: string; spec: Spec; usage: Record<Resource, number> }
export function residents(searchUse: Config['searchUse']): Resident[] {
  return [
    { name: 'checkout-7f9c', spec: { requests: { cpu: 500, memory: 512 }, limits: { cpu: 500, memory: 512 } }, usage: { cpu: 300, memory: 400 } },
    { name: 'search-5d6b', spec: { requests: { cpu: 300, memory: 256 }, limits: { cpu: 1000, memory: 1024 } }, usage: { cpu: 200, memory: searchUse === 'above' ? 600 : 200 } },
    { name: 'batch-report-x', spec: { requests: {}, limits: {} }, usage: { cpu: 100, memory: 300 } },
  ];
}

/** Sum of requests of residents still on node-a. An evicted resident is Failed, so it no longer holds a request or counts toward the quota. */
export function residentRequests(searchUse: Config['searchUse'], gone: ReadonlySet<string> = new Set<string>()): Record<Resource, number> {
  const out = { cpu: 0, memory: 0 };
  for (const pod of residents(searchUse)) {
    if (gone.has(pod.name)) continue;
    for (const r of RESOURCES) out[r] += pod.spec.requests[r] ?? 0;
  }
  return out;
}

/** The QoS class is derived from the effective (post-defaulting) spec, and it is fixed when the Pod is created. */
export function qosOf(spec: Spec): QoS {
  const anySet = RESOURCES.some((r) => spec.requests[r] !== undefined || spec.limits[r] !== undefined);
  if (!anySet) return 'BestEffort';
  const guaranteed = RESOURCES.every((r) => spec.requests[r] !== undefined && spec.requests[r] === spec.limits[r]);
  return guaranteed ? 'Guaranteed' : 'Burstable';
}

/** Text form for sentences: CPU is always millicores and memory is always Mi, so one resource never changes unit mid-sentence. */
export const fmt = (r: Resource, v: number) => (r === 'cpu' ? `${v}m` : `${v}Mi`);

export interface Admission {
  effective: Spec;
  provenance: Provenance[];
  limitRange: { active: boolean; pass: boolean; violations: string[] };
  quota: { active: boolean; pass: boolean; reason?: string; used?: Record<Resource, number> };
}

/**
 * Admission in the order Kubernetes runs it. First the API server defaults a missing request from its limit.
 * Then the LimitRanger mutates: each missing request or limit takes the LimitRange default for that key.
 * Then LimitRange max is validated on limits, and ResourceQuota (a validating check) counts effective requests.
 */
export function admit(config: Config, author: Spec = profiles[config.profile].spec, gone: ReadonlySet<string> = new Set<string>()): Admission {
  const effective: Spec = { requests: { ...author.requests }, limits: { ...author.limits } };
  const provenance: Provenance[] = [];
  for (const r of RESOURCES) {
    if (effective.requests[r] === undefined && effective.limits[r] !== undefined) {
      effective.requests[r] = effective.limits[r];
      provenance.push({ field: `requests.${r}`, origin: 'API default' });
    }
  }
  if (config.limitRange) {
    for (const r of RESOURCES) {
      if (effective.requests[r] === undefined) {
        effective.requests[r] = limitRange.defaultRequest[r];
        provenance.push({ field: `requests.${r}`, origin: 'LimitRange default' });
      }
      if (effective.limits[r] === undefined) {
        effective.limits[r] = limitRange.defaultLimit[r];
        provenance.push({ field: `limits.${r}`, origin: 'LimitRange default' });
      }
    }
  }
  for (const r of RESOURCES) {
    if (provenance.every((p) => p.field !== `requests.${r}`) && effective.requests[r] !== undefined) {
      provenance.push({ field: `requests.${r}`, origin: 'author' });
    }
    if (provenance.every((p) => p.field !== `limits.${r}`) && effective.limits[r] !== undefined) {
      provenance.push({ field: `limits.${r}`, origin: 'author' });
    }
  }

  const violations = config.limitRange
    ? RESOURCES.flatMap((r) => {
      const value = effective.limits[r];
      return value !== undefined && value > limitRange.max[r]
        ? [`limits.${r} ${fmt(r, value)} is above the LimitRange max ${fmt(r, limitRange.max[r])}`]
        : [];
    })
    : [];

  const committed = residentRequests(config.searchUse, gone);
  let quota: Admission['quota'] = { active: config.quota, pass: true };
  if (config.quota) {
    const missing = RESOURCES.filter((r) => effective.requests[r] === undefined);
    if (missing.length > 0) {
      quota = { active: true, pass: false, reason: `no request for ${missing.map((r) => `requests.${r}`).join(', ')}, so the quota cannot count the Pod` };
    } else {
      const used = { cpu: committed.cpu + (effective.requests.cpu ?? 0), memory: committed.memory + (effective.requests.memory ?? 0) };
      const over = RESOURCES.filter((r) => used[r] > quotaHard[r]);
      quota = over.length === 0
        ? { active: true, pass: true, used }
        : { active: true, pass: false, used, reason: over.map((r) => `requests.${r} would be ${fmt(r, used[r])} of ${fmt(r, quotaHard[r])}`).join('; ') };
    }
  }

  return {
    effective,
    provenance,
    limitRange: { active: config.limitRange, pass: violations.length === 0, violations },
    quota,
  };
}

export interface Fit { pass: boolean; free: Record<Resource, number>; short?: Resource }

/** The scheduler checks requests only, against allocatable minus the requests of residents still on node-a. */
export function fit(spec: Spec, searchUse: Config['searchUse'], gone: ReadonlySet<string> = new Set<string>()): Fit {
  const committed = residentRequests(searchUse, gone);
  const free = { cpu: node.cpu - committed.cpu, memory: node.memory - committed.memory };
  const short = RESOURCES.find((r) => (spec.requests[r] ?? 0) > free[r]);
  return { pass: short === undefined, free, short };
}

export interface Submission {
  admission: Admission;
  /** rejected: admission refused, so no Pod object exists. pending: the Pod object exists but no node fits. running: bound to node-a. */
  phase: 'rejected' | 'pending' | 'running';
  fit: Fit | null;
  qos: QoS;
  /** Where the cartridge stops on the lane: the first closed gate. */
  stop: 'limitrange' | 'quota' | 'fit' | 'end';
}

export function submit(config: Config, gone: ReadonlySet<string> = new Set<string>()): Submission {
  const admission = admit(config, undefined, gone);
  const qos = qosOf(admission.effective);
  if (!admission.limitRange.pass || !admission.quota.pass) {
    return { admission, phase: 'rejected', fit: null, qos, stop: admission.limitRange.pass ? 'quota' : 'limitrange' };
  }
  const result = fit(admission.effective, config.searchUse, gone);
  return { admission, phase: result.pass ? 'running' : 'pending', fit: result, qos, stop: result.pass ? 'end' : 'fit' };
}

export interface Runtime {
  load: Load;
  cpuUse: number;
  throttled: boolean;
  oomKilled: boolean;
  restarts: number;
  memoryUse: number;
}

/**
 * Kubelet and kernel at the container's limits. CPU over its limit is throttled and keeps running.
 * Memory over its limit is an OOM kill; the restartable container restarts in the same Pod with restartCount + 1.
 * The fixture kills at once when usage crosses the limit; the kernel can act later under memory pressure.
 */
export function runLoad(spec: Spec, load: Load, restartsBefore: number): Runtime {
  const demand = loadDemand[load];
  const cpuLimit = spec.limits.cpu;
  const memoryLimit = spec.limits.memory;
  const throttled = cpuLimit !== undefined && demand.cpu > cpuLimit;
  const oomKilled = memoryLimit !== undefined && demand.memory > memoryLimit;
  return {
    load,
    cpuUse: throttled && cpuLimit !== undefined ? cpuLimit : demand.cpu,
    throttled,
    oomKilled,
    restarts: restartsBefore + (oomKilled ? 1 : 0),
    memoryUse: oomKilled ? restartedMemory : demand.memory,
  };
}

export interface MemPod { name: string; qos: QoS; priority: number; request: number; use: number }
export interface Ranked extends MemPod { exceeds: boolean; excess: number; rank: number }

/**
 * Kubelet eviction order for memory (node-pressure eviction docs): first Pods whose usage exceeds their request,
 * ordered by priority and then by how far usage exceeds the request; then the rest, ordered by priority.
 * QoS class is not an input. A BestEffort Pod has request 0, so any usage exceeds it.
 */
export function rankForEviction(pods: MemPod[]): Ranked[] {
  const rows: Ranked[] = pods.map((p) => ({ ...p, exceeds: p.use > p.request, excess: p.use - p.request, rank: 0 }));
  rows.sort((a, b) => Number(b.exceeds) - Number(a.exceeds)
    || a.priority - b.priority
    || (a.exceeds ? b.excess - a.excess : 0)
    || a.name.localeCompare(b.name));
  rows.forEach((row, index) => { row.rank = index + 1; });
  return rows;
}

export interface Relief { available: number; pressure: boolean; ranking: Ranked[]; evicted: string[]; availableAfter: number }

/** Evict in ranked order until memory.available is back at or above the threshold, or no Pods remain. */
export function relieve(pods: MemPod[], allocatable = node.memory, threshold = evictionThreshold): Relief {
  const used = pods.reduce((sum, p) => sum + p.use, 0);
  const available = allocatable - used;
  const ranking = rankForEviction(pods);
  if (available >= threshold) return { available, pressure: false, ranking, evicted: [], availableAfter: available };
  let free = available;
  const evicted: string[] = [];
  for (const row of ranking) {
    if (free >= threshold) break;
    evicted.push(row.name);
    free += row.use;
  }
  return { available, pressure: true, ranking, evicted, availableAfter: free };
}

export interface YamlLine { text: string; id?: string }

/** Canonical Kubernetes quantity for YAML: whole cores as a quoted "N", whole Gi as NGi, otherwise millicores or Mi. */
const yamlQuantity = (r: Resource, v: number) => {
  if (r === 'cpu') return v % 1000 === 0 ? `"${v / 1000}"` : `${v}m`;
  return v % 1024 === 0 ? `${v / 1024}Gi` : `${v}Mi`;
};

/** Namespace policy manifests. When a policy is off, its object is absent, and the line says so. */
export function policyYaml(config: Config): YamlLine[] {
  const lr: YamlLine[] = config.limitRange
    ? [
      { text: 'apiVersion: v1' },
      { text: 'kind: LimitRange' },
      { text: 'metadata:' },
      { text: '  name: shop-defaults' },
      { text: '  namespace: shop' },
      { text: 'spec:' },
      { text: '  limits:' },
      { text: '  - type: Container' },
      { text: '    defaultRequest:', id: 'lr.defaultRequest' },
      ...RESOURCES.map((r) => ({ text: `      ${r}: ${yamlQuantity(r, limitRange.defaultRequest[r])}`, id: `lr.defaultRequest.${r}` })),
      { text: '    default:', id: 'lr.default' },
      ...RESOURCES.map((r) => ({ text: `      ${r}: ${yamlQuantity(r, limitRange.defaultLimit[r])}`, id: `lr.default.${r}` })),
      { text: '    max:', id: 'lr.max' },
      ...RESOURCES.map((r) => ({ text: `      ${r}: ${yamlQuantity(r, limitRange.max[r])}`, id: `lr.max.${r}` })),
    ]
    : [{ text: '# no LimitRange object in namespace shop (switched off)' }];
  const quota: YamlLine[] = config.quota
    ? [
      { text: '---' },
      { text: 'apiVersion: v1' },
      { text: 'kind: ResourceQuota' },
      { text: 'metadata:' },
      { text: '  name: shop-quota' },
      { text: '  namespace: shop' },
      { text: 'spec:' },
      { text: '  hard:' },
      { text: `    requests.cpu: ${yamlQuantity('cpu', quotaHard.cpu)}`, id: 'quota.cpu' },
      { text: `    requests.memory: ${yamlQuantity('memory', quotaHard.memory)}`, id: 'quota.memory' },
    ]
    : [{ text: '# no ResourceQuota object in namespace shop (switched off)' }];
  return [...lr, ...quota];
}

/**
 * Candidate Pod manifest. Before submission it shows what the author wrote. After submission it shows what the API stored,
 * with a comment naming who filled each field. The status lines appear only for Pods that exist.
 */
export function podYaml(config: Config, serial: number, submission: Submission | null, runtime: Runtime | null, restarts: number, evicted: boolean): YamlLine[] {
  const spec = submission ? submission.admission.effective : profiles[config.profile].spec;
  const block = (kind: 'requests' | 'limits') => RESOURCES.filter((r) => spec[kind][r] !== undefined).map((r) => {
    const field: Field = `${kind}.${r}`;
    const note = submission?.admission.provenance.find((p) => p.field === field)?.origin;
    return { text: `        ${r}: ${yamlQuantity(r, spec[kind][r]!)}${note ? `  # ${note}` : ''}`, id: field };
  });
  const requests = block('requests');
  const limits = block('limits');
  const resources: YamlLine[] = requests.length === 0 && limits.length === 0
    ? [{ text: '    resources: {}' }]
    : [
      { text: '    resources:' },
      ...(requests.length ? [{ text: '      requests:' }, ...requests] : []),
      ...(limits.length ? [{ text: '      limits:' }, ...limits] : []),
    ];
  const phase = !submission ? null : submission.phase === 'rejected' ? null : (evicted ? 'Failed' : submission.phase === 'running' ? 'Running' : 'Pending');
  const status: YamlLine[] = !submission
    ? []
    : submission.phase === 'rejected'
      ? [{ text: '# not created: admission rejected it, so there is no status' }]
      : [
        { text: 'status:' },
        { text: `  phase: ${phase}`, id: 'status.phase' },
        ...(evicted ? [{ text: '  reason: Evicted', id: 'status.reason' }] : []),
        { text: `  qosClass: ${submission.qos}`, id: 'status.qos' },
        ...(submission.phase === 'running' && runtime
          ? [{ text: '  containerStatuses:' }, { text: `  - restartCount: ${restarts}`, id: 'status.restarts' },
            ...(runtime.oomKilled || restarts > 0 ? [{ text: '    lastState: OOMKilled, exit code 137', id: 'status.reason' }] : [])]
          : []),
      ];
  return [
    { text: 'apiVersion: v1' },
    { text: 'kind: Pod' },
    { text: 'metadata:' },
    { text: `  name: ${podName(serial)}` },
    { text: '  namespace: shop' },
    { text: 'spec:' },
    ...(submission && submission.phase === 'running' ? [{ text: '  nodeName: node-a', id: 'spec.nodeName' }] : []),
    { text: '  containers:' },
    { text: '  - name: api' },
    { text: '    image: registry.example.com/api:2.3' },
    ...resources,
    ...status,
  ];
}

export function memPodsOf(config: Config, serial: number, submission: Submission | null, runtime: Runtime | null, evicted: ReadonlySet<string>): MemPod[] {
  const pods: MemPod[] = residents(config.searchUse)
    .filter((pod) => !evicted.has(pod.name))
    .map((pod) => ({ name: pod.name, qos: qosOf(pod.spec), priority: 0, request: pod.spec.requests.memory ?? 0, use: pod.usage.memory }));
  const candidate = podName(serial);
  if (submission?.phase === 'running' && runtime && !evicted.has(candidate)) {
    pods.push({ name: candidate, qos: submission.qos, priority: 0, request: submission.admission.effective.requests.memory ?? 0, use: runtime.memoryUse });
  }
  return pods;
}
