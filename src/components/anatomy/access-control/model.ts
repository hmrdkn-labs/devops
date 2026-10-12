import type { BadgeTone } from '../shared/StateBadge';

/**
 * One API request evaluated in the order the API server applies its checks:
 * authentication, RBAC (subject, then rule), mutating step, validating admission,
 * persistence. Each check stops the request at its first failure. Pure and deterministic.
 */
export type Caller = 'sa-deployer' | 'user-alice' | 'expired-token';
export type Operation = 'create-pod' | 'get-secret';
export type PodProfile = 'hardened' | 'minimal' | 'privileged';
/** Result of one check; `unreached` means an earlier check stopped the request before it ran. */
export type Check = 'pass' | 'fail' | 'unreached';

export interface Config {
  caller: Caller;
  operation: Operation;
  /** RoleBinding deployer-pod-writer exists in sandbox and names ServiceAccount deployer. */
  roleBinding: boolean;
  /** Namespace sandbox carries pod-security.kubernetes.io/enforce=restricted. */
  enforceRestricted: boolean;
  podProfile: PodProfile;
  /** Fixture mutating step fills restricted defaults that the Pod leaves unset. */
  mutatingDefaults: boolean;
}

export interface SecurityContext {
  privileged?: boolean;
  allowPrivilegeEscalation?: boolean;
  runAsNonRoot?: boolean;
  /** seccompProfile.type: RuntimeDefault */
  seccompRuntimeDefault?: boolean;
  /** capabilities.drop: ["ALL"] */
  capabilitiesDropAll?: boolean;
}
export type ContextField = keyof SecurityContext;

export const initialConfig: Config = {
  caller: 'sa-deployer', operation: 'create-pod', roleBinding: true,
  enforceRestricted: true, podProfile: 'hardened', mutatingDefaults: false,
};

export const callers: Record<Caller, { label: string; identity: string | null }> = {
  'sa-deployer': { label: 'ServiceAccount deployer · valid token', identity: 'system:serviceaccount:sandbox:deployer' },
  'user-alice': { label: 'User alice · valid client certificate', identity: 'alice' },
  'expired-token': { label: 'Bearer token · expired', identity: null },
};

export const operations: Record<Operation, { label: string; verb: string; resource: string }> = {
  'create-pod': { label: 'Create a Pod', verb: 'create', resource: 'pods' },
  'get-secret': { label: 'Get a Secret', verb: 'get', resource: 'secrets' },
};

export const profiles: Record<PodProfile, { label: string; context: SecurityContext }> = {
  hardened: {
    label: 'Hardened (restricted-compatible)',
    context: { runAsNonRoot: true, allowPrivilegeEscalation: false, seccompRuntimeDefault: true, capabilitiesDropAll: true },
  },
  minimal: { label: 'Minimal (no securityContext)', context: {} },
  privileged: { label: 'Privileged container', context: { privileged: true, allowPrivilegeEscalation: true } },
};

/** Defaults the fixture mutating step fills in only where the Pod leaves a field unset. */
export const mutationDefaults: Required<Omit<SecurityContext, 'privileged'>> = {
  runAsNonRoot: true, allowPrivilegeEscalation: false, seccompRuntimeDefault: true, capabilitiesDropAll: true,
};
export type MutableField = keyof typeof mutationDefaults;

/** Fields the mutating step would fill for a profile. Shared by evaluation and the control's report. */
export function defaultsToFill(podProfile: PodProfile): MutableField[] {
  const submitted = profiles[podProfile].context;
  return (Object.keys(mutationDefaults) as MutableField[]).filter((field) => submitted[field] === undefined);
}

/** YAML path of each modelled field, used in reports and manifests. */
export const fieldPath: Record<ContextField, string> = {
  privileged: 'privileged',
  allowPrivilegeEscalation: 'allowPrivilegeEscalation',
  runAsNonRoot: 'runAsNonRoot',
  seccompRuntimeDefault: 'seccompProfile.type',
  capabilitiesDropAll: 'capabilities.drop',
};

