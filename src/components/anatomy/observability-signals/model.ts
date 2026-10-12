export type PodId = 'a' | 'b' | 'c';
export type Signal = 'events' | 'logs' | 'metrics' | 'traces' | 'probes';
export type ClaimId = 'slow' | 'dbCall' | 'traffic' | 'liveness' | 'healthyBefore';
export type Verdict = 'proves' | 'contradicts' | 'cannot' | 'off';
/** Pod spec fields the ManifestPanel highlights; each step or check says which it depended on. */
export type ManifestField = 'livenessProbe' | 'readinessPath' | 'readinessTimeout' | 'readinessFailure';

export interface Change {
  title: string;
  changed: string;
  actor: string;
  reason: string;
  notYet: string;
  reads: ManifestField[];
}

export interface ObservabilityState {
  /** Index into CLOCK: the fixture moment the signals have recorded up to. */
  tick: number;
  /** Signal the learner chose for each claim; no verdict shows until a check is pressed. */
  picks: Partial<Record<ClaimId, Signal>>;
  /** Signal a claim was last checked with; its verdict is re-read live at the current tick. */
  checks: Partial<Record<ClaimId, Signal>>;
  /** Instrument read by the most recent check; the bench and ledger mark it until the next check or reset. */
  lastRead?: Signal;
  change: Change;
}

export interface Judgement {
  verdict: Verdict;
  evidence: string;
  limit: string;
}

/** Fixture moments are 30 minutes apart. Real probes run every few seconds; these steps summarise them. */
export const CLOCK = ['10:00', '10:30', '11:00', '11:30', '12:00'] as const;
export const LAST_TICK = CLOCK.length - 1;
/** Events older than two steps (about one hour) leave the tape, matching the default kube-apiserver --event-ttl of 1h. */
export const EVENT_RETENTION_STEPS = 2;
export const SUBJECT: PodId = 'c';
export const PODS: PodId[] = ['a', 'b', 'c'];
export const POD_NAME: Record<PodId, string> = { a: 'web-k2x9p', b: 'web-m8q4v', c: 'web-z5r1t' };
export const SIGNALS: Signal[] = ['events', 'logs', 'metrics', 'traces', 'probes'];
export const SIGNAL_LABEL: Record<Signal, string> = {
  events: 'Events', logs: 'Logs', metrics: 'Metrics', traces: 'Traces', probes: 'Probes',
};
/** Who wrote the record each signal keeps. Outside Kubernetes core: the app, its metrics backend and tracing backend. */
export const WRITER_OF: Record<Signal, string> = {
  events: 'The kubelet and controllers record Events; the API server keeps them for about an hour.',
  logs: 'The app writes stdout and stderr; the kubelet keeps the container log files on its node.',
  metrics: 'The app exposes metrics and a monitoring backend (Prometheus-style) scrapes them. The restart counter comes from Pod status.',
  traces: 'The instrumented app exports spans through the OpenTelemetry SDK to a collector and tracing backend.',
  probes: 'The kubelet runs the probes and sets Ready; the EndpointSlice controller acts on Ready.',
};
/** Where each instrument sits on the bench. */
export const INSTRUMENT_PLACE: Record<Signal, string> = {
  events: 'Printer tape (Events)',
  logs: 'Cassette (Logs)',
  metrics: 'Dial (metrics backend)',
  traces: 'Rack (sampled traces)',
  probes: 'Lamps R and L on each cabinet',
};
export const CLAIMS: ClaimId[] = ['slow', 'dbCall', 'traffic', 'liveness', 'healthyBefore'];
export const CLAIM: Record<ClaimId, { text: string; short: string; at: number }> = {
  slow: { text: `${POD_NAME.c} answered slowly at 10:30.`, short: 'Slow at 10:30', at: 1 },
  dbCall: { text: 'The slow part of those requests was a database query.', short: 'DB query at 10:30', at: 1 },
  traffic: { text: `The Service stopped sending traffic to ${POD_NAME.c} at 11:00.`, short: 'Traffic stopped at 11:00', at: 2 },
  liveness: { text: `The kubelet restarted ${POD_NAME.c}'s container because liveness failed.`, short: 'Liveness restart', at: 2 },
  healthyBefore: { text: `${POD_NAME.c} was healthy at 10:00, before the database failover.`, short: 'Healthy at 10:00', at: 0 },
};

