import { describe, expect, it } from 'vitest';
import {
  PROBE_KILL_EXIT_CODE, bind, changeApp, conditions, defaultFixture, inEndpoints, isTerminal, manifestOf, newPod,
  replacePod, startContainers, tick,
  type AppBehaviour, type Fixture, type PodSpec, type PodStatus, type RestartPolicy,
} from '../src/components/anatomy/pod-lifecycle/model';

const apps: AppBehaviour[] = ['serving', 'slow-start', 'stuck-start', 'overloaded', 'deadlocked', 'crashes', 'exits-ok'];
const policies: RestartPolicy[] = ['Always', 'OnFailure', 'Never'];

const fixtureWith = (app: AppBehaviour, spec: Partial<PodSpec> = {}): Fixture => ({
  spec: { ...defaultFixture.spec, ...spec },
  app,
});

/** Bind and start one Pod, then return it after the start and after each probe period. */
function run(fixture: Fixture, periods: number): PodStatus[] {
  let pod = startContainers(bind(newPod(1), fixture).pod, fixture).pod;
  const history: PodStatus[] = [pod];
  for (let i = 0; i < periods; i += 1) {
    pod = tick(pod, fixture).pod;
    history.push(pod);
  }
  return history;
}

describe('phase, conditions and endpoints', () => {
  it('is Running but not Ready until a readiness probe passes, and only Ready Pods are in endpoints', () => {
    const [started, firstPeriod] = run(fixtureWith('serving'), 1);
    expect(started).toMatchObject({ phase: 'Running', ready: false, container: { state: 'Running', restartCount: 0 } });
    expect(inEndpoints(started!)).toBe(false);
    expect(conditions(started!)).toMatchObject({ Initialized: true, ContainersReady: false, Ready: false });
    expect(firstPeriod).toMatchObject({ ready: true });
    expect(inEndpoints(firstPeriod!)).toBe(true);
  });

  it('starts no container before the Pod is bound', () => {
    const pod = newPod(1);
    expect(startContainers(pod, defaultFixture).pod).toMatchObject({ phase: 'Pending', scheduled: false, container: { state: 'none' } });
    expect(bind(pod, defaultFixture).pod).toMatchObject({ phase: 'Pending', scheduled: true, container: { state: 'none' } });
  });

  it('is Ready from the start only when no startup or readiness probe gates it', () => {
    expect(run(fixtureWith('serving', { startupProbe: false, readinessProbe: false }), 0)[0]!.ready).toBe(true);
    const gated = run(fixtureWith('serving', { startupProbe: true, readinessProbe: false }), 1);
    expect(gated[0]!.ready).toBe(false);
    expect(gated[1]!.ready).toBe(true);
  });

  it('keeps endpoints equal to Ready on a Running Pod, across every reachable state', () => {
    for (const app of apps) {
      for (const restartPolicy of policies) {
        for (const startupProbe of [true, false]) {
          for (const livenessProbe of [true, false]) {
            for (const readinessProbe of [true, false]) {
              const fixture = fixtureWith(app, { restartPolicy, startupProbe, livenessProbe, readinessProbe });
              for (const pod of run(fixture, 10)) {
                expect(inEndpoints(pod)).toBe(pod.ready && pod.phase === 'Running');
                if (pod.ready) expect(pod.container.state).toBe('Running');
              }
            }
          }
        }
      }
    }
  });

  it('treats Succeeded and Failed as absorbing: no probe runs and nothing restarts', () => {
    const succeeded = run(fixtureWith('exits-ok', { restartPolicy: 'OnFailure' }), 1)[1]!;
    expect(succeeded.phase).toBe('Succeeded');
    expect(tick(succeeded, fixtureWith('exits-ok', { restartPolicy: 'OnFailure' })).pod).toEqual(succeeded);
    const failed = run(fixtureWith('crashes', { restartPolicy: 'Never' }), 1)[1]!;
    expect(failed.phase).toBe('Failed');
    expect(tick(failed, fixtureWith('crashes', { restartPolicy: 'Never' })).pod).toEqual(failed);
  });
});

