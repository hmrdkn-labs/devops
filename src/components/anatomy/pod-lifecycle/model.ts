/**
 * Pure, deterministic fixture model: one Pod with one container `app`, observed by a kubelet
 * that runs probes once per "probe period". One period = one tick. The probe thresholds and
 * periods are the documented defaults (periodSeconds 10, failureThreshold 3), except the
 * startup probe, which uses 6 so a slow start fits inside its window.
 */
export const PROBE_FAILURE_THRESHOLD = 3;
export const STARTUP_FAILURE_THRESHOLD = 6;
/** A slow-start app is not started during periods 1–3 and serves from period 4. */
export const SLOW_START_PERIODS = 3;
/** Fixture simplification: a probe kill is modelled as SIGKILL, exit status 137. */
export const PROBE_KILL_EXIT_CODE = 137;
export const NODE_NAME = 'node-1';

export type RestartPolicy = 'Always' | 'OnFailure' | 'Never';
export type AppBehaviour = 'serving' | 'slow-start' | 'stuck-start' | 'overloaded' | 'deadlocked' | 'crashes' | 'exits-ok';
export type Phase = 'Pending' | 'Running' | 'Succeeded' | 'Failed';
export type ContainerState = 'none' | 'Waiting' | 'Running' | 'Terminated';

export interface PodSpec {
  startupProbe: boolean;
  livenessProbe: boolean;
  readinessProbe: boolean;
  restartPolicy: RestartPolicy;
}

/** Spec is fixed for one Pod object; the application behaviour is an input to the same Pod. */
export interface Fixture {
  spec: PodSpec;
  app: AppBehaviour;
}

export interface ContainerStatus {
  state: ContainerState;
  reason: string;
  exitCode: number | null;
  restartCount: number;
}

export interface PodStatus {
  /** Fixture identity. A new uid means a new Pod object; restarts never change it. */
  uid: number;
  scheduled: boolean;
  phase: Phase;
  container: ContainerStatus;
  /** Probe periods since the current container run started. */
  runTicks: number;
  startupPassed: boolean;
  startupFailures: number;
  livenessFailures: number;
  readinessFailures: number;
  /** The Ready condition. No readiness gates here, so ContainersReady has the same value. */
  ready: boolean;
  /** Exits seen by this Pod. The first exit restarts at once; later ones wait (back-off, untimed). */
  exits: number;
}

export interface Report {
  title: string;
  changed: string;
  actor: string;
  reason: string;
  notYet: string;
  /** Manifest keys the interaction read or changed; the ManifestPanel highlights them. */
  touched: string[];
}

export interface Step {
  pod: PodStatus;
  fixture: Fixture;
  report: Report;
}

export const defaultFixture: Fixture = {
  spec: { startupProbe: true, livenessProbe: true, readinessProbe: true, restartPolicy: 'Always' },
  app: 'serving',
};

export const appLabels: Record<AppBehaviour, string> = {
  serving: 'Starts and serves',
  'slow-start': 'Slow start: serves after 3 periods',
  'stuck-start': 'Never finishes starting: startup probe fails',
  overloaded: 'Overloaded: readiness fails, liveness passes',
  deadlocked: 'Deadlocked: liveness and readiness fail',
  crashes: 'Crashes with exit code 1',
  'exits-ok': 'Exits cleanly with code 0',
};

export const phaseOrder: Phase[] = ['Pending', 'Running', 'Succeeded', 'Failed'];

export function newPod(uid: number): PodStatus {
  return {
    uid,
    scheduled: false,
    phase: 'Pending',
    container: { state: 'none', reason: '', exitCode: null, restartCount: 0 },
    runTicks: 0,
    startupPassed: false,
    startupFailures: 0,
    livenessFailures: 0,
    readinessFailures: 0,
    ready: false,
    exits: 0,
  };
}

export function isTerminal(phase: Phase): boolean {
  return phase === 'Succeeded' || phase === 'Failed';
}

/** Service endpoints follow the Ready condition of a Running Pod, not the Running phase. */
export function inEndpoints(pod: PodStatus): boolean {
  return pod.ready && pod.phase === 'Running';
}

