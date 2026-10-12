import type { Change } from '@/components/anatomy/shared/ChangeReport';
import { POD_PORT, SERVICE_PORT, DB_PORT, type Config, type Gate, type Probe, type Verdict, flows } from './model';

export const gateName: Record<Gate, string> = {
  'client-egress-dns': 'client egress (DNS lookup)',
  'client-egress': 'client egress',
  'web-egress': 'web egress',
  'web-ingress': 'web-7c9d4-x2kq8 ingress',
  'db-ingress': 'db ingress',
};

export const gatePolicy: Record<Gate, string> = {
  'client-egress-dns': 'client-egress',
  'client-egress': 'client-egress',
  'web-egress': 'no NetworkPolicy',
  'web-ingress': 'web-ingress',
  'db-ingress': 'db-ingress',
};

export const probeName: Record<Probe, string> = {
  'client-web': 'client → Service web',
  'web-db': 'web-7c9d4-x2kq8 → db',
  'client-db': 'client → db by Pod IP',
};

/** The probe's target endpoint. The Service always resolves to web-7c9d4-x2kq8 in this fixture. */
const targetName: Record<Probe, string> = {
  'client-web': 'web-7c9d4-x2kq8 (the single endpoint in this fixture)',
  'web-db': 'db',
  'client-db': 'db',
};

function gateReason(gate: Gate, config: Config): string {
  switch (gate) {
    case 'client-egress-dns': return 'client is egress-isolated and no rule allows UDP or TCP 53 to kube-dns, so the name never resolves.';
    case 'client-egress': return 'client-egress allows only app=web on TCP 8080 and DNS; the destination is not in that allow list.';
    case 'web-egress': return 'No NetworkPolicy isolates web Pods for egress.';
    case 'web-ingress': return `web-ingress allows role=frontend on port ${config.webPort}; the request reaches the Pod on ${POD_PORT}.`;
    case 'db-ingress': return 'db-ingress allows only app=web on TCP 5432, and this source does not match.';
  }
}

export function readyChange(): Change {
  return {
    title: 'Ready: every Pod is non-isolated',
    changed: 'No NetworkPolicy is applied. Every direction of every Pod allows traffic.',
    actor: 'Nobody has applied a policy yet; the namespace shop holds only the Service and Pods.',
    reason: 'A Pod is isolated for a direction only after a NetworkPolicy selects it and lists that direction.',
    notYet: 'No probe has been sent. Nothing here shows what a real cluster enforces.',
  };
}

export function probeSelectedChange(probe: Probe): Change {
  const service = flows[probe].service;
  return {
    title: 'Probe selected; nothing sent',
    changed: `The cartridge is parked at the source for ${probeName[probe]}.`,
    actor: 'You, choosing which request to send.',
    reason: service
      ? 'This request names Service web, so DNS and the Service port translation both come into play.'
      : 'This request goes straight to a Pod IP, so no Service translation happens.',
    notYet: 'The gates have not been evaluated. Send the probe to see the result.',
  };
}

export function probeRunningChange(probe: Probe): Change {
  return {
    title: 'Probe in progress',
    changed: `The cartridge moves through the gates for ${probeName[probe]}; no result is recorded yet.`,
    actor: 'The network plugin at each gate on this path, one gate at a time.',
    reason: 'The first armed gate that does not match stops the request, and gates after it are not reached.',
    notYet: 'The result and the ledger appear only when the cartridge stops or is seated.',
  };
}

function enforcementChange(c: Config): Change {
  const anyApplied = c.clientEgress || c.webIngress || c.dbIngress;
  if (!anyApplied) {
    return {
      title: c.enforcing ? 'Enforcement on; no policy applied' : 'Enforcement off; no policy applied',
      changed: 'Nothing on any Pod changed: with no NetworkPolicy applied, every Pod is non-isolated either way.',
      actor: 'The network plugin (CNI) on each node decides whether NetworkPolicy objects are enforced.',
      reason: 'The plugin only enforces objects that exist; this setting alone isolates nothing.',
      notYet: 'Apply a policy to see what this setting changes.',
    };
  }
  return c.enforcing
    ? {
      title: 'Policies now enforced',
      changed: 'Each applied policy arms its gate again. Lids that were up only because nothing checked traffic now check it.',
      actor: 'The network plugin (CNI) on each node. The stored objects are the same as before.',
      reason: 'A NetworkPolicy has no effect unless the plugin implements it. The objects were stored in both states.',
      notYet: 'No probe has been sent since this change. Propagation to every node is not shown.',
    }
    : {
      title: 'Policies stored, not enforced',
      changed: 'Every gate passes traffic, including gates whose policies are still applied in the API.',
      actor: 'The network plugin, which in this fixture does not implement NetworkPolicy.',
      reason: 'The API accepts NetworkPolicy objects regardless. Without an implementing plugin they do nothing.',
      notYet: 'The objects are still in the API. That is not the same as traffic being blocked.',
    };
}