/* Fixture record. One Service, three Pods, one failing Pod (c). Identities are readable stand-ins. */

interface EventRecord { tick: number; reason: 'Started' | 'Unhealthy'; pod: PodId; message: string }
/** Kubelet Events. Reasons match kubelet's Started and Unhealthy (readiness probe failure) reasons. */
export const EVENTS: EventRecord[] = [
  { tick: 0, reason: 'Started', pod: 'c', message: 'Started container app' },
  { tick: 2, reason: 'Unhealthy', pod: 'c', message: 'Readiness probe failed' },
];

interface LogRecord { tick: number; text: string; ms?: number; dependency?: 'db' }
/** One container instance's stdout, retained because the container never restarted. */
export const LOGS: LogRecord[] = [
  { tick: 0, text: 'listening on :8080' },
  { tick: 0, text: 'GET /checkout 200 in 38 ms', ms: 38 },
  { tick: 1, text: 'WARN orders.select took 1210 ms', ms: 1210, dependency: 'db' },
  { tick: 2, text: 'WARN /ready database ping timed out after 1 s' },
  { tick: 3, text: 'INFO database ping ok' },
];

interface TraceRecord { tick: number; totalMs: number; dbMs: number }
/** Sampled traces that touched the subject Pod. Unsampled requests leave no trace. */
export const TRACES: TraceRecord[] = [
  { tick: 0, totalMs: 38, dbMs: 6 },
  { tick: 1, totalMs: 1240, dbMs: 1210 },
  { tick: 3, totalMs: 44, dbMs: 9 },
];

export const READY: Record<PodId, boolean[]> = {
  a: [true, true, true, true, true],
  b: [true, true, true, true, true],
  c: [true, true, false, true, true],
};
export const LIVE = [true, true, true, true, true];
export const RPS: Record<PodId, number[]> = {
  a: [33, 34, 51, 34, 33],
  b: [33, 33, 51, 35, 33],
  c: [34, 33, 0, 31, 33],
};
/** Backend p99 per 30-minute window; null when the window had no requests, so no p99 exists. */
export const P99_C: Array<number | null> = [42, 1380, null, 58, 45];
export const P99_OTHERS = [41, 44, 47, 46, 43];
export const RESTARTS_C = [0, 0, 0, 0, 0];

/* Deterministic reading of the fixture. */

export const endpointsAt = (tick: number) => PODS.filter((pod) => READY[pod][tick] === true).length;

export interface PodSnapshot { pod: PodId; name: string; ready: boolean; live: boolean; rps: number; restarts: number; transition: number }
/** One Pod's Ready condition and its probe and traffic readings at a fixture moment. */
export function podSnapshot(pod: PodId, tick: number): PodSnapshot {
  return {
    pod, name: POD_NAME[pod], ready: READY[pod][tick] === true, live: LIVE[tick] === true,
    rps: RPS[pod][tick] ?? 0, restarts: pod === SUBJECT ? (RESTARTS_C[tick] ?? 0) : 0, transition: lastTransition(pod, tick),
  };
}

/** Tick of the last Ready change for a Pod; a Pod that became Ready at creation has transition 0. */
export function lastTransition(pod: PodId, tick: number): number {
  let at = 0;
  for (let step = 1; step <= tick; step++) if (READY[pod][step] !== READY[pod][step - 1]) at = step;
  return at;
}

/** An event is on the tape while it is younger than the retention window. */
export const eventRetained = (tick: number, record: EventRecord) =>
  record.tick <= tick && tick - record.tick < EVENT_RETENTION_STEPS;
