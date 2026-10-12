import type { Change } from '../shared/ChangeReport';
import type { ManifestLine } from '../shared/ManifestPanel';

/**
 * Pure, deterministic fixture for claim-backed storage. One StorageClass, one claim, one
 * dynamically provisioned volume per claim, one bare writer Pod at a time, and two nodes in
 * two zones. The fixture is an explanation, not a cluster: no timing, no CSI calls, no containers.
 */
export type BindingMode = 'Immediate' | 'WaitForFirstConsumer';
export type ReclaimPolicy = 'Delete' | 'Retain';
export type AccessMode = 'ReadWriteOnce' | 'ReadWriteMany';
export type Zone = 'a' | 'b';
export type NodeName = 'node-a' | 'node-b';
/** Manifest fields a single interaction read or changed; the ManifestPanel highlights these. */
export type Field = 'binding' | 'reclaim' | 'access' | 'phase' | 'volumeName' | 'finalizer' | 'podName' | 'claimName' | 'nodeSelector' | 'nodeName';

/** Class settings are fixed when a claim is created, so changing one starts a fresh scenario. */
export interface Config {
  binding: BindingMode;
  reclaim: ReclaimPolicy;
  access: AccessMode;
  /** Fixture simplification: the only node the scheduler may use for the next Pod. */
  podNode: NodeName;
}

export const initialConfig: Config = { binding: 'Immediate', reclaim: 'Delete', access: 'ReadWriteOnce', podNode: 'node-a' };
export const CLASS_NAME = 'fast-zonal';
export const CLAIM_NAME = 'ledger';
export const nodeZone: Record<NodeName, Zone> = { 'node-a': 'a', 'node-b': 'b' };
/** Immediate binding always provisions in zone a: the fixture's provisioner choice, made before any Pod exists. */
const IMMEDIATE_ZONE: Zone = 'a';

export interface Claim { access: AccessMode; bound: string | null; terminating: boolean }
export interface Volume { name: string; zone: Zone; reclaim: ReclaimPolicy; released: boolean; rows: number }
export interface Pod { name: string; target: NodeName; node: NodeName | null; mounted: boolean }
export interface State {
  config: Config;
  claim: Claim | null;
  volumes: Volume[];
  pod: Pod | null;
  podsStarted: number;
  volumesCreated: number;
}

export function emptyState(config: Config = initialConfig): State {
  return { config, claim: null, volumes: [], pod: null, podsStarted: 0, volumesCreated: 0 };
}

/** Fixture simplification: the provisioner supports ReadWriteOnce only. Real support depends on the CSI driver and volume type. */
export function fixtureOffers(mode: AccessMode): boolean {
  return mode === 'ReadWriteOnce';
}

/** Deterministic and unique for the first 65536 volumes: an odd multiplier is a bijection mod 2^16. */
export function volumeName(sequence: number): string {
  return `pvc-${((0x4f2a + sequence * 0x3b7) & 0xffff).toString(16).padStart(4, '0')}`;
}

export function activeVolume(state: State): Volume | null {
  return state.volumes.find((volume) => !volume.released) ?? null;
}

/** Why a Pod is unassigned: the claim cannot bind, or the bound volume's zone excludes the Pod's node. */
export function pendingCause(state: State): 'claim' | 'zone' | null {
  const pod = state.pod;
  if (!pod || pod.node) return null;
  const volume = activeVolume(state);
  if (state.claim?.bound && volume && volume.zone !== nodeZone[pod.target]) return 'zone';
  return 'claim';
}

export type CartPlace = 'parking' | 'gate' | 'platform';

export interface Scene {
  /** A zone's gate lets a Pod pass only when no bound volume lives in another zone. */
  gateOpen: Record<Zone, boolean>;
  /** Volume bound to the current claim, shown in its zone bay. */
  bay: Record<Zone, Volume | null>;
  /** Released volumes, counted on each zone's shelf. */
  shelf: Record<Zone, number>;
  claim: { bound: boolean; terminating: boolean } | null;
  pod: null | { name: string; zone: Zone; place: CartPlace; mounted: boolean; cause: 'claim' | 'zone' | null };
  cable: Zone | null;
}