function clientEgressChange(c: Config): Change {
  if (!c.clientEgress) {
    return {
      title: 'client non-isolated for Egress again',
      changed: 'client may open connections to any destination.',
      actor: 'You removed client-egress. The API server deletes it, and the network plugin stops applying it.',
      reason: 'No remaining NetworkPolicy selects role=frontend for Egress.',
      notYet: 'Propagation is not shown. Send a probe to check.',
    };
  }
  const dns = c.dnsAllowed ? ' and to kube-dns on UDP and TCP 53' : '';
  return {
    title: 'client isolated for Egress',
    changed: c.enforcing
      ? `client may open connections only to app=web on TCP 8080${dns}. Everything else from client is dropped.`
      : 'client-egress is stored. The plugin does not enforce it, so client still opens any connection.',
    actor: 'You applied client-egress. The API server stores it; the network plugin applies it to Pods labelled role=frontend.',
    reason: 'policyTypes lists Egress, and podSelector role=frontend selects client, so client becomes isolated for Egress.',
    notYet: 'No name lookup or connection has been probed yet.',
  };
}

function dnsChange(c: Config): Change {
  return c.dnsAllowed
    ? {
      title: 'DNS allowed from client egress',
      changed: c.enforcing
        ? 'Lookups to kube-dns on UDP and TCP 53 pass the client egress gate.'
        : 'The DNS rule is stored; with enforcement off, lookups already pass.',
      actor: 'You added the kube-dns rule to client-egress.',
      reason: 'With client egress isolated, a name lookup must reach kube-dns first. Without this rule the lookup is dropped before the Service is contacted.',
      notYet: 'No lookup has been probed yet. The Service probe is the one that exercises it.',
    }
    : {
      title: 'DNS removed from client egress',
      changed: c.enforcing
        ? 'Lookups to kube-dns no longer pass the client egress gate.'
        : 'The DNS rule is removed; with enforcement off, lookups still pass.',
      actor: 'You removed the kube-dns rule from client-egress.',
      reason: 'The docs warn that a deny-all egress policy also blocks DNS, so name resolution needs its own allow rule.',
      notYet: 'The effect appears on the next Service probe, not now.',
    };
}

function webIngressChange(c: Config): Change {
  if (!c.webIngress) {
    return {
      title: 'web Pods non-isolated for Ingress again',
      changed: 'Both web Pods accept any source on any port.',
      actor: 'You removed web-ingress. The API server deletes it, and the network plugin stops applying it.',
      reason: 'No remaining NetworkPolicy selects app=web for Ingress.',
      notYet: 'Propagation is not shown. Send a probe to check.',
    };
  }
  return {
    title: 'web Pods isolated for Ingress',
    changed: c.enforcing
      ? `Both web Pods accept only role=frontend on TCP ${c.webPort}; other sources are dropped.`
      : 'web-ingress is stored. The plugin does not enforce it, so web Pods still accept any source.',
    actor: 'You applied web-ingress. The API server stores it; the network plugin applies it to Pods labelled app=web.',
    reason: 'policyTypes lists Ingress and podSelector app=web selects both web Pods, so both become isolated for Ingress.',
    notYet: 'No connection has been probed. Existing connections are implementation-defined and are not shown.',
  };
}

function webPortChange(c: Config): Change {
  return {
    title: `web-ingress port is ${c.webPort}`,
    changed: c.webPort === POD_PORT
      ? 'The rule now compares against 8080, the port web Pods receive from the Service.'
      : 'The rule now compares against 80. No connection arrives at a Pod on 80, so the rule matches nothing.',
    actor: 'You edited the port in web-ingress. The API server stores it; the network plugin applies the stored port.',
    reason: `Service web maps port ${SERVICE_PORT} to targetPort ${POD_PORT}. NetworkPolicy ingress ports name the port the Pod receives.`,
    notYet: c.enforcing ? 'No probe has been sent yet.' : 'Not enforced, so the port has no effect on traffic yet.',
  };
}

function dbIngressChange(c: Config): Change {
  if (!c.dbIngress) {
    return {
      title: 'db non-isolated for Ingress again',
      changed: 'db accepts any source on any port.',
      actor: 'You removed db-ingress. The API server deletes it, and the network plugin stops applying it.',
      reason: 'No remaining NetworkPolicy selects app=db for Ingress.',
      notYet: 'Propagation is not shown. Send a probe to check.',
    };
  }
  return {
    title: 'db isolated for Ingress',
    changed: c.enforcing
      ? `db accepts only app=web on TCP ${DB_PORT}; other sources are dropped.`
      : 'db-ingress is stored. The plugin does not enforce it, so db still accepts any source.',
    actor: 'You applied db-ingress. The API server stores it; the network plugin applies it to Pods labelled app=db.',
    reason: 'policyTypes lists Ingress, and podSelector app=db selects db.',
    notYet: 'No connection has been probed. Web Pods are the only sources the policy names.',
  };
}

