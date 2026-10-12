/** Which release object the bench is showing. Each strategy names its two lanes differently. */
export type Strategy = 'rolling' | 'blueGreen' | 'canary';
/** What the app:v2 build does once it runs. */
export type Defect = 'healthy' | 'notReady' | 'silentErrors';
/** Which lanes the Service selector matches: both, or one version label. */
export type Route = 'both' | 'old' | 'new';
/** Lane 0 runs app:v1 (RS-v1, blue, stable). Lane 1 runs app:v2 (RS-v2, green, canary). */
export type Lane = 0 | 1;
/** Deployment or Service fields a step can read or change; the ManifestPanel highlights them. */
export type Field = 'image' | 'replicas' | 'maxSurge' | 'maxUnavailable' | 'progressDeadlineSeconds' | 'selector';

export interface Pod { id: number; lane: Lane; slot: number; ready: boolean }
export interface LaneState {
  /** spec.replicas of the lane's ReplicaSet or Deployment. */
  target: number;
  /** Whether the lane's ReplicaSet or Deployment exists (rolling keeps RS-v1 even at target 0). */
  present: boolean;
  /** Rolling only: the revision annotation of the lane's ReplicaSet. */
  revision: number | null;
}
export interface Change {
  title: string;
  changed: string;
  actor: string;
  reason: string;
  notYet: string;
  reads: Field[];
  /** True when the last Step could not move anything and the controllers wait. */
  waiting?: boolean;
}
export interface ReleaseState {
  strategy: Strategy;
  defect: Defect;
  /** Set once a v2 object is created or targeted. The build behaviour is fixed from then on. */
  started: boolean;
  /** Rolling only: the lane whose template the Deployment now wants. */
  template: Lane;
  /** Rolling only: the Deployment revision counter. Each activated ReplicaSet takes the next number. */
  revisions: number;
  lanes: [LaneState, LaneState];
  route: Route;
  pods: Pod[];
  nextId: number;
  retired: number[];
  /** Rolling only: fixture seconds since the last progress event, compared with progressDeadlineSeconds. */
  sinceProgress: number;
  /** Pod created by the most recent step; its identity is new. */
  fresh: number | null;
  change: Change;
}
export interface ManifestField { text: string; field?: Field }
export type RolloutStatus = 'complete' | 'progressing' | 'stalled' | 'none';

/** Fixture Deployment settings: replicas 3, maxSurge 1, maxUnavailable 0, progressDeadlineSeconds 600. */
export const DESIRED = 3;
export const SURGE = 1;
export const DEADLINE = 600;
export const SLOTS = 4;
export const CANARY_MAX = 3;

export const laneNames: Record<Strategy, [string, string]> = {
  rolling: ['RS-v1', 'RS-v2'],
  blueGreen: ['Deployment web-blue', 'Deployment web-green'],
  canary: ['Deployment web-stable', 'Deployment web-canary'],
};
export const strategyLabel: Record<Strategy, string> = {
  rolling: 'Rolling update (one Deployment)',
  blueGreen: 'Blue-green (Service switch)',
  canary: 'Canary (two Deployments)',
};
export const defectLabel: Record<Defect, string> = {
  healthy: 'Healthy',
  notReady: 'Fails readiness',
  silentErrors: 'Ready but returns errors',
};

const startChange: Record<Strategy, Change> = {
  rolling: {
    title: 'Converged on app:v1',
    changed: 'Deployment web: template app:v1, RS-v1 revision 1, target 3, 3 Ready Pods.',
    actor: 'Authored start state.',
    reason: 'The rollout is complete and one template is active.',
    notYet: 'No RS-v2 exists; the Service sends requests only to RS-v1 Pods.',
    reads: [],
  },
  blueGreen: {
    title: 'Blue serves all traffic',
    changed: 'web-blue: 3 Ready Pods of app:v1, matched by version=blue. No green object.',
    actor: 'Authored start state.',
    reason: 'A Service sends requests only to Ready Pods that match its selector.',
    notYet: 'Green is not deployed; nothing is switched.',
    reads: [],
  },
  canary: {
    title: 'Stable serves all traffic',
    changed: 'web-stable: 3 Ready Pods of app:v1. web-canary has target 0.',
    actor: 'Authored start state.',
    reason: 'A canary is a second Deployment with no Pods until its replicas are set.',
    notYet: 'No canary Pod exists; 0% of requests reach app:v2.',
    reads: [],
  },
};