export function conditions(pod: PodStatus) {
  return {
    PodScheduled: pod.scheduled,
    Initialized: pod.container.state !== 'none',
    ContainersReady: pod.ready,
    Ready: pod.ready,
  };
}

function summary(pod: PodStatus): string {
  const state = pod.container.state === 'Waiting' ? `Waiting (${pod.container.reason})` : pod.container.state === 'none' ? 'not created' : pod.container.state;
  return `Now: phase ${pod.phase}, container app ${state}, restartCount ${pod.container.restartCount}, Ready ${pod.ready ? 'True' : 'False'}.`;
}

function noop(pod: PodStatus, fixture: Fixture, report: Omit<Report, 'touched'> & { touched?: string[] }): Step {
  return { pod, fixture, report: { touched: [], ...report } };
}

export function bind(pod: PodStatus, fixture: Fixture): Step {
  if (pod.scheduled) {
    return noop(pod, fixture, {
      title: 'Already bound',
      changed: 'Nothing: spec.nodeName is already set.',
      actor: 'No component acted.',
      reason: 'A Pod is scheduled once in its lifetime.',
      notYet: 'Binding does not start containers.',
    });
  }
  const next: PodStatus = { ...pod, scheduled: true };
  return {
    pod: next,
    fixture,
    report: {
      title: `Pod p-${pod.uid} bound to ${NODE_NAME}`,
      changed: `PodScheduled: False → True. spec.nodeName = ${NODE_NAME}. Phase stays Pending; no container exists yet.`,
      actor: 'kube-scheduler: binds the Pod to a node.',
      reason: 'The Pod had no node. Scheduling picks a node once; feasibility filters are outside this fixture.',
      notYet: 'Nothing runs. Scheduled is not Initialized, not Running, and not Ready.',
      touched: ['nodeName', 'PodScheduled', 'phase'],
    },
  };
}

export function startContainers(pod: PodStatus, fixture: Fixture): Step {
  if (!pod.scheduled) {
    return noop(pod, fixture, {
      title: 'Bind first',
      changed: 'Nothing: the Pod has no node.',
      actor: 'No component acted.',
      reason: 'Only the kubelet on a bound node starts containers.',
      notYet: 'The Pod is still Pending.',
    });
  }
  if (pod.container.state !== 'none') {
    return noop(pod, fixture, {
      title: 'Containers already started',
      changed: 'Nothing: container app already exists.',
      actor: 'No component acted.',
      reason: 'Containers are started once per container run; restarts are separate.',
      notYet: 'Use Next probe period to observe the running container.',
    });
  }
  const { spec } = fixture;
  // Fixture reading: with no probes, readiness is Success at once. A startup probe holds Ready False.
  const ready = !spec.readinessProbe && !spec.startupProbe;
  const next: PodStatus = {
    ...pod,
    phase: 'Running',
    container: { state: 'Running', reason: '', exitCode: null, restartCount: 0 },
    runTicks: 0,
    ready,
  };
  const notYet = spec.readinessProbe
    ? 'Running is not Ready: Ready stays False until the readiness probe succeeds.'
    : spec.startupProbe
      ? 'Running is not Ready: Ready waits for the startup probe.'
      : 'No probe is configured, so Ready is True now. Running alone did not make it Ready; the absence of a probe did.';
  return {
    pod: next,
    fixture,
    report: {
      title: `Containers started on ${NODE_NAME}`,
      changed: 'Initialized: True (no init containers to wait for). Container app: Running, restartCount 0. Phase: Pending → Running.',
      actor: 'kubelet on node-1, through the container runtime.',
      reason: 'The Pod is bound to a node, so the kubelet creates and starts its containers.',
      notYet,
      touched: ['phase', 'state', 'Initialized', 'restartCount', 'Ready', ...(spec.readinessProbe ? ['readiness.failureThreshold'] : [])],
    },
  };
}

interface Head {
  rank: number;
  title: string;
  reason: string;
  notYet: string;
}

function restart(p: PodStatus, lines: string[], touched: Set<string>) {
  p.container = { state: 'Running', reason: '', exitCode: null, restartCount: p.container.restartCount + 1 };
  p.runTicks = 0;
  p.startupPassed = false;
  p.startupFailures = 0;
  p.livenessFailures = 0;
  p.readinessFailures = 0;
  p.ready = false;
  touched.add('restartCount');
  touched.add('state');
  lines.push(`container app restarted (restartCount ${p.container.restartCount})`);
}

