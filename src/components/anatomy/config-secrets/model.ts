export type Source = 'configmap' | 'secret';
export type Delivery = 'env' | 'volume' | 'subpath';
/** Index into a source's stored values: 0 = first value, 1 = updated value. */
export type Version = 0 | 1;

/** The Pod template's reference to one key: which object, how it is delivered, and its flags. */
export interface Spec {
  source: Source;
  delivery: Delivery;
  /** The reference names a key the object does not hold. */
  misspelledKey: boolean;
  /** optional: true on the reference. */
  optional: boolean;
}

export interface Stored { configmap: Version; secret: Version }

export interface PodState {
  name: string;
  /** The reference this Pod was created with. A running Pod never changes its own spec. */
  spec: Spec;
  phase: 'running' | 'blocked';
  /**
   * The version the app can see through its delivery path.
   * null: no value (optional reference missing, or the container never started).
   */
  seen: Version | null;
}

export interface World {
  stored: Stored;
  /** Staged Pod template. It applies only to Pods created by a rollout. */
  spec: Spec;
  /** The active Pod, running. */
  pod: PodState;
  /** Latest replacement that did not start. The active Pod keeps running. */
  blocked: PodState | null;
  serial: number;
}

export const objects = {
  configmap: { kind: 'ConfigMap', name: 'app-settings', key: 'LOG_LEVEL', file: 'log-level', typo: 'LOG_LVL', values: ['info', 'debug'] },
  secret: { kind: 'Secret', name: 'app-secrets', key: 'API_TOKEN', file: 'api-token', typo: 'API_TOKN', values: ['token-v1', 'token-v2'] },
} as const satisfies Record<Source, { kind: string; name: string; key: string; file: string; typo: string; values: readonly [string, string] }>;

const suffixes = ['x4k2q', 'm8z1r', 'b7t9w', 'q2n5v', 'k6h3s', 'v9d4c'] as const;

export const initialSpec: Spec = { source: 'configmap', delivery: 'env', misspelledKey: false, optional: false };
export const initialStored: Stored = { configmap: 0, secret: 0 };

export function podName(serial: number): string {
  return `app-7f9c5d-${suffixes[serial % suffixes.length]}`;
}

export function valueOf(source: Source, version: Version): string {
  return objects[source].values[version];
}

export function keyNameOf(spec: Spec): string {
  const object = objects[spec.source];
  return spec.misspelledKey ? object.typo : object.key;
}

export function sameSpec(a: Spec, b: Spec): boolean {
  return a.source === b.source && a.delivery === b.delivery && a.misspelledKey === b.misspelledKey && a.optional === b.optional;
}

/**
 * Container start: a missing non-optional key blocks the container; a missing optional key starts with no value.
 * The stored value is read here for env; volume and subPath keep their own paths afterwards.
 */
export function startPod(spec: Spec, stored: Stored, serial: number): PodState {
  const name = podName(serial);
  const snapshot: Spec = { ...spec };
  if (spec.misspelledKey && !spec.optional) return { name, spec: snapshot, phase: 'blocked', seen: null };
  return { name, spec: snapshot, phase: 'running', seen: spec.misspelledKey ? null : stored[spec.source] };
}

export function initialWorld(): World {
  return { stored: { ...initialStored }, spec: { ...initialSpec }, pod: startPod(initialSpec, initialStored, 0), blocked: null, serial: 0 };
}

/** An API write to one object. Pods are untouched; only delivery paths may later observe it. */
export function setStored(world: World, source: Source, version: Version): World {
  return { ...world, stored: { ...world.stored, [source]: version } };
}

/** Staging changes only the template; the running Pod keeps its spec. */
export function stage(world: World, patch: Partial<Spec>): World {
  return { ...world, spec: { ...world.spec, ...patch } };
}

/** Periodic kubelet sync: only a mounted volume with a present key is re-projected. */
export function syncVolumes(world: World): World {
  const { pod } = world;
  if (pod.phase !== 'running' || pod.spec.delivery !== 'volume' || pod.spec.misspelledKey) return world;
  return { ...world, pod: { ...pod, seen: world.stored[pod.spec.source] } };
}

/** Rollout creates a Pod with a fresh name from the staged template; the old Pod stays until the new one runs. */
export function rollOut(world: World): World {
  const serial = world.serial + 1;
  const next = startPod(world.spec, world.stored, serial);
  if (next.phase === 'running') return { ...world, serial, pod: next, blocked: null };
  return { ...world, serial, blocked: next };
}
