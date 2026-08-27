# Scheduling, resources, and health probes

The scheduler places a Pod on a node that satisfies hard constraints and ranks
the feasible choices. Resource **requests** are part of that placement model:
the scheduler accounts for requested CPU and memory, not a prediction of every
future usage spike.

Resource **limits** are runtime boundaries. CPU limits generally throttle usage.
Memory limits can lead to an out-of-memory termination when the cgroup cannot
satisfy allocation. Requests influence placement and CPU weighting; limits
influence enforcement. They should be based on observed workload behavior, not
copied ratios.

A larger node does not always run proportionally more Pods. Pod requests,
per-node Pod-address capacity, daemon overhead, volume or topology constraints,
and kubelet reservations can become the limiting dimension.

Health probes serve distinct decisions:

- A **startup probe** protects a slow-starting process from liveness checks.
- A **readiness probe** decides whether an endpoint should receive Service
  traffic.
- A **liveness probe** decides whether kubelet should restart the container.

Liveness should detect a condition that restart can repair. If it checks a
shared database, a database outage can restart every healthy client and amplify
the incident. Readiness can depend on enough local ability to serve, but it also
needs care to avoid removing all capacity at once.

Scheduling answers “where may it run?” Probes answer “what should the node and
traffic data plane do now?” Neither proves the user-visible transaction works.
