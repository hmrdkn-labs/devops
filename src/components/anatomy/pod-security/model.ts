// Authored fixture: one namespace, one agent Pod draft, one Pod that existed before the labels.
// No cluster, network or clock. Simplifications, named in the explanation: the image is always private;
// its files are root-owned; emptyDir is writable by any UID; the scheduler step is skipped (node-a);
// probes and Ready are not modeled; a failed pull is not retried, because the Pod spec is immutable;
// the runtime's default capability set is shown by name only.

export type Level = 'none' | 'privileged' | 'baseline' | 'restricted';
export type Mode = 'enforce' | 'audit' | 'warn';
export const modes: readonly Mode[] = ['enforce', 'audit', 'warn'];
export const levels: readonly Level[] = ['none', 'privileged', 'baseline', 'restricted'];
export type RunAsUser = 'unset' | '0' | '1000';
export type Escalation = 'unset' | 'false' | 'true';
export type Caps = 'default' | 'drop-all' | 'drop-all-bind' | 'add-net-admin';
export type Seccomp = 'unset' | 'RuntimeDefault' | 'Unconfined';
export type ImageUser = '0' | '1000';

export interface Namespace { enforce: Level; audit: Level; warn: Level }

export interface Spec {
  runAsNonRoot: boolean;
  runAsUser: RunAsUser;
  allowPrivilegeEscalation: Escalation;
  privileged: boolean;
  caps: Caps;
  seccomp: Seccomp;
  readOnlyRootFilesystem: boolean;
  emptyDirCache: boolean;
  pullSecret: boolean;
  /** The image's own default USER. Not a Pod field, but it sets the UID when runAsUser is unset. */
  imageUser: ImageUser;
}

/** Manifest keys: what an interaction read or changed. */
export type Field = Mode | 'runAsNonRoot' | 'runAsUser' | 'allowPrivilegeEscalation' | 'privileged' | 'capabilities'
  | 'seccomp' | 'readOnlyRootFilesystem' | 'emptyDir' | 'imagePullSecrets' | 'imageUser';

export interface Violation { control: string; field: string; need: string; key: Field }

/**
 * Pod Security Standards, cumulative. Baseline: privileged, added capabilities beyond the list (NET_ADMIN is
 * not listed), explicit Unconfined seccomp. Restricted adds: allowPrivilegeEscalation false, runAsNonRoot true,
 * runAsUser not 0, seccomp explicitly RuntimeDefault, drop ALL with only NET_BIND_SERVICE added.
 * readOnlyRootFilesystem, emptyDir and imagePullSecrets are not checked by either standard.
 */
export function violations(spec: Spec, level: Level): Violation[] {
  if (level === 'none' || level === 'privileged') return [];
  const found: Violation[] = [];
  if (spec.privileged) found.push({ control: 'Privileged Containers', field: 'privileged', need: 'unset or false', key: 'privileged' });
  if (spec.caps === 'add-net-admin') {
    found.push({ control: 'Capabilities', field: 'capabilities.add', need: 'limited to NET_BIND_SERVICE or none', key: 'capabilities' });
  }
  if (spec.seccomp === 'Unconfined') found.push({ control: 'Seccomp', field: 'seccompProfile.type', need: 'not Unconfined', key: 'seccomp' });
  if (level === 'baseline') return found;
  if (spec.allowPrivilegeEscalation !== 'false') {
    found.push({ control: 'Privilege Escalation', field: 'allowPrivilegeEscalation', need: 'false', key: 'allowPrivilegeEscalation' });
  }
  if (!spec.runAsNonRoot) found.push({ control: 'Running as Non-root', field: 'runAsNonRoot', need: 'true', key: 'runAsNonRoot' });
  if (spec.runAsUser === '0') found.push({ control: 'Running as Non-root user', field: 'runAsUser', need: 'non-zero or unset', key: 'runAsUser' });
  // Unconfined is already reported by the baseline rules; here only an absent profile is new.
  if (spec.seccomp === 'unset') found.push({ control: 'Seccomp', field: 'seccompProfile.type', need: 'RuntimeDefault, set explicitly', key: 'seccomp' });
  if (spec.caps === 'default' || spec.caps === 'add-net-admin') found.push({ control: 'Capabilities', field: 'capabilities.drop', need: 'ALL', key: 'capabilities' });
  return found;
}

