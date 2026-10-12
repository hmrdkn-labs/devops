import type { Change } from '../shared/ChangeReport';
import { utilizationOf, type Cluster, type ClusterEvent, type Decision } from './model';

const percent = (value: number | null) => (value === null ? 'undefined (no CPU request)' : `${Math.round(value)}%`);
const requestText = (request: number | null) => (request === null ? 'none' : `${request}m`);
const pendingIn = (cluster: Cluster) => cluster.pods.filter((pod) => pod.node === null).length;

export const startReport: Change = {
  title: 'Two Ready Pods, HPA recorded no-change',
  changed: 'Nothing has changed yet. spec.replicas is 2.',
  actor: 'Fixture start state',
  reason: 'Live utilization is 50%, equal to the target, so the HPA has no reason to scale.',
  notYet: 'Change an input, then run an HPA sync or a controller step. No HPA decision is pending.',
};

export const runStartReport: Change = {
  title: 'Running controller steps',
  changed: 'Controllers act one step at a time until none is due. The HPA does not run between steps.',
  actor: 'ReplicaSet controller, kube-scheduler, kubelet and Cluster Autoscaler',
  reason: 'Fixture order: delete extra Pods, assign Pending Pods, create missing Pods, provision a node, then mark starting Pods Ready.',
  notYet: 'The HPA has not measured the new state yet.',
};

export function nothingDueReport(cluster: Cluster): Change {
  return {
    title: 'No controller step is due',
    changed: 'Nothing changed.',
    actor: 'Controllers',
    reason: `${cluster.pods.length} Pods exist for spec.replicas ${cluster.replicas}; ${pendingIn(cluster)} Pending. No step applies.`,
    notYet: pendingIn(cluster) > 0 ? 'Pending Pods wait: no node has room and Cluster Autoscaler is off or at its limit.' : 'Every Pod is placed and Ready.',
  };
}

/** One controller step of a bounded run, with the state it was decided from. */
export interface RunStep { event: ClusterEvent; before: Cluster }

const podNames = (ids: number[]) => ids.map((id) => `web-${id}`).join(', ');

interface RunGroup { kind: ClusterEvent['kind']; node: number | null; ids: number[]; before: Cluster }

/** Consecutive steps of the same kind (and node, for bind and provision) form one group, in run order. */
function groupRun(steps: RunStep[]): RunGroup[] {
  const groups: RunGroup[] = [];
  for (const { event, before } of steps) {
    const node = event.kind === 'bind' || event.kind === 'provision' || event.kind === 'delete' ? event.node : null;
    const pod = 'pod' in event ? event.pod : null;
    const last = groups[groups.length - 1];
    if (last && last.kind === event.kind && last.node === node) {
      if (pod !== null) last.ids.push(pod);
    } else {
      groups.push({ kind: event.kind, node, ids: pod === null ? [] : [pod], before });
    }
  }
  return groups;
}

function describeGroup(group: RunGroup): { actor: string; text: string; reason: string } {
  const names = podNames(group.ids);
  const pending = podNames(group.before.pods.filter((pod) => pod.node === null).map((pod) => pod.id));
  switch (group.kind) {
    case 'create':
      return {
        actor: 'ReplicaSet controller',
        text: `ReplicaSet created ${names}`,
        reason: `spec.replicas was ${group.before.replicas} and only ${group.before.pods.length} Pods existed`,
      };
    case 'bind':
      return {
        actor: 'kube-scheduler',
        text: `kube-scheduler bound ${names} to node-${group.node}`,
        reason: `node-${group.node} had room for the request and the fewest web Pods among candidates`,
      };
    case 'provision':
      return {
        actor: 'Cluster Autoscaler',
        text: `Cluster Autoscaler provisioned node-${group.node}`,
        reason: `kube-scheduler found no node with room for Pending ${pending}`,
      };
    case 'ready':
      return {
        actor: 'kubelet',
        text: `kubelet marked ${names} Ready`,
        reason: 'their containers started and the readiness check passed',
      };
    case 'delete':
      return {
        actor: 'ReplicaSet controller',
        text: `ReplicaSet removed ${names}`,
        reason: `${group.before.pods.length} Pods existed for spec.replicas ${group.before.replicas}`,
      };
  }
}

