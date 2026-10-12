// Authored fixture: one controller per need, one event per Step. No clock, no network, no randomness.
// Simplifications (named in the explanation): Pod deletion is immediate, node placement is a fixed rule,
// readiness succeeds on an explicit Step, the Job backoff delay is omitted, StatefulSet scale-down does not
// wait for successors to finish terminating, and a deleted Job Pod is replaced without counting as a failure.

export type Kind = 'Deployment' | 'StatefulSet' | 'DaemonSet' | 'Job' | 'CronJob';
export const kinds: readonly Kind[] = ['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob'];
export const needLabels: Record<Kind, string> = {
  Deployment: 'Interchangeable replicas · Deployment',
  StatefulSet: 'Stable names and storage · StatefulSet',
  DaemonSet: 'One Pod per node · DaemonSet',
  Job: 'Run to completion · Job',
  CronJob: 'Run on a schedule · CronJob',
};
export const controllerOf: Record<Kind, string> = {
  Deployment: 'ReplicaSet controller (for the Deployment)',
  StatefulSet: 'StatefulSet controller',
  DaemonSet: 'DaemonSet controller',
  Job: 'Job controller',
  CronJob: 'CronJob controller',
};

export type NodeId = 'node-a' | 'node-b' | 'node-c' | 'node-d';
export const nodeIds: readonly NodeId[] = ['node-a', 'node-b', 'node-c', 'node-d'];
/** Pods one present node can hold at once: one socket each. */
export const SOCKETS = 2;
export const TRAY_SLOTS = 4;
export const SHELF_SLOTS = 12;
/** Cartridge elements in the figure: one per Pod object that exists at the same time. */
export const POOL = 16;
export const MAX_REPLICAS = 4;
export const JOB_COMPLETIONS = 3;
export const JOB_PARALLELISM = 2;
/** Fixture value for every Job here. The Kubernetes default is 6. */
export const BACKOFF_LIMIT = 2;
/** Kubernetes defaults for CronJob history limits. */
export const CRON_HISTORY = { successful: 3, failed: 1 };

export type Stage = 'unassigned' | 'assigned' | 'running' | 'ready' | 'succeeded' | 'failed';
export interface Pod {
  uid: number;
  /** Owner object, e.g. rs/web, sts/web, ds/node-agent, job/batch. */
  owner: string;
  /** StatefulSet ordinal (stable name web-<ordinal>); null for other owners. */
  ordinal: number | null;
  stage: Stage;
  node: NodeId | null;
  /** DaemonSet nodeAffinity pin; null otherwise. */
  pinned: NodeId | null;
  /** Figure cartridge element, unique among Pods that still exist. */
  el: number;
}
export interface Job {
  name: string;
  completions: number;
  parallelism: number;
  succeeded: number;
  failed: number;
  status: 'active' | 'complete' | 'failed';
}
export type ManifestKey = 'kind' | 'replicas' | 'template' | 'volumeClaimTemplates' | 'completions' | 'parallelism' | 'backoffLimit' | 'schedule' | 'concurrencyPolicy';
export interface Event {
  title: string;
  changed: string;
  actor: string;
  reason: string;
  notYet?: string;
  highlight: ManifestKey[];
}
export interface WorkloadState {
  kind: Kind;
  applied: boolean;
  replicas: number;
  nodes: Record<NodeId, boolean>;
  pods: Pod[];
  nextUid: number;
  claims: number[];
  jobs: Job[];
  nextJob: number;
  event: Event;
}

export type Tone = 'pass' | 'wait' | 'fail' | 'info' | 'selected';
export interface Badge { tone: Tone; label: string }
export const stageView: Record<Stage, Badge> = {
  unassigned: { tone: 'wait', label: 'Unassigned' },
  assigned: { tone: 'info', label: 'Assigned' },
  running: { tone: 'selected', label: 'Running' },
  ready: { tone: 'pass', label: 'Ready' },
  succeeded: { tone: 'pass', label: 'Succeeded' },
  failed: { tone: 'fail', label: 'Failed' },
};

