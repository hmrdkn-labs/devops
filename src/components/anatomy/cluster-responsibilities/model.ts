import type { Change } from '../shared/ChangeReport';
import type { BadgeTone } from '../shared/StateBadge';

/** Fixture identities. The Pod name follows ReplicaSet naming: <replicaset>-<generated suffix>. */
export const names = {
  deployment: 'demo',
  replicaSet: 'demo-7c5d9f8b6d',
  pod: 'demo-7c5d9f8b6d-q8k2m',
  node: 'node-a',
} as const;

/** Physical drawers and boards. Inspection pulls a drawer; it never changes a checkpoint. */
export const actors = [
  { id: 'api', name: 'API server', location: 'Control plane · top drawer', role: 'Authenticates, authorizes and admission-checks every API request, then persists accepted objects through etcd. It does not start containers.' },
  { id: 'store', name: 'etcd', location: 'Control plane · second drawer', role: 'Durably stores Kubernetes API state; components reach it through the API server. It is not the application’s database.' },
  { id: 'controllers', name: 'Deployment and ReplicaSet controllers', location: 'Control plane · third drawer (kube-controller-manager)', role: 'Two built-in control loops on separate boards. The Deployment controller creates a ReplicaSet; the ReplicaSet controller creates Pods. Both write through the API server and neither starts a container.' },
  { id: 'scheduler', name: 'kube-scheduler', location: 'Control plane · bottom drawer', role: 'Looks for Pods with no node, selects a feasible node and records the assignment through the API. It never launches containers.' },
  { id: 'kubelet', name: 'kubelet on node-a', location: 'Node · upper tray', role: 'Acts on Pods bound to its node, coordinates node-side setup, asks the runtime through CRI and reports Pod status through the API.' },
  { id: 'runtime', name: 'Container runtime on node-a', location: 'Node · lower cartridge', role: 'Creates and starts containers when the kubelet asks. Image, network and storage setup must also succeed before a container runs.' },
] as const;
export type ActorId = typeof actors[number]['id'];

/** Witness latches: one per owner. A latch shifts when its owner has acted. */
export const witnesses = [
  { id: 'api', name: 'API server', drawer: 'api' },
  { id: 'store', name: 'etcd', drawer: 'store' },
  { id: 'deployment', name: 'Deployment controller', drawer: 'controllers' },
  { id: 'replicaset', name: 'ReplicaSet controller', drawer: 'controllers' },
  { id: 'scheduler', name: 'kube-scheduler', drawer: 'scheduler' },
  { id: 'kubelet', name: 'kubelet on node-a', drawer: 'kubelet' },
  { id: 'runtime', name: 'Container runtime', drawer: 'runtime' },
] as const satisfies ReadonlyArray<{ id: string; name: string; drawer: ActorId }>;
export type WitnessId = typeof witnesses[number]['id'];
export const LATCH_TRAVEL = 7;

export interface Checkpoint {
  title: string;
  /** Owners acting at this checkpoint (the checkpoint actor). */
  actors: readonly WitnessId[];
  changed: string;
  actor: string;
  reason: string;
  notYet: string;
  /** Manifest keys read or produced here; a bare document key lights the whole document. */
  lit: readonly string[];
}

