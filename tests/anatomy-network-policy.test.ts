import { describe, expect, it } from 'vitest';
import { parseAllDocuments } from 'yaml';
import { stationX } from '../src/components/anatomy/network-policy/geometry';
import {
  DB_PORT, POD_PORT, SERVICE_PORT, evaluate, flows, hatchesOf, initialConfig, manifestFor, policiesSelecting, postureOf, tagsForVerdict,
  type Config, type Probe, type WebPort,
} from '../src/components/anatomy/network-policy/model';
import { passingHatches, routeFor } from '../src/components/anatomy/network-policy/route';

const probes: Probe[] = ['client-web', 'web-db', 'client-db'];
const webPorts: WebPort[] = [POD_PORT, SERVICE_PORT];
const configs: Config[] = [];
for (const enforcing of [true, false]) for (const clientEgress of [true, false]) for (const dnsAllowed of [true, false])
  for (const webIngress of [true, false]) for (const webPort of webPorts) for (const dbIngress of [true, false]) {
    configs.push({ enforcing, clientEgress, dnsAllowed, webIngress, webPort, dbIngress });
  }

describe('NetworkPolicy isolation model', () => {
  it('lets every probe through while no policy is applied', () => {
    for (const probe of probes) expect(evaluate(initialConfig, probe)).toMatchObject({ delivered: true, stopped: null });
    expect(Object.values(postureOf(initialConfig)).every((posture) => posture === 'open')).toBe(true);
  });

  it('never blocks traffic when the plugin does not enforce NetworkPolicy', () => {
    for (const c of configs.filter((config) => !config.enforcing)) {
      for (const probe of probes) expect(evaluate(c, probe).delivered).toBe(true);
    }
  });

  it('reports the gate that would have stopped a stored policy, matching enforced evaluation', () => {
    for (const c of configs) {
      for (const probe of probes) {
        const v = evaluate(c, probe);
        expect(v.wouldStopAt).toBe(evaluate({ ...c, enforcing: true }, probe).stopped);
        if (c.enforcing) expect(v.wouldStopAt).toBe(v.stopped);
      }
    }
  });

  it('requires the source egress and destination ingress to both allow a connection', () => {
    const egressOnly: Config = { ...initialConfig, clientEgress: true };
    expect(evaluate({ ...egressOnly, dbIngress: true }, 'client-db')).toMatchObject({ delivered: false, stopped: 'client-egress' });
    const ingressOnly: Config = { ...initialConfig, dbIngress: true };
    expect(evaluate(ingressOnly, 'client-db')).toMatchObject({ delivered: false, stopped: 'db-ingress' });
    expect(evaluate(ingressOnly, 'web-db')).toMatchObject({ delivered: true, stopped: null });
  });

  it('matches the Service port against the Pod port the Pod receives, not the Service port', () => {
    const pod: Config = { ...initialConfig, webIngress: true, webPort: POD_PORT };
    const service: Config = { ...initialConfig, webIngress: true, webPort: SERVICE_PORT };
    expect(evaluate(pod, 'client-web')).toMatchObject({ delivered: true, servicePort: SERVICE_PORT, destPort: POD_PORT });
    expect(evaluate(service, 'client-web')).toMatchObject({ delivered: false, stopped: 'web-ingress' });
  });

  it('drops a Service-addressed probe at the DNS gate before the Service gate is evaluated', () => {
    const c: Config = { ...initialConfig, enforcing: true, clientEgress: true, dnsAllowed: false, webIngress: true };
    const v = evaluate(c, 'client-web');
    expect(v).toMatchObject({ delivered: false, stopped: 'client-egress-dns' });
    expect(v.checks['client-egress']).toBe('not-reached');
    expect(v.checks['web-ingress']).toBe('not-reached');
  });

  it('keeps gate order: gates before the stop passed or were not armed, gates after it were not reached', () => {
    for (const c of configs) {
      for (const probe of probes) {
        const v = evaluate(c, probe);
        const gates = flows[probe].gates;
        const stopAt = v.stopped ? gates.indexOf(v.stopped) : gates.length;
        gates.forEach((gate, index) => {
          const check = v.checks[gate];
          if (index < stopAt) expect(['pass', 'not-armed']).toContain(check);
          if (index === stopAt && v.stopped) expect(check).toBe('block');
          if (index > stopAt) expect(check).toBe('not-reached');
        });
        expect(v.delivered).toBe(v.stopped === null);
      }
    }
  });

  it('never lets a more permissive allow rule break a delivered probe', () => {
    for (const c of configs.filter((config) => !config.dnsAllowed)) {
      for (const probe of probes) {
        if (!evaluate(c, probe).delivered) continue;
        expect(evaluate({ ...c, dnsAllowed: true }, probe).delivered).toBe(true);
      }
    }
  });

  it('treats the web egress gate as never armed, because no fixture policy isolates web Pods for egress', () => {
    for (const c of configs) expect(evaluate(c, 'web-db').checks['web-egress']).toBe('not-armed');
  });
});