const isLive = (pod: Pod) => pod.stage === 'unassigned' || pod.stage === 'assigned' || pod.stage === 'running' || pod.stage === 'ready';
const isBound = (pod: Pod) => pod.stage === 'assigned' || pod.stage === 'running' || pod.stage === 'ready';
const isTerminal = (pod: Pod) => pod.stage === 'succeeded' || pod.stage === 'failed';
const byUid = (a: Pod, b: Pod) => a.uid - b.uid;
const jobOwner = (job: Job) => `job/${job.name}`;
export const livePods = (s: WorkloadState) => s.pods.filter(isLive).sort(byUid);
export const readyCount = (s: WorkloadState) => s.pods.filter((pod) => pod.stage === 'ready').length;
export const boundPods = (s: WorkloadState, node: NodeId) => s.pods.filter((pod) => isBound(pod) && pod.node === node).sort(byUid);
export const boundOn = (s: WorkloadState, node: NodeId) => boundPods(s, node).length;
export const activeJob = (s: WorkloadState) => s.jobs.find((job) => job.status === 'active');
/** The running Pod of the active Job that an exit can finish or fail, if one exists. */
export function runningJobPod(s: WorkloadState): Pod | undefined {
  const job = activeJob(s);
  if (!job) return undefined;
  return livePods(s).find((pod) => pod.owner === jobOwner(job) && pod.stage === 'running');
}

function idle(kind: Kind): Event {
  return {
    title: 'Nothing applied',
    changed: `The form drafts a ${kind}. The cluster has no ${kind} object.`,
    actor: 'You, editing the manifest form',
    reason: 'The kind of the object you apply selects the controller that will own it. No controller acts before apply.',
    notYet: 'No Pod exists, no node is assigned, and nothing is Ready.',
    highlight: ['kind'],
  };
}

export function initialState(kind: Kind = 'Deployment'): WorkloadState {
  return {
    kind, applied: false, replicas: 3,
    nodes: { 'node-a': true, 'node-b': true, 'node-c': true, 'node-d': false },
    pods: [], nextUid: 1, claims: [], jobs: [], nextJob: 1, event: idle(kind),
  };
}

export function chooseKind(s: WorkloadState, kind: Kind): WorkloadState {
  if (s.applied || kind === s.kind) return s;
  return { ...s, kind, event: idle(kind) };
}

export function apply(s: WorkloadState): WorkloadState {
  if (s.applied) return s;
  const actor = 'You (kubectl apply of the manifest shown)';
  if (s.kind === 'Job') {
    const job: Job = { name: 'batch', completions: JOB_COMPLETIONS, parallelism: JOB_PARALLELISM, succeeded: 0, failed: 0, status: 'active' };
    return { ...s, applied: true, jobs: [job], nextJob: 1, event: {
      title: 'Job batch created',
      changed: `Job batch exists: completions ${JOB_COMPLETIONS}, parallelism ${JOB_PARALLELISM}. No Pod yet.`,
      actor,
      reason: 'A Job is a run-to-completion object. Its controller creates Pods only while completions remain and parallelism has room.',
      notYet: 'No Pod exists. The Job controller acts on the next Step.',
      highlight: ['completions', 'parallelism', 'backoffLimit'],
    } };
  }
  if (s.kind === 'CronJob') {
    return { ...s, applied: true, event: {
      title: 'CronJob report created',
      changed: 'CronJob report exists with a schedule. No Job object exists yet.',
      actor,
      reason: 'A CronJob is a template for Jobs. It creates Job objects only when the schedule fires.',
      notYet: 'No Job, no Pod. Use "Schedule fires" to model the next scheduled run.',
      highlight: ['schedule', 'concurrencyPolicy'],
    } };
  }
  const reason: Record<'Deployment' | 'StatefulSet' | 'DaemonSet', string> = {
    Deployment: 'The Deployment controller manages a ReplicaSet, which creates Pods from the template until the replica count is met.',
    StatefulSet: 'The StatefulSet controller creates Pods named web-0, web-1, … in order, each with its own claim.',
    DaemonSet: 'The DaemonSet controller creates one Pod per eligible node. It has no replicas field.',
  };
  return { ...s, applied: true, event: {
    title: `${s.kind} applied`,
    changed: s.kind === 'DaemonSet'
      ? 'DaemonSet node-agent exists. No Pod yet; the controller reads the present nodes.'
      : `${s.kind} web exists with ${s.replicas} desired replicas. No Pod yet.`,
    actor,
    reason: reason[s.kind],
    notYet: 'No Pod exists. The owning controller acts on the next Step.',
    highlight: s.kind === 'DaemonSet' ? ['template'] : ['replicas', 'template'],
  } };
}

export function setReplicas(s: WorkloadState, replicas: number): WorkloadState {
  if (!s.applied || (s.kind !== 'Deployment' && s.kind !== 'StatefulSet')) return s;
  if (!Number.isInteger(replicas) || replicas < 0 || replicas > MAX_REPLICAS || replicas === s.replicas) return s;
  const observed = livePods(s).length;
  return { ...s, replicas, event: {
    title: `Desired replicas ${s.replicas} → ${replicas}`,
    changed: `spec.replicas = ${replicas}. Observed live Pods stay at ${observed} until a controller acts.`,
    actor: 'You (spec.replicas edit)',
    reason: 'Replicas is intent. The owning controller compares it with live Pods on each Step.',
    notYet: 'No Pod is created or deleted yet.',
    highlight: ['replicas'],
  } };
}