/** The Pod fields a level's rules read. Used to say which fields admission inspected. */
export function checkedFields(level: Level): Field[] {
  if (level === 'none' || level === 'privileged') return [];
  const baseline: Field[] = ['privileged', 'capabilities', 'seccomp'];
  return level === 'baseline' ? baseline : [...baseline, 'allowPrivilegeEscalation', 'runAsNonRoot', 'runAsUser'];
}

/** API validation refuses this combination before any namespace level is consulted. */
export function invalidReason(spec: Spec): string | null {
  return spec.privileged && spec.allowPrivilegeEscalation === 'false'
    ? 'allowPrivilegeEscalation: false cannot be set with privileged: true'
    : null;
}

export type Admission =
  | { outcome: 'invalid'; reason: string }
  | { outcome: 'rejected'; level: Level; violations: Violation[] }
  | { outcome: 'accepted'; warnLevel: Level; warnings: Violation[]; auditLevel: Level; audits: Violation[] };

/** Create-time admission. Only enforce can refuse; warn and audit never change the outcome. */
export function admit(spec: Spec, ns: Namespace): Admission {
  const reason = invalidReason(spec);
  if (reason) return { outcome: 'invalid', reason };
  const blocked = violations(spec, ns.enforce);
  if (blocked.length > 0) return { outcome: 'rejected', level: ns.enforce, violations: blocked };
  return {
    outcome: 'accepted', warnLevel: ns.warn, warnings: violations(spec, ns.warn), auditLevel: ns.audit, audits: violations(spec, ns.audit),
  };
}

const keysOf = (list: Violation[]): Field[] => [...new Set(list.map((v) => v.key))];

/** Fields that admission read for an accepted Pod: each set label, and the fields each set level checks. */
function admissionReads(ns: Namespace): Field[] {
  const read = new Set<Field>();
  for (const mode of modes) {
    if (ns[mode] === 'none') continue;
    read.add(mode);
    for (const field of checkedFields(ns[mode])) read.add(field);
  }
  return [...read];
}

export function effectiveUid(spec: Spec): number {
  if (spec.runAsUser === '0') return 0;
  if (spec.runAsUser === '1000') return 1000;
  return spec.imageUser === '1000' ? 1000 : 0;
}

export function capsView(caps: Caps): { defaultSet: boolean; allDropped: boolean; extra: string | null } {
  switch (caps) {
    case 'default': return { defaultSet: true, allDropped: false, extra: null };
    case 'drop-all': return { defaultSet: false, allDropped: true, extra: null };
    case 'drop-all-bind': return { defaultSet: false, allDropped: true, extra: 'NET_BIND_SERVICE' };
    case 'add-net-admin': return { defaultSet: true, allDropped: false, extra: 'NET_ADMIN' };
  }
}

const capsNames: Record<Caps, string> = {
  default: 'runtime default set',
  'drop-all': 'none (ALL dropped)',
  'drop-all-bind': 'NET_BIND_SERVICE only',
  'add-net-admin': 'default set + NET_ADMIN',
};

/** allowPrivilegeEscalation false sets no_new_privs; privileged never gets it (it is inconsistent). */
export function noNewPrivs(spec: Spec): boolean {
  return !spec.privileged && spec.allowPrivilegeEscalation === 'false';
}

/** A privileged container always runs Unconfined; otherwise the explicit profile applies, and unset means Unconfined here. */
export function seccompEffective(spec: Spec): 'RuntimeDefault' | 'Unconfined' {
  if (spec.privileged) return 'Unconfined';
  return spec.seccomp === 'RuntimeDefault' ? 'RuntimeDefault' : 'Unconfined';
}

export type Pull = 'pending' | 'ok' | 'failed';
export type Container = 'waiting' | 'refused' | 'running';
export interface Pod { uid: number; name: 'legacy-agent' | 'agent'; spec: Spec; pull: Pull; container: Container }

export interface Change { title: string; changed: string; actor: string; reason: string; notYet?: string }

/** The last enforce-label change: which pods it warned about, and the fields behind each warning. */
export interface Retest { level: Level; warned: Array<{ uid: number; fields: Field[] }> }