export function sceneOf(state: State): Scene {
  const volume = activeVolume(state);
  const zones: Zone[] = ['a', 'b'];
  const pod = state.pod;
  const cause = pendingCause(state);
  return {
    gateOpen: Object.fromEntries(zones.map((zone) => [zone, !volume || volume.zone === zone])) as Record<Zone, boolean>,
    bay: Object.fromEntries(zones.map((zone) => [zone, volume?.zone === zone ? volume : null])) as Record<Zone, Volume | null>,
    shelf: Object.fromEntries(zones.map((zone) => [zone, state.volumes.filter((v) => v.released && v.zone === zone).length])) as Record<Zone, number>,
    claim: state.claim ? { bound: state.claim.bound !== null, terminating: state.claim.terminating } : null,
    pod: pod ? {
      name: pod.name,
      zone: nodeZone[pod.target],
      place: pod.node ? 'platform' : cause === 'zone' ? 'gate' : 'parking',
      mounted: pod.mounted,
      cause,
    } : null,
    cable: pod?.mounted && pod.node ? nodeZone[pod.node] : null,
  };
}

export type Step =
  | { kind: 'cartIn'; zone: Zone; name: string; to: CartPlace }
  | { kind: 'cartOut'; zone: Zone }
  | { kind: 'stamp'; zone: Zone; name: string; rows: number }
  | { kind: 'drop'; zone: Zone };

/** The physical sequence an interaction must show, in order: Pod first, then provisioning, then removal. */
export function planSteps(previous: State, next: State): Step[] {
  const steps: Step[] = [];
  const nextScene = sceneOf(next);
  if (!previous.pod && next.pod && nextScene.pod) steps.push({ kind: 'cartIn', zone: nextScene.pod.zone, name: next.pod.name, to: nextScene.pod.place });
  if (previous.pod && !next.pod) steps.push({ kind: 'cartOut', zone: nodeZone[previous.pod.target] });
  const before = activeVolume(previous);
  const after = activeVolume(next);
  if (!before && after) steps.push({ kind: 'stamp', zone: after.zone, name: after.name, rows: after.rows });
  if (before && (!after || after.name !== before.name)) steps.push({ kind: 'drop', zone: before.zone });
  return steps;
}

export type Action =
  | { type: 'submit' }
  | { type: 'start' }
  | { type: 'deletePod' }
  | { type: 'deleteClaim' }
  | { type: 'reset' }
  | { type: 'setConfig'; key: 'binding' | 'reclaim' | 'access'; value: string }
  | { type: 'setPodNode'; node: NodeName }
  | { type: 'append' };

export interface Outcome { state: State; change: Change; touched: Field[] }

const ZONE_LABEL: Record<Zone, string> = { a: 'zone a', b: 'zone b' };
const label = (zone: Zone) => ZONE_LABEL[zone];
export const rowsOf = (count: number) => `${count} ${count === 1 ? 'row' : 'rows'}`;

function reclaimVolume(state: State, volume: Volume): Volume[] {
  if (volume.reclaim === 'Delete') return state.volumes.filter((v) => v.name !== volume.name);
  return state.volumes.map((v) => (v.name === volume.name ? { ...v, released: true } : v));
}

function noop(state: State, title: string, changed: string, reason: string): Outcome {
  return { state, touched: [], change: { title, changed, actor: 'You (fixture)', reason } };
}