/** Lowest-cost bound candidate: fewest bound Pods, then node order. */
export function bestNode(s: WorkloadState, pinned: NodeId | null): NodeId | null {
  const open = (pinned ? [pinned] : [...nodeIds]).filter((node) => s.nodes[node] && boundOn(s, node) < SOCKETS);
  open.sort((a, b) => boundOn(s, a) - boundOn(s, b) || nodeIds.indexOf(a) - nodeIds.indexOf(b));
  return open[0] ?? null;
}

function spawn(s: WorkloadState, owner: string, ordinal: number | null, pinned: NodeId | null): WorkloadState {
  const used = new Set(s.pods.map((pod) => pod.el));
  let el = 0;
  while (used.has(el)) el++;
  if (el >= POOL) throw new Error('Workload fixture exceeded its cartridge pool');
  const pod: Pod = { uid: s.nextUid, owner, ordinal, stage: 'unassigned', node: null, pinned, el };
  return { ...s, pods: [...s.pods, pod], nextUid: s.nextUid + 1 };
}

function withPods(s: WorkloadState, pods: Pod[], event: Event): WorkloadState {
  return { ...s, pods: pods.sort(byUid), event };
}

function bind(s: WorkloadState, pod: Pod): WorkloadState {
  const node = bestNode(s, pod.pinned);
  const id = `p${pod.uid}`;
  if (!node) {
    return { ...s, event: {
      title: `${id} stays Unassigned`,
      changed: 'Nothing changed. No node assignment was written.',
      actor: 'kube-scheduler',
      reason: pod.pinned
        ? `The pinned node ${pod.pinned} is absent or has no free socket.`
        : 'No present node has a free socket (each node has 2 in this fixture).',
      notYet: `${id} is not assigned, not Running and not Ready.`,
      highlight: [],
    } };
  }
  const pods = s.pods.map((candidate) => candidate.uid === pod.uid ? { ...candidate, node, stage: 'assigned' as Stage } : candidate);
  return withPods(s, pods, {
    title: `Scheduler binds ${id} to ${node}`,
    changed: `${id} gets nodeName ${node}. Stage: Assigned.`,
    actor: 'kube-scheduler',
    reason: pod.pinned
      ? `The DaemonSet pins ${id} to ${node} with nodeAffinity; the default scheduler binds it.`
      : `${node} had the fewest bound Pods among present nodes with a free socket.`,
    notYet: 'Assigned is not Running. The container has not started, and the Pod is not Ready.',
    highlight: [],
  });
}

function start(s: WorkloadState, pod: Pod, longLived: boolean): WorkloadState {
  const id = `p${pod.uid}`;
  const pods = s.pods.map((candidate) => candidate.uid === pod.uid ? { ...candidate, stage: 'running' as Stage } : candidate);
  return withPods(s, pods, {
    title: `Kubelet on ${pod.node} starts ${id}`,
    changed: `${id} containers start. Stage: Running.`,
    actor: `kubelet and container runtime on ${pod.node}`,
    reason: 'The Pod has a node, so its containers start on that node.',
    notYet: longLived ? `Running is not Ready. ${id} waits for its readiness probe.` : `Running is not finished. Succeeded or Failed decides ${id}'s outcome.`,
    highlight: [],
  });
}

function ready(s: WorkloadState, pod: Pod): WorkloadState {
  const id = `p${pod.uid}`;
  const pods = s.pods.map((candidate) => candidate.uid === pod.uid ? { ...candidate, stage: 'ready' as Stage } : candidate);
  return withPods(s, pods, {
    title: `${id} becomes Ready`,
    changed: `${id} Ready condition true. Stage: Ready.`,
    actor: 'kubelet readiness probe (fixture: succeeds on this Step)',
    reason: 'Ready is a probe result. Running alone does not make a Pod Ready.',
    notYet: 'Services, endpoints and application correctness are not modeled here.',
    highlight: ['template'],
  });
}

/** Advance the first candidate that still needs the scheduler, the kubelet or a probe. */
function progress(s: WorkloadState, candidates: Pod[], longLived: boolean): WorkloadState | null {
  const pod = candidates.find((candidate) => candidate.stage === 'unassigned' || candidate.stage === 'assigned' || (longLived && candidate.stage === 'running'));
  if (!pod) return null;
  if (pod.stage === 'unassigned') return bind(s, pod);
  if (pod.stage === 'assigned') return start(s, pod, longLived);
  return ready(s, pod);
}