export const retainedEvents = (tick: number) => EVENTS.filter((record) => eventRetained(tick, record));
/** Events that leave the tape at exactly this moment. */
export const expiredAt = (tick: number) => EVENTS.filter((record) => tick - record.tick === EVENT_RETENTION_STEPS);
export const logsUpTo = (tick: number) => LOGS.filter((record) => record.tick <= tick);
export const tracesUpTo = (tick: number) => TRACES.filter((record) => record.tick <= tick);

/** Dial needle angle in degrees from 12 o'clock: -135 at 0 ms or no data, +135 at 1500 ms or more. */
export function dialAngle(p99: number | null): number {
  if (p99 === null) return -135;
  const ratio = Math.min(Math.max(p99 / 1500, 0), 1);
  return -135 + 270 * ratio;
}

/* Verdicts. A claim is judged only from what each signal kept at the current moment. */

const proves = (evidence: string, limit: string): Judgement => ({ verdict: 'proves', evidence, limit });
const contradicts = (evidence: string, limit: string): Judgement => ({ verdict: 'contradicts', evidence, limit });
const cannot = (evidence: string, limit: string): Judgement => ({ verdict: 'cannot', evidence, limit });
const off = (evidence: string, limit: string): Judgement => ({ verdict: 'off', evidence, limit });

const WRONG_QUESTION: Partial<Record<ClaimId, Partial<Record<Signal, Judgement>>>> = {
  slow: {
    events: off('Events record lifecycle reasons (Started, Unhealthy), not request latency.', 'A slow request leaves no event.'),
    probes: off('A probe reports pass or fail for its own check; it does not time real requests.', 'A slow request that still passes its probe is invisible here.'),
  },
  dbCall: {
    events: off('Events record lifecycle reasons, not the dependency a request waited on.', 'No event names a database call.'),
    probes: off('A probe cannot tell which dependency a slow request waited on.', 'Probe results name no dependency.'),
  },
  traffic: {
    logs: off('The app logs its own handlers, not Service endpoint decisions.', 'The app cannot see endpoint changes.'),
  },
  liveness: {
    traces: off('Traces follow requests, not container lifecycle.', 'A restart is not a request.'),
  },
};

function notYet(claim: ClaimId, tick: number): Judgement {
  return cannot(`${CLOCK[CLAIM[claim].at]} has not happened yet; the fixture is at ${CLOCK[tick]}.`,
    'Evidence for a moment that has not happened cannot exist yet.');
}

/** Judge one claim with one signal at a fixture moment. */
export function judge(claim: ClaimId, signal: Signal, tick: number): Judgement {
  const wrong = WRONG_QUESTION[claim]?.[signal];
  if (wrong) return wrong;
  const at = CLAIM[claim].at;
  if (tick < at) return notYet(claim, tick);
  switch (claim) {
    case 'slow': return slowJudge(signal, at);
    case 'dbCall': return dbCallJudge(signal, at);
    case 'traffic': return trafficJudge(signal, tick, at);
    case 'liveness': return livenessJudge(signal, tick);
    case 'healthyBefore': return healthyJudge(signal, tick, at);
  }
}

