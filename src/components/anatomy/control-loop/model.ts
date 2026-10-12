/** Spec fields a step can read or change; the ManifestPanel highlights them. */
export type Field = 'replicas' | 'generation' | 'observedGeneration' | 'statusReplicas' | 'statusReady';

export interface Pod {
  /** Creation sequence. The name derives from it; names are not reused until Reset / replay. */
  id: number;
  name: string;
  /** Pod condition Ready. The node side writes it; the controller only counts it. */
  ready: boolean;
  /** Fixture slot: the tray position in the API and, once Ready, the node socket. */
  slot: number;
}

/** Status the controller last wrote. It is a report and may lag the live Pods. */
export interface Status {
  observedGeneration: number;
  replicas: number;
  readyReplicas: number;
}

export interface Change {
  title: string;
  changed: string;
  actor: string;
  reason: string;
  notYet: string;
  reads: Field[];
}

export interface LoopState {
  /** spec.replicas */
  desired: number;
  /** metadata.generation: advances on every spec edit in this fixture. */
  generation: number;
  status: Status;
  /** Pod objects in the API, ordered by creation. Created and Ready alike. */
  pods: Pod[];
  nextId: number;
  retired: string[];
  /** Watch notifications that woke the controller and no pass has drained yet. */
  hints: number;
  /** Kind of write the most recent pass sent to the API. */
  lastRequest: 'none' | 'create' | 'delete' | 'status';
  change: Change;
}

export const MAX_DESIRED = 4;
export const SLOTS = 4;

/** Fixture names: a bijection from creation sequence to five base-36 characters, so names never repeat within a run. */
const NAME_SPACE = 36 ** 5;
export const podName = (id: number) => `web-${((id * 2654435761) % NAME_SPACE).toString(36).padStart(5, '0')}`;

/** Authored fixture: unique selectors, successful admission, immediate teardown on delete, and one write per pass. */
export function initialState(): LoopState {
  return {
    desired: 3,
    generation: 1,
    status: { observedGeneration: 1, replicas: 3, readyReplicas: 3 },
    pods: [1, 2, 3].map((id, slot) => ({ id, name: podName(id), ready: true, slot })),
    nextId: 4,
    retired: [],
    hints: 0,
    lastRequest: 'none',
    change: {
      title: 'Converged',
      changed: 'spec.replicas 3. Three Pods observed, all Ready. Stored status matches.',
      actor: 'Authored start state.',
      reason: 'Observed equals desired, and the stored status agrees.',
      notYet: 'Nothing is pending. The loop acts after an edit, a Pod change or a pass.',
      reads: [],
    },
  };
}

export const readyOf = (state: LoopState) => state.pods.filter((pod) => pod.ready).length;
export const countMatches = (state: LoopState) => state.pods.length === state.desired;
export const readyMatches = (state: LoopState) => readyOf(state) === state.desired;
export const statusCurrent = (state: LoopState) =>
  state.status.observedGeneration === state.generation &&
  state.status.replicas === state.pods.length &&
  state.status.readyReplicas === readyOf(state);
export const converged = (state: LoopState) => countMatches(state) && readyMatches(state) && statusCurrent(state);

/** Beam tilt: positive when desired exceeds observed, so the desired pan sinks. Clamped for the drawing. */
export const tiltOf = (state: LoopState) => Math.max(-2, Math.min(2, state.desired - state.pods.length));

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** A spec edit records intent: it bumps the generation and creates or deletes nothing itself. */
export function editReplicas(state: LoopState, desired: number): LoopState {
  if (!Number.isInteger(desired) || desired < 0 || desired > MAX_DESIRED || desired === state.desired) return state;
  const observed = state.pods.length;
  const pending = observed === desired
    ? `Pod count already matches ${desired}; the next pass only updates status.`
    : `Nothing reconciles until a pass compares ${desired} with ${observed}.`;
  return {
    ...state,
    desired,
    generation: state.generation + 1,
    hints: state.hints + 1,
    change: {
      title: `Desired replicas ${state.desired} → ${desired}`,
      changed: `spec.replicas ${state.desired} → ${desired}; generation ${state.generation} → ${state.generation + 1}. Pods and stored status unchanged.`,
      actor: 'You, through the API. The controller has not acted.',
      reason: 'A spec edit records intent. It creates or deletes nothing.',
      notYet: pending,
      reads: ['replicas', 'generation'],
    },
  };
}