export function initialState(strategy: Strategy = 'rolling', defect: Defect = 'healthy'): ReleaseState {
  const rolling = strategy === 'rolling';
  return {
    strategy,
    defect,
    started: false,
    template: 0,
    revisions: rolling ? 1 : 0,
    lanes: [
      { target: DESIRED, present: true, revision: rolling ? 1 : null },
      { target: 0, present: false, revision: null },
    ],
    route: strategy === 'blueGreen' ? 'old' : 'both',
    pods: [0, 1, 2].map((slot) => ({ id: slot + 1, lane: 0, slot, ready: true })),
    nextId: 4,
    retired: [],
    sinceProgress: 0,
    fresh: null,
    change: startChange[strategy],
  };
}

const other = (lane: Lane): Lane => (lane === 0 ? 1 : 0);
const withLane = (lanes: [LaneState, LaneState], lane: Lane, patch: Partial<LaneState>): [LaneState, LaneState] =>
  lane === 0 ? [{ ...lanes[0], ...patch }, lanes[1]] : [lanes[0], { ...lanes[1], ...patch }];
const withChange = (state: ReleaseState, change: Change): ReleaseState => ({ ...state, change });
const pct = (share: number) => `${Math.round(share * 100)}%`;

export const observedOf = (state: ReleaseState, lane: Lane) => state.pods.filter((pod) => pod.lane === lane).length;
export const readyOf = (state: ReleaseState, lane?: Lane) =>
  state.pods.filter((pod) => pod.ready && (lane === undefined || pod.lane === lane)).length;
export const routedTo = (route: Route, lane: Lane) => route === 'both' || (route === 'old' ? lane === 0 : lane === 1);
/** Ready Pods that match the Service selector: the only Pods that receive requests. */
export function endpointsOf(state: ReleaseState) {
  return state.pods.filter((pod) => pod.ready && routedTo(state.route, pod.lane));
}
/** Fixture assumption: requests spread equally over endpoints. Real kube-proxy balancing is approximate. */
export function trafficOf(state: ReleaseState) {
  const endpoints = endpointsOf(state);
  const fromNew = endpoints.filter((pod) => pod.lane === 1).length;
  const newShare = endpoints.length === 0 ? 0 : fromNew / endpoints.length;
  return { endpoints: endpoints.length, newShare, failShare: state.defect === 'silentErrors' ? newShare : 0 };
}
export const servesOf = (state: ReleaseState, lane: Lane) => {
  const endpoints = endpointsOf(state);
  return endpoints.length === 0 ? 0 : endpoints.filter((pod) => pod.lane === lane).length / endpoints.length;
};
/** A v1 Pod always becomes Ready. A v2 Pod does unless the build fails readiness. */
export const canBecomeReady = (state: ReleaseState, pod: Pod) => pod.lane === 0 || state.defect !== 'notReady';
/** A Pod is failing when it serves requests from a build that returns errors. */
export const failingPod = (state: ReleaseState, pod: Pod) =>
  state.defect === 'silentErrors' && pod.lane === 1 && pod.ready && routedTo(state.route, 1);

/** Short traffic line for reports where requests change. Full tiles are in the status panel. */
function shareLine(state: ReleaseState) {
  const traffic = trafficOf(state);
  if (traffic.endpoints === 0) return 'No Ready endpoints: requests fail.';
  const failing = traffic.failShare > 0 ? `, ${pct(traffic.failShare)} failing` : '';
  return `app:v2 share ${pct(traffic.newShare)} of ${traffic.endpoints} endpoints${failing}.`;
}

const freeSlot = (state: ReleaseState, lane: Lane) => {
  for (let slot = 0; slot < SLOTS; slot++) if (!state.pods.some((pod) => pod.lane === lane && pod.slot === slot)) return slot;
  throw new Error(`No free slot in lane ${lane}`);
};