function submit(state: State): Outcome {
  if (state.claim) return noop(state, 'Claim already exists', `PVC ${CLAIM_NAME} is already present; nothing was created.`, 'A claim is created once per scenario.');
  const access = state.config.access;
  const touched: Field[] = ['access', 'phase'];
  if (!fixtureOffers(access)) {
    return {
      state: { ...state, claim: { access, bound: null, terminating: false } },
      touched,
      change: {
        title: `PVC ${CLAIM_NAME} stays Pending`,
        changed: `PVC ${CLAIM_NAME} created as Pending. No PV was created.`,
        actor: 'the fixture provisioner (ReadWriteOnce only)',
        reason: 'The fixture provisioner supports ReadWriteOnce only, so it cannot create a ReadWriteMany volume. Real support depends on the CSI driver and volume type.',
        notYet: 'Pods that use this claim stay Pending. A scheduler cannot change the access mode a claim requested.',
      },
    };
  }
  if (state.config.binding === 'WaitForFirstConsumer') {
    return {
      state: { ...state, claim: { access, bound: null, terminating: false } },
      touched,
      change: {
        title: `PVC ${CLAIM_NAME} Pending by design`,
        changed: `PVC ${CLAIM_NAME} created. No PV exists and no zone has been chosen.`,
        actor: 'PV binding controller (waits for a consumer)',
        reason: 'WaitForFirstConsumer delays binding and provisioning until a Pod that uses the claim is scheduled.',
        notYet: 'No backing volume exists. The zone will come from the node the next Pod is scheduled to.',
      },
    };
  }
  const name = volumeName(state.volumesCreated);
  const volume: Volume = { name, zone: IMMEDIATE_ZONE, reclaim: state.config.reclaim, released: false, rows: 0 };
  const released = state.volumes.some((v) => v.released);
  return {
    state: {
      ...state,
      claim: { access, bound: name, terminating: false },
      volumes: [...state.volumes, volume],
      volumesCreated: state.volumesCreated + 1,
    },
    touched: [...touched, 'volumeName'],
    change: {
      title: `PVC ${CLAIM_NAME} Bound to ${name}`,
      changed: `PVC ${CLAIM_NAME} created. The fast-zonal provisioner created PV ${name} in ${label(IMMEDIATE_ZONE)}; the binding loop bound it one-to-one.`,
      actor: 'fast-zonal provisioner (Immediate binding) and the PV binding controller',
      reason: 'Immediate binds and provisions as soon as the claim exists, so the zone was chosen before any Pod existed.',
      notYet: `No Pod uses ${CLAIM_NAME} yet, and ${name} holds 0 rows.${released ? ' Released volumes from earlier claims are not reused.' : ''}`,
    },
  };
}