function decide(p: PodStatus, code: number, policy: RestartPolicy, lines: string[], touched: Set<string>, heads: Head[]) {
  p.exits += 1;
  p.ready = false;
  touched.add('Ready');
  touched.add('restartPolicy');
  const restarts = policy === 'Always' || (policy === 'OnFailure' && code !== 0);
  if (!restarts) {
    p.container = { state: 'Terminated', reason: code === 0 ? 'Completed' : 'Error', exitCode: code, restartCount: p.container.restartCount };
    p.phase = code === 0 ? 'Succeeded' : 'Failed';
    touched.add('phase');
    touched.add('state');
    lines.push(`restartPolicy ${policy} does not restart exit ${code}; phase ${p.phase}`);
    heads.push({
      rank: 8,
      title: `Pod ${p.phase}`,
      reason: `Every container has ended and restartPolicy ${policy} does not restart it.`,
      notYet: 'The Pod is terminal: no probe runs and no restart happens. Replacement needs a new Pod object, usually from a controller.',
    });
    return;
  }
  if (p.exits === 1) {
    restart(p, lines, touched);
    heads.push({
      rank: 6,
      title: 'Container app restarted in place',
      reason: `restartPolicy ${policy} restarts the container at once; the Pod object is not replaced.`,
      notYet: 'Phase stays Running while the container restarts. Running is not Ready.',
    });
    return;
  }
  p.container = { state: 'Waiting', reason: 'CrashLoopBackOff', exitCode: code, restartCount: p.container.restartCount };
  touched.add('state');
  lines.push('restart waits in CrashLoopBackOff');
  heads.push({
    rank: 6,
    title: 'CrashLoopBackOff: restart waits',
    reason: 'Repeated exits enter back-off before the next start. Real delays grow; this fixture waits one period.',
    notYet: 'Phase is still Running. CrashLoopBackOff is a container Waiting reason, not a Pod phase.',
  });
}

function kill(p: PodStatus, probe: 'startup' | 'liveness', policy: RestartPolicy, lines: string[], touched: Set<string>, heads: Head[]) {
  p.container = { state: 'Terminated', reason: 'Error', exitCode: PROBE_KILL_EXIT_CODE, restartCount: p.container.restartCount };
  touched.add('state');
  lines.push(`${probe} probe reached its threshold; kubelet killed container app (exit ${PROBE_KILL_EXIT_CODE})`);
  heads.push({
    rank: 7,
    title: `${probe[0]!.toUpperCase()}${probe.slice(1)} probe killed the container`,
    reason: `The kubelet acts on the container when the ${probe} probe fails its threshold; restartPolicy decides what follows.`,
    notYet: 'Pod identity (uid) is unchanged: the container restarts inside the same Pod. This fixture\'s app fails the same way after every restart, so the same probe fails again and Ready stays False.',
  });
  decide(p, PROBE_KILL_EXIT_CODE, policy, lines, touched, heads);
}