export interface State {
  ns: Namespace;
  draft: Spec;
  pods: Pod[];
  nextUid: number;
  admission: Admission | null;
  change: Change;
  reads: Field[];
  retest: Retest | null;
}

const legacySpec: Spec = {
  runAsNonRoot: false, runAsUser: '0', allowPrivilegeEscalation: 'unset', privileged: true, caps: 'default',
  seccomp: 'unset', readOnlyRootFilesystem: false, emptyDirCache: false, pullSecret: true, imageUser: '0',
};

/** The default draft: restricted-compliant except runAsUser is unset and the image runs as root. */
export const defaultDraft: Spec = {
  runAsNonRoot: true, runAsUser: 'unset', allowPrivilegeEscalation: 'false', privileged: false, caps: 'drop-all',
  seccomp: 'RuntimeDefault', readOnlyRootFilesystem: true, emptyDirCache: true, pullSecret: true, imageUser: '0',
};

export function initialState(): State {
  return {
    ns: { enforce: 'none', audit: 'none', warn: 'restricted' },
    draft: defaultDraft,
    pods: [{ uid: 1, name: 'legacy-agent', spec: legacySpec, pull: 'ok', container: 'running' }],
    nextUid: 2,
    admission: null,
    change: {
      title: 'Fixture loaded · nothing sent',
      changed: 'legacy-agent #1 is Running. It was created before any label, so no rule has tested it.',
      actor: 'Fixture (no request sent)',
      reason: 'A Pod created before a label is not evicted, and it is not tested again until a label changes.',
      notYet: 'No agent Pod exists. Apply sends the draft to the API server.',
    },
    reads: [],
    retest: null,
  };
}

export const agentOf = (s: State) => s.pods.find((pod) => pod.name === 'agent');

const listed = (list: Violation[]) => list.map((v) => `${v.field} must be ${v.need}`).join('; ');

/** Existing Pods that the given enforce level would refuse. Admission returns these as warnings; nothing is evicted. */
export function retestPods(pods: Pod[], level: Level): Array<{ pod: Pod; found: Violation[] }> {
  return pods.map((pod) => ({ pod, found: violations(pod.spec, level) })).filter((item) => item.found.length > 0);
}

/** Changing an enforce label re-tests every Pod and returns violations as warnings. Other modes apply to later requests. */
export function editNamespace(s: State, mode: Mode, level: Level): State {
  const ns = { ...s.ns, [mode]: level };
  if (mode !== 'enforce') {
    return {
      ...s, ns, reads: [mode],
      change: {
        title: `${mode} = ${level}`,
        changed: `The ${mode} mode is now ${level}. No Pod object changed.`,
        actor: 'You (namespace label)',
        reason: `The ${mode} label decides how Pod Security admission responds to later create requests in sandbox.`,
        notYet: 'No later request has been evaluated under this label yet.',
      },
    };
  }
  const retests = retestPods(s.pods, level);
  const changed = retests.length === 0
    ? 'No existing Pod violates this level. No Pod changed.'
    : `Warnings only: ${retests.map(({ pod, found }) => `${pod.name} #${pod.uid} (${found.map((v) => v.field).join(', ')})`).join('; ')}. No Pod was evicted or changed.`;
  return {
    ...s, ns, reads: ['enforce'],
    retest: { level, warned: retests.map(({ pod, found }) => ({ uid: pod.uid, fields: keysOf(found) })) },
    change: {
      title: `enforce = ${level}`,
      changed,
      actor: 'You (namespace label), then Pod Security admission re-tests existing Pods',
      reason: 'With an enforce label, admission tests each Pod in the namespace against the level and returns violations as warnings.',
      notYet: 'Existing Pods keep running. Only later create requests are refused.',
    },
  };
}

export function editDraft(s: State, patch: Partial<Spec>, field: Field, described: string): State {
  const agent = agentOf(s);
  return {
    ...s,
    draft: { ...s.draft, ...patch },
    reads: [field],
    change: {
      title: 'Draft changed · not sent',
      changed: `${described}. ${agent ? `${agent.name} #${agent.uid} keeps its applied spec.` : 'No Pod object changed.'}`,
      actor: 'You (draft only; no request sent)',
      reason: 'Apply sends the draft. A Pod spec cannot change in place except image and a few fields, so a new spec needs a new Pod.',
      notYet: 'Admission has not evaluated this draft.',
    },
  };
}

