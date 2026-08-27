# Pods and workload controllers

A Pod is Kubernetes' smallest schedulable unit. Its containers are placed on
one node and share a network namespace, Pod IP, and lifecycle. They can share
declared volumes. They do not automatically share process or filesystem views,
and they remain separate container processes.

Put containers in one Pod when they form one operational unit and need the same
placement and lifecycle, such as an application with a tightly coupled local
proxy. Do not use a Pod as a general substitute for a virtual machine.

Most Pods should be owned by a workload controller:

- A **Deployment** manages replaceable stateless replicas through ReplicaSets.
- A **StatefulSet** gives replicas stable ordinal identities and storage claims.
- A **DaemonSet** aims for one eligible Pod per node, useful for node log or
  monitoring agents.
- A **Job** drives finite work to completion.
- A **CronJob** creates Jobs on a schedule.

The controller owns replacement semantics. Scaling a Deployment changes an
anonymous replica count. Scaling a StatefulSet changes a named ordinal set.
A DaemonSet count follows eligible nodes rather than a requested replica
number.

Pod templates are snapshots for new Pods. Updating a controller template causes
a rollout; it does not mutate the process memory or image filesystem of already
running containers. This replacement model is central to predictable delivery.