/** One probe period, or one restart whose back-off has ended. */
export function tick(pod: PodStatus, fixture: Fixture): Step {
  if (isTerminal(pod.phase)) {
    return noop(pod, fixture, {
      title: `Pod is ${pod.phase}`,
      changed: 'Nothing: a terminal Pod is not probed or restarted.',
      actor: 'No component acted for this Pod object.',
      reason: `${pod.phase} is final for this Pod. The kubelet restarts containers only while the Pod is Running.`,
      notYet: 'A replacement needs a new Pod object, usually created by a controller from its template.',
      touched: ['phase'],
    });
  }
  if (!pod.scheduled || pod.container.state === 'none') {
    return noop(pod, fixture, {
      title: 'Nothing to probe yet',
      changed: 'Nothing: no container runs.',
      actor: 'No component acted.',
      reason: 'Probes run only against a running container on a bound node.',
      notYet: 'Bind and start containers first.',
    });
  }

  const { spec, app } = fixture;
  const p: PodStatus = { ...pod, container: { ...pod.container } };
  const lines: string[] = [];
  const touched = new Set<string>();
  const heads: Head[] = [];
  const endpointBefore = inEndpoints(pod);

  if (p.container.state === 'Waiting') {
    restart(p, lines, touched);
    heads.push({
      rank: 6,
      title: 'Back-off over: container restarted',
      reason: 'The kubelet starts a waiting container again after its back-off.',
      notYet: 'The new container must start again: startup gates liveness and readiness, and Ready stays False until readiness passes.',
    });
  } else if (app === 'crashes' || app === 'exits-ok') {
    const code = app === 'crashes' ? 1 : 0;
    lines.push(`app exited with code ${code}`);
    touched.add('state');
    decide(p, code, spec.restartPolicy, lines, touched, heads);
  } else {
    p.runTicks += 1;
    const started = app !== 'stuck-start' && (app !== 'slow-start' || p.runTicks > SLOW_START_PERIODS);
    const alive = started && app !== 'deadlocked';
    const serving = alive && app !== 'overloaded';
    let killed = false;

    if (spec.startupProbe && !p.startupPassed) {
      touched.add('startup');
      if (started) {
        p.startupPassed = true;
        p.startupFailures = 0;
        touched.add('startup.failureThreshold');
        lines.push('startup probe passed');
        heads.push({
          rank: 3,
          title: p.container.restartCount > 0 ? 'Startup probe passed on the restarted container' : 'Startup probe passed',
          reason: 'The startup probe gates liveness and readiness: they run only after it succeeds.',
          notYet: p.container.restartCount > 0
            ? 'Liveness and readiness start again on this container run. Ready stays False until the readiness probe passes.'
            : 'Liveness and readiness have just begun. Ready needs the readiness probe to pass.',
        });
      } else {
        p.startupFailures += 1;
        touched.add('startup.failureThreshold');
        if (p.startupFailures >= STARTUP_FAILURE_THRESHOLD) {
          killed = true;
          kill(p, 'startup', spec.restartPolicy, lines, touched, heads);
        } else {
          lines.push(`startup probe failed (${p.startupFailures} of ${STARTUP_FAILURE_THRESHOLD})`);
          heads.push({
            rank: 2,
            title: 'Startup failure counted; app still starting',
            reason: `Liveness and readiness are not run yet. The kubelet kills the container only at ${STARTUP_FAILURE_THRESHOLD} failures.`,
            notYet: `Not killed: ${p.startupFailures} of ${STARTUP_FAILURE_THRESHOLD} failures. Ready stays False.`,
          });
        }
      }
    }

    const gated = spec.startupProbe && !p.startupPassed;
    if (!killed && !gated) {
      if (spec.livenessProbe) {
        touched.add('liveness');
        touched.add('liveness.failureThreshold');
        if (alive) {
          if (p.livenessFailures > 0) lines.push('liveness probe passed; failure count reset');
          p.livenessFailures = 0;
        } else {
          p.livenessFailures += 1;
          if (p.livenessFailures >= PROBE_FAILURE_THRESHOLD) {
            killed = true;
            kill(p, 'liveness', spec.restartPolicy, lines, touched, heads);
          } else {
            lines.push(`liveness failed (${p.livenessFailures} of ${PROBE_FAILURE_THRESHOLD})`);
            heads.push({
              rank: 2,
              title: 'Liveness failure counted',
              reason: `Liveness restarts the container only after ${PROBE_FAILURE_THRESHOLD} consecutive failures.`,
              notYet: `Not restarted yet: ${p.livenessFailures} of ${PROBE_FAILURE_THRESHOLD} consecutive failures.`,
            });
          }
        }
      }
    }

    if (!killed && !gated) {
      if (spec.readinessProbe) {
        touched.add('readiness');
        touched.add('readiness.failureThreshold');
        if (serving) {
          p.readinessFailures = 0;
          if (!p.ready) {
            lines.push('readiness passed: Ready True');
            heads.push({
              rank: 4,
              title: 'Readiness passed: Pod is Ready',
              reason: 'Ready is a separate condition from phase. Only a successful readiness probe sets it.',
              notYet: 'Phase was already Running before this. Ready is the condition that Services use.',
            });
          }
          p.ready = true;
        } else {
          p.readinessFailures += 1;
          if (p.readinessFailures >= PROBE_FAILURE_THRESHOLD) {
            if (p.ready) {
              lines.push(`readiness failed ${PROBE_FAILURE_THRESHOLD} of ${PROBE_FAILURE_THRESHOLD}: Ready False`);
              heads.push({
                rank: 5,
                title: 'Pod removed from Service endpoints; not restarted',
                reason: 'A failed readiness probe changes only Ready. The EndpointSlice controller removes the Pod from endpoints.',
                notYet: 'The container keeps running. A readiness failure never restarts a container, so restartCount did not change.',
              });
            } else {
              lines.push(`readiness still failing (${PROBE_FAILURE_THRESHOLD} of ${PROBE_FAILURE_THRESHOLD}); Ready stays False`);
              heads.push({
                rank: 2,
                title: 'Readiness still failing; Pod stays out of endpoints',
                reason: 'Ready is already False, so this failure changes no endpoint. The kubelet keeps probing.',
                notYet: 'No restart: readiness failures never restart a container.',
              });
            }
            p.ready = false;
          } else {
            lines.push(`readiness failed (${p.readinessFailures} of ${PROBE_FAILURE_THRESHOLD})`);
            heads.push({
              rank: 2,
              title: 'Readiness failure counted',
              reason: `The Pod leaves endpoints only after ${PROBE_FAILURE_THRESHOLD} consecutive readiness failures.`,
              notYet: `${p.ready ? 'Still Ready' : 'Still not Ready'}: ${p.readinessFailures} of ${PROBE_FAILURE_THRESHOLD} failures counted.`,
            });
          }
        }
      } else if (!p.ready) {
        p.ready = true;
        touched.add('Ready');
        lines.push('no readiness probe: Ready True');
        heads.push({
          rank: 4,
          title: 'No readiness probe: Pod is Ready',
          reason: 'Without a readiness probe the kubelet treats readiness as Success once the container is running.',
          notYet: 'This is not evidence that the app serves requests; it means no probe was configured.',
        });
      }
    }
  }

  if (inEndpoints(p) !== endpointBefore) touched.add('endpoint');
  if (p.ready !== pod.ready) touched.add('Ready');
  const head = heads.length
    ? heads.reduce((best, next) => (next.rank >= best.rank ? next : best))
    : {
        rank: 1,
        title: 'Probe period passed',
        reason: 'Every configured probe succeeded, or no probe is configured for this state.',
        notYet: 'A failing check only counts until its threshold; nothing changes before then.',
      };
  const actor = endpointBefore !== inEndpoints(p)
    ? 'kubelet (probes, restartPolicy) · EndpointSlice controller (endpoint update)'
    : 'kubelet (probes, restartPolicy)';
  const changed = lines.length ? `${lines.join('; ')}. ${summary(p)}` : `No state change. ${summary(p)}`;
  return {
    pod: p,
    fixture,
    report: { title: head.title, changed, actor, reason: head.reason, notYet: head.notYet, touched: [...touched] },
  };
}

