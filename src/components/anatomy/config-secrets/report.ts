import type { Change } from '../shared/ChangeReport';
import { keyNameOf, objects, sameSpec, valueOf, type Delivery, type PodState, type Source, type Spec, type World } from './model';

const deliveryName: Record<Delivery, string> = { env: 'environment variable', volume: 'mounted volume', subpath: 'subPath mount' };

export function describeSpec(spec: Spec): string {
  const object = objects[spec.source];
  return `${object.kind} ${object.name} as ${deliveryName[spec.delivery]}, key ${keyNameOf(spec)}, ${spec.optional ? 'optional' : 'required'}`;
}

/** What the app can read through the Pod's delivery path right now. */
export function appView(pod: PodState): string {
  const object = objects[pod.spec.source];
  if (pod.seen === null) {
    if (pod.spec.delivery === 'env') return `${object.key} unset`;
    if (pod.spec.delivery === 'volume') return `file ${object.file} absent`;
    return 'subPath copy absent';
  }
  const value = valueOf(pod.spec.source, pod.seen);
  if (pod.spec.delivery === 'env') return `${object.key}=${value} (fixed at start)`;
  if (pod.spec.delivery === 'volume') return `file ${object.file}=${value} (updates at sync)`;
  return `subPath copy=${value} (never updates)`;
}

function seenValue(pod: PodState): string {
  return pod.seen === null ? 'no value' : valueOf(pod.spec.source, pod.seen);
}

export function editReport(before: World, after: World, source: Source): Change {
  const object = objects[source];
  const from = valueOf(source, before.stored[source]);
  const to = valueOf(source, after.stored[source]);
  const pod = after.pod;
  const encoding = source === 'secret' ? ' Stored as base64: an encoding anyone who can read the object can decode, not encryption.' : '';
  let notYet: string;
  if (pod.spec.source !== source) notYet = `${pod.name} references the other object, so nothing it reads has changed.`;
  else if (pod.spec.misspelledKey) notYet = `${pod.name} references ${keyNameOf(pod.spec)}, which the object does not hold; no value reaches it.`;
  else if (pod.spec.delivery === 'env') notYet = `${pod.name} keeps ${from} in its environment: env values are fixed when its container starts.`;
  else if (pod.spec.delivery === 'volume') notYet = `${pod.name}'s mounted file still reads ${from}; it updates only after a kubelet sync.`;
  else notYet = `${pod.name}'s subPath copy stays ${from}: subPath mounts never receive updates.`;
  return {
    title: `${object.kind} ${object.name}: ${object.key} is now ${to}`,
    changed: `Stored value changed from ${from} to ${to}.${encoding}`,
    actor: 'You, through an API write to the object (for example kubectl apply or a GitOps pipeline)',
    reason: 'Object data changed. Pods read it only through their delivery path, and each path updates on its own schedule.',
    notYet,
  };
}

export function syncReport(before: World, after: World): Change {
  const pod = after.pod;
  const object = objects[pod.spec.source];
  const stored = valueOf(pod.spec.source, after.stored[pod.spec.source]);
  if (pod.spec.misspelledKey) return {
    title: 'Kubelet sync: nothing to project',
    changed: `${pod.name} references ${keyNameOf(pod.spec)}, which the object does not hold, so there is no file to update.`,
    actor: 'kubelet on the node, which projects only the keys a Pod references',
    reason: 'The reference names a missing key; changing the stored value cannot create it.',
    notYet: 'The stored value is not the problem here. Stage the correct key and roll out a new Pod.',
  };
  if (pod.spec.delivery === 'volume') {
    if (before.pod.seen !== after.pod.seen) return {
      title: `Kubelet sync: mounted file now ${stored}`,
      changed: `${pod.name}'s file ${object.file} changed from ${seenValue(before.pod)} to ${stored}.`,
      actor: 'kubelet on the node, comparing the object with its cache during periodic sync',
      reason: `The stored ${object.key} differs from the value the file last showed.`,
      notYet: `An app that read the file once at startup still holds ${seenValue(before.pod)}; it must read the file again. The environment and any subPath copy are unaffected.`,
    };
    return {
      title: 'Kubelet sync: file already current',
      changed: `${pod.name}'s file already shows ${stored}; nothing was written.`,
      actor: 'kubelet on the node, during periodic sync',
      reason: 'The projected file matches the stored value.',
      notYet: 'Nothing is pending for this Pod.',
    };
  }
  if (pod.spec.delivery === 'env') return {
    title: 'Kubelet sync: environment unchanged',
    changed: `${pod.name} still has ${seenValue(pod)} in its environment.`,
    actor: 'kubelet on the node (sync re-projects volume content only)',
    reason: 'Environment variables are set when a container starts; sync cannot change them.',
    notYet: `Stored ${object.key} is ${stored}. It reaches ${pod.name} only in a new container.`,
  };
  return {
    title: 'Kubelet sync: subPath copy unchanged',
    changed: `${pod.name}'s subPath copy still shows ${seenValue(pod)}.`,
    actor: 'kubelet on the node (periodic sync does not update subPath mounts)',
    reason: 'Kubernetes documents that a subPath mount does not receive ConfigMap or Secret updates.',
    notYet: `Stored ${object.key} is ${stored}. Only a new Pod sees it.`,
  };
}