/** The five restricted controls this fixture checks. Volume types, runAsUser and the rest are not modelled. */
export function restrictedViolations(context: SecurityContext): string[] {
  const out: string[] = [];
  if (context.privileged === true) out.push('privileged: true');
  if (context.allowPrivilegeEscalation !== false) out.push('allowPrivilegeEscalation must be false');
  if (context.runAsNonRoot !== true) out.push('runAsNonRoot must be true');
  if (context.seccompRuntimeDefault !== true) out.push('seccompProfile.type must be RuntimeDefault');
  if (context.capabilitiesDropAll !== true) out.push('capabilities.drop must include ALL');
  return out;
}

export interface Evaluation {
  identity: string | null;
  authn: Check;
  binding: Check;
  rule: Check;
  /** Fields the mutating step filled in because the Pod left them unset. */
  mutated: ContextField[];
  /** `off` when the namespace has no enforce label: PodSecurity does not run a check. */
  validate: Check | 'off';
  violations: string[];
  /** The object as the validating step saw it, after mutation. */
  context: SecurityContext;
  persisted: boolean;
  stop: 'authn' | 'binding' | 'rule' | 'validate' | null;
}

function unreachedFrom(identity: string | null): Omit<Evaluation, 'authn' | 'stop'> {
  return {
    identity, binding: 'unreached', rule: 'unreached', mutated: [], validate: 'unreached',
    violations: [], context: {}, persisted: false,
  };
}

export function evaluate(config: Config): Evaluation {
  const { identity } = callers[config.caller];
  if (identity === null) return { ...unreachedFrom(identity), authn: 'fail', stop: 'authn' };
  // The RoleBinding names only the ServiceAccount deployer; any other identity has no grant.
  const bound = config.roleBinding && config.caller === 'sa-deployer';
  if (!bound) return { ...unreachedFrom(identity), authn: 'pass', binding: 'fail', stop: 'binding' };
  // The Role grants create on pods only. Reads never reach admission in this fixture.
  if (config.operation !== 'create-pod') {
    return { ...unreachedFrom(identity), authn: 'pass', binding: 'pass', rule: 'fail', stop: 'rule' };
  }

  const submitted = profiles[config.podProfile].context;
  const mutated = config.mutatingDefaults ? defaultsToFill(config.podProfile) : [];
  const context: SecurityContext = { ...submitted };
  for (const field of mutated) context[field] = mutationDefaults[field];
  const violations = config.enforceRestricted ? restrictedViolations(context) : [];
  const validate: Evaluation['validate'] = !config.enforceRestricted ? 'off' : violations.length ? 'fail' : 'pass';
  const rejected = validate === 'fail';
  return {
    identity, authn: 'pass', binding: 'pass', rule: 'pass', mutated, validate, violations, context,
    persisted: !rejected, stop: rejected ? 'validate' : null,
  };
}

export type GateId = 'authn' | 'binding' | 'rule' | 'validate';
/** `off` means the namespace does not enforce this check: no check ran. `idle` means no send yet. */
export type GateState = Check | 'off' | 'idle';

/** Gate state for each blade. Each blade shows only its own check. */
export function gateStates(evaluation: Evaluation | null): Record<GateId, GateState> {
  if (!evaluation) return { authn: 'idle', binding: 'idle', rule: 'idle', validate: 'idle' };
  return { authn: evaluation.authn, binding: evaluation.binding, rule: evaluation.rule, validate: evaluation.validate };
}

/** A symbol per gate state, so the bed never encodes a state by colour alone. Each symbol is distinct. */
export const stateSymbol: Record<GateState, string> = {
  pass: '✓', fail: '✕', off: '½', unreached: '–', idle: '…',
};

export type Lift = 'up' | 'half' | 'down';
/** A passed check lifts fully, a check that did not run because it is not enforced lifts halfway, anything else stays down. */
export function liftOf(state: GateState): Lift {
  return state === 'pass' ? 'up' : state === 'off' ? 'half' : 'down';
}

/**
 * Manifest keys that a finished evaluation read, so the YAML highlights only what the last send depended on.
 * Authentication reads the credential, which is not in either manifest, so an authentication stop reads nothing.
 * The Pod's serviceAccountName is not read: RBAC authorizes the caller, not the Pod's workload identity.
 */
