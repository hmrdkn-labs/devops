/**
 * Pure fixture model. The figure, ChangeReport, ledger and ManifestPanel all derive from this.
 * Identity: kind + namespace (namespaced kinds only) + name. Names are unique per identity.
 */
export const namespaceNames = ['team-a', 'team-b'] as const;
export type NamespaceName = (typeof namespaceNames)[number];
export type NamespacePhase = 'Active' | 'Terminating' | 'Absent';
export const namespacedKinds = ['Deployment', 'Service', 'NetworkPolicy'] as const;
export type NamespacedKind = (typeof namespacedKinds)[number];
export type Kind = NamespacedKind | 'ClusterRole';
export type Name = 'web' | 'api' | 'deny-ingress';

export interface ObjectId { kind: Kind; namespace?: NamespaceName; name: Name }
export interface World { phases: Record<NamespaceName, NamespacePhase>; objects: ObjectId[] }
export interface Selection { namespace: NamespaceName; kind: Kind; name: Name }

export const initialSelection: Selection = { namespace: 'team-a', kind: 'Deployment', name: 'web' };
export const initialWorld: World = {
  phases: { 'team-a': 'Active', 'team-b': 'Active' },
  objects: [{ kind: 'Deployment', namespace: 'team-a', name: 'web' }],
};

export type Code =
  | 'created' | 'deleted' | 'not-found' | 'already-exists'
  | 'namespace-terminating' | 'namespace-not-found'
  | 'terminating-started' | 'cleanup-finished' | 'namespace-created';

export interface Result { world: World; code: Code; touched: ObjectId[] }

/** Every namespaced identity the fixture can hold; each has one card place in its drawer. */
export const namespacedIdentities: Array<{ kind: NamespacedKind; name: Name }> = [
  { kind: 'Deployment', name: 'web' },
  { kind: 'Deployment', name: 'api' },
  { kind: 'Service', name: 'web' },
  { kind: 'Service', name: 'api' },
  { kind: 'NetworkPolicy', name: 'deny-ingress' },
];
export const clusterNames: Array<Exclude<Name, 'deny-ingress'>> = ['web', 'api'];
/** Opacity of a Terminating namespace: still present, marked, not accepting new objects. */
export const TERMINATING_OPACITY = 0.55;


export const cardKey = (id: { kind: Kind; name: Name }): string => `${id.kind}/${id.name}`;

export const isNamespaced = (kind: Kind): kind is NamespacedKind => kind !== 'ClusterRole';

/** NetworkPolicy has one fixture name; cluster-scoped and namespaced kinds offer two. */
export function nameOptions(kind: Kind): Name[] {
  return kind === 'NetworkPolicy' ? ['deny-ingress'] : ['web', 'api'];
}

/** The identity a selection names. A ClusterRole never carries a namespace; a NetworkPolicy always has its fixed name. */
export function objectFor(selection: Selection): ObjectId {
  const name = selection.kind === 'NetworkPolicy' ? 'deny-ingress' : selection.name;
  return isNamespaced(selection.kind)
    ? { kind: selection.kind, namespace: selection.namespace, name }
    : { kind: selection.kind, name };
}

export function sameObject(a: ObjectId, b: ObjectId): boolean {
  return a.kind === b.kind && a.name === b.name && a.namespace === b.namespace;
}

export function identityOf(id: ObjectId): string {
  return isNamespaced(id.kind) ? `${id.kind}/${id.namespace}/${id.name}` : `${id.kind}/${id.name}`;
}

export function hasObject(world: World, id: ObjectId): boolean {
  return world.objects.some((object) => sameObject(object, id));
}

export function objectsIn(world: World, namespace: NamespaceName): ObjectId[] {
  return world.objects.filter((object) => object.namespace === namespace);
}

export function createObject(world: World, selection: Selection): Result {
  const id = objectFor(selection);
  if (id.namespace) {
    const phase = world.phases[id.namespace];
    if (phase === 'Absent') return { world, code: 'namespace-not-found', touched: [] };
    // Terminating namespaces accept no new objects; existing ones remain until cleanup.
    if (phase === 'Terminating') return { world, code: 'namespace-terminating', touched: [] };
  }
  if (hasObject(world, id)) return { world, code: 'already-exists', touched: [] };
  return { world: { ...world, objects: [...world.objects, id] }, code: 'created', touched: [id] };
}

export function deleteObject(world: World, selection: Selection): Result {
  const id = objectFor(selection);
  if (!hasObject(world, id)) return { world, code: 'not-found', touched: [] };
  return { world: { ...world, objects: world.objects.filter((object) => !sameObject(object, id)) }, code: 'deleted', touched: [id] };
}