/** Create the agent Pod if admission accepts the draft. Assignment to node-a is recorded; the container is not started. */
export function apply(s: State): State {
  if (agentOf(s)) return s;
  const admission = admit(s.draft, s.ns);
  if (admission.outcome === 'invalid') {
    return {
      ...s, admission, reads: ['privileged', 'allowPrivilegeEscalation'],
      change: {
        title: 'Request refused by API validation',
        changed: 'No Pod object was created.',
        actor: 'API server validation',
        reason: `${admission.reason}. Changing a namespace label cannot make this combination valid.`,
        notYet: 'No image pull and no container start.',
      },
    };
  }
  if (admission.outcome === 'rejected') {
    return {
      ...s, admission, reads: ['enforce', ...keysOf(admission.violations)],
      change: {
        title: `Admission refused agent · enforce ${admission.level}`,
        changed: `No Pod object was created. ${listed(admission.violations)}.`,
        actor: `Pod Security admission (enforce = ${admission.level} on sandbox)`,
        reason: `The draft is outside the ${admission.level} profile for the listed fields.`,
        notYet: 'Nothing was scheduled, pulled or started. Change the draft and Apply again.',
      },
    };
  }
  const pod: Pod = { uid: s.nextUid, name: 'agent', spec: s.draft, pull: 'pending', container: 'waiting' };
  const warnText = admission.warnings.length > 0
    ? `Warning to you (warn = ${admission.warnLevel}): ${listed(admission.warnings)}.`
    : `No warning (warn = ${admission.warnLevel}).`;
  const auditText = admission.audits.length > 0 ? ` Audit annotation (audit = ${admission.auditLevel}): ${listed(admission.audits)}.` : '';
  return {
    ...s, admission, reads: admissionReads(s.ns),
    pods: [...s.pods, pod],
    nextUid: s.nextUid + 1,
    change: {
      title: `agent #${pod.uid} created · Pending`,
      changed: `Pod object stored and assigned to node-a (fixture: scheduler step omitted). ${warnText}${auditText}`,
      actor: 'API server, after Pod Security admission (enforce passed)',
      reason: `No enforce violation at ${s.ns.enforce}. Warnings are returned to the client; they do not block the Pod.`,
      notYet: 'No image pulled and no container started, so the kubelet has not applied this securityContext to a process.',
    },
  };
}

/** Kubelet pulls the image, then checks runAsNonRoot against the UID the container would run as. */
export function startAgent(s: State): State {
  const agent = agentOf(s);
  if (!agent || agent.pull !== 'pending') return s;
  const outcome = kubeletStart(agent);
  return {
    ...s,
    pods: s.pods.map((pod) => (pod.uid === agent.uid ? outcome.pod : pod)),
    reads: outcome.reads,
    change: outcome.change,
  };
}

/** Pull first, then the runAsNonRoot check. A failed pull or refused start is not retried: the spec is immutable. */
function kubeletStart(agent: Pod): { pod: Pod; change: Change; reads: Field[] } {
  if (!agent.spec.pullSecret) {
    return {
      pod: { ...agent, pull: 'failed' },
      reads: ['imagePullSecrets'],
      change: {
        title: `agent #${agent.uid}: image pull failed`,
        changed: 'Container still waiting (ImagePullBackOff). No container started.',
        actor: 'kubelet, through the container runtime (image pull)',
        reason: 'The registry is private and the Pod has no imagePullSecret.',
        notYet: 'No container was created, so no securityContext was applied to a process. The spec is immutable: delete and apply to change it.',
      },
    };
  }
  const uid = effectiveUid(agent.spec);
  const uidFields: Field[] = ['runAsNonRoot', 'runAsUser', 'imageUser'];
  if (agent.spec.runAsNonRoot && uid === 0) {
    const why = agent.spec.runAsUser === 'unset' ? 'runAsUser is unset, so the image USER (0) applies' : 'runAsUser is set to 0';
    return {
      pod: { ...agent, pull: 'ok', container: 'refused' },
      reads: uidFields,
      change: {
        title: `kubelet refused to start agent #${agent.uid}`,
        changed: 'Container waiting, not running. Effective UID is 0.',
        actor: 'kubelet (runAsNonRoot check at container start)',
        reason: `runAsNonRoot is true and the UID is 0; ${why}. Admission checks the spec's fields, not the image's USER.`,
        notYet: 'No process ran, so the application did not start.',
      },
    };
  }
  const caps = capsView(agent.spec.caps);
  const capText = caps.defaultSet ? 'default set' : 'none from default';
  const extra = caps.extra ? ` + ${caps.extra}` : '';
  const dropText = caps.allDropped ? 'ALL dropped' : 'ALL not dropped';
  return {
    pod: { ...agent, pull: 'ok', container: 'running' },
    reads: uidFields,
    change: {
      title: `agent #${agent.uid} Running as UID ${uid}`,
      changed: `Container started as UID ${uid}. no_new_privs ${noNewPrivs(agent.spec) ? 'on' : 'off'}; capabilities ${capText}${extra} (${dropText}); root filesystem ${agent.spec.readOnlyRootFilesystem ? 'read-only' : 'writable'}; seccomp ${seccompEffective(agent.spec)}.`,
      actor: 'kubelet and container runtime',
      reason: 'Admission had accepted the spec. The runtime applied the fields as set; unset fields took runtime defaults.',
      notYet: 'Running is not proof that the application works or is Ready; no probe is modeled.',
    },
  };
}

