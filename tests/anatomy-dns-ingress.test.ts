import { describe, expect, it } from 'vitest';
import {
  MANIFEST, PODS, candidates, focusFor, initialConfig, resolve, runExternal, runInCluster, runResolve,
  webEndpoints, type Config, type ManifestKey, type Query, type Setting,
} from '../src/components/anatomy/dns-ingress/model';
import { CAPTIONS, HEIGHT, NUMBERS, P, WIDTH } from '../src/components/anatomy/dns-ingress/geometry';
import { iso } from '../src/lib/anatomy/vendor/iso-kit';

const cfg = (patch: Partial<Config> = {}): Config => ({ ...initialConfig, ready: { ...initialConfig.ready }, ...patch });
const manifestKeys: readonly ManifestKey[] = MANIFEST.flatMap((line) => (line.key ? [line.key] : []));

describe('search path expansion', () => {
  it('tries search domains before the bare name when the name has fewer than ndots dots', () => {
    expect(candidates('web')).toEqual([
      'web.shop.svc.cluster.local', 'web.svc.cluster.local', 'web.cluster.local', 'web.',
    ]);
  });

  it('switches order exactly at ndots, so a name with five dots is tried as written first', () => {
    expect(candidates('a.b.c.d.e' as Query)[0]).toBe('a.b.c.d.e.shop.svc.cluster.local');
    expect(candidates('a.b.c.d.e.f' as Query)).toEqual([
      'a.b.c.d.e.f.',
      'a.b.c.d.e.f.shop.svc.cluster.local',
      'a.b.c.d.e.f.svc.cluster.local',
      'a.b.c.d.e.f.cluster.local',
    ]);
  });

  it('leaves an absolute name unexpanded', () => {
    expect(candidates('ledger.billing.svc.cluster.local.')).toEqual(['ledger.billing.svc.cluster.local.']);
  });
});

describe('cluster DNS answers', () => {
  it('stops at the first answer for a same-namespace short name', () => {
    expect(resolve(cfg({ query: 'web' })).tried).toHaveLength(1);
  });

  it('reaches another namespace only through the namespace in the name', () => {
    const short = resolve(cfg({ query: 'ledger' }));
    expect(short.answer).toBeNull();
    expect(short.tried).toHaveLength(4);
    const qualified = resolve(cfg({ query: 'ledger.billing' }));
    expect(qualified.answer).toBe('ledger');
    expect(qualified.tried).toHaveLength(2);
  });

  it('has no record for a Service that does not exist', () => {
    expect(resolve(cfg({ webService: false })).answer).toBeNull();
  });

  it('moves the request token only to the Service the name answered', () => {
    expect(runResolve(cfg({ query: 'web' })).stations).toEqual(['drawer', 'web']);
    expect(runResolve(cfg({ query: 'ledger' })).stations).toEqual(['drawer']);
  });
});

describe('Service endpoints', () => {
  it('lists only Ready Pods, and none while the Service is absent', () => {
    expect(webEndpoints(cfg({ ready: { 'web-7c9d4-k2xqp': false, 'web-7c9d4-w8mvn': true } }))).toEqual(['web-7c9d4-w8mvn']);
    expect(webEndpoints(cfg({ webService: false }))).toEqual([]);
  });
});

describe('in-cluster request', () => {
  it('keeps a name answer separate from reachability when no Pod is Ready', () => {
    const run = runInCluster(cfg({ ready: { 'web-7c9d4-k2xqp': false, 'web-7c9d4-w8mvn': false } }));
    expect(run.resolution?.answer).toBe('web');
    expect(run.pod).toBeNull();
    expect(run.stations.at(-1)).toBe('web');
  });

  it('forwards only to a Ready endpoint', () => {
    const run = runInCluster(cfg({ ready: { 'web-7c9d4-k2xqp': false, 'web-7c9d4-w8mvn': true } }));
    expect(run.pod).toBe('web-7c9d4-w8mvn');
    expect(run.stations.at(-1)).toBe('web-7c9d4-w8mvn');
  });

  it('does not connect when the name has no answer', () => {
    const run = runInCluster(cfg({ query: 'ledger' }));
    expect(run.stations).toEqual(['drawer']);
    expect(run.pod).toBeNull();
  });

  it('stops at the billing Service and draws no billing Pods', () => {
    const run = runInCluster(cfg({ query: 'ledger.billing' }));
    expect(run.stations).toEqual(['drawer', 'billing']);
    expect(run.pod).toBeNull();
  });
});

