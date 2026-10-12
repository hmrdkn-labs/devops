import { FRESH, HEALTHY, NOTES, STALE, WRITERS, type RungNote } from './messages';

// Evidence ladder fixture: each symptom is an authored Pod and Service fault. Six read-only rungs
// expose facts that Kubernetes components wrote; fixes and Pod deletions are the only state changes.
// The state records which object the learner is looking at, which facts are observable right now,
// and which owner acts next. Facts are authored per scenario, not derived by the page.

export type Field =
  | 'identity' | 'label' | 'nodeName' | 'status' | 'selector' | 'cpu' | 'memory' | 'image' | 'env'
  | 'pullSecret' | 'startup' | 'liveness' | 'readiness' | 'claim' | 'configMap';
export type Owner = 'scheduler' | 'pv' | 'kubelet' | 'endpoints';
/** settled: owners have run on the current object. fresh: object just created, no owner has acted. stale: an outside object was fixed and owners have not run. */
export type Stage = 'settled' | 'fresh' | 'stale';
export type ScenarioId =
  | 'pending-cpu' | 'pending-pvc' | 'pending-volume' | 'pull-tag' | 'pull-auth'
  | 'crash-exit' | 'crash-oom' | 'crash-liveness' | 'notready-probe' | 'no-endpoints';

export interface PodSpec {
  image: string;
  cpu: string;
  memory: string;
  env: string;
  pullSecret: string | null;
  startup: boolean;
  readinessPath: string;
}

export interface Container {
  state: 'none' | 'waiting' | 'running';
  reason: string;
  last: { reason: string; exitCode: number } | null;
}

export interface Facts {
  status: string;
  phase: 'Pending' | 'Running';
  node: string | null;
  scheduled: boolean;
  ready: boolean;
  restarts: number;
  container: Container;
  events: string[];
  logs: string[] | null;
  logsNote: string;
}

export interface Change {
  title: string;
  changed: string;
  actor: string;
  reason: string;
  notYet: string;
  reads: Field[];
}

export interface Snapshot { version: number; lines: string[] }

export interface LadderState {
  scenario: ScenarioId;
  /** Pod object number. A new object gets a new UID and fresh counters. */
  generation: number;
  /** The Deployment template carries the fix; the current Pod is a replacement made from it. */
  templateFixed: boolean;
  /** An object outside the Pod (PersistentVolume, ConfigMap, Service selector) has been fixed. */
  external: boolean;
  stage: Stage;
  /** Owner passes that have seen the current fault on this object. Restart count for crash faults. */
  attempts: number;
  /** Increments whenever an owner acts or a fix lands, so read evidence can be stale. */
  version: number;
  read: boolean[];
  snapshots: Array<Snapshot | null>;
  /** Generation of the replaced Pod that stays listed until its replacement is Ready. */
  retired: number | null;
  /** Rung the probe carriage last read. */
  probe: number;
  reads: Field[];
  change: Change;
}

export interface Rung {
  title: string;
  command: (pod: string) => string;
}

export interface Scenario {
  id: ScenarioId;
  label: string;
  symptom: string;
  owner: Owner;
  /** Service selector value as authored. */
  selector: string;
  /** Pod spec fields that differ from the base spec in the authored fault. */
  authored: Partial<PodSpec>;
  /** Pod spec fields changed when the template fix is applied. */
  patch: Partial<PodSpec>;
  fix: {
    kind: 'template' | 'external';
    label: string;
    fields: Field[];
    change: string;
    actor: string;
    /** Service selector after an external selector fix. */
    selector?: string;
  };
  /** Index of the rung whose read names the cause; Apply fix is locked until it has been read. */
  diagnosis: number;
  cause: string;
  eventFields: Field[];
  logFields: Field[];
  containerFields: Field[];
  startAttempts: number;
  before: (pod: string, attempts: number) => Facts;
  after: (pod: string) => Facts;
  retry: (attempts: number) => string;
  fixed: string;
}

export const POD_LABEL = 'orders-api';
export const SERVICE = 'orders-api';
export const DEPLOYMENT = 'orders-api';
export const RS_OLD = 'orders-api-7d4b5';
export const RS_NEW = 'orders-api-5c9f6';

const SUFFIXES = ['x2k4q', 'q9wz1', 'm8rt2', 'k3vd7', 'b6nj4', 'w4pc8', 't7zr3', 'h2lq9', 'c5mx6', 'n9fd1', 'j8sv2', 'r3gy5'];
const IMAGE = 'registry.example.com/orders-api';

export const BASE_SPEC: PodSpec = {
  image: `${IMAGE}:1.4.2`,
  cpu: '250m',
  memory: '256Mi',
  env: 'DATABASE_URL',
  pullSecret: null,
  startup: false,
  readinessPath: '/readyz',
};

const OWNER_TEXT: Record<Owner, string> = {
  scheduler: 'the scheduler',
  pv: 'the PersistentVolume controller, then the scheduler',
  kubelet: 'the kubelet on the Pod’s node',
  endpoints: 'the EndpointSlice controller',
};