/** One namespace button that advances the lifecycle: Active → Terminating → Absent → Active. */
export function advanceNamespace(world: World, namespace: NamespaceName): Result {
  const phase = world.phases[namespace];
  const touched: ObjectId[] = [];
  if (phase === 'Active') {
    return { world: { ...world, phases: { ...world.phases, [namespace]: 'Terminating' } }, code: 'terminating-started', touched };
  }
  if (phase === 'Terminating') {
    // The namespace controller removes namespaced content only; cluster-scoped objects are never inside a namespace.
    const removed = objectsIn(world, namespace);
    return {
      world: {
        phases: { ...world.phases, [namespace]: 'Absent' },
        objects: world.objects.filter((object) => object.namespace !== namespace),
      },
      code: 'cleanup-finished',
      touched: removed,
    };
  }
  return { world: { ...world, phases: { ...world.phases, [namespace]: 'Active' } }, code: 'namespace-created', touched };
}

/** What a client in team-a sees when resolving and reaching Service web in team-b. */
export function reachTo(world: World, namespace: NamespaceName) {
  const serviceName = hasObject(world, { kind: 'Service', namespace, name: 'web' });
  const policyIsolates = world.objects.some((object) => object.kind === 'NetworkPolicy' && object.namespace === namespace);
  return { serviceName, allowed: !policyIsolates };
}

export interface ManifestLine { text: string; identity: boolean }

/** The YAML for the selected object. Identity lines (kind, namespace, name) are what an action reads. */
export function manifestFor(selection: Selection): { lines: ManifestLine[]; note: string } {
  const { kind, name, namespace } = objectFor(selection);
  const ns = namespace ?? '';
  const plain = (text: string): ManifestLine => ({ text, identity: false });
  const id = (text: string): ManifestLine => ({ text, identity: true });
  if (kind === 'Deployment') {
    return {
      note: 'Namespaced: metadata.namespace is part of identity.',
      lines: [
        plain('apiVersion: apps/v1'), id('kind: Deployment'), id(`metadata:`), id(`  name: ${name}`), id(`  namespace: ${ns}`),
        plain('spec:'), plain('  replicas: 1'), plain('  selector:'), plain('    matchLabels:'), plain(`      app: ${name}`),
        plain('  template:'), plain('    metadata:'), plain('      labels:'), plain(`        app: ${name}`),
        plain('    spec:'), plain('      containers:'), plain(`        - name: ${name}`), plain('          image: nginx:1.27'),
      ],
    };
  }
  if (kind === 'Service') {
    return {
      note: 'Namespaced: the DNS name includes the namespace.',
      lines: [
        plain('apiVersion: v1'), id('kind: Service'), id('metadata:'), id(`  name: ${name}`), id(`  namespace: ${ns}`),
        plain('spec:'), plain('  selector:'), plain(`    app: ${name}`), plain('  ports:'), plain('    - port: 80'), plain('      targetPort: 80'),
      ],
    };
  }
  if (kind === 'NetworkPolicy') {
    return {
      note: 'Namespaced: applies only to pods in its own namespace.',
      lines: [
        plain('apiVersion: networking.k8s.io/v1'), id('kind: NetworkPolicy'), id('metadata:'), id(`  name: ${name}`), id(`  namespace: ${ns}`),
        plain('spec:'), plain('  podSelector: {}'), plain('  policyTypes:'), plain('    - Ingress'),
      ],
    };
  }
  return {
    note: 'Cluster-scoped: there is no metadata.namespace line; the identity is kind + name only.',
    lines: [
      plain('apiVersion: rbac.authorization.k8s.io/v1'), id('kind: ClusterRole'), id('metadata:'), id(`  name: ${name}`),
      plain('rules:'), plain('  - apiGroups: [""]'), plain('    resources: ["services"]'), plain('    verbs: ["get", "list"]'),
    ],
  };
}

export interface Narration { title: string; changed: string; actor: string; reason: string; notYet?: string }

/** What a successful create does not yet prove, by kind. Enforcement and granting are separate from storage. */
function createdNotYet(id: ObjectId): string {
  if (id.kind === 'Deployment') return 'No Pods were created or started. A Deployment is stored intent; its controller acts separately.';
  if (id.kind === 'Service') return 'No backing Pods or endpoints are checked. In this fixture the name resolves from the Service object alone.';
  if (id.kind === 'NetworkPolicy') return 'Enforcement is not shown: it needs a network plugin that implements NetworkPolicy. This fixture assumes one does.';
  return 'Nothing is granted yet. A ClusterRole has no effect until a RoleBinding or ClusterRoleBinding refers to it.';
}

