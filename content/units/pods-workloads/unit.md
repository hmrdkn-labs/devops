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

Pod templates are snapshots for new Pods. Updating a controller template changes the template for future Pods; rollout
behavior depends on the controller and its update strategy. It does not mutate
the process memory or image filesystem of already running containers. This replacement model is central to predictable delivery.

## Worked case: completion is part of the requirement

The authored import specification is: start at 02:00, validate one batch,
write one result, and exit. The validator listens on `localhost:9000`; both
containers mount the Pod volume at `/batch`.

~~~text
CronJob/import-nightly → Job/import-nightly-42 → one Pod
  importer → localhost:9000 → validator
  importer /batch ↔ declared shared volume ↔ validator /batch
Job status: succeeded=1; batch ledger: batch-42 imported once
~~~

The controllers create API objects; kubelet/runtime execute the containers.
Job status establishes the controller's completion criterion, and the batch
ledger establishes the business result. Containers need coordinated termination:
a validator that never exits can keep a Job incomplete unless its lifecycle is
configured appropriately. CronJob scheduling alone does not guarantee exactly-once
business processing, so retries should be safe for an already imported batch.