describe('isolation per Pod and direction', () => {
  it('keeps each direction open until a policy selects that Pod for it', () => {
    const c: Config = { ...initialConfig, dbIngress: true };
    const posture = postureOf(c);
    expect(posture[hatchesOf.db.in]).toBe('armed');
    expect(posture[hatchesOf.client.out]).toBe('open');
    expect(posture[hatchesOf['web-a'].in]).toBe('open');
    expect(posture[hatchesOf.db.out]).toBe('open');
  });

  it('selects only the Pods whose labels match each policy', () => {
    const c: Config = { ...initialConfig, clientEgress: true, webIngress: true, dbIngress: true };
    expect(policiesSelecting('client', c)).toEqual(['client-egress (Egress)']);
    expect(policiesSelecting('web-a', c)).toEqual(['web-ingress (Ingress)']);
    expect(policiesSelecting('web-b', c)).toEqual(['web-ingress (Ingress)']);
    expect(policiesSelecting('db', c)).toEqual(['db-ingress (Ingress)']);
  });

  it('reports a stored, not enforced posture distinctly from an armed one', () => {
    const c: Config = { ...initialConfig, webIngress: true, enforcing: false };
    expect(postureOf(c)[hatchesOf['web-a'].in]).toBe('stored');
    expect(postureOf({ ...c, enforcing: true })[hatchesOf['web-a'].in]).toBe('armed');
  });
});

describe('probe route and tag invariants', () => {
  it('stops a dropped probe above the hatch where it was dropped and never visits later stations', () => {
    const c: Config = { ...initialConfig, enforcing: true, clientEgress: true, dnsAllowed: false, webIngress: true };
    const keys = routeFor(evaluate(c, 'client-web'));
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ at: 'client-out', height: 'stop' });
    expect(passingHatches(evaluate(c, 'client-web'))).toEqual([]);
  });

  it('seats a delivered probe in the destination hatch and hides it there', () => {
    const v = evaluate(initialConfig, 'client-web');
    const keys = routeFor(v);
    expect(keys.at(-1)).toMatchObject({ at: 'web-a-in', height: 'seat', hide: true });
    expect(passingHatches(v)).toEqual(['client-out', 'web-a-in']);
  });

  it('only reads manifest tags for gates that evaluated a policy', () => {
    const c: Config = { ...initialConfig, webIngress: true, dbIngress: true };
    const tags = tagsForVerdict(evaluate(c, 'client-db'));
    expect(tags).toContain('db-rule');
    expect(tags).not.toContain('client-isolate');
    expect(tags).not.toContain('web-rule');
    expect(tags).not.toContain('svc');
  });

  it('dials the Service port for Service traffic and the database port for direct Pod traffic', () => {
    expect(evaluate(initialConfig, 'client-web')).toMatchObject({ servicePort: SERVICE_PORT, destPort: POD_PORT });
    expect(evaluate(initialConfig, 'client-db')).toMatchObject({ servicePort: null, destPort: DB_PORT });
  });

  it('keeps the tower between the client egress hatch and the web ingress hatch so the carrier docks on the path', () => {
    const from = stationX(flows['client-web'].from);
    const to = stationX(flows['client-web'].to);
    expect(from).toBeLessThan(stationX('tower'));
    expect(stationX('tower')).toBeLessThan(to);
  });
});

describe('ManifestPanel YAML', () => {
  it('is valid YAML for every configuration', () => {
    for (const c of configs) {
      const text = manifestFor(c).map((line) => line.text).join('\n');
      const docs = parseAllDocuments(text);
      expect(docs.flatMap((doc) => doc.errors)).toEqual([]);
    }
  });

  it('keeps applied policies in the API regardless of enforcement and gives each one its own direction', () => {
    for (const c of configs) {
      const docs = parseAllDocuments(manifestFor(c).map((line) => line.text).join('\n')).map((doc) => doc.toJS());
      const policies = docs.filter((doc) => doc?.kind === 'NetworkPolicy');
      const expected = Number(c.webIngress) + Number(c.dbIngress) + Number(c.clientEgress);
      expect(policies).toHaveLength(expected);
      for (const policy of policies) {
        if (policy.metadata.name === 'client-egress') {
          expect(policy.spec.podSelector.matchLabels).toEqual({ role: 'frontend' });
          expect(policy.spec.policyTypes).toEqual(['Egress']);
        } else {
          expect(policy.spec.policyTypes).toEqual(['Ingress']);
        }
      }
    }
  });

  it('writes the DNS rule as one peer that requires both the kube-system namespace and the kube-dns Pod', () => {
    const c: Config = { ...initialConfig, clientEgress: true, dnsAllowed: true };
    const docs = parseAllDocuments(manifestFor(c).map((line) => line.text).join('\n')).map((doc) => doc.toJS());
    const policy = docs.find((doc) => doc?.metadata?.name === 'client-egress');
    const dnsPeer = policy.spec.egress.find((rule: { to?: unknown[] }) => rule.to?.[0] && 'namespaceSelector' in (rule.to[0] as object));
    expect(dnsPeer.to).toHaveLength(1);
    expect(dnsPeer.to[0]).toHaveProperty('namespaceSelector');
    expect(dnsPeer.to[0]).toHaveProperty('podSelector');
  });
});
