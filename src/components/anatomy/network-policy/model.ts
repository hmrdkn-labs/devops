/**
 * Pure NetworkPolicy fixture. Namespace `shop`: client (role=frontend), two web Pods (app=web)
 * behind Service web (port 80 -> targetPort 8080), and db (app=db).
 *
 * A Pod is non-isolated for a direction until a NetworkPolicy selects it and lists that direction.
 * Once isolated, only the union of allow rules passes. A connection needs the source's egress
 * allowance AND the destination's ingress allowance. Enforcement exists only where the network
 * plugin implements NetworkPolicy; otherwise stored objects have no effect.
 *
 * Fixture simplifications, named on the page: one endpoint sits behind the Service; the DNS gate
 * runs before the Service gate; egress ports are compared against the Pod port.
 */

export const NAMESPACE = 'shop';
export const SERVICE_PORT = 80;
export const POD_PORT = 8080;
export const DB_PORT = 5432;

export type PodId = 'client' | 'web-a' | 'web-b' | 'db';
export type Probe = 'client-web' | 'web-db' | 'client-db';
export type Gate = 'client-egress-dns' | 'client-egress' | 'web-egress' | 'web-ingress' | 'db-ingress';
export type Hatch = 'client-out' | 'client-in' | 'web-a-out' | 'web-a-in' | 'web-b-out' | 'web-b-in' | 'db-out' | 'db-in';
export type WebPort = typeof POD_PORT | typeof SERVICE_PORT;
export type Check = 'pass' | 'block' | 'not-armed' | 'not-reached';
export type Posture = 'open' | 'armed' | 'stored';
type Labels = Record<string, string>;

export const PODS: readonly PodId[] = ['client', 'web-a', 'web-b', 'db'];
export const HATCHES: readonly Hatch[] = ['client-out', 'client-in', 'web-a-out', 'web-a-in', 'web-b-out', 'web-b-in', 'db-out', 'db-in'];

export interface Config {
  /** The cluster's network plugin implements NetworkPolicy. */
  enforcing: boolean;
  /** client-egress is applied (selects role=frontend, lists Egress). */
  clientEgress: boolean;
  /** client-egress includes UDP and TCP 53 to kube-dns. Only meaningful while client-egress is applied. */
  dnsAllowed: boolean;
  /** web-ingress is applied (selects app=web, lists Ingress). */
  webIngress: boolean;
  /** Port written in web-ingress. 8080 is the Pod port; 80 is the Service port (a mistake). */
  webPort: WebPort;
  /** db-ingress is applied (selects app=db, lists Ingress). */
  dbIngress: boolean;
}

export const initialConfig: Config = {
  enforcing: true, clientEgress: false, dnsAllowed: true, webIngress: false, webPort: POD_PORT, dbIngress: false,
};

export const pods: Record<PodId, { name: string; labels: Labels }> = {
  client: { name: 'client', labels: { role: 'frontend' } },
  'web-a': { name: 'web-7c9d4-x2kq8', labels: { app: 'web' } },
  'web-b': { name: 'web-7c9d4-m8vz3', labels: { app: 'web' } },
  db: { name: 'db', labels: { app: 'db' } },
};

/** The two hatches (out = egress gate, in = ingress gate) on each Pod's roof. */
export const hatchesOf: Record<PodId, { out: Hatch; in: Hatch }> = {
  client: { out: 'client-out', in: 'client-in' },
  'web-a': { out: 'web-a-out', in: 'web-a-in' },
  'web-b': { out: 'web-b-out', in: 'web-b-in' },
  db: { out: 'db-out', in: 'db-in' },
};

export interface Flow {
  src: PodId;
  dst: PodId;
  /** Port the destination Pod receives. Service traffic is translated 80 -> 8080 before any ingress gate. */
  dstPort: number;
  service: boolean;
  gates: readonly Gate[];
  from: Hatch;
  to: Hatch;
}

export const flows: Record<Probe, Flow> = {
  'client-web': { src: 'client', dst: 'web-a', dstPort: POD_PORT, service: true, gates: ['client-egress-dns', 'client-egress', 'web-ingress'], from: 'client-out', to: 'web-a-in' },
  'web-db': { src: 'web-a', dst: 'db', dstPort: DB_PORT, service: false, gates: ['web-egress', 'db-ingress'], from: 'web-a-out', to: 'db-in' },
  'client-db': { src: 'client', dst: 'db', dstPort: DB_PORT, service: false, gates: ['client-egress', 'db-ingress'], from: 'client-out', to: 'db-in' },
};

export const hatchOfGate: Record<Gate, Hatch> = {
  'client-egress-dns': 'client-out', 'client-egress': 'client-out', 'web-egress': 'web-a-out', 'web-ingress': 'web-a-in', 'db-ingress': 'db-in',
};

