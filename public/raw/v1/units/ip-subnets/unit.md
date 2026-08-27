# IP addresses and subnets

An IP address identifies an interface within an IP network. A prefix length
states which leading bits describe the network. In IPv4, `10.20.4.17/24`
means the first 24 bits form the local prefix, so addresses from
`10.20.4.0` through `10.20.4.255` share that prefix.

The host compares a destination with its configured routes. If the destination
is on-link, it resolves the next hop on the local network. Otherwise it sends
the packet to a router selected by the most-specific matching route.

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