export function changeApp(pod: PodStatus, fixture: Fixture, app: AppBehaviour): Step {
  const next: Fixture = { ...fixture, app };
  return {
    pod,
    fixture: next,
    report: {
      title: `Application behaviour: ${appLabels[app]}`,
      changed: `The application now behaves as "${appLabels[app]}". Pod p-${pod.uid} and its container are unchanged.`,
      actor: 'The application itself (a fixture input you control).',
      reason: 'The kubelet learns health only from probe results and exit codes, at the next probe period or exit.',
      notYet: 'No Ready, restartCount, endpoint, or phase change has happened yet.',
      touched: ['app'],
    },
  };
}

/** Probes and restartPolicy cannot change on a running Pod, so a changed spec means a new Pod object. */
export function replacePod(previous: PodStatus, fixture: Fixture, spec: PodSpec, uid: number, reason: 'spec' | 'reset'): Step {
  const next: Fixture = { spec, app: fixture.app };
  const pod = newPod(uid);
  const title = reason === 'reset' ? `New Pod p-${uid} with the default fixture` : `Pod p-${uid} replaces p-${previous.uid}`;
  return {
    pod,
    fixture: next,
    report: {
      title,
      changed: `Pod p-${previous.uid} is deleted and p-${uid} is created from the new spec. Phase Pending, Ready False, restartCount 0, no node.`,
      actor: reason === 'reset' ? 'You, creating a new Pod object.' : 'You: delete the Pod and apply a new one, because the API rejects probe and restartPolicy edits on an existing Pod.',
      reason: 'Pod updates may not change probes or restartPolicy in place. Only images, tolerations, deadlines, grace period, and scheduling gates may change.',
      notYet: 'The new Pod is not bound or started, so no probe has run and it is not in endpoints.',
      touched: ['uid', 'phase', 'restartPolicy', 'startup.failureThreshold', 'liveness.failureThreshold', 'readiness.failureThreshold'],
    },
  };
}

