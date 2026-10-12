import { describe, expect, it } from 'vitest';
import {
  advanceNamespace, createObject, deleteObject, initialWorld, manifestFor, objectFor,
  reachTo, type ObjectId, type Selection, type World,
} from '../src/components/anatomy/namespaces-scope/model';

const deployment = (namespace: 'team-a' | 'team-b', name: 'web' | 'api' = 'web'): Selection => ({ namespace, kind: 'Deployment', name });
const service = (namespace: 'team-a' | 'team-b', name: 'web' | 'api' = 'web'): Selection => ({ namespace, kind: 'Service', name });
const clusterRole = (name: 'web' | 'api' = 'web'): Selection => ({ namespace: 'team-b', kind: 'ClusterRole', name });

function withObjects(objects: ObjectId[], phases: World['phases'] = { 'team-a': 'Active', 'team-b': 'Active' }): World {
  return { phases, objects };
}

describe('name uniqueness is per kind, per namespace, and cluster-wide only for cluster-scoped kinds', () => {
  it('allows the same kind and name in two namespaces, but refuses a duplicate inside one namespace', () => {
    const first = createObject(initialWorld, deployment('team-b'));
    expect(first.code).toBe('created');
    const duplicate = createObject(first.world, deployment('team-b'));
    expect(duplicate.code).toBe('already-exists');
    expect(duplicate.world).toBe(first.world);
  });

  it('keeps different kinds with the same name apart in one namespace', () => {
    const world = withObjects([{ kind: 'Deployment', namespace: 'team-a', name: 'web' }]);
    expect(createObject(world, service('team-a')).code).toBe('created');
  });

  it('treats a ClusterRole as one object whatever namespace is selected', () => {
    const created = createObject(initialWorld, clusterRole());
    expect(created.code).toBe('created');
    expect(created.touched[0]!.namespace).toBeUndefined();
    expect(createObject(created.world, { namespace: 'team-a', kind: 'ClusterRole', name: 'web' }).code).toBe('already-exists');
  });
});

describe('namespace phases gate new objects but not existing ones', () => {
  it('refuses creation in an absent or terminating namespace and leaves the world unchanged', () => {
    const absent = withObjects([], { 'team-a': 'Active', 'team-b': 'Absent' });
    expect(createObject(absent, deployment('team-b')).code).toBe('namespace-not-found');
    expect(createObject(absent, deployment('team-b')).world).toBe(absent);

    const terminating = withObjects([{ kind: 'Deployment', namespace: 'team-b', name: 'web' }], { 'team-a': 'Active', 'team-b': 'Terminating' });
    expect(createObject(terminating, service('team-b')).code).toBe('namespace-terminating');
    expect(createObject(terminating, service('team-b')).world).toBe(terminating);
  });

  it('lets an object be deleted by its exact identity from a terminating namespace', () => {
    const terminating = withObjects([{ kind: 'Deployment', namespace: 'team-b', name: 'web' }], { 'team-a': 'Active', 'team-b': 'Terminating' });
    const removed = deleteObject(terminating, deployment('team-b'));
    expect(removed.code).toBe('deleted');
    expect(removed.world.objects).toEqual([]);
  });
});