export const RUNGS: readonly Rung[] = [
  { title: 'Status', command: (pod) => `kubectl get pod ${pod}` },
  { title: 'Placement', command: (pod) => `kubectl get pod ${pod} -o wide` },
  { title: 'Events', command: (pod) => `kubectl describe pod ${pod}` },
  { title: 'Container', command: (pod) => `kubectl get pod ${pod} -o jsonpath='{.status.containerStatuses[0]}'` },
  { title: 'Logs', command: (pod) => `kubectl logs ${pod} --previous` },
  { title: 'Endpoints', command: () => `kubectl get endpointslices -l kubernetes.io/service-name=${SERVICE}` },
];

const NONE: Container = { state: 'none', reason: '', last: null };
const NO_CONTAINER = 'No container exists: the kubelet creates containers only after the scheduler assigns a node.';
const NEVER_STARTED = 'The container never started, so it wrote no logs.';
const STARTED = 'Normal Started kubelet: Started container app';
const CREATED = 'Normal Created kubelet: Created container app';
/** Facts of a Pod no owner has placed yet. Every unassigned scenario starts from this. */
const UNASSIGNED: Omit<Facts, 'events'> = {
  status: 'Pending', phase: 'Pending', node: null, scheduled: false, ready: false, restarts: 0,
  container: NONE, logs: null, logsNote: NO_CONTAINER,
};
/** Facts of a Pod whose container runs but whose Ready state is set by its readiness probe. */
const serving = (node: string, events: string[], logs: string[], note: string): Facts => ({
  status: 'Running', phase: 'Running', node, scheduled: true, ready: true, restarts: 0,
  container: { state: 'running', reason: '', last: null }, events, logs, logsNote: note,
});
/** Facts of a container in back-off: the Pod phase stays Running while a container restarts. */
const crashing = (node: string, last: Container['last'], restarts: number, events: string[], logs: string[], note: string): Facts => ({
  status: 'CrashLoopBackOff', phase: 'Running', node, scheduled: true, ready: false, restarts,
  container: { state: 'waiting', reason: 'CrashLoopBackOff', last }, events, logs, logsNote: note,
});