export function readKeys(evaluation: Evaluation): Set<string> {
  const keys = new Set<string>();
  if (evaluation.authn !== 'pass') return keys;
  keys.add('sa');
  keys.add('rb');
  if (evaluation.binding !== 'pass') return keys;
  keys.add('role');
  if (evaluation.rule !== 'pass') return keys;
  keys.add('ns');
  if (evaluation.validate !== 'unreached') {
    keys.add('ctx');
    for (const field of Object.keys(fieldPath)) keys.add(`ctx:${field}`);
  }
  return keys;
}

export interface Stage {
  id: 'authn' | 'binding' | 'rule' | 'mutate' | 'validate' | 'persist';
  /** Short marker printed on the machine beside the matching part: a gate number, M for the mutating step, or etcd. */
  marker: string;
  name: string;
  tone: BadgeTone;
  label: string;
}

/** One card per check. Before a send, every card says it has not been evaluated. */
export function stages(config: Config, evaluation: Evaluation | null): Stage[] {
  if (!evaluation) {
    const ids: Array<[Stage['id'], string, string]> = [
      ['authn', '1', 'Authentication'], ['binding', '2', 'RBAC · subject'], ['rule', '3', 'RBAC · rule'],
      ['mutate', 'M', 'Mutating step'], ['validate', '4', 'PodSecurity admission'], ['persist', 'etcd', 'Persistence'],
    ];
    return ids.map(([id, marker, name]): Stage => ({ id, marker, name, tone: 'wait', label: 'Not evaluated yet' }));
  }
  const ev = evaluation;
  const { verb, resource } = operations[config.operation];
  const check = (id: Stage['id'], marker: string, name: string, result: Check, pass: string, fail: string): Stage => {
    if (result === 'unreached') return { id, marker, name, tone: 'info', label: 'Not reached' };
    return result === 'pass' ? { id, marker, name, tone: 'pass', label: pass } : { id, marker, name, tone: 'fail', label: fail };
  };
  const mutationReached = ev.binding === 'pass' && ev.rule === 'pass';
  const mutate: Stage = !mutationReached
    ? { id: 'mutate', marker: 'M', name: 'Mutating step', tone: 'info', label: 'Not reached' }
    : !config.mutatingDefaults
      ? { id: 'mutate', marker: 'M', name: 'Mutating step', tone: 'info', label: 'Not enabled: mutating step is off' }
      : ev.mutated.length
        ? { id: 'mutate', marker: 'M', name: 'Mutating step', tone: 'pass', label: `Added ${ev.mutated.map((field) => fieldPath[field]).join(', ')}` }
        : { id: 'mutate', marker: 'M', name: 'Mutating step', tone: 'info', label: 'No change: every default already set' };
  const validate: Stage = ev.validate === 'off'
    ? { id: 'validate', marker: '4', name: 'PodSecurity admission', tone: 'info', label: 'Not enforced: no enforce label on sandbox' }
    : check('validate', '4', 'PodSecurity admission', ev.validate, 'Passed: five restricted checks',
      `Failed: ${ev.violations.length} restricted check${ev.violations.length === 1 ? '' : 's'}`);
  const persist: Stage = ev.persisted
    ? { id: 'persist', marker: 'etcd', name: 'Persistence', tone: 'pass', label: 'Stored: Pod report-job, spec.nodeName empty' }
    : { id: 'persist', marker: 'etcd', name: 'Persistence', tone: 'info', label: 'Not stored' };
  return [
    check('authn', '1', 'Authentication', ev.authn, `Passed: ${ev.identity}`, 'Failed: no valid identity (401)'),
    check('binding', '2', 'RBAC · subject', ev.binding, 'Passed: RoleBinding names this caller', 'Failed: RoleBinding does not name this caller'),
    check('rule', '3', 'RBAC · rule', ev.rule, `Passed: Role pod-writer allows ${verb} ${resource}`, `Failed: Role pod-writer has no ${verb} on ${resource}`),
    mutate,
    validate,
    persist,
  ];
}

export interface Report {
  title: string;
  changed: string;
  actor: string;
  reason: string;
  notYet: string;
}