describe('namespace deletion is a two-step cascade', () => {
  it('moves Active to Terminating without removing anything yet', () => {
    const world = withObjects([{ kind: 'Deployment', namespace: 'team-b', name: 'web' }]);
    const started = advanceNamespace(world, 'team-b');
    expect(started.code).toBe('terminating-started');
    expect(started.world.phases['team-b']).toBe('Terminating');
    expect(started.world.objects).toEqual(world.objects);
  });

  it('removes only that namespace\'s namespaced objects, then the namespace itself', () => {
    const cluster: ObjectId = { kind: 'ClusterRole', name: 'web' };
    const world = withObjects([
      { kind: 'Deployment', namespace: 'team-a', name: 'web' },
      { kind: 'Deployment', namespace: 'team-b', name: 'web' },
      { kind: 'NetworkPolicy', namespace: 'team-b', name: 'deny-ingress' },
      cluster,
    ], { 'team-a': 'Active', 'team-b': 'Terminating' });
    const finished = advanceNamespace(world, 'team-b');
    expect(finished.code).toBe('cleanup-finished');
    expect(finished.touched).toHaveLength(2);
    expect(finished.world.phases['team-b']).toBe('Absent');
    expect(finished.world.objects).toEqual([{ kind: 'Deployment', namespace: 'team-a', name: 'web' }, cluster]);
  });

  it('recreates an absent namespace empty', () => {
    const created = advanceNamespace(withObjects([], { 'team-a': 'Active', 'team-b': 'Absent' }), 'team-b');
    expect(created.code).toBe('namespace-created');
    expect(created.world.phases['team-b']).toBe('Active');
    expect(created.world.objects).toEqual([]);
  });
});

describe('deletion and selection identity', () => {
  it('deletes exactly the selected identity and reports absence otherwise', () => {
    const world = withObjects([{ kind: 'Deployment', namespace: 'team-a', name: 'web' }, { kind: 'Deployment', namespace: 'team-a', name: 'api' }]);
    const removed = deleteObject(world, deployment('team-a'));
    expect(removed.world.objects).toEqual([{ kind: 'Deployment', namespace: 'team-a', name: 'api' }]);
    expect(deleteObject(removed.world, deployment('team-a')).code).toBe('not-found');
  });

  it('keeps a chosen Deployment name, forces a NetworkPolicy to its fixed name, and drops the namespace from a ClusterRole', () => {
    expect(objectFor(deployment('team-a', 'api'))).toEqual({ kind: 'Deployment', namespace: 'team-a', name: 'api' });
    expect(objectFor({ namespace: 'team-b', kind: 'NetworkPolicy', name: 'web' })).toEqual({ kind: 'NetworkPolicy', namespace: 'team-b', name: 'deny-ingress' });
    expect(objectFor(clusterRole('api'))).toEqual({ kind: 'ClusterRole', name: 'api' });
  });
});

describe('cross-namespace reach', () => {
  it('needs the Service in the target namespace for the name to resolve', () => {
    expect(reachTo(withObjects([{ kind: 'Service', namespace: 'team-a', name: 'web' }]), 'team-b').serviceName).toBe(false);
    expect(reachTo(withObjects([{ kind: 'Service', namespace: 'team-b', name: 'web' }]), 'team-b').serviceName).toBe(true);
  });

  it('is blocked only by a NetworkPolicy in the target namespace, not one in the caller namespace', () => {
    expect(reachTo(withObjects([{ kind: 'NetworkPolicy', namespace: 'team-a', name: 'deny-ingress' }]), 'team-b').allowed).toBe(true);
    expect(reachTo(withObjects([{ kind: 'NetworkPolicy', namespace: 'team-b', name: 'deny-ingress' }]), 'team-b').allowed).toBe(false);
  });
});

describe('manifest identity lines', () => {
  it('shows a namespace line only for namespaced kinds, and it equals the selected namespace', () => {
    const namespaced = manifestFor(deployment('team-b', 'api')).lines.map((line) => line.text);
    expect(namespaced).toContain('  namespace: team-b');
    expect(namespaced).toContain('  name: api');
    const cluster = manifestFor(clusterRole('web')).lines.map((line) => line.text);
    expect(cluster.some((text) => text.includes('namespace:'))).toBe(false);
    expect(cluster).toContain('  name: web');
  });

  it('marks kind, namespace and name as identity lines and nothing else', () => {
    const identity = manifestFor(deployment('team-a')).lines.filter((line) => line.identity).map((line) => line.text.trim());
    expect(identity).toEqual(['kind: Deployment', 'metadata:', 'name: web', 'namespace: team-a']);
  });
});