function slowJudge(signal: Signal, at: number): Judgement {
  if (signal === 'logs') {
    const line = LOGS.find((record) => record.tick === at && (record.ms ?? 0) >= 1000);
    return line
      ? proves(`App log at ${CLOCK[at]}: "${line.text}", still retained.`, 'One logged request, not the whole window.')
      : cannot(`No retained log line at ${CLOCK[at]} is 1000 ms or longer.`, 'Logs exist only where the app wrote them.');
  }
  if (signal === 'metrics') {
    const p99 = P99_C[at] ?? null;
    return p99 !== null && p99 >= 1000
      ? proves(`Backend p99 ${p99} ms in the ${CLOCK[at]} window; the backend keeps every window.`,
        'p99 is an aggregate from app metrics and does not name the slow call. kubectl top reports only CPU and memory, so it cannot answer this.')
      : cannot(`No backend p99 at or above 1000 ms is recorded for ${CLOCK[at]}.`, 'Missing windows mean no measurement, not a fast one.');
  }
  if (signal === 'traces') {
    const trace = TRACES.find((record) => record.tick === at);
    return trace && trace.totalMs >= 1000
      ? proves(`Sampled trace at ${CLOCK[at]}: ${trace.totalMs} ms total.`, 'One sampled request, not a rate.')
      : cannot(`No sampled trace at ${CLOCK[at]} is slow.`, 'Sampling keeps only some requests.');
  }
  return cannot('Unreachable: events and probes are off-question for this claim.', '');
}

function dbCallJudge(signal: Signal, at: number): Judgement {
  if (signal === 'logs') {
    const line = LOGS.find((record) => record.tick === at && record.dependency === 'db' && (record.ms ?? 0) >= 1000);
    return line
      ? proves(`App log at ${CLOCK[at]}: "${line.text}".`, 'The app timed its own query; a trace is what places it inside the request.')
      : cannot(`No retained database log line at ${CLOCK[at]}.`, 'Only the app decides what it logs.');
  }
  if (signal === 'metrics') {
    return cannot('The metric is per Pod, not per dependency, so it cannot name the slow call.',
      'A per-dependency latency series would be needed.');
  }
  if (signal === 'traces') {
    const trace = TRACES.find((record) => record.tick === at && record.dbMs >= 1000);
    return trace
      ? proves(`db span ${trace.dbMs} ms inside a ${trace.totalMs} ms request at ${CLOCK[at]}.`, 'Only sampled requests have traces.')
      : cannot(`No sampled trace at ${CLOCK[at]} shows a slow database span.`, 'Sampling keeps only some requests.');
  }
  return cannot('Unreachable: events and probes are off-question for this claim.', '');
}

function trafficJudge(signal: Signal, tick: number, at: number): Judgement {
  if (signal === 'events') {
    const unhealthy = EVENTS.find((record) => record.tick === at && record.reason === 'Unhealthy');
    if (unhealthy && eventRetained(tick, unhealthy)) {
      return cannot(`The ${CLOCK[at]} Unhealthy event is on the tape: a readiness probe failed.`,
        'It shows the probe failed, not that the Service changed its endpoints.');
    }
    return cannot(`The ${CLOCK[at]} Unhealthy event has expired from the tape.`,
      'Events are best-effort and expire, so their absence proves nothing.');
  }
  if (signal === 'metrics') {
    return RPS[SUBJECT][at] === 0
      ? proves(`The backend's request counter shows ${POD_NAME.c} at 0 req/s in the ${CLOCK[at]} window while the other Pods took the traffic.`,
        'Shows the effect, not the cause. The probe result explains the cause.')
      : cannot(`${POD_NAME.c} still received ${RPS[SUBJECT][at]} req/s at ${CLOCK[at]}.`, 'A traffic rate cannot say why traffic moved.');
  }
  if (signal === 'traces') {
    return cannot('A Pod that receives no requests produces no traces, so a missing trace is not evidence.', 'Traces need traffic.');
  }
  return probeJudge(false, at, tick, SUBJECT);
}