export const stages: readonly Checkpoint[] = [
  {
    title: 'Draft only', actors: [], lit: [],
    changed: 'Nothing in the cluster. The one-replica Deployment exists only as a manifest on your machine.',
    actor: 'No cluster component. Nothing has been sent to the API server.',
    reason: 'A manifest states intent. A cluster acts on it only after a request is accepted.',
    notYet: 'No admission, no stored Deployment, ReplicaSet or Pod, no node assignment, no container.',
  },
  {
    title: 'Request accepted', actors: ['api'], lit: ['dep'],
    changed: 'The write passed authentication, authorization and admission. Nothing is stored yet.',
    actor: 'API server (kube-apiserver)',
    reason: 'Every API write is checked before it is persisted. A rejected request changes nothing downstream.',
    notYet: 'etcd has not stored the Deployment, and no controller has seen it.',
  },
  {
    title: 'Deployment stored', actors: ['api', 'store'], lit: ['dep.kind', 'dep.name'],
    changed: `Deployment ${names.deployment} is persisted as desired state in etcd.`,
    actor: 'API server wrote it · etcd holds it durably',
    reason: 'Other components read desired state through the API server rather than writing etcd themselves.',
    notYet: 'No ReplicaSet and no Pod exist. The Deployment has no rollout progress yet.',
  },
  {
    title: 'ReplicaSet created', actors: ['deployment'], lit: ['dep.replicas', 'rs.name', 'rs.owner', 'rs.replicas'],
    changed: `ReplicaSet ${names.replicaSet} with replicas 1 is stored, labelled with pod-template-hash 7c5d9f8b6d.`,
    actor: 'Deployment controller (kube-controller-manager), through the API server',
    reason: 'It finds no ReplicaSet for the Deployment’s current pod template, so it creates one from spec.template.',
    notYet: 'No Pod exists. The ReplicaSet controller has not acted, and nothing is scheduled.',
  },
  {
    title: 'Pod created · unassigned', actors: ['replicaset'], lit: ['pod.name', 'pod.owner', 'pod.phase'],
    changed: `Pod ${names.pod} is stored with an ownerReference to the ReplicaSet. spec.nodeName is absent and status.phase is Pending.`,
    actor: 'ReplicaSet controller (kube-controller-manager), through the API server',
    reason: 'The ReplicaSet wants one Pod and counts zero, so it creates one from its Pod template.',
    notYet: 'No node is chosen. Nothing is pulled or started. Pending means accepted but not set up, not a placement result.',
  },
  {
    title: 'Pod bound to node-a', actors: ['scheduler'], lit: ['pod.node'],
    changed: `spec.nodeName of ${names.pod} is now ${names.node}. status.phase is still Pending.`,
    actor: 'kube-scheduler, recording the assignment through the API server',
    reason: 'It looks for Pods with no node, selects a feasible one (node-a in this fixture) and records the binding.',
    notYet: 'No container has been created. Assignment is not execution.',
  },
  {
    title: 'Kubelet takes the Pod', actors: ['kubelet'], lit: ['pod.node'],
    changed: 'The kubelet on node-a sees the Pod bound to its node and begins node-side setup. It requests container operations from the runtime through CRI.',
    actor: 'kubelet on node-a',
    reason: 'The kubelet acts on Pods whose spec.nodeName is its own node.',
    notYet: 'No container is running, and status.phase is still Pending.',
  },
  {
    title: 'Container running · phase reported', actors: ['runtime', 'kubelet'], lit: ['pod.phase'],
    changed: 'The runtime has started the container. The kubelet reports status.phase Running through the API server.',
    actor: 'Container runtime (started the container) · kubelet (reported status)',
    reason: 'Running is the Pod phase for a Pod bound to a node whose containers are created and at least one is still running. The runtime started this container, so the kubelet can report that phase.',
    notYet: 'Running is not Ready. Readiness, the application answering requests and Service traffic are not checked by this fixture.',
  },
];

export function clampStage(stage: number): number {
  return Math.max(0, Math.min(stages.length - 1, Math.trunc(stage)));
}

/** The first checkpoint at which this owner acts. Each owner has exactly one. */
export function completionOf(id: WitnessId): number {
  return stages.findIndex((stage) => stage.actors.includes(id));
}

export function witnessDrawer(id: WitnessId): ActorId {
  return witnesses.find((witness) => witness.id === id)!.drawer;
}

export function actorNames(stage: number): string {
  const acting = stages[clampStage(stage)]!.actors;
  if (!acting.length) return 'None (draft)';
  return acting.map((id) => witnesses.find((witness) => witness.id === id)!.name).join(' + ');
}

export function snapshot(stage: number) {
  const index = clampStage(stage);
  return {
    index,
    deployments: index >= 2 ? 1 : 0,
    replicaSets: index >= 3 ? 1 : 0,
    pods: index >= 4 ? 1 : 0,
    node: index >= 5 ? names.node : null,
    phase: index >= 7 ? 'Running' : index >= 4 ? 'Pending' : null,
    runningContainers: index >= 7 ? 1 : 0,
  };
}

export type WitnessState = 'acting' | 'acted' | 'not-yet';

/** "acting" = in this checkpoint's actors; "acted" = completed at an earlier or this checkpoint. */
export function witnessState(stage: number, id: WitnessId): WitnessState {
  const index = clampStage(stage);
  if (stages[index]!.actors.includes(id)) return 'acting';
  return index >= completionOf(id) ? 'acted' : 'not-yet';
}

export const objectIds = ['deployment', 'replicaSet', 'pod', 'nodeName', 'phase'] as const;
export type ObjectId = typeof objectIds[number];

export interface ObjectRow { identity: string; tone: BadgeTone; label: string }