/** Plain-language account of one interaction: what changed, who did it, why, and what did not happen. */
export function narrate(result: Result, selection: Selection, before: World): Narration {
  const id = objectFor(selection);
  const where = id.namespace ? `namespace ${id.namespace}` : 'the cluster (no namespace)';
  const label = `${id.kind} ${id.name}`;
  const ns = selection.namespace;
  const cluster = 'Other namespaces and cluster-scoped objects are not changed.';
  switch (result.code) {
    case 'created':
      return {
        title: `${label} created in ${where}`,
        changed: `Stored as ${id.kind}/${id.namespace ? id.namespace + '/' : ''}${id.name}. ${id.namespace ? `The same name in another namespace is a different object.` : 'No namespace is part of this identity.'}`,
        actor: 'You, through the API server (authentication, authorization and admission passed)',
        reason: `No existing ${id.kind} named ${id.name} occupied this identity.`,
        notYet: createdNotYet(id),
      };
    case 'already-exists':
      return {
        title: `Create refused: ${label} already exists in ${where}`,
        changed: 'Nothing changed. The existing object was not modified.',
        actor: 'API server, uniqueness check on kind, namespace and name',
        reason: id.namespace
          ? `Names are unique per kind within one namespace, and ${label} already occupies it in ${id.namespace}.`
          : `ClusterRole names are unique across the whole cluster; ${label} already exists, regardless of the namespace selector.`,
        notYet: 'Create is not update. kubectl apply would patch the existing object instead of adding a second one.',
      };
    case 'namespace-terminating':
      return {
        title: `Create refused: ${ns} is Terminating`,
        changed: 'Nothing changed. Existing objects in the namespace remain.',
        actor: 'API server, namespace lifecycle check',
        reason: 'A Terminating namespace cannot accept new objects.',
        notYet: `${ns} is still present until its namespaced objects are cleaned up.`,
      };
    case 'namespace-not-found':
      return {
        title: `Create refused: namespace ${ns} not found`,
        changed: 'Nothing changed.',
        actor: 'API server',
        reason: `A namespaced object needs an existing namespace; ${ns} is absent.`,
        notYet: 'Creating the namespace does not create any object inside it.',
      };
    case 'deleted':
      return {
        title: `${label} deleted from ${where}`,
        changed: `${id.kind}/${id.namespace ? id.namespace + '/' : ''}${id.name} removed. Same-named objects elsewhere remain.`,
        actor: 'You, through the API server',
        reason: `You asked to delete this exact identity.`,
        notYet: id.kind === 'Deployment' ? `${cluster} Pods a controller created earlier are not modelled here.` : cluster,
      };
    case 'not-found':
      return {
        title: `Delete found nothing: ${label} is not in ${where}`,
        changed: 'Nothing changed.',
        actor: 'API server',
        reason: 'No object has this exact identity.',
        notYet: cluster,
      };
    case 'terminating-started': {
      const count = objectsIn(before, ns).length;
      return {
        title: `${ns} is Terminating`,
        changed: `${ns} accepts no new objects. Its ${count} namespaced object${count === 1 ? '' : 's'} still exist.`,
        actor: 'API server, marking the namespace for deletion; the namespace controller acts next',
        reason: `You deleted namespace ${ns}. Deletion is asynchronous.`,
        notYet: `Nothing inside ${ns} has been removed yet. ClusterRole objects are outside every namespace and are never removed by this action.`,
      };
    }
    case 'cleanup-finished': {
      const removed = result.touched.length;
      return {
        title: `${ns} removed with ${removed} namespaced object${removed === 1 ? '' : 's'}`,
        changed: `Namespaced objects in ${ns} were deleted, then the namespace itself was removed.`,
        actor: 'Namespace controller, finishing the cascade',
        reason: 'Deleting a namespace deletes every namespaced object inside it.',
        notYet: cluster,
      };
    }
    case 'namespace-created':
      return {
        title: `${ns} created, empty`,
        changed: `${ns} is Active. It has no objects until you create some.`,
        actor: 'You, through the API server',
        reason: `${ns} was absent, so the name was free.`,
        notYet: 'A new namespace has no Roles, RoleBindings, NetworkPolicies or ResourceQuotas unless someone creates them.',
      };
  }
}

/** Animation targets for every visual element, derived only from the model. Keys match the figure's refs. */
export function sceneGoals(world: World, selection: Selection): Record<string, number> {
  const goals: Record<string, number> = { lid: reachTo(world, 'team-b').allowed ? 0 : 1 };
  for (const ns of namespaceNames) {
    const phase = world.phases[ns];
    goals[`open:${ns}`] = selection.namespace === ns && phase !== 'Absent' ? 1 : 0;
    goals[`fade:${ns}`] = phase === 'Active' ? 1 : phase === 'Terminating' ? TERMINATING_OPACITY : 0;
    for (const id of namespacedIdentities) {
      goals[`card:${ns}:${cardKey(id)}`] = hasObject(world, { ...id, namespace: ns }) ? 1 : 0;
    }
  }
  for (const name of clusterNames) goals[`card:tower:${name}`] = hasObject(world, { kind: 'ClusterRole', name }) ? 1 : 0;
  return goals;
}