/** Report for a control change before any send: names the change, never the outcome. */
export function reportForChange(changed: string): Report {
  return {
    title: 'Request not sent',
    changed,
    actor: 'You, through a fixture control',
    reason: 'Authentication, RBAC and admission run only when the request is sent. This change edits the request or the fixture state it will meet.',
    notYet: 'No credential was checked, no permission was evaluated and nothing was stored.',
  };
}

export function reportForMotion(): Report {
  return {
    title: 'Request in flight',
    changed: 'The request is moving through the API server checks in order.',
    actor: 'The API server',
    reason: 'Each check stops the request at its first failure, so later checks are not reached.',
    notYet: 'No outcome yet. Nothing is stored until every check has passed.',
  };
}

const mutationNote = (ev: Evaluation, enabled: boolean) => {
  if (!enabled) return '';
  return ev.mutated.length
    ? ` The mutating step added ${ev.mutated.map((field) => fieldPath[field]).join(', ')} first, and validation checked the mutated object.`
    : ' The mutating step changed nothing: every default was already set.';
};

export function reportForOutcome(config: Config, ev: Evaluation): Report {
  const caller = callers[config.caller].label;
  if (ev.stop === 'authn') {
    return {
      title: '401 Unauthorized · stopped at authentication',
      changed: 'No object was written. No permission was evaluated.',
      actor: 'Authentication: the API server verifies the presented credential.',
      reason: `${caller} produced no valid identity, so every later check is skipped.`,
      notYet: 'RBAC and admission were not reached. A valid identity would still need a RoleBinding and an admissible object.',
    };
  }
  if (ev.stop === 'binding') {
    return {
      title: '403 Forbidden · RBAC denied',
      changed: 'No object was written. Admission was not reached.',
      actor: 'RBAC authorizer, using the RoleBinding and Role objects in sandbox.',
      reason: config.roleBinding
        ? `Authenticated identity ${ev.identity} is not the subject of the RoleBinding, so no Role applies to it.`
        : `No RoleBinding in sandbox names ${ev.identity}. RBAC is deny by default: with no binding there is no grant to apply.`,
      notYet: 'Authentication proved who sent the request, not what it may do. Permission must be granted explicitly.',
    };
  }
  if (ev.stop === 'rule') {
    const { label, verb, resource } = operations[config.operation];
    return {
      title: '403 Forbidden · RBAC denied',
      changed: 'No object was written. Admission was not reached.',
      actor: 'RBAC authorizer: RoleBinding deployer-pod-writer → Role pod-writer.',
      reason: `Role pod-writer grants create on pods only. "${label}" needs ${verb} on ${resource}.`,
      notYet: 'Permission is per verb and resource. Other verbs or resources are separate decisions.',
    };
  }
  if (ev.stop === 'validate') {
    const privilegedNote = ev.violations.includes('privileged: true')
      ? ' A default cannot remove privileged: true; the Pod author must change it.'
      : '';
    return {
      title: 'Rejected by PodSecurity admission · nothing stored',
      changed: `The Pod was not written to etcd.${mutationNote(ev, config.mutatingDefaults)}`,
      actor: 'PodSecurity admission for sandbox (enforce=restricted), after the mutating step.',
      reason: `The message has the shape: violates PodSecurity "restricted": ${ev.violations.join('; ')}.${privilegedNote}`,
      notYet: 'RBAC had already allowed this request, and authorization never promised an admissible object. Read the message, not the word forbidden: RBAC rejections also say forbidden, and only this message names PodSecurity.',
    };
  }
  return {
    title: 'Pod report-job stored · unassigned',
    changed: `Pod written through the API server. spec.nodeName is empty.${mutationNote(ev, config.mutatingDefaults)}`,
    actor: 'API server, after authentication, RBAC, mutating admission and validating admission.',
    reason: `Authentication passed, the RoleBinding names the caller and the Role allows create on pods. ${
      config.enforceRestricted
        ? 'The validated object passes the five modelled restricted checks.'
        : 'sandbox has no enforce label, so PodSecurity did not check the object.'
    }`,
    notYet: 'Not scheduled, not assigned to a node and not Running. What happens after storage (scheduling, image pull, container start) is outside this fixture.',
  };
}

