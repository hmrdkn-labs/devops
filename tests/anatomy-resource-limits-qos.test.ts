import { describe, expect, it } from 'vitest';
import {
  admit, fit, initialConfig, limitRange, memPodsOf, profiles, qosOf, quotaHard, relieve, rankForEviction, residentRequests,
  restartedMemory, runLoad, submit, type Config, type Profile, type Spec,
} from '../src/components/anatomy/resource-limits-qos/model';

const cfg = (overrides: Partial<Config> = {}): Config => ({ ...initialConfig, ...overrides });
const profileIds = Object.keys(profiles) as Profile[];

describe('QoS class is derived from the effective spec', () => {
  it('classifies the author spec with no admission policy on', () => {
    expect(submit(cfg({ profile: 'guaranteed' })).qos).toBe('Guaranteed');
    expect(submit(cfg({ profile: 'burstable' })).qos).toBe('Burstable');
    expect(submit(cfg({ profile: 'requests-only' })).qos).toBe('Burstable');
    expect(submit(cfg({ profile: 'besteffort' })).qos).toBe('BestEffort');
  });

  it('copies a limit into a missing request, so a limits-only Pod is Guaranteed', () => {
    const result = submit(cfg({ profile: 'limits-only' }));
    expect(result.admission.effective.requests).toEqual({ cpu: 500, memory: 512 });
    expect(result.qos).toBe('Guaranteed');
    expect(result.admission.provenance).toContainEqual({ field: 'requests.cpu', origin: 'API default' });
  });

  it('requires both CPU and memory to be equal for Guaranteed', () => {
    expect(qosOf({ requests: { cpu: 500, memory: 512 }, limits: { cpu: 500, memory: 1024 } })).toBe('Burstable');
    expect(qosOf({ requests: { cpu: 500 }, limits: { cpu: 500 } })).toBe('Burstable');
  });

  it('lets a LimitRange default change the class of a BestEffort Pod', () => {
    expect(submit(cfg({ profile: 'besteffort' })).qos).toBe('BestEffort');
    expect(submit(cfg({ profile: 'besteffort', limitRange: true })).qos).toBe('Burstable');
  });
});

describe('admission: LimitRange and ResourceQuota', () => {
  it('fills only the keys the author left empty, and the API default wins over the LimitRange default', () => {
    const limitsOnly = admit(cfg({ profile: 'limits-only', limitRange: true }));
    expect(limitsOnly.effective.requests).toEqual({ cpu: 500, memory: 512 });
    const requestsOnly = admit(cfg({ profile: 'requests-only', limitRange: true }));
    expect(requestsOnly.effective.limits).toEqual(limitRange.defaultLimit);
    expect(requestsOnly.effective.requests).toEqual({ cpu: 200, memory: 256 });
  });

  it('rejects a limit above the LimitRange max, and accepts it exactly at the max', () => {
    expect(admit(cfg({ profile: 'oversized', limitRange: true })).limitRange.pass).toBe(false);
    expect(admit(cfg({ profile: 'oversized' })).limitRange.pass).toBe(true);
    const atMax: Spec = { requests: { cpu: 200, memory: 256 }, limits: { cpu: limitRange.max.cpu, memory: limitRange.max.memory } };
    expect(admit(cfg({ limitRange: true }), atMax).limitRange.pass).toBe(true);
  });

  it('counts requests against the quota, and admits exactly up to the hard limit', () => {
    expect(admit(cfg({ profile: 'burstable', quota: true })).quota.pass).toBe(true);
    const onePastCpu: Spec = { requests: { cpu: 201, memory: 256 }, limits: { cpu: 500, memory: 512 } };
    expect(admit(cfg({ quota: true }), onePastCpu).quota.pass).toBe(false);
    const onePastMemory: Spec = { requests: { cpu: 200, memory: 257 }, limits: { cpu: 500, memory: 512 } };
    expect(admit(cfg({ quota: true }), onePastMemory).quota.pass).toBe(false);
  });

  it('rejects a Guaranteed Pod whose requests overflow the namespace even though node-a has room', () => {
    const result = submit(cfg({ profile: 'guaranteed', quota: true }));
    expect(result.phase).toBe('rejected');
    expect(result.fit).toBeNull();
    expect(fit(profiles.guaranteed.spec, 'within').pass).toBe(true);
  });

  it('refuses a BestEffort Pod under a quota unless a LimitRange supplies requests', () => {
    expect(admit(cfg({ profile: 'besteffort', quota: true })).quota.pass).toBe(false);
    expect(submit(cfg({ profile: 'besteffort', quota: true, limitRange: true })).phase).toBe('running');
  });

  it('computes the LimitRange and quota verdicts independently, and stops at the LimitRange gate first', () => {
    const both = submit(cfg({ profile: 'large', limitRange: true, quota: true }));
    expect(both.admission.limitRange.pass).toBe(false);
    expect(both.admission.quota.pass).toBe(false);
    expect(both.stop).toBe('limitrange');
    expect(submit(cfg({ profile: 'large', quota: true })).stop).toBe('quota');
  });
});