/** The Pod object as YAML, built from state. Each line carries the key the report can touch. */
export interface ManifestLine {
  text: string;
  key?: string;
}

export function manifestOf(fixture: Fixture, pod: PodStatus): ManifestLine[] {
  const { spec } = fixture;
  const lines: ManifestLine[] = [
    { text: 'apiVersion: v1' },
    { text: 'kind: Pod' },
    { text: 'metadata:' },
    { text: `  name: orders-api` },
    { text: `  uid: p-${pod.uid} # fixture id; real UIDs are UUIDs`, key: 'uid' },
    { text: 'spec:' },
  ];
  if (pod.scheduled) lines.push({ text: `  nodeName: ${NODE_NAME}`, key: 'nodeName' });
  else lines.push({ text: '  # nodeName is empty until the scheduler binds the Pod', key: 'nodeName' });
  lines.push({ text: `  restartPolicy: ${spec.restartPolicy}`, key: 'restartPolicy' });
  lines.push({ text: '  containers:' }, { text: '  - name: app' }, { text: '    image: registry.example.com/orders-api:1.4.2' });
  const probe = (name: 'startupProbe' | 'livenessProbe' | 'readinessProbe', path: string, threshold: number, key: string) => {
    lines.push(
      { text: `    ${name}:` },
      { text: `      httpGet: {path: ${path}, port: 8080}` },
      { text: '      periodSeconds: 10' },
      { text: `      failureThreshold: ${threshold}`, key: `${key}.failureThreshold` },
    );
  };
  if (spec.startupProbe) probe('startupProbe', '/startup', STARTUP_FAILURE_THRESHOLD, 'startup');
  if (spec.livenessProbe) probe('livenessProbe', '/livez', PROBE_FAILURE_THRESHOLD, 'liveness');
  if (spec.readinessProbe) probe('readinessProbe', '/readyz', PROBE_FAILURE_THRESHOLD, 'readiness');
  const c = pod.container;
  const cond = conditions(pod);
  const status = (value: boolean) => (value ? '"True"' : '"False"');
  lines.push(
    { text: 'status:' },
    { text: `  phase: ${pod.phase}`, key: 'phase' },
    { text: '  conditions:' },
    { text: `  - {type: PodScheduled, status: ${status(cond.PodScheduled)}}`, key: 'PodScheduled' },
    { text: `  - {type: Initialized, status: ${status(cond.Initialized)}}`, key: 'Initialized' },
    { text: `  - {type: ContainersReady, status: ${status(cond.ContainersReady)}}`, key: 'ContainersReady' },
    { text: `  - {type: Ready, status: ${status(cond.Ready)}}`, key: 'Ready' },
  );
  if (c.state === 'none') {
    lines.push({ text: '  containerStatuses: []', key: 'state' });
  } else {
    lines.push({ text: '  containerStatuses:' }, { text: '  - name: app' }, { text: `    restartCount: ${c.restartCount}`, key: 'restartCount' });
    if (c.state === 'Running') lines.push({ text: '    state: {running: {}}', key: 'state' });
    if (c.state === 'Waiting') lines.push({ text: `    state: {waiting: {reason: ${c.reason}}}`, key: 'state' });
    if (c.state === 'Terminated') lines.push({ text: `    state: {terminated: {reason: ${c.reason}, exitCode: ${c.exitCode}}}`, key: 'state' });
  }
  lines.push({
    text: `  # EndpointSlice: ${inEndpoints(pod) ? 'this Pod is in' : 'this Pod is not in'} Service endpoints (follows Ready)`,
    key: 'endpoint',
  });
  return lines;
}
