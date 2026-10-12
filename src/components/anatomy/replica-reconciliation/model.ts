export type Revision = 1 | 2;
/** Deployment spec fields a step can read or change; the ManifestPanel highlights them. */
export type Field = 'replicas' | 'image' | 'maxSurge' | 'maxUnavailable';
export interface Pod { id: number; revision: Revision; slot: number; ready: boolean }
export interface Change {
  title: string;
  changed: string;
  actor: string;
  reason: string;
  notYet: string;
  reads: Field[];
}
export interface ReplicaState {
  /** Deployment spec.replicas. */
  desired: number;
  /** Active pod template revision: 1 = app:v1, 2 = app:v2. */
  revision: Revision;
  /** spec.replicas of RS-v1 and RS-v2, written by the Deployment controller. */
  targets: [number, number];
  pods: Pod[];
  nextId: number;
  retired: number[];
  /** Pod the learner selected for deletion; null means nothing is selected. */
  selected: number | null;
  /** Pod created by the most recent step; its identity is new. */
  fresh: number | null;
  change: Change;
}
export interface Bed {
  revision: Revision;
  exists: boolean;
  target: number;
  current: number;
  ready: number;
  notReady: number;
}

export const SLOTS = 4;
export const MAX_DESIRED = 4;

/** Authored fixture: unique selectors, successful admission, maxSurge=1,
 * maxUnavailable=0, immediate termination, and eventual successful readiness.
 * A step is an explanatory event, not one real controller sync iteration.
 */
export function initialState(): ReplicaState {
  return {
    desired: 3, revision: 1, targets: [3, 0], nextId: 4, retired: [], selected: null, fresh: null,
    pods: [0, 1, 2].map((slot) => ({ id: slot + 1, revision: 1, slot, ready: true })),
    change: {
      title: 'Converged', changed: 'Deployment desired 3; RS-v1 target 3; three Pods observed, all Ready.',
      actor: 'Authored start state.', reason: 'The Deployment has converged on template app:v1.',
      notYet: 'No rollout has started; RS-v2 does not exist.', reads: [],
    },
  };
}

export const countOf = (state: ReplicaState, revision: Revision) => state.pods.filter((pod) => pod.revision === revision).length;
export const readyOf = (state: ReplicaState) => state.pods.filter((pod) => pod.ready).length;
export const converged = (state: ReplicaState) =>
  state.pods.length === state.desired && readyOf(state) === state.desired &&
  state.pods.every((pod) => pod.revision === state.revision) &&
  state.targets[state.revision - 1] === state.desired && state.targets[2 - state.revision] === 0;

/** Index of a Pod's cartridge in the figure: RS-v1 bed is 0–3, RS-v2 bed is 4–7. */
export const nodeIndex = (pod: Pod) => (pod.revision - 1) * SLOTS + pod.slot;

/** The Pod occupying a slot of one ReplicaSet bed, if any. */
export const podAt = (state: ReplicaState, revision: Revision, slot: number) =>
  state.pods.find((pod) => pod.revision === revision && pod.slot === slot);

/** Per-ReplicaSet counts. Readiness is a Pod condition; these are counts of Pods, not an RS boolean. */
export function bedOf(state: ReplicaState, revision: Revision): Bed {
  const pods = state.pods.filter((pod) => pod.revision === revision);
  const ready = pods.filter((pod) => pod.ready).length;
  return {
    revision,
    exists: revision === 1 || state.revision === 2,
    target: state.targets[revision - 1],
    current: pods.length,
    ready,
    notReady: pods.length - ready,
  };
}

/** Pod the learner has selected, if it still exists. */
export const selectedPod = (state: ReplicaState) => state.pods.find((pod) => pod.id === state.selected);

/** Deployment spec as the figure reads it; highlight marks fields the last step read or changed. */
export function manifestOf(state: ReplicaState): Array<{ text: string; field?: Field }> {
  return [
    { text: 'apiVersion: apps/v1' },
    { text: 'kind: Deployment' },
    { text: 'metadata:' },
    { text: '  name: web' },
    { text: 'spec:' },
    { text: `  replicas: ${state.desired}`, field: 'replicas' },
    { text: '  minReadySeconds: 0' },
    { text: '  selector:' },
    { text: '    matchLabels:' },
    { text: '      app: web' },
    { text: '  strategy:' },
    { text: '    type: RollingUpdate' },
    { text: '    rollingUpdate:' },
    { text: '      maxSurge: 1', field: 'maxSurge' },
    { text: '      maxUnavailable: 0', field: 'maxUnavailable' },
    { text: '  template:' },
    { text: '    metadata:' },
    { text: '      labels:' },
    { text: '        app: web' },
    { text: '    spec:' },
    { text: '      containers:' },
    { text: '        - name: app' },
    { text: `          image: registry.example.com/app:v${state.revision}`, field: 'image' },
  ];
}