/** One rule for every fault: a before (broken) fact set that owners keep reproducing, and an after (settled) fact set once the fix is observed. */
export const SCENARIOS: Record<ScenarioId, Scenario> = {
  'pending-cpu': {
    id: 'pending-cpu',
    label: 'Pending: no node has 2 CPU free',
    symptom: 'Pending, unassigned',
    owner: 'scheduler',
    selector: 'orders-api',
    authored: { cpu: '2' },
    patch: { cpu: '250m' },
    fix: {
      kind: 'template', label: 'Lower the CPU request to 250m in the template', fields: ['cpu'],
      change: 'requests.cpu 2 → 250m', actor: 'You, editing the Deployment template.',
    },
    diagnosis: 2,
    cause: 'Every node has less free CPU than the 2-CPU request, so the scheduler places the Pod nowhere.',
    eventFields: ['cpu'], logFields: ['status'], containerFields: ['status'], startAttempts: 4,
    before: (_pod, attempts) => ({
      ...UNASSIGNED,
      events: [`Warning FailedScheduling (×${attempts}) default-scheduler: 0/3 nodes are available: 3 Insufficient cpu.`],
    }),
    after: (pod) => serving('node-2', [
      `Normal Scheduled default-scheduler: Successfully assigned default/${pod} to node-2`, STARTED,
    ], ['orders-api 1.4.2 starting', 'listening on :8080'], 'Current run output.'),
    retry: (attempts) => `Scheduler ran again: 0/3 nodes still have less than 2 CPU free (×${attempts}). The Pod stays unassigned.`,
    fixed: 'The scheduler placed the new Pod on node-2, where 250m fits. The kubelet started app.',
  },
  'pending-pvc': {
    id: 'pending-pvc',
    label: 'Pending: claim orders-api-data is unbound',
    symptom: 'Pending, unassigned',
    owner: 'pv',
    selector: 'orders-api',
    authored: {},
    patch: {},
    fix: {
      kind: 'external', label: 'Create a PersistentVolume that matches claim orders-api-data', fields: ['claim'],
      change: 'PersistentVolume created for claim orders-api-data (same class, enough capacity)',
      actor: 'You, creating a PersistentVolume outside the Pod.',
    },
    diagnosis: 2,
    cause: 'The Pod uses claim orders-api-data, which no volume satisfies, so the scheduler will not place the Pod.',
    eventFields: ['claim'], logFields: ['status'], containerFields: ['status'], startAttempts: 3,
    before: (_pod, attempts) => ({
      ...UNASSIGNED,
      events: [`Warning FailedScheduling (×${attempts}) default-scheduler: 0/3 nodes are available: pod has unbound immediate PersistentVolumeClaims.`],
    }),
    after: (pod) => serving('node-1', [
      `Normal Scheduled default-scheduler: Successfully assigned default/${pod} to node-1`, STARTED,
    ], ['orders-api 1.4.2 starting', 'listening on :8080'], 'Current run output.'),
    retry: (attempts) => `Scheduler ran again: claim orders-api-data is still unbound (×${attempts}). The Pod stays unassigned.`,
    fixed: 'The PV controller bound the claim. The scheduler placed the Pod on node-1 and the kubelet started app.',
  },
  'pending-volume': {
    id: 'pending-volume',
    label: 'Assigned, ContainerCreating: ConfigMap missing',
    symptom: 'Pending, assigned',
    owner: 'kubelet',
    selector: 'orders-api',
    authored: {},
    patch: {},
    fix: {
      kind: 'external', label: 'Create ConfigMap orders-api-conf', fields: ['configMap'],
      change: 'ConfigMap orders-api-conf created with the keys the app reads',
      actor: 'You, creating a ConfigMap outside the Pod.',
    },
    diagnosis: 2,
    cause: 'The kubelet cannot mount ConfigMap orders-api-conf because it does not exist, so the container is never created.',
    eventFields: ['configMap'], logFields: ['status'], containerFields: ['status'], startAttempts: 3,
    before: (pod, attempts) => ({
      status: 'ContainerCreating', phase: 'Pending', node: 'node-1', scheduled: true, ready: false, restarts: 0,
      container: { state: 'waiting', reason: 'ContainerCreating', last: null },
      events: [
        `Warning FailedMount (×${attempts}) kubelet: MountVolume.SetUp failed for volume "conf": configmap "orders-api-conf" not found`,
        `Warning FailedMount (×${attempts}) kubelet: Unable to attach or mount volumes for ${pod}: unmounted volumes=[conf]`,
      ],
      logs: null, logsNote: 'The container is not created until its volumes mount.',
    }),
    after: (pod) => serving('node-1', [CREATED, STARTED], ['orders-api 1.4.2 starting', 'listening on :8080'], `Current run output for ${pod}.`),
    retry: (attempts) => `Kubelet retried the mount: configmap orders-api-conf still not found (×${attempts}). The Pod keeps its UID.`,
    fixed: 'The kubelet retried the mount on node-1, found the ConfigMap, and created app. The Pod keeps its UID.',
  },
  'pull-tag': {
    id: 'pull-tag',
    label: 'ImagePullBackOff: tag 1.4.3 does not exist',
    symptom: 'ImagePullBackOff',
    owner: 'kubelet',
    selector: 'orders-api',
    authored: { image: `${IMAGE}:1.4.3` },
    patch: { image: `${IMAGE}:1.4.2` },
    fix: {
      kind: 'template', label: 'Set the image tag to 1.4.2 in the template', fields: ['image'],
      change: `image ${IMAGE}:1.4.3 → ${IMAGE}:1.4.2`, actor: 'You, editing the Deployment template.',
    },
    diagnosis: 2,
    cause: 'The registry has no manifest for tag 1.4.3. The kubelet keeps retrying the same pull with a growing back-off.',
    eventFields: ['image'], logFields: ['image'], containerFields: ['status'], startAttempts: 2,
    before: (_pod, attempts) => ({
      status: 'ImagePullBackOff', phase: 'Pending', node: 'node-1', scheduled: true, ready: false, restarts: 0,
      container: { state: 'waiting', reason: 'ImagePullBackOff', last: null },
      events: [
        `Warning Failed (×${attempts}) kubelet: Failed to pull image "${IMAGE}:1.4.3": manifest unknown: manifest tagged by "1.4.3" is not found`,
        `Normal BackOff (×${attempts}) kubelet: Back-off pulling image "${IMAGE}:1.4.3"`,
      ],
      logs: null, logsNote: NEVER_STARTED,
    }),
    after: (pod) => serving('node-1', [
      `Normal Pulled kubelet: Successfully pulled image "${IMAGE}:1.4.2"`, STARTED,
    ], ['orders-api 1.4.2 starting', 'listening on :8080'], `Current run output for ${pod}.`),
    retry: (attempts) => `Kubelet retried the pull: manifest unknown for 1.4.3 again (×${attempts}). The back-off grows, capped at 5 minutes.`,
    fixed: 'The kubelet on node-1 pulled 1.4.2 and started app.',
  },
  'pull-auth': {
    id: 'pull-auth',
    label: 'ImagePullBackOff: registry refuses anonymous pull',
    symptom: 'ImagePullBackOff',
    owner: 'kubelet',
    selector: 'orders-api',
    authored: {},
    patch: { pullSecret: 'orders-api-registry' },
    fix: {
      kind: 'template', label: 'Add imagePullSecrets: orders-api-registry to the template', fields: ['pullSecret'],
      change: 'imagePullSecrets: none → orders-api-registry (the Secret must exist)', actor: 'You, editing the Deployment template.',
    },
    diagnosis: 2,
    cause: 'The registry requires credentials and the Pod names no imagePullSecret, so every pull is unauthorized.',
    eventFields: ['pullSecret', 'image'], logFields: ['image'], containerFields: ['status'], startAttempts: 2,
    before: (_pod, attempts) => ({
      status: 'ImagePullBackOff', phase: 'Pending', node: 'node-1', scheduled: true, ready: false, restarts: 0,
      container: { state: 'waiting', reason: 'ImagePullBackOff', last: null },
      events: [
        `Warning Failed (×${attempts}) kubelet: Failed to pull image "${IMAGE}:1.4.2": unauthorized: authentication required`,
        `Normal BackOff (×${attempts}) kubelet: Back-off pulling image "${IMAGE}:1.4.2"`,
      ],
      logs: null, logsNote: NEVER_STARTED,
    }),
    after: (pod) => serving('node-1', [
      `Normal Pulled kubelet: Successfully pulled image "${IMAGE}:1.4.2"`, STARTED,
    ], ['orders-api 1.4.2 starting', 'listening on :8080'], `Current run output for ${pod}.`),
    retry: (attempts) => `Kubelet retried the pull without credentials: unauthorized again (×${attempts}).`,
    fixed: 'The kubelet pulled 1.4.2 with orders-api-registry and started app.',
  },
  'crash-exit': {
    id: 'crash-exit',
    label: 'CrashLoopBackOff: app exits 1 at start',
    symptom: 'CrashLoopBackOff',
    owner: 'kubelet',
    selector: 'orders-api',
    authored: { env: 'DB_URL' },
    patch: { env: 'DATABASE_URL' },
    fix: {
      kind: 'template', label: 'Rename the env var to DATABASE_URL in the template', fields: ['env'],
      change: 'env DB_URL → DATABASE_URL', actor: 'You, editing the Deployment template.',
    },
    diagnosis: 4,
    cause: 'app exits 1 because DATABASE_URL is unset. The spec sets DB_URL, a name the app does not read.',
    eventFields: ['status'], logFields: ['env'], containerFields: ['status'], startAttempts: 3,
    before: (pod, attempts) => crashing('node-2', { reason: 'Error', exitCode: 1 }, attempts,
      [`Warning BackOff (×${attempts}) kubelet: Back-off restarting failed container app in pod ${pod}`],
      ['orders-api 1.4.2 starting', 'FATAL: DATABASE_URL is not set', 'exit status 1'],
      'Previous run: its last lines before the exit.'),
    after: (pod) => serving('node-2', [STARTED], ['orders-api 1.4.2 starting', 'listening on :8080'], `Current run output for ${pod}.`),
    retry: (attempts) => `Kubelet restarted app: exit 1 again. RESTARTS ${attempts}; the back-off delay grew.`,
    fixed: 'The kubelet started app with DATABASE_URL set. The process stayed up on node-2.',
  },
  'crash-oom': {
    id: 'crash-oom',
    label: 'CrashLoopBackOff: OOMKilled under 64Mi',
    symptom: 'CrashLoopBackOff',
    owner: 'kubelet',
    selector: 'orders-api',
    authored: { memory: '64Mi' },
    patch: { memory: '256Mi' },
    fix: {
      kind: 'template', label: 'Raise the memory limit to 256Mi in the template', fields: ['memory'],
      change: 'limits.memory 64Mi → 256Mi', actor: 'You, editing the Deployment template.',
    },
    diagnosis: 3,
    cause: 'The app loads about 120 MiB against a 64Mi limit. The kernel kills it: lastState reason OOMKilled, exit code 137.',
    eventFields: ['status'], logFields: ['status'], containerFields: ['memory'], startAttempts: 3,
    before: (pod, attempts) => crashing('node-2', { reason: 'OOMKilled', exitCode: 137 }, attempts,
      [`Warning BackOff (×${attempts}) kubelet: Back-off restarting failed container app in pod ${pod}`],
      ['orders-api 1.4.2 starting', 'loading catalog: 40 MiB', 'loading catalog: 58 MiB'],
      'Previous run stops mid-load with no error line: the kernel killed the process, and the app printed no reason.'),
    after: (pod) => serving('node-2', [STARTED], ['orders-api 1.4.2 starting', 'loading catalog: 120 MiB', 'listening on :8080'], `Current run output for ${pod}.`),
    retry: (attempts) => `Kubelet restarted app: OOMKilled again, exit 137. RESTARTS ${attempts}.`,
    fixed: 'The kubelet started app under a 256Mi limit. It loaded its catalog and stayed up on node-2.',
  },
  'crash-liveness': {
    id: 'crash-liveness',
    label: 'CrashLoopBackOff: liveness kills a slow start',
    symptom: 'CrashLoopBackOff',
    owner: 'kubelet',
    selector: 'orders-api',
    authored: { startup: false },
    patch: { startup: true },
    fix: {
      kind: 'template', label: 'Add a startupProbe to the template', fields: ['startup'],
      change: 'startupProbe added (periodSeconds 5, failureThreshold 12)', actor: 'You, editing the Deployment template.',
    },
    diagnosis: 2,
    cause: 'Liveness probes /livez before the app listens, and no startup probe protects the slow start. The kubelet kills and restarts it.',
    eventFields: ['liveness', 'startup'], logFields: ['status'], containerFields: ['status'], startAttempts: 2,
    before: (pod, attempts) => crashing('node-1', { reason: 'Error', exitCode: 143 }, attempts, [
      `Warning Unhealthy (×${attempts}) kubelet: Liveness probe failed: Get "http://<pod-ip>:8080/livez": dial tcp <pod-ip>:8080: connect: connection refused`,
      `Warning Unhealthy (×${attempts}) kubelet: Container app failed liveness probe, will be restarted`,
    ], ['orders-api 1.4.2 starting', 'warming catalog cache'],
    `Previous run ends while warming: liveness killed ${pod} before the app listened.`),
    after: (pod) => serving('node-1', [STARTED], ['orders-api 1.4.2 starting', 'warming catalog cache', 'listening on :8080'], `Current run output for ${pod}.`),
    retry: (attempts) => `Kubelet's liveness probe failed again before the app listened. RESTARTS ${attempts}.`,
    fixed: 'The startup probe waited for /livez. Liveness did not run until startup passed, and app stayed up on node-1.',
  },
  'notready-probe': {
    id: 'notready-probe',
    label: 'Running, not Ready: readiness path returns 404',
    symptom: 'Running, not Ready',
    owner: 'kubelet',
    selector: 'orders-api',
    authored: { readinessPath: '/ready' },
    patch: { readinessPath: '/readyz' },
    fix: {
      kind: 'template', label: 'Set the readiness path to /readyz in the template', fields: ['readiness'],
      change: 'readinessProbe.httpGet.path /ready → /readyz', actor: 'You, editing the Deployment template.',
    },
    diagnosis: 2,
    cause: 'The readiness probe requests /ready, and the app answers 404. The Pod runs but stays out of Service endpoints.',
    eventFields: ['readiness'], logFields: ['readiness'], containerFields: ['status'], startAttempts: 5,
    before: (pod, attempts) => ({
      status: 'Running', phase: 'Running', node: 'node-1', scheduled: true, ready: false, restarts: 0,
      container: { state: 'running', reason: '', last: null },
      events: [`Warning Unhealthy (×${attempts}) kubelet: Readiness probe failed: HTTP probe failed with statuscode: 404`],
      logs: ['orders-api 1.4.2 starting', 'listening on :8080', 'GET /ready 404 (no route)'],
      logsNote: `Current run: the probe reaches ${pod}; the app has no /ready route.`,
    }),
    after: (pod) => serving('node-1', [STARTED], ['orders-api 1.4.2 starting', 'listening on :8080', 'GET /readyz 200'], `Current run output for ${pod}.`),
    retry: (attempts) => `Readiness probe returned 404 again (×${attempts}). READY stays 0/1 and RESTARTS stays 0: readiness never restarts a container.`,
    fixed: 'The readiness probe on /readyz returned 200. The kubelet set Ready and the endpoints controller listed the Pod.',
  },
  'no-endpoints': {
    id: 'no-endpoints',
    label: 'Service has no endpoints: selector mismatch',
    symptom: 'Ready Pod, no endpoints',
    owner: 'endpoints',
    selector: 'orders',
    authored: {},
    patch: {},
    fix: {
      kind: 'external', label: 'Change the Service selector to app: orders-api', fields: ['selector'],
      change: 'Service selector app: orders → app: orders-api', actor: 'You, editing the Service. The Pod is not touched.',
      selector: 'orders-api',
    },
    diagnosis: 5,
    cause: 'The Service selects app=orders, but the Pod is labelled app=orders-api, so the endpoints controller lists nothing.',
    eventFields: ['status'], logFields: ['status'], containerFields: ['status'], startAttempts: 2,
    before: (pod) => serving('node-2', [], ['orders-api 1.4.2 starting', 'listening on :8080', 'GET /readyz 200'], `Current run output for ${pod}: the app answers its readiness route.`),
    after: (pod) => serving('node-2', [], ['orders-api 1.4.2 starting', 'listening on :8080', 'GET /readyz 200'], `Current run output for ${pod}.`),
    retry: (attempts) => `EndpointSlice controller resynced: selector app=orders still matches no Pod (×${attempts}). Endpoints stay 0.`,
    fixed: 'The EndpointSlice controller listed the Pod for orders-api. The Pod was already Ready and did not change.',
  },
};