/** All objects of the bench match their targets and every Pod is Ready. Rolling also needs the old lane drained. */
export function settled(state: ReleaseState) {
  const matches = state.lanes.every((lane, index) => observedOf(state, index as Lane) === lane.target);
  const ready = state.pods.every((pod) => pod.ready);
  const drained = state.strategy !== 'rolling' ||
    (state.lanes[state.template].target === DESIRED && state.lanes[other(state.template)].target === 0);
  return matches && ready && drained;
}

export function rolloutStatus(state: ReleaseState): RolloutStatus {
  if (state.strategy !== 'rolling') return 'none';
  if (settled(state)) return 'complete';
  return state.sinceProgress >= DEADLINE ? 'stalled' : 'progressing';
}

/** Deployment spec or Service as the figure reads it. Highlights mark fields the last step read or changed. */
export function manifestOf(state: ReleaseState): ManifestField[] {
  if (state.strategy === 'blueGreen') {
    return [
      { text: '# web-blue selects app: web + version: blue; web-green selects app: web + version: green.' },
      { text: '# This Service selector alone decides which of the two receives requests.' },
      { text: 'apiVersion: v1' },
      { text: 'kind: Service' },
      { text: 'metadata:' },
      { text: '  name: web' },
      { text: 'spec:' },
      { text: '  selector:' },
      { text: '    app: web' },
      { text: `    version: ${state.route === 'new' ? 'green' : 'blue'}`, field: 'selector' },
      { text: '  ports:' },
      { text: '    - port: 80' },
      { text: '      targetPort: 8080' },
    ];
  }
  if (state.strategy === 'canary') {
    return [
      { text: '# web-stable selects app: web + track: stable; web-canary selects app: web + track: canary.' },
      { text: '# Service web selects app: web only, so Ready Pods of both are endpoints.' },
      { text: 'apiVersion: apps/v1' },
      { text: 'kind: Deployment' },
      { text: 'metadata:' },
      { text: '  name: web-canary' },
      { text: 'spec:' },
      { text: `  replicas: ${state.lanes[1].target}`, field: 'replicas' },
      { text: '  selector:' },
      { text: '    matchLabels:' },
      { text: '      app: web' },
      { text: '      track: canary' },
      { text: '  template:' },
      { text: '    metadata:' },
      { text: '      labels:' },
      { text: '        app: web' },
      { text: '        track: canary' },
      { text: '    spec:' },
      { text: '      containers:' },
      { text: '        - name: app' },
      { text: '          image: registry.example.com/app:v2' },
    ];
  }
  return [
    { text: 'apiVersion: apps/v1' },
    { text: 'kind: Deployment' },
    { text: 'metadata:' },
    { text: '  name: web' },
    { text: 'spec:' },
    { text: `  replicas: ${DESIRED}` },
    { text: '  revisionHistoryLimit: 10' },
    { text: `  progressDeadlineSeconds: ${DEADLINE}`, field: 'progressDeadlineSeconds' },
    { text: '  selector:' },
    { text: '    matchLabels:' },
    { text: '      app: web' },
    { text: '  strategy:' },
    { text: '    type: RollingUpdate' },
    { text: '    rollingUpdate:' },
    { text: `      maxSurge: ${SURGE}`, field: 'maxSurge' },
    { text: '      maxUnavailable: 0', field: 'maxUnavailable' },
    { text: '  template:' },
    { text: '    metadata:' },
    { text: '      labels:' },
    { text: '        app: web' },
    { text: '    spec:' },
    { text: '      containers:' },
    { text: '        - name: app' },
    { text: `          image: registry.example.com/app:v${state.template + 1}`, field: 'image' },
  ];
}