function startPod(state: State): Outcome {
  if (!state.claim) return noop(state, 'No claim to mount', 'No Pod was created.', `The writer mounts PVC ${CLAIM_NAME}; submit the claim first.`);
  if (state.pod) return noop(state, 'A Pod already exists', `Pod ${state.pod.name} is still present; nothing was created.`, 'One writer Pod at a time in this fixture.');
  const sequence = state.podsStarted + 1;
  const name = `${CLAIM_NAME}-writer-${sequence}`;
  const target = state.config.podNode;
  const zone = nodeZone[target];
  const touched: Field[] = ['podName', 'claimName', 'nodeSelector'];
  const pod: Pod = { name, target, node: null, mounted: false };
  const volume = activeVolume(state);
  const base = { ...state, podsStarted: sequence };

  if (volume && state.claim.bound) {
    if (volume.zone === zone) {
      return {
        state: { ...base, pod: { ...pod, node: target, mounted: true } },
        touched: [...touched, 'nodeName'],
        change: {
          title: `${name} assigned to ${target}; volume mounted`,
          changed: `Pod ${name} has nodeName ${target}. ${volume.name} is mounted at /var/lib/ledger with ${rowsOf(volume.rows)} already on it.`,
          actor: `kube-scheduler (VolumeBinding check passed), then the kubelet and CSI node plugin on ${target}`,
          reason: `The Pod's only eligible node is in ${label(zone)}, the same zone as ${volume.name}.`,
          notYet: 'Assigned and mounted is not Running or Ready. No container was started, so nothing new has been written.',
        },
      };
    }
    return {
      state: { ...base, pod },
      touched,
      change: {
        title: `${name} stays Pending`,
        changed: `Pod ${name} has no nodeName. Nothing was mounted; ${volume.name} rows are unchanged.`,
        actor: 'kube-scheduler (VolumeBinding filter)',
        reason: `${volume.name} is in ${label(volume.zone)}, and ${target} is in ${label(zone)}, so the volume's zone excludes ${target}.`,
        notYet: 'The claim and volume are unchanged. Delete this Pod, choose another node, and start again to try a different placement.',
      },
    };
  }

  if (!fixtureOffers(state.claim.access)) {
    return {
      state: { ...base, pod },
      touched,
      change: {
        title: `${name} stays Pending`,
        changed: `Pod ${name} has no nodeName. PVC ${CLAIM_NAME} is still Pending.`,
        actor: 'kube-scheduler (VolumeBinding): the claim cannot be bound',
        reason: `The fixture provisioner supports ReadWriteOnce only, so ${CLAIM_NAME} cannot be provisioned.`,
        notYet: 'No PV and no node assignment. Scheduling cannot repair the claim request.',
      },
    };
  }

  if (state.config.binding === 'WaitForFirstConsumer') {
    const boundName = volumeName(state.volumesCreated);
    const created: Volume = { name: boundName, zone, reclaim: state.config.reclaim, released: false, rows: 0 };
    return {
      state: {
        ...base,
        claim: { ...state.claim, bound: boundName },
        volumes: [...state.volumes, created],
        volumesCreated: state.volumesCreated + 1,
        pod: { ...pod, node: target, mounted: true },
      },
      touched: [...touched, 'volumeName', 'nodeName'],
      change: {
        title: `${target} chosen; ${boundName} created in ${label(zone)}`,
        changed: `Pod ${name} has nodeName ${target}. PV ${boundName} was created in ${label(zone)}, bound to ${CLAIM_NAME}, and mounted with no rows written yet.`,
        actor: `kube-scheduler selected ${target}, then the fast-zonal provisioner created the volume in that zone`,
        reason: 'WaitForFirstConsumer: the volume zone comes from the node the Pod was scheduled to.',
        notYet: 'Assigned and mounted is not Running or Ready. No container was started.',
      },
    };
  }

  // Immediate with a fixture class that offers the mode always binds at claim time, so this is not reachable through the UI.
  return {
    state: { ...base, pod },
    touched,
    change: {
      title: `${name} stays Pending`,
      changed: `Pod ${name} has no nodeName. PVC ${CLAIM_NAME} is not bound.`,
      actor: 'kube-scheduler (VolumeBinding): the claim is not bound',
      reason: 'The claim has no volume yet, so the Pod cannot be placed against one.',
      notYet: 'No volume and no node assignment.',
    },
  };
}

function deletePod(state: State): Outcome {
  const pod = state.pod;
  if (!pod) return noop(state, 'No Pod to delete', 'Nothing was removed.', 'The writer Pod is already absent.');
  const volume = activeVolume(state);
  const touched: Field[] = ['podName', 'nodeName'];
  const removed = { ...state, pod: null };
  if (state.claim?.terminating) {
    if (volume) {
      const reclaimed = reclaimVolume(removed, volume);
      const rows = volume.rows;
      const deleted = volume.reclaim === 'Delete';
      return {
        state: { ...removed, claim: null, volumes: reclaimed },
        touched: [...touched, 'phase'],
        change: deleted
          ? {
              title: `${pod.name} deleted; ${CLAIM_NAME} finalized`,
              changed: `Pod removed. The waiting claim ${CLAIM_NAME} was removed; reclaim Delete removed PV ${volume.name} and its backing volume with ${rowsOf(rows)}.`,
              actor: 'Storage object-in-use protection, then the PV controller (reclaim Delete)',
              reason: `The claim waited for its last Pod. ${volume.name} copied reclaimPolicy Delete from ${CLASS_NAME} when it was provisioned.`,
              notYet: 'The rows are gone from this fixture, and no backup exists.',
            }
          : {
              title: `${pod.name} deleted; ${CLAIM_NAME} finalized`,
              changed: `Pod removed. The waiting claim ${CLAIM_NAME} was removed; PV ${volume.name} is Released and keeps ${rowsOf(rows)}.`,
              actor: 'Storage object-in-use protection, then the PV controller (reclaim Retain)',
              reason: `The claim waited for its last Pod. ${volume.name} copied reclaimPolicy Retain, so the PV and its data are kept.`,
              notYet: 'Released is not Available: a new claim does not bind it, and it is not a clean volume or a backup.',
            },
      };
    }
    return {
      state: { ...removed, claim: null },
      touched: [...touched, 'phase'],
      change: {
        title: `${pod.name} deleted; ${CLAIM_NAME} removed`,
        changed: `Pod removed. The waiting claim ${CLAIM_NAME} was removed; it had no volume to reclaim.`,
        actor: 'Storage object-in-use protection',
        reason: 'The claim was in use until its last Pod was removed.',
        notYet: 'No volume existed, so there was nothing to reclaim.',
      },
    };
  }
  return {
    state: removed,
    touched,
    change: {
      title: `${pod.name} deleted; ${volume ? 'claim and data stay' : 'claim stays'}`,
      changed: pod.mounted
        ? `Pod object removed. ${volume ? `${volume.name} stays Bound to ${CLAIM_NAME} with ${rowsOf(volume.rows)}.` : `Claim ${CLAIM_NAME} stays.`}`
        : `Pending Pod object removed. Nothing was mounted, and ${CLAIM_NAME} stays.`,
      actor: 'You (kubectl delete pod). Nothing recreates a bare Pod.',
      reason: 'Deleting a Pod releases its node and mount. The PVC and PV have their own lifecycle.',
      notYet: 'No replacement Pod exists. A new Pod object, with a new name, would have to mount the same claim.',
    },
  };
}