export const SCENARIO_IDS = Object.keys(SCENARIOS) as ScenarioId[];

/** A Pod's name follows the ReplicaSet that created it: RS-OLD for the authored template, RS-NEW after the template fix. */
export const nameOf = (templateFixed: boolean, generation: number) =>
  `${templateFixed ? RS_NEW : RS_OLD}-${SUFFIXES[(generation - 1) % SUFFIXES.length]}`;

export const podName = (state: Pick<LadderState, 'templateFixed' | 'generation'>) => nameOf(state.templateFixed, state.generation);

export const fixApplied = (state: LadderState) => state.templateFixed || state.external;

export const retiring = (state: LadderState) => state.retired !== null;

export function specOf(state: LadderState): PodSpec {
  const sc = SCENARIOS[state.scenario];
  const authored = { ...BASE_SPEC, ...sc.authored };
  return state.templateFixed ? { ...authored, ...sc.patch } : authored;
}

/** The Service selector as the endpoints controller reads it. */
export function selectorOf(state: LadderState): string {
  const sc = SCENARIOS[state.scenario];
  return state.external && sc.fix.selector ? sc.fix.selector : sc.selector;
}

/** The observable facts for the Pod object the learner is looking at right now. */
export function factsOf(state: LadderState): Facts {
  const sc = SCENARIOS[state.scenario];
  const pod = podName(state);
  if (state.stage === 'fresh') return { ...UNASSIGNED, events: [] };
  if (fixApplied(state) && state.stage === 'settled') return sc.after(pod);
  return sc.before(pod, state.attempts);
}

