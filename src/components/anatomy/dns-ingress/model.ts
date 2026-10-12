// Pure, deterministic fixture for DNS names, Service endpoints and an Ingress edge.
// Shared networking fixture: namespace shop (client Pod, Service web, Pods web-7c9d4-*),
// namespace billing (Service ledger). Not a live cluster; no DOM, no randomness.

export const PODS = ['web-7c9d4-k2xqp', 'web-7c9d4-w8mvn'] as const;
export type PodName = (typeof PODS)[number];
export type Query = 'web' | 'ledger' | 'ledger.billing' | 'ledger.billing.svc.cluster.local.';
export type Host = 'shop.example.com' | 'other.example.com';
export type ServiceName = 'web' | 'ledger';
/** Where the moving request card can rest: a DNS drawer, a Service, a Pod, or the edge. */
export type Station = 'drawer' | 'outside' | 'gate' | 'web' | 'billing' | PodName;
export type RunKind = 'resolve' | 'in-cluster' | 'external';
/** External checks in the order a real controller reaches them: the TLS handshake (SNI) before the Host rule. */
export type CheckId = 'public-dns' | 'controller' | 'tls' | 'rule' | 'backend' | 'endpoint';
export type ManifestKey = 'svc-name' | 'svc-namespace' | 'svc-selector' | 'svc-ports' | 'ing-class' | 'ing-host' | 'ing-tls' | 'ing-backend';
export type Setting = 'query' | 'webService' | 'publicDns' | 'controller' | 'ingress' | 'host' | 'tlsSecret' | PodName;
/** answered: a name or Service was reached and nothing was sent; stopped: the card rests at a failing station; delivered: a Ready Pod received the request. */
export type Outcome = 'answered' | 'stopped' | 'delivered';

export interface Config {
  query: Query;
  webService: boolean;
  ready: Record<PodName, boolean>;
  publicDns: boolean;
  controller: boolean;
  ingress: boolean;
  host: Host;
  tlsSecret: boolean;
}

export const initialConfig: Config = {
  query: 'web',
  webService: true,
  ready: { 'web-7c9d4-k2xqp': true, 'web-7c9d4-w8mvn': true },
  publicDns: true,
  controller: true,
  ingress: true,
  host: 'shop.example.com',
  tlsSecret: true,
};

/** resolv.conf written by kubelet for a Pod in shop, with the default ndots:5. */
export const SEARCH = ['shop.svc.cluster.local', 'svc.cluster.local', 'cluster.local'] as const;
export const NDOTS = 5;
export const CLUSTER_IP: Record<ServiceName, string> = { web: '10.96.20.10', ledger: '10.96.31.5' };
export const POD_IP: Record<PodName, string> = { 'web-7c9d4-k2xqp': '10.244.1.23', 'web-7c9d4-w8mvn': '10.244.2.17' };
/** Documentation address range (RFC 5737); a stand-in for the controller's external address. */
export const EDGE_ADDRESS = '203.0.113.10';
const RECORDS: Partial<Record<string, ServiceName>> = {
  'web.shop.svc.cluster.local': 'web',
  'ledger.billing.svc.cluster.local': 'ledger',
};

/** Names the client resolver tries, in order. Names with at least NDOTS dots are tried as-is first. */
export function candidates(query: Query): string[] {
  if (query.endsWith('.')) return [query];
  const absolute = `${query}.`;
  const searched = SEARCH.map((domain) => `${query}.${domain}`);
  const dots = query.split('.').length - 1;
  return dots >= NDOTS ? [absolute, ...searched] : [...searched, absolute];
}

export interface Attempt { name: string; service: ServiceName | null }
export interface Resolution { tried: Attempt[]; answer: ServiceName | null }

/** A record exists only for a Service object that exists. */
export function lookup(name: string, config: Config): ServiceName | null {
  const service = RECORDS[name.replace(/\.$/, '')];
  if (!service) return null;
  if (service === 'web' && !config.webService) return null;
  return service;
}