/** Whether a NetworkPolicy is applied in the API for this gate's direction. Storage does not need enforcement. */
export function appliedGate(gate: Gate, c: Config): boolean {
  switch (gate) {
    case 'client-egress-dns':
    case 'client-egress': return c.clientEgress;
    case 'web-egress': return false; // no policy in this fixture isolates web Pods for egress
    case 'web-ingress': return c.webIngress;
    case 'db-ingress': return c.dbIngress;
  }
}

/** A gate checks traffic only when its policy is applied AND the plugin enforces it. */
export function armedGate(gate: Gate, c: Config): boolean {
  return c.enforcing && appliedGate(gate, c);
}

const has = (labels: Labels, selector: Labels) => Object.entries(selector).every(([key, value]) => labels[key] === value);

/** Whether the armed policy admits this flow at this gate. Labels select; ports must match exactly. */
function admits(gate: Gate, c: Config, flow: Flow): boolean {
  switch (gate) {
    case 'client-egress-dns': return c.dnsAllowed;
    case 'client-egress': return has(pods[flow.dst].labels, { app: 'web' }) && flow.dstPort === POD_PORT;
    case 'web-egress': return true;
    case 'web-ingress': return has(pods[flow.src].labels, { role: 'frontend' }) && flow.dstPort === c.webPort;
    case 'db-ingress': return has(pods[flow.src].labels, { app: 'web' }) && flow.dstPort === DB_PORT;
  }
}

function walk(c: Config, flow: Flow) {
  const checks: Partial<Record<Gate, Check>> = {};
  let stopped: Gate | null = null;
  for (const gate of flow.gates) {
    if (stopped) checks[gate] = 'not-reached';
    else if (!armedGate(gate, c)) checks[gate] = 'not-armed';
    else if (admits(gate, c, flow)) checks[gate] = 'pass';
    else { checks[gate] = 'block'; stopped = gate; }
  }
  return { checks, stopped };
}

export interface Verdict {
  probe: Probe;
  delivered: boolean;
  /** First armed gate that dropped the connection, or null. */
  stopped: Gate | null;
  checks: Partial<Record<Gate, Check>>;
  destPort: number;
  /** Service port the client dialled, when the probe is Service-addressed. */
  servicePort: number | null;
  /** What would have stopped the flow if the plugin enforced. Equals `stopped` when enforcing. */
  wouldStopAt: Gate | null;
}

export function evaluate(config: Config, probe: Probe): Verdict {
  const flow = flows[probe];
  const actual = walk(config, flow);
  const enforced = walk({ ...config, enforcing: true }, flow);
  return {
    probe,
    delivered: actual.stopped === null,
    stopped: actual.stopped,
    checks: actual.checks,
    destPort: flow.dstPort,
    servicePort: flow.service ? SERVICE_PORT : null,
    wouldStopAt: enforced.stopped,
  };
}

/** Per-hatch posture. `open` and `stored` lids are up (traffic passes); `armed` lids are down (the gate checks). */
export function postureOf(c: Config): Record<Hatch, Posture> {
  const posture = (applied: boolean): Posture => (!applied ? 'open' : c.enforcing ? 'armed' : 'stored');
  return {
    'client-out': posture(appliedGate('client-egress', c)),
    'client-in': 'open',
    'web-a-out': 'open',
    'web-a-in': posture(appliedGate('web-ingress', c)),
    'web-b-out': 'open',
    'web-b-in': posture(appliedGate('web-ingress', c)),
    'db-out': 'open',
    'db-in': posture(appliedGate('db-ingress', c)),
  };
}

/** Which applied policy selects this Pod, and for which direction. */
export function policiesSelecting(pod: PodId, c: Config): string[] {
  if (pod === 'client') return c.clientEgress ? ['client-egress (Egress)'] : [];
  if (pod === 'db') return c.dbIngress ? ['db-ingress (Ingress)'] : [];
  return c.webIngress ? ['web-ingress (Ingress)'] : [];
}

export interface ManifestLine { text: string; tags: readonly string[] }

/** Manifest tags each gate reads when it evaluates a policy (not when it is merely not armed). */
const tagsOfGate: Record<Gate, readonly string[]> = {
  'client-egress-dns': ['client-isolate', 'dns'],
  'client-egress': ['client-isolate', 'egress-web'],
  'web-egress': [],
  'web-ingress': ['web-isolate', 'web-rule', 'web-port'],
  'db-ingress': ['db-isolate', 'db-rule'],
};

/** Lines a probe read: the Service when the probe is Service-addressed, plus every gate that evaluated a policy. */
export function tagsForVerdict(v: Verdict): string[] {
  const tags = new Set<string>(flows[v.probe].service ? ['svc'] : []);
  for (const gate of Object.keys(v.checks) as Gate[]) {
    const check = v.checks[gate];
    if (check === 'pass' || check === 'block') for (const tag of tagsOfGate[gate]) tags.add(tag);
  }
  return [...tags];
}