/**
 * One controller pass. It reads the current spec and Pod objects (not a replay of hints), then makes at most
 * one Pod write or one status write. Create and delete change Pod objects; status only reports.
 */
export function pass(state: LoopState): LoopState {
  const drained = state.hints;
  const woke = drained > 0 ? `Woken by ${plural(drained, 'pending hint')}` : 'No hint pending';
  const observed = state.pods.length;
  const unobserved = state.generation - state.status.observedGeneration;
  const coalesced = unobserved > 1
    ? ` ${plural(unobserved, 'spec edit')} since the last status write are read as one desired value ${state.desired}.`
    : '';
  const base: LoopState = { ...state, hints: 0 };

  if (observed < state.desired) {
    const slot = [0, 1, 2, 3].find((candidate) => !state.pods.some((pod) => pod.slot === candidate));
    if (slot === undefined) return state;
    const pod: Pod = { id: state.nextId, name: podName(state.nextId), ready: false, slot };
    return {
      ...base,
      pods: [...state.pods, pod],
      nextId: state.nextId + 1,
      lastRequest: 'create',
      change: {
        title: `Created Pod ${pod.name}`,
        changed: `${pod.name} exists as Created, not Ready. Observed ${observed} → ${observed + 1}; spec unchanged.`,
        actor: 'ReplicaSet controller: one create request to the API.',
        reason: `${woke}. Observed ${observed} is below desired ${state.desired}.${coalesced}`,
        notYet: `Not Ready; no node has reported it running. Stored status still reads replicas ${state.status.replicas}.`,
        reads: ['replicas'],
      },
    };
  }

  if (observed > state.desired) {
    const notReady = state.pods.filter((pod) => !pod.ready);
    const pool = notReady.length ? notReady : state.pods;
    const victim = pool.reduce((newest, pod) => (pod.id > newest.id ? pod : newest));
    const after = observed - 1;
    const another = after > state.desired ? `Observed ${after} is still above desired ${state.desired}: another pass is needed. ` : '';
    return {
      ...base,
      pods: state.pods.filter((pod) => pod.id !== victim.id),
      retired: [...state.retired, victim.name],
      lastRequest: 'delete',
      change: {
        title: `Deleted Pod ${victim.name}`,
        changed: `${victim.name} removed. Observed ${observed} → ${after}; spec unchanged.${victim.ready ? ' Its container on node-b stops.' : ''}`,
        actor: 'ReplicaSet controller: one delete request to the API.',
        reason: `${woke}. Observed ${observed} is above desired ${state.desired}; ${notReady.length ? 'Not-Ready Pods go first' : 'all Pods are Ready, so the newest goes'}.${coalesced}`,
        notYet: `${another}${victim.name} does not return until Reset / replay.`,
        reads: ['replicas'],
      },
    };
  }

  if (!statusCurrent(state)) {
    const next: Status = { observedGeneration: state.generation, replicas: observed, readyReplicas: readyOf(state) };
    const reads: Field[] = [];
    if (next.observedGeneration !== state.status.observedGeneration) reads.push('observedGeneration');
    if (next.replicas !== state.status.replicas) reads.push('statusReplicas');
    if (next.readyReplicas !== state.status.readyReplicas) reads.push('statusReady');
    return {
      ...base,
      status: next,
      lastRequest: 'status',
      change: {
        title: `Wrote status for generation ${state.generation}`,
        changed: `observedGeneration ${state.status.observedGeneration} → ${next.observedGeneration}; replicas ${state.status.replicas} → ${next.replicas}; readyReplicas ${state.status.readyReplicas} → ${next.readyReplicas}.`,
        actor: 'ReplicaSet controller, writing the status it reports.',
        reason: 'Stored status differed from the counts it just observed. Status reports; it decides nothing.',
        notYet: 'No Pod changed. Live Pods can change before the next read.',
        reads,
      },
    };
  }

  const waiting = readyOf(state) === state.desired
    ? 'Nothing pending.'
    : `${readyOf(state)} of ${state.desired} desired Pods are Ready. The controller cannot set Ready; it waits for the node side.`;
  return {
    ...base,
    lastRequest: 'none',
    change: {
      title: 'Pass wrote nothing',
      changed: `No Pod or status field changed. Observed ${observed} = desired ${state.desired}; stored status matches.`,
      actor: 'ReplicaSet controller, comparing current values.',
      reason: `${woke}. The same inputs give the same result.`,
      notYet: waiting,
      reads: [],
    },
  };
}