/** Resolver behaviour: stop at the first answer; otherwise every candidate is tried. */
export function resolve(config: Config): Resolution {
  const tried: Attempt[] = [];
  for (const name of candidates(config.query)) {
    const service = lookup(name, config);
    tried.push({ name, service });
    if (service) return { tried, answer: service };
  }
  return { tried, answer: null };
}

/** Only Ready Pods of an existing Service are endpoints. Assignment and Running do not count. */
export function webEndpoints(config: Config): PodName[] {
  return config.webService ? PODS.filter((pod) => config.ready[pod]) : [];
}

export interface Check { id: CheckId; label: string; state: 'pass' | 'fail' | 'not-run'; detail: string }
export interface Report { title: string; changed: string; actor: string; reason: string; notYet: string }
export interface Run {
  kind: RunKind;
  /** Where the request card travels, starting at its home station; the last station is where it rests. */
  stations: Station[];
  resolution: Resolution | null;
  checks: Check[];
  pod: PodName | null;
  focus: ManifestKey[];
  outcome: Outcome;
  report: Report;
}

const TRY_ORDER = (tried: Attempt[]) => tried.map((attempt) => `${attempt.name} ${attempt.service ? '→ answer' : '→ no record'}`).join(', ');

export function runResolve(config: Config): Run {
  const resolution = resolve(config);
  const stations: Station[] = resolution.answer === 'web' ? ['drawer', 'web'] : resolution.answer === 'ledger' ? ['drawer', 'billing'] : ['drawer'];
  const reason = nameReason(config.query, config.webService);
  const report: Report = resolution.answer
    ? {
      title: `Name answered by Service ${resolution.answer}`,
      changed: `Tried ${TRY_ORDER(resolution.tried)}. Answer: ${CLUSTER_IP[resolution.answer]}, the ClusterIP of ${resolution.answer}.`,
      actor: 'The client Pod resolver (resolv.conf written by kubelet), asking cluster DNS, which answers from Service records.',
      reason,
      notYet: 'No connection was made and no endpoint was chosen. A ClusterIP answer does not show that any Pod is Ready.',
    }
    : {
      title: 'No DNS answer for this name',
      changed: `Tried ${TRY_ORDER(resolution.tried)}. No candidate has a record.`,
      actor: 'The client Pod resolver, asking cluster DNS, which holds records only for existing Service objects.',
      reason,
      notYet: 'No connection was attempted. Nothing about endpoints was checked.',
    };
  return { kind: 'resolve', stations, resolution, checks: [], pod: null, focus: ['svc-name', 'svc-namespace'], outcome: resolution.answer ? 'answered' : 'stopped', report };
}

function nameReason(query: Query, webService: boolean): string {
  if (query === 'web') return webService
    ? '`web` has no dots, below ndots:5, so search domains are tried before the bare name; the first candidate matches Service web in shop.'
    : 'Service web is absent from shop, so no candidate has a record.';
  if (query === 'ledger') return 'A short name is expanded only with shop’s search path. ledger lives in billing, so no candidate matches.';
  if (query === 'ledger.billing') return '1 dot, below ndots:5: search domains are tried first. ledger.billing.shop.svc.cluster.local misses; ledger.billing.svc.cluster.local matches.';
  return 'The trailing dot marks the name as absolute, so no search domain is appended and only this one name is tried.';
}