/** Aggregated, truthful account of one bounded run: what happened, who did it, why, and what is still open. */
export function runSummaryReport(steps: RunStep[], after: Cluster, capped: boolean): Change {
  const groups = groupRun(steps).map(describeGroup);
  const pendingIds = after.pods.filter((pod) => pod.node === null).map((pod) => pod.id);
  const count = steps.length;
  const notYet = capped
    ? 'More controller work is due. Press Run controllers to quiet to continue.'
    : pendingIds.length > 0
      ? `${podNames(pendingIds)} still Pending: no node has room, and Cluster Autoscaler is off or has no node left to add.`
      : 'Nothing is due. The HPA measures again only at its next sync.';
  return {
    title: capped ? `Stopped at the step limit after ${count} steps` : `Controllers are quiet after ${count} step${count === 1 ? '' : 's'}`,
    changed: groups.map((group) => group.text).join(' · '),
    actor: [...new Set(groups.map((group) => group.actor))].join(', '),
    reason: groups.map((group) => group.reason).join('; ') + (capped ? '; one run is limited in length so the motion stays bounded' : ''),
    notYet,
  };
}

export function inputReport(
  input: 'traffic' | 'request' | 'maxReplicas' | 'window' | 'autoscaler',
  before: Cluster,
  after: Cluster,
): Change {
  const now = percent(utilizationOf(after));
  const notYetSync = `No HPA sync has run, so spec.replicas stays ${after.replicas}.`;
  switch (input) {
    case 'traffic':
      return {
        title: `Load ${before.traffic}m → ${after.traffic}m`,
        changed: `Total web CPU use changed; live utilization is now ${now}.`,
        actor: 'Traffic outside the cluster',
        reason: 'metrics-server reports usage. The HPA reads it only at its next 15 s sync.',
        notYet: notYetSync,
      };
    case 'request':
      return {
        title: `CPU request ${requestText(before.request)} → ${requestText(after.request)}`,
        changed: `Utilization is usage ÷ request; live utilization is now ${now}.`,
        actor: 'Pod template author (Deployment spec)',
        reason: after.request === null
          ? 'With no CPU request the HPA has no CPU utilization and takes no CPU action.'
          : 'The same usage is a larger or smaller share of the request, which moves the ratio.',
        notYet: `${notYetSync} Fixture: the request applies to existing Pods at once; a real template edit rolls out new Pods.`,
      };
    case 'maxReplicas':
      return {
        title: `HPA maxReplicas ${before.maxReplicas} → ${after.maxReplicas}`,
        changed: 'The upper bound on the HPA object changed.',
        actor: 'HPA object author (kubectl apply)',
        reason: 'The bound clamps the next recommendation, at the next sync.',
        notYet: notYetSync,
      };
    case 'window':
      return {
        title: `Scale-down window ${before.windowSeconds} s → ${after.windowSeconds} s`,
        changed: 'Scale-down will use the highest recommendation seen inside the new window.',
        actor: 'HPA object author (stabilizationWindowSeconds)',
        reason: 'Only scale-down is damped; scale-up applies at once.',
        notYet: `${notYetSync} Only a later scale-down is affected.`,
      };
    case 'autoscaler':
      return {
        title: `Cluster Autoscaler ${after.autoscaler ? 'on' : 'off'}`,
        changed: after.autoscaler ? 'It may now add a node for a Pending Pod.' : 'It will not add nodes for Pending Pods.',
        actor: 'Cluster Autoscaler, a separate controller from the HPA',
        reason: 'It acts only on Pods the scheduler cannot place.',
        notYet: pendingIn(after) === 0
          ? 'No Pending Pod exists, so nothing is provisioned.'
          : `${pendingIn(after)} Pending Pod${pendingIn(after) === 1 ? '' : 's'} now wait for a node.`,
      };
  }
}