describe('restartPolicy and back-off', () => {
  it('Never: a crash ends the Pod in Failed with no restart', () => {
    const history = run(fixtureWith('crashes', { restartPolicy: 'Never' }), 4);
    expect(history.at(-1)).toMatchObject({ phase: 'Failed', container: { state: 'Terminated', exitCode: 1, restartCount: 0 } });
  });

  it('OnFailure: a clean exit ends the Pod in Succeeded, while a non-zero exit restarts the container', () => {
    expect(run(fixtureWith('exits-ok', { restartPolicy: 'OnFailure' }), 1)[1]).toMatchObject({ phase: 'Succeeded' });
    expect(run(fixtureWith('crashes', { restartPolicy: 'OnFailure' }), 1)[1]).toMatchObject({
      phase: 'Running', container: { state: 'Running', restartCount: 1 },
    });
  });

  it('Always: a clean exit is still restarted, so the Pod never reaches Succeeded', () => {
    const history = run(fixtureWith('exits-ok', { restartPolicy: 'Always' }), 3);
    expect(history.every((pod) => pod.phase === 'Running')).toBe(true);
    expect(history.at(-1)!.container.restartCount).toBeGreaterThan(0);
  });

  it('back-off: the first crash restarts at once, the second waits in CrashLoopBackOff, then restarts', () => {
    const history = run(fixtureWith('crashes', { restartPolicy: 'Always' }), 3);
    expect(history[1]).toMatchObject({ phase: 'Running', container: { state: 'Running', restartCount: 1 } });
    expect(history[2]).toMatchObject({ phase: 'Running', container: { state: 'Waiting', reason: 'CrashLoopBackOff', restartCount: 1 } });
    expect(history[3]).toMatchObject({ phase: 'Running', container: { state: 'Running', restartCount: 2 } });
  });
});

describe('probes: thresholds, gating and what each one restarts', () => {
  it('liveness restarts the container only at its threshold, and the Pod keeps its uid', () => {
    const history = run(fixtureWith('deadlocked', { startupProbe: false, readinessProbe: false }), 3);
    expect(history[1]).toMatchObject({ livenessFailures: 1, container: { restartCount: 0 } });
    expect(history[2]).toMatchObject({ livenessFailures: 2, container: { restartCount: 0 } });
    expect(history[3]).toMatchObject({ phase: 'Running', livenessFailures: 0, container: { state: 'Running', restartCount: 1 } });
    expect(history[3]!.uid).toBe(history[0]!.uid);
  });

  it('a deadlocked app is deadlocked again after each restart, and the repeated kill waits one period in CrashLoopBackOff', () => {
    const history = run(fixtureWith('deadlocked'), 9);
    expect(history.map((pod) => pod.container.restartCount)).toEqual([0, 0, 0, 1, 1, 1, 1, 2, 2, 2]);
    expect(history[6]).toMatchObject({ phase: 'Running', container: { state: 'Waiting', reason: 'CrashLoopBackOff', restartCount: 1 } });
    expect(history.at(-1)!.ready).toBe(false);
    expect(history.every((pod) => pod.uid === 1)).toBe(true);
  });

  it('a liveness kill under restartPolicy Never ends the Pod in Failed instead of restarting it', () => {
    const history = run(fixtureWith('deadlocked', { restartPolicy: 'Never', startupProbe: false, readinessProbe: false }), 3);
    expect(history[3]).toMatchObject({
      phase: 'Failed', container: { state: 'Terminated', exitCode: PROBE_KILL_EXIT_CODE, restartCount: 0 },
    });
  });

  it('readiness failure removes the Pod from endpoints at its threshold, with no restart', () => {
    const fixture = fixtureWith('serving');
    const bound = run(fixture, 1)[1]!;
    const overloaded = changeApp(bound, fixture, 'overloaded');
    const twoFailures = tick(tick(overloaded.pod, overloaded.fixture).pod, overloaded.fixture).pod;
    expect(twoFailures).toMatchObject({ ready: true, readinessFailures: 2 });
    expect(inEndpoints(twoFailures)).toBe(true);
    const threeFailures = tick(twoFailures, overloaded.fixture).pod;
    expect(threeFailures).toMatchObject({ ready: false, phase: 'Running', container: { restartCount: 0, state: 'Running' } });
    expect(inEndpoints(threeFailures)).toBe(false);
  });

  it('startup gates liveness and readiness: their counters stay at zero until startup passes', () => {
    const history = run(fixtureWith('slow-start', { startupProbe: true }), 4);
    expect(history[3]).toMatchObject({ startupFailures: 3, livenessFailures: 0, readinessFailures: 0, ready: false, startupPassed: false });
    expect(history[4]).toMatchObject({ startupPassed: true, ready: true, container: { restartCount: 0 } });
  });

  it('without a startup probe, a slow start is killed by liveness and never becomes Ready', () => {
    const history = run(fixtureWith('slow-start', { startupProbe: false }), 12);
    expect(history.some((pod) => pod.ready)).toBe(false);
    expect(history.at(-1)!.container.restartCount).toBeGreaterThanOrEqual(2);
    expect(history.every((pod) => pod.uid === 1)).toBe(true);
  });

  it('a startup probe lets the same slow start serve with no restarts', () => {
    const history = run(fixtureWith('slow-start', { startupProbe: true }), 10);
    expect(history.at(-1)).toMatchObject({ ready: true, container: { restartCount: 0 } });
  });

  it('startup kills a never-starting container only at its threshold', () => {
    const history = run(fixtureWith('stuck-start', { startupProbe: true }), 6);
    expect(history[5]).toMatchObject({ startupFailures: 5, container: { restartCount: 0 } });
    expect(history[6]).toMatchObject({ container: { state: 'Running', restartCount: 1 } });
    expect(history[6]!.uid).toBe(history[0]!.uid);
  });

  it('a startup probe changes which probe makes the first kill of a never-starting app', () => {
    expect(run(fixtureWith('stuck-start', { startupProbe: false }), 3)[3]!.container.restartCount).toBe(1);
    expect(run(fixtureWith('stuck-start', { startupProbe: true }), 3)[3]!.container.restartCount).toBe(0);
  });
});

