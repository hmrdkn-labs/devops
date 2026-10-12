/**
 * Authored fixture: one Deployment object `web` in namespace `shop`, its local manifest card,
 * the controller's observation (status) and the owned Pods. Every transition is pure and
 * deterministic. Numbers are fixture counters; real resourceVersion values are opaque.
 *
 * Simplifications, named on the page: the Deployment controller and its ReplicaSet are one
 * `sync` step; Pods are created in one step and become Ready in one fixture event; deleting
 * the object removes its Pods at once (real garbage collection runs asynchronously); Available
 * means all desired Pods are Ready (real Available follows the strategy's minimum availability).
 */

export const TEMPLATE_LABEL = 'web';
export const SELECTOR_CHOICES = ['web', 'api'] as const;
export type SelectorValue = (typeof SELECTOR_CHOICES)[number];
export const REPLICA_CHOICES = [1, 2, 3, 4] as const;

/** Stand-in for the collapsed ReplicaSet: a 10-character pod-template-hash, so Pods read <rs>-<suffix> like real ones. */
export const REPLICASET_NAME = 'web-6d4cf56db6';
export const RS_PREFIX = `${REPLICASET_NAME}-`;
const POD_SUFFIXES: readonly string[] = ['h4kq2', 'j8m1p', 'x2v7s', 'n5w9d', 'r6t3c', 'b7f2q', 'z9k4m', 't3c8w'];
/** Named from a creation counter, so a retired Pod name never comes back. */
export function podName(count: number): string {
  return `${RS_PREFIX}${POD_SUFFIXES[count - 1] ?? `x${count}`}`;
}

export interface Manifest { replicas: number; selector: SelectorValue }

export interface Pod { name: string; slot: number; ready: boolean }

export interface StoredDeployment {
  uid: string;
  /** Fixture counter for persisted writes to this object (opaque in real clusters). */
  resourceVersion: number;
  /** spec-derived sequence number; bumped by the API server when spec changes. */
  generation: number;
  /** spec.replicas */
  replicas: number;
  /** status.observedGeneration: the generation the controller last acted on. */
  observedGeneration: number;
  /** status.replicas: non-terminating Pods the controller counted at its last sync. */
  statusReplicas: number;
  /** status.readyReplicas: Ready Pods the controller counted at its last sync. */
  statusReady: number;
}

/** Outcome of the last apply sent with the current card. Any card edit resets it to none. */
export type ApplyOutcome = 'none' | 'accepted' | 'rejected';
export interface ApiState {
  /** The local manifest card. It is not in the cluster until apply. */
  manifest: Manifest;
  /** The stored object, or null after delete (or before first create). */
  stored: StoredDeployment | null;
  /** Owned Pods as the cluster currently holds them. */
  pods: Pod[];
  /** Highest resourceVersion issued across objects in this fixture. */
  clock: number;
  uidCount: number;
  podCount: number;
  /** Outcome of the last apply of the current card contents (see ApplyOutcome). */
  lastApply: ApplyOutcome;
}

export type ApiEvent =
  | { kind: 'card'; field: 'replicas' | 'selector'; value: number | SelectorValue }
  | { kind: 'rejected'; selector: SelectorValue; replicas: number; stored: boolean }
  | { kind: 'created'; uid: string; replicas: number; resourceVersion: number }
  | { kind: 'spec-changed'; uid: string; from: number; to: number; generation: number; resourceVersion: number; observedGeneration: number }
  | { kind: 'unchanged'; uid: string; generation: number }
  | { kind: 'deleted'; uid: string; podsRemoved: number }
  | { kind: 'nothing-to-delete' }
  | { kind: 'synced'; uid: string; generation: number; observedFrom: number; created: string[]; removed: string[]; statusReplicas: number; readyFrom: number; readyTo: number; desired: number }
  | { kind: 'in-sync'; uid: string | null; generation: number | null }
  | { kind: 'pods-ready'; names: string[] }
  | { kind: 'no-pending-pods' }
  | { kind: 'reset' };

export interface Transition { state: ApiState; event: ApiEvent }

/** Converged fixture: manifest matches the stored spec and every observation is current. */
export function initialState(): ApiState {
  return {
    manifest: { replicas: 2, selector: TEMPLATE_LABEL },
    stored: {
      uid: 'u1', resourceVersion: 3, generation: 1, replicas: 2,
      observedGeneration: 1, statusReplicas: 2, statusReady: 2,
    },
    pods: [{ name: podName(1), slot: 0, ready: true }, { name: podName(2), slot: 1, ready: true }],
    clock: 3, uidCount: 1, podCount: 2, lastApply: 'accepted',
  };
}