/** Rolling update: one event per Step. The template lane may grow within maxSurge. The old lane shrinks only while Ready stays at or above desired. */
function rollingStep(state: ReleaseState): ReleaseState {
  const t = state.template;
  const o = other(t);
  const names = laneNames.rolling;
  const total = state.pods.length;
  const target = state.lanes[t].target;

  if (target < DESIRED && total < DESIRED + SURGE) {
    const pod: Pod = { id: state.nextId, lane: t, slot: freeSlot(state, t), ready: false };
    const next: ReleaseState = {
      ...state, lanes: withLane(state.lanes, t, { target: target + 1 }), pods: [...state.pods, pod],
      nextId: state.nextId + 1, fresh: pod.id, sinceProgress: 0,
    };
    return withChange(next, {
      title: `${names[t]} creates p${pod.id}`,
      changed: `${names[t]} target ${target}→${target + 1}; p${pod.id} Created, not Ready. ${total + 1} Pods.`,
      actor: `Deployment controller raised the target; ReplicaSet controller created the Pod from app:v${t + 1}.`,
      reason: `Within maxSurge ${SURGE}: at most ${DESIRED + SURGE} Pods in total.`,
      notYet: `p${pod.id} gets no requests until Ready.`,
      reads: ['maxSurge'],
    });
  }

  const pending = state.pods.find((pod) => !pod.ready && canBecomeReady(state, pod));
  if (pending) {
    const next: ReleaseState = {
      ...state, fresh: null, sinceProgress: 0,
      pods: state.pods.map((pod) => (pod.id === pending.id ? { ...pod, ready: true } : pod)),
    };
    return withChange(next, {
      title: `p${pending.id} became Ready`,
      changed: `Ready ${readyOf(state)}→${readyOf(state) + 1}. ${shareLine(next)}`,
      actor: 'Assumed readiness event (kubelet and probe); the ReplicaSet counts it, does not set it.',
      reason: routedTo(state.route, pending.lane)
        ? 'Its Ready condition is true, and the Service selector matches it.'
        : 'Its Ready condition is true, but the Service selector does not match it.',
      notYet: 'Ready is a probe result, not proof that answers are correct.',
      reads: [],
    });
  }

  if (state.lanes[o].target > 0) {
    const victim = state.pods.filter((pod) => pod.lane === o).sort((a, b) => b.slot - a.slot)[0];
    const readyNow = readyOf(state);
    const readyAfter = readyNow - (victim?.ready ? 1 : 0);
    if (!victim || readyAfter >= DESIRED) {
      const next: ReleaseState = {
        ...state,
        lanes: withLane(state.lanes, o, { target: state.lanes[o].target - 1 }),
        pods: victim ? state.pods.filter((pod) => pod.id !== victim.id) : state.pods,
        retired: victim ? [...state.retired, victim.id] : state.retired,
        fresh: null, sinceProgress: 0,
      };
      const oldTarget = state.lanes[o].target;
      return withChange(next, {
        title: victim ? `${names[o]} deletes p${victim.id}` : `${names[o]} target lowered`,
        changed: victim
          ? `${names[o]} target ${oldTarget}→${oldTarget - 1}; p${victim.id} (${victim.ready ? 'Ready' : 'Not Ready'}) retired. Ready ${readyNow}→${readyAfter}.`
          : `${names[o]} target ${oldTarget}→${oldTarget - 1}. Ready ${readyNow}.`,
        actor: 'Deployment controller lowered the old target; the old ReplicaSet controller deleted the Pod.',
        reason: `maxUnavailable 0 keeps Ready at or above ${DESIRED}; ${readyAfter} remain.`,
        notYet: victim ? `p${victim.id} does not return.` : 'No Pod was deleted in this step.',
        reads: ['maxUnavailable'],
      });
    }
    return blockedRollout(state, victim.id, readyAfter);
  }
  return blockedRollout(state, null, readyOf(state));
}

function blockedRollout(state: ReleaseState, victimId: number | null, readyAfter: number): ReleaseState {
  const t = state.template;
  const names = laneNames.rolling;
  const notReady = state.pods.filter((pod) => !pod.ready).map((pod) => `p${pod.id}`);
  const removal = victimId === null
    ? `${names[other(t)]} has nothing it may remove yet.`
    : `Removing p${victimId} leaves ${readyAfter} Ready, below ${DESIRED} (maxUnavailable 0).`;
  const notReadyText = notReady.length
    ? ` ${notReady.join(', ')} ${notReady.length === 1 ? 'never becomes' : 'never become'} Ready in this build.`
    : '';
  return withChange(state, {
    title: notReady.length ? `Waiting: ${notReady.join(', ')} Not Ready` : 'Waiting: old Pods kept',
    changed: `Nothing changed. ${names[t]} target ${state.lanes[t].target}; ${names[other(t)]} target ${state.lanes[other(t)].target}; Ready ${readyOf(state)}.`,
    actor: 'Deployment controller, which will not remove a Ready Pod below desired.',
    reason: `${removal}${notReadyText}`,
    notYet: 'No rollback. Only the deadline condition or your undo changes this.',
    reads: ['maxUnavailable'],
    waiting: true,
  });
}