describe('scheduler fit uses requests, never limits', () => {
  it('leaves an unschedulable request pending and names the short resource', () => {
    const result = submit(cfg({ profile: 'large' }));
    expect(result.phase).toBe('pending');
    expect(result.fit).toMatchObject({ pass: false, short: 'cpu' });
    expect(result.stop).toBe('fit');
  });

  it('places a Pod whose limits exceed node-a allocatable when its requests fit', () => {
    expect(submit(cfg({ profile: 'oversized' })).phase).toBe('running');
  });

  it('computes node-a free space from the residents requests only', () => {
    expect(residentRequests('within')).toEqual({ cpu: 800, memory: 768 });
    expect(fit(profiles.burstable.spec, 'within').free).toEqual({ cpu: 1200, memory: 1280 });
  });

  it('never runs a rejected Pod through the scheduler', () => {
    for (const profile of profileIds) {
      for (const limitRangeOn of [false, true]) {
        for (const quotaOn of [false, true]) {
          const result = submit(cfg({ profile, limitRange: limitRangeOn, quota: quotaOn }));
          if (result.phase === 'rejected') expect(result.fit).toBeNull();
          else expect(result.fit).not.toBeNull();
          expect(result.phase === 'running').toBe(result.fit?.pass === true);
        }
      }
    }
  });

  it('keeps every effective request at or below its limit whenever both are set', () => {
    for (const profile of profileIds) {
      for (const limitRangeOn of [false, true]) {
        const { effective } = admit(cfg({ profile, limitRange: limitRangeOn }));
        for (const r of ['cpu', 'memory'] as const) {
          const request = effective.requests[r];
          const limit = effective.limits[r];
          if (request !== undefined && limit !== undefined) expect(request).toBeLessThanOrEqual(limit);
        }
      }
    }
  });
});

describe('runtime: CPU is throttled, memory is OOM-killed at the limit', () => {
  it('throttles CPU above its limit without a restart, and does not throttle at or below it', () => {
    const cpuOnly: Spec = { requests: {}, limits: { cpu: 500 } };
    expect(runLoad(cpuOnly, 'spike', 0)).toMatchObject({ throttled: true, cpuUse: 500, oomKilled: false, restarts: 0 });
    expect(runLoad(cpuOnly, 'busy', 0)).toMatchObject({ throttled: false, cpuUse: 400, restarts: 0 });
    expect(runLoad({ requests: {}, limits: { cpu: 900 } }, 'spike', 0).throttled).toBe(false);
  });

  it('kills memory only strictly above the limit, and restarts in the same Pod', () => {
    expect(runLoad({ requests: {}, limits: { memory: 900 } }, 'spike', 0).oomKilled).toBe(false);
    expect(runLoad({ requests: {}, limits: { memory: 899 } }, 'spike', 0)).toMatchObject({ oomKilled: true, memoryUse: restartedMemory });
    expect(runLoad(profiles.guaranteed.spec, 'spike', 2).restarts).toBe(3);
  });

  it('does not enforce a limit that was never set', () => {
    expect(runLoad(profiles['requests-only'].spec, 'spike', 0)).toMatchObject({ throttled: false, oomKilled: false, cpuUse: 900, memoryUse: 900 });
  });

  it('keeps a Guaranteed Pod within its memory request under every load', () => {
    for (const load of ['idle', 'busy', 'spike'] as const) {
      expect(runLoad(profiles.guaranteed.spec, load, 0).memoryUse).toBeLessThanOrEqual(512);
    }
  });
});