function deleteClaim(state: State): Outcome {
  const claim = state.claim;
  if (!claim) return noop(state, 'No claim to delete', 'Nothing was removed.', `PVC ${CLAIM_NAME} is already absent.`);
  if (claim.terminating) return noop(state, `${CLAIM_NAME} is already Terminating`, 'Removal is already waiting for its Pod.', 'Protection finalizer is in place.');
  const volume = activeVolume(state);
  if (state.pod) {
    return {
      state: { ...state, claim: { ...claim, terminating: true } },
      touched: ['finalizer'],
      change: {
        title: `${CLAIM_NAME} is Terminating, not removed`,
        changed: `PVC ${CLAIM_NAME} has a deletion request and the kubernetes.io/pvc-protection finalizer. It is still ${claim.bound ? `Bound to ${claim.bound}` : 'Pending'}.`,
        actor: 'Storage object-in-use protection (kubernetes.io/pvc-protection)',
        reason: `${state.pod.name} references ${CLAIM_NAME}, so removal waits until no Pod uses it.`,
        notYet: 'No reclaim has run. Deleting the Pod lets removal continue.',
      },
    };
  }
  if (!volume) {
    return {
      state: { ...state, claim: null },
      touched: ['phase'],
      change: {
        title: `${CLAIM_NAME} removed; no volume existed`,
        changed: `PVC ${CLAIM_NAME} is gone. It was still Pending, so no PV or backing volume existed.`,
        actor: 'You (kubectl delete pvc)',
        reason: 'A Pending claim has no volume to reclaim.',
        notYet: 'Submit a new claim to provision a volume.',
      },
    };
  }
  const reclaimed = reclaimVolume(state, volume);
  const next = { ...state, claim: null, volumes: reclaimed };
  if (volume.reclaim === 'Delete') {
    return {
      state: next,
      touched: ['phase', 'reclaim'],
      change: {
        title: `${CLAIM_NAME} removed; ${volume.name} deleted`,
        changed: `PVC gone. PV ${volume.name} was removed, and its backing volume with ${rowsOf(volume.rows)} was deleted.`,
        actor: 'PV controller applying reclaimPolicy Delete (the provisioner deletes the backing volume)',
        reason: `${volume.name} copied reclaimPolicy Delete from ${CLASS_NAME} when it was provisioned.`,
        notYet: 'The data was deleted by claim removal. No backup exists in this fixture.',
      },
    };
  }
  return {
    state: next,
    touched: ['phase', 'reclaim'],
    change: {
      title: `${CLAIM_NAME} removed; ${volume.name} Released`,
      changed: `PVC gone. PV ${volume.name} is Released, and its backing volume keeps ${rowsOf(volume.rows)}.`,
      actor: 'PV controller applying reclaimPolicy Retain',
      reason: `${volume.name} copied reclaimPolicy Retain from ${CLASS_NAME} when it was provisioned, so the PV and its data are kept.`,
      notYet: 'Released is not Available for a new claim, and it is not a backup or a clean volume. Manual cleanup or reuse is still needed.',
    },
  };
}