/** Selection is UI state: it chooses the Pod Delete acts on and never moves to another Pod. */
export function select(state: ReplicaState, id: number | null): ReplicaState {
  if (id !== null && !state.pods.some((pod) => pod.id === id)) return state;
  const pod = id === null ? undefined : state.pods.find((candidate) => candidate.id === id);
  return {
    ...state, selected: id,
    change: pod
      ? {
        title: `Selected p${pod.id}`,
        changed: `p${pod.id} (RS-v${pod.revision}, slot ${pod.slot + 1}) is marked in the bench and ledger. Nothing in the cluster changed.`,
        actor: 'You, in the fixture UI. Selection is not a Kubernetes request.',
        reason: 'Selection only chooses the Pod that Delete selected Pod will act on.',
        notYet: 'Nothing is deleted until Delete selected Pod is pressed.', reads: [],
      }
      : {
        title: 'No Pod selected',
        changed: 'Selection cleared. Nothing in the cluster changed.',
        actor: 'You, in the fixture UI.', reason: 'Delete needs an explicit selected Pod.',
        notYet: 'Nothing is deleted.', reads: [],
      },
  };
}

export function scale(state: ReplicaState, desired: number): ReplicaState {
  if (!converged(state) || !Number.isInteger(desired) || desired < 0 || desired > MAX_DESIRED || desired === state.desired) return state;
  const targets: [number, number] = state.revision === 1 ? [desired, 0] : [0, desired];
  const active = state.revision;
  return {
    ...state, desired, targets, fresh: null,
    change: {
      title: `Desired replicas ${state.desired} → ${desired}`,
      changed: `Deployment spec.replicas ${state.desired} → ${desired}; RS-v${active} target ${state.targets[active - 1]} → ${desired}. No Pod is created or deleted yet.`,
      actor: 'You edit the Deployment; the Deployment controller copies the count to the active ReplicaSet.',
      reason: `A count change alters capacity, not the template, so the revision stays app:v${active}.`,
      notYet: 'Pods still match the old count. Each Step repairs one difference.', reads: ['replicas'],
    },
  };
}

export function deletePod(state: ReplicaState, id: number): ReplicaState {
  if (!converged(state)) return state;
  const pod = state.pods.find((candidate) => candidate.id === id);
  if (!pod) return state;
  const observed = countOf(state, pod.revision);
  return {
    ...state, pods: state.pods.filter((candidate) => candidate.id !== id), retired: [...state.retired, id],
    selected: state.selected === id ? null : state.selected, fresh: null,
    change: {
      title: `Pod p${id} deleted`,
      changed: `p${id} left RS-v${pod.revision}'s observed set: observed ${observed} → ${observed - 1}. Desired ${state.desired} and template app:v${state.revision} did not change.`,
      actor: 'You, deleting the Pod object directly. This is not a Deployment edit.',
      reason: `RS-v${pod.revision} still targets ${state.targets[pod.revision - 1]}, so the ReplicaSet now has a gap to repair.`,
      notYet: `No replacement exists yet. p${id} is retired and does not come back; the ReplicaSet controller has not acted.`,
      reads: ['replicas'],
    },
  };
}

export function changeTemplate(state: ReplicaState): ReplicaState {
  if (!converged(state) || state.revision !== 1) return state;
  // With desired 0 there is no Pod to replace, so the new bed is converged at once.
  const empty = state.desired === 0;
  return {
    ...state, revision: 2, fresh: null,
    change: {
      title: 'Pod template changed to app:v2',
      changed: empty
        ? 'Deployment template image app:v1 → app:v2. The Deployment creates RS-v2 at target 0. No Pod exists on either bed.'
        : `Deployment template image app:v1 → app:v2. The Deployment creates RS-v2 at target 0. RS-v1 keeps target ${state.targets[0]} and its app:v1 Pods.`,
      actor: 'You edit the Deployment pod template; the Deployment controller acts on it.',
      reason: 'A template change, not a count change, starts a rollout and a new ReplicaSet revision.',
      notYet: empty
        ? 'No Pod is created: desired is 0, so there is nothing to replace. RS-v2 reads 0 / 0 / 0 / 0.'
        : 'RS-v2 has no Pods yet and no old Pod has been removed. The rollout starts on the next Step.',
      reads: ['image'],
    },
  };
}