export type CacheDecision = 'emptyDir' | 'readOnlyRootFilesystem' | 'permissions' | 'rootfs';
export interface CacheWrite { ok: boolean; decidedBy: CacheDecision; why: string }

/** Write to /app/cache: a volume beats the read-only root; otherwise the root filesystem flag and the UID decide. */
export function cacheWrite(spec: Spec): CacheWrite {
  if (spec.emptyDirCache) return { ok: true, decidedBy: 'emptyDir', why: 'emptyDir is mounted at /app/cache, and a volume is writable regardless of the root filesystem flag (fixture: any UID).' };
  if (spec.readOnlyRootFilesystem) return { ok: false, decidedBy: 'readOnlyRootFilesystem', why: 'No volume at /app/cache, and the root filesystem is read-only: Read-only file system.' };
  if (effectiveUid(spec) !== 0) return { ok: false, decidedBy: 'permissions', why: `No volume and the root filesystem is writable, but UID ${effectiveUid(spec)} cannot write root-owned image files (fixture).` };
  return { ok: true, decidedBy: 'rootfs', why: 'No volume, the root filesystem is writable, and UID 0 may write to the image layer (fixture).' };
}

const cacheReason: Record<CacheDecision, string> = {
  emptyDir: 'The volume, not the root filesystem, decided the path.',
  readOnlyRootFilesystem: 'readOnlyRootFilesystem: true decided it.',
  permissions: 'runAsUser, not the root filesystem, decided it.',
  rootfs: 'The writable root filesystem and UID 0 decided it.',
};

export function probeCache(s: State): State {
  const agent = agentOf(s);
  if (!agent || agent.container !== 'running') return s;
  const result = cacheWrite(agent.spec);
  return {
    ...s,
    reads: ['emptyDir', 'readOnlyRootFilesystem', 'runAsUser'],
    change: {
      title: result.ok ? 'Write to /app/cache succeeded' : 'Write to /app/cache denied',
      changed: result.why,
      actor: `Application process (UID ${effectiveUid(agent.spec)})`,
      reason: cacheReason[result.decidedBy],
      notYet: 'Other paths and other restrictions were not tested. A permitted write does not show the workload is safe.',
    },
  };
}

export function removeAgent(s: State): State {
  const agent = agentOf(s);
  if (!agent) return s;
  return {
    ...s,
    pods: s.pods.filter((pod) => pod.uid !== agent.uid),
    reads: [],
    change: {
      title: `agent #${agent.uid} deleted`,
      changed: 'Pod object removed and its container terminated.',
      actor: 'You (kubectl delete pod)',
      reason: 'A spec change needs a new Pod; the old Pod cannot be edited in place.',
      notYet: 'The next Apply creates a new Pod with a new UID, and admission checks it against the current labels.',
    },
  };
}

export interface Badge { tone: 'pass' | 'wait' | 'fail' | 'info'; label: string }

