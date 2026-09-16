# Routing, NAT, and firewalls

Routing chooses the next hop for a destination prefix. Forwarding moves a
packet between interfaces. A firewall decides whether traffic matching policy
may pass. Network address translation rewrites address or port fields and keeps
state so return traffic can be reversed. These actions may occur on one host,
but they solve different problems.

Source NAT commonly lets private addresses initiate traffic through a shared
public address. Destination NAT commonly maps a published address and port to
an internal endpoint. Translation does not automatically authorize traffic,
and filtering does not necessarily translate it.

~~~text
received forwarded packet (simplified Linux example)
  → prerouting hooks: possible destination NAT
  → route selects outgoing interface using the resulting destination
  → forward hooks: filtering policy
  → postrouting hooks: possible source NAT
  → outgoing interface
~~~

This is a received-and-forwarded packet path, not a universal order for every
packet. Locally generated or locally delivered packets traverse different
hooks, and configured priorities order operations within a hook.

Stateful firewalls remember flows. A rule permitting an outbound connection can
allow its related return packets without a separate broad inbound rule. This is
why “ingress” and “egress” are relative to the policy boundary being discussed.

In Kubernetes, packet handling can include the node route table, a CNI data
plane, Service translation, NetworkPolicy enforcement, cloud security groups,
and external load balancers. Draw the path and name the owner of each decision.
The phrase “the network blocks it” is not a diagnosis.

When debugging, compare both directions. Asymmetric routes, missing return
policy, or translation state can let the request leave while preventing the
response from returning.

## Worked case: A published mapping can still be filtered

The gateway fixture has a destination translation but deliberately denies forwarding of new connections to its selected backend.

~~~text
public target: 203.0.113.10:443
DNAT target: 10.0.2.9:8443
forward rule: NEW TCP to 10.0.2.9:8443 → DROP
backend return route: via this gateway
~~~

The configured mapping names the intended destination; the gateway kernel executes translation and filtering at their configured hooks. Read-only `nft list ruleset` inspection locates rules and counters if present. Matching DNAT and drop-counter increases with no backend packet support the policy hypothesis. Without traffic observations this remains a configuration prediction. An allow rule or an alternate packet path could change the result; NAT is not a universal ordered step after all routing.

These are authored inputs and predicted interpretations, not observations of a live environment. Use the read-only evidence named above to test the claim at the relevant boundary.
