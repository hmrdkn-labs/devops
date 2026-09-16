# IP addresses and subnets

An IP address identifies an interface within an IP network. A prefix length
states which leading bits describe the network. In IPv4, `10.20.4.17/24`
means the first 24 bits form the local prefix, so addresses from
`10.20.4.0` through `10.20.4.255` share that prefix.

The host looks up the destination in its configured routes. In a simple routing
table, the most-specific matching prefix wins. A connected route normally
selects direct neighbor delivery; a route with a gateway selects that gateway
as the next hop. A more-specific route can override a broader connected prefix,
and policy-routing rules can select a different table.

~~~text
destination IP
      │ longest-prefix match
      ├─ connected prefix → local link
      └─ other prefix     → configured next hop
~~~

An address is not the same thing as a port, hostname, interface, or route. One
interface may have multiple addresses. A hostname can resolve to multiple
addresses. A route can cover an entire prefix without owning every address.

## Why pods receive IP addresses

Kubernetes networking is easiest to reason about when each pod has its own IP.
Processes in the pod share one network namespace and can use localhost between
containers. Other pods address that pod directly, while a Service gives a
stable virtual destination in front of changing pod addresses.

The prefix size becomes a capacity constraint. On systems such as Amazon EKS
with the VPC CNI, pod addresses are drawn from VPC subnets, so subnet design and
address allocation affect how many pods can be scheduled.

Always ask three separate questions: what address is assigned, what prefixes
are reachable, and which next hop wins. Mixing them produces most subnet
misdiagnoses.

## Worked case: A more-specific route overrides a connected prefix

A host is configured with these authored routes. Ask which next hop wins before assuming every address in its interface prefix is delivered directly.

~~~text
10.20.4.0/24 dev eth0
10.20.4.128/25 via 10.20.4.1 dev eth0
default via 10.20.4.254 dev eth0
lookup destination: 10.20.4.200
~~~

Both /24 and /25 match; /25 covers 10.20.4.128–10.20.4.255 and is more specific. The kernel selects the gateway 10.20.4.1. A destination such as 10.20.4.30 instead matches the connected /24 and is normally resolved directly. `ip route get 10.20.4.200` checks the active lookup, including rules that this simplified table omits. A successful lookup says nothing yet about packet loss or application response.

These are authored inputs and predicted interpretations, not observations of a live environment. Use the read-only evidence named above to test the claim at the relevant boundary.