export function objectRow(stage: number, id: ObjectId): ObjectRow {
  const s = snapshot(stage);
  switch (id) {
    case 'deployment': return s.deployments ? { identity: `Deployment ${names.deployment}`, tone: 'pass', label: 'stored in etcd' } : { identity: `Deployment ${names.deployment}`, tone: 'wait', label: 'not created' };
    case 'replicaSet': return s.replicaSets ? { identity: `ReplicaSet ${names.replicaSet}`, tone: 'pass', label: 'created · replicas 1' } : { identity: `ReplicaSet ${names.replicaSet}`, tone: 'wait', label: 'not created' };
    case 'pod': return s.pods ? { identity: `Pod ${names.pod}`, tone: 'pass', label: 'created' } : { identity: `Pod ${names.pod}`, tone: 'wait', label: 'not created' };
    case 'nodeName': return s.node ? { identity: 'spec.nodeName', tone: 'pass', label: `set to ${s.node}` } : { identity: 'spec.nodeName', tone: 'wait', label: 'unset' };
    case 'phase': return s.phase === 'Running'
      ? { identity: 'status.phase', tone: 'pass', label: 'Running · not Ready' }
      : s.phase === 'Pending' ? { identity: 'status.phase', tone: 'wait', label: 'Pending' } : { identity: 'status.phase', tone: 'wait', label: 'no Pod' };
  }
}

export interface OwnerRow { name: string; identity: string; tone: BadgeTone; label: string; countLabel: string; count: number }

export function ownerRow(stage: number, id: WitnessId): OwnerRow {
  const s = snapshot(stage);
  const state = witnessState(stage, id);
  const witness = witnesses.find((item) => item.id === id)!;
  const status = state === 'acting' ? { tone: 'info' as const, label: 'acting at this checkpoint' }
    : state === 'acted' ? { tone: 'pass' as const, label: 'acted' } : { tone: 'wait' as const, label: 'not yet' };
  const detail = {
    api: { identity: `Deployment ${names.deployment}`, countLabel: 'requests admitted', count: s.index >= 1 ? 1 : 0 },
    store: { identity: 'Deployment, ReplicaSet and Pod records', countLabel: 'objects persisted', count: s.deployments + s.replicaSets + s.pods },
    deployment: { identity: `ReplicaSet ${names.replicaSet}`, countLabel: 'ReplicaSets created', count: s.replicaSets },
    replicaset: { identity: `Pod ${names.pod}`, countLabel: 'Pods created', count: s.pods },
    scheduler: { identity: `Pod ${names.pod} → ${names.node}`, countLabel: 'Pods bound', count: s.node ? 1 : 0 },
    kubelet: { identity: names.node, countLabel: 'Pods observed on node', count: s.index >= completionOf('kubelet') ? 1 : 0 },
    runtime: { identity: `container of ${names.pod}`, countLabel: 'containers started', count: s.runningContainers },
  }[id];
  return { name: witness.name, ...detail, ...status };
}

export interface ManifestLine { text: string; highlight: boolean }
interface Line { text: string; key: string }

/** Applied by the author. The Deployment is the only document a learner writes. */
const deployment: Line[] = [
  { text: '# Applied by you: the desired state', key: 'dep' },
  { text: 'apiVersion: apps/v1', key: 'dep' },
  { text: 'kind: Deployment', key: 'dep.kind' },
  { text: 'metadata:', key: 'dep' },
  { text: '  name: demo', key: 'dep.name' },
  { text: '  labels:', key: 'dep' },
  { text: '    app: demo', key: 'dep' },
  { text: 'spec:', key: 'dep' },
  { text: '  replicas: 1                # desired Pod count the Deployment controller reads', key: 'dep.replicas' },
  { text: '  selector:', key: 'dep' },
  { text: '    matchLabels:', key: 'dep' },
  { text: '      app: demo              # must match the template labels', key: 'dep' },
  { text: '  template:                  # Pod blueprint copied into the ReplicaSet', key: 'dep' },
  { text: '    metadata:', key: 'dep' },
  { text: '      labels:', key: 'dep' },
  { text: '        app: demo', key: 'dep' },
  { text: '    spec:', key: 'dep' },
  { text: '      containers:', key: 'dep' },
  { text: '      - name: web', key: 'dep' },
  { text: '        image: nginx:1.27', key: 'dep' },
  { text: '        ports:', key: 'dep' },
  { text: '        - containerPort: 80', key: 'dep' },
];

const replicaSet: Line[] = [
  { text: '# Observed, not applied: created by the Deployment controller (uid, blockOwnerDeletion, selector and template omitted)', key: 'rs' },
  { text: 'apiVersion: apps/v1', key: 'rs' },
  { text: 'kind: ReplicaSet', key: 'rs' },
  { text: 'metadata:', key: 'rs' },
  { text: `  name: ${names.replicaSet}`, key: 'rs.name' },
  { text: '  labels:', key: 'rs' },
  { text: '    app: demo', key: 'rs' },
  { text: '    pod-template-hash: 7c5d9f8b6d', key: 'rs' },
  { text: '  ownerReferences:', key: 'rs.owner' },
  { text: '  - apiVersion: apps/v1', key: 'rs.owner' },
  { text: '    kind: Deployment', key: 'rs.owner' },
  { text: '    name: demo', key: 'rs.owner' },
  { text: '    controller: true', key: 'rs.owner' },
  { text: 'spec:', key: 'rs' },
  { text: '  replicas: 1', key: 'rs.replicas' },
];