describe('node-pressure eviction ranks by usage above request, not by QoS class', () => {
  it('ranks a BestEffort Pod with any memory use first when no Burstable Pod exceeds its request', () => {
    const pods = memPodsOf(cfg({ searchUse: 'within' }), 1, submit(cfg()), null, new Set());
    expect(rankForEviction(pods)[0]?.name).toBe('batch-report-x');
  });

  it('ranks a Burstable Pod above a BestEffort Pod when it exceeds its request by more', () => {
    const pods = memPodsOf(cfg({ searchUse: 'above' }), 1, submit(cfg()), null, new Set());
    const ranked = rankForEviction(pods);
    expect(ranked.map((row) => row.name)).toEqual(['search-5d6b', 'batch-report-x', 'checkout-7f9c']);
    expect(ranked[0]).toMatchObject({ qos: 'Burstable', excess: 344 });
  });

  it('never marks a Guaranteed Pod as exceeding its request', () => {
    for (const load of ['idle', 'busy', 'spike'] as const) {
      const runtime = runLoad(profiles.guaranteed.spec, load, 0);
      const ranked = rankForEviction([{ name: 'g', qos: 'Guaranteed', priority: 0, request: 512, use: runtime.memoryUse }]);
      expect(ranked[0]?.exceeds).toBe(false);
    }
  });

  it('reports no pressure at or above the threshold, and evicts nothing', () => {
    const relief = relieve(memPodsOf(cfg({ searchUse: 'within' }), 1, submit(cfg()), null, new Set()));
    expect(relief).toMatchObject({ pressure: false, evicted: [] });
    expect(relief.available).toBeGreaterThanOrEqual(768);
  });

  it('evicts the first-ranked Pod, then stops as soon as memory.available is back at the threshold', () => {
    const relief = relieve(memPodsOf(cfg({ searchUse: 'above' }), 1, submit(cfg()), null, new Set()));
    expect(relief.pressure).toBe(true);
    expect(relief.evicted).toEqual(['search-5d6b']);
    expect(relief.availableAfter).toBeGreaterThanOrEqual(768);
  });

  it('evicts a bursting bare Pod ahead of residents when it alone is over its request', () => {
    const config = cfg({ profile: 'requests-only', load: 'spike', searchUse: 'within' });
    const submission = submit(config);
    const runtime = runLoad(submission.admission.effective, 'spike', 0);
    const relief = relieve(memPodsOf(config, 1, submission, runtime, new Set()));
    expect(relief.evicted).toEqual(['api-canary-1']);
  });

  it('keeps already-evicted Pods out of the next relief pass', () => {
    const config = cfg({ searchUse: 'above' });
    const relief = relieve(memPodsOf(config, 1, submit(config), null, new Set(['search-5d6b'])));
    expect(relief.pressure).toBe(false);
  });
});

describe('an evicted resident stops holding node-a space and quota', () => {
  it('frees its request for both the scheduler fit and the namespace quota', () => {
    const gone = new Set(['checkout-7f9c']);
    expect(residentRequests('within', gone)).toEqual({ cpu: 300, memory: 256 });
    expect(fit(profiles.guaranteed.spec, 'within', gone).free).toEqual({ cpu: 1700, memory: 1792 });
    expect(submit(cfg({ profile: 'guaranteed', quota: true }), gone).phase).toBe('running');
    expect(submit(cfg({ profile: 'guaranteed', quota: true })).phase).toBe('rejected');
  });
});

describe('a full admitted Pod', () => {
  it('admitted BestEffort under both policies lands exactly at the quota and runs as Burstable', () => {
    const result = submit(cfg({ profile: 'besteffort', limitRange: true, quota: true }));
    expect(result.admission.quota.used).toEqual({ cpu: quotaHard.cpu, memory: quotaHard.memory });
    expect(result).toMatchObject({ phase: 'running', qos: 'Burstable' });
  });
});