function setConfig(state: State, key: 'binding' | 'reclaim' | 'access', value: string): Outcome {
  if (state.config[key] === value) return noop(state, 'No change', `${key} is already ${value}.`, 'Nothing was reset.');
  const config = { ...state.config, [key]: value } as Config;
  const names: Record<typeof key, string> = { binding: 'Volume binding mode', reclaim: 'Reclaim policy', access: 'Claim access mode' };
  return {
    state: emptyState(config),
    touched: [key],
    change: {
      title: 'Scenario reset for a new claim',
      changed: `${names[key]} set to ${value}. PVC, PV, Pod and any Released volumes are removed from this fixture.`,
      actor: 'You (fixture setup)',
      reason: 'Binding mode, reclaim policy and access mode are fixed when the claim and its volume are created, so the fixture starts again.',
      notYet: 'A real cluster does not rewrite existing PVs when a StorageClass changes; each PV keeps the reclaim policy it was provisioned with.',
    },
  };
}

function setPodNode(state: State, node: NodeName): Outcome {
  if (state.pod) return noop(state, 'Pod target is fixed', `${state.pod.name} already targets ${state.pod.target}.`, 'Delete the Pod before choosing another target.');
  if (state.config.podNode === node) return noop(state, 'No change', `Next Pod already targets ${node}.`, 'Nothing was reset.');
  return {
    state: { ...state, config: { ...state.config, podNode: node } },
    touched: [],
    change: {
      title: `Next Pod can only use ${node}`,
      changed: `The next Pod's only eligible node is ${node} in ${label(nodeZone[node])}. Nothing existing changed.`,
      actor: 'You (fixture: a single eligible node for the next Pod)',
      reason: 'Real placement is the scheduler\'s work. Here you limit the candidate set to show how topology affects placement.',
      notYet: 'No Pod exists yet, so no placement has happened.',
    },
  };
}

/** Writes one row from the application in a mounted Pod. Kubernetes never writes application rows. */
function append(state: State): Outcome {
  const pod = state.pod;
  const volume = activeVolume(state);
  if (!pod || !pod.mounted || !volume) return noop(state, 'Nothing appended', 'No row was written.', 'An application writes only from a Pod that is assigned and has the claim mounted.');
  const rows = volume.rows + 1;
  return {
    state: { ...state, volumes: state.volumes.map((v) => (v.name === volume.name ? { ...v, rows } : v)) },
    touched: [],
    change: {
      title: `Row ${rows} appended to ${volume.name}`,
      changed: `${volume.name} now holds ${rowsOf(rows)}. The application in ${pod.name} wrote to /var/lib/ledger.`,
      actor: `the application in ${pod.name} (not Kubernetes)`,
      reason: 'The app wrote to /var/lib/ledger on the volume, which is mounted in that Pod.',
      notYet: 'Kubernetes did not copy, back up or replicate this row.',
    },
  };
}

export function transition(state: State, action: Action): Outcome {
  switch (action.type) {
    case 'submit': return submit(state);
    case 'start': return startPod(state);
    case 'deletePod': return deletePod(state);
    case 'deleteClaim': return deleteClaim(state);
    case 'reset': return {
      state: emptyState(initialConfig),
      touched: [],
      change: { title: 'Empty fixture', changed: 'All objects removed and classes reset to defaults.', actor: 'You (fixture setup)', reason: 'Starts a new scenario.', notYet: 'Nothing has been provisioned.' },
    };
    case 'setConfig': return setConfig(state, action.key, action.value);
    case 'setPodNode': return setPodNode(state, action.node);
    case 'append': return append(state);
  }
}