export function syncReport(before: Cluster, result: { next: Cluster; decision: Decision } | null): Change {
  if (!result) {
    return {
      title: 'HPA did not sync',
      changed: 'Nothing. Recorded status and spec.replicas are unchanged.',
      actor: 'HPA controller',
      reason: `Fixture rule: it syncs only when every requested Pod exists (${before.pods.length} of ${before.replicas}).`,
      notYet: 'Pods still being created are not measured yet.',
    };
  }
  const { decision: d, next } = result;
  const from = before.replicas;
  const to = next.replicas;
  const factored = d.factoredRatio === null ? 'n/a' : d.factoredRatio.toFixed(2);
  const windowMax = Math.max(...d.window);
  switch (d.status) {
    case 'no-metric':
      return {
        title: 'No CPU decision',
        changed: `Nothing. spec.replicas stays ${to}.`,
        actor: 'HPA controller',
        reason: 'The container has no CPU request, so there is no CPU utilization to compare with the target.',
        notYet: 'Scaling on CPU needs a request, or another metric.',
      };
    case 'no-change':
      return {
        title: `No change at ${to}`,
        changed: 'Nothing. Recorded status: no-change.',
        actor: 'HPA controller',
        reason: `Ratio ${factored} is inside the ±10% tolerance (or the set-aside Pods reverse the direction).`,
        notYet: 'The next sync measures again.',
      };
    case 'held':
      return {
        title: `Scale-down held at ${to}`,
        changed: `Nothing. spec.replicas stays ${to}; recommendation ${d.recommendation} is lower.`,
        actor: 'HPA controller, through its stabilization window',
        reason: `The window still holds ${windowMax}, the highest recent recommendation.`,
        notYet: 'The window must fill with lower recommendations before spec.replicas drops.',
      };
    case 'scale-up':
      return {
        title: `Scaled up ${from} → ${to}`,
        changed: `spec.replicas ${from} → ${to}.`,
        actor: 'HPA controller, writing the Deployment scale subresource',
        reason: `ceil(${from} × ${factored}) = ${d.raw}${d.recommendation < (d.raw ?? 0) ? `, clamped to maxReplicas ${next.maxReplicas}` : ''}.`,
        notYet: 'No Pod is created yet. The ReplicaSet creates them on later steps; each is unassigned, then assigned, then Ready.',
      };
    case 'scale-down':
      return {
        title: `Scaled down ${from} → ${to}`,
        changed: `spec.replicas ${from} → ${to}.`,
        actor: 'HPA controller, after its stabilization window',
        reason: `The highest recommendation in the window is ${windowMax}, bounded by maxReplicas ${next.maxReplicas}.`,
        notYet: 'Pods are removed at once in this fixture; real Pods get a termination grace period first.',
      };
  }
}

export function eventReport(event: ClusterEvent, before: Cluster): Change {
  switch (event.kind) {
    case 'create':
      return {
        title: `web-${event.pod} created`,
        changed: 'A new Pod with no node and not Ready.',
        actor: 'ReplicaSet controller',
        reason: `spec.replicas is ${before.replicas} and ${before.pods.length} Pods exist.`,
        notYet: 'Not assigned to a node and not Ready.',
      };
    case 'bind':
      return {
        title: `web-${event.pod} assigned to node-${event.node}`,
        changed: `Node assignment recorded for web-${event.pod}.`,
        actor: 'kube-scheduler',
        reason: `node-${event.node} has room for the request and the fewest web Pods among candidates (fixture scoring).`,
        notYet: 'Assigned is not Ready: containers must start and pass readiness.',
      };
    case 'ready': {
      const pod = before.pods.find((candidate) => candidate.id === event.pod);
      return {
        title: `web-${event.pod} Ready`,
        changed: 'Readiness passed; its lamp is on.',
        actor: `kubelet on node-${pod?.node ?? '?'}`,
        reason: 'Its containers started and the readiness check passed.',
        notYet: 'Other Pods may still be starting.',
      };
    }
    case 'provision':
      return {
        title: `node-${event.node} provisioned`,
        changed: 'A new node joined the cluster with no Pods yet.',
        actor: 'Cluster Autoscaler, a separate controller',
        reason: 'A Pending Pod has no existing node with room for it.',
        notYet: 'No Pod is bound to it yet; the scheduler does that on a later step. spec.replicas is unchanged.',
      };
    case 'delete':
      return {
        title: `web-${event.pod} removed`,
        changed: event.pending ? 'A Pending Pod was removed.' : `Pod removed from node-${event.node}.`,
        actor: 'ReplicaSet controller',
        reason: `${before.pods.length} Pods exist but spec.replicas is ${before.replicas}. Victims: Pending first, then the busier node, then the newest.`,
        notYet: 'Removed at once in this fixture; real Pods get a termination grace period first.',
      };
  }
}