/** A Service endpoint is listed when the EndpointSlice controller has seen a selector matching the Pod labels and the Pod is Ready. A Service edit is seen only after that owner runs. */
export function listedOf(state: LadderState, facts = factsOf(state)): boolean {
  const seen = state.stage === 'stale' ? SCENARIOS[state.scenario].selector : selectorOf(state);
  return seen === POD_LABEL && facts.ready;
}

export function initialState(id: ScenarioId = 'pending-cpu'): LadderState {
  const sc = SCENARIOS[id];
  return {
    scenario: id, generation: 1, templateFixed: false, external: false, stage: 'settled',
    attempts: sc.startAttempts, version: 0,
    read: RUNGS.map(() => false), snapshots: RUNGS.map(() => null), retired: null, probe: 0, reads: [],
    change: {
      title: `Fixture loaded: ${sc.label}`,
      changed: `Pod ${nameOf(false, 1)} (p-1) shows ${sc.symptom}. Nothing has been read or changed.`,
      actor: 'Authored fixture. The scheduler, kubelet and endpoints controller wrote the current state.',
      reason: 'The fixture starts from a symptom that owners already reported, so the first step is a read, not a change.',
      notYet: 'No rung is read, Apply fix is locked, and no owner has acted in this session.',
      reads: [],
    },
  };
}

