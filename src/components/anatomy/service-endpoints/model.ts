import type { ManifestLine } from '../shared/ManifestPanel';

/** One fixture shared by the networking pages: namespace shop, Service web, Pods web-7c9d4-<suffix>. */
export const SERVICE = { namespace: 'shop', name: 'web', clusterIP: '10.96.40.12', port: 80, targetPort: 8080 } as const;
export const NODE_PORT = 30080;
export const SELECTORS = ['web', 'web-next'] as const;
export const EXPOSURES = ['ClusterIP', 'NodePort', 'LoadBalancer'] as const;
export type Selector = (typeof SELECTORS)[number];
export type Exposure = (typeof EXPOSURES)[number];
export type PodApp = 'web' | 'web-canary';

export interface PodState {
  name: string;
  /** Ready condition: set from the readiness probe, not from Running. */
  ready: boolean;
  /** The Pod's app label; the Service selects by equality on it. */
  app: PodApp;
}

export interface FixtureState {
  /** Three booths; index is the booth slot, and a replacement keeps the slot with a new name. */
  pods: PodState[];
  /** Service spec.selector app value. */
  selector: Selector;
  exposure: Exposure;
  /** Round-robin position among ready endpoints (fixture stand-in for kube-proxy's choice). */
  cursor: number;
  /** How many replacement Pods the ReplicaSet has created in this fixture. */
  created: number;
}

/**
 * What the EndpointSlice records for one Pod. 'ready' is an endpoint that receives traffic;
 * 'not-ready' is recorded with ready=false and receives none; 'outside' is not recorded at all.
 */
export type PodRole = 'ready' | 'not-ready' | 'outside';

export interface Evaluation {
  /** Per booth slot: the Pod's role in the EndpointSlice. */
  roles: PodRole[];
  /** Slots whose role is 'ready': the only endpoints kube-proxy forwards to. */
  listed: number[];
}

/** Which manifest lines the last interaction read or changed. */
export interface Marks {
  exposure?: boolean;
  selector?: boolean;
  route?: boolean;
  name?: boolean;
  label?: boolean;
  ready?: boolean;
}

const INITIAL_NAMES = ['web-7c9d4-k2x8p', 'web-7c9d4-m4l7q', 'web-7c9d4-r9t2z'] as const;
// Suffixes use the Pod-name alphabet (no vowels, no 0/1). Replacements never reuse a live name.
const REPLACEMENT_SUFFIXES = ['p7w4d', 'h5v8c', 'w3n6j', 'd6f2k', 'g8c4t', 'j2s9m', 'c7z3n', 't4k6h'] as const;

export function initialState(): FixtureState {
  return {
    pods: INITIAL_NAMES.map((name) => ({ name, ready: true, app: 'web' })),
    selector: 'web',
    exposure: 'ClusterIP',
    cursor: 0,
    created: 0,
  };
}

export function podSuffix(name: string): string {
  return name.slice(-5);
}

/** A Pod is recorded only when its label matches the selector; Ready then decides ready or not-ready. */
export function roleOf(pod: PodState, selector: Selector): PodRole {
  if (pod.app !== selector) return 'outside';
  return pod.ready ? 'ready' : 'not-ready';
}

export function evaluate(state: FixtureState): Evaluation {
  const roles = state.pods.map((pod) => roleOf(pod, state.selector));
  const listed = roles.flatMap((role, slot) => (role === 'ready' ? [slot] : []));
  return { roles, listed };
}

function withPod(state: FixtureState, slot: number, change: Partial<PodState>): FixtureState {
  return { ...state, pods: state.pods.map((pod, index) => (index === slot ? { ...pod, ...change } : pod)) };
}

export function setReady(state: FixtureState, slot: number, ready: boolean): FixtureState {
  return withPod(state, slot, { ready });
}

export function setApp(state: FixtureState, slot: number, app: PodApp): FixtureState {
  return withPod(state, slot, { app });
}

/** Deleting a Pod: the ReplicaSet creates a fresh Pod from its template (app=web, not Ready) in the same booth. */
export function replacePod(state: FixtureState, slot: number): FixtureState {
  const taken = new Set(state.pods.map((pod) => pod.name));
  let created = state.created;
  let name: string;
  do {
    name = `web-7c9d4-${REPLACEMENT_SUFFIXES[created % REPLACEMENT_SUFFIXES.length]!}`;
    created += 1;
  } while (taken.has(name));
  const replaced = withPod(state, slot, { name, ready: false, app: 'web' });
  return { ...replaced, created };
}

export function setSelector(state: FixtureState, selector: Selector): FixtureState {
  return { ...state, selector };
}

export function setExposure(state: FixtureState, exposure: Exposure): FixtureState {
  return { ...state, exposure };
}

/** One request through the Service: forwards to a ready endpoint, or nowhere when there is none. */
export function forward(state: FixtureState): { slot: number | null; state: FixtureState } {
  const { listed } = evaluate(state);
  if (listed.length === 0) return { slot: null, state };
  return { slot: listed[state.cursor % listed.length]!, state: { ...state, cursor: state.cursor + 1 } };
}

const line = (text: string, highlight?: boolean): ManifestLine => (highlight ? { text, highlight } : { text });

/** YAML rendered from fixture state: the Service you apply, plus the focused Pod's template and observed Ready status. */
export function manifestLines(state: FixtureState, focus: number, marks: Marks): ManifestLine[] {
  const pod = state.pods[focus]!;
  const lines: ManifestLine[] = [
    line('apiVersion: v1'),
    line('kind: Service'),
    line('metadata:'),
    line(`  name: ${SERVICE.name}`),
    line(`  namespace: ${SERVICE.namespace}`),
    line('spec:'),
    line(`  type: ${state.exposure}`, marks.exposure),
    line('  selector:', marks.selector),
    line(`    app: ${state.selector}`, marks.selector),
    line('  ports:'),
    line('  - name: http'),
    line('    protocol: TCP'),
    line(`    port: ${SERVICE.port}`, marks.route),
    line(`    targetPort: ${SERVICE.targetPort}`, marks.route),
  ];
  if (state.exposure !== 'ClusterIP') lines.push(line(`    nodePort: ${NODE_PORT}`, marks.exposure));
  lines.push(
    line('---'),
    line('apiVersion: v1'),
    line('kind: Pod'),
    line('metadata:'),
    line(`  name: ${pod.name}`, marks.name),
    line(`  namespace: ${SERVICE.namespace}`),
    line('  labels:'),
    line(`    app: ${pod.app}`, marks.label),
    line('spec:'),
    line('  containers:'),
    line('  - name: web'),
    line('    image: registry.example/web:1.4'),
    line('    ports:'),
    line('    - name: http'),
    line(`      containerPort: ${SERVICE.targetPort}`),
    line('    readinessProbe:'),
    line('      httpGet:'),
    line('        path: /healthz'),
    line(`        port: ${SERVICE.targetPort}`),
    line('      periodSeconds: 5'),
    line('# observed by the cluster, never applied:'),
    line('status:'),
    line('  conditions:'),
    line('  - type: Ready', marks.ready),
    line(`    status: "${pod.ready ? 'True' : 'False'}"`, marks.ready),
  );
  return lines;
}