export function admissionBadge(s: State): Badge {
  const a = s.admission;
  if (!a) return { tone: 'info', label: 'Admission: not submitted' };
  if (a.outcome === 'accepted') return { tone: 'pass', label: 'Admission: accepted' };
  if (a.outcome === 'rejected') return { tone: 'fail', label: `Admission: refused (enforce ${a.level})` };
  return { tone: 'fail', label: 'Admission: refused by validation' };
}

export function pullBadge(pod: Pod | undefined): Badge {
  if (!pod) return { tone: 'info', label: 'Image pull: no Pod' };
  if (pod.pull === 'ok') return { tone: 'pass', label: 'Image pull: ok' };
  if (pod.pull === 'failed') return { tone: 'fail', label: 'Image pull: failed (no imagePullSecret)' };
  return { tone: 'wait', label: 'Image pull: not attempted' };
}

export function containerBadge(pod: Pod | undefined): Badge {
  if (!pod) return { tone: 'info', label: 'Container: no Pod' };
  if (pod.container === 'running') return { tone: 'pass', label: `Container: Running as UID ${effectiveUid(pod.spec)}` };
  if (pod.container === 'refused') return { tone: 'fail', label: 'Container: refused by kubelet' };
  return { tone: 'wait', label: 'Container: not started' };
}

/** Settings a Pod carries, in the terms the ledger shows. Unset values are shown as unset, not as false. */
export function specFacts(spec: Spec): Array<{ label: string; value: string }> {
  const uid = spec.runAsUser === 'unset' ? `unset (image USER ${spec.imageUser === '0' ? '0' : '1000'})` : spec.runAsUser;
  return [
    { label: 'privileged', value: spec.privileged ? 'yes' : 'no' },
    { label: 'runAsUser', value: uid },
    { label: 'capabilities', value: capsNames[spec.caps] },
    { label: 'allowPrivilegeEscalation', value: spec.allowPrivilegeEscalation },
    { label: 'seccompProfile', value: spec.seccomp },
    { label: 'read-only root', value: spec.readOnlyRootFilesystem ? 'yes' : 'no' },
  ];
}

/** The last enforce re-test that warned this Pod, if any. Warnings never remove the Pod. */
export function retestOf(s: State, uid: number): { level: Level; fields: Field[] } | null {
  const hit = s.retest?.warned.find((item) => item.uid === uid);
  return hit && s.retest ? { level: s.retest.level, fields: hit.fields } : null;
}

export interface Readout { label: string; value: string; applied: boolean }

/** What the runtime applied to the agent. Every row is "not applied yet" until Start produces a running container. */
export function runtimeReadout(s: State): Readout[] {
  const agent = agentOf(s);
  const labels = ['Effective UID', 'no_new_privs', 'Capabilities', 'seccomp', 'Root filesystem', 'privileged'];
  if (!agent) return labels.map((label) => ({ label, value: 'no agent Pod', applied: false }));
  if (agent.container !== 'running') {
    const value = agent.container === 'refused' ? 'not applied: container refused' : 'not applied yet';
    return labels.map((label) => ({ label, value, applied: false }));
  }
  const spec = agent.spec;
  return [
    { label: 'Effective UID', value: String(effectiveUid(spec)), applied: true },
    { label: 'no_new_privs', value: noNewPrivs(spec) ? 'on' : 'off', applied: true },
    { label: 'Capabilities', value: capsNames[spec.caps], applied: true },
    { label: 'seccomp', value: seccompEffective(spec), applied: true },
    { label: 'Root filesystem', value: spec.readOnlyRootFilesystem ? 'read-only' : 'writable', applied: true },
    { label: 'privileged', value: spec.privileged ? 'yes' : 'no', applied: true },
  ];
}

export interface ManifestLine { text: string; field?: Field }

/**
 * The YAML the figure's model state produces. A setting that is set shows its line; a setting that is left out
 * shows as a comment carrying the same field, so the highlight has a target and the absence is visible.
 */