export function stageReport(after: World): Change {
  const matches = sameSpec(after.spec, after.pod.spec);
  const blockedNote = after.spec.misspelledKey && !after.spec.optional ? ' If rolled out, the new Pod is blocked: the key is missing and optional is false.' : '';
  return {
    title: matches ? 'Staged template matches the running Pod' : 'Staged template changed; running Pod unchanged',
    changed: matches
      ? `Template and ${after.pod.name} agree: ${describeSpec(after.spec)}.`
      : `Template now: ${describeSpec(after.spec)}. ${after.pod.name} still runs with ${describeSpec(after.pod.spec)}.`,
    actor: 'You, editing the Deployment pod template',
    reason: 'A running Pod keeps the reference it was created with. The template is read only when a new Pod is created.',
    notYet: (matches ? 'No new Pod is pending.' : 'No Pod has been created from this template yet. Roll out to create one.') + blockedNote,
  };
}

export function rolloutReport(before: World, after: World): Change {
  const started = after.pod !== before.pod;
  if (started) return {
    title: `${after.pod.name} running; fixture retires ${before.pod.name}`,
    changed: `The new container starts with ${describeSpec(after.pod.spec)}: ${appView(after.pod)}.`,
    actor: 'The Deployment controller (its ReplicaSet creates the Pod) and kubelet (starts the container)',
    reason: 'A rollout creates a Pod with a new name from the template. Each container reads its stored values when it starts.',
    notYet: `Running is not Ready: readiness is not modelled. A real rolling update keeps ${before.pod.name} until the new Pod is Ready; this fixture retires it at once. Values the app cached earlier are outside Kubernetes.`,
  };
  const candidate = after.blocked;
  if (!candidate) throw new Error('A rollout must either start a Pod or leave a blocked replacement');
  const object = objects[candidate.spec.source];
  const reason = candidate.spec.delivery === 'env'
    ? `The env reference names ${keyNameOf(candidate.spec)}, which the ${object.kind} does not hold, and optional is false. The kubelet cannot build the container config (reported as CreateContainerConfigError).`
    : `The volume reference names ${keyNameOf(candidate.spec)}, which the ${object.kind} does not hold, and optional is false. The kubelet cannot set up the volume, so the container does not start.`;
  return {
    title: `Replacement ${candidate.name} did not start`,
    changed: `${candidate.name} was created from the template, but its container is not running.`,
    actor: 'kubelet on its node, which builds the container and its volumes; the Deployment controller created the Pod',
    reason,
    notYet: `${after.pod.name} still runs with ${appView(after.pod)}. Nothing was retired.`,
  };
}

export function resetReport(): Change {
  return {
    title: 'Fixture reset',
    changed: 'Stored values, the staged template and the running Pod return to the starting state.',
    actor: 'You, through a fixture control; no cluster is touched',
    reason: 'Reset restores the first state of this lesson.',
    notYet: 'Nothing in any real cluster has changed.',
  };
}