function replicaStep(s: WorkloadState): WorkloadState | null {
  const pods = livePods(s);
  if (pods.length > s.replicas) {
    const victim = pods[pods.length - 1]!;
    return withPods(s, s.pods.filter((pod) => pod.uid !== victim.uid), {
      title: `ReplicaSet deletes p${victim.uid}`,
      changed: `p${victim.uid} removed. Live Pods ${pods.length - 1} of ${s.replicas}.`,
      actor: 'ReplicaSet controller',
      reason: `Live Pods ${pods.length} exceed replicas ${s.replicas}. The fixture removes the newest Pod; real ReplicaSets rank candidates first.`,
      notYet: 'No other Pod changed. The template is unchanged.',
      highlight: ['replicas'],
    });
  }
  if (pods.length < s.replicas) {
    const id = s.nextUid;
    const created = spawn(s, 'rs/web', null, null);
    return { ...created, event: {
      title: `ReplicaSet creates p${id}`,
      changed: `p${id} exists from the template. Stage: Unassigned, no node.`,
      actor: 'ReplicaSet controller',
      reason: `Live Pods ${pods.length} are below replicas ${s.replicas}.`,
      notYet: `p${id} is not scheduled, not Running and not Ready. It is a new UID, not a returned Pod.`,
      highlight: ['replicas', 'template'],
    } };
  }
  return progress(s, pods, true);
}

function statefulStep(s: WorkloadState): WorkloadState | null {
  const pods = livePods(s);
  const extra = pods.filter((pod) => pod.ordinal !== null && pod.ordinal >= s.replicas).sort((a, b) => (b.ordinal ?? 0) - (a.ordinal ?? 0));
  if (extra[0]) {
    const victim = extra[0];
    const name = `web-${victim.ordinal}`;
    return withPods(s, s.pods.filter((pod) => pod.uid !== victim.uid), {
      title: `StatefulSet scales down: ${name} deleted`,
      changed: `p${victim.uid} removed. data-${name} is kept.`,
      actor: 'StatefulSet controller',
      reason: `Replicas ${s.replicas} is below ordinal ${victim.ordinal}. The highest ordinal goes first.`,
      notYet: `The claim data-${name} still exists. Scaling back up re-attaches it.`,
      highlight: ['replicas'],
    });
  }
  const present = new Set(pods.map((pod) => pod.ordinal));
  let missing: number | null = null;
  for (let ordinal = 0; ordinal < s.replicas; ordinal++) {
    if (!present.has(ordinal)) { missing = ordinal; break; }
  }
  const byOrdinal = [...pods].sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
  if (missing !== null) {
    const predecessors = byOrdinal.filter((pod) => (pod.ordinal ?? 0) < missing! && pod.stage !== 'ready');
    if (predecessors.length) return progress(s, predecessors, true);
    const name = `web-${missing}`;
    const reattach = s.claims.includes(missing);
    const id = s.nextUid;
    const created = spawn(s, 'sts/web', missing, null);
    return { ...created,
      claims: reattach ? s.claims : [...s.claims, missing].sort((a, b) => a - b),
      event: {
        title: `StatefulSet creates ${name} as p${id}`,
        changed: reattach
          ? `${name} gets a new UID p${id} and re-attaches the retained data-${name}.`
          : `${name} gets p${id}. PVC data-${name} is created from volumeClaimTemplates.`,
        actor: 'StatefulSet controller',
        reason: missing === 0
          ? 'web-0 is the first ordinal, so it starts first.'
          : `web-0 through web-${missing - 1} are Ready, so ordinal ${missing} may start (OrderedReady).`,
        notYet: `${name} is not scheduled, not Running and not Ready. The name is stable; the UID is new.`,
        highlight: ['replicas', 'volumeClaimTemplates'],
      } };
  }
  return progress(s, byOrdinal, true);
}

function daemonStep(s: WorkloadState): WorkloadState | null {
  const pods = livePods(s);
  const node = nodeIds.find((candidate) => s.nodes[candidate] && !pods.some((pod) => pod.pinned === candidate));
  if (node) {
    const id = s.nextUid;
    const created = spawn(s, 'ds/node-agent', null, node);
    return { ...created, event: {
      title: `DaemonSet creates p${id} for ${node}`,
      changed: `p${id} pinned to ${node} by nodeAffinity. Stage: Unassigned.`,
      actor: 'DaemonSet controller',
      reason: `${node} is present and has no node-agent Pod.`,
      notYet: `p${id} is not yet bound. The default scheduler still performs the binding.`,
      highlight: ['template'],
    } };
  }
  return progress(s, pods, true);
}