export function runInCluster(config: Config): Run {
  const resolution = resolve(config);
  const base = { kind: 'in-cluster' as const, resolution, checks: [], pod: null };
  if (!resolution.answer) {
    return { ...base, stations: ['drawer'], focus: ['svc-name', 'svc-namespace'], outcome: 'stopped', report: {
      title: 'Connection not started: no name answer',
      changed: `Tried ${TRY_ORDER(resolution.tried)}. The request token stays at the client.`,
      actor: 'The client Pod resolver, asking cluster DNS, which holds records only for existing Service objects.',
      reason: nameReason(config.query, config.webService),
      notYet: 'No Service, endpoint or Pod was reached.',
    } };
  }
  if (resolution.answer === 'ledger') {
    return { ...base, stations: ['drawer', 'billing'], focus: ['svc-name', 'svc-namespace'], outcome: 'answered', report: {
      title: 'Name answered by Service ledger in billing',
      changed: `Answer: ${CLUSTER_IP.ledger}, the ClusterIP of ledger. This fixture draws no billing Pods, so the token stops at the billing Service.`,
      actor: 'Cluster DNS for the billing Service; the client Pod resolver used the namespace in the query.',
      reason: nameReason(config.query, config.webService),
      notYet: 'No endpoint, response or port for ledger was checked.',
    } };
  }
  const pod = webEndpoints(config)[0] ?? null;
  if (!pod) {
    return { ...base, stations: ['drawer', 'web'], focus: ['svc-name', 'svc-namespace', 'svc-selector'], outcome: 'stopped', report: {
      title: 'No ready endpoint for Service web',
      changed: `DNS answered ${CLUSTER_IP.web}. The ready set is empty, so the token stops at the Service and is not forwarded.`,
      actor: 'The EndpointSlice controller lists only Ready Pods; kubelet readiness results decide Ready.',
      reason: 'Both Pods are Not Ready, so the Service has nothing to forward to.',
      notYet: 'The name still resolves. Nothing was restarted or changed; this does not show why a Pod is not Ready.',
    } };
  }
  return { ...base, stations: ['drawer', 'web', pod], pod, focus: ['svc-name', 'svc-namespace', 'svc-ports', 'svc-selector'], outcome: 'delivered', report: {
    title: `Connection forwarded to ${pod}:8080`,
    changed: `${CLUSTER_IP.web}:80 was steered to ${pod} at ${POD_IP[pod]}; Service port 80 maps to targetPort 8080.`,
    actor: 'The data plane on the client’s node (kube-proxy or an eBPF equivalent), driven by the EndpointSlice for Service web.',
    reason: 'Only Ready endpoints receive new connections. This fixture always picks the first Ready Pod in name order; a real data plane may choose differently.',
    notYet: 'The app’s response is not observed. The listener on 8080, NetworkPolicy and HTTP status remain unverified.',
  } };
}

export const CHECK_LABEL: Record<CheckId, string> = {
  'public-dns': 'Public DNS for the requested host',
  controller: 'Edge controller listening',
  tls: 'TLS secret shop-tls',
  rule: 'Ingress rule for host and path /',
  backend: 'Backend Service web:80',
  endpoint: 'Ready endpoint behind web',
};
/** Where the card rests when a check fails: the last station it reached. */
const EXTERNAL_STOPS: Record<CheckId, Station[]> = {
  'public-dns': ['outside'],
  controller: ['outside'],
  tls: ['outside', 'gate'],
  rule: ['outside', 'gate'],
  backend: ['outside', 'gate'],
  endpoint: ['outside', 'gate', 'web'],
};

export function runExternal(config: Config): Run {
  const pod = webEndpoints(config)[0] ?? null;
  const ruleOk = config.ingress && config.host === 'shop.example.com';
  const defs: Array<{ id: CheckId; ok: boolean; passDetail: string; failDetail: string }> = [
    { id: 'public-dns', ok: config.publicDns, passDetail: `Points at ${EDGE_ADDRESS}`, failDetail: 'No public record; the browser never reaches the cluster edge' },
    { id: 'controller', ok: config.controller, passDetail: 'Controller for class edge-proxy is running', failDetail: `Nothing answers at ${EDGE_ADDRESS}` },
    { id: 'tls', ok: config.tlsSecret, passDetail: 'tls.crt and tls.key readable from shop-tls', failDetail: 'Secret shop-tls absent; no certificate for shop.example.com can be presented' },
    { id: 'rule', ok: ruleOk, passDetail: 'shop.example.com / → Service web:80', failDetail: config.ingress ? `No rule for ${config.host}; no defaultBackend` : 'No Ingress object applied' },
    { id: 'backend', ok: config.webService, passDetail: 'Service web exists in shop', failDetail: 'Service web absent in shop' },
    { id: 'endpoint', ok: pod !== null, passDetail: `${pod ?? ''} is Ready`, failDetail: 'No Ready Pod in the ready set' },
  ];
  const checks: Check[] = [];
  let failed: CheckId | null = null;
  for (const def of defs) {
    if (failed) { checks.push({ id: def.id, label: CHECK_LABEL[def.id], state: 'not-run', detail: 'Not reached' }); continue; }
    checks.push({ id: def.id, label: CHECK_LABEL[def.id], state: def.ok ? 'pass' : 'fail', detail: def.ok ? def.passDetail : def.failDetail });
    if (!def.ok) failed = def.id;
  }
  const stations: Station[] = failed ? EXTERNAL_STOPS[failed] : ['outside', 'gate', 'web', ...(pod ? [pod] : [])];
  const focus: ManifestKey[] = ['ing-class', 'ing-host', 'ing-tls', 'ing-backend'];
  if (!failed || failed === 'endpoint') focus.push('svc-selector');
  return { kind: 'external', stations, resolution: null, checks, pod: failed ? null : pod, focus, outcome: failed ? 'stopped' : 'delivered', report: externalReport(config, failed, pod) };
}

