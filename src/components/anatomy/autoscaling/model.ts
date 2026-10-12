/** Authored, deterministic fixture: one Deployment `web` scaled by one HorizontalPodAutoscaler.
 *
 * Rules modelled here (kubernetes.io, HPA, ReplicaSet and node autoscaling pages):
 * - desired = ceil(current × currentUtilization / target), skipped inside a ±10% tolerance;
 * - CPU utilization is a percentage of each Pod's CPU request; no request means no CPU target;
 * - Pods that are not Ready are set aside: on a scale-up they count as 0%; on a scale-down the fixture
 *   counts them as the target (the docs say this for missing metrics; extending it is a fixture choice);
 * - min/max bound the recommendation; scale-up is immediate; scale-down takes the highest
 *   recommendation in the stabilization window;
 * - the ReplicaSet deletes Pending Pods first, then Pods on the busiest node, then the newest;
 * - a node autoscaler adds a node only for a Pod the scheduler cannot place.
 *
 * Fixture simplifications (named on the page): one sync = one 15 s period; the window is counted in
 * syncs; the scheduler is first-fit by fewest web Pods; Pods are removed at once; the HPA runs only
 * when every Pod it asked for exists; metric-initialisation windows and scaling policies are not modelled.
 */
export const SYNC_SECONDS = 15;
export const TARGET_PERCENT = 50;
export const TOLERANCE = 0.1;
export const MIN_REPLICAS = 2;
export const BAYS_PER_NODE = 4;
export const NODE_ALLOCATABLE = 1000;
export const MAX_NODES = 4;
/** Requests from other workloads that already hold room on the two original nodes (millicores). */
export const OTHER_LOAD: Record<number, number> = { 1: 500, 2: 500 };
export const MAX_REPLICA_CHOICES = [3, 4, 6] as const;
export const WINDOW_CHOICES = [0, 45] as const;
export const TRAFFIC_CHOICES = [200, 250, 400, 600, 800, 1000] as const;
export const REQUEST_CHOICES = [250, 500, null] as const;

export type Stage = 'unassigned' | 'assigned' | 'ready';
export interface Pod { id: number; node: number | null; ready: boolean }
export type HpaStatus = 'no-metric' | 'no-change' | 'scale-up' | 'scale-down' | 'held';

export interface Cluster {
  /** Pod template CPU request in millicores; null = the container declares no CPU request. */
  request: number | null;
  /** Total CPU use of the web Pods, in millicores, split across Ready Pods. Changed outside the cluster. */
  traffic: number;
  maxReplicas: number;
  /** spec.behavior.scaleDown.stabilizationWindowSeconds */
  windowSeconds: number;
  autoscaler: boolean;
  nodes: number[];
  /** Deployment spec.replicas, written by the HPA. */
  replicas: number;
  pods: Pod[];
  nextPod: number;
  /** Status recorded by the last HPA sync; inputs changed since then are not reflected here. */
  hpa: { status: HpaStatus; utilization: number | null; recommendation: number; desired: number; window: number[] };
}

export type ClusterEvent =
  | { kind: 'create'; pod: number }
  | { kind: 'bind'; pod: number; node: number }
  | { kind: 'provision'; node: number }
  | { kind: 'ready'; pod: number }
  | { kind: 'delete'; pod: number; pending: boolean; node: number | null };

export interface Decision {
  status: HpaStatus;
  /** Average CPU use of Ready Pods, percent of request, as reported by metrics. */
  utilization: number | null;
  /** utilization / target before Pods that are not Ready are set aside. */
  ratio: number | null;
  /** Ratio after the not-Ready rule. */
  factoredRatio: number | null;
  /** Number of Pods that are not Ready and therefore set aside. */
  setAside: number;
  raw: number | null;
  recommendation: number;
  desired: number;
  window: number[];
}

export const stageOf = (pod: Pod): Stage => (pod.node === null ? 'unassigned' : pod.ready ? 'ready' : 'assigned');
export const readyCount = (cluster: Cluster) => cluster.pods.filter((pod) => pod.ready).length;
export const onNode = (cluster: Cluster, node: number) => cluster.pods.filter((pod) => pod.node === node).length;
export const isSettled = (cluster: Cluster) => cluster.pods.length === cluster.replicas && cluster.pods.every((pod) => pod.ready);
/** The HPA only runs when every Pod it asked for exists (fixture simplification). */
export const hpaCanSync = (cluster: Cluster) => cluster.pods.length === cluster.replicas;

export function initialCluster(request: number | null = 250): Cluster {
  const cluster: Cluster = {
    request, traffic: 250, maxReplicas: 6, windowSeconds: 45, autoscaler: true,
    nodes: [1, 2], replicas: 2,
    pods: [{ id: 1, node: 1, ready: true }, { id: 2, node: 2, ready: true }],
    nextPod: 3,
    hpa: { status: 'no-change', utilization: null, recommendation: 2, desired: 2, window: [2] },
  };
  cluster.hpa.utilization = utilizationOf(cluster);
  if (cluster.hpa.utilization === null) cluster.hpa.status = 'no-metric';
  return cluster;
}

export function utilizationOf(cluster: Cluster): number | null {
  const ready = readyCount(cluster);
  if (cluster.request === null || ready === 0) return null;
  return (cluster.traffic / ready / cluster.request) * 100;
}