/** The one configuration change a control made. Every control yields a report of what it changed now. */
export function changeForConfig(prev: Config, next: Config): Change {
  if (prev.enforcing !== next.enforcing) return enforcementChange(next);
  if (prev.clientEgress !== next.clientEgress) return clientEgressChange(next);
  if (prev.dnsAllowed !== next.dnsAllowed) return dnsChange(next);
  if (prev.webIngress !== next.webIngress) return webIngressChange(next);
  if (prev.webPort !== next.webPort) return webPortChange(next);
  if (prev.dbIngress !== next.dbIngress) return dbIngressChange(next);
  return readyChange();
}

export function resetChange(): Change {
  return {
    title: 'Fixture reset',
    changed: 'No NetworkPolicy applied; enforcement on; web port 8080; DNS allowed.',
    actor: 'This fixture only. No cluster operation is performed.',
    reason: 'Restores the default state, where every Pod is non-isolated.',
    notYet: 'No probe has been sent.',
  };
}

/** The endpoints a probe connects, by name, for the ChangeReport. */
const probeEnds: Record<Probe, { src: string; dst: string }> = {
  'client-web': { src: 'client', dst: 'web-7c9d4-x2kq8' },
  'web-db': { src: 'web-7c9d4-x2kq8', dst: 'db' },
  'client-db': { src: 'client', dst: 'db' },
};
/** Short gate names for the list of gates a drop did not police. */
const shortGate: Record<Gate, string> = {
  'client-egress-dns': 'DNS lookup',
  'client-egress': 'client egress',
  'web-egress': 'web egress',
  'web-ingress': 'web ingress',
  'db-ingress': 'db ingress',
};

/** Result of a finished probe. Only called after the cartridge has stopped or been seated. */
export function changeForProbe(config: Config, v: Verdict): Change {
  const flow = flows[v.probe];
  const path = probeName[v.probe];
  const notEnforced = !config.enforcing && v.wouldStopAt !== null;

  if (v.delivered && notEnforced) {
    return {
      title: 'Delivered; a policy would have blocked it',
      changed: `Nothing stopped ${path}. With enforcement on, ${gateName[v.wouldStopAt!]} would have dropped it.`,
      actor: 'The network plugin, which does not enforce NetworkPolicy here.',
      reason: 'The API accepted the NetworkPolicy objects, but without enforcement they have no effect.',
      notYet: 'Turn enforcement on and probe again to see the drop. The stored objects were not changed.',
    };
  }
  if (v.delivered) {
    const admitted = (Object.keys(v.checks) as Gate[]).filter((gate) => v.checks[gate] === 'pass');
    return {
      title: 'Connection delivered',
      changed: `${path} reached ${targetName[v.probe]} on port ${v.destPort}${v.servicePort === null ? '' : `; the Service translated port ${v.servicePort} to ${v.destPort}`}.`,
      actor: admitted.length
        ? `Armed gates that admitted it: ${admitted.map((gate) => gateName[gate]).join(', ')}.`
        : 'No gate on this path is armed, so the default (non-isolated) allows it.',
      reason: admitted.length
        ? 'Each armed gate found a matching allow rule for this source, destination and port.'
        : 'No armed gate sits on this path. Either no policy isolates these Pods for this direction, or the policies that do are stored without enforcement.',
      notYet: 'One probe to one endpoint. It does not prove an HTTP response, application health, or the other web Pod.',
    };
  }
  const stop = v.stopped!;
  const ends = probeEnds[v.probe];
  const via = v.servicePort === null ? '' : ` via Service web:${v.servicePort}`;
  const before = flow.gates.slice(0, flow.gates.indexOf(stop));
  const unpoliced = [...new Set(before.filter((gate) => v.checks[gate] === 'not-armed').map((gate) => shortGate[gate]))];
  const notPoliced = unpoliced.length ? ` ${unpoliced.join(' and ')} ${unpoliced.length > 1 ? 'were' : 'was'} not policed (no policy applies).` : '';
  return {
    title: `Dropped at ${gateName[stop]}`,
    changed: stop === 'client-egress-dns'
      ? `The name lookup for ${ends.dst} was dropped at client egress (DNS lookup); no connection to a Pod was attempted.`
      : `${ends.src} → ${ends.dst}:${v.destPort}${via} was dropped at ${gateName[stop]}.${notPoliced}`,
    actor: `The network plugin applying ${gatePolicy[stop]} at ${gateName[stop]}.`,
    reason: gateReason(stop, config),
    notYet: 'Other Pods, other ports, and the rest of the policy set are not tested.',
  };
}