function externalReport(config: Config, failed: CheckId | null, pod: PodName | null): Report {
  const edge = 'The Ingress controller for class edge-proxy';
  if (!failed && pod) return {
    title: `Request forwarded to ${pod}:8080 by the controller`,
    changed: `The controller completed TLS with shop-tls, matched the host and path, and forwarded to Service web:80 and the ready Pod's targetPort 8080.`,
    actor: `${edge}, using the Ingress rule and the ready endpoints of Service web.`,
    reason: 'The certificate was readable, the Host header matched the rule, and one endpoint was Ready.',
    notYet: 'The HTTP response, the app’s behaviour and NetworkPolicy were not observed. Encryption from the controller to the Pod is not part of this fixture.',
  };
  switch (failed) {
    case 'public-dns': return {
      title: 'Browser never reached the cluster edge',
      changed: `No public record points the host at ${EDGE_ADDRESS}. The request stops before the cluster.`,
      actor: 'The domain’s public DNS provider, outside the cluster; cluster DNS never sees this query.',
      reason: 'Browsers resolve public hostnames through public DNS.',
      notYet: 'No Service, Ingress rule or Pod was reached or checked.',
    };
    case 'controller': return {
      title: 'Nothing answers at the edge address',
      changed: `Public DNS points at ${EDGE_ADDRESS}, but no controller for edge-proxy is running to listen there.`,
      actor: 'Nothing is running to answer; an operator must install and run a controller for the class.',
      reason: 'An Ingress has no effect until a controller that implements its class is running.',
      notYet: 'The Ingress object may be valid; its rules were not evaluated.',
    };
    case 'tls': return {
      title: 'No certificate for shop.example.com at the gate',
      changed: 'No certificate for shop.example.com can be presented from Secret shop-tls.',
      actor: `${edge}, reading the tls block of the Ingress and the Secret it names.`,
      reason: 'TLS terminates at the controller, which reads tls.crt and tls.key from the Secret named in the Ingress tls block.',
      notYet: 'What the client sees (default certificate, handshake error) is controller-specific; routing to Service web was not evaluated by this fixture.',
    };
    case 'rule': return {
      title: 'Controller answered at the gate without a route',
      changed: config.ingress
        ? `No rule matches Host ${config.host}. No defaultBackend is set, so the controller returns its own default response (commonly 404).`
        : 'No Ingress object is applied, so the controller has no rules and returns its own default response (commonly 404).',
      actor: `${edge}, which builds its rule table from Ingress objects.`,
      reason: config.ingress ? 'Rules match the Host header; the only rule is for shop.example.com.' : 'The controller routes only with rules it has been given.',
      notYet: 'Service web was not reached and its endpoints were not evaluated.',
    };
    case 'backend': return {
      title: 'Controller has no Service web to route to',
      changed: 'The rule matches shop.example.com → Service web:80, but Service web is absent in shop.',
      actor: `${edge}, which routes to the Services named in Ingress backends.`,
      reason: 'The Ingress backend names Service web on port 80, and no Service web exists in shop in this fixture.',
      notYet: 'No endpoint was evaluated. The Ingress object is still applied.',
    };
    case 'endpoint': return {
      title: 'Controller found no Ready Pod behind web',
      changed: 'The rule matches and Service web exists, but its ready set is empty, so the token stops at the Service.',
      actor: `${edge}, forwarding to the endpoints of Service web; the exact mechanism is controller-specific.`,
      reason: 'Both Pods are Not Ready.',
      notYet: 'The Ingress and Service are correct; readiness is the blocker. Nothing was restarted.',
    };
    default: return { title: '', changed: '', actor: '', reason: '', notYet: '' };
  }
}

