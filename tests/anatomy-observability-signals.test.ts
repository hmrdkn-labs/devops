import { describe, expect, it } from 'vitest';
import * as geometry from '../src/components/anatomy/observability-signals/geometry';
import * as model from '../src/components/anatomy/observability-signals/model';
import {
  advance, check, CLAIM, CLAIMS, countsAt, dialAngle, endpointsAt, expiredAt, initialState, judge, LAST_TICK, lastTransition,
  manifestOf, pick, podSnapshot, PODS, retainedEvents, SIGNALS, verdictOf, type ClaimId, type Signal,
} from '../src/components/anatomy/observability-signals/model';

const TICKS = [0, 1, 2, 3, 4];
const verdictsOf = (claim: ClaimId, signal: Signal) => TICKS.map((tick) => judge(claim, signal, tick).verdict);

describe('figure imports resolve to real exports', () => {
  // Every name Figure.tsx takes from ./model and ./geometry. A missing export leaves the page unhydrated in the browser.
  const modelNames = [
    'advance', 'check', 'CLAIM', 'CLAIMS', 'CLOCK', 'countsAt', 'dialAngle', 'endpointsAt', 'eventRetained', 'EVENTS',
    'initialState', 'INSTRUMENT_PLACE', 'LAST_TICK', 'logsUpTo', 'manifestOf', 'P99_C', 'PODS', 'pick', 'podSnapshot',
    'POD_NAME', 'retainedEvents', 'SIGNAL_LABEL', 'SIGNALS', 'SUBJECT', 'tracesUpTo', 'verdictOf', 'VERDICT_LABEL',
    'VERDICT_RULE', 'VERDICT_TONE', 'WRITER_OF',
  ];
  const geometryNames = [
    'BAYS', 'cabinetArt', 'cardsFace', 'CABINET_X', 'chassis', 'eventsTape', 'gateBar', 'gateFrame', 'GATE_TRAVEL',
    'lampArt', 'lampLabels', 'logLines', 'needleArt', 'podLabels', 'probesCaption', 'projection', 'requestsArt', 'service', 'shelf',
  ];
  it.each(modelNames)('exports model.%s', (name) => {
    expect((model as Record<string, unknown>)[name]).toBeDefined();
  });
  it.each(geometryNames)('exports geometry.%s', (name) => {
    expect((geometry as Record<string, unknown>)[name]).toBeDefined();
  });
});

describe('observability fixture retention and readiness boundaries', () => {
  it('keeps an Event on the tape only while it is younger than the retention window', () => {
    expect(retainedEvents(0).map((event) => event.reason)).toEqual(['Started']);
    expect(retainedEvents(1).map((event) => event.reason)).toEqual(['Started']);
    expect(retainedEvents(2).map((event) => event.reason)).toEqual(['Unhealthy']);
    expect(retainedEvents(4)).toEqual([]);
    expect(expiredAt(1)).toEqual([]);
    expect(expiredAt(2).map((event) => event.reason)).toEqual(['Started']);
    expect(expiredAt(4).map((event) => event.reason)).toEqual(['Unhealthy']);
  });

  it('keeps only the last Ready transition and derives endpoint counts from it', () => {
    expect(TICKS.map((tick) => lastTransition('c', tick))).toEqual([0, 0, 2, 3, 3]);
    expect(TICKS.map((tick) => endpointsAt(tick))).toEqual([3, 3, 2, 3, 3]);
    for (const tick of TICKS) expect(endpointsAt(tick)).toBeLessThanOrEqual(PODS.length);
  });

  it('never restarts the subject container, so no snapshot ever counts a restart', () => {
    for (const tick of TICKS) for (const pod of PODS) expect(podSnapshot(pod, tick).restarts).toBe(0);
  });

  it('keeps logs and sampled traces monotone: retained history never shrinks', () => {
    const logs = TICKS.map((tick) => countsAt(tick).logs);
    const traces = TICKS.map((tick) => countsAt(tick).traces);
    expect(logs.every((value, index) => index === 0 || value >= logs[index - 1]!)).toBe(true);
    expect(traces.every((value, index) => index === 0 || value >= traces[index - 1]!)).toBe(true);
  });

  it.each([
    [null, -135], [0, -135], [750, 0], [1500, 135], [5000, 135],
  ])('clamps the dial needle for p99 %s to angle %i', (p99, angle) => {
    expect(dialAngle(p99)).toBeCloseTo(angle, 6);
  });
});