/** One-line readout placed beside the controls: what exists now, with no hidden predicate. */
export function summary(state: State): string {
  const volume = activeVolume(state);
  const parts: string[] = [];
  if (!state.claim) parts.push(`No claim. Submit ${CLAIM_NAME} to request storage.`);
  else if (!state.claim.bound) parts.push(state.claim.terminating ? `${CLAIM_NAME} Terminating` : `${CLAIM_NAME} Pending: no volume yet`);
  else parts.push(`${CLAIM_NAME} ${state.claim.terminating ? 'Terminating' : 'Bound'} → ${state.claim.bound}`);
  if (state.pod) parts.push(state.pod.node ? `${state.pod.name} assigned to ${state.pod.node}` : `${state.pod.name} Pending`);
  if (volume) parts.push(rowsOf(volume.rows) + ` on ${volume.name}`);
  return parts.join(' · ') + '.';
}

export interface Ledger {
  rows: Array<{ name: string; zone: Zone; reclaim: ReclaimPolicy; phase: 'Bound' | 'Released'; rows: number; backing: 'present' | 'kept' }>;
  bound: number;
  released: number;
}

/** Per-owner counts: every volume here was provisioned by the same StorageClass. */
export function ledger(state: State): Ledger {
  const rows = state.volumes.map((v) => ({
    name: v.name,
    zone: v.zone,
    reclaim: v.reclaim,
    phase: v.released ? 'Released' as const : 'Bound' as const,
    rows: v.rows,
    backing: v.released ? 'kept' as const : 'present' as const,
  }));
  return { rows, bound: rows.filter((r) => r.phase === 'Bound').length, released: rows.filter((r) => r.phase === 'Released').length };
}

/** The YAML the figure's state implies. Absent objects are omitted, not invented. */
export function manifestLines(state: State, touched: readonly Field[] = []): ManifestLine[] {
  const lines: ManifestLine[] = [];
  const add = (text: string, field?: Field) => lines.push({ text, highlight: field !== undefined && touched.includes(field) });
  add('# StorageClass: cluster policy written by the administrator');
  add('apiVersion: storage.k8s.io/v1');
  add('kind: StorageClass');
  add('metadata:');
  add(`  name: ${CLASS_NAME}`);
  add('provisioner: csi.example.com/zonal-block');
  add(`reclaimPolicy: ${state.config.reclaim}`, 'reclaim');
  add(`volumeBindingMode: ${state.config.binding}`, 'binding');
  if (state.claim) {
    const claim = state.claim;
    const volume = activeVolume(state);
    add('---');
    add('# PersistentVolumeClaim: the workload\'s request');
    add('apiVersion: v1');
    add('kind: PersistentVolumeClaim');
    add('metadata:');
    add(`  name: ${CLAIM_NAME}`);
    if (claim.terminating) {
      add('  finalizers:');
      add('    - kubernetes.io/pvc-protection', 'finalizer');
    }
    add('spec:');
    add('  accessModes:');
    add(`    - ${claim.access}`, 'access');
    add('  resources:');
    add('    requests:');
    add('      storage: 1Gi');
    add(`  storageClassName: ${CLASS_NAME}`);
    if (volume && claim.bound) add(`  volumeName: ${volume.name}`, 'volumeName');
    add('status:');
    add(`  phase: ${claim.bound ? 'Bound' : 'Pending'}`, 'phase');
  }
  if (state.pod) {
    const pod = state.pod;
    add('---');
    add('# Pod: a bare writer, so no controller recreates it');
    add('apiVersion: v1');
    add('kind: Pod');
    add('metadata:');
    add(`  name: ${pod.name}`, 'podName');
    add('spec:');
    add('  nodeSelector:', 'nodeSelector');
    add(`    kubernetes.io/hostname: ${pod.target}`, 'nodeSelector');
    add(pod.node ? `  nodeName: ${pod.node} # set by kube-scheduler on assignment` : '  # no nodeName yet: the scheduler writes it on assignment', pod.node ? 'nodeName' : undefined);
    add('  containers:');
    add('    - name: writer');
    add('      image: registry.example.com/ledger-writer:1.4');
    add('      volumeMounts:');
    add('        - name: data');
    add('          mountPath: /var/lib/ledger');
    add('  volumes:');
    add('    - name: data');
    add('      persistentVolumeClaim:');
    add(`        claimName: ${CLAIM_NAME}`, 'claimName');
  }
  return lines;
}