function podLines(index: number): Line[] {
  return [
    { text: '# Observed fragment, not applied: created by the ReplicaSet controller', key: 'pod' },
    { text: '# uid, blockOwnerDeletion and container details omitted', key: 'pod' },
    { text: 'apiVersion: v1', key: 'pod' },
    { text: 'kind: Pod', key: 'pod' },
    { text: 'metadata:', key: 'pod' },
    { text: `  name: ${names.pod}`, key: 'pod.name' },
    { text: '  labels:', key: 'pod' },
    { text: '    app: demo', key: 'pod' },
    { text: '    pod-template-hash: 7c5d9f8b6d', key: 'pod' },
    { text: '  ownerReferences:', key: 'pod.owner' },
    { text: '  - apiVersion: apps/v1', key: 'pod.owner' },
    { text: '    kind: ReplicaSet', key: 'pod.owner' },
    { text: `    name: ${names.replicaSet}`, key: 'pod.owner' },
    { text: '    controller: true', key: 'pod.owner' },
    { text: 'spec:', key: 'pod' },
    index >= 5
      ? { text: `  nodeName: ${names.node}`, key: 'pod.node' }
      : { text: '  # nodeName is absent until the scheduler binds the Pod', key: 'pod.node' },
    { text: 'status:', key: 'pod' },
    { text: `  phase: ${index >= 7 ? 'Running' : 'Pending'}`, key: 'pod.phase' },
  ];
}

/** Full document at checkpoint 7: the text the explanation's YAML example reproduces. */
export function manifest(stage: number): ManifestLine[] {
  const index = clampStage(stage);
  const lit = new Set<string>(stages[index]!.lit);
  const isLit = (line: Line) => lit.has(line.key) || lit.has(line.key.split('.')[0]!);
  const out: Line[][] = [deployment];
  out.push(index >= 3 ? replicaSet : [{ text: `# ReplicaSet ${names.replicaSet}: not created yet`, key: 'none' }]);
  out.push(index >= 4 ? podLines(index) : [{ text: `# Pod ${names.pod}: not created yet`, key: 'none' }]);
  const lines: ManifestLine[] = [];
  out.forEach((doc, i) => {
    if (i > 0) lines.push({ text: '---', highlight: false });
    for (const line of doc) lines.push({ text: line.text, highlight: isLit(line) });
  });
  return lines;
}

/** Reports for each control. The "Moving" prefix is applied by the figure while the carriage travels. */
export function checkpointReport(index: number): Change {
  const at = clampStage(index);
  const stage = stages[at]!;
  return { title: `Checkpoint ${at} · ${stage.title}`, changed: stage.changed, actor: stage.actor, reason: stage.reason, notYet: stage.notYet };
}

export function inspectionReport(id: ActorId, kind: 'select' | 'open' | 'close'): Change {
  const actor = actors.find((item) => item.id === id)!;
  const changed = kind === 'select'
    ? `View only: ${actor.name} is now the inspected actor. Any pulled drawer slides back; the checkpoint and objects are unchanged.`
    : `View only: the ${actor.name} board ${kind === 'open' ? 'is pulled out on its rails' : 'is pushed back'}. The checkpoint and objects are unchanged.`;
  return {
    title: kind === 'select' ? `Inspecting ${actor.name}` : kind === 'open' ? `${actor.name} drawer pulled out` : `${actor.name} drawer pushed back`,
    changed,
    actor: 'You, the learner. Inspection is not a Kubernetes component and makes no API call.',
    reason: `To read which responsibility ${actor.name} owns in this trace.`,
    notYet: 'No API object was created, changed or deleted, and no checkpoint was advanced.',
  };
}

export function resetReport(): Change {
  return {
    title: 'Back to draft',
    changed: 'The checkpoint returns to 0: no Deployment, ReplicaSet or Pod is shown and there is no node assignment. The inspected actor is unchanged.',
    actor: 'You, the learner. This resets the teaching fixture; it is not a kubectl delete.',
    reason: 'To rerun the chain from the first checkpoint.',
    notYet: 'No cluster was contacted or changed, and no real object was removed.',
  };
}