function jobStep(s: WorkloadState): WorkloadState | null {
  const job = activeJob(s);
  if (!job) return null;
  const owned = livePods(s).filter((pod) => pod.owner === jobOwner(job));
  const remaining = job.completions - job.succeeded;
  const wanted = Math.min(job.parallelism, remaining);
  if (owned.length < wanted) {
    const id = s.nextUid;
    const created = spawn(s, jobOwner(job), null, null);
    return { ...created, event: {
      title: `Job ${job.name} creates p${id}`,
      changed: `p${id} exists for ${job.name}. Stage: Unassigned.`,
      actor: 'Job controller',
      reason: `${owned.length} live Pods, below ${wanted} wanted (parallelism ${job.parallelism}, ${remaining} completions remaining).`,
      notYet: `p${id} is not bound, not Running and not finished.`,
      highlight: ['completions', 'parallelism'],
    } };
  }
  return progress(s, owned, false);
}

/** The next controller, scheduler or kubelet event, or null when no event is pending. */
export function nextStep(s: WorkloadState): WorkloadState | null {
  if (!s.applied) return null;
  if (s.kind === 'Deployment') return replicaStep(s);
  if (s.kind === 'StatefulSet') return statefulStep(s);
  if (s.kind === 'DaemonSet') return daemonStep(s);
  return jobStep(s);
}

export function step(s: WorkloadState): WorkloadState {
  return nextStep(s) ?? s;
}

/** Remove a node: its live Pods are evicted; each owning controller decides on a later Step. */
export function toggleNode(s: WorkloadState, node: NodeId): WorkloadState {
  if (s.nodes[node]) {
    const evicted = s.pods.filter((pod) => (pod.node === node || pod.pinned === node) && isLive(pod));
    const remaining = s.pods.filter((pod) => !evicted.includes(pod));
    const replaced = evicted.filter((pod) => pod.owner !== 'ds/node-agent');
    const names = evicted.length ? evicted.map((pod) => `p${pod.uid}`).join(', ') : 'none';
    return { ...s, nodes: { ...s.nodes, [node]: false }, pods: remaining.sort(byUid), event: {
      title: `${node} drained and removed`,
      changed: `Evicted live Pods: ${names}. ${node} is absent.`,
      actor: 'You (drain, then delete the Node object)',
      reason: evicted.length
        ? 'A node that leaves takes its Pods with it. DaemonSet Pods are not moved elsewhere; other owners create replacements on later Steps.'
        : `No live Pod was on ${node}.`,
      notYet: replaced.length ? 'Replacements are not created by this event. Each owning controller acts on a later Step.' : 'No DaemonSet Pod remains on the removed node.',
      highlight: [],
    } };
  }
  const applied = s.applied && s.kind === 'DaemonSet';
  return { ...s, nodes: { ...s.nodes, [node]: true }, event: {
    title: `${node} joined`,
    changed: `${node} is present with ${SOCKETS} free sockets. No Pod was placed on it.`,
    actor: `node registration (kubelet on ${node})`,
    reason: applied
      ? 'The DaemonSet controller adds one Pod for each newly present node on the next Step.'
      : 'Deployment, StatefulSet and Job controllers do not add Pods for a new node. It only offers room for Pods they create later.',
    notYet: `No Pod is placed on ${node} yet.`,
    highlight: [],
  } };
}

export function deletePod(s: WorkloadState, uid: number): WorkloadState {
  const pod = s.pods.find((candidate) => candidate.uid === uid);
  if (!pod || !isLive(pod)) return s;
  const id = `p${uid}`;
  const reason = s.kind === 'StatefulSet'
    ? `The StatefulSet keeps the ordinal. web-${pod.ordinal} returns on a later Step with the same name and data-web-${pod.ordinal} re-attached.`
    : s.kind === 'DaemonSet'
      ? `The DaemonSet notices ${pod.node} lost its Pod and creates a replacement on a later Step.`
      : s.kind === 'Deployment'
        ? 'The ReplicaSet sees fewer Pods than replicas and creates a new Pod with a new UID on a later Step.'
        : 'The Job controller creates a replacement on a later Step. This fixture does not count a deletion as a failure.';
  return withPods(s, s.pods.filter((candidate) => candidate.uid !== uid), {
    title: `You deleted ${id}`,
    changed: `${id} removed from the live set${pod.ordinal !== null ? ` (name web-${pod.ordinal})` : ''}. Desired state unchanged.`,
    actor: 'You (kubectl delete pod)',
    reason,
    notYet: 'No replacement exists yet. The owning controller acts on the next Step.',
    highlight: [],
  });
}