/** One explanatory step: one owner acts, or a readiness event happens. */
export function advance(state: ReplicaState): ReplicaState {
  if (converged(state)) return state;
  // ReplicaSet count reconciliation is distinct from Deployment target changes.
  for (const revision of [1, 2] as const) {
    const owned = state.pods.filter((pod) => pod.revision === revision);
    const target = state.targets[revision - 1];
    if (owned.length > target) {
      const removed = owned.reduce((highest, pod) => (pod.slot > highest.slot ? pod : highest));
      const rollout = state.revision === 2;
      return {
        ...state, pods: state.pods.filter((pod) => pod.id !== removed.id), retired: [...state.retired, removed.id],
        selected: state.selected === removed.id ? null : state.selected, fresh: null,
        change: {
          title: `RS-v${revision} deleted p${removed.id}`,
          changed: `RS-v${revision} observed ${owned.length} → ${owned.length - 1}; target ${target}. p${removed.id} is retired${state.selected === removed.id ? ' and the selection is cleared' : ''}.`,
          actor: `ReplicaSet controller for RS-v${revision}.`,
          reason: `Observed ${owned.length} is above its target ${target}${rollout ? ', which the Deployment just lowered under maxUnavailable: 0' : ''}. The fixture removes the highest slot.`,
          notYet: `p${removed.id} does not return. No other Pod changed owner.`,
          reads: rollout ? ['maxUnavailable'] : ['replicas'],
        },
      };
    }
    if (owned.length < target) {
      const slot = [0, 1, 2, 3].find((candidate) => !owned.some((pod) => pod.slot === candidate))!;
      const pod: Pod = { id: state.nextId, revision, slot, ready: false };
      const retired = state.retired.length ? ` Retired identities (${state.retired.map((id) => `p${id}`).join(', ')}) do not come back.` : '';
      return {
        ...state, pods: [...state.pods, pod], nextId: state.nextId + 1, fresh: pod.id,
        change: {
          title: `RS-v${revision} created p${pod.id}`,
          changed: `p${pod.id} is a new Pod in slot ${slot + 1} of RS-v${revision} (observed ${owned.length} → ${owned.length + 1}). It is Created, not Ready.${retired}`,
          actor: `ReplicaSet controller for RS-v${revision}, using its own template app:v${revision}.`,
          reason: `Observed ${owned.length} is below RS-v${revision} target ${target}.`,
          notYet: `p${pod.id} is not scheduled, started or Ready yet. The next Step records readiness.`,
          reads: revision === 2 ? ['image'] : ['replicas'],
        },
      };
    }
  }
  const pending = state.pods.find((pod) => !pod.ready);
  if (pending) return {
    ...state, fresh: null,
    pods: state.pods.map((pod) => (pod.id === pending.id ? { ...pod, ready: true } : pod)),
    change: {
      title: `p${pending.id} became Ready`,
      changed: `p${pending.id}'s Ready condition is true. Ready ${readyOf(state)} → ${readyOf(state) + 1} of desired ${state.desired}.`,
      actor: 'Assumed readiness event (kubelet, container runtime and probes). The ReplicaSet counts it but does not set it.',
      reason: 'Readiness is a Pod condition. The ReplicaSet and Deployment see only the count.',
      notYet: 'Ready proves the condition only: not Service endpoints, routing, or correct application responses.',
      reads: ['replicas'],
    },
  };
  if (state.revision === 2) {
    const [oldTarget, newTarget] = state.targets;
    if (oldTarget > 0 && readyOf(state) > state.desired) return {
      ...state, targets: [oldTarget - 1, newTarget], fresh: null,
      change: {
        title: `Deployment lowers RS-v1 target to ${oldTarget - 1}`,
        changed: `RS-v1 target ${oldTarget} → ${oldTarget - 1}. Ready would be ${readyOf(state) - 1} after its Pod goes, still at least desired ${state.desired}.`,
        actor: 'Deployment controller, during the rolling update.',
        reason: `maxUnavailable: 0 keeps available Pods at or above desired ${state.desired}. Ready ${readyOf(state)} is above it, so one old Pod can go.`,
        notYet: 'RS-v1 has not deleted its Pod yet; the ReplicaSet does that on the next Step.',
        reads: ['maxUnavailable'],
      },
    };
    if (newTarget < state.desired) return {
      ...state, targets: [oldTarget, newTarget + 1], fresh: null,
      change: {
        title: `Deployment raises RS-v2 target to ${newTarget + 1}`,
        changed: `RS-v2 target ${newTarget} → ${newTarget + 1}. Pods across both ReplicaSets may total ${oldTarget + newTarget + 1}, within desired ${state.desired} + maxSurge 1 = ${state.desired + 1}.`,
        actor: 'Deployment controller, during the rolling update.',
        reason: 'maxSurge: 1 allows one Pod above desired, so the new ReplicaSet can grow before old Pods are removed.',
        notYet: 'No RS-v2 Pod exists yet. The ReplicaSet creates it on the next Step.',
        reads: ['maxSurge'],
      },
    };
  }
  return state;
}