describe('verdict boundaries', () => {
  it.each(CLAIMS.flatMap((claim) => SIGNALS.map((signal) => [claim, signal] as const)))(
    'does not prove or contradict %s with %s before the claim moment',
    (claim, signal) => {
      for (const tick of TICKS.filter((value) => value < CLAIM[claim].at)) {
        expect(['cannot', 'off']).toContain(judge(claim, signal, tick).verdict);
      }
    },
  );

  it('treats a signal that does not record the property as off-question at every moment', () => {
    for (const [claim, signal] of [['slow', 'events'], ['slow', 'probes'], ['dbCall', 'events'], ['dbCall', 'probes'], ['traffic', 'logs'], ['liveness', 'traces']] as const) {
      expect(verdictsOf(claim, signal).every((verdict) => verdict === 'off')).toBe(true);
    }
  });

  it('never lets Events prove a claim alone; they are best-effort and expire', () => {
    for (const claim of CLAIMS) expect(verdictsOf(claim, 'events')).not.toContain('proves');
  });

  it('never proves a restart: the fixture never restarts the subject container', () => {
    for (const signal of SIGNALS) expect(verdictsOf('liveness', signal)).not.toContain('proves');
  });

  it('proves the Service stopped traffic only at the moment Ready turned False', () => {
    expect(verdictsOf('traffic', 'probes')).toEqual(['cannot', 'cannot', 'proves', 'cannot', 'cannot']);
  });

  it('keeps the zero-request window provable from metrics, because metrics keep every window', () => {
    expect(verdictsOf('traffic', 'metrics')).toEqual(['cannot', 'cannot', 'proves', 'proves', 'proves']);
  });

  it('keeps the healthy claim provable from probes only while no transition followed it', () => {
    expect(verdictsOf('healthyBefore', 'probes')).toEqual(['proves', 'proves', 'cannot', 'cannot', 'cannot']);
  });

  it('judges the slow claim from logs, metrics and traces once the moment has happened', () => {
    expect(verdictsOf('slow', 'logs')).toEqual(['cannot', 'proves', 'proves', 'proves', 'proves']);
    expect(verdictsOf('slow', 'metrics')).toEqual(['cannot', 'proves', 'proves', 'proves', 'proves']);
    expect(verdictsOf('slow', 'traces')).toEqual(['cannot', 'proves', 'proves', 'proves', 'proves']);
  });

  it('judges the database claim as proved by traces and logs, never by metrics', () => {
    expect(verdictsOf('dbCall', 'traces')).toEqual(['cannot', 'proves', 'proves', 'proves', 'proves']);
    expect(verdictsOf('dbCall', 'logs')).toEqual(['cannot', 'proves', 'proves', 'proves', 'proves']);
    expect(verdictsOf('dbCall', 'metrics')).not.toContain('proves');
  });

  it('contradicts the liveness restart from logs, metrics and probes once the moment has happened', () => {
    expect(verdictsOf('liveness', 'logs')).toEqual(['cannot', 'cannot', 'contradicts', 'contradicts', 'contradicts']);
    expect(verdictsOf('liveness', 'metrics')).toEqual(['cannot', 'cannot', 'contradicts', 'contradicts', 'contradicts']);
    expect(verdictsOf('liveness', 'probes')).toEqual(['cannot', 'cannot', 'contradicts', 'contradicts', 'contradicts']);
  });

});

describe('interaction transitions', () => {
  it('shows no verdict until Check is pressed, then re-reads it at the current moment', () => {
    let state = advance(advance(initialState()));
    state = pick(state, 'traffic', 'probes');
    expect(verdictOf(state, 'traffic')).toBeUndefined();
    state = check(state, 'traffic');
    expect(verdictOf(state, 'traffic')?.verdict).toBe('proves');
    state = advance(state);
    expect(verdictOf(state, 'traffic')?.verdict).toBe('cannot');
  });

  it('marks the instrument read by the last check, clears the mark when the apparatus advances, and keeps verdicts live', () => {
    let state = pick(initialState(), 'slow', 'traces');
    expect(state.lastRead).toBeUndefined();
    state = check(state, 'slow');
    expect(state.lastRead).toBe('traces');
    state = advance(state);
    expect(state.lastRead).toBeUndefined();
    expect(verdictOf(state, 'slow')?.verdict).toBe('proves');
    state = check(state, 'slow');
    expect(state.lastRead).toBe('traces');
    state = pick(state, 'liveness', 'logs');
    expect(state.lastRead).toBe('traces');
    state = check(state, 'liveness');
    expect(state.lastRead).toBe('logs');
  });

  it('does not check a claim until a signal has been picked', () => {
    const state = initialState();
    expect(check(state, 'slow')).toBe(state);
  });

  it('records a pick without recording a check or a read', () => {
    const state = pick(initialState(), 'slow', 'logs');
    expect(state.picks.slow).toBe('logs');
    expect(state.checks).toEqual({});
    expect(state.lastRead).toBeUndefined();
  });

  it('advances through the five fixture moments and stops at the last one', () => {
    let state = initialState();
    for (let step = 0; step < LAST_TICK; step++) state = advance(state);
    expect(state.tick).toBe(LAST_TICK);
    expect(advance(state)).toBe(state);
  });

  it('highlights only the Pod spec lines the last step depended on', () => {
    const highlighted = manifestOf(['readinessTimeout']).filter((line) => line.highlight).map((line) => line.text.trim().split(':')[0]);
    expect(highlighted).toEqual(['timeoutSeconds']);
    expect(manifestOf([]).some((line) => line.highlight)).toBe(false);
  });

  it('reads the readiness fields at 11:00, when the probe failed', () => {
    const reads = advance(advance(initialState())).change.reads;
    expect(reads).toEqual(expect.arrayContaining(['readinessTimeout', 'readinessFailure']));
  });
});