/** The running Job Pod exits 0: Succeeded, counted toward completions. */
export function finish(s: WorkloadState): WorkloadState {
  const job = activeJob(s);
  const pod = runningJobPod(s);
  if (!job || !pod) return s;
  const succeeded = job.succeeded + 1;
  const complete = succeeded >= job.completions;
  const jobs = s.jobs.map((candidate) => candidate.name === job.name
    ? { ...candidate, succeeded, status: complete ? 'complete' as const : candidate.status }
    : candidate);
  const pods = s.pods.map((candidate) => candidate.uid === pod.uid ? { ...candidate, stage: 'succeeded' as Stage } : candidate);
  const next: WorkloadState = { ...s, jobs, pods, event: {
    title: `p${pod.uid} Succeeded`,
    changed: `${job.name}: ${succeeded} of ${job.completions} completions. p${pod.uid} is terminal.`,
    actor: 'the container exits 0 (the workload, not a controller)',
    reason: `The Job counts Succeeded Pods and needs ${job.completions} for completion.`,
    notYet: complete ? `${job.name} is complete. No further Pod is created.` : 'The Job may create the next Pod on a later Step.',
    highlight: ['completions'],
  } };
  return complete && s.kind === 'CronJob' ? prune(next) : next;
}

/** CronJob history limits: keep 3 successful and 1 failed finished Jobs, with their Pods. */
function prune(s: WorkloadState): WorkloadState {
  let next = s;
  for (const [status, limit] of [['complete', CRON_HISTORY.successful], ['failed', CRON_HISTORY.failed]] as const) {
    const finished = next.jobs.filter((job) => job.status === status);
    if (finished.length > limit) {
      const oldest = finished[0]!;
      next = { ...next,
        jobs: next.jobs.filter((job) => job.name !== oldest.name),
        pods: next.pods.filter((pod) => pod.owner !== jobOwner(oldest)),
        event: { ...next.event, changed: `${next.event.changed} History limit removed ${oldest.name} and its Pods.` },
      };
    }
  }
  return next;
}

/** The running Job Pod exits non-zero: Failed. The Job fails when failed Pods exceed backoffLimit (the terminal-condition wording), so backoffLimit 2 allows two replacements. */
export function fail(s: WorkloadState): WorkloadState {
  const job = activeJob(s);
  const pod = runningJobPod(s);
  if (!job || !pod) return s;
  const failed = job.failed + 1;
  const jobFailed = failed > BACKOFF_LIMIT;
  const jobs = s.jobs.map((candidate) => candidate.name === job.name
    ? { ...candidate, failed, status: jobFailed ? 'failed' as const : candidate.status }
    : candidate);
  const pods = s.pods
    .map((candidate) => candidate.uid === pod.uid ? { ...candidate, stage: 'failed' as Stage } : candidate)
    .filter((candidate) => !(jobFailed && candidate.owner === jobOwner(job) && isLive(candidate)));
  const next: WorkloadState = { ...s, jobs, pods: pods.sort(byUid), event: {
    title: `p${pod.uid} Failed`,
    changed: jobFailed
      ? `${job.name} Failed: ${failed} failed Pods exceeded backoffLimit ${BACKOFF_LIMIT}. Its running Pods are terminated and removed here.`
      : `${job.name}: failed Pods ${failed}, retries used ${failed} of ${BACKOFF_LIMIT}. p${pod.uid} is terminal.`,
    actor: 'the container exits non-zero (the workload, not a controller)',
    reason: 'The Job controller replaces failed Pods while the failure count stays within backoffLimit.',
    notYet: jobFailed ? 'No replacement is created. The Job is Failed.' : 'A replacement comes on a later Step. The fixture omits the Kubernetes backoff delay.',
    highlight: ['backoffLimit'],
  } };
  return jobFailed && s.kind === 'CronJob' ? prune(next) : next;
}

/** One scheduled CronJob run. concurrencyPolicy Forbid: a run is skipped while the previous Job is active. */
export function tick(s: WorkloadState): WorkloadState {
  if (!s.applied || s.kind !== 'CronJob') return s;
  const running = activeJob(s);
  if (running) {
    return { ...s, event: {
      title: 'Scheduled run skipped',
      changed: `Nothing created. ${running.name} is still active.`,
      actor: 'CronJob controller',
      reason: 'concurrencyPolicy: Forbid does not allow overlapping runs of this CronJob.',
      notYet: 'The skipped run is not queued. The next schedule time is evaluated separately.',
      highlight: ['concurrencyPolicy'],
    } };
  }
  const job: Job = { name: `report-${s.nextJob}`, completions: 1, parallelism: 1, succeeded: 0, failed: 0, status: 'active' };
  return { ...s, jobs: [...s.jobs, job], nextJob: s.nextJob + 1, event: {
    title: `CronJob creates ${job.name}`,
    changed: `Job ${job.name} exists. It has no Pod yet.`,
    actor: 'CronJob controller at the schedule time',
    reason: 'The schedule fired and no earlier run is active, so Forbid permits this one.',
    notYet: `No Pod exists for ${job.name}. The Job controller creates its Pod on a later Step.`,
    highlight: ['schedule', 'concurrencyPolicy'],
  } };
}