describe('external request', () => {
  it('reaches a Ready Pod only when every check passes', () => {
    const run = runExternal(initialConfig);
    expect(run.checks.every((check) => check.state === 'pass')).toBe(true);
    expect(run.pod).toBe('web-7c9d4-k2xqp');
    expect(run.stations.at(-1)).toBe(run.pod);
  });

  it('stops at the first failing check and never reaches a Pod past it', () => {
    for (const publicDns of [true, false]) for (const controller of [true, false]) for (const ingress of [true, false])
      for (const tlsSecret of [true, false]) for (const webService of [true, false]) for (const k2xqp of [true, false]) {
        const run = runExternal(cfg({
          publicDns, controller, ingress, tlsSecret, webService,
          ready: { 'web-7c9d4-k2xqp': k2xqp, 'web-7c9d4-w8mvn': false },
        }));
        const states = run.checks.map((check) => check.state);
        const failAt = states.indexOf('fail');
        if (failAt === -1) {
          expect(run.pod).toBe('web-7c9d4-k2xqp');
          continue;
        }
        expect(states.slice(0, failAt).every((state) => state === 'pass')).toBe(true);
        expect(states.slice(failAt + 1).every((state) => state === 'not-run')).toBe(true);
        expect(run.pod).toBeNull();
        expect(run.stations.some((station) => station.startsWith('web-7c9d4'))).toBe(false);
      }
  });

  it('checks public DNS before the controller, so a missing record is the reported stop', () => {
    const run = runExternal(cfg({ publicDns: false, controller: false }));
    expect(run.checks.find((check) => check.state === 'fail')?.id).toBe('public-dns');
    expect(run.stations).toEqual(['outside']);
  });

  it('stops at the gate for a TLS failure, before any Service is reached', () => {
    const run = runExternal(cfg({ tlsSecret: false }));
    expect(run.stations).toEqual(['outside', 'gate']);
    expect(run.pod).toBeNull();
  });

  it('matches the requested host exactly, so another host finds no rule', () => {
    const run = runExternal(cfg({ host: 'other.example.com' }));
    expect(run.checks.find((check) => check.state === 'fail')?.id).toBe('rule');
    expect(run.stations).toEqual(['outside', 'gate']);
  });
});

describe('manifest highlights', () => {
  const settings: Setting[] = ['query', 'webService', 'publicDns', 'controller', 'ingress', 'host', 'tlsSecret', ...PODS];

  it('highlights only fields that exist in the rendered YAML', () => {
    for (const setting of settings) for (const key of focusFor(setting)) expect(manifestKeys.includes(key)).toBe(true);
    for (const key of runExternal(initialConfig).focus) expect(manifestKeys.includes(key)).toBe(true);
  });
});

describe('check order and outcome', () => {
  it('checks TLS before the Host rule, so a missing secret is the reported stop', () => {
    const run = runExternal(cfg({ tlsSecret: false, host: 'other.example.com' }));
    expect(run.checks.find((check) => check.state === 'fail')?.id).toBe('tls');
  });

  it('delivers only when every external check passes', () => {
    expect(runExternal(initialConfig).outcome).toBe('delivered');
    expect(runExternal(cfg({ controller: false })).outcome).toBe('stopped');
  });

  it('keeps a name answer separate from a delivered connection', () => {
    expect(runInCluster(cfg({ ready: { 'web-7c9d4-k2xqp': false, 'web-7c9d4-w8mvn': false } })).outcome).toBe('stopped');
    expect(runInCluster(cfg({ query: 'ledger.billing' })).outcome).toBe('answered');
    expect(runInCluster(initialConfig).outcome).toBe('delivered');
  });
});

describe('identity labels', () => {
  const MARGIN = 8;
  /** Projected box of a caption: width from a 0.6em mono advance, height from a 0.75em ascent and 0.25em descent. */
  const boxOf = (item: { text: string; at: [number, number, number]; anchor: 'middle' | 'start' | 'end'; size: number }) => {
    const [x, y] = iso(item.at, P);
    const width = item.text.length * item.size * 0.6;
    const left = item.anchor === 'middle' ? x - width / 2 : item.anchor === 'start' ? x : x - width;
    return { left, right: left + width, top: y - item.size * 0.75, bottom: y + item.size * 0.25 };
  };
  const drawn = [...CAPTIONS, ...NUMBERS];
  it('keeps every caption and notch number inside the frame with a margin', () => {
    const outside = drawn.filter((item) => {
      const box = boxOf(item);
      return box.left < MARGIN || box.right > WIDTH - MARGIN || box.top < MARGIN || box.bottom > HEIGHT - MARGIN;
    });
    expect(outside.map((item) => ({ text: item.text, ...boxOf(item) }))).toEqual([]);
  });

  it('never lets two identity labels or notch numbers overlap', () => {
    const boxes = drawn.map(boxOf);
    boxes.forEach((a, i) => {
      for (const b of boxes.slice(i + 1)) {
        const apart = a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
        expect(apart).toBe(true);
      }
    });
  });
});