function livenessJudge(signal: Signal, tick: number): Judgement {
  if (signal === 'events') {
    return cannot(`No Killing event for ${POD_NAME.c} is on the tape.`,
      'Events are best-effort and expire; an absence in that list is weak evidence.');
  }
  if (signal === 'logs') {
    return contradicts(`The retained log of ${POD_NAME.c}'s container instance starts at its 10:00 start and shows no second instance. This relies on the fixture keeping the whole instance log.`,
      'kubectl logs without --previous shows only the latest log file, so in a real cluster it cannot show earlier instances. It cannot say why a restart would have happened.');
  }
  if (signal === 'metrics') {
    return RESTARTS_C[tick] === 0
      ? contradicts(`The restart counter for ${POD_NAME.c}, exported from Pod status, stayed at 0 through ${CLOCK[tick]}.`,
        'A counter says a restart did not happen to this Pod; it cannot say why a restart would have happened.')
      : cannot(`The restart counter for ${POD_NAME.c} is ${RESTARTS_C[tick]} at ${CLOCK[tick]}.`, 'Counts alone do not name the probe.');
  }
  if (signal === 'traces') {
    return cannot('Traces follow requests, not container lifecycle.', 'Unreachable: traces are off-question for this claim.');
  }
  return LIVE[tick] && RESTARTS_C[tick] === 0
    ? contradicts('Liveness passes now and restartCount is 0; liveness restarts only after its failureThreshold.',
      'Current values only: the probe does not keep the 11:00 history.')
    : cannot('Liveness is failing or the container has restarted; the claim is not contradicted here.', '');
}

function healthyJudge(signal: Signal, tick: number, at: number): Judgement {
  if (signal === 'events') {
    return eventRetained(tick, EVENTS[0]!)
      ? cannot('The 10:00 Started event shows the container began, not that it answered requests.', 'A start is not a health history.')
      : cannot('The 10:00 Started event has expired from the tape.', 'Events are best-effort and expire.');
  }
  if (signal === 'logs') {
    return proves(`GET /checkout 200 in 38 ms at ${CLOCK[at]}; the instance's lines are still retained.`,
      'One answered request is evidence of health, not a health history.');
  }
  if (signal === 'metrics') {
    return proves(`Backend p99 ${P99_C[at]} ms in the ${CLOCK[at]} window; the backend keeps it.`, 'One window, not the whole morning.');
  }
  if (signal === 'traces') {
    const trace = TRACES.find((record) => record.tick === at);
    return trace
      ? proves(`Sampled trace at ${CLOCK[at]}: ${trace.totalMs} ms total, ${trace.dbMs} ms in the database.`, 'One sampled request.')
      : cannot(`No sampled trace at ${CLOCK[at]}.`, 'Sampling keeps only some requests.');
  }
  return probeJudge(true, at, tick, SUBJECT);
}

/** Probes keep only the current result and its last transition. A claim about an earlier moment holds only if no transition came after it. */
function probeJudge(expectReady: boolean, at: number, tick: number, pod: PodId): Judgement {
  const transition = lastTransition(pod, tick);
  const ready = READY[pod][tick] === true;
  if (transition > at) {
    return cannot(`Ready last changed at ${CLOCK[transition]}, after ${CLOCK[at]}; the earlier state is gone.`,
      'Probes keep only the current result and its last transition.');
  }
  const word = ready ? 'True' : 'False';
  return ready === expectReady
    ? proves(`Ready=${word} since ${CLOCK[transition]}, so it held at ${CLOCK[at]}.`, 'Probes keep only the current result and its last transition.')
    : contradicts(`Ready=${word} since ${CLOCK[transition]}, so it was not in the claimed state at ${CLOCK[at]}.`,
      'Probes keep only the current result and its last transition.');
}

/* Interactions. Each returns a new state with a truthful ChangeReport. */