/** Blue-green and canary: each lane is its own Deployment, so its ReplicaSet controller only matches its own target. */
function laneStep(state: ReleaseState): ReleaseState {
  const names = laneNames[state.strategy];
  const reads: Field[] = state.strategy === 'canary' ? ['replicas'] : [];
  for (const lane of [0, 1] as const) {
    const observed = observedOf(state, lane);
    const target = state.lanes[lane].target;
    if (observed < target) {
      const pod: Pod = { id: state.nextId, lane, slot: freeSlot(state, lane), ready: false };
      const next: ReleaseState = { ...state, pods: [...state.pods, pod], nextId: state.nextId + 1, fresh: pod.id, sinceProgress: 0 };
      return withChange(next, {
        title: `${names[lane]} creates p${pod.id}`,
        changed: `Pods ${observed}→${observed + 1} of target ${target}; p${pod.id} Created, not Ready.`,
        actor: `ReplicaSet controller of ${names[lane]}, from its own template.`,
        reason: `Observed ${observed} is below target ${target}.`,
        notYet: `p${pod.id} is Not Ready, so it gets no requests.`,
        reads: lane === 1 ? reads : [],
      });
    }
  }
  const pending = state.pods.find((pod) => !pod.ready && canBecomeReady(state, pod));
  if (pending) {
    const next: ReleaseState = {
      ...state, fresh: null, sinceProgress: 0,
      pods: state.pods.map((pod) => (pod.id === pending.id ? { ...pod, ready: true } : pod)),
    };
    return withChange(next, {
      title: `p${pending.id} became Ready`,
      changed: `Ready ${readyOf(state)}→${readyOf(state) + 1}. ${shareLine(next)}`,
      actor: 'Assumed readiness event (kubelet and probe); the ReplicaSet counts it, does not set it.',
      reason: routedTo(state.route, pending.lane)
        ? 'Its Ready condition is true, and the Service selector matches its lane.'
        : 'Its Ready condition is true, but the Service selector does not match its lane.',
      notYet: 'Ready is a probe result, not proof that answers are correct.',
      reads: [],
    });
  }
  for (const lane of [0, 1] as const) {
    const observed = observedOf(state, lane);
    const target = state.lanes[lane].target;
    if (observed > target) {
      const victim = state.pods.filter((pod) => pod.lane === lane).sort((a, b) => b.slot - a.slot)[0]!;
      const next: ReleaseState = {
        ...state, pods: state.pods.filter((pod) => pod.id !== victim.id), retired: [...state.retired, victim.id],
        fresh: null, sinceProgress: 0,
      };
      return withChange(next, {
        title: `${names[lane]} deletes p${victim.id}`,
        changed: `Pods ${observed}→${observed - 1} of target ${target}; p${victim.id} retired.`,
        actor: `ReplicaSet controller of ${names[lane]}.`,
        reason: `Observed ${observed} is above target ${target}.`,
        notYet: `p${victim.id} does not return.`,
        reads: lane === 1 ? reads : [],
      });
    }
  }
  const notReady = state.pods.filter((pod) => !pod.ready).map((pod) => `p${pod.id}`);
  return withChange(state, {
    title: `Waiting: ${notReady.join(', ')} Not Ready`,
    changed: `Nothing changed. Ready ${readyOf(state)} of ${state.pods.length} Pods.`,
    actor: 'Controllers: nothing they can do until the build passes readiness.',
    reason: 'This build never becomes Ready in the fixture.',
    notYet: 'No Pod was removed or replaced.',
    reads: [],
    waiting: true,
  });
}