/** The lines a rung displays for the current object. */
export function readingLines(state: LadderState, index: number): string[] {
  const facts = factsOf(state);
  const pod = podName(state);
  switch (index) {
    case 0:
      return [`NAME ${pod}  READY ${facts.ready ? '1/1' : '0/1'}  STATUS ${facts.status}  RESTARTS ${facts.restarts}`];
    case 1:
      return [`NODE ${facts.node ?? '<none>'}`, facts.node ? `The kubelet on ${facts.node} owns container start.` : 'No node: the scheduler owns the next step.'];
    case 2:
      return facts.events.length ? facts.events : ['No events are recorded for this Pod.'];
    case 3: {
      if (facts.container.state === 'none') return ['No container: nothing has started on a node.'];
      const { state: containerState, reason, last } = facts.container;
      return [
        `state: ${containerState}${reason ? ` (${reason})` : ''}`,
        last ? `lastState: terminated (${last.reason}), exit code ${last.exitCode}` : 'lastState: none',
      ];
    }
    case 4:
      return facts.logs ? [...facts.logs, `note: ${facts.logsNote}`] : [`No container output. ${facts.logsNote}`];
    default: {
      const listed = listedOf(state, facts);
      const selector = selectorOf(state);
      return [
        `EndpointSlice ${SERVICE}: ${listed ? 1 : 0} endpoint(s)`,
        `Service selector app=${selector}; Pod label app=${POD_LABEL} ${selector === POD_LABEL ? 'matches' : 'does not match'}.`,
        facts.ready ? 'The Pod is Ready.' : 'The Pod is not Ready, so it is never listed.',
        ...(state.stage === 'stale' ? ['The EndpointSlice controller has not resynced since the Service changed.'] : []),
      ];
    }
  }
}

function headlineOf(state: LadderState, index: number): string {
  const facts = factsOf(state);
  switch (index) {
    case 0: return `STATUS ${facts.status}`;
    case 1: return facts.node ? `assigned to ${facts.node}` : 'unassigned';
    case 2: return facts.events.length ? `${facts.events.length} event line(s)` : 'no events';
    case 3: return facts.container.state === 'none' ? 'no container' : `container ${facts.container.state}`;
    case 4: return facts.logs ? `${facts.logs.length} log line(s)` : 'no container output';
    default: return `${listedOf(state) ? 1 : 0} endpoint(s)`;
  }
}

/** The statement a read shows. The object's own state decides which authored note applies. */
export function noteOf(state: LadderState, index: number): RungNote {
  if (state.stage === 'fresh') return FRESH[index]!;
  if (state.stage === 'stale') return STALE[index]!;
  if (fixApplied(state)) return HEALTHY[index]!;
  return NOTES[state.scenario][index]!;
}

export function readRung(state: LadderState, index: number): LadderState {
  const sc = SCENARIOS[state.scenario];
  const rung = RUNGS[index];
  if (!rung) return state;
  const lines = readingLines(state, index);
  const cause = index === sc.diagnosis;
  const note = noteOf(state, index);
  const namesCause = cause && state.stage === 'settled' && !fixApplied(state);
  const reads: Field[] = index === 0 || index === 3 ? ['status']
    : index === 1 ? ['nodeName']
      : index === 2 ? sc.eventFields
        : index === 4 ? sc.logFields
          : index === 5 ? ['selector', 'label']
            : sc.containerFields;
  return {
    ...state,
    read: state.read.map((value, i) => (i === index ? true : value)),
    snapshots: state.snapshots.map((snap, i) => (i === index ? { version: state.version, lines } : snap)),
    probe: index,
    reads,
    change: {
      title: `Read ${rung.title}: ${headlineOf(state, index)}`,
      changed: namesCause ? `Nothing in the cluster changed. Cause named: ${sc.cause}` : `Nothing in the cluster changed. The probe moved to rung ${index + 1}; the ledger keeps this snapshot.`,
      actor: `You ran ${rung.command(podName(state))}. ${WRITERS[index]!} wrote this fact; kubectl only reads it.`,
      reason: note.why,
      notYet: note.notYet,
      reads,
    },
  };
}

export function canApplyFix(state: LadderState): { ok: boolean; reason: string } {
  const sc = SCENARIOS[state.scenario];
  if (fixApplied(state)) return { ok: false, reason: 'Already applied. Let the owners reconcile the changed object.' };
  if (!state.read[sc.diagnosis]) return { ok: false, reason: 'Locked: no read has named the cause yet.' };
  return { ok: true, reason: 'Unlocked: a read named the cause.' };
}