const STEP: Change[] = [
  {
    title: '10:00 · Authored start', reads: [],
    changed: `Three Pods Ready. ${POD_NAME.c} serves 34 req/s at p99 42 ms, and a Started event is on the tape.`,
    actor: 'Authored start state; the kubelet and the Deployment have converged.',
    reason: 'This is the baseline every later signal is compared against.',
    notYet: 'No failover yet; no probe has failed; no event beyond Started exists.',
  },
  {
    title: '10:30 · Database failover slows the subject Pod', reads: ['readinessPath'],
    changed: `${POD_NAME.c} p99 rises to 1380 ms. A sampled trace shows a 1210 ms db span, and the log has a WARN line for orders.select. Ready is still True.`,
    actor: 'The database failover, which the app waits on. No Kubernetes object changed.',
    reason: 'Queries wait for the new primary. The /ready handler still answers within 1 s, so the kubelet records no failure.',
    notYet: 'No probe has failed, no event was recorded, and the Service still sends it 33 req/s.',
  },
  {
    title: '11:00 · Readiness probe fails; Service drops the subject Pod', reads: ['readinessPath', 'readinessTimeout', 'readinessFailure'],
    changed: `Ready=False on ${POD_NAME.c}. Service endpoints 3 → 2, and ${POD_NAME.c} receives 0 req/s. An Unhealthy event is recorded. The Started event from 10:00 left the tape (older than 1 h).`,
    actor: 'The kubelet runs the readiness probe and sets the Ready condition; the EndpointSlice controller removes the Pod address from the Service.',
    reason: 'GET /ready waited on the database ping past timeoutSeconds: 1, and failureThreshold: 3 failures in a row marked it not ready.',
    notYet: 'Not restarted: readiness failure never restarts a container, and liveness still passes. The database is not yet proven as the cause.',
  },
  {
    title: '11:30 · Subject Pod Ready again', reads: ['readinessPath'],
    changed: `Ready=True since 11:30. Service endpoints 2 → 3, and ${POD_NAME.c} is back to 31 req/s at p99 58 ms.`,
    actor: 'The kubelet sets Ready after a probe succeeds; the EndpointSlice controller re-adds the address.',
    reason: 'The /ready ping succeeded once the database recovered (log: database ping ok).',
    notYet: 'The 11:00 Unhealthy event is still on the tape. Nothing here explains why the failover happened.',
  },
  {
    title: '12:00 · Event tape drops the 11:00 entry', reads: [],
    changed: 'The Unhealthy event from 11:00 left the tape, now older than 1 h. Logs, metrics and sampled traces from 10:00 to 11:30 are still retained.',
    actor: 'The API server event TTL (kube-apiserver --event-ttl, default 1h).',
    reason: 'Events are best-effort records with limited retention. Nothing in the cluster changed for the subject Pod.',
    notYet: 'Events can no longer prove the 11:00 readiness failure. Metrics, logs and traces still show the timeline.',
  },
];

export function initialState(): ObservabilityState {
  return { tick: 0, picks: {}, checks: {}, change: STEP[0]! };
}

export function advance(state: ObservabilityState): ObservabilityState {
  if (state.tick >= LAST_TICK) return state;
  const tick = state.tick + 1;
  return { ...state, tick, change: STEP[tick]!, lastRead: undefined };
}

export function pick(state: ObservabilityState, claim: ClaimId, signal: Signal): ObservabilityState {
  return {
    ...state,
    picks: { ...state.picks, [claim]: signal },
    change: {
      title: `Evidence chosen for “${CLAIM[claim].short}”`,
      changed: `${SIGNAL_LABEL[signal]} selected for this claim. No verdict is shown until Check is pressed.`,
      actor: 'You, in the fixture UI.',
      reason: 'A verdict needs a signal that could have recorded the property the claim names.',
      notYet: 'Nothing has been checked. The cluster and the fixture are unchanged.',
      reads: [],
    },
  };
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  proves: 'Proves', contradicts: 'Contradicts', cannot: 'Cannot decide here', off: 'Wrong question for this signal',
};
export const VERDICT_RULE: Record<Verdict, string> = {
  proves: 'The record the signal kept matches the claim’s moment and property.',
  contradicts: 'The record the signal kept shows the opposite of the claim.',
  cannot: 'The record is missing, expired, sampled out, not yet written, or only a current value.',
  off: 'This signal does not record the property the claim names.',
};
export const VERDICT_TONE: Record<Verdict, 'pass' | 'fail' | 'wait' | 'info'> = {
  proves: 'pass', contradicts: 'fail', cannot: 'wait', off: 'info',
};