/** One explanatory event: one controller acts, or a readiness event happens. Settled states do not move. */
export function advance(state: ReleaseState): ReleaseState {
  if (settled(state)) return state;
  return state.strategy === 'rolling' ? rollingStep(state) : laneStep(state);
}

/** True when the next Step would only wait. */
export const isWaiting = (state: ReleaseState) => advance(state).change.waiting === true;

/** kubectl set image on the template: RS-v2 is created, or an existing RS-v2 is reused at the next revision. */
export function shipTemplate(state: ReleaseState): ReleaseState {
  if (state.strategy !== 'rolling' || state.template !== 0 || !settled(state)) return state;
  const revisions = state.revisions + 1;
  const previous = state.lanes[1].revision;
  const next: ReleaseState = {
    ...state, template: 1, revisions, started: true, sinceProgress: 0, fresh: null,
    lanes: withLane(state.lanes, 1, { present: true, revision: revisions }),
  };
  return withChange(next, {
    title: 'Pod template changed to app:v2',
    changed: `Template app:v1→app:v2. ${previous === null ? `RS-v2 created at revision ${revisions}` : `RS-v2 reused at revision ${revisions} (was ${previous})`}, target 0.`,
    actor: 'You edit the template; the Deployment controller acts on it.',
    reason: 'A template change, not a count change, starts a new revision.',
    notYet: 'No app:v2 Pod yet; the next Step creates one.',
    reads: ['image'],
  });
}

/** kubectl rollout undo: the Deployment wants the previous template again. RS-v1 is kept, so it is scaled back, not rebuilt. */
export function undoRollout(state: ReleaseState): ReleaseState {
  if (state.strategy !== 'rolling' || state.template !== 1) return state;
  const revisions = state.revisions + 1;
  const previous = state.lanes[0].revision;
  const observed = observedOf(state, 0);
  const target = state.lanes[0].target;
  const next: ReleaseState = {
    ...state, template: 0, revisions, sinceProgress: 0, fresh: null,
    lanes: withLane(state.lanes, 0, { revision: revisions }),
  };
  const creating = Math.max(0, target - observed);
  return withChange(next, {
    title: 'kubectl rollout undo: template back to app:v1',
    changed: `Template app:v2→app:v1. RS-v1 takes revision ${revisions} (was ${previous}); ${creating > 0 ? `${creating} Pod(s) to create` : 'no Pod created'}.`,
    actor: 'You, with kubectl rollout undo; the Deployment controller then rolls toward app:v1.',
    reason: 'Rollback is a new rollout to a kept ReplicaSet, not a restore of old Pods.',
    notYet: 'RS-v2 keeps its Pods until Steps retire them.',
    reads: ['image'],
  });
}

/** progressDeadlineSeconds passes while the rollout cannot move. Kubernetes reports the stall and takes no other action. */
export function deadlinePasses(state: ReleaseState): ReleaseState {
  if (state.strategy !== 'rolling' || !isWaiting(state)) return state;
  const next: ReleaseState = { ...state, sinceProgress: DEADLINE };
  return withChange(next, {
    title: `progressDeadlineSeconds (${DEADLINE} s) exceeded`,
    changed: `Progressing False, ProgressDeadlineExceeded. Ready ${readyOf(state)} of ${DESIRED}; Pods unchanged.`,
    actor: `Deployment controller, after ${DEADLINE} s with no progress (fixture clock jump).`,
    reason: 'Kubernetes takes no action on a stalled Deployment except to report it.',
    notYet: 'Nothing rolled back or deleted; undo is your choice.',
    reads: ['progressDeadlineSeconds'],
  });
}

/** Blue-green step 1: a second Deployment exists beside blue. The Service still selects blue, so green gets no requests. */
export function deployGreen(state: ReleaseState): ReleaseState {
  if (state.strategy !== 'blueGreen' || state.lanes[1].present) return state;
  const next: ReleaseState = { ...state, started: true, lanes: withLane(state.lanes, 1, { present: true, target: DESIRED }) };
  return withChange(next, {
    title: 'Deployment web-green created at 3 replicas',
    changed: `web-green (app:v2) target 0→3; no Pod yet. ${shareLine(next)}`,
    actor: 'You, creating a second Deployment; its ReplicaSet controller creates the Pods.',
    reason: 'The Service still selects version=blue, so green cannot take traffic.',
    notYet: 'Nothing has been switched.',
    reads: [],
  });
}