export function applyFix(state: LadderState): LadderState {
  const sc = SCENARIOS[state.scenario];
  if (!canApplyFix(state).ok) return state;
  const version = state.version + 1;
  const fields = sc.fix.fields;
  const oldName = podName(state);
  if (sc.fix.kind === 'template') {
    const next = state.generation + 1;
    const newName = nameOf(true, next);
    return {
      ...state, templateFixed: true, generation: next, stage: 'fresh', attempts: 0, version,
      read: RUNGS.map(() => false), snapshots: RUNGS.map(() => null), retired: state.generation, reads: fields,
      change: {
        title: `Template fixed: new Pod ${newName}`,
        changed: `Deployment template ${sc.fix.change}. ReplicaSet ${RS_NEW} created ${newName} (p-${next}) with a new UID. ${oldName} (p-${state.generation}) still exists.`,
        actor: `${sc.fix.actor} The ReplicaSet created the replacement from it.`,
        reason: 'A running Pod is not edited in place. A template change reaches a Pod only through a replacement object.',
        notYet: `${newName} is unassigned and not Ready. ${oldName} stays listed until ${newName} is Ready (maxSurge 1, maxUnavailable 0).`,
        reads: fields,
      },
    };
  }
  return {
    ...state, external: true, stage: 'stale', version, reads: fields,
    change: {
      title: `Outside object fixed: ${sc.fix.label}`,
      changed: `${sc.fix.change}. ${oldName} (p-${state.generation}) is unchanged: same name, same UID.`,
      actor: sc.fix.actor,
      reason: `The Pod spec is not the fault here. The Pod reads an object that was wrong or missing, and ${OWNER_TEXT[sc.owner]} must act on it.`,
      notYet: `${OWNER_TEXT[sc.owner]} has not run yet, so ${oldName} still shows its old state until the next reconcile.`,
      reads: fields,
    },
  };
}

export function deletePod(state: LadderState): LadderState {
  const oldName = podName(state);
  const next = state.generation + 1;
  const newName = nameOf(state.templateFixed, next);
  const rs = state.templateFixed ? RS_NEW : RS_OLD;
  return {
    ...state, generation: next, stage: 'fresh', attempts: 0, version: state.version + 1,
    read: RUNGS.map(() => false), snapshots: RUNGS.map(() => null), reads: ['status'],
    change: {
      title: `Deleted ${oldName}; ${newName} created`,
      changed: `${oldName} (p-${state.generation}) is gone with its events, logs and last container state. ${rs} created ${newName} (p-${next}) from the same template.`,
      actor: 'You, deleting the Pod object. The ReplicaSet, not the kubelet, creates the replacement.',
      reason: 'Deleting a Pod does not repair its template or the objects it uses. The new object starts with fresh counters and no evidence.',
      notYet: `${newName} is unassigned and has not been read or reconciled. The fault is still in the spec.`,
      reads: ['status'],
    },
  };
}

export function reconcile(state: LadderState): LadderState {
  const sc = SCENARIOS[state.scenario];
  const fixed = fixApplied(state);
  if (state.stage === 'settled' && fixed) {
    return {
      ...state, reads: [],
      change: {
        title: 'Reconcile: nothing to do',
        changed: 'No owner had work: the fixed Pod is Ready and listed. Nothing changed.',
        actor: `${OWNER_TEXT[sc.owner]} found its objects already matching.`,
        reason: 'Reconcile reruns the owners. It does not re-apply your fix.',
        notYet: 'Nothing else is pending for this object.',
        reads: [],
      },
    };
  }
  const next: LadderState = state.stage === 'settled'
    ? { ...state, attempts: state.attempts + 1, version: state.version + 1 }
    : { ...state, stage: 'settled', attempts: fixed ? 0 : 1, version: state.version + 1, retired: state.templateFixed ? null : state.retired };
  const facts = factsOf(next);
  const pod = podName(next);
  if (fixed) {
    const replaced = state.templateFixed && state.retired !== null;
    return {
      ...next, reads: ['status'],
      change: {
        title: `Reconcile: ${pod} ${facts.ready ? 'Ready' : 'not Ready'}`,
        changed: `${sc.fixed}${replaced ? ` The old Pod ${nameOf(false, state.retired ?? 1)} is removed now that ${pod} is Ready.` : ''}`,
        actor: `${OWNER_TEXT[sc.owner]}, not you: this pass is the one that acted on the change.`,
        reason: 'The owner re-read its object after the fix and reconciled the result.',
        notYet: replaced ? 'Only now is the old Pod removed; before this pass both Pods existed.' : 'Nothing else changed on this object.',
        reads: ['status'],
      },
    };
  }
  return {
    ...next, reads: ['status'],
    change: {
      title: `Reconcile: ${pod} still ${facts.status}`,
      changed: sc.retry(next.attempts),
      actor: `${OWNER_TEXT[sc.owner]}, running its loop again.`,
      reason: 'The spec is unchanged, so the owner reaches the same result. Waiting does not repair a spec.',
      notYet: 'No fix is applied. The same fault returns on every pass until an object changes.',
      reads: ['status'],
    },
  };
}