export interface Line {
  text: string;
  highlight: boolean;
}
const at = (text: string, key?: string, focus?: ReadonlySet<string>): Line => ({
  text, highlight: key !== undefined && (focus?.has(key) ?? false),
});

/** Pod manifest for the request body. Shows the submitted securityContext, or the object as validated once validation has run. */
export function podLines(config: Config, evaluation: Evaluation | null, focus: ReadonlySet<string> = new Set()): Line[] {
  if (config.operation !== 'create-pod') return [at('# A read has no request body: no Pod is submitted.', 'ctx', focus)];
  const validated = evaluation && evaluation.validate !== 'unreached' ? evaluation : null;
  const context = validated ? validated.context : profiles[config.podProfile].context;
  const mutated: ContextField[] = validated ? validated.mutated : [];
  const lines: Line[] = [
    at('apiVersion: v1'), at('kind: Pod'), at('metadata:'), at('  name: report-job'), at('  namespace: sandbox'),
    at('spec:'), at('  serviceAccountName: deployer'), at('  containers:'),
    at('    - name: report'), at('      image: registry.example.com/report:1.4.2'),
  ];
  const has = (Object.keys(fieldPath) as ContextField[]).some((field) => context[field] !== undefined);
  if (!has) return [...lines, at('      # securityContext: absent', 'ctx', focus)];
  lines.push(at('      securityContext:', 'ctx', focus));
  const rows: Array<[ContextField, string[]]> = [
    ['privileged', [`        privileged: ${context.privileged}`]],
    ['runAsNonRoot', [`        runAsNonRoot: ${context.runAsNonRoot}`]],
    ['allowPrivilegeEscalation', [`        allowPrivilegeEscalation: ${context.allowPrivilegeEscalation}`]],
    ['seccompRuntimeDefault', ['        seccompProfile:', '          type: RuntimeDefault']],
    ['capabilitiesDropAll', ['        capabilities:', '          drop: ["ALL"]']],
  ];
  for (const [field, texts] of rows) {
    if (context[field] === undefined) continue;
    texts.forEach((text, index) => lines.push(at(index === texts.length - 1 && mutated.includes(field) ? `${text}  # added by mutating step` : text, `ctx:${field}`, focus)));
  }
  return lines;
}

/** RBAC and namespace objects that the request meets in sandbox. */
export function rbacLines(config: Config, focus: ReadonlySet<string> = new Set()): Line[] {
  const lines: Line[] = [
    at('apiVersion: v1'), at('kind: ServiceAccount'), at('metadata:'), at('  name: deployer'), at('  namespace: sandbox'),
    at('---'),
    at('apiVersion: rbac.authorization.k8s.io/v1'), at('kind: Role'), at('metadata:'), at('  name: pod-writer'), at('  namespace: sandbox'),
    at('rules:'), at('  - apiGroups: [""]', 'role', focus), at('    resources: ["pods"]', 'role', focus), at('    verbs: ["create"]', 'role', focus),
    at('---'),
  ];
  if (config.roleBinding) {
    lines.push(
      at('apiVersion: rbac.authorization.k8s.io/v1'), at('kind: RoleBinding'), at('metadata:'), at('  name: deployer-pod-writer'), at('  namespace: sandbox'),
      at('subjects:'), at('  - kind: ServiceAccount', 'sa', focus), at('    name: deployer', 'sa', focus), at('    namespace: sandbox', 'sa', focus),
      at('roleRef:'), at('  apiGroup: rbac.authorization.k8s.io', 'rb', focus), at('  kind: Role', 'rb', focus), at('  name: pod-writer', 'rb', focus),
    );
  } else {
    lines.push(at('# RoleBinding deployer-pod-writer: absent (not present in sandbox)', 'rb', focus));
  }
  lines.push(at('---'), at('apiVersion: v1'), at('kind: Namespace'), at('metadata:'), at('  name: sandbox'), at('  labels:'));
  lines.push(config.enforceRestricted
    ? at('    pod-security.kubernetes.io/enforce: restricted', 'ns', focus)
    : at('    # no pod-security.kubernetes.io/enforce label', 'ns', focus));
  return lines;
}
