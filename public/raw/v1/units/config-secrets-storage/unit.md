# Configuration, secrets, and persistent storage

A ConfigMap stores non-confidential configuration. A Secret uses a distinct API
type and delivery semantics for sensitive data, but its values are only
base64-encoded in ordinary manifests. Protect Secrets with API authorization,
encryption at rest, careful mounts, audit policy, and preferably an external
secret source or short-lived workload identity.

Environment variables are captured at process start. Mounted projected files
can update after the source object changes, but the application must reread
them. A configuration rollout should therefore be an explicit lifecycle choice,
not an assumption that every process observes updates automatically.

Persistent storage separates data lifecycle from Pod lifecycle:

- A PersistentVolumeClaim states a workload's storage request.
- A StorageClass describes a provisioning policy.
- A CSI driver provisions, attaches, mounts, snapshots, or expands storage
  according to supported operations.
- A PersistentVolume represents the bound storage resource.

A fresh EKS cluster does not necessarily provision an EBS-backed claim by
itself. The EBS CSI driver, permissions, and a suitable StorageClass must exist.
An EBS volume is bound to one availability zone. A Pod using it can move to
another node in that zone, but it cannot simply reattach the same volume in a
different zone after a complete AZ failure.

~~~text
PVC → StorageClass → CSI provisioning → zonal PV
Pod scheduling must respect the PV topology
~~~

Choose storage from durability, access mode, latency, backup, and failure-domain
requirements rather than from the fact that it can be mounted.