export const readyPods = (state: ApiState) => state.pods.filter((pod) => pod.ready).length;

/** The card and the stored spec describe the same desired state. */
export function cardMatchesStored(state: ApiState): boolean {
  return state.stored !== null && state.manifest.replicas === state.stored.replicas && state.manifest.selector === TEMPLATE_LABEL;
}

/**
 * The card relative to the stored object and to the last apply of this card. A rejected apply reads as rejected, never as
 * "not sent"; an edit after a rejection returns to edited because the edit resets lastApply.
 */
export type CardStatus = 'equal' | 'edited' | 'rejected' | 'deleted';
export function cardStatus(state: ApiState): CardStatus {
  if (cardMatchesStored(state)) return 'equal';
  if (state.lastApply === 'rejected') return 'rejected';
  if (state.stored === null && state.lastApply === 'accepted') return 'deleted';
  return 'edited';
}

/** The controller has acted on the current generation and its status matches the Pods it owns. */
export function observationCurrent(state: ApiState): boolean {
  const stored = state.stored;
  return stored !== null && stored.observedGeneration === stored.generation &&
    stored.statusReplicas === state.pods.length && stored.statusReady === readyPods(state);
}

export function editCard(state: ApiState, field: 'replicas' | 'selector', value: number | string): Transition {
  if (field === 'replicas') {
    const replicas = Number(value);
    if (!REPLICA_CHOICES.includes(replicas as (typeof REPLICA_CHOICES)[number]) || replicas === state.manifest.replicas) return { state, event: { kind: 'card', field, value: state.manifest.replicas } };
    return { state: { ...state, manifest: { ...state.manifest, replicas }, lastApply: 'none' }, event: { kind: 'card', field, value: replicas } };
  }
  const selector = SELECTOR_CHOICES.find((choice) => choice === value);
  if (!selector || selector === state.manifest.selector) return { state, event: { kind: 'card', field, value: state.manifest.selector } };
  return { state: { ...state, manifest: { ...state.manifest, selector }, lastApply: 'none' }, event: { kind: 'card', field, value: selector } };
}

/** kubectl apply: validation runs before anything is persisted; a rejected request changes nothing. */
export function apply(state: ApiState): Transition {
  const { manifest, stored } = state;
  if (manifest.selector !== TEMPLATE_LABEL) {
    return { state: { ...state, lastApply: 'rejected' }, event: { kind: 'rejected', selector: manifest.selector, replicas: manifest.replicas, stored: stored !== null } };
  }
  if (!stored) {
    const uidCount = state.uidCount + 1;
    const clock = state.clock + 1;
    const uid = `u${uidCount}`;
    const created: StoredDeployment = {
      uid, resourceVersion: clock, generation: 1, replicas: manifest.replicas,
      observedGeneration: 0, statusReplicas: 0, statusReady: 0,
    };
    return { state: { ...state, stored: created, clock, uidCount, lastApply: 'accepted' }, event: { kind: 'created', uid, replicas: manifest.replicas, resourceVersion: clock } };
  }
  if (manifest.replicas === stored.replicas) {
    return { state: { ...state, lastApply: 'accepted' }, event: { kind: 'unchanged', uid: stored.uid, generation: stored.generation } };
  }
  const clock = state.clock + 1;
  const next: StoredDeployment = { ...stored, replicas: manifest.replicas, generation: stored.generation + 1, resourceVersion: clock };
  return {
    state: { ...state, stored: next, clock, lastApply: 'accepted' },
    event: {
      kind: 'spec-changed', uid: stored.uid, from: stored.replicas, to: manifest.replicas,
      generation: next.generation, resourceVersion: clock, observedGeneration: stored.observedGeneration,
    },
  };
}

/** Deleting the object ends its identity: the UID never returns, and its Pods go with it (fixture: at once). */
export function deleteObject(state: ApiState): Transition {
  if (!state.stored) return { state, event: { kind: 'nothing-to-delete' } };
  return {
    state: { ...state, stored: null, pods: [] },
    event: { kind: 'deleted', uid: state.stored.uid, podsRemoved: state.pods.length },
  };
}

/**
 * Controller sync: create or remove Pods to meet spec.replicas, then write status
 * (observedGeneration, status.replicas, status.readyReplicas) from what exists now.
 * Status is written only here, so Pods that became Ready later stay unreported until the next sync.
 */