/** Stage-driven placement: tray for Unassigned, node socket for bound Pods, shelf for terminal ones. */
export type Place =
  | { where: 'tray'; index: number }
  | { where: 'bay'; node: NodeId; socket: number; seated: boolean }
  | { where: 'shelf'; index: number };

export function placeOf(s: WorkloadState, pod: Pod): Place {
  const earlier = (predicate: (candidate: Pod) => boolean) => s.pods.filter((candidate) => candidate.uid < pod.uid && predicate(candidate)).length;
  if (pod.stage === 'unassigned') return { where: 'tray', index: earlier((candidate) => candidate.stage === 'unassigned') };
  if (isTerminal(pod)) return { where: 'shelf', index: earlier(isTerminal) };
  return {
    where: 'bay', node: pod.node!, seated: pod.stage !== 'assigned',
    socket: earlier((candidate) => isBound(candidate) && candidate.node === pod.node),
  };
}

/** Per-owner state counts, shown next to the controller and the Pods it owns. */
export function ownerBadges(s: WorkloadState): Badge[] {
  if (!s.applied) return [{ tone: 'info', label: 'Nothing applied · no owner acting' }];
  if (s.kind === 'Deployment' || s.kind === 'StatefulSet') {
    const ready = readyCount(s);
    return [
      { tone: 'info', label: `desired ${s.replicas}` },
      { tone: 'info', label: `live ${livePods(s).length}` },
      { tone: ready === s.replicas ? 'pass' : 'wait', label: `Ready ${ready} of ${s.replicas}` },
    ];
  }
  if (s.kind === 'DaemonSet') {
    const present = nodeIds.filter((node) => s.nodes[node]).length;
    const ready = readyCount(s);
    return [
      { tone: 'info', label: `present nodes ${present}` },
      { tone: 'info', label: `node-agent Pods ${livePods(s).length}` },
      { tone: ready === present ? 'pass' : 'wait', label: `Ready ${ready} of ${present}` },
    ];
  }
  if (s.kind === 'Job') {
    const job = s.jobs[0];
    if (!job) return [];
    const status: Badge = job.status === 'complete'
      ? { tone: 'pass', label: 'Job complete' }
      : job.status === 'failed' ? { tone: 'fail', label: 'Job Failed' } : { tone: 'selected', label: 'Job active' };
    return [
      status,
      { tone: 'info', label: `succeeded ${job.succeeded} of ${job.completions}` },
      { tone: 'info', label: `live Pods ${livePods(s).length} · parallelism ${job.parallelism}` },
      { tone: job.status === 'failed' ? 'fail' : 'info', label: `failed Pods ${job.failed}` },
      { tone: 'info', label: `retries used ${Math.min(job.failed, BACKOFF_LIMIT)} of ${BACKOFF_LIMIT}` },
    ];
  }
  const successful = s.jobs.filter((job) => job.status === 'complete').length;
  const failed = s.jobs.filter((job) => job.status === 'failed').length;
  const active = activeJob(s);
  return [
    { tone: active ? 'selected' : 'info', label: active ? `run ${active.name} active` : 'no active run' },
    { tone: 'info', label: `history successful ${successful} of ${CRON_HISTORY.successful}` },
    { tone: 'info', label: `history failed ${failed} of ${CRON_HISTORY.failed}` },
  ];
}