const tagsOfKey: Record<keyof Config, readonly string[]> = {
  enforcing: ['client-isolate', 'egress-web', 'dns', 'web-isolate', 'web-rule', 'web-port', 'db-isolate', 'db-rule'],
  clientEgress: ['client-isolate', 'egress-web', 'dns'],
  dnsAllowed: ['dns'],
  webIngress: ['web-isolate', 'web-rule', 'web-port'],
  webPort: ['web-rule', 'web-port'],
  dbIngress: ['db-isolate', 'db-rule'],
};

/** Lines a configuration change read or changed. */
export function tagsForChange(key: keyof Config): readonly string[] {
  return tagsOfKey[key];
}

/** The YAML the cluster holds for the applied objects. Stored objects remain here even when not enforced. */
export function manifestFor(c: Config): ManifestLine[] {
  const out: ManifestLine[] = [];
  const push = (text: string, tags: readonly string[] = []) => out.push({ text, tags });
  const separate = () => { if (out.length) push('---'); };

  separate();
  push('apiVersion: v1');
  push('kind: Service');
  push('metadata:');
  push('  name: web');
  push(`  namespace: ${NAMESPACE}`);
  push('spec:');
  push('  selector:');
  push('    app: web');
  push('  ports:');
  push('    - protocol: TCP');
  push('      port: 80                 # Service port: what clients dial', ['svc']);
  push('      targetPort: 8080         # Pod port: what NetworkPolicy compares', ['svc']);

  if (c.webIngress) {
    separate();
    push('apiVersion: networking.k8s.io/v1');
    push('kind: NetworkPolicy');
    push('metadata:');
    push('  name: web-ingress');
    push(`  namespace: ${NAMESPACE}`);
    push('spec:');
    push('  podSelector:               # selects app=web Pods: isolates them for Ingress', ['web-isolate']);
    push('    matchLabels:', ['web-isolate']);
    push('      app: web', ['web-isolate']);
    push('  policyTypes:', ['web-isolate']);
    push('    - Ingress', ['web-isolate']);
    push('  ingress:');
    push('    - from:', ['web-rule']);
    push('        - podSelector:', ['web-rule']);
    push('            matchLabels:', ['web-rule']);
    push('              role: frontend', ['web-rule']);
    push('      ports:', ['web-rule']);
    push('        - protocol: TCP', ['web-rule']);
    push(c.webPort === POD_PORT
      ? `          port: ${c.webPort}           # Pod port (targetPort), as the Pod receives it`
      : `          port: ${c.webPort}           # Service port: no connection arrives on a Pod at 80`, ['web-rule', 'web-port']);
  }

  if (c.dbIngress) {
    separate();
    push('apiVersion: networking.k8s.io/v1');
    push('kind: NetworkPolicy');
    push('metadata:');
    push('  name: db-ingress');
    push(`  namespace: ${NAMESPACE}`);
    push('spec:');
    push('  podSelector:               # selects app=db Pods', ['db-isolate']);
    push('    matchLabels:', ['db-isolate']);
    push('      app: db', ['db-isolate']);
    push('  policyTypes:', ['db-isolate']);
    push('    - Ingress', ['db-isolate']);
    push('  ingress:');
    push('    - from:', ['db-rule']);
    push('        - podSelector:', ['db-rule']);
    push('            matchLabels:', ['db-rule']);
    push('              app: web', ['db-rule']);
    push('      ports:', ['db-rule']);
    push('        - protocol: TCP', ['db-rule']);
    push(`          port: ${DB_PORT}`, ['db-rule']);
  }

  if (c.clientEgress) {
    separate();
    push('apiVersion: networking.k8s.io/v1');
    push('kind: NetworkPolicy');
    push('metadata:');
    push('  name: client-egress');
    push(`  namespace: ${NAMESPACE}`);
    push('spec:');
    push('  podSelector:               # selects role=frontend Pods: isolates them for Egress', ['client-isolate']);
    push('    matchLabels:', ['client-isolate']);
    push('      role: frontend', ['client-isolate']);
    push('  policyTypes:', ['client-isolate']);
    push('    - Egress', ['client-isolate']);
    push('  egress:');
    push('    - to:', ['egress-web']);
    push('        - podSelector:', ['egress-web']);
    push('            matchLabels:', ['egress-web']);
    push('              app: web', ['egress-web']);
    push('      ports:', ['egress-web']);
    push('        - protocol: TCP', ['egress-web']);
    push('          port: 8080               # Pod port; see Assumptions on Service ports for egress', ['egress-web']);
    if (c.dnsAllowed) {
      push('    - to:                    # one item, both selectors: kube-dns Pods in kube-system', ['dns']);
      push('        - namespaceSelector:', ['dns']);
      push('            matchLabels:', ['dns']);
      push('              kubernetes.io/metadata.name: kube-system', ['dns']);
      push('          podSelector:', ['dns']);
      push('            matchLabels:', ['dns']);
      push('              k8s-app: kube-dns', ['dns']);
      push('      ports:', ['dns']);
      push('        - protocol: UDP', ['dns']);
      push('          port: 53', ['dns']);
      push('        - protocol: TCP', ['dns']);
      push('          port: 53', ['dns']);
    }
  }
  return out;
}