export function sync(state: ApiState): Transition {
  const stored = state.stored;
  if (!stored) return { state, event: { kind: 'in-sync', uid: null, generation: null } };
  let pods = [...state.pods];
  let podCount = state.podCount;
  const created: string[] = [];
  const removed: string[] = [];
  while (pods.length < stored.replicas) {
    const slot = [0, 1, 2, 3].find((candidate) => !pods.some((pod) => pod.slot === candidate))!;
    podCount += 1;
    const name = podName(podCount);
    pods.push({ name, slot, ready: false });
    created.push(name);
  }
  while (pods.length > stored.replicas) {
    const highest = pods.reduce((a, b) => (a.slot > b.slot ? a : b));
    pods = pods.filter((pod) => pod !== highest);
    removed.push(highest.name);
  }
  pods.sort((a, b) => a.slot - b.slot);
  const ready = pods.filter((pod) => pod.ready).length;
  const statusChanged = stored.observedGeneration !== stored.generation ||
    stored.statusReplicas !== pods.length || stored.statusReady !== ready;
  if (!statusChanged && created.length === 0 && removed.length === 0) {
    return { state, event: { kind: 'in-sync', uid: stored.uid, generation: stored.generation } };
  }
  const clock = statusChanged ? state.clock + 1 : state.clock;
  const next: StoredDeployment = {
    ...stored,
    observedGeneration: stored.generation,
    statusReplicas: pods.length,
    statusReady: ready,
    resourceVersion: statusChanged ? clock : stored.resourceVersion,
  };
  return {
    state: { ...state, stored: next, pods, podCount, clock },
    event: {
      kind: 'synced', uid: stored.uid, generation: stored.generation, observedFrom: stored.observedGeneration,
      created, removed, statusReplicas: pods.length, readyFrom: stored.statusReady, readyTo: ready, desired: stored.replicas,
    },
  };
}

/** Fixture event standing in for scheduling, kubelet execution and successful probes (none performed here). */
export function podsBecomeReady(state: ApiState): Transition {
  const names = state.pods.filter((pod) => !pod.ready).map((pod) => pod.name);
  if (names.length === 0) return { state, event: { kind: 'no-pending-pods' } };
  return { state: { ...state, pods: state.pods.map((pod) => ({ ...pod, ready: true })) }, event: { kind: 'pods-ready', names } };
}

export function reset(): Transition {
  return { state: initialState(), event: { kind: 'reset' } };
}

export interface Report { title: string; changed: string; actor: string; reason: string; notYet: string }