/** Owner rows beside the Pod: Deployment desired count and ReplicaSet counts. */
export function ownersOf(state: LadderState): string[] {
  const ready = factsOf(state).ready ? 1 : 0;
  const rows = [`Deployment ${DEPLOYMENT}: desired 1`];
  if (!state.templateFixed) {
    rows.push(`ReplicaSet ${RS_OLD}: desired 1, current 1, Ready ${ready}`);
  } else {
    rows.push(`ReplicaSet ${RS_NEW}: desired 1, current 1, Ready ${ready}`);
    rows.push(retiring(state)
      ? `ReplicaSet ${RS_OLD}: desired 1, current 1, Ready 0 (kept until ${RS_NEW} is Ready)`
      : `ReplicaSet ${RS_OLD}: desired 0, current 0`);
  }
  return rows;
}

export interface ManifestLine { text: string; field?: Field }

/** Pod and Service YAML from the state. Fields are what the last interaction read or changed. */
export function manifestOf(state: LadderState): ManifestLine[] {
  const spec = specOf(state);
  const facts = factsOf(state);
  const lines: ManifestLine[] = [
    { text: 'apiVersion: v1' },
    { text: 'kind: Pod' },
    { text: 'metadata:' },
    { text: `  name: ${podName(state)}`, field: 'identity' },
    { text: '  labels:' },
    { text: `    app: ${POD_LABEL}`, field: 'label' },
    { text: `  uid: p-${state.generation}   # fixture stand-in for a UUID`, field: 'identity' },
    { text: 'spec:' },
  ];
  if (facts.node) lines.push({ text: `  nodeName: ${facts.node}`, field: 'nodeName' });
  if (spec.pullSecret) lines.push({ text: '  imagePullSecrets:', field: 'pullSecret' }, { text: `  - name: ${spec.pullSecret}`, field: 'pullSecret' });
  lines.push(
    { text: '  containers:' },
    { text: '  - name: app' },
    { text: `    image: ${spec.image}`, field: 'image' },
    { text: `    env: [{name: ${spec.env}, value: orders-db}]`, field: 'env' },
    { text: '    resources:' },
    { text: `      requests: {cpu: "${spec.cpu}"}`, field: 'cpu' },
    { text: `      limits: {memory: ${spec.memory}}`, field: 'memory' },
  );
  if (spec.startup) lines.push({ text: '    startupProbe: {httpGet: {path: /livez, port: 8080}, periodSeconds: 5, failureThreshold: 12}', field: 'startup' });
  lines.push(
    { text: '    livenessProbe: {httpGet: {path: /livez, port: 8080}, initialDelaySeconds: 5, failureThreshold: 3}', field: 'liveness' },
    { text: `    readinessProbe: {httpGet: {path: ${spec.readinessPath}, port: 8080}, periodSeconds: 10}`, field: 'readiness' },
    { text: '  volumes:' },
    { text: '  - name: data' },
    { text: '    persistentVolumeClaim: {claimName: orders-api-data}', field: 'claim' },
    { text: '  - name: conf' },
    { text: '    configMap: {name: orders-api-conf}', field: 'configMap' },
    { text: 'status:' },
    { text: `  phase: ${facts.phase}`, field: 'status' },
    { text: '  conditions:' },
    { text: `  - {type: PodScheduled, status: "${facts.scheduled ? 'True' : 'False'}"${facts.scheduled ? '' : ', reason: Unschedulable'}}`, field: 'nodeName' },
    { text: `  - {type: Ready, status: "${facts.ready ? 'True' : 'False'}"}`, field: 'status' },
  );
  if (facts.container.state !== 'none') {
    const { state: containerState, reason, last } = facts.container;
    lines.push(
      { text: '  containerStatuses:', field: 'status' },
      { text: '  - name: app', field: 'status' },
      { text: `    ready: ${facts.ready ? 'true' : 'false'}`, field: 'status' },
      { text: `    restartCount: ${facts.restarts}`, field: 'status' },
      { text: containerState === 'running' ? '    state: {running: {}}' : `    state: {waiting: {reason: ${reason}}}`, field: 'status' },
    );
    if (last) lines.push({ text: `    lastState: {terminated: {reason: ${last.reason}, exitCode: ${last.exitCode}}}`, field: 'status' });
  }
  lines.push(
    { text: '---' },
    { text: 'apiVersion: v1' },
    { text: 'kind: Service' },
    { text: 'metadata:' },
    { text: `  name: ${SERVICE}` },
    { text: 'spec:' },
    { text: `  selector: {app: ${selectorOf(state)}}`, field: 'selector' },
  );
  return lines;
}

/** Whether a manifest line is one the last interaction read or changed. */
export const isHighlighted = (state: LadderState, line: ManifestLine) => line.field !== undefined && state.reads.includes(line.field);

/** Whether the learner has read the rung that names the cause for the current object. */
export const causeNamed = (state: LadderState) => state.read[SCENARIOS[state.scenario].diagnosis] === true;

/** A snapshot is stale once an owner or fix has changed the object since it was read. */
export const isStale = (state: LadderState, index: number) => {
  const snap = state.snapshots[index];
  return snap !== null && snap !== undefined && snap.version < state.version;
};

export const STAGE_TEXT: Record<Stage, string> = {
  fresh: 'fresh: new object, no owner has acted',
  stale: 'stale: outside fix applied, owners have not run',
  settled: 'settled: owners have run on this object',
};