/** Who the verdict is about, in the ChangeReport: the learner chose a signal and the verdict reads what it kept. */
export const actorOf = (signal: Signal, tick: number) =>
  `You chose ${SIGNAL_LABEL[signal]} for this claim; the verdict reads what it kept as of ${CLOCK[tick]}.`;

function readsFor(claim: ClaimId, signal: Signal): ManifestField[] {
  if (signal !== 'probes') return [];
  if (claim === 'liveness') return ['livenessProbe'];
  if (claim === 'traffic') return ['readinessFailure', 'readinessTimeout'];
  if (claim === 'healthyBefore') return ['readinessPath'];
  return [];
}

export function check(state: ObservabilityState, claim: ClaimId): ObservabilityState {
  const signal = state.picks[claim];
  if (!signal) return state;
  const result = judge(claim, signal, state.tick);
  return {
    ...state,
    checks: { ...state.checks, [claim]: signal },
    lastRead: signal,
    change: {
      title: `${VERDICT_LABEL[result.verdict]}: “${CLAIM[claim].short}” via ${SIGNAL_LABEL[signal]}`,
      changed: `Nothing in the cluster changed. ${result.evidence}`,
      actor: actorOf(signal, state.tick),
      reason: VERDICT_RULE[result.verdict],
      notYet: result.limit,
      reads: readsFor(claim, signal),
    },
  };
}

/** Live verdict for a checked claim; undefined until the learner presses Check. */
export function verdictOf(state: ObservabilityState, claim: ClaimId): Judgement & { signal: Signal } | undefined {
  const signal = state.checks[claim];
  return signal ? { signal, ...judge(claim, signal, state.tick) } : undefined;
}

/* Pod spec as the figure reads it. Highlighted lines are what the last interaction depended on. */

interface ManifestRow { text: string; field?: ManifestField }
export const MANIFEST: ManifestRow[] = [
  { text: 'apiVersion: apps/v1' },
  { text: 'kind: Deployment' },
  { text: 'metadata:' },
  { text: '  name: web' },
  { text: 'spec:' },
  { text: '  replicas: 3' },
  { text: '  selector:' },
  { text: '    matchLabels:' },
  { text: '      app: web' },
  { text: '  template:' },
  { text: '    metadata:' },
  { text: '      labels:' },
  { text: '        app: web' },
  { text: '    spec:' },
  { text: '      containers:' },
  { text: '        - name: app' },
  { text: '          image: registry.example.com/app:v1' },
  { text: '          ports:' },
  { text: '            - containerPort: 8080' },
  { text: '          livenessProbe:', field: 'livenessProbe' },
  { text: '            httpGet:', field: 'livenessProbe' },
  { text: '              path: /livez           # process only; no database call', field: 'livenessProbe' },
  { text: '              port: 8080', field: 'livenessProbe' },
  { text: '            periodSeconds: 10', field: 'livenessProbe' },
  { text: '            failureThreshold: 3', field: 'livenessProbe' },
  { text: '          readinessProbe:' },
  { text: '            httpGet:' },
  { text: '              path: /ready           # pings the database', field: 'readinessPath' },
  { text: '              port: 8080' },
  { text: '            periodSeconds: 5' },
  { text: '            timeoutSeconds: 1        # a slower ping counts as a failure', field: 'readinessTimeout' },
  { text: '            failureThreshold: 3      # consecutive failures before Ready=False', field: 'readinessFailure' },
];

export function manifestOf(reads: ManifestField[]): Array<{ text: string; highlight: boolean }> {
  return MANIFEST.map((row) => ({ text: row.text, highlight: row.field !== undefined && reads.includes(row.field) }));
}

export const countsAt = (tick: number) => ({
  events: retainedEvents(tick).length,
  logs: logsUpTo(tick).length,
  traces: tracesUpTo(tick).length,
});
