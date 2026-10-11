export type Revision = 1 | 2;
export interface Pod { id: number; revision: Revision; slot: number; ready: boolean }
export interface ReplicaState {
  desired: number;
  revision: Revision;
  targets: [number, number];
  pods: Pod[];
  nextId: number;
  message: string;
  retired: number[];
}

/** Authored fixture: unique selectors, successful admission, maxSurge=1,
 * maxUnavailable=0, immediate termination, and eventual successful readiness.
 * A step is an explanatory event, not one real controller sync iteration.
 */
export function initialState(): ReplicaState {
  return {
    desired: 3, revision: 1, targets: [3, 0], nextId: 4, retired: [],
    pods: [0, 1, 2].map((slot) => ({ id: slot + 1, revision: 1, slot, ready: true })),
    message: 'Converged: RS-v1 owns three Ready Pods. Desired template is app:v1.',
  };
}

export const countOf = (state: ReplicaState, revision: Revision) => state.pods.filter((pod) => pod.revision === revision).length;
export const readyOf = (state: ReplicaState) => state.pods.filter((pod) => pod.ready).length;
export const converged = (state: ReplicaState) =>
  state.pods.length === state.desired && readyOf(state) === state.desired &&
  state.pods.every((pod) => pod.revision === state.revision) &&
  state.targets[state.revision - 1] === state.desired && state.targets[2 - state.revision] === 0;

export function scale(state: ReplicaState, desired: number): ReplicaState {
  if (!converged(state) || !Number.isInteger(desired) || desired < 0 || desired > 4 || desired === state.desired) return state;
  const targets: [number, number] = state.revision === 1 ? [desired, 0] : [0, desired];
  return { ...state, desired, targets, message: `Scale intent: Deployment desired ${desired}; RS-v${state.revision} target ${desired}. Template and revision are unchanged.` };
}

export function deletePod(state: ReplicaState, id: number): ReplicaState {
  if (!converged(state)) return state;
  const pod = state.pods.find((candidate) => candidate.id === id);
  if (!pod) return state;
  return {
    ...state, pods: state.pods.filter((candidate) => candidate.id !== id), retired: [...state.retired, id],
    message: `Deleted fixture UID p${id}. Desired remains ${state.desired}; RS-v${pod.revision} still targets ${state.targets[pod.revision - 1]}. Step to replace, not resurrect.`,
  };
}

export function changeTemplate(state: ReplicaState): ReplicaState {
  if (!converged(state) || state.revision !== 1) return state;
  return { ...state, revision: 2, message: 'Template intent app:v2: Deployment creates RS-v2 at target 0. RS-v1 and its Pods keep app:v1. Step through the rollout.' };
}

export function advance(state: ReplicaState): ReplicaState {
  if (converged(state)) return state;
  // ReplicaSet count reconciliation is distinct from Deployment target changes.
  for (const revision of [1, 2] as const) {
    const owned = state.pods.filter((pod) => pod.revision === revision);
    const target = state.targets[revision - 1];
    if (owned.length > target) {
      const removed = owned[owned.length - 1]!;
      return {
        ...state, pods: state.pods.filter((pod) => pod.id !== removed.id), retired: [...state.retired, removed.id],
        message: `ReplicaSet controller: RS-v${revision} deletes p${removed.id} to reach its target ${target}. No Pod moves between ReplicaSets.`,
      };
    }
    if (owned.length < target) {
      const slot = [0, 1, 2, 3].find((candidate) => !owned.some((pod) => pod.slot === candidate))!;
      const pod: Pod = { id: state.nextId, revision, slot, ready: false };
      return {
        ...state, pods: [...state.pods, pod], nextId: state.nextId + 1,
        message: `ReplicaSet controller: RS-v${revision} creates NEW fixture UID p${pod.id} from app:v${revision}. Created is not yet Ready.`,
      };
    }
  }
  const pending = state.pods.find((pod) => !pod.ready);
  if (pending) return {
    ...state, pods: state.pods.map((pod) => pod.id === pending.id ? { ...pod, ready: true } : pod),
    message: `Fixture readiness event: p${pending.id} is now Ready. Scheduling, kubelet execution and successful probes are assumed, not performed by the ReplicaSet.`,
  };
  if (state.revision === 2) {
    const [oldTarget, newTarget] = state.targets;
    if (oldTarget > 0 && readyOf(state) > state.desired) return {
      ...state, targets: [oldTarget - 1, newTarget],
      message: `Deployment controller: lower RS-v1 target to ${oldTarget - 1}; RS-v2 remains ${newTarget}. Ready capacity permits retiring one old Pod.`,
    };
    if (newTarget < state.desired) return {
      ...state, targets: [oldTarget, newTarget + 1],
      message: `Deployment controller: raise RS-v2 target to ${newTarget + 1}. maxSurge=1 permits one extra Pod; the ReplicaSet creates it on the next step.`,
    };
    // A zero-replica rollout has no Pods to replace.
    if (oldTarget > 0) return { ...state, targets: [0, newTarget], message: 'Deployment controller: scale old RS-v1 to zero.' };
  }
  return state;
}
