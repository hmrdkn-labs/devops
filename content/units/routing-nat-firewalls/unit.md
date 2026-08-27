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
packet arrives
  → classify connection and policy
  → select route / next hop
  → optionally rewrite address or port
  → transmit through an interface
~~~

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