/** Who changed what, why, and what has not happened yet. The type requires notYet on every event. */
export function reportOf(event: ApiEvent): Report {
  switch (event.kind) {
    case 'card':
      return {
        title: `Card edited: ${event.field} is ${event.value}`,
        changed: 'Only the local manifest card. The stored object is unchanged.',
        actor: 'You, editing the manifest file',
        reason: 'A manifest is a copy of intent on your machine until a request sends it.',
        notYet: 'No API request has been sent; the store still holds the previous spec.',
      };
    case 'rejected':
      return {
        title: 'Apply rejected by API validation',
        changed: event.stored
          ? 'Nothing stored. The object keeps its generation, resourceVersion and Pods.'
          : 'Nothing created. No object exists for this name.',
        actor: 'kube-apiserver validation, before anything is persisted',
        reason: `spec.selector app=${event.selector} does not match template labels app=${TEMPLATE_LABEL}, so the Deployment is invalid.`,
        notYet: 'No controller work follows: a rejected request produces no new generation.',
      };
    case 'created':
      return {
        title: `Created Deployment web as ${event.uid}`,
        changed: `New object ${event.uid} at generation 1 with spec.replicas ${event.replicas}; status is empty.`,
        actor: 'kube-apiserver, for your kubectl apply request',
        reason: 'The name web in namespace shop was free, so apply created the object.',
        notYet: 'No Pods exist yet. status.observedGeneration is 0 until a controller observes the object.',
      };
    case 'spec-changed':
      return {
        title: `Spec stored: generation ${event.generation - 1} to ${event.generation}`,
        changed: `spec.replicas ${event.from} to ${event.to}; resourceVersion now ${event.resourceVersion}.`,
        actor: 'kube-apiserver, for your kubectl apply request',
        reason: 'The desired state changed, so the server advanced generation.',
        notYet: `No Pods changed yet. status.observedGeneration is still ${event.observedGeneration}, so status describes the old spec.`,
      };
    case 'unchanged':
      return {
        title: 'Apply made no change',
        changed: `Nothing. Generation stays ${event.generation}.`,
        actor: 'kube-apiserver, comparing your manifest with the stored spec',
        reason: 'The manifest equals the stored spec, so the request writes nothing new.',
        notYet: 'No new generation exists, so the controller has no new work. Status is whatever it was before this apply.',
      };
    case 'deleted':
      return {
        title: `Deleted Deployment web (${event.uid})`,
        changed: `Object removed. ${event.podsRemoved} owned Pod(s) removed at once in this fixture.`,
        actor: 'You (kubectl delete); the API server removes the object, then garbage collection removes its owned Pods',
        reason: 'The object ends its identity; a later apply creates a new UID.',
        notYet: 'The old UID will not return. Re-applying creates a new object at generation 1.',
      };
    case 'nothing-to-delete':
      return {
        title: 'Nothing to delete',
        changed: 'No stored object.',
        actor: 'kube-apiserver',
        reason: 'There is no object named web in shop.',
        notYet: 'No Pods exist to remove; apply is still needed to create the object.',
      };
    case 'synced': {
      const pods = [
        event.created.length ? `created ${event.created.join(', ')} (Pending, not Ready)` : '',
        event.removed.length ? `removed ${event.removed.join(', ')}` : '',
      ].filter(Boolean).join('; ');
      let notYet = 'Sync does not mark any Pod Ready; readiness comes from the node.';
      if (event.created.length) notYet = 'New Pods are Pending and not Ready. Sync never marks a Pod Ready.';
      else if (event.removed.length) notYet = 'Scale-down does not make the remaining Pods Ready; their readiness is unchanged by this sync.';
      else if (event.readyTo < event.desired) notYet = 'Some Pods are still not Ready; status.readyReplicas counts only Ready Pods.';
      return {
        title: `Controller synced generation ${event.generation}`,
        changed: `${pods || 'No Pod change'}. observedGeneration ${event.observedFrom} to ${event.generation}; status.replicas ${event.statusReplicas}; readyReplicas ${event.readyTo}.`,
        actor: 'Deployment controller (its ReplicaSet step is collapsed into this sync)',
        reason: event.observedFrom === event.generation
          ? `Pods were brought to spec.replicas ${event.desired}; status was rewritten from what exists now.`
          : `status.observedGeneration ${event.observedFrom} lagged generation ${event.generation}; the controller had not acted on the new spec.`,
        notYet,
      };
    }
    case 'in-sync':
      return event.uid
        ? {
          title: 'Nothing to sync',
          changed: `Status already observes generation ${event.generation} and matches the Pods.`,
          actor: 'Deployment controller',
          reason: 'Its observation already matches the stored spec and its Pods.',
          notYet: 'Sync does not mark any Pod Ready; readiness comes from the node.',
        }
        : {
          title: 'No object to sync',
          changed: 'No stored object; the controller has nothing to reconcile.',
          actor: 'Deployment controller',
          reason: 'With no object there is no spec to reconcile.',
          notYet: 'No Pods are created until apply stores an object.',
        };
    case 'pods-ready':
      return {
        title: `Pods ${event.names.join(', ')} report Ready (fixture)`,
        changed: 'Pod condition Ready is true. The Deployment status is not updated by this event.',
        actor: 'Fixture stands in for scheduler, kubelet and probes; none are performed here',
        reason: 'Readiness is a Pod condition reported by its node, not a field apply wrote.',
        notYet: 'status.readyReplicas still counts the old Ready total until the Deployment controller syncs again.',
      };
    case 'no-pending-pods':
      return {
        title: 'No Pods are waiting for Ready',
        changed: 'Nothing.',
        actor: 'Fixture',
        reason: 'Every owned Pod is already Ready.',
        notYet: 'status.readyReplicas is unchanged; only a controller sync rewrites status.',
      };
    case 'reset':
      return {
        title: 'Fixture reset to a converged object',
        changed: 'Store, card and Pods return to the starting fixture.',
        actor: 'You, using reset',
        reason: 'The fixture restarts its counters; nothing was rolled back in the cluster.',
        notYet: 'This is not a Kubernetes rollback or a live-cluster restore.',
      };
  }
}

/** Result of the last apply request, read by the gate readout and lamps. Other events leave it unchanged (null). */
export interface Gate { result: 'idle' | 'accepted' | 'rejected' }
export function gateOf(event: ApiEvent): Gate | null {
  switch (event.kind) {
    case 'created':
    case 'spec-changed':
    case 'unchanged':
      return { result: 'accepted' };
    case 'rejected':
      return { result: 'rejected' };
    case 'reset':
      return { result: 'idle' };
    default:
      return null;
  }
}