export function startReport(): Report {
  return {
    title: 'Nothing has run yet',
    changed: 'The fixture starts from the settings shown. No lookup, endpoint choice or request has happened.',
    actor: 'The fixture start state. Change a setting or run a path.',
    reason: 'Settings describe cluster state before any traffic.',
    notYet: 'No name, endpoint or HTTP response has been checked.',
  };
}

export function settingReport(setting: Setting, config: Config): Report {
  const base = { notYet: 'No lookup or request has run since this change.' };
  const you = 'You, in this fixture.';
  if (setting === 'query') return { ...base, title: `Lookup name set to ${config.query}`,
    changed: `The client will ask for ${config.query}. The last run was cleared.`,
    actor: `${you} In a Pod, the application's configured hostname or URL.`,
    reason: 'Search-path expansion depends on the dot count and the namespace in the name.',
    notYet: 'Nothing has been looked up.' };
  if (setting === 'webService') return { ...base, title: `Service web ${config.webService ? 'created in' : 'removed from'} shop`,
    changed: config.webService ? 'web.shop has a record again, and its ready set is tracked.' : 'web.shop has no record; no endpoints are used for web.',
    actor: `${you} In Kubernetes, anyone with API access who creates or deletes the Service object.`,
    reason: 'Records and endpoint sets are built from Service objects; no Service means no record.' };
  if (setting === 'publicDns') return { ...base, title: `Public record ${config.publicDns ? 'added' : 'removed'}`,
    changed: `Public DNS ${config.publicDns ? 'points' : 'no longer points'} ${config.host} at ${EDGE_ADDRESS}.`,
    actor: `${you} In reality, the domain owner's DNS provider, outside the cluster.`,
    reason: 'Browsers resolve public names through public DNS, not cluster DNS.' };
  if (setting === 'controller') return { ...base, title: `Edge controller ${config.controller ? 'running' : 'stopped'}`,
    changed: `The controller for edge-proxy ${config.controller ? 'can program routes from Ingress objects' : 'programs nothing'}.`,
    actor: `${you} In reality, the cluster operator's installed controller, itself running as Pods.`,
    reason: 'An Ingress has no effect until a controller that implements its class is running.' };
  if (setting === 'ingress') return { ...base, title: `Ingress shop ${config.ingress ? 'applied' : 'removed'}`,
    changed: config.ingress ? 'The rule set contains shop.example.com / → Service web:80.' : 'The rule set is empty for shop.',
    actor: `${you} In reality, the app team's manifest, applied with kubectl or GitOps.`,
    reason: 'The controller builds its rule table from Ingress objects in the API.' };
  if (setting === 'host') return { ...base, title: `Requested host is ${config.host}`,
    changed: `Requests now carry Host: ${config.host}.`,
    actor: `${you} In reality, the client sets the Host header from the URL.`,
    reason: 'Rules match the Host header; other.example.com has no rule in this fixture.' };
  if (setting === 'tlsSecret') return { ...base, title: `Secret shop-tls ${config.tlsSecret ? 'present' : 'absent'}`,
    changed: `The controller ${config.tlsSecret ? 'can read' : 'cannot read'} tls.crt and tls.key for shop.example.com.`,
    actor: `${you} In reality, a kubernetes.io/tls Secret created by the operator or certificate tooling.`,
    reason: 'TLS terminates at the controller, using the Secret named in the Ingress tls block.' };
  const pod = setting;
  const ready = config.ready[pod];
  return { ...base, title: `${pod} ${ready ? 'Ready' : 'Not Ready'}`,
    changed: `Ready endpoints for web: ${webEndpoints(config).length} of ${PODS.length}.`,
    actor: `${you} In reality, the kubelet's readiness probe result, which the EndpointSlice controller reads.`,
    reason: 'A Pod receives Service traffic only while Ready; Running alone is not enough.',
    notYet: 'Ready does not show the app answers on port 8080. No request has run since this change.' };
}