/** Node side: the oldest Pod that is not Ready runs its container and reports Ready through the API. */
export function reportReady(state: LoopState): LoopState {
  const waiting = state.pods.filter((pod) => !pod.ready);
  if (!waiting.length) return state;
  const pod = waiting.reduce((oldest, candidate) => (candidate.id < oldest.id ? candidate : oldest));
  const before = readyOf(state);
  return {
    ...state,
    pods: state.pods.map((candidate) => (candidate.id === pod.id ? { ...candidate, ready: true } : candidate)),
    hints: state.hints + 1,
    change: {
      title: `${pod.name} reported Ready`,
      changed: `Ready condition true; container seated in node socket ${pod.slot + 1}. Ready ${before} → ${before + 1} of desired ${state.desired}.`,
      actor: 'Node side on node-b: kubelet reports Ready (scheduler binding folded in).',
      reason: 'Readiness is a Pod condition. The ReplicaSet counts it; it never sets it.',
      notYet: `Not Service routing or a correct response. Stored readyReplicas (${state.status.readyReplicas}) changes at the next status write.`,
      reads: [],
    },
  };
}

/** Drift: any actor deletes a Pod object. The controller has not acted yet. */
export function deletePodObject(state: LoopState, id: number): LoopState {
  const pod = state.pods.find((candidate) => candidate.id === id);
  if (!pod) return state;
  const observed = state.pods.length;
  const after = observed - 1;
  const short = after < state.desired;
  return {
    ...state,
    pods: state.pods.filter((candidate) => candidate.id !== id),
    retired: [...state.retired, pod.name],
    hints: state.hints + 1,
    change: {
      title: `Deleted Pod ${pod.name} outside the controller`,
      changed: `Pod removed. Observed ${observed} → ${after}; spec and generation unchanged.${pod.ready ? ' Its container stops.' : ''}`,
      actor: 'You, deleting a Pod object. An eviction has the same effect.',
      reason: short
        ? `Spec asks for ${state.desired}; observed ${after} is one short. The next pass repairs it.`
        : `Spec asks for ${state.desired}; observed ${after} still meets it.`,
      notYet: `${short ? 'No replacement yet. ' : ''}${pod.name} does not return until Reset / replay. Stored status still reads replicas ${state.status.replicas}.`,
      reads: [],
    },
  };
}

/** Simulates lost or merged notifications. Convergence must not depend on them. */
export function dropHints(state: LoopState): LoopState {
  if (state.hints === 0) return state;
  return {
    ...state,
    hints: 0,
    change: {
      title: `Dropped ${plural(state.hints, 'pending hint')}`,
      changed: 'Hints cleared. Spec, Pods and stored status unchanged.',
      actor: 'You, simulating lost or merged notifications.',
      reason: 'A hint only says something may have changed. A pass reads spec and Pods directly, so it needs no hint to converge.',
      notYet: 'Nothing reconciled yet. Run a pass to see whether work is left.',
      reads: [],
    },
  };
}

/** The spec and status fields as the ReplicaSet object reads back. Highlights mark what the last step read or changed. */
export function manifestOf(state: LoopState): Array<{ text: string; field?: Field }> {
  return [
    { text: 'apiVersion: apps/v1' },
    { text: 'kind: ReplicaSet' },
    { text: 'metadata:' },
    { text: '  name: web' },
    { text: `  generation: ${state.generation}`, field: 'generation' },
    { text: 'spec:' },
    { text: `  replicas: ${state.desired}`, field: 'replicas' },
    { text: '  selector:' },
    { text: '    matchLabels:' },
    { text: '      app: web' },
    { text: '  template:' },
    { text: '    metadata:' },
    { text: '      labels:' },
    { text: '        app: web' },
    { text: '    spec:' },
    { text: '      containers:' },
    { text: '        - name: app' },
    { text: '          image: registry.example.com/app:v1' },
    { text: 'status:' },
    { text: `  observedGeneration: ${state.status.observedGeneration}`, field: 'observedGeneration' },
    { text: `  replicas: ${state.status.replicas}`, field: 'statusReplicas' },
    { text: `  readyReplicas: ${state.status.readyReplicas}`, field: 'statusReady' },
  ];
}