export function manifestLines(s: State): ManifestLine[] {
  const { ns, draft } = s;
  const labels: ManifestLine[] = modes.flatMap((mode) => (ns[mode] === 'none' ? [] : [{
    text: `    pod-security.kubernetes.io/${mode}: ${ns[mode]}`, field: mode,
  }]));
  const lines: ManifestLine[] = [
    { text: 'apiVersion: v1' },
    { text: 'kind: Namespace' },
    { text: 'metadata:' },
    { text: '  name: sandbox' },
    ...(labels.length > 0 ? [{ text: '  labels:' }, ...labels] : [{ text: '  labels: {}' }]),
    { text: '---' },
    { text: 'apiVersion: v1' },
    { text: 'kind: Pod' },
    { text: 'metadata:' },
    { text: '  name: agent' },
    { text: '  namespace: sandbox' },
    { text: 'spec:' },
  ];
  if (draft.pullSecret) {
    lines.push({ text: '  imagePullSecrets:', field: 'imagePullSecrets' }, { text: '  - name: registry-creds', field: 'imagePullSecrets' });
  } else {
    lines.push({ text: '  # imagePullSecrets omitted', field: 'imagePullSecrets' });
  }
  if (draft.emptyDirCache) {
    lines.push({ text: '  volumes:', field: 'emptyDir' }, { text: '  - name: cache', field: 'emptyDir' }, { text: '    emptyDir: {}', field: 'emptyDir' });
  } else {
    lines.push({ text: '  # no emptyDir volume', field: 'emptyDir' });
  }
  lines.push({ text: '  containers:' }, { text: '  - name: agent' }, { text: '    image: registry.example.com/agent:2.0' });
  lines.push({ text: `    # image USER: ${draft.imageUser === '0' ? '0 (root)' : '1000'}; the Pod does not set it`, field: 'imageUser' });
  lines.push({ text: '    securityContext:' });
  lines.push(draft.runAsNonRoot
    ? { text: '      runAsNonRoot: true', field: 'runAsNonRoot' }
    : { text: '      # runAsNonRoot omitted (false)', field: 'runAsNonRoot' });
  lines.push(draft.runAsUser !== 'unset'
    ? { text: `      runAsUser: ${draft.runAsUser}`, field: 'runAsUser' }
    : { text: '      # runAsUser unset: the image USER decides the UID', field: 'runAsUser' });
  lines.push(draft.allowPrivilegeEscalation !== 'unset'
    ? { text: `      allowPrivilegeEscalation: ${draft.allowPrivilegeEscalation}`, field: 'allowPrivilegeEscalation' }
    : { text: '      # allowPrivilegeEscalation unset (defaults to true)', field: 'allowPrivilegeEscalation' });
  lines.push(draft.privileged
    ? { text: '      privileged: true', field: 'privileged' }
    : { text: '      # privileged omitted (false)', field: 'privileged' });
  if (draft.caps === 'default') {
    lines.push({ text: '      # capabilities omitted: runtime default set', field: 'capabilities' });
  } else {
    lines.push({ text: '      capabilities:', field: 'capabilities' });
    if (draft.caps !== 'add-net-admin') lines.push({ text: '        drop: ["ALL"]', field: 'capabilities' });
    if (draft.caps === 'drop-all-bind') lines.push({ text: '        add: ["NET_BIND_SERVICE"]', field: 'capabilities' });
    if (draft.caps === 'add-net-admin') lines.push({ text: '        add: ["NET_ADMIN"]', field: 'capabilities' });
  }
  if (draft.seccomp === 'unset') {
    lines.push({ text: '      # seccompProfile unset', field: 'seccomp' });
  } else {
    lines.push({ text: '      seccompProfile:', field: 'seccomp' }, { text: `        type: ${draft.seccomp}`, field: 'seccomp' });
  }
  lines.push(draft.readOnlyRootFilesystem
    ? { text: '      readOnlyRootFilesystem: true', field: 'readOnlyRootFilesystem' }
    : { text: '      # readOnlyRootFilesystem omitted (false)', field: 'readOnlyRootFilesystem' });
  if (draft.emptyDirCache) {
    lines.push({ text: '    volumeMounts:', field: 'emptyDir' }, { text: '    - name: cache', field: 'emptyDir' }, { text: '      mountPath: /app/cache', field: 'emptyDir' });
  }
  return lines;
}

/** A manifest line is highlighted when the last interaction read or changed its field. */
export function isHighlighted(s: State, line: ManifestLine): boolean {
  return line.field !== undefined && s.reads.includes(line.field);
}