describe('spec changes and identity', () => {
  it('a changed restartPolicy is a new Pod object with fresh counters', () => {
    const fixture = fixtureWith('serving');
    const old = run(fixture, 2).at(-1)!;
    const replaced = replacePod(old, fixture, { ...fixture.spec, restartPolicy: 'Never' }, old.uid + 1, 'spec');
    expect(replaced.pod).toMatchObject({
      uid: old.uid + 1, phase: 'Pending', scheduled: false, ready: false, container: { state: 'none', restartCount: 0 },
    });
    expect(replaced.fixture.spec.restartPolicy).toBe('Never');
  });

  it('an application behaviour change leaves the Pod object unchanged', () => {
    const fixture = fixtureWith('serving');
    const pod = run(fixture, 1).at(-1)!;
    const step = changeApp(pod, fixture, 'deadlocked');
    expect(step.pod).toEqual(pod);
    expect(step.fixture.app).toBe('deadlocked');
  });

  it('across every combination the uid never changes, restartCount never falls, and terminal Pods stay still', () => {
    for (const app of apps) {
      for (const restartPolicy of policies) {
        for (const startupProbe of [true, false]) {
          for (const livenessProbe of [true, false]) {
            for (const readinessProbe of [true, false]) {
              const fixture = fixtureWith(app, { restartPolicy, startupProbe, livenessProbe, readinessProbe });
              const history = run(fixture, 10);
              history.forEach((pod, i) => {
                expect(pod.uid).toBe(1);
                if (i > 0) {
                  expect(pod.container.restartCount).toBeGreaterThanOrEqual(history[i - 1]!.container.restartCount);
                  if (isTerminal(history[i - 1]!.phase)) expect(pod).toEqual(history[i - 1]);
                }
              });
            }
          }
        }
      }
    }
  });
});

describe('the report names what changed and what did not', () => {
  it('a sub-threshold liveness failure highlights its threshold and not restartCount', () => {
    const fixture = fixtureWith('deadlocked', { startupProbe: false, readinessProbe: false });
    const started = startContainers(bind(newPod(1), fixture).pod, fixture).pod;
    const step = tick(started, fixture);
    expect(step.report.touched).toContain('liveness.failureThreshold');
    expect(step.report.touched).not.toContain('restartCount');
  });

  it('the readiness step that removes the Pod from endpoints highlights Ready, not restartCount', () => {
    const fixture = fixtureWith('serving');
    const bound = run(fixture, 1)[1]!;
    let step = changeApp(bound, fixture, 'overloaded');
    step = tick(step.pod, step.fixture);
    step = tick(step.pod, step.fixture);
    step = tick(step.pod, step.fixture);
    expect(step.pod.ready).toBe(false);
    expect(step.report.touched).toContain('Ready');
    expect(step.report.touched).not.toContain('restartCount');
  });

  it('a readiness threshold reached while already not Ready is not reported as a quiet probe period', () => {
    const notReady = fixtureWith('overloaded', { startupProbe: false, livenessProbe: false });
    let pod = startContainers(bind(newPod(1), notReady).pod, notReady).pod;
    pod = tick(pod, notReady).pod;
    pod = tick(pod, notReady).pod;
    const atThreshold = tick(pod, notReady);
    expect(atThreshold.pod.ready).toBe(false);
    const quietFixture = fixtureWith('serving', { startupProbe: false, livenessProbe: false });
    const quiet = tick(run(quietFixture, 1)[1]!, quietFixture);
    expect(atThreshold.report.title).not.toBe(quiet.report.title);
  });
});

describe('manifest mirrors the spec the kubelet actually probes', () => {
  it('lists a probe threshold only for probes that are configured', () => {
    const pod = run(fixtureWith('serving'), 0)[0]!;
    const withoutLiveness = manifestOf(fixtureWith('serving', { livenessProbe: false }), pod);
    expect(withoutLiveness.some((line) => line.key === 'liveness.failureThreshold')).toBe(false);
    const withLiveness = manifestOf(fixtureWith('serving', { livenessProbe: true }), pod);
    expect(withLiveness.some((line) => line.key === 'liveness.failureThreshold')).toBe(true);
  });
});