export function focusFor(setting: Setting): ManifestKey[] {
  switch (setting) {
    case 'query': case 'webService': return ['svc-name', 'svc-namespace'];
    case 'publicDns': case 'host': return ['ing-host'];
    case 'controller': return ['ing-class'];
    case 'ingress': return ['ing-host', 'ing-backend'];
    case 'tlsSecret': return ['ing-tls'];
    default: return ['svc-selector'];
  }
}

export interface ManifestLine { text: string; key?: ManifestKey }
/** The YAML the figure renders. The explanation's YAML example must show the same lines. */
export const MANIFEST: ManifestLine[] = [
  { text: 'apiVersion: v1' },
  { text: 'kind: Service' },
  { text: 'metadata:' },
  { text: '  name: web', key: 'svc-name' },
  { text: '  namespace: shop', key: 'svc-namespace' },
  { text: 'spec:' },
  { text: '  type: ClusterIP' },
  { text: '  selector:', key: 'svc-selector' },
  { text: '    app: web', key: 'svc-selector' },
  { text: '  ports:', key: 'svc-ports' },
  { text: '    - name: http', key: 'svc-ports' },
  { text: '      port: 80', key: 'svc-ports' },
  { text: '      targetPort: 8080', key: 'svc-ports' },
  { text: '---' },
  { text: 'apiVersion: networking.k8s.io/v1' },
  { text: 'kind: Ingress' },
  { text: 'metadata:' },
  { text: '  name: shop' },
  { text: '  namespace: shop' },
  { text: 'spec:' },
  { text: '  ingressClassName: edge-proxy', key: 'ing-class' },
  { text: '  tls:', key: 'ing-tls' },
  { text: '    - hosts:', key: 'ing-tls' },
  { text: '        - shop.example.com', key: 'ing-tls' },
  { text: '      secretName: shop-tls', key: 'ing-tls' },
  { text: '  rules:' },
  { text: '    - host: shop.example.com', key: 'ing-host' },
  { text: '      http:' },
  { text: '        paths:' },
  { text: '          - path: /', key: 'ing-backend' },
  { text: '            pathType: Prefix', key: 'ing-backend' },
  { text: '            backend:', key: 'ing-backend' },
  { text: '              service:', key: 'ing-backend' },
  { text: '                name: web', key: 'ing-backend' },
  { text: '                port:', key: 'ing-backend' },
  { text: '                  number: 80', key: 'ing-backend' },
];

/** Fixture world positions (x right, y toward the viewer, z up). z is the height the request card hovers at over each station. */
export const STATION: Record<Station, [number, number, number]> = {
  outside: [-170, 108, 17],
  gate: [-131, 66, 38],
  drawer: [-140, -86, 32],
  web: [-16, -20, 34],
  billing: [-16, -96, 28],
  'web-7c9d4-k2xqp': [104, -30, 26],
  'web-7c9d4-w8mvn': [104, 40, 26],
};

/** Position of the card after `progress` stations along a path; progress is clamped to the path. */
export function positionAt(stations: Station[], progress: number): [number, number, number] {
  const last = stations.length - 1;
  const at = Math.min(Math.max(progress, 0), last);
  const i = Math.floor(at);
  const j = Math.min(i + 1, last);
  const t = at - i;
  const from = STATION[stations[i] ?? 'drawer'];
  const to = STATION[stations[j] ?? 'drawer'];
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
}

/** Summary of the current cluster state, independent of the last run. */
export function stateSummary(config: Config): string {
  const ready = webEndpoints(config).length;
  return `Ready endpoints for web: ${ready} of ${PODS.length} · Ingress shop: ${config.ingress ? 'applied' : 'absent'} · controller: ${config.controller ? 'running' : 'not running'}`;
}