/** Pure decision for the current inputs. The HPA may only write the result when hpaCanSync. */
export function decide(cluster: Cluster): Decision {
  const current = cluster.pods.length;
  const utilization = utilizationOf(cluster);
  if (utilization === null) {
    return { status: 'no-metric', utilization, ratio: null, factoredRatio: null, setAside: 0, raw: null, recommendation: current, desired: current, window: cluster.hpa.window };
  }
  const ratio = utilization / TARGET_PERCENT;
  const setAside = current - readyCount(cluster);
  let factored = ratio;
  if (setAside > 0 && ratio !== 1) {
    // Set-aside Pods: 0% on a scale-up; the target on a scale-down (documented for missing metrics).
    const assumed = ratio > 1 ? 0 : 1;
    factored = (readyCount(cluster) * ratio + setAside * assumed) / current;
  }
  const withinOrReversed = Math.abs(factored - 1) <= TOLERANCE + 1e-9 || Math.sign(factored - 1) !== Math.sign(ratio - 1);
  const raw = withinOrReversed ? current : Math.ceil(current * factored - 1e-9);
  const recommendation = Math.min(cluster.maxReplicas, Math.max(MIN_REPLICAS, raw));
  const size = Math.max(1, Math.round(cluster.windowSeconds / SYNC_SECONDS));
  const window = [...cluster.hpa.window, recommendation].slice(-size);
  let desired = recommendation;
  let status: HpaStatus = 'no-change';
  if (recommendation > current) status = 'scale-up';
  else if (recommendation < current) {
    desired = Math.min(current, Math.min(cluster.maxReplicas, Math.max(MIN_REPLICAS, Math.max(...window))));
    status = desired < current ? 'scale-down' : 'held';
  }
  return { status, utilization, ratio, factoredRatio: factored, setAside, raw, recommendation, desired, window };
}

/** One HPA sync: records the decision and writes spec.replicas only when it changes. */
export function sync(cluster: Cluster): { next: Cluster; decision: Decision } | null {
  if (!hpaCanSync(cluster)) return null;
  const decision = decide(cluster);
  const next: Cluster = {
    ...cluster,
    replicas: decision.status === 'no-metric' ? cluster.replicas : decision.desired,
    hpa: { status: decision.status, utilization: decision.utilization, recommendation: decision.recommendation, desired: decision.desired, window: decision.window },
  };
  return { next, decision };
}

/** How many more web Pods at the current request fit on a node: bays left, capped by CPU left. */
export function roomOn(cluster: Cluster, node: number): number {
  const count = onNode(cluster, node);
  const bays = BAYS_PER_NODE - count;
  if (cluster.request === null) return bays;
  const free = NODE_ALLOCATABLE - (OTHER_LOAD[node] ?? 0) - count * cluster.request;
  return Math.max(0, Math.min(bays, Math.floor(free / cluster.request)));
}

/** Stand-in for scheduler scoring: among nodes with room, the one with the fewest web Pods, then lowest id. */
export function placementOf(cluster: Cluster): number | null {
  const candidates = cluster.nodes.filter((node) => roomOn(cluster, node) > 0)
    .sort((a, b) => onNode(cluster, a) - onNode(cluster, b) || a - b);
  return candidates[0] ?? null;
}

/** The single next controller event, in the order this fixture applies them. Null means nothing is due. */
export function planNext(cluster: Cluster): ClusterEvent | null {
  if (cluster.pods.length > cluster.replicas) {
    // ReplicaSet scale-down order: Pending first, then Pods on nodes with more web Pods, then the newest.
    const rank = (pod: Pod) => [pod.node === null ? 0 : 1, pod.node === null ? 0 : -onNode(cluster, pod.node), -pod.id];
    const victim = [...cluster.pods].sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      return ra[0]! - rb[0]! || ra[1]! - rb[1]! || ra[2]! - rb[2]!;
    })[0]!;
    return { kind: 'delete', pod: victim.id, pending: victim.node === null, node: victim.node };
  }
  const unassigned = cluster.pods.filter((pod) => pod.node === null).sort((a, b) => a.id - b.id);
  const target = placementOf(cluster);
  if (unassigned.length > 0 && target !== null) return { kind: 'bind', pod: unassigned[0]!.id, node: target };
  if (cluster.pods.length < cluster.replicas) return { kind: 'create', pod: cluster.nextPod };
  if (unassigned.length > 0 && cluster.autoscaler && cluster.nodes.length < MAX_NODES) {
    return { kind: 'provision', node: Math.max(...cluster.nodes) + 1 };
  }
  const starting = cluster.pods.filter((pod) => pod.node !== null && !pod.ready).sort((a, b) => a.id - b.id)[0];
  return starting ? { kind: 'ready', pod: starting.id } : null;
}

export function advance(cluster: Cluster): { next: Cluster; event: ClusterEvent } | null {
  const event = planNext(cluster);
  if (!event) return null;
  switch (event.kind) {
    case 'delete':
      return { next: { ...cluster, pods: cluster.pods.filter((pod) => pod.id !== event.pod) }, event };
    case 'bind':
      return { next: { ...cluster, pods: cluster.pods.map((pod) => (pod.id === event.pod ? { ...pod, node: event.node } : pod)) }, event };
    case 'create':
      return { next: { ...cluster, pods: [...cluster.pods, { id: cluster.nextPod, node: null, ready: false }], nextPod: cluster.nextPod + 1 }, event };
    case 'provision':
      return { next: { ...cluster, nodes: [...cluster.nodes, event.node] }, event };
    case 'ready':
      return { next: { ...cluster, pods: cluster.pods.map((pod) => (pod.id === event.pod ? { ...pod, ready: true } : pod)) }, event };
  }
}

export const setTraffic = (cluster: Cluster, traffic: number): Cluster => ({ ...cluster, traffic });
export const setMaxReplicas = (cluster: Cluster, maxReplicas: number): Cluster => ({ ...cluster, maxReplicas });
export const setWindow = (cluster: Cluster, windowSeconds: number): Cluster => ({ ...cluster, windowSeconds });
export const setAutoscaler = (cluster: Cluster, autoscaler: boolean): Cluster => ({ ...cluster, autoscaler });