export function manifestLines(s: WorkloadState): Array<{ text: string; key?: ManifestKey }> {
  if (s.kind === 'Job') {
    return [
      { text: 'apiVersion: batch/v1', key: 'kind' },
      { text: 'kind: Job', key: 'kind' },
      { text: 'metadata:' },
      { text: '  name: batch' },
      { text: 'spec:' },
      { text: `  completions: ${JOB_COMPLETIONS}`, key: 'completions' },
      { text: `  parallelism: ${JOB_PARALLELISM}`, key: 'parallelism' },
      { text: `  backoffLimit: ${BACKOFF_LIMIT}`, key: 'backoffLimit' },
      { text: '  template:', key: 'template' },
      { text: '    spec:', key: 'template' },
      { text: '      restartPolicy: Never', key: 'template' },
      { text: '      containers:', key: 'template' },
      { text: '      - name: batch', key: 'template' },
      { text: '        image: registry.example.com/batch:1.0', key: 'template' },
    ];
  }
  if (s.kind === 'CronJob') {
    return [
      { text: 'apiVersion: batch/v1', key: 'kind' },
      { text: 'kind: CronJob', key: 'kind' },
      { text: 'metadata:' },
      { text: '  name: report' },
      { text: 'spec:' },
      { text: '  schedule: "0 3 * * *"', key: 'schedule' },
      { text: '  concurrencyPolicy: Forbid', key: 'concurrencyPolicy' },
      { text: '  successfulJobsHistoryLimit: 3' },
      { text: '  failedJobsHistoryLimit: 1' },
      { text: '  jobTemplate:', key: 'template' },
      { text: '    spec:', key: 'template' },
      { text: '      completions: 1', key: 'completions' },
      { text: '      parallelism: 1', key: 'parallelism' },
      { text: `      backoffLimit: ${BACKOFF_LIMIT}`, key: 'backoffLimit' },
      { text: '      template:', key: 'template' },
      { text: '        spec:', key: 'template' },
      { text: '          restartPolicy: Never', key: 'template' },
      { text: '          containers:', key: 'template' },
      { text: '          - name: report', key: 'template' },
      { text: '            image: registry.example.com/report:1.0', key: 'template' },
    ];
  }
  if (s.kind === 'DaemonSet') {
    return [
      { text: 'apiVersion: apps/v1', key: 'kind' },
      { text: 'kind: DaemonSet', key: 'kind' },
      { text: 'metadata:' },
      { text: '  name: node-agent' },
      { text: 'spec:' },
      { text: '  selector:' },
      { text: '    matchLabels:' },
      { text: '      app: node-agent' },
      { text: '  template:', key: 'template' },
      { text: '    metadata:', key: 'template' },
      { text: '      labels:', key: 'template' },
      { text: '        app: node-agent', key: 'template' },
      { text: '    spec:', key: 'template' },
      { text: '      containers:', key: 'template' },
      { text: '      - name: agent', key: 'template' },
      { text: '        image: registry.example.com/node-agent:1.0', key: 'template' },
      { text: '        readinessProbe:', key: 'template' },
      { text: '          httpGet:', key: 'template' },
      { text: '            path: /healthz', key: 'template' },
      { text: '            port: 8080', key: 'template' },
    ];
  }
  const statefulSet = s.kind === 'StatefulSet';
  return [
    { text: 'apiVersion: apps/v1', key: 'kind' },
    { text: `kind: ${s.kind}`, key: 'kind' },
    { text: 'metadata:' },
    { text: '  name: web' },
    { text: 'spec:' },
    ...(statefulSet ? [{ text: '  serviceName: web' }] : []),
    { text: `  replicas: ${s.replicas}`, key: 'replicas' },
    { text: '  selector:' },
    { text: '    matchLabels:' },
    { text: '      app: web' },
    { text: '  template:', key: 'template' },
    { text: '    metadata:', key: 'template' },
    { text: '      labels:', key: 'template' },
    { text: '        app: web', key: 'template' },
    { text: '    spec:', key: 'template' },
    { text: '      containers:', key: 'template' },
    { text: '      - name: web', key: 'template' },
    { text: '        image: registry.example.com/web:1.0', key: 'template' },
    { text: '        readinessProbe:', key: 'template' },
    { text: '          httpGet:', key: 'template' },
    { text: '            path: /healthz', key: 'template' },
    { text: '            port: 8080', key: 'template' },
    ...(statefulSet ? [
      { text: '        volumeMounts:', key: 'volumeClaimTemplates' as ManifestKey },
      { text: '        - name: data', key: 'volumeClaimTemplates' as ManifestKey },
      { text: '          mountPath: /var/lib/web', key: 'volumeClaimTemplates' as ManifestKey },
      { text: '  volumeClaimTemplates:', key: 'volumeClaimTemplates' as ManifestKey },
      { text: '  - metadata:', key: 'volumeClaimTemplates' as ManifestKey },
      { text: '      name: data', key: 'volumeClaimTemplates' as ManifestKey },
      { text: '    spec:', key: 'volumeClaimTemplates' as ManifestKey },
      { text: '      accessModes: ["ReadWriteOnce"]', key: 'volumeClaimTemplates' as ManifestKey },
      { text: '      resources:', key: 'volumeClaimTemplates' as ManifestKey },
      { text: '        requests:', key: 'volumeClaimTemplates' as ManifestKey },
      { text: '          storage: 1Gi', key: 'volumeClaimTemplates' as ManifestKey },
    ] : []),
  ];
}