/** Blue-green switch: changes which Pods match the Service selector. Neither Deployment is edited. */
export function switchService(state: ReleaseState, to: 'old' | 'new'): ReleaseState {
  if (state.strategy !== 'blueGreen' || state.route === to) return state;
  if (to === 'new' && !state.lanes[1].present) return state;
  const next: ReleaseState = { ...state, route: to };
  if (to === 'new') {
    const traffic = trafficOf(next);
    const notYet = traffic.endpoints === 0
      ? 'Green has no Ready Pod. Switching back restores blue.'
      : traffic.failShare > 0
        ? 'Blue still has its Pods: switching back restores app:v1 without a rollout.'
        : 'Blue Pods still exist and no longer match.';
    return withChange(next, {
      title: 'Service selector: version=blue → green',
      changed: `Selector version=blue→green. ${shareLine(next)}`,
      actor: 'You, editing the Service selector; the EndpointSlice controller updates endpoints.',
      reason: 'Only Ready Pods matching the selector receive requests. Neither Deployment changes.',
      notYet,
      reads: ['selector'],
    });
  }
  return withChange(next, {
    title: 'Service selector: version=green → blue',
    changed: `Selector version=green→blue. ${shareLine(next)}`,
    actor: 'You, editing the Service selector again.',
    reason: 'Blue Pods were never deleted, so they match and are endpoints once Ready.',
    notYet: 'Green Pods still run but get no requests.',
    reads: ['selector'],
  });
}

/** Canary: the canary replica count. The split follows Ready Pod counts because the Service selects app: web only. */
export function setCanary(state: ReleaseState, replicas: number): ReleaseState {
  if (state.strategy !== 'canary' || !Number.isInteger(replicas) || replicas < 0 || replicas > CANARY_MAX) return state;
  const previous = state.lanes[1].target;
  if (replicas === previous) return state;
  const next: ReleaseState = { ...state, started: true, lanes: withLane(state.lanes, 1, { target: replicas, present: true }) };
  return withChange(next, {
    title: `Canary replicas ${previous} → ${replicas}`,
    changed: `web-canary target ${previous}→${replicas}; stable stays at ${DESIRED}. ${shareLine(next)}`,
    actor: 'You, editing the canary Deployment; its ReplicaSet controller creates or deletes Pods.',
    reason: 'The Service selects app: web, so Ready Pods of both Deployments share requests.',
    notYet: replicas > previous
      ? 'Each Step creates one canary Pod; it gets requests only once Ready.'
      : 'Canary Pods still running receive requests until Steps delete them.',
    reads: ['replicas'],
  });
}

/** Build behaviour is fixed once a v2 object exists, so the learner cannot change it mid-release. */
export function setDefect(state: ReleaseState, defect: Defect): ReleaseState {
  if (state.started || defect === state.defect) return state;
  return withChange({ ...state, defect }, {
    title: `New app:v2 build: ${defectLabel[defect]}`,
    changed: 'Fixture setting; no v2 Pod exists yet.',
    actor: 'You, choosing how the fixture build behaves.',
    reason: 'Readiness and answer correctness are separate signals.',
    notYet: 'Nothing deployed yet.',
    reads: [],
  });
}

/** A new strategy starts from its own start state. The app:v2 build choice carries over. */
export function chooseStrategy(state: ReleaseState, strategy: Strategy): ReleaseState {
  if (strategy === state.strategy) return state;
  const fresh = initialState(strategy, state.defect);
  return withChange(fresh, {
    title: `Strategy: ${strategyLabel[strategy]}`,
    changed: 'Bench reset to its start state; the app:v2 build choice is kept.',
    actor: 'You, choosing a release strategy.',
    reason: 'Each strategy builds its own objects; the previous bench is discarded.',
    notYet: fresh.change.notYet,
    reads: [],
  });
}

export function resetState(state: ReleaseState): ReleaseState {
  const fresh = initialState(state.strategy, state.defect);
  return withChange(fresh, { ...fresh.change, title: `Reset: ${fresh.change.title}` });
}
